import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

// Modification des tarifs (la lecture publique reste sur /api/pricing).
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const real = Number(body?.realPrice);
  const discount = Number(body?.discountPrice);

  if (!Number.isFinite(real) || !Number.isFinite(discount) || real <= 0 || discount <= 0) {
    return NextResponse.json({ error: 'Prix invalides' }, { status: 400, headers: NO_STORE });
  }
  if (discount > real) {
    return NextResponse.json({ error: 'Le prix remisé doit être inférieur ou égal au prix réel' }, { status: 400, headers: NO_STORE });
  }
  const texte = (v: unknown, defaut: string) => (typeof v === 'string' && v.trim() && v.trim().length <= 20 ? v.trim() : defaut);

  const pricing = {
    realPrice: real,
    discountPrice: discount,
    currency: texte(body?.currency, '$'),
    duration: texte(body?.duration, '50 min'),
  };
  await redis.set('pricing', pricing);
  return NextResponse.json({ ok: true, pricing }, { headers: NO_STORE });
}
