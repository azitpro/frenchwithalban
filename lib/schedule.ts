/**
 * Planning des cours stocké dans Redis sous la clé « schedule ».
 *
 * Deux lectures distinctes :
 * - toPublicSchedule : pour planning_public.html, horaires seuls, sans aucun prénom ;
 * - withDefaults     : pour l'administration, données complètes.
 */

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
};

export const EMPTY_SCHEDULE: Schedule = {
  recurring: [],
  exceptions: [],
  oneOff: [],
  availability: [],
  unavailability: [],
  forced: [],
};

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
  };
}

/** Version publique : chaque champ est repris explicitement, jamais le prénom. */
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
