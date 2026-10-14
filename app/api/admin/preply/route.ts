import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, unauthorizedResponse } from '@/lib/admin-auth';
import { dateAParis, heureAParis, reperAbsences } from '@/lib/preply-absences';
import { chargerOccupations } from '@/lib/preply-ical';
import { reperer } from '@/lib/preply-recurrents';
import { withDefaults } from '@/lib/schedule';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Les deux écarts entre l'agenda Preply et le planning déclaré :
 * - creneaux : des cours reviennent chaque semaine sur Preply sans être déclarés ;
 * - absences : un cours déclaré n'apparaît plus sur Preply à une date à venir.
 *
 * Réservé à l'administration : la réponse dit à quelles heures Alban donne cours,
 * et les absences portent le prénom de l'élève.
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return unauthorizedResponse();

  const [occupations, brut] = await Promise.all([chargerOccupations(), redis.get('schedule')]);
  if (!occupations) {
    return NextResponse.json(
      { creneaux: [], ignores: [], absences: [], absencesIgnorees: [], erreur: "L'agenda Preply n'a pas pu être lu." },
      { headers: NO_STORE },
    );
  }

  const schedule = withDefaults(brut);
  const maintenant = new Date();
  const aujourdHui = dateAParis(maintenant);

  const tous = reperer(occupations, schedule, aujourdHui);
  const ignores = new Set(schedule.ignoredRecurring);

  const toutesAbsences = reperAbsences(occupations, schedule, aujourdHui, heureAParis(maintenant));
  const absencesIgnorees = new Set(schedule.ignoredAbsences);

  return NextResponse.json(
    {
      creneaux: tous.filter((c) => !ignores.has(c.cle)),
      ignores: tous.filter((c) => ignores.has(c.cle)),
      absences: toutesAbsences.filter((a) => !absencesIgnorees.has(a.cle)),
      absencesIgnorees: toutesAbsences.filter((a) => absencesIgnorees.has(a.cle)),
    },
    { headers: NO_STORE },
  );
}
