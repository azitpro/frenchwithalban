import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

const DEFAULT_SLOTS = [
  { day: "Lundi", hour: "9h", status: "libre" },
];

export async function GET() {
  const slots = await redis.get('slots');
  return NextResponse.json(slots || DEFAULT_SLOTS);
}

export async function POST(req: NextRequest) {
  const { password, slots } = await req.json();

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
  }

  await redis.set('slots', slots);
  return NextResponse.json({ success: true });
}