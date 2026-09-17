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

  const body = await request.json().catch(() => null);
  if (!body?.schedule) {
    return NextResponse.json({ error: 'Planning manquant.' }, { status: 400 });
  }
  const schedule = body.schedule;

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
