/**
 * L'inverse du détecteur de lib/preply-recurrents.ts.
 *
 * Là-bas : un cours revient sur Preply mais n'est pas déclaré sur le site.
 * Ici : un cours hebdomadaire est déclaré sur le site, mais l'agenda Preply ne
 * montre rien ce jour-là — l'élève n'a pas renouvelé sa semaine. Le site continue
 * pourtant d'afficher l'heure comme occupée : autant la rendre réservable.
 *
 * Deux garde-fous, sans quoi on signalerait n'importe quoi :
 * - un cours donné en direct n'apparaît jamais dans l'agenda Preply. On ne regarde
 *   donc que les créneaux dont on a retrouvé assez de cours passés sur Preply ;
 * - l'agenda Preply s'arrête au renouvellement de l'abonnement. Au-delà de sa
 *   dernière date connue, « rien » veut dire « pas encore su », pas « annulé ».
 */

import { estDateReelle } from './dates';
import type { Occupation } from './preply-ical';
import { decaler, jourDe } from './preply-recurrents';
import type { Schedule } from './schedule';

/** Nombre de semaines passées examinées pour savoir si le créneau vient de Preply. */
export const FENETRE_PASSEE_SEMAINES = 12;
/** Cours passés à retrouver sur Preply avant de considérer le créneau comme « Preply ». */
export const MIN_PASSES = 3;
/** Nombre maximal d'absences ignorées conservées. */
export const MAX_ABSENCES_IGNOREES = 200;

export type Absence = {
  /** « identifiantDuCours|2026-10-22 ». */
  cle: string;
  recurringId: string;
  student: string;
  date: string;
  weekday: string;
  hour: number;
  duration: 25 | 50;
  /** Cours retrouvés sur Preply ces dernières semaines, à la même heure. */
  passes: number;
  /** Le créneau tombe-t-il dans une plage où Alban accepte d'enseigner ? */
  reservable: boolean;
};


export const cleAbsence = (recurringId: string, date: string): string => `${recurringId}|${date}`;

/** Clé nettoyée, ou null si elle ne désigne pas un cours et une date valides. */
export function cleAbsenceValide(valeur: unknown): string | null {
  if (typeof valeur !== 'string') return null;
  const sep = valeur.indexOf('|');
  if (sep <= 0 || sep === valeur.length - 1) return null;
  const date = valeur.slice(sep + 1);
  if (!estDateReelle(date)) return null;
  return valeur;
}

