import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { adresseIp, limiter } from '@/lib/placement-store';
import { validerSignalement } from '@/lib/signalements';
import { enregistrerSignalement } from '@/lib/signalements-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };
const TAILLE_MAX = 8_000;

// Route publique : « Signaler un problème » (page /signaler.html, lien dans le pied de page).
export async function POST(request: NextRequest) {
  const texte = await request.text();
  if (texte.length > TAILLE_MAX) {
    return NextResponse.json({ error: 'Message trop long.' }, { status: 413, headers: NO_STORE });
  }
  let body: { message?: unknown; email?: unknown; page?: unknown; langue?: unknown; site?: unknown } | null = null;
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

  const valide = validerSignalement(body);
  if (!valide.ok) {
    return NextResponse.json({ error: valide.erreur }, { status: 400, headers: NO_STORE });
  }
  if (!(await limiter(redis, adresseIp(request), 10))) {
    return NextResponse.json({ error: 'Trop de signalements envoyés. Réessayez plus tard.' }, { status: 429, headers: NO_STORE });
  }

  await enregistrerSignalement(redis, valide.valeur);
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
