/**
 * Détection des cours hebdomadaires présents sur Preply mais non déclarés sur le site.
 *
 * L'agenda iCal de Preply s'arrête au renouvellement de l'abonnement : passé cette date,
 * le créneau redevient libre sur la page publique alors que l'élève le garde chaque semaine.
 * On repère donc les plages qui reviennent au même jour et à la même heure, et on signale
 * celles qui ne correspondent à aucun créneau hebdomadaire déclaré.
 */

import type { Occupation } from './preply-ical';
import type { Schedule } from './schedule';

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;

/** Nombre d'occurrences à partir duquel une plage est considérée comme hebdomadaire. */
export const MIN_OCCURRENCES = 3;
/** Fenêtre d'analyse, en semaines, de part et d'autre d'aujourd'hui. */
export const FENETRE_SEMAINES = 12;
/** Au-delà de ce délai sans occurrence, le cours est considéré comme terminé. */
export const PEREMPTION_SEMAINES = 3;
/** Nombre maximal de créneaux ignorés conservés. */
export const MAX_IGNORES = 200;

export type CreneauRepere = {
  /** « Jeudi|17 » : identifiant stable, utilisé aussi pour la liste des créneaux ignorés. */
  cle: string;
  weekday: string;
  hour: number;
  duration: 25 | 50;
  /** Nombre de fois où la plage apparaît dans la fenêtre d'analyse. */
  occurrences: number;
  premiere: string;
  derniere: string;
  /** Occurrences encore à venir dans l'agenda Preply : elles disparaîtront au renouvellement. */
  aVenir: number;
};

export function cleCreneau(weekday: string, hour: number): string {
  return `${weekday}|${hour}`;
}

/** Clé nettoyée, ou null si elle ne désigne pas un jour et une heure valides. */
export function cleValide(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  const [jour, heure] = valeur.split('|');
  const h = Number(heure);
  if (!JOURS.includes(jour as (typeof JOURS)[number])) return null;
  if (!Number.isFinite(h) || h < 0 || h > 24 || h * 2 !== Math.round(h * 2)) return null;
  return cleCreneau(jour, h);
}

/** Liste de clés nettoyée : sans doublon, sans valeur invalide, limitée à MAX_IGNORES. */
export function normaliserIgnores(brut: unknown): string[] {
  const vues = new Set<string>();
  for (const valeur of Array.isArray(brut) ? brut : []) {
    const cle = cleValide(valeur);
    if (cle) vues.add(cle);
  }
  return [...vues].slice(0, MAX_IGNORES);
}

/** Jour de la semaine en français d'une date « 2026-10-01 ». */
export function jourDe(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  if (Number.isNaN(d.getTime())) return '';
  return JOURS[(d.getUTCDay() + 6) % 7];
}

function decaler(date: string, jours: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** Heure ramenée au quart d'heure le plus proche puis à la demi-heure (les créneaux du site sont à h00 ou h30). */
function caler(hour: number): number {
  return Math.round(hour * 2) / 2;
}

/** Une plage est couverte si un créneau déclaré le même jour la chevauche, actif ou non. */
function dejaDeclare(schedule: Schedule, weekday: string, hour: number, duree: number): boolean {
  return schedule.recurring.some((r) => {
    if (r.weekday !== weekday) return false;
    const finDeclaree = r.hour + r.duration / 60;
    return hour < finDeclaree && r.hour < hour + duree;
  });
}

/** Vrai si le créneau tombe dans une plage où Alban accepte d'enseigner (sinon le site ne le propose jamais). */
function dansLesDisponibilites(schedule: Schedule, weekday: string, hour: number): boolean {
  return schedule.availability.some((a) => a.weekday === weekday && hour >= a.start && hour < a.end);
}

/**
 * Créneaux hebdomadaires repérés sur Preply et absents du planning déclaré.
 * Les créneaux ignorés ne sont pas retirés ici : l'appelant sépare les deux listes.
 */
export function reperer(occupations: Occupation[], schedule: Schedule, aujourdHui: string): CreneauRepere[] {
  const debut = decaler(aujourdHui, -7 * FENETRE_SEMAINES);
  const fin = decaler(aujourdHui, 7 * FENETRE_SEMAINES);
  const limiteFraicheur = decaler(aujourdHui, -7 * PEREMPTION_SEMAINES);

  const groupes = new Map<string, { weekday: string; hour: number; dates: Set<string>; durees: number[] }>();
  for (const o of occupations) {
    if (o.date < debut || o.date > fin) continue;
    const weekday = jourDe(o.date);
    if (!weekday) continue;
    const hour = caler(o.startHour);
    const cle = cleCreneau(weekday, hour);
    const groupe = groupes.get(cle) ?? { weekday, hour, dates: new Set<string>(), durees: [] };
    groupe.dates.add(o.date);
    groupe.durees.push(o.endHour - o.startHour);
    groupes.set(cle, groupe);
  }

  const reperes: CreneauRepere[] = [];
  for (const [cle, groupe] of groupes) {
    const dates = [...groupe.dates].sort();
    if (dates.length < MIN_OCCURRENCES) continue;
    const derniere = dates[dates.length - 1];
    if (derniere < limiteFraicheur) continue;
    // une plage d'une demi-heure au plus correspond à un cours de 25 minutes
    const duration: 25 | 50 = Math.max(...groupe.durees) <= 0.6 ? 25 : 50;
    if (dejaDeclare(schedule, groupe.weekday, groupe.hour, duration / 60)) continue;
    if (!dansLesDisponibilites(schedule, groupe.weekday, groupe.hour)) continue;
    reperes.push({
      cle,
      weekday: groupe.weekday,
      hour: groupe.hour,
      duration,
      occurrences: dates.length,
      premiere: dates[0],
      derniere,
      aVenir: dates.filter((d) => d > aujourdHui).length,
    });
  }

  return reperes.sort((a, b) => JOURS.indexOf(a.weekday as (typeof JOURS)[number]) - JOURS.indexOf(b.weekday as (typeof JOURS)[number]) || a.hour - b.hour);
}
