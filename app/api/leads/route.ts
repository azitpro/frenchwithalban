import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

const redis = Redis.fromEnv();

type Lead = {
  id: string;
  firstName: string;
  email: string;
  timezone: string;
  availability: string[];
  level: string;
  goals: string;
  priorities: string;
  lessonsPerWeek: string;
  other: string;
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
    firstName: data.firstName || '',
    email: data.email || '',
    timezone: data.timezone || '',
    availability: data.availability || [],
    level: data.level || '',
    goals: data.goals || '',
    priorities: data.priorities || '',
    lessonsPerWeek: data.lessonsPerWeek || '',
    other: data.other || '',
    submittedAt: new Date().toISOString(),
  };
  leads.push(newLead);
  await redis.set('leads', leads);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { password, id } = await req.json();
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }
  const leads: Lead[] = (await redis.get('leads')) || [];
  const updated = leads.filter((l) => l.id !== id);
  await redis.set('leads', updated);
  return NextResponse.json({ success: true });
}