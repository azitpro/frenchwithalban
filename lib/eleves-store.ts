/**
 * Fiches élèves dans Redis (document unique avec révision : voir store-revision.ts).
 * 30 versions remplacées sont gardées dans un historique, pour retrouver une fiche écrasée par erreur.
 *
 * Données personnelles : aucune route publique n'utilise ce module.
 */
import { creerStoreRevision } from './store-revision';
import { EMPTY_ELEVES, validerEleves } from './eleves';
import type { Eleves } from './eleves';

export const elevesStore = creerStoreRevision<Eleves>({
  cle: 'eleves:fiches',
  vide: EMPTY_ELEVES,
  valider: (brut) => {
    const r = validerEleves(brut);
    return r.ok ? { ok: true, value: r.eleves } : r;
  },
  historique: 30,
  messagePerime: 'Page périmée : rechargez-la avant de modifier les fiches.',
});
