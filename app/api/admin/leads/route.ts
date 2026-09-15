import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

// Lecture et suppression des demandes envoyées depuis la page Réserver (l'envoi reste sur /api/leads).
type Lead = { id: string };

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();
  const leads = (await redis.get<Lead[]>('leads')) ?? [];
  return NextResponse.json(leads, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json({ error: 'Identifiant manquant.' }, { status: 400, headers: NO_STORE });
  }
  const leads = (await redis.get<Lead[]>('leads')) ?? [];
  await redis.set('leads', leads.filter((l) => l.id !== id));
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
