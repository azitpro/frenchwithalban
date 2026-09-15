/**
 * Enregistrement des tests de placement dans Redis.
 *
 * Chaque test est une clé à part (expiration automatique après 12 mois, comme annoncé
 * dans la politique de confidentialité), indexée par date dans un ensemble trié.
 * La page reçoit un jeton privé qui seul permet d'ajouter ensuite prénom et email
 * à SON test ; seule l'empreinte du jeton est conservée.
 *
 * Lecture et suppression : uniquement via /api/admin/placement.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import type { Correction, TestPlacement } from './placement';

export const INDEX_KEY = 'placement:tests';
export const cleTest = (id: string) => `placement:test:${id}`;
export const CONSERVATION_S = 365 * 24 * 3600;
export const MAX_TESTS = 2000;
/** Envois autorisés par adresse IP (empreinte seulement) sur une heure. */
export const LIMITE_PAR_HEURE = 30;

export type StoreClient = Pick<Redis, 'get' | 'set' | 'del' | 'mget' | 'zadd' | 'zrange' | 'zrem' | 'zremrangebyscore' | 'incr' | 'expire'>;

type TestEnregistre = TestPlacement & { jetonHash: string };

const empreinte = (valeur: string) => createHash('sha256').update(valeur, 'utf8').digest('hex');

export const ID_VALIDE = /^[0-9a-f]{16}$/;
export const JETON_VALIDE = /^[A-Za-z0-9_-]{32}$/;

/** Première adresse de x-forwarded-for (renseignée par Vercel). */
export function adresseIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'inconnue';
}

/** Renvoie false quand la limite horaire est dépassée. L'adresse IP n'est jamais stockée en clair. */
export async function limiter(redis: StoreClient, ip: string, max = LIMITE_PAR_HEURE): Promise<boolean> {
  const cle = `placement:limite:${empreinte(ip).slice(0, 32)}`;
  const n = await redis.incr(cle);
  if (n === 1) await redis.expire(cle, 3600);
  return n <= max;
}

export async function enregistrerTest(
  redis: StoreClient,
  correction: Correction,
  langue: 'fr' | 'en',
  maintenant = new Date(),
): Promise<{ id: string; jeton: string }> {
  const id = randomBytes(8).toString('hex');
  const jeton = randomBytes(24).toString('base64url');
  const test: TestEnregistre = {
    id,
    passeLe: maintenant.toISOString(),
    langue,
    ...correction,
    prenom: '',
    email: '',
    contactLe: null,
    jetonHash: empreinte(jeton),
  };
  await redis.set(cleTest(id), test, { ex: CONSERVATION_S });
  await redis.zadd(INDEX_KEY, { score: maintenant.getTime(), member: id });

  // ménage de l'index : plus de 12 mois, puis au-delà des MAX_TESTS plus récents
  await redis.zremrangebyscore(INDEX_KEY, 0, maintenant.getTime() - CONSERVATION_S * 1000);
  const surplus = await redis.zrange<string[]>(INDEX_KEY, 0, -(MAX_TESTS + 1));
  if (surplus.length) {
    await redis.del(...surplus.map(cleTest));
    await redis.zrem(INDEX_KEY, ...surplus);
  }
  return { id, jeton };
}

export type ResultatContact = 'ok' | 'introuvable' | 'refuse';

export async function ajouterContact(
  redis: StoreClient,
  id: string,
  jeton: string,
  prenom: string,
  email: string,
  maintenant = new Date(),
): Promise<ResultatContact> {
  const test = await redis.get<TestEnregistre>(cleTest(id));
  if (!test) return 'introuvable';
  const attendu = Buffer.from(test.jetonHash, 'hex');
  const recu = Buffer.from(empreinte(jeton), 'hex');
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return 'refuse';
  await redis.set(cleTest(id), { ...test, prenom, email, contactLe: maintenant.toISOString() }, { keepTtl: true });
  return 'ok';
}

/** Du plus récent au plus ancien, sans les empreintes de jeton. */
export async function listerTests(redis: StoreClient): Promise<TestPlacement[]> {
  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
  if (!ids.length) return [];
  const tests = await redis.mget<(TestEnregistre | null)[]>(...ids.map(cleTest));
  return tests
    .filter((test): test is TestEnregistre => test !== null)
    .map(({ jetonHash: _jeton, ...test }) => test);
}

export async function supprimerTest(redis: StoreClient, id: string): Promise<void> {
  await redis.del(cleTest(id));
  await redis.zrem(INDEX_KEY, id);
}

const aUnCaractereDeControle = (texte: string) => [...texte].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

/** Prénom : 1 à 60 caractères, sans caractère de contrôle. Email : format simple, 254 caractères au plus. */
export function validerContact(prenomBrut: unknown, emailBrut: unknown): { ok: true; prenom: string; email: string } | { ok: false; erreur: string } {
  const prenom = typeof prenomBrut === 'string' ? prenomBrut.trim() : '';
  const email = typeof emailBrut === 'string' ? emailBrut.trim() : '';
  if (!prenom || prenom.length > 60 || aUnCaractereDeControle(prenom)) return { ok: false, erreur: 'Prénom invalide.' };
  if (email.length > 254 || aUnCaractereDeControle(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erreur: 'Adresse email invalide.' };
  return { ok: true, prenom, email };
}
