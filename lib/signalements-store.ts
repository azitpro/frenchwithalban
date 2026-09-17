/**
 * Enregistrement des signalements dans Redis : une clé par signalement (effacée au bout de 12 mois),
 * indexée par date dans un ensemble trié, comme les tests de placement.
 *
 * Lecture et suppression : uniquement via /api/admin/signalements.
 */
import { randomBytes } from 'node:crypto';
import type { Redis } from '@upstash/redis';
import type { Signalement } from './signalements';

export const INDEX_KEY = 'signalements';
export const cleSignalement = (id: string) => `signalement:${id}`;
export const CONSERVATION_S = 365 * 24 * 3600;
export const MAX_SIGNALEMENTS = 500;
export const ID_VALIDE = /^[0-9a-f]{16}$/;

export type StoreClient = Pick<Redis, 'get' | 'set' | 'del' | 'mget' | 'zadd' | 'zrange' | 'zrem' | 'zremrangebyscore'>;

export async function enregistrerSignalement(
  redis: StoreClient,
  valeur: Omit<Signalement, 'id' | 'envoyeLe'>,
  maintenant = new Date(),
): Promise<Signalement> {
  const signalement: Signalement = { id: randomBytes(8).toString('hex'), envoyeLe: maintenant.toISOString(), ...valeur };
  await redis.set(cleSignalement(signalement.id), signalement, { ex: CONSERVATION_S });
  await redis.zadd(INDEX_KEY, { score: maintenant.getTime(), member: signalement.id });

  // ménage : plus de 12 mois, puis au-delà des MAX_SIGNALEMENTS plus récents
  await redis.zremrangebyscore(INDEX_KEY, 0, maintenant.getTime() - CONSERVATION_S * 1000);
  const surplus = await redis.zrange<string[]>(INDEX_KEY, 0, -(MAX_SIGNALEMENTS + 1));
  if (surplus.length) {
    await redis.del(...surplus.map(cleSignalement));
    await redis.zrem(INDEX_KEY, ...surplus);
  }
  return signalement;
}

/** Du plus récent au plus ancien. */
export async function listerSignalements(redis: StoreClient): Promise<Signalement[]> {
  const ids = await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true });
  if (!ids.length) return [];
  const liste = await redis.mget<(Signalement | null)[]>(...ids.map(cleSignalement));
  return liste.filter((s): s is Signalement => s !== null);
}

export async function supprimerSignalement(redis: StoreClient, id: string): Promise<void> {
  await redis.del(cleSignalement(id));
  await redis.zrem(INDEX_KEY, id);
}
