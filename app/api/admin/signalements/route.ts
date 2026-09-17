import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { ID_VALIDE, listerSignalements, supprimerSignalement } from '@/lib/signalements-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();
  const signalements = await listerSignalements(redis);
  return NextResponse.json({ signalements }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!ID_VALIDE.test(id)) {
    return NextResponse.json({ error: 'Identifiant invalide.' }, { status: 400, headers: NO_STORE });
  }
  await supprimerSignalement(redis, id);
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
