import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { adresseIp, limiter } from '@/lib/placement-store';
import { notifierEnArrierePlan } from '@/lib/courriel';
import { formaterDate, formaterHeure, validerReservation } from '@/lib/reservations';
import { enregistrerReservation } from '@/lib/reservations-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };
const TAILLE_MAX = 4_000;

// Route publique : demande de réservation d'un créneau (page /planning_public.html).
// Le créneau n'est pas bloqué : Alban confirme lui-même.
export async function POST(request: NextRequest) {
  const texte = await request.text();
  if (texte.length > TAILLE_MAX) {
    return NextResponse.json({ error: 'Demande trop longue.' }, { status: 413, headers: NO_STORE });
  }
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(texte);
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400, headers: NO_STORE });
  }
  // pot de miel : champ invisible que seuls les robots remplissent
  if (body.site) return NextResponse.json({ success: true }, { headers: NO_STORE });

  const valide = validerReservation(body);
  if (!valide.ok) {
    return NextResponse.json({ error: valide.erreur }, { status: 400, headers: NO_STORE });
  }
  if (!(await limiter(redis, adresseIp(request), 10))) {
    return NextResponse.json({ error: 'Trop de demandes envoyées. Réessayez plus tard.' }, { status: 429, headers: NO_STORE });
  }

  const reservation = await enregistrerReservation(redis, valide.valeur);

  notifierEnArrierePlan({
    sujet: `Demande de cours : ${reservation.prenom} — ${formaterDate(reservation.date)} à ${formaterHeure(reservation.heure)}`,
    repondreA: reservation.email || undefined,
    lignes: [
      `${reservation.prenom} demande un cours de ${reservation.duree} minutes.`,
      '',
      `Créneau : ${formaterDate(reservation.date)} à ${formaterHeure(reservation.heure)} (heure de Paris)`,
      reservation.fuseau ? `Fuseau de l'élève : ${reservation.fuseau}` : '',
      `Email : ${reservation.email || 'non laissé'}`,
      reservation.message ? `Message : ${reservation.message}` : '',
      '',
      'Le créneau reste affiché comme libre : confirmez-le vous-même dans le planning.',
    ].filter((l, i, t) => l !== '' || t[i - 1] !== ''),
  });

  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
