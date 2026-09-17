/**
 * Document unique stocké dans Redis avec un numéro de révision (to-do list, fiches élèves…).
 *
 * Chaque enregistrement porte la révision que la page a chargée : si le document a changé
 * entre-temps (autre onglet, autre appareil), le serveur refuse au lieu d'écraser et renvoie
 * la version la plus récente. Les versions remplacées sont gardées dans un historique court.
 */
import type { Redis } from '@upstash/redis';

export type StoreClient = Pick<Redis, 'mget' | 'multi'>;

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

export type LectureResult<T> = { ok: true; value: T; revision: number } | { ok: false; error: string };

export type SaveResult<T> =
  | { status: 'saved'; value: T; revision: number }
  | { status: 'conflict'; value: T; revision: number }
  | { status: 'invalid'; error: string }
  | { status: 'unreadable'; error: string };

type Options<T> = {
  cle: string;
  vide: T;
  valider: (brut: unknown) => Validation<T>;
  /** Nettoyage appliqué juste avant l'écriture (données trop anciennes…). */
  avantEcriture?: (valeur: T, maintenant: Date) => T;
  historique: number;
  messagePerime: string;
};

const toRevision = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};

export function creerStoreRevision<T>(o: Options<T>) {
  const cles = { document: o.cle, revision: `${o.cle}:revision`, historique: `${o.cle}:history` };

  async function lire(redis: StoreClient): Promise<LectureResult<T>> {
    const [raw, rev] = await redis.mget<[unknown, unknown]>(cles.document, cles.revision);
    const result = o.valider(raw ?? o.vide);
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, value: result.value, revision: toRevision(rev) };
  }

  async function enregistrer(redis: StoreClient, input: unknown, baseRevision: unknown, maintenant: Date = new Date()): Promise<SaveResult<T>> {
    const result = o.valider(input);
    if (!result.ok) return { status: 'invalid', error: result.error };
    if (typeof baseRevision !== 'number' || !Number.isInteger(baseRevision) || baseRevision < 0) {
      return { status: 'invalid', error: o.messagePerime };
    }

    const [raw, rev] = await redis.mget<[unknown, unknown]>(cles.document, cles.revision);
    const current = toRevision(rev);
    if (baseRevision !== current) {
      const stored = o.valider(raw ?? o.vide);
      return stored.ok ? { status: 'conflict', value: stored.value, revision: current } : { status: 'unreadable', error: stored.error };
    }

    const revision = current + 1;
    const value = o.avantEcriture ? o.avantEcriture(result.value, maintenant) : result.value;
    const tx = redis.multi();
    if (raw) {
      tx.lpush(cles.historique, { replacedAt: maintenant.toISOString(), revision: current, document: raw });
      tx.ltrim(cles.historique, 0, o.historique - 1);
    }
    tx.set(cles.document, value);
    tx.set(cles.revision, revision);
    await tx.exec();
    return { status: 'saved', value, revision };
  }

  return { cles, lire, enregistrer };
}
