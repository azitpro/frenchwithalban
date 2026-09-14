/**
 * Organisation personnelle (routines et événements) — logique pure, sans accès réseau.
 *
 * Stockée dans Redis sous la clé « planning », lue et écrite uniquement par
 * /api/admin/planning. Aucune page ni API publique ne lit ces données : une
 * routine ou un événement n'est jamais une indisponibilité et n'empêche aucune réservation.
 *
 * Toutes les heures sont stockées en minutes depuis minuit, en nombres entiers :
 * un créneau de 10h07 à 10h57 est enregistré et affiché tel quel. L'arrondi
 * facultatif (au quart d'heure ou à la demi-heure supérieurs) ne s'applique
 * qu'au décompte des quotas.
 *
 * Les semaines passées restent disponibles RETENTION_WEEKS semaines ; au-delà,
 * les événements, bilans et créneaux terminés sont effacés à l'enregistrement.
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

/** Événement ponctuel, hors routine : ne compte dans aucun quota. */
export type PlanningEvent = {
  id: string;
  title: string;
  date: string;
  startMin: number;
  durationMin: number;
  color: string;
};

/**
 * Bilan d'un créneau : « ce que j'ai fait » (liste courte) et journal libre (plusieurs paragraphes possibles).
 * ref = « e:<idÉvénement> » pour un événement, « r:<idCréneau>:<lundi> » pour une occurrence de routine.
 */
export type JournalEntry = { ref: string; items: string[]; notes?: string };

/** Pas d'arrondi du décompte : 0 = minutes exactes. */
export type RoundingMin = 0 | 15 | 30;

/** Derniers choix de la fenêtre « Placer un créneau », repris par défaut au placement suivant. */
export type PlacementDefaults = { routineId: string; durationMin: number; kind: 'weekly' | 'once' };

export type PlanningSettings = {
  countRoundingMin: RoundingMin; // demi-heure par défaut : 25 min comptent 30, 50 min comptent 1 h
  lastPlacement?: PlacementDefaults;
};

export type Planning = {
  routines: Routine[];
  slots: RoutineSlot[];
  overrides: SlotOverride[];
  events: PlanningEvent[];
  journal: JournalEntry[];
  settings: PlanningSettings;
};

export const DEFAULT_SETTINGS: PlanningSettings = { countRoundingMin: 30 };

export const EMPTY_PLANNING: Planning = { routines: [], slots: [], overrides: [], events: [], journal: [], settings: DEFAULT_SETTINGS };

export const ROUNDING_OPTIONS: Array<{ value: RoundingMin; label: string }> = [
  { value: 0, label: 'Minutes exactes' },
  { value: 15, label: 'Quart d’heure supérieur' },
  { value: 30, label: 'Demi-heure supérieure' },
];

export const DAY_START_MIN = 7 * 60;
export const DAY_END_MIN = 22 * 60;
export const WEEKDAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
// couleurs du style acidulé ; les routines existantes gardent la couleur enregistrée
export const ROUTINE_COLORS = ['#c8f560', '#ff5fa2', '#3ee0c6', '#ffe45c', '#ff8a3d', '#7c5cff', '#4dabf7', '#2fbf71'];
export const EVENT_COLORS = ['#b197fc', '#4dabf7', '#ff8a3d', '#3ee0c6', '#ff5fa2', '#ffe45c'];

/** Durée de conservation des semaines passées (événements, bilans, créneaux terminés). */
export const RETENTION_WEEKS = 52;
export const EVENT_TITLE_MAX = 80;
export const JOURNAL_ITEM_MAX = 200;
export const JOURNAL_MAX_ITEMS = 30;
/** Journal libre d'un créneau, et total pour tout le planning (le document Redis doit rester léger). */
export const JOURNAL_NOTES_MAX = 10000;
export const JOURNAL_NOTES_TOTAL_MAX = 600000;

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

/** Date et minute courantes à Paris (pour savoir si un créneau est terminé). */
export function nowInParis(now: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return { date: todayInParis(now), minutes: h * 60 + m };
}

