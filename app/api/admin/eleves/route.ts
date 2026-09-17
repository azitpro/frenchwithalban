import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { elevesStore } from '@/lib/eleves-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

// Fiches de suivi des élèves : données personnelles, réservées à l'administration.

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const result = await elevesStore.lire(redis);
  if (!result.ok) {
    return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ eleves: result.value, revision: result.revision }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const result = await elevesStore.enregistrer(redis, body?.eleves, body?.revision);

  switch (result.status) {
    case 'saved':
      return NextResponse.json({ success: true, eleves: result.value, revision: result.revision }, { headers: NO_STORE });
    case 'conflict':
      return NextResponse.json(
        { error: 'Les fiches ont été modifiées ailleurs entre-temps.', eleves: result.value, revision: result.revision },
        { status: 409, headers: NO_STORE },
      );
    case 'invalid':
      return NextResponse.json({ error: result.error }, { status: 400, headers: NO_STORE });
    default:
      return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500, headers: NO_STORE });
  }
}
