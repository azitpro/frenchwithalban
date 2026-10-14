/**
 * Validation des dates « 2026-10-14 ».
 *
 * `new Date('2026-02-31T12:00:00Z')` ne renvoie pas une date invalide : V8 la fait
 * déborder sur le 3 mars. Un simple contrôle de NaN laisse donc passer des dates qui
 * n'existent pas. On reconstruit la date et on la compare au texte de départ.
 */

const FORME = /^\d{4}-\d{2}-\d{2}$/;

/** Vrai si le texte est une date du calendrier, au jour près. */
export function estDateReelle(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !FORME.test(valeur)) return false;
  const d = new Date(valeur + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === valeur;
}