/** Premier lundi encore conservé : les semaines antérieures sont effacées. */
export function retentionStart(today: string, weeks: number = RETENTION_WEEKS): string {
  return addDays(weekStartOf(today), -7 * weeks);
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

/** Arrondi au pas supérieur ; un pas de 0 laisse la valeur exacte. */
export function roundUp(min: number, step: number): number {
  return step > 0 ? Math.ceil(min / step) * step : min;
}

/* ======================= intervalles ======================= */

export function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/** Portions de [start, end[ couvertes par des intervalles, fusionnées quand elles se touchent ou se chevauchent. */
export function coveredSegments(start: number, end: number, intervals: Array<[number, number]>): Array<[number, number]> {
  const clipped = intervals
    .map(([s, e]) => [Math.max(s, start), Math.min(e, end)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const segments: Array<[number, number]> = [];
  for (const [s, e] of clipped) {
    const last = segments[segments.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else segments.push([s, e]);
  }
  return segments;
}

/** Minutes de [start, end[ couvertes par des intervalles, sans compter deux fois un recouvrement. */
export function coveredMinutes(start: number, end: number, intervals: Array<[number, number]>): number {
  return coveredSegments(start, end, intervals).reduce((t, [s, e]) => t + e - s, 0);
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
  overlapMin: number; // minutes exactes recouvertes par un cours
  displacedMin: number; // minutes retirées du décompte (arrondies si l'option est active)
  countedMin: number; // minutes qui comptent dans le quota
};

export function occurrencesForWeek(weekStart: string, planning: Planning, lessons: Lesson[]): Occurrence[] {
  const dates = weekDates(weekStart);
  const weekEnd = dates[6];
  const step = planning.settings?.countRoundingMin ?? DEFAULT_SETTINGS.countRoundingMin;
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
    const segments = coveredSegments(startMin, endMin, dayLessons);
    const overlapMin = segments.reduce((t, [s, e]) => t + e - s, 0);
    // avec arrondi : chaque cours retire son temps arrondi (25 → 30, 50 → 60), jamais plus que le créneau
    const countedDuration = roundUp(durationMin, step);
    const displacedMin = Math.min(countedDuration, segments.reduce((t, [s, e]) => t + roundUp(e - s, step), 0));
    result.push({
      slotId: slot.id, routineId: slot.routineId, kind: slot.kind, weekStart,
      date, startMin, durationMin, endMin, moved,
      overlapMin, displacedMin, countedMin: countedDuration - displacedMin,
    });
  }
  return result.sort(byDateThenStart);
}

/* ======================= événements et bilans ======================= */

export function eventsForWeek(weekStart: string, planning: Planning): PlanningEvent[] {
  const dates = weekDates(weekStart);
  return (planning.events ?? []).filter((e) => dates.includes(e.date)).sort(byDateThenStart);
}

export const eventRef = (eventId: string) => `e:${eventId}`;
export const occurrenceRef = (o: { slotId: string; weekStart: string }) => `r:${o.slotId}:${o.weekStart}`;

type ParsedRef = { kind: 'e'; eventId: string } | { kind: 'r'; slotId: string; weekStart: string };

export function parseRef(ref: unknown): ParsedRef | null {
  if (typeof ref !== 'string') return null;
  const e = /^e:([A-Za-z0-9_-]{1,64})$/.exec(ref);
  if (e) return { kind: 'e', eventId: e[1] };
  const r = /^r:([A-Za-z0-9_-]{1,64}):(\d{4}-\d{2}-\d{2})$/.exec(ref);
  if (r && isDateKey(r[2]) && isoWeekday(r[2]) === 1) return { kind: 'r', slotId: r[1], weekStart: r[2] };
  return null;
}

/** Ce qui a été noté pour un créneau (liste vide s'il n'y a rien). */
export function journalItems(planning: Planning, ref: string): string[] {
  return (planning.journal ?? []).find((j) => j.ref === ref)?.items ?? [];
}

/** Journal libre d'un créneau (chaîne vide s'il n'y a rien). */
export function journalNotes(planning: Planning, ref: string): string {
  return (planning.journal ?? []).find((j) => j.ref === ref)?.notes ?? '';
}

/** Fins de ligne unifiées, espaces de fin retirés, au plus une ligne vide entre deux paragraphes. */
export function normalizeNotes(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Remplace le bilan d'un créneau. `notes` absent : le journal existant est conservé.
 * Liste et journal vides : le bilan est effacé.
 */
export function setJournal(p: Planning, ref: string, items: string[], notes?: string): Planning {
  const clean = items.map((s) => s.trim()).filter(Boolean);
  const previous = (p.journal ?? []).find((j) => j.ref === ref);
  const text = normalizeNotes(notes ?? previous?.notes ?? '');
  const others = (p.journal ?? []).filter((j) => j.ref !== ref);
  if (!clean.length && !text) return { ...p, journal: others };
  const entry: JournalEntry = { ref, items: clean };
  if (text) entry.notes = text;
  return { ...p, journal: [...others, entry] };
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

/** Retire les bilans de créneaux de routine qui vérifient le prédicat. */
const withoutSlotJournal = (journal: JournalEntry[] | undefined, match: (slotId: string, weekStart: string) => boolean) =>
  (journal ?? []).filter((j) => {
    const r = parseRef(j.ref);
    return !(r?.kind === 'r' && match(r.slotId, r.weekStart));
  });

export function addRoutine(p: Planning, input: Omit<Routine, 'id'>, id: string = newId()): Planning {
  return { ...p, routines: [...p.routines, { id, ...input }] };
}

export function updateRoutine(p: Planning, id: string, patch: Partial<Omit<Routine, 'id'>>): Planning {
  return { ...p, routines: p.routines.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
}

/** Supprime la routine, tous ses créneaux, leurs exceptions et leurs bilans. */
export function deleteRoutine(p: Planning, id: string): Planning {
  const slotIds = new Set(p.slots.filter((s) => s.routineId === id).map((s) => s.id));
  return {
    ...p,
    routines: p.routines.filter((r) => r.id !== id),
    slots: p.slots.filter((s) => s.routineId !== id),
    overrides: p.overrides.filter((o) => !slotIds.has(o.slotId)),
    journal: withoutSlotJournal(p.journal, (slotId) => slotIds.has(slotId)),
  };
}

export function setRounding(p: Planning, roundingMin: RoundingMin): Planning {
  return { ...p, settings: { ...(p.settings ?? DEFAULT_SETTINGS), countRoundingMin: roundingMin } };
}

export type SlotInput = { routineId: string; kind: 'weekly' | 'once'; date: string; startMin: number; durationMin: number };

export function addSlot(p: Planning, input: SlotInput, id: string = newId()): Planning {
  const base = { id, routineId: input.routineId, kind: input.kind, startMin: input.startMin, durationMin: input.durationMin };
  const slot: RoutineSlot = input.kind === 'weekly'
    ? { ...base, weekday: isoWeekday(input.date), validFrom: weekStartOf(input.date) }
    : { ...base, date: input.date };
  const lastPlacement: PlacementDefaults = { routineId: input.routineId, durationMin: input.durationMin, kind: input.kind };
  return { ...p, slots: [...p.slots, slot], settings: { ...(p.settings ?? DEFAULT_SETTINGS), lastPlacement } };
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
  // sinon on scinde : les semaines passées gardent l'ancien horaire ; les bilans de cette semaine et des suivantes suivent la nouvelle série
  const ended: RoutineSlot = { ...slot, validUntil: addDays(ref.weekStart, -1) };
  const continued: RoutineSlot = { ...slot, ...changed, id: newId(), validFrom: ref.weekStart };
  const journal = (p.journal ?? []).map((j) => {
    const r = parseRef(j.ref);
    return r?.kind === 'r' && r.slotId === slot.id && r.weekStart >= ref.weekStart
      ? { ...j, ref: occurrenceRef({ slotId: continued.id, weekStart: r.weekStart }) }
      : j;
  });
  return { ...p, overrides, journal, slots: [...p.slots.map((s) => (s.id === slot.id ? ended : s)), continued] };
}

export function deleteOccurrence(p: Planning, ref: OccurrenceRef, scope: Scope): Planning {
  const slot = p.slots.find((s) => s.id === ref.slotId);
  if (!slot) return p;

  const removeSlot = (): Planning => ({
    ...p,
    slots: p.slots.filter((s) => s.id !== slot.id),
    overrides: p.overrides.filter((o) => o.slotId !== slot.id),
    journal: withoutSlotJournal(p.journal, (slotId) => slotId === slot.id),
  });

  if (slot.kind === 'once') return removeSlot();

  if (scope === 'this') {
    const others = p.overrides.filter((o) => !(o.slotId === slot.id && o.weekStart === ref.weekStart));
    return {
      ...p,
      overrides: [...others, { slotId: slot.id, weekStart: ref.weekStart, action: 'delete' }],
      journal: withoutSlotJournal(p.journal, (slotId, week) => slotId === slot.id && week === ref.weekStart),
    };
  }

  if (slot.validFrom && slot.validFrom >= ref.weekStart) return removeSlot();
  return {
    ...p,
    overrides: withoutFutureOverrides(p.overrides, slot.id, ref.weekStart),
    slots: p.slots.map((s) => (s.id === slot.id ? { ...s, validUntil: addDays(ref.weekStart, -1) } : s)),
    journal: withoutSlotJournal(p.journal, (slotId, week) => slotId === slot.id && week >= ref.weekStart),
  };
}

export type EventInput = Omit<PlanningEvent, 'id'>;

export function addEvent(p: Planning, input: EventInput, id: string = newId()): Planning {
  return { ...p, events: [...(p.events ?? []), { id, ...input }] };
}

export function updateEvent(p: Planning, id: string, patch: Partial<EventInput>): Planning {
  return { ...p, events: (p.events ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

/** Supprime l'événement et son bilan. */
export function deleteEvent(p: Planning, id: string): Planning {
  return {
    ...p,
    events: (p.events ?? []).filter((e) => e.id !== id),
    journal: (p.journal ?? []).filter((j) => j.ref !== eventRef(id)),
  };
}

/**
 * Efface ce qui est antérieur à la période de conservation : événements, bilans, exceptions,
 * créneaux ponctuels passés et séries terminées. Les semaines conservées s'affichent à l'identique.
 */
export function pruneOld(p: Planning, today: string, weeks: number = RETENTION_WEEKS): Planning {
  const cutoff = retentionStart(today, weeks);
  const slots = p.slots.filter((s) => (s.kind === 'once' ? (s.date ?? '') >= cutoff : !(s.validUntil && s.validUntil < cutoff)));
  const slotIds = new Set(slots.map((s) => s.id));
  const events = (p.events ?? []).filter((e) => e.date >= cutoff);
  const eventIds = new Set(events.map((e) => e.id));
  const overrides = p.overrides.filter((o) => slotIds.has(o.slotId) && o.weekStart >= cutoff);
  const journal = (p.journal ?? []).filter((j) => {
    const r = parseRef(j.ref);
    if (!r) return false;
    return r.kind === 'e' ? eventIds.has(r.eventId) : slotIds.has(r.slotId) && r.weekStart >= cutoff;
  });
  return { ...p, slots, overrides, events, journal };
}

/* ======================= validation (API) ======================= */

type Result = { ok: true; planning: Planning } | { ok: false; error: string };

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
const fitsInDay = (start: number, duration: number) => start + duration <= 24 * 60;

/** Contrôle strict avant écriture ; ne conserve que les champs connus. */
export function validatePlanning(raw: unknown): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Planning absent.' };
  const src = raw as Record<string, unknown>;
  const routinesIn = src.routines ?? [];
  const slotsIn = src.slots ?? [];
  const overridesIn = src.overrides ?? [];
  const eventsIn = src.events ?? [];
  const journalIn = src.journal ?? [];
  if (!Array.isArray(routinesIn) || !Array.isArray(slotsIn) || !Array.isArray(overridesIn) || !Array.isArray(eventsIn) || !Array.isArray(journalIn)) {
    return { ok: false, error: 'Structure invalide.' };
  }
  if (routinesIn.length > 100 || slotsIn.length > 3000 || overridesIn.length > 10000 || eventsIn.length > 3000 || journalIn.length > 6000) {
    return { ok: false, error: 'Trop d’éléments.' };
  }

  const settingsIn = (src.settings && typeof src.settings === 'object' ? src.settings : {}) as Record<string, unknown>;
  // « countRoundingMin » remplace l'ancien « roundingMin », enregistré à 0 sans choix explicite : ce dernier est ignoré
  const countRoundingMin = settingsIn.countRoundingMin ?? DEFAULT_SETTINGS.countRoundingMin;
  if (countRoundingMin !== 0 && countRoundingMin !== 15 && countRoundingMin !== 30) return { ok: false, error: 'Arrondi du décompte invalide.' };

  const routines: Routine[] = [];
  for (const r of routinesIn as Record<string, unknown>[]) {
    const name = typeof r?.name === 'string' ? r.name.trim() : '';
    if (!isId(r?.id) || !name || name.length > 60) return { ok: false, error: 'Routine invalide : nom manquant ou trop long.' };
    if (!isColor(r.color)) return { ok: false, error: `Couleur invalide pour « ${name} ».` };
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
  const slotIds = new Set(slots.map((s) => s.id));
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

  const events: PlanningEvent[] = [];
  for (const e of eventsIn as Record<string, unknown>[]) {
    const title = typeof e?.title === 'string' ? e.title.trim() : '';
    if (!isId(e?.id) || events.some((x) => x.id === e.id)) return { ok: false, error: 'Identifiant d’événement invalide.' };
    if (!title || title.length > EVENT_TITLE_MAX) return { ok: false, error: 'Événement invalide : titre manquant ou trop long.' };
    if (!isColor(e.color)) return { ok: false, error: `Couleur invalide pour « ${title} ».` };
    if (!isDateKey(e.date) || !isInt(e.startMin, 0, 24 * 60 - 1) || !isInt(e.durationMin, 5, 24 * 60) || !fitsInDay(e.startMin, e.durationMin)) {
      return { ok: false, error: `Horaire invalide pour « ${title} ».` };
    }
    events.push({ id: e.id, title, date: e.date, startMin: e.startMin, durationMin: e.durationMin, color: e.color });
  }
  const eventIds = new Set(events.map((e) => e.id));

  const journal: JournalEntry[] = [];
  let totalNotes = 0;
  for (const j of journalIn as Record<string, unknown>[]) {
    const ref = parseRef(j?.ref);
    const itemsIn = j?.items ?? [];
    if (!ref || !Array.isArray(itemsIn)) return { ok: false, error: 'Bilan invalide.' };
    if (itemsIn.length > JOURNAL_MAX_ITEMS) return { ok: false, error: `Bilan trop long (${JOURNAL_MAX_ITEMS} lignes au plus).` };
    const items: string[] = [];
    for (const item of itemsIn) {
      if (typeof item !== 'string') return { ok: false, error: 'Bilan invalide.' };
      const text = item.trim();
      if (text.length > JOURNAL_ITEM_MAX) return { ok: false, error: `Ligne de bilan trop longue (${JOURNAL_ITEM_MAX} caractères au plus).` };
      if (text) items.push(text);
    }
    if (j.notes !== undefined && typeof j.notes !== 'string') return { ok: false, error: 'Journal invalide.' };
    const notes = normalizeNotes((j.notes as string | undefined) ?? '');
    if (notes.length > JOURNAL_NOTES_MAX) return { ok: false, error: `Journal trop long (${JOURNAL_NOTES_MAX.toLocaleString('fr-FR')} caractères au plus par créneau).` };
    // bilan d'un créneau ou d'un événement disparu, ou vide : simplement ignoré
    const alive = ref.kind === 'e' ? eventIds.has(ref.eventId) : slotIds.has(ref.slotId);
    if (!alive || (items.length === 0 && !notes)) continue;
    if (journal.some((x) => x.ref === j.ref)) return { ok: false, error: 'Bilan en double pour un même créneau.' };
    totalNotes += notes.length;
    if (totalNotes > JOURNAL_NOTES_TOTAL_MAX) {
      return { ok: false, error: 'Le journal a atteint sa taille maximale : raccourcissez d’anciennes notes avant d’en ajouter.' };
    }
    const entry: JournalEntry = { ref: j.ref as string, items };
    if (notes) entry.notes = notes;
    journal.push(entry);
  }

  const settings: PlanningSettings = { countRoundingMin };
  const lp = settingsIn.lastPlacement as Record<string, unknown> | undefined;
  // simple préférence : ignorée si elle ne correspond plus à rien (routine supprimée, par exemple)
  if (lp && typeof lp === 'object' && routineIds.has(lp.routineId as string) && isInt(lp.durationMin, 5, 24 * 60) && (lp.kind === 'weekly' || lp.kind === 'once')) {
    settings.lastPlacement = { routineId: lp.routineId as string, durationMin: lp.durationMin as number, kind: lp.kind };
  }
  return { ok: true, planning: { routines, slots, overrides, events, journal, settings } };
}
