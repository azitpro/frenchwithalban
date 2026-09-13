import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { EMPTY_PLANNING, validatePlanning } from '@/lib/planning';

const redis = Redis.fromEnv();

// Clé réservée à l'organisation personnelle. Aucune route publique ne la lit :
// les routines ne créent jamais d'indisponibilité visible des élèves.
const KEY = 'planning';

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const stored = await redis.get(KEY);
  const result = validatePlanning(stored ?? EMPTY_PLANNING);
  if (!result.ok) {
    return NextResponse.json({ error: `Données enregistrées illisibles : ${result.error}` }, { status: 500 });
  }
  return NextResponse.json(result.planning, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const result = validatePlanning(body?.planning);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  await redis.set(KEY, result.planning);
  return NextResponse.json({ success: true, planning: result.planning });
}
