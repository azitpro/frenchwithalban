/**
 * Organisation personnelle (routines) — logique pure, sans accès réseau.
 *
 * Stockée dans Redis sous la clé « planning », lue et écrite uniquement par
 * /api/admin/planning. Aucune page ni API publique ne lit ces données : une
 * routine n'est jamais une indisponibilité et n'empêche aucune réservation.
 *
 * Toutes les heures sont des minutes depuis minuit, en nombres entiers :
 * un créneau de 10h07 à 10h57 est stocké tel quel, sans arrondi.
 */
import type { Schedule } from './schedule';

export type Routine = {
  id: string;
  name: string;
  color: string; // « #3f7d5c »
  weeklyQuotaMin: number; // 600 = 10 h
};

export type RoutineSlot = {
  id: string;
  routineId: string;
  kind: 'weekly' | 'once';
  weekday?: number; // weekly — 1 = lundi … 7 = dimanche
  date?: string; // once — « 2026-09-10 »
  startMin: number;
  durationMin: number;
  validFrom?: string; // weekly — lundi de la première semaine
  validUntil?: string; // weekly — dimanche de la dernière semaine ; absent = sans fin
};

export type SlotOverride = {
  slotId: string;
  weekStart: string; // lundi de la semaine concernée
  action: 'delete' | 'move';
  date?: string;
  startMin?: number;
  durationMin?: number;
};

export type Planning = { routines: Routine[]; slots: RoutineSlot[]; overrides: SlotOverride[] };

export const EMPTY_PLANNING: Planning = { routines: [], slots: [], overrides: [] };

export const DAY_START_MIN = 7 * 60;
export const DAY_END_MIN = 22 * 60;
export const WEEKDAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const ROUTINE_COLORS = ['#3f7d5c', '#c9972a', '#7b3f9d', '#1f7a8c', '#b5543a', '#8d6e63', '#5c6bc0', '#2e8b57'];

