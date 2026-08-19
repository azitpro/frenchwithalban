import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

type Lead = {
  id: string;
  name: string;
  email: string;
  schedulePref: string;
  level: string;
  goals: string;
  priorities: string;
  lessonsPerWeek: string;
  submittedAt: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export async function GET(req: NextRequest) {
  const password = req.headers.get('x-admin-password');
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const leads = (await redis.get('leads')) || [];
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const data = await req.json();
  const leads: Lead[] = (await redis.get('leads')) || [];
  const newLead: Lead = {
    id: uid(),
    name: data.name || '',
    email: data.email || '',
    schedulePref: data.schedulePref || '',
    level: data.level || '',
    goals: data.goals || '',
    priorities: data.priorities || '',
    lessonsPerWeek: data.lessonsPerWeek || '',
    submittedAt: new Date().toISOString(),
  };
  leads.push(newLead);
  await redis.set('leads', leads);
  return NextResponse.json({ success: true });
}