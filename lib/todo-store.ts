/**
 * Lecture et écriture de la to-do list dans Redis, sur le même principe que le planning personnel :
 * chaque enregistrement porte la révision chargée par la page ; si la liste a changé entre-temps
 * (autre onglet, autre appareil), le serveur refuse au lieu d'écraser. Les 20 versions remplacées
 * sont gardées dans un historique.
 *
 * Aucune route publique n'utilise ce module.
 */
import type { Redis } from '@upstash/redis';
import { EMPTY_TODO, nettoyer, validerTodo } from './todo';
import type { Todo } from './todo';

export const TODO_KEY = 'todo';
export const REVISION_KEY = 'todo:revision';
export const HISTORY_KEY = 'todo:history';
export const HISTORY_LENGTH = 20;

export type StoreClient = Pick<Redis, 'mget' | 'multi'>;

const toRevision = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

export async function readTodo(redis: StoreClient): Promise<{ ok: true; todo: Todo; revision: number } | { ok: false; error: string }> {
  const [raw, rev] = await redis.mget<[unknown, unknown]>(TODO_KEY, REVISION_KEY);
  const result = validerTodo(raw ?? EMPTY_TODO);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, todo: result.todo, revision: toRevision(rev) };
}

export type SaveResult =
  | { status: 'saved'; todo: Todo; revision: number }
  | { status: 'conflict'; todo: Todo; revision: number }
  | { status: 'invalid'; error: string }
  | { status: 'unreadable'; error: string };

export async function saveTodo(redis: StoreClient, input: unknown, baseRevision: unknown, now: Date = new Date()): Promise<SaveResult> {
  const result = validerTodo(input);
  if (!result.ok) return { status: 'invalid', error: result.error };
  if (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0) {
    return { status: 'invalid', error: 'Page périmée : rechargez-la avant de modifier la liste.' };
  }

  const [raw, rev] = await redis.mget<[unknown, unknown]>(TODO_KEY, REVISION_KEY);
  const current = toRevision(rev);
  if (baseRevision !== current) {
    const stored = validerTodo(raw ?? EMPTY_TODO);
    return stored.ok
      ? { status: 'conflict', todo: stored.todo, revision: current }
      : { status: 'unreadable', error: stored.error };
  }

  const revision = current + 1;
  const todo = nettoyer(result.todo, now);
  const tx = redis.multi();
  if (raw) {
    tx.lpush(HISTORY_KEY, { replacedAt: now.toISOString(), revision: current, todo: raw });
    tx.ltrim(HISTORY_KEY, 0, HISTORY_LENGTH - 1);
  }
  tx.set(TODO_KEY, todo);
  tx.set(REVISION_KEY, revision);
  await tx.exec();
  return { status: 'saved', todo, revision };
}
