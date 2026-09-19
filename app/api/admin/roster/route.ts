import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { rosterStore } from '@/lib/roster-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

// Roster des élèves : prénoms et tarifs, réservés à l'administration.

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const result = await rosterStore.lire(redis);
  if (!result.ok) {
    return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ roster: result.value, revision: result.revision }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const result = await rosterStore.enregistrer(redis, body?.roster, body?.revision);

  switch (result.status) {
    case 'saved':
      return NextResponse.json({ success: true, roster: result.value, revision: result.revision }, { headers: NO_STORE });
    case 'conflict':
      return NextResponse.json(
        { error: 'Le roster a été modifié ailleurs entre-temps.', roster: result.value, revision: result.revision },
        { status: 409, headers: NO_STORE },
      );
    case 'invalid':
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE });
    default:
      return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
}
