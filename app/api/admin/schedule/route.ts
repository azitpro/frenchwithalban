import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { hasAllStudentNames, withDefaults } from '@/lib/schedule';

const redis = Redis.fromEnv();

/** Planning complet, prénoms compris — réservé à l'administration. */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const schedule = withDefaults(await redis.get('schedule'));
  return NextResponse.json(schedule, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const { password, schedule } = await request.json();
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
  }

  const complete = withDefaults(schedule);
  if (!hasAllStudentNames(complete)) {
    return NextResponse.json(
      { error: "Planning refusé : un cours n'a pas de prénom d'élève. Rechargez la page avant d'enregistrer." },
      { status: 400 },
    );
  }

  await redis.set('schedule', complete);
  return NextResponse.json({ success: true });
}
