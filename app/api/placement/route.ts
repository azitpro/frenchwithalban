import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { corriger } from '@/lib/placement';
import { adresseIp, enregistrerTest, limiter } from '@/lib/placement-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };
const TAILLE_MAX = 16_000;

// Route publique : enregistre un test de placement terminé. Le résultat est recalculé ici,
// à partir des réponses ; celui affiché par la page n'est jamais repris tel quel.
export async function POST(request: NextRequest) {
  const texte = await request.text();
  if (texte.length > TAILLE_MAX) {
    return NextResponse.json({ error: 'Envoi trop volumineux.' }, { status: 413, headers: NO_STORE });
  }
  let body: { reponses?: unknown; langue?: unknown; site?: unknown } | null = null;
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

  const correction = corriger(body.reponses);
  if (!correction.ok) {
    return NextResponse.json({ error: correction.erreur }, { status: 400, headers: NO_STORE });
  }
  if (!(await limiter(redis, adresseIp(request)))) {
    return NextResponse.json({ error: 'Trop de tests envoyés. Réessayez plus tard.' }, { status: 429, headers: NO_STORE });
  }

  const langue = body.langue === 'en' ? 'en' : 'fr';
  const { id, jeton } = await enregistrerTest(redis, correction.correction, langue);
  return NextResponse.json({ success: true, id, jeton, resultat: correction.correction.resultat }, { headers: NO_STORE });
}
