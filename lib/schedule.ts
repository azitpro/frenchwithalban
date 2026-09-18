/**
 * Planning des cours stocké dans Redis sous la clé « schedule ».
 *
 * Deux lectures distinctes :
 * - toPublicSchedule : pour planning_public.html, horaires seuls, sans aucun prénom ;
 * - withDefaults     : pour l'administration, données complètes.
 */

import { normaliserIgnores } from './preply-recurrents';

export type RecurringSlot = {
  id: string;
  student: string;
  weekday: string; // « Lundi » à « Dimanche »
  hour: number; // heure décimale, ex. 13.5
  duration: 25 | 50;
  active: boolean;
};

export type Exception = { recurringId: string; date: string };

export type OneOff = {
  id: string;
  student: string;
  date: string; // « 2026-08-24 »
  hour: number;
  duration: 25 | 50;
};

export type AvailabilityWindow = { id: string; weekday: string; start: number; end: number };

export type Unavailability = { id: string; type: 'day' | 'range'; date: string; start?: number; end?: number };

export type Forced = { id: string; date: string; hour: number };

export type Schedule = {
  recurring: RecurringSlot[];
  exceptions: Exception[];
  oneOff: OneOff[];
  availability: AvailabilityWindow[];
  unavailability: Unavailability[];
  forced: Forced[];
  /** Élèves ajoutés depuis l'administration (prénoms : données personnelles, jamais publiques). */
  students: string[];
  /** Créneaux repérés sur Preply qu'Alban a choisi de ne plus voir signalés (clés « Jeudi|17 »). */
  ignoredRecurring: string[];
};

export const EMPTY_SCHEDULE: Schedule = {
  recurring: [],
  exceptions: [],
  oneOff: [],
  availability: [],
  unavailability: [],
  forced: [],
  students: [],
  ignoredRecurring: [],
};

export const STUDENT_NAME_MAX = 60;
export const STUDENTS_MAX = 300;

/** Prénom nettoyé, ou null s'il est vide, trop long ou contient un caractère de contrôle. */
export function cleanStudentName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > STUDENT_NAME_MAX || [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  return name;
}

const byName = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' });

/** Liste nettoyée : sans vide, sans doublon (casse ignorée), triée, limitée à STUDENTS_MAX. */
export function normalizeStudents(raw: unknown): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of Array.isArray(raw) ? raw : []) {
    const name = cleanStudentName(value);
    if (name && !seen.has(name.toLocaleLowerCase('fr'))) {
      seen.add(name.toLocaleLowerCase('fr'));
      names.push(name);
    }
  }
  return names.sort(byName).slice(0, STUDENTS_MAX);
}

/** Élèves proposés dans l'administration : liste enregistrée + prénoms déjà présents dans les cours. */
export function studentNames(schedule: Schedule): string[] {
  return normalizeStudents([
    ...schedule.students,
    ...schedule.recurring.map((r) => r.student),
    ...schedule.oneOff.map((o) => o.student),
  ]);
}

/** Données complètes, avec les listes manquantes remplacées par des listes vides. */
export function withDefaults(raw: unknown): Schedule {
  const source = raw && typeof raw === 'object' ? (raw as Partial<Schedule>) : {};
  return {
    ...EMPTY_SCHEDULE,
    ...source,
    recurring: source.recurring ?? [],
    exceptions: source.exceptions ?? [],
    oneOff: source.oneOff ?? [],
    availability: source.availability ?? [],
    unavailability: source.unavailability ?? [],
    forced: source.forced ?? [],
    students: normalizeStudents(source.students),
    ignoredRecurring: normaliserIgnores(source.ignoredRecurring),
  };
}

/** Version publique : chaque champ est repris explicitement, jamais le prénom ni la liste des élèves. */
export function toPublicSchedule(schedule: Schedule) {
  return {
    recurring: schedule.recurring.map(({ id, weekday, hour, duration, active }) => ({ id, weekday, hour, duration, active })),
    exceptions: schedule.exceptions.map(({ recurringId, date }) => ({ recurringId, date })),
    oneOff: schedule.oneOff.map(({ id, date, hour, duration }) => ({ id, date, hour, duration })),
    availability: schedule.availability.map(({ id, weekday, start, end }) => ({ id, weekday, start, end })),
    unavailability: schedule.unavailability.map(({ id, type, date, start, end }) => ({ id, type, date, start, end })),
    forced: schedule.forced.map(({ id, date, hour }) => ({ id, date, hour })),
  };
}

/**
 * Garde-fou avant écriture : un planning dont un cours n'a pas de prénom
 * proviendrait de la lecture publique, et l'enregistrer effacerait les noms.
 */
export function hasAllStudentNames(schedule: Schedule): boolean {
  const named = (s: { student?: unknown }) => typeof s.student === 'string' && s.student.trim() !== '';
  return schedule.recurring.every(named) && schedule.oneOff.every(named);
}
