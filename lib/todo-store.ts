/**
 * Lecture et écriture de la to-do list dans Redis (document unique avec révision : voir store-revision.ts).
 * 20 versions remplacées sont gardées dans un historique.
 *
 * Aucune route publique n'utilise ce module.
 */
import { creerStoreRevision } from './store-revision';
import type { StoreClient } from './store-revision';
import { EMPTY_TODO, nettoyer, validerTodo } from './todo';
import type { Todo } from './todo';

export type { StoreClient };

const store = creerStoreRevision<Todo>({
  cle: 'todo',
  vide: EMPTY_TODO,
  valider: (brut) => {
    const r = validerTodo(brut);
    return r.ok ? { ok: true, value: r.todo } : r;
  },
  avantEcriture: nettoyer,
  historique: 20,
  messagePerime: 'Page périmée : rechargez-la avant de modifier la liste.',
});

export const TODO_KEY = store.cles.document;
export const REVISION_KEY = store.cles.revision;
export const HISTORY_KEY = store.cles.historique;
export const HISTORY_LENGTH = 20;

export async function readTodo(redis: StoreClient): Promise<{ ok: true; todo: Todo; revision: number } | { ok: false; error: string }> {
  const r = await store.lire(redis);
  return r.ok ? { ok: true, todo: r.value, revision: r.revision } : r;
}

export type SaveResult =
  | { status: 'saved'; todo: Todo; revision: number }
  | { status: 'conflict'; todo: Todo; revision: number }
  | { status: 'invalid'; error: string }
  | { status: 'unreadable'; error: string };

export async function saveTodo(redis: StoreClient, input: unknown, baseRevision: unknown, now: Date = new Date()): Promise<SaveResult> {
  const r = await store.enregistrer(redis, input, baseRevision, now);
  if (r.status === 'saved' || r.status === 'conflict') return { status: r.status, todo: r.value, revision: r.revision };
  return r;
}
