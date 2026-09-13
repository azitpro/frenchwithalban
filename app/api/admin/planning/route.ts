import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { readPlanning, savePlanning } from '@/lib/planning-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

// Organisation personnelle. Aucune route publique ne lit ces données :
// les routines ne créent jamais d'indisponibilité visible des élèves.

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const result = await readPlanning(redis);
  if (!result.ok) {
    return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ planning: result.planning, revision: result.revision }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const result = await savePlanning(redis, body?.planning, body?.revision);

  switch (result.status) {
    case 'saved':
      return NextResponse.json({ success: true, planning: result.planning, revision: result.revision }, { headers: NO_STORE });
    case 'conflict':
      return NextResponse.json(
        { error: 'Le planning a été modifié ailleurs entre-temps.', planning: result.planning, revision: result.revision },
        { status: 409, headers: NO_STORE },
      );
    case 'invalid':
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE });
    default:
      return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
}
