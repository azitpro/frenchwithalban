import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

type RecurringSlot = {
  id: string;
  student: string;
  weekday: string; // "Lundi" à "Dimanche"
  hour: number; // ex: 10, 13.5
  duration: 25 | 50;
  active: boolean;
};

type Exception = {
  recurringId: string;
  date: string; // "2026-08-24"
};

type OneOff = {
  id: string;
  student: string;
  date: string; // "2026-08-24"
  hour: number;
  duration: 25 | 50;
};

type Schedule = {
  recurring: RecurringSlot[];
  exceptions: Exception[];
  oneOff: OneOff[];
};

const DEFAULT_SCHEDULE: Schedule = {
  recurring: [],
  exceptions: [],
  oneOff: [],
};

export async function GET() {
  const schedule = await redis.get('schedule');
  return NextResponse.json(schedule || DEFAULT_SCHEDULE);
}

export async function POST(req: NextRequest) {
  const { password, schedule } = await req.json();

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
  }

  await redis.set('schedule', schedule);
  return NextResponse.json({ success: true });
}