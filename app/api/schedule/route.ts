import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { toPublicSchedule, withDefaults } from '@/lib/schedule';

const redis = Redis.fromEnv();

/**
 * Lecture publique utilisée par planning_public.html : les horaires seulement,
 * sans le prénom des élèves. La lecture complète et l'enregistrement passent
 * par /api/admin/schedule, protégée par proxy.ts.
 */
export async function GET() {
  const schedule = withDefaults(await redis.get('schedule'));
  return NextResponse.json(toPublicSchedule(schedule));
}
