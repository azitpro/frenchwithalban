/**
 * Roster des élèves dans Redis (document unique avec révision : voir store-revision.ts).
 * 30 versions remplacées sont gardées : un import CSV malheureux reste rattrapable.
 *
 * Données personnelles : aucune route publique n'utilise ce module.
 */
import { creerStoreRevision } from './store-revision';
import { EMPTY_ROSTER, validerRoster } from './roster';
import type { Roster } from './roster';

export const rosterStore = creerStoreRevision<Roster>({
  cle: 'roster:eleves',
  vide: EMPTY_ROSTER,
  valider: validerRoster,
  historique: 30,
  messagePerime: 'Page périmée : rechargez-la avant de modifier le roster.',
});