/* ======================= dates ======================= */
// Dates en chaînes AAAA-MM-JJ, calculées en UTC : les changements d'heure n'ont aucun effet.

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = lundi … 7 = dimanche */
export function isoWeekday(date: string): number {
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function todayInParis(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/* ======================= formatage ======================= */

export function fmtTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${String(m).padStart(2, '0')}`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/* ======================= intervalles ======================= */

export function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** Minutes de [start, end[ couvertes par des intervalles, sans compter deux fois un recouvrement. */
export function coveredMinutes(start: number, end: number, intervals: Array<[number, number]>): number {
  const clipped = intervals
    .map(([s, e]) => [Math.max(s, start), Math.min(e, end)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: [number, number] | null = null;
  for (const [s, e] of clipped) {
    if (!current || s > current[1]) {
      if (current) total += current[1] - current[0];
      current = [s, e];
    } else {
      current[1] = Math.max(current[1], e);
    }
  }
  if (current) total += current[1] - current[0];
  return total;
}

/* ======================= cours (lecture seule) ======================= */

export type PreplyBusy = { date: string; startHour: number; endHour: number };

export type Lesson = {
  source: 'recurring' | 'oneOff' | 'preply';
  date: string;
  startMin: number;
  endMin: number;
  label: string;
};

const byDateThenStart = (a: { date: string; startMin: number }, b: { date: string; startMin: number }) =>
  a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1;

/** Cours de la semaine, tirés du planning des élèves et du flux Preply. */
export function lessonsForWeek(weekStart: string, schedule: Schedule, preply: PreplyBusy[]): Lesson[] {
  const dates = weekDates(weekStart);
  const named: Lesson[] = [];

  for (const r of schedule.recurring) {
    if (!r.active) continue;
    const index = WEEKDAY_NAMES.indexOf(r.weekday);
    if (index < 0) continue;
    const date = dates[index];
    if (schedule.exceptions.some((e) => e.recurringId === r.id && e.date === date)) continue;
    const startMin = Math.round(r.hour * 60);
    named.push({ source: 'recurring', date, startMin, endMin: startMin + r.duration, label: r.student });
  }

  for (const o of schedule.oneOff) {
    if (!dates.includes(o.date)) continue;
    const startMin = Math.round(o.hour * 60);
    named.push({ source: 'oneOff', date: o.date, startMin, endMin: startMin + o.duration, label: o.student });
  }

  const fromPreply: Lesson[] = preply
    .filter((b) => dates.includes(b.date))
    .map((b) => ({
      source: 'preply' as const,
      date: b.date,
      startMin: Math.round(b.startHour * 60),
      endMin: Math.round(b.endHour * 60),
      label: 'Preply',
    }))
    .filter((p) => p.endMin > p.startMin)
    // un cours nommé est plus informatif : le bloc Preply qui le recouvre est masqué
    .filter((p) => !named.some((n) => n.date === p.date && overlapMinutes(n.startMin, n.endMin, p.startMin, p.endMin) > 0));

  return [...named, ...fromPreply].sort(byDateThenStart);
}

/* ======================= routines de la semaine ======================= */

export type Occurrence = {
  slotId: string;
  routineId: string;
  kind: 'weekly' | 'once';
  weekStart: string;
  date: string;
  startMin: number;
  durationMin: number;
  endMin: number;
  moved: boolean; // créneau hebdomadaire déplacé pour cette semaine seulement
  displacedMin: number; // minutes recouvertes par un cours
  countedMin: number; // minutes qui comptent dans le quota
};

export function occurrencesForWeek(weekStart: string, planning: Planning, lessons: Lesson[]): Occurrence[] {
  const dates = weekDates(weekStart);
  const weekEnd = dates[6];
  const routineIds = new Set(planning.routines.map((r) => r.id));
  const result: Occurrence[] = [];

  for (const slot of planning.slots) {
    if (!routineIds.has(slot.routineId)) continue;
    let date: string;
    let startMin = slot.startMin;
    let durationMin = slot.durationMin;
    let moved = false;

    if (slot.kind === 'once') {
      if (!slot.date || !dates.includes(slot.date)) continue;
      date = slot.date;
    } else {
      if (!slot.weekday) continue;
      if (slot.validFrom && slot.validFrom > weekEnd) continue;
      if (slot.validUntil && slot.validUntil < weekStart) continue;
      date = dates[slot.weekday - 1];
      const override = planning.overrides.find((o) => o.slotId === slot.id && o.weekStart === weekStart);
      if (override?.action === 'delete') continue;
      if (override?.action === 'move') {
        date = override.date ?? date;
        startMin = override.startMin ?? startMin;
        durationMin = override.durationMin ?? durationMin;
        moved = true;
      }
    }

    const endMin = startMin + durationMin;
    const dayLessons = lessons.filter((l) => l.date === date).map((l) => [l.startMin, l.endMin] as [number, number]);
    const displacedMin = coveredMinutes(startMin, endMin, dayLessons);
    result.push({
      slotId: slot.id, routineId: slot.routineId, kind: slot.kind, weekStart,
      date, startMin, durationMin, endMin, moved, displacedMin, countedMin: durationMin - displacedMin,
    });
  }
  return result.sort(byDateThenStart);
}

/* ======================= quotas ======================= */

export type QuotaSummary = {
  routineId: string;
  quotaMin: number;
  placedMin: number; // hors minutes écrasées par un cours
  displacedMin: number;
  remainingMin: number;
  overMin: number;
};

/** Décompte d'une semaine : il repart naturellement de zéro chaque lundi. */
export function weeklyQuotas(planning: Planning, occurrences: Occurrence[]): QuotaSummary[] {
  return planning.routines.map((r) => {
    const own = occurrences.filter((o) => o.routineId === r.id);
    const placedMin = own.reduce((t, o) => t + o.countedMin, 0);
    const displacedMin = own.reduce((t, o) => t + o.displacedMin, 0);
    return {
      routineId: r.id,
      quotaMin: r.weeklyQuotaMin,
      placedMin,
      displacedMin,
      remainingMin: Math.max(0, r.weeklyQuotaMin - placedMin),
      overMin: Math.max(0, placedMin - r.weeklyQuotaMin),
    };
  });
}

/* ======================= modifications ======================= */

export type Scope = 'this' | 'future';

export function newId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function addRoutine(p: Planning, input: Omit<Routine, 'id'>, id: string = newId()): Planning {
  return { ...p, routines: [...p.routines, { id, ...input }] };
}

export function updateRoutine(p: Planning, id: string, patch: Partial<Omit<Routine, 'id'>>): Planning {
  return { ...p, routines: p.routines.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/** Supprime la routine, tous ses créneaux et leurs exceptions. */
export function deleteRoutine(p: Planning, id: string): Planning {
  const slotIds = new Set(p.slots.filter((s) => s.routineId === id).map((s) => s.id));
  return {
    routines: p.routines.filter((r) => r.id !== id),
    slots: p.slots.filter((s) => s.routineId !== id),
    overrides: p.overrides.filter((o) => !slotIds.has(o.slotId)),
  };
}

export type SlotInput = { routineId: string; kind: 'weekly' | 'once'; date: string; startMin: number; durationMin: number };

export function addSlot(p: Planning, input: SlotInput, id: string = newId()): Planning {
  const base = { id, routineId: input.routineId, kind: input.kind, startMin: input.startMin, durationMin: input.durationMin };
  const slot: RoutineSlot = input.kind === 'weekly'
    ? { ...base, weekday: isoWeekday(input.date), validFrom: weekStartOf(input.date) }
    : { ...base, date: input.date };
  return { ...p, slots: [...p.slots, slot] };
}

export type OccurrenceRef = { slotId: string; weekStart: string };
export type OccurrenceValues = { date: string; startMin: number; durationMin: number };

const withoutFutureOverrides = (overrides: SlotOverride[], slotId: string, weekStart: string) =>
  overrides.filter((o) => !(o.slotId === slotId && o.weekStart >= weekStart));

export function updateOccurrence(p: Planning, ref: OccurrenceRef, values: OccurrenceValues, scope: Scope): Planning {
  const slot = p.slots.find((s) => s.id === ref.slotId);
  if (!slot) return p;

  if (slot.kind === 'once') {
    return { ...p, slots: p.slots.map((s) => (s.id === slot.id ? { ...s, ...values } : s)) };
  }

  if (scope === 'this') {
    const others = p.overrides.filter((o) => !(o.slotId === slot.id && o.weekStart === ref.weekStart));
    return { ...p, overrides: [...others, { slotId: slot.id, weekStart: ref.weekStart, action: 'move', ...values }] };
  }

  // cette semaine et les suivantes
  const changed = { weekday: isoWeekday(values.date), startMin: values.startMin, durationMin: values.durationMin };
  const overrides = withoutFutureOverrides(p.overrides, slot.id, ref.weekStart);
  if (slot.validFrom && slot.validFrom >= ref.weekStart) {
    // la série commence cette semaine : on la modifie simplement
    return { ...p, overrides, slots: p.slots.map((s) => (s.id === slot.id ? { ...s, ...changed } : s)) };
  }
  // sinon on scinde : les semaines passées gardent l'ancien horaire
  const ended: RoutineSlot = { ...slot, validUntil: addDays(ref.weekStart, -1) };
  const continued: RoutineSlot = { ...slot, ...changed, id: newId(), validFrom: ref.weekStart };
  return { ...p, overrides, slots: [...p.slots.map((s) => (s.id === slot.id ? ended : s)), continued] };
}

export function deleteOccurrence(p: Planning, ref: OccurrenceRef, scope: Scope): Planning {
  const slot = p.slots.find((s) => s.id === ref.slotId);
  if (!slot) return p;

  const removeSlot = (): Planning => ({
    ...p,
    slots: p.slots.filter((s) => s.id !== slot.id),
    overrides: p.overrides.filter((o) => o.slotId !== slot.id),
  });

  if (slot.kind === 'once') return removeSlot();

  if (scope === 'this') {
    const others = p.overrides.filter((o) => !(o.slotId === slot.id && o.weekStart === ref.weekStart));
    return { ...p, overrides: [...others, { slotId: slot.id, weekStart: ref.weekStart, action: 'delete' }] };
  }

  if (slot.validFrom && slot.validFrom >= ref.weekStart) return removeSlot();
  return {
    ...p,
    overrides: withoutFutureOverrides(p.overrides, slot.id, ref.weekStart),
    slots: p.slots.map((s) => (s.id === slot.id ? { ...s, validUntil: addDays(ref.weekStart, -1) } : s)),
  };
}

/* ======================= validation (API) ======================= */

type Result = { ok: true; planning: Planning } | { ok: false; error: string };

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const fitsInDay = (start: number, duration: number) => start + duration <= 24 * 60;

/** Contrôle strict avant écriture ; ne conserve que les champs connus. */
export function validatePlanning(raw: unknown): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Planning absent.' };
  const src = raw as Record<string, unknown>;
  const routinesIn = src.routines ?? [];
  const slotsIn = src.slots ?? [];
  const overridesIn = src.overrides ?? [];
  if (!Array.isArray(routinesIn) || !Array.isArray(slotsIn) || !Array.isArray(overridesIn)) return { ok: false, error: 'Structure invalide.' };
  if (routinesIn.length > 100 || slotsIn.length > 3000 || overridesIn.length > 10000) return { ok: false, error: 'Trop d’éléments.' };

  const routines: Routine[] = [];
  for (const r of routinesIn as Record<string, unknown>[]) {
    const name = typeof r?.name === 'string' ? r.name.trim() : '';
    if (!isId(r?.id) || !name || name.length > 60) return { ok: false, error: 'Routine invalide : nom manquant ou trop long.' };
    if (typeof r.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(r.color)) return { ok: false, error: `Couleur invalide pour « ${name} ».` };
    if (!isInt(r.weeklyQuotaMin, 0, 7 * 24 * 60)) return { ok: false, error: `Quota invalide pour « ${name} ».` };
    if (routines.some((x) => x.id === r.id)) return { ok: false, error: 'Identifiant de routine en double.' };
    routines.push({ id: r.id, name, color: r.color, weeklyQuotaMin: r.weeklyQuotaMin });
  }
  const routineIds = new Set(routines.map((r) => r.id));

  const slots: RoutineSlot[] = [];
  for (const s of slotsIn as Record<string, unknown>[]) {
    if (!isId(s?.id) || slots.some((x) => x.id === s.id)) return { ok: false, error: 'Identifiant de créneau invalide.' };
    if (!routineIds.has(s.routineId as string)) return { ok: false, error: 'Créneau rattaché à une routine inexistante.' };
    if (!isInt(s.startMin, 0, 24 * 60 - 1) || !isInt(s.durationMin, 5, 24 * 60) || !fitsInDay(s.startMin, s.durationMin)) {
      return { ok: false, error: 'Horaire de créneau invalide.' };
    }
    const base = { id: s.id, routineId: s.routineId as string, startMin: s.startMin, durationMin: s.durationMin };
    if (s.kind === 'once') {
      if (!isDateKey(s.date)) return { ok: false, error: 'Date de créneau invalide.' };
      slots.push({ ...base, kind: 'once', date: s.date });
    } else if (s.kind === 'weekly') {
      if (!isInt(s.weekday, 1, 7)) return { ok: false, error: 'Jour de créneau invalide.' };
      if (s.validFrom !== undefined && !(isDateKey(s.validFrom) && isoWeekday(s.validFrom) === 1)) return { ok: false, error: 'Début de série invalide.' };
      if (s.validUntil !== undefined && !(isDateKey(s.validUntil) && isoWeekday(s.validUntil) === 7)) return { ok: false, error: 'Fin de série invalide.' };
      if (s.validFrom && s.validUntil && (s.validUntil as string) < (s.validFrom as string)) return { ok: false, error: 'Série terminée avant d’avoir commencé.' };
      const slot: RoutineSlot = { ...base, kind: 'weekly', weekday: s.weekday };
      if (s.validFrom) slot.validFrom = s.validFrom as string;
      if (s.validUntil) slot.validUntil = s.validUntil as string;
      slots.push(slot);
    } else {
      return { ok: false, error: 'Type de créneau invalide.' };
    }
  }
  const weeklyIds = new Set(slots.filter((s) => s.kind === 'weekly').map((s) => s.id));

  const overrides: SlotOverride[] = [];
  for (const o of overridesIn as Record<string, unknown>[]) {
    if (!weeklyIds.has(o?.slotId as string)) return { ok: false, error: 'Exception rattachée à un créneau hebdomadaire inexistant.' };
    if (!isDateKey(o.weekStart) || isoWeekday(o.weekStart) !== 1) return { ok: false, error: 'Semaine d’exception invalide.' };
    if (overrides.some((x) => x.slotId === o.slotId && x.weekStart === o.weekStart)) return { ok: false, error: 'Exception en double pour une même semaine.' };
    if (o.action === 'delete') {
      overrides.push({ slotId: o.slotId as string, weekStart: o.weekStart, action: 'delete' });
    } else if (o.action === 'move') {
      const inWeek = isDateKey(o.date) && o.date >= o.weekStart && o.date <= addDays(o.weekStart, 6);
      if (!inWeek || !isInt(o.startMin, 0, 24 * 60 - 1) || !isInt(o.durationMin, 5, 24 * 60) || !fitsInDay(o.startMin, o.durationMin)) {
        return { ok: false, error: 'Déplacement invalide.' };
      }
      overrides.push({ slotId: o.slotId as string, weekStart: o.weekStart, action: 'move', date: o.date as string, startMin: o.startMin, durationMin: o.durationMin });
    } else {
      return { ok: false, error: 'Action d’exception invalide.' };
    }
  }

  return { ok: true, planning: { routines, slots, overrides } };
}
