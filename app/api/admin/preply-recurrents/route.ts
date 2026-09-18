import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { chargerOccupations } from '@/lib/preply-ical';
import { reperer } from '@/lib/preply-recurrents';
import { withDefaults } from '@/lib/schedule';

const redis = Redis.fromEnv();

/**
 * Créneaux qui reviennent chaque semaine sur Preply mais ne sont pas déclarés sur le site.
 * Réservé à l'administration : la réponse dit à quelles heures Alban donne cours.
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const [occupations, brut] = await Promise.all([chargerOccupations(), redis.get('schedule')]);
  if (!occupations) {
    return NextResponse.json(
      { creneaux: [], ignores: [], erreur: "L'agenda Preply n'a pas pu être lu." },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const schedule = withDefaults(brut);
  const aujourdHui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
  const tous = reperer(occupations, schedule, aujourdHui);
  const ignores = new Set(schedule.ignoredRecurring);

  return NextResponse.json(
    {
      creneaux: tous.filter((c) => !ignores.has(c.cle)),
      ignores: tous.filter((c) => ignores.has(c.cle)),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
