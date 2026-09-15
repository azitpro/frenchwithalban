import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';
import { adresseIp, ajouterContact, ID_VALIDE, JETON_VALIDE, limiter, validerContact } from '@/lib/placement-store';

const redis = Redis.fromEnv();
const NO_STORE = { 'Cache-Control': 'no-store' };

// Route publique : ajoute prénom et email (facultatifs) au test qui vient d'être passé.
// Il faut le jeton remis à la page au moment de l'enregistrement du test.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400, headers: NO_STORE });
  }
  if (body.site) return NextResponse.json({ success: true }, { headers: NO_STORE });

  const id = typeof body.id === 'string' ? body.id : '';
  const jeton = typeof body.jeton === 'string' ? body.jeton : '';
  if (!ID_VALIDE.test(id) || !JETON_VALIDE.test(jeton)) {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400, headers: NO_STORE });
  }
  const contact = validerContact(body.prenom, body.email);
  if (!contact.ok) {
    return NextResponse.json({ error: contact.erreur }, { status: 400, headers: NO_STORE });
  }
  if (!(await limiter(redis, adresseIp(request)))) {
    return NextResponse.json({ error: 'Trop d’envois. Réessayez plus tard.' }, { status: 429, headers: NO_STORE });
  }

  const resultat = await ajouterContact(redis, id, jeton, contact.prenom, contact.email);
  if (resultat === 'introuvable') {
    return NextResponse.json({ error: 'Test introuvable ou expiré.' }, { status: 404, headers: NO_STORE });
  }
  if (resultat === 'refuse') {
    return NextResponse.json({ error: 'Requête refusée.' }, { status: 403, headers: NO_STORE });
  }
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
