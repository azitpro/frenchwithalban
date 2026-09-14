/**
 * Lecture et écriture du planning personnel dans Redis.
 *
 * Chaque enregistrement porte la révision que la page a chargée. Si le planning a
 * été modifié entre-temps (autre onglet, autre appareil, page restée ouverte), le
 * serveur refuse au lieu d'écraser la version plus récente. Avant chaque écriture,
 * la version remplacée est conservée dans un historique des 30 dernières versions.
 * À chaque écriture, ce qui dépasse la période de conservation (12 mois) est effacé.
 *
 * Aucune route publique n'utilise ce module.
 */
import type { Redis } from '@upstash/redis';
import { EMPTY_PLANNING, pruneOld, todayInParis, validatePlanning } from './planning';
import type { Planning } from './planning';

export const PLANNING_KEY = 'planning';
export const REVISION_KEY = 'planning:revision';
export const HISTORY_KEY = 'planning:history';
export const HISTORY_LENGTH = 30;

export type StoreClient = Pick<Redis, 'mget' | 'multi'>;

export type HistoryEntry = { replacedAt: string; revision: number; planning: unknown };

const toRevision = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

export async function readPlanning(redis: StoreClient): Promise<
  { ok: true; planning: Planning; revision: number } | { ok: false; error: string }
> {
  const [raw, rev] = await redis.mget<[unknown, unknown]>(PLANNING_KEY, REVISION_KEY);
  const result = validatePlanning(raw ?? EMPTY_PLANNING);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, planning: result.planning, revision: toRevision(rev) };
}

export type SaveResult =
  | { status: 'saved'; planning: Planning; revision: number }
  | { status: 'conflict'; planning: Planning; revision: number }
  | { status: 'invalid'; error: string }
  | { status: 'unreadable'; error: string };

export async function savePlanning(
  redis: StoreClient,
  input: unknown,
  baseRevision: unknown,
  now: Date = new Date(),
): Promise<SaveResult> {
  const result = validatePlanning(input);
  if (!result.ok) return { status: 'invalid', error: result.error };
  if (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0) {
    // page ouverte avant cette protection : elle ne doit plus pouvoir écraser les données
    return { status: 'invalid', error: 'Page périmée : rechargez-la avant de modifier le planning.' };
  }

  const [raw, rev] = await redis.mget<[unknown, unknown]>(PLANNING_KEY, REVISION_KEY);
  const current = toRevision(rev);
  if (baseRevision !== current) {
    const stored = validatePlanning(raw ?? EMPTY_PLANNING);
    return stored.ok
      ? { status: 'conflict', planning: stored.planning, revision: current }
      : { status: 'unreadable', error: stored.error };
  }

  // Écriture groupée (MULTI/EXEC). Entre la lecture ci-dessus et cette écriture, la
  // fenêtre est de quelques millisecondes : suffisant pour un seul utilisateur.
  const revision = current + 1;
  const planning = pruneOld(result.planning, todayInParis(now));
  const tx = redis.multi();
  if (raw) {
    const entry: HistoryEntry = { replacedAt: now.toISOString(), revision: current, planning: raw };
    tx.lpush(HISTORY_KEY, entry);
    tx.ltrim(HISTORY_KEY, 0, HISTORY_LENGTH - 1);
  }
  tx.set(PLANNING_KEY, planning);
  tx.set(REVISION_KEY, revision);
  await tx.exec();
  return { status: 'saved', planning, revision };
}
