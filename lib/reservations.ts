/**
 * Demandes de réservation envoyées depuis la page des créneaux.
 *
 * Ce n'est pas une réservation ferme : le créneau n'est pas bloqué, Alban confirme
 * lui-même. Le prénom et l'email sont des données personnelles — ils ne ressortent
 * que par /api/admin/reservations.
 */

export const PRENOM_MAX = 60;
export const EMAIL_MAX = 254;
export const FUSEAU_MAX = 60;
export const MESSAGE_MAX = 500;

/** Durées proposées sur la page des créneaux. */
export const DUREES = [25, 50] as const;
export type Duree = (typeof DUREES)[number];

export type Reservation = {
  id: string;
  prenom: string;
  /** Facultatif : sans email, Alban ne peut répondre que si l'élève le recontacte. */
  email: string;
  /** Date du créneau à Paris, « 2026-10-15 ». */
  date: string;
  /** Heure du créneau à Paris, en décimal : 17.5 = 17 h 30. */
  heure: number;
  duree: Duree;
  /** Fuseau choisi par le visiteur, pour savoir à quelle heure le cours tombe chez lui. */
  fuseau: string;
  message: string;
  langue: 'fr' | 'en';
  envoyeLe: string;
};

export type Entree = {
  prenom?: unknown;
  email?: unknown;
  date?: unknown;
  heure?: unknown;
  duree?: unknown;
  fuseau?: unknown;
  message?: unknown;
  langue?: unknown;
};

const DATE_VALIDE = /^\d{4}-\d{2}-\d{2}$/;
// volontairement permissif : refuser un email valide est pire que d'en accepter un douteux
const EMAIL_VALIDE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Texte nettoyé : espaces resserrés, caractères de contrôle refusés. */
function texte(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (t.length > max) return null;
  if ([...t].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  return t;
}

export function validerReservation(entree: Entree):
  | { ok: true; valeur: Omit<Reservation, 'id' | 'envoyeLe'> }
  | { ok: false; erreur: string } {
  const prenom = texte(entree.prenom, PRENOM_MAX);
  if (!prenom) return { ok: false, erreur: 'Prénom manquant ou trop long.' };

  const email = texte(entree.email, EMAIL_MAX) ?? '';
  if (email && !EMAIL_VALIDE.test(email)) return { ok: false, erreur: 'Adresse email invalide.' };

  const date = typeof entree.date === 'string' && DATE_VALIDE.test(entree.date) ? entree.date : null;
  if (!date || Number.isNaN(new Date(date + 'T12:00:00Z').getTime())) return { ok: false, erreur: 'Date de créneau invalide.' };

  const heure = Number(entree.heure);
  // les créneaux sont posés au quart d'heure : tout le reste vient d'ailleurs que de la page
  if (!Number.isFinite(heure) || heure < 0 || heure >= 24 || heure * 4 !== Math.round(heure * 4)) {
    return { ok: false, erreur: 'Heure de créneau invalide.' };
  }

  const duree = Number(entree.duree);
  if (!DUREES.includes(duree as Duree)) return { ok: false, erreur: 'Durée de cours invalide.' };

  const fuseau = texte(entree.fuseau, FUSEAU_MAX) ?? '';

  // un message trop long est refusé, pas vidé en silence : l'élève doit savoir qu'il est perdu
  const message = entree.message === undefined || entree.message === null || entree.message === ''
    ? ''
    : texte(entree.message, MESSAGE_MAX);
  if (message === null) return { ok: false, erreur: 'Message trop long.' };

  const langue = entree.langue === 'en' ? 'en' : 'fr';

  return { ok: true, valeur: { prenom, email, date, heure, duree: duree as Duree, fuseau, message, langue } };
}

/** « 17.5 » devient « 17h30 ». */
export const formaterHeure = (heure: number): string =>
  `${Math.floor(heure)}h${String(Math.round((heure % 1) * 60)).padStart(2, '0')}`;

/** « 2026-10-15 » devient « jeudi 15 octobre 2026 ». */
export function formaterDate(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}