/** Date du jour à Paris, « 2026-10-14 ». */
export const dateAParis = (quand: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(quand);

/** Heure décimale à Paris, 17.5 pour 17 h 30. */
export function heureAParis(quand: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(quand);
  const lire = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (lire('hour') % 24) + lire('minute') / 60;
}

/**
 * Liste de clés nettoyée : sans doublon, sans clé invalide, sans date déjà passée
 * (elle ne sera plus jamais proposée), limitée à MAX_ABSENCES_IGNOREES.
 */
export function normaliserAbsencesIgnorees(brut: unknown, aujourdHui: string = dateAParis()): string[] {
  const vues = new Set<string>();
  for (const valeur of Array.isArray(brut) ? brut : []) {
    const cle = cleAbsenceValide(valeur);
    if (cle && cle.slice(cle.indexOf('|') + 1) >= aujourdHui) vues.add(cle);
  }
  return [...vues].slice(0, MAX_ABSENCES_IGNOREES);
}

/** Plages occupées rangées par date, pour tester la couverture sans tout reparcourir. */
function parDate(occupations: Occupation[]): Map<string, Occupation[]> {
  const index = new Map<string, Occupation[]>();
  for (const o of occupations) {
    const liste = index.get(o.date);
    if (liste) liste.push(o);
    else index.set(o.date, [o]);
  }
  return index;
}

/** Une plage Preply chevauche-t-elle ce créneau ? */
function couvert(index: Map<string, Occupation[]>, date: string, hour: number, duree: number): boolean {
  return (index.get(date) ?? []).some((o) => hour < o.endHour && o.startHour < hour + duree);
}

/** Dates d'un jour de semaine donné, de debut à fin inclus. */
function datesDuJour(weekday: string, debut: string, fin: string): string[] {
  const dates: string[] = [];
  for (let d = debut; d <= fin; d = decaler(d, 1)) {
    if (jourDe(d) === weekday) dates.push(d);
  }
  return dates;
}

/** Jour entier bloqué, ou plage d'indisponibilité qui recouvre le créneau. */
function indisponible(schedule: Schedule, date: string, hour: number, duree: number): boolean {
  return (schedule.unavailability ?? []).some((u) => {
    if (u.date !== date) return false;
    if (u.type === 'day') return true;
    return hour < (u.end ?? 0) && (u.start ?? 0) < hour + duree;
  });
}

/** Un autre cours occupe-t-il déjà l'heure ? La libérer ne servirait alors à rien. */
function occupeParAilleurs(schedule: Schedule, recurringId: string, date: string, hour: number, duree: number): boolean {
  const chevauche = (debut: number, fin: number) => hour < fin && debut < hour + duree;
  if (schedule.oneOff.some((o) => o.date === date && chevauche(o.hour, o.hour + o.duration / 60))) return true;
  return schedule.recurring.some((r) => {
    if (r.id === recurringId || !r.active || r.weekday !== jourDe(date)) return false;
    if (schedule.exceptions.some((e) => e.recurringId === r.id && e.date === date)) return false;
    return chevauche(r.hour, r.hour + r.duration / 60);
  });
}

/** Le créneau tient-il entièrement dans une plage de disponibilité du même jour ? */
function dansLesDisponibilites(schedule: Schedule, weekday: string, hour: number, duree: number): boolean {
  return schedule.availability.some((a) => a.weekday === weekday && hour >= a.start && hour + duree <= a.end);
}

/**
 * Cours hebdomadaires déclarés que l'agenda Preply ne montre plus, aux dates à venir.
 * Les absences ignorées ne sont pas retirées ici : l'appelant sépare les deux listes.
 *
 * `heureActuelle` sert à ne pas proposer de libérer un cours déjà passé aujourd'hui.
 */
export function reperAbsences(
  occupations: Occupation[],
  schedule: Schedule,
  aujourdHui: string,
  heureActuelle = 0,
): Absence[] {
  if (occupations.length === 0) return [];
  const index = parDate(occupations);

  // jusqu'où l'agenda est renseigné : au-delà, une absence ne veut rien dire
  const horizon = occupations.reduce((max, o) => (o.date > max ? o.date : max), occupations[0].date);
  if (horizon < aujourdHui) return [];

  const debutPasse = decaler(aujourdHui, -7 * FENETRE_PASSEE_SEMAINES);
  const veille = decaler(aujourdHui, -1);
  const absences: Absence[] = [];

  for (const r of schedule.recurring) {
    if (!r.active) continue;
    const duree = r.duration / 60;

    const passes = datesDuJour(r.weekday, debutPasse, veille)
      .filter((d) => couvert(index, d, r.hour, duree)).length;
    if (passes < MIN_PASSES) continue;

    for (const date of datesDuJour(r.weekday, aujourdHui, horizon)) {
      if (date === aujourdHui && heureActuelle >= r.hour + duree) continue;
      if (couvert(index, date, r.hour, duree)) continue;
      if (schedule.exceptions.some((e) => e.recurringId === r.id && e.date === date)) continue;
      if (indisponible(schedule, date, r.hour, duree)) continue;
      if (occupeParAilleurs(schedule, r.id, date, r.hour, duree)) continue;
      absences.push({
        cle: cleAbsence(r.id, date),
        recurringId: r.id,
        student: r.student,
        date,
        weekday: r.weekday,
        hour: r.hour,
        duration: r.duration,
        passes,
        reservable: dansLesDisponibilites(schedule, r.weekday, r.hour, duree),
      });
    }
  }

  return absences.sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
}

/**
 * Libère le créneau : le cours est annulé à cette date, et, s'il tombe hors des
 * plages de disponibilité, un créneau forcé le rend tout de même réservable —
 * sans quoi l'annulation ne changerait rien sur la page publique.
 */
export function libererAbsence(schedule: Schedule, absence: Absence, id: string): Schedule {
  const dejaAnnule = schedule.exceptions.some((e) => e.recurringId === absence.recurringId && e.date === absence.date);
  const avecException = dejaAnnule
    ? schedule
    : { ...schedule, exceptions: [...schedule.exceptions, { recurringId: absence.recurringId, date: absence.date }] };

  if (absence.reservable) return avecException;
  const forced = avecException.forced ?? [];
  if (forced.some((f) => f.date === absence.date && Math.abs(f.hour - absence.hour) < 0.005)) return avecException;
  return { ...avecException, forced: [...forced, { id, date: absence.date, hour: absence.hour }] };
}
