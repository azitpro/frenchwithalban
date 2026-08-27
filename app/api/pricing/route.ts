import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

type Pricing = {
  realPrice: number;
  discountPrice: number;
  currency: string;
  duration: string;
};

const DEFAULT_PRICING: Pricing = {
  realPrice: 37,
  discountPrice: 34,
  currency: '$',
  duration: '50 min',
};

export async function GET() {
  try {
    const pricing = await redis.get<Pricing>('pricing');
    return NextResponse.json(pricing || DEFAULT_PRICING);
  } catch {
    return NextResponse.json(DEFAULT_PRICING);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
  }

  const real = Number(body.realPrice);
  const discount = Number(body.discountPrice);

  if (!Number.isFinite(real) || !Number.isFinite(discount) || real <= 0 || discount <= 0) {
    return NextResponse.json({ error: 'Prix invalides' }, { status: 400 });
  }
  if (discount > real) {
    return NextResponse.json(
      { error: 'Le prix remisé doit être inférieur ou égal au prix réel' },
      { status: 400 }
    );
  }

  const pricing: Pricing = {
    realPrice: real,
    discountPrice: discount,
    currency: typeof body.currency === 'string' && body.currency ? body.currency : '$',
    duration: typeof body.duration === 'string' && body.duration ? body.duration : '50 min',
  };

  await redis.set('pricing', pricing);
  return NextResponse.json({ ok: true, pricing });
}
