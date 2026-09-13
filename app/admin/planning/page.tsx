'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { EMPTY_SCHEDULE, withDefaults } from '@/lib/schedule';
import type { Schedule } from '@/lib/schedule';
import {
  DAY_END_MIN, DAY_START_MIN, EMPTY_PLANNING, ROUNDING_OPTIONS, ROUTINE_COLORS, WEEKDAY_NAMES,
  addDays, addRoutine, addSlot, deleteOccurrence, deleteRoutine, fmtDuration, fmtTime,
  lessonsForWeek, occurrencesForWeek, setRounding, todayInParis, updateOccurrence, updateRoutine,
  weekDates, weekStartOf, weeklyQuotas,
} from '@/lib/planning';
import type { Lesson, Occurrence, Planning, PreplyBusy, Routine, RoundingMin, Scope } from '@/lib/planning';

/* ======================= réglages ======================= */

const K = 1.1; // pixels par minute à l'écran (réduit à l'impression)
const DURATIONS = [25, 50, 60];

type Dialog =
  | { type: 'place'; date: string; startMin: number }
  | { type: 'edit'; occ: Occurrence; durationMin?: number }
  | { type: 'routine'; routine?: Routine }
  | null;

/* ======================= utilitaires d'affichage ======================= */

const cssVars = (vars: Record<string, number | string>) => vars as CSSProperties;

/** « 30 min déplacées », « 1 h 30 déplacée », « 2 h déplacées ». */
const plural = (min: number) => ((min > 1 && min < 60) || min >= 120 ? 's' : '');

function formatLongDate(date: string, withYear: boolean): string {
  const text = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
  }).format(new Date(date + 'T00:00:00Z'));
  return text.replace(/^1(?=\s)/, '1er');
}

function weekLabel(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  const sameYear = weekStart.slice(0, 4) === end.slice(0, 4);
  const start = sameMonth
    ? (Number(weekStart.slice(8)) === 1 ? '1er' : String(Number(weekStart.slice(8))))
    : formatLongDate(weekStart, !sameYear);
  return `Semaine du ${start} au ${formatLongDate(end, true)}`;
}

const shortDay = (date: string) => `${WEEKDAY_NAMES[(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7].slice(0, 3)} ${Number(date.slice(8))}`;

const toMinutes = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN;
};

/** Texte foncé sur les couleurs claires (l'or, par exemple), blanc sinon. */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0d2b45' : '#ffffff';
}

/** Répartit en colonnes les routines qui se chevauchent entre elles. */
function laneLayout(occurrences: Occurrence[]): Map<Occurrence, { lane: number; lanes: number }> {
  const result = new Map<Occurrence, { lane: number; lanes: number }>();
  const sorted = [...occurrences].sort((a, b) => a.startMin - b.startMin);
  let cluster: Occurrence[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned = cluster.map((o) => {
      let lane = laneEnds.findIndex((end) => end <= o.startMin);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = o.endMin;
      return { o, lane };
    });
    assigned.forEach(({ o, lane }) => result.set(o, { lane, lanes: laneEnds.length }));
  };
  for (const o of sorted) {
    if (cluster.length && o.startMin >= clusterEnd) { flush(); cluster = []; clusterEnd = -1; }
    cluster.push(o);
    clusterEnd = Math.max(clusterEnd, o.endMin);
  }
  if (cluster.length) flush();
  return result;
}

/* ======================= page ======================= */

export default function PlanningPersonnel() {
  const today = todayInParis();
  const currentWeek = weekStartOf(today);

  const [weekStart, setWeekStart] = useState(currentWeek);
  const [planning, setPlanning] = useState<Planning>(EMPTY_PLANNING);
  const [schedule, setSchedule] = useState<Schedule>(EMPTY_SCHEDULE);
  const [preply, setPreply] = useState<PreplyBusy[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [mobileDay, setMobileDay] = useState(() => Math.max(0, weekDates(currentWeek).indexOf(today)));
  const [resize, setResize] = useState<{ occ: Occurrence; startY: number; durationMin: number } | null>(null);

  /* ---------- chargement ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const notes: string[] = [];
      const [planningRes, scheduleRes, preplyRes] = await Promise.allSettled([
        fetch('/api/admin/planning', { cache: 'no-store' }),
        fetch('/api/admin/schedule', { cache: 'no-store' }),
        fetch('/api/preply-busy'),
      ]);
      if (cancelled) return;

      if (planningRes.status === 'fulfilled' && planningRes.value.ok) {
        setPlanning(await planningRes.value.json());
      } else {
        setFatal('Impossible de charger les routines. Rechargez la page.');
      }
      if (scheduleRes.status === 'fulfilled' && scheduleRes.value.ok) {
        setSchedule(withDefaults(await scheduleRes.value.json()));
      } else {
        notes.push('Les cours de /admin/schedule n’ont pas pu être chargés : ils n’apparaissent pas.');
      }
      if (preplyRes.status === 'fulfilled' && preplyRes.value.ok) {
        const data = await preplyRes.value.json();
        if (Array.isArray(data)) setPreply(data);
      } else {
        notes.push('Le calendrier Preply n’a pas pu être chargé : ses créneaux n’apparaissent pas.');
      }
      if (!cancelled) { setWarnings(notes); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ---------- enregistrement (optimiste, annulé en cas d'échec) ---------- */
  async function persist(next: Planning) {
    const previous = planning;
    setPlanning(next);
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/admin/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planning: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Enregistrement refusé.');
      setPlanning(data.planning);
    } catch (e) {
      setPlanning(previous);
      setSaveError(e instanceof Error ? e.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  /* ---------- calculs de la semaine ---------- */
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const lessons = useMemo(() => lessonsForWeek(weekStart, schedule, preply), [weekStart, schedule, preply]);
  const occurrences = useMemo(() => occurrencesForWeek(weekStart, planning, lessons), [weekStart, planning, lessons]);
  const quotas = useMemo(() => weeklyQuotas(planning, occurrences), [planning, occurrences]);
  const routineById = useMemo(() => new Map(planning.routines.map((r) => [r.id, r])), [planning.routines]);
  const rounding = planning.settings?.roundingMin ?? 0;

  /* ---------- clavier : Échap ferme la fenêtre ---------- */
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDialog(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const goToWeek = (ws: string) => {
    setWeekStart(ws);
    const idx = weekDates(ws).indexOf(today);
    setMobileDay(idx >= 0 ? idx : 0);
  };

  /* ---------- interactions sur la grille ---------- */
  function onColumnClick(e: ReactMouseEvent<HTMLDivElement>, date: string) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minute = DAY_START_MIN + (e.clientY - rect.top) / K;
    const startMin = Math.min(DAY_END_MIN - 30, Math.max(DAY_START_MIN, Math.floor(minute / 30) * 30));
    setDialog({ type: 'place', date, startMin });
  }

  function onResizeStart(e: ReactPointerEvent<HTMLDivElement>, occ: Occurrence) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setResize({ occ, startY: e.clientY, durationMin: occ.durationMin });
  }
  function onResizeMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!resize) return;
    const raw = resize.occ.durationMin + (e.clientY - resize.startY) / K;
    const durationMin = Math.max(5, Math.min(24 * 60 - resize.occ.startMin, Math.round(raw / 5) * 5));
    if (durationMin !== resize.durationMin) setResize({ ...resize, durationMin });
  }
  function onResizeEnd() {
    if (!resize) return;
    const { occ, durationMin } = resize;
    setResize(null);
    if (durationMin === occ.durationMin) return;
    if (occ.kind === 'once') {
      persist(updateOccurrence(planning, occ, { date: occ.date, startMin: occ.startMin, durationMin }, 'this'));
    } else {
      setDialog({ type: 'edit', occ, durationMin }); // un créneau hebdomadaire demande la portée
    }
  }

  /* ---------- rendu ---------- */
  if (loading) return <div className="pp"><style>{CSS}</style><p className="pp-etat">Chargement du planning…</p></div>;

  const isCurrentWeek = weekStart === currentWeek;
  const label = weekLabel(weekStart);

  return (
    <div className="pp">
      <style>{CSS}</style>

      <header className="pp-barre">
        <h1>Planning personnel</h1>
        <div className="pp-semaine">
          <button className="pp-fleche" onClick={() => goToWeek(addDays(weekStart, -7))} aria-label="Semaine précédente">‹</button>
          <span className="pp-titre-semaine">{label}</span>
          <button className="pp-fleche" onClick={() => goToWeek(addDays(weekStart, 7))} aria-label="Semaine suivante">›</button>
        </div>
        <button className="pp-btn" onClick={() => goToWeek(currentWeek)} disabled={isCurrentWeek}>Semaine courante</button>
        <button className="pp-btn pp-or" onClick={() => setDialog({ type: 'routine' })}>+ Routine</button>
        <button className="pp-btn pp-plein" onClick={() => window.print()}>Exporter en PDF</button>
      </header>
      <div className="pp-filet" />

      <div className="pp-impression-titre">
        <strong>French with Alban</strong> · Planning personnel · {label}
      </div>

      {(fatal || saveError || warnings.length > 0 || saving) && (
        <div className="pp-messages">
          {fatal && <p className="pp-erreur">{fatal}</p>}
          {saveError && <p className="pp-erreur">{saveError} Vos dernières modifications ont été annulées.</p>}
          {warnings.map((w) => <p key={w} className="pp-avert">{w}</p>)}
          {saving && <p className="pp-info">Enregistrement…</p>}
        </div>
      )}

      <div className="pp-corps">
        {/* ---------- grille (ordinateur et impression) ---------- */}
        <div className="pp-grille-zone">
          <div className="pp-entetes">
            <div />
            {dates.map((d) => (
              <div key={d} className={d === today ? 'pp-auj' : ''}>
                {WEEKDAY_NAMES[dates.indexOf(d)].slice(0, 3)}<b>{Number(d.slice(8))}</b>
              </div>
            ))}
          </div>
          <div className="pp-grille" style={cssVars({ '--k': K, '--total': DAY_END_MIN - DAY_START_MIN })}>
            <div className="pp-heures">
              {Array.from({ length: (DAY_END_MIN - DAY_START_MIN) / 60 + 1 }, (_, i) => (
                <span key={i} style={cssVars({ '--s': i * 60 })}>{7 + i}h</span>
              ))}
            </div>
            {dates.map((date) => (
              <DayColumn
                key={date}
                date={date}
                isToday={date === today}
                lessons={lessons.filter((l) => l.date === date)}
                occurrences={occurrences.filter((o) => o.date === date)}
                routineById={routineById}
                resize={resize}
                onColumnClick={onColumnClick}
                onEdit={(occ) => setDialog({ type: 'edit', occ })}
                onResizeStart={onResizeStart}
                onResizeMove={onResizeMove}
                onResizeEnd={onResizeEnd}
              />
            ))}
          </div>
        </div>

        {/* ---------- liste par jour (mobile) ---------- */}
        <div className="pp-mobile">
          <div className="pp-jours" role="tablist">
            {dates.map((d, i) => (
              <button key={d} role="tab" aria-selected={i === mobileDay}
                className={`${i === mobileDay ? 'pp-on' : ''} ${d === today ? 'pp-auj' : ''}`}
                onClick={() => setMobileDay(i)}>
                {WEEKDAY_NAMES[i].slice(0, 3)}<b>{Number(d.slice(8))}</b>
              </button>
            ))}
          </div>
          <MobileDay
            date={dates[mobileDay]}
            lessons={lessons.filter((l) => l.date === dates[mobileDay])}
            occurrences={occurrences.filter((o) => o.date === dates[mobileDay])}
            routineById={routineById}
            onEdit={(occ) => setDialog({ type: 'edit', occ })}
          />
          <button className="pp-fab" aria-label="Placer un créneau"
            onClick={() => setDialog({ type: 'place', date: dates[mobileDay], startMin: 9 * 60 })}>+</button>
        </div>

        {/* ---------- quotas ---------- */}
        <aside className="pp-panneau">
          <h2>Quotas de la semaine</h2>
          <p className="pp-sous">Remis à zéro chaque lundi. Les minutes couvertes par un cours ne comptent pas.</p>
          <label className="pp-arrondi">
            <span>Arrondi du décompte</span>
            <select className="pp-inp" value={rounding}
              onChange={(e) => persist(setRounding(planning, Number(e.target.value) as RoundingMin))}>
              {ROUNDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {rounding > 0 && <small>Ex. {fmtDuration(25)} → {fmtDuration(Math.ceil(25 / rounding) * rounding)}, {fmtDuration(50)} → {fmtDuration(Math.ceil(50 / rounding) * rounding)}. La grille garde les horaires exacts.</small>}
          </label>
          {rounding > 0 && (
            <p className="pp-arrondi-impression">Décompte arrondi {rounding === 30 ? 'à la demi-heure' : 'au quart d’heure'} supérieur{rounding === 30 ? 'e' : ''}.</p>
          )}
          {planning.routines.length === 0 && (
            <p className="pp-vide">Aucune routine pour l’instant. Créez-en une avec « + Routine ».</p>
          )}
          {quotas.map((q) => {
            const r = routineById.get(q.routineId)!;
            const pct = q.quotaMin ? Math.min(100, (q.placedMin / q.quotaMin) * 100) : q.placedMin ? 100 : 0;
            return (
              <div key={r.id} className="pp-quota">
                <div className="pp-quota-tete">
                  <span className="pp-pastille-couleur" style={{ background: r.color }} />
                  <span className="pp-quota-nom">{r.name}</span>
                  <span className="pp-quota-obj">{fmtDuration(q.quotaMin)}</span>
                  <button className="pp-crayon" onClick={() => setDialog({ type: 'routine', routine: r })} aria-label={`Modifier ${r.name}`}>✎</button>
                </div>
                <div className="pp-jauge"><i style={{ width: `${pct}%`, background: q.overMin ? '#c0392b' : r.color }} /></div>
                <div className="pp-chiffres">
                  <span>Placé {fmtDuration(q.placedMin)}</span>
                  {q.overMin
                    ? <span className="pp-depasse">Dépassement +{fmtDuration(q.overMin)}</span>
                    : <span className="pp-reste">Reste {fmtDuration(q.remainingMin)}</span>}
                </div>
                {q.displacedMin > 0 && (
                  <div className="pp-deplace">dont {fmtDuration(q.displacedMin)} déplacée{plural(q.displacedMin)} par un cours</div>
                )}
              </div>
            );
          })}
          <div className="pp-legende">
            <span><i style={{ background: '#0d2b45' }} />Cours (lecture seule)</span>
            <span><i style={{ background: '#0d2b45', boxShadow: 'inset 0 -4px 0 #c9972a' }} />Créneau occupé Preply</span>
            <span><i style={{ background: '#3f7d5c' }} />↻ routine hebdomadaire · sans ↻ : ponctuelle</span>
            <span><i className="pp-legende-conflit" />Routine écrasée par un cours</span>
          </div>
        </aside>
      </div>

      {dialog?.type === 'place' && (
        <PlaceDialog
          dates={dates}
          initialDate={dialog.date}
          initialStart={dialog.startMin}
          routines={planning.routines}
          onCreateRoutine={() => setDialog({ type: 'routine' })}
          onCancel={() => setDialog(null)}
          onSubmit={(input) => { setDialog(null); persist(addSlot(planning, input)); }}
        />
      )}
      {dialog?.type === 'edit' && (
        <EditDialog
          dates={dates}
          occ={dialog.occ}
          initialDuration={dialog.durationMin}
          routine={routineById.get(dialog.occ.routineId)}
          onCancel={() => setDialog(null)}
          onSave={(values, scope) => { setDialog(null); persist(updateOccurrence(planning, dialog.occ, values, scope)); }}
          onDelete={(scope) => { setDialog(null); persist(deleteOccurrence(planning, dialog.occ, scope)); }}
        />
      )}
      {dialog?.type === 'routine' && (
        <RoutineDialog
          routine={dialog.routine}
          slotCount={dialog.routine ? planning.slots.filter((s) => s.routineId === dialog.routine!.id).length : 0}
          usedColors={planning.routines.map((r) => r.color)}
          onCancel={() => setDialog(null)}
          onSave={(values) => {
            setDialog(null);
            persist(dialog.routine ? updateRoutine(planning, dialog.routine.id, values) : addRoutine(planning, values));
          }}
          onDelete={() => { setDialog(null); if (dialog.routine) persist(deleteRoutine(planning, dialog.routine.id)); }}
        />
      )}
    </div>
  );
}

/* ======================= colonne d'un jour ======================= */

function DayColumn(props: {
  date: string;
  isToday: boolean;
  lessons: Lesson[];
  occurrences: Occurrence[];
  routineById: Map<string, Routine>;
  resize: { occ: Occurrence; durationMin: number } | null;
  onColumnClick: (e: ReactMouseEvent<HTMLDivElement>, date: string) => void;
  onEdit: (occ: Occurrence) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>, occ: Occurrence) => void;
  onResizeMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeEnd: () => void;
}) {
  const { date, lessons, occurrences, routineById, resize } = props;
  const lanes = laneLayout(occurrences);

  // position dans la fenêtre 7h–22h ; ce qui déborde est coupé et signalé
  const place = (start: number, end: number) => {
    const s = Math.max(start, DAY_START_MIN);
    const e = Math.min(end, DAY_END_MIN);
    return { visible: e > s, top: s - DAY_START_MIN, height: e - s, cutTop: start < DAY_START_MIN, cutBottom: end > DAY_END_MIN };
  };

  return (
    <div className={`pp-jour ${props.isToday ? 'pp-auj' : ''}`} onClick={(e) => props.onColumnClick(e, date)}>
      {occurrences.map((o) => {
        const r = routineById.get(o.routineId);
        if (!r) return null;
        const duration = resize && resize.occ.slotId === o.slotId && resize.occ.date === o.date ? resize.durationMin : o.durationMin;
        const pos = place(o.startMin, o.startMin + duration);
        if (!pos.visible) return null;
        const lane = lanes.get(o) ?? { lane: 0, lanes: 1 };
        const conflict = o.displacedMin > 0;
        return (
          <div key={`${o.slotId}-${o.date}`}>
            <div
              className={`pp-bloc pp-routine ${conflict ? 'pp-conflit' : ''}`}
              style={{
                ...cssVars({ '--s': pos.top, '--d': pos.height, '--lane': lane.lane, '--lanes': lane.lanes }),
                background: r.color, color: textOn(r.color),
              }}
              title={`${r.name} · ${fmtTime(o.startMin)}–${fmtTime(o.startMin + duration)}${conflict ? ` · ${fmtDuration(o.displacedMin)} écrasées par un cours` : ''}`}
              onClick={(e) => { e.stopPropagation(); props.onEdit(o); }}
            >
              {pos.cutTop && <span className="pp-coupe">↑ {fmtTime(o.startMin)}</span>}
              <div className="pp-nom">{o.kind === 'weekly' ? '↻ ' : ''}{r.name}</div>
              <div className="pp-heure">{fmtTime(o.startMin)}–{fmtTime(o.startMin + duration)}</div>
              {pos.cutBottom && <span className="pp-coupe pp-coupe-bas">↓ {fmtTime(o.startMin + duration)}</span>}
              <div
                className="pp-poignee"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => props.onResizeStart(e, o)}
                onPointerMove={props.onResizeMove}
                onPointerUp={props.onResizeEnd}
                onPointerCancel={props.onResizeEnd}
              />
            </div>
            {conflict && (
              <div className="pp-badge" style={cssVars({ '--s': pos.top, '--lane': lane.lane, '--lanes': lane.lanes })}>
                ⚠ −{fmtDuration(o.displacedMin)}
              </div>
            )}
          </div>
        );
      })}
      {lessons.map((l) => {
        const pos = place(l.startMin, l.endMin);
        if (!pos.visible) return null;
        const overRoutine = occurrences.some((o) => Math.min(o.endMin, l.endMin) > Math.max(o.startMin, l.startMin));
        return (
          <div
            key={`${l.source}-${l.startMin}-${l.label}`}
            className={`pp-bloc pp-cours ${overRoutine ? 'pp-decale' : ''} ${l.source === 'preply' ? 'pp-preply' : ''}`}
            style={cssVars({ '--s': pos.top, '--d': pos.height })}
            title={`Cours · ${l.label} · ${fmtTime(l.startMin)}–${fmtTime(l.endMin)} (lecture seule)`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pp-nom">{l.source === 'preply' ? 'Occupé' : l.label}{l.source === 'preply' && <span className="pp-src">Preply</span>}</div>
            <div className="pp-heure">{fmtTime(l.startMin)}–{fmtTime(l.endMin)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ======================= liste mobile ======================= */

function MobileDay(props: {
  date: string;
  lessons: Lesson[];
  occurrences: Occurrence[];
  routineById: Map<string, Routine>;
  onEdit: (occ: Occurrence) => void;
}) {
  type Item = { start: number; key: string; node: React.ReactNode };
  const items: Item[] = [
    ...props.lessons.map((l) => ({
      start: l.startMin,
      key: `c-${l.source}-${l.startMin}`,
      node: (
        <div className="pp-item pp-item-cours">
          <div className="pp-item-h">{fmtTime(l.startMin)} – {fmtTime(l.endMin)}</div>
          <div><b>{l.source === 'preply' ? 'Occupé (Preply)' : l.label}</b><span>Cours · lecture seule</span></div>
        </div>
      ),
    })),
    ...props.occurrences.map((o) => {
      const r = props.routineById.get(o.routineId)!;
      return {
        start: o.startMin,
        key: `r-${o.slotId}`,
        node: (
          <button className={`pp-item ${o.displacedMin ? 'pp-item-conflit' : ''}`} style={{ borderLeftColor: r.color }} onClick={() => props.onEdit(o)}>
            <div className="pp-item-h">{fmtTime(o.startMin)} – {fmtTime(o.endMin)}</div>
            <div>
              <b>{o.kind === 'weekly' ? '↻ ' : ''}{r.name}</b>
              <span>{o.kind === 'weekly' ? 'Routine hebdomadaire' : 'Routine ponctuelle'}</span>
              {o.displacedMin > 0 && <em>⚠ {fmtDuration(o.displacedMin)} déplacée{plural(o.displacedMin)} par un cours</em>}
            </div>
          </button>
        ),
      };
    }),
  ].sort((a, b) => a.start - b.start);

  return (
    <div className="pp-liste">
      {items.length === 0 && <p className="pp-vide">Rien de prévu ce jour-là.</p>}
      {items.map((i) => <div key={i.key}>{i.node}</div>)}
    </div>
  );
}

/* ======================= fenêtres ======================= */

function DurationPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="pp-puces">
      {DURATIONS.map((d) => (
        <button type="button" key={d} className={`pp-puce ${value === d ? 'pp-on' : ''}`} onClick={() => onChange(d)}>{d} min</button>
      ))}
      <label className="pp-libre">
        <input type="number" min={5} max={1440} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Durée en minutes" /> min
      </label>
    </div>
  );
}

function validTiming(startMin: number, durationMin: number): string {
  if (!Number.isInteger(startMin) || startMin < 0 || startMin > 1439) return 'Heure de début invalide.';
  if (!Number.isInteger(durationMin) || durationMin < 5) return 'La durée doit être d’au moins 5 minutes.';
  if (startMin + durationMin > 24 * 60) return 'Le créneau ne peut pas dépasser minuit.';
  return '';
}

function Modal({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="pp-voile" onClick={onCancel}>
      <div className="pp-dlg" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function DaySelect({ dates, value, onChange }: { dates: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="pp-inp" value={value} onChange={(e) => onChange(e.target.value)}>
      {dates.map((d) => <option key={d} value={d}>{WEEKDAY_NAMES[dates.indexOf(d)]} {formatLongDate(d, false)}</option>)}
    </select>
  );
}

function PlaceDialog(props: {
  dates: string[];
  initialDate: string;
  initialStart: number;
  routines: Routine[];
  onCreateRoutine: () => void;
  onCancel: () => void;
  onSubmit: (input: { routineId: string; kind: 'weekly' | 'once'; date: string; startMin: number; durationMin: number }) => void;
}) {
  const [routineId, setRoutineId] = useState(props.routines[0]?.id ?? '');
  const [date, setDate] = useState(props.initialDate);
  const [start, setStart] = useState(fmtTime(props.initialStart));
  const [durationMin, setDurationMin] = useState(60);
  const [kind, setKind] = useState<'weekly' | 'once'>('once');

  if (props.routines.length === 0) {
    return (
      <Modal title="Placer un créneau" onCancel={props.onCancel}>
        <p className="pp-info-dlg">Créez d’abord une routine : un créneau appartient toujours à une routine.</p>
        <div className="pp-act">
          <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
          <button className="pp-btn pp-plein" onClick={props.onCreateRoutine}>Créer une routine</button>
        </div>
      </Modal>
    );
  }

  const startMin = toMinutes(start);
  const error = validTiming(startMin, durationMin);

  return (
    <Modal title="Placer un créneau" onCancel={props.onCancel}>
      <div className="pp-champ"><label>Routine</label>
        <select className="pp-inp" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
          {props.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="pp-champ"><label>Jour</label><DaySelect dates={props.dates} value={date} onChange={setDate} /></div>
      <div className="pp-deux">
        <div className="pp-champ"><label>Début</label><input className="pp-inp" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="pp-champ"><label>Fin</label><div className="pp-inp pp-lecture">{error ? '—' : fmtTime(startMin + durationMin)}</div></div>
      </div>
      <div className="pp-champ"><label>Durée</label><DurationPicker value={durationMin} onChange={setDurationMin} /></div>
      <div className="pp-champ"><label>Répétition</label>
        <label className="pp-radio"><input type="radio" checked={kind === 'once'} onChange={() => setKind('once')} /><span>Cette semaine seulement<small>Créneau ponctuel</small></span></label>
        <label className="pp-radio"><input type="radio" checked={kind === 'weekly'} onChange={() => setKind('weekly')} /><span>Chaque semaine<small>Reproduit à partir de cette semaine</small></span></label>
      </div>
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
        <button className="pp-btn pp-plein" disabled={!!error}
          onClick={() => props.onSubmit({ routineId, kind, date, startMin, durationMin })}>Placer</button>
      </div>
    </Modal>
  );
}

function EditDialog(props: {
  dates: string[];
  occ: Occurrence;
  initialDuration?: number;
  routine?: Routine;
  onCancel: () => void;
  onSave: (values: { date: string; startMin: number; durationMin: number }, scope: Scope) => void;
  onDelete: (scope: Scope) => void;
}) {
  const { occ } = props;
  const [date, setDate] = useState(occ.date);
  const [start, setStart] = useState(fmtTime(occ.startMin));
  const [durationMin, setDurationMin] = useState(props.initialDuration ?? occ.durationMin);
  const [scope, setScope] = useState<Scope>('this');
  const weekly = occ.kind === 'weekly';
  const startMin = toMinutes(start);
  const error = validTiming(startMin, durationMin);

  const deleteLabel = !weekly ? 'Supprimer' : scope === 'this' ? 'Supprimer cette semaine' : 'Supprimer cette semaine et les suivantes';

  return (
    <Modal title={weekly ? 'Modifier un créneau hebdomadaire' : 'Modifier un créneau'} onCancel={props.onCancel}>
      <p className="pp-info-dlg">
        {weekly ? '↻ ' : ''}{props.routine?.name} · {weekly ? `chaque ${WEEKDAY_NAMES[props.dates.indexOf(occ.date)]?.toLowerCase() ?? ''}` : 'ponctuel'}
        {occ.moved ? ' · déplacé cette semaine' : ''}
        {occ.displacedMin > 0 ? ` · ${fmtDuration(occ.displacedMin)} écrasées par un cours` : ''}
      </p>
      <div className="pp-champ"><label>Jour</label><DaySelect dates={props.dates} value={date} onChange={setDate} /></div>
      <div className="pp-deux">
        <div className="pp-champ"><label>Début</label><input className="pp-inp" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="pp-champ"><label>Fin</label><div className="pp-inp pp-lecture">{error ? '—' : fmtTime(startMin + durationMin)}</div></div>
      </div>
      <div className="pp-champ"><label>Durée</label><DurationPicker value={durationMin} onChange={setDurationMin} /></div>
      {weekly && (
        <div className="pp-champ"><label>Appliquer à</label>
          <label className="pp-radio"><input type="radio" checked={scope === 'this'} onChange={() => setScope('this')} /><span>Cette semaine seulement<small>Les autres semaines ne changent pas</small></span></label>
          <label className="pp-radio"><input type="radio" checked={scope === 'future'} onChange={() => setScope('future')} /><span>Cette semaine et toutes les suivantes<small>Les semaines passées ne changent pas</small></span></label>
        </div>
      )}
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        <button className="pp-btn pp-rouge" onClick={() => props.onDelete(scope)}>{deleteLabel}</button>
        <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
        <button className="pp-btn pp-plein" disabled={!!error} onClick={() => props.onSave({ date, startMin, durationMin }, scope)}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function RoutineDialog(props: {
  routine?: Routine;
  slotCount: number;
  usedColors: string[];
  onCancel: () => void;
  onSave: (values: { name: string; color: string; weeklyQuotaMin: number }) => void;
  onDelete: () => void;
}) {
  const r = props.routine;
  const [name, setName] = useState(r?.name ?? '');
  const [color, setColor] = useState(r?.color ?? ROUTINE_COLORS.find((c) => !props.usedColors.includes(c)) ?? ROUTINE_COLORS[0]);
  const [quota, setQuota] = useState(r ? String(r.weeklyQuotaMin / 60) : '');
  const quotaMin = Math.round(Number(quota.replace(',', '.')) * 60);
  const error = !name.trim() ? 'Donnez un nom à la routine.'
    : name.trim().length > 60 ? 'Nom trop long (60 caractères au plus).'
    : quota.trim() === '' || !Number.isFinite(quotaMin) || quotaMin < 0 || quotaMin > 7 * 24 * 60 ? 'Quota hebdomadaire invalide.'
    : '';

  return (
    <Modal title={r ? 'Modifier la routine' : 'Nouvelle routine'} onCancel={props.onCancel}>
      <div className="pp-champ"><label>Nom</label><input className="pp-inp" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Salle de sport" autoFocus /></div>
      <div className="pp-champ"><label>Couleur</label>
        <div className="pp-couleurs">
          {ROUTINE_COLORS.map((c) => (
            <button type="button" key={c} className={c === color ? 'pp-on' : ''} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Couleur ${c}`} />
          ))}
        </div>
      </div>
      <div className="pp-champ"><label>Quota hebdomadaire (heures)</label>
        <input className="pp-inp" type="number" min={0} step={0.25} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="10" />
      </div>
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        {r && (
          <button className="pp-btn pp-rouge" onClick={() => {
            const detail = props.slotCount ? ` et ses ${props.slotCount} créneau${props.slotCount > 1 ? 'x' : ''}` : '';
            if (window.confirm(`Supprimer « ${r.name} »${detail} ? Cette action est définitive.`)) props.onDelete();
          }}>Supprimer</button>
        )}
        <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
        <button className="pp-btn pp-plein" disabled={!!error} onClick={() => props.onSave({ name: name.trim(), color, weeklyQuotaMin: quotaMin })}>
          {r ? 'Enregistrer' : 'Créer'}
        </button>
      </div>
    </Modal>
  );
}

/* ======================= styles ======================= */

const CSS = `
.pp{--navy:#0d2b45;--gold:#c9972a;--cream:#faf7f2;--cream-dark:#f0ece4;--border:#ddd8ce;--red:#c0392b;--soft:#666;
  min-height:100vh;background:var(--cream);color:var(--navy);font-family:Inter,system-ui,sans-serif;font-size:14px}
.pp *{box-sizing:border-box}
.pp button{font-family:inherit;cursor:pointer}
.pp-etat{padding:40px;text-align:center;color:var(--soft)}

.pp-barre{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 22px;border-bottom:3px solid var(--navy)}
.pp-barre h1{font-family:Fraunces,Georgia,serif;font-size:1.35rem;font-weight:700;margin:0 auto 0 0}
.pp-semaine{display:flex;align-items:center;gap:8px}
.pp-fleche{width:32px;height:32px;border:1px solid var(--border);background:#fff;font-size:1.05rem;color:var(--navy)}
.pp-titre-semaine{font-weight:600;min-width:260px;text-align:center}
.pp-btn{border:1.5px solid var(--navy);background:transparent;color:var(--navy);padding:8px 14px;font-weight:600;font-size:.8rem}
.pp-btn:disabled{opacity:.4;cursor:default}
.pp-plein{background:var(--navy);color:var(--cream);box-shadow:3px 3px 0 var(--gold)}
.pp-or{border-color:var(--gold);color:#8a6614}
.pp-rouge{border-color:var(--red);color:var(--red);margin-right:auto}
.pp-filet{height:2px;background:var(--gold)}
.pp-impression-titre{display:none}

.pp-messages{padding:10px 22px 0}
.pp-messages p{margin:0 0 6px;padding:8px 12px;font-size:.82rem;border-left:3px solid}
.pp-erreur{background:#fdecea;border-color:var(--red);color:var(--red)}
.pp-avert{background:#fdf6e6;border-color:var(--gold);color:#8a6614}
.pp-info{background:#fff;border-color:var(--border);color:var(--soft)}

.pp-corps{display:grid;grid-template-columns:1fr 290px}
.pp-grille-zone{padding:12px 10px 20px 0;border-right:1px solid var(--border);min-width:0}
.pp-entetes,.pp-grille{display:grid;grid-template-columns:52px repeat(7,minmax(0,1fr))}
.pp-entetes>div{text-align:center;font-size:.76rem;font-weight:600;padding:4px 0 8px}
.pp-entetes b{display:block;font-family:Fraunces,Georgia,serif;font-size:1.15rem}
.pp-entetes .pp-auj{color:var(--red)}
.pp-heures{position:relative;height:calc(var(--total) * var(--k) * 1px)}
.pp-heures span{position:absolute;right:8px;top:calc(var(--s) * var(--k) * 1px);transform:translateY(-50%);font-size:.66rem;color:var(--soft)}
.pp-jour{position:relative;height:calc(var(--total) * var(--k) * 1px);border-left:1px solid var(--border);cursor:copy;
  background-image:linear-gradient(var(--border) 1px,transparent 1px),linear-gradient(#ebe5d9 1px,transparent 1px);
  background-size:100% calc(60 * var(--k) * 1px),100% calc(30 * var(--k) * 1px)}
.pp-jour.pp-auj{background-color:rgba(201,151,42,.07)}

.pp-bloc{position:absolute;top:calc(var(--s) * var(--k) * 1px);height:calc(var(--d) * var(--k) * 1px);padding:2px 6px;
  font-size:.68rem;line-height:1.25;overflow:hidden;border-radius:2px;cursor:pointer}
.pp-nom{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-heure{font-size:.62rem;opacity:.9;white-space:nowrap}
.pp-routine{z-index:1;left:calc(3px + (100% - 6px) * var(--lane) / var(--lanes));width:calc((100% - 6px) / var(--lanes) - 2px)}
.pp-routine:hover{filter:brightness(1.06)}
.pp-conflit{opacity:.42;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.4) 0 4px,transparent 4px 9px)}
.pp-conflit .pp-nom{text-decoration:line-through}
.pp-badge{position:absolute;z-index:4;top:calc(var(--s) * var(--k) * 1px - 7px);left:calc(5px + (100% - 6px) * var(--lane) / var(--lanes));
  font-size:.58rem;font-weight:700;background:var(--red);color:#fff;padding:1px 5px;border-radius:8px;white-space:nowrap;pointer-events:none}
.pp-poignee{position:absolute;left:0;right:0;bottom:0;height:6px;cursor:ns-resize;background:rgba(0,0,0,.18);touch-action:none}
.pp-coupe{position:absolute;right:3px;top:1px;font-size:.55rem;font-weight:700}
.pp-coupe-bas{top:auto;bottom:6px}
.pp-cours{z-index:3;left:3px;right:3px;background:var(--navy);color:#fff;cursor:default;box-shadow:0 1px 0 rgba(0,0,0,.25)}
.pp-decale{left:22%}
.pp-preply{box-shadow:inset 0 -3px 0 var(--gold)}
.pp-src{display:inline-block;margin-left:4px;padding:0 4px;border-radius:2px;background:var(--gold);color:var(--navy);font-size:.52rem;letter-spacing:.06em;text-transform:uppercase}

.pp-panneau{padding:18px 20px}
.pp-panneau h2{font-family:Fraunces,Georgia,serif;font-size:1.05rem;margin:0 0 4px}
.pp-sous{font-size:.72rem;color:var(--soft);margin:0 0 14px}
.pp-vide{font-size:.8rem;color:var(--soft)}
.pp-arrondi{display:block;margin:0 0 14px}
.pp-arrondi>span{display:block;font-size:.66rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);margin-bottom:5px}
.pp-arrondi select{background:#fff;padding:6px 8px;font-size:.8rem}
.pp-arrondi small{display:block;font-size:.68rem;color:var(--soft);margin-top:5px;line-height:1.35}
.pp-arrondi-impression{display:none}
.pp-quota{padding:11px 0;border-top:1px solid var(--border)}
.pp-quota-tete{display:flex;align-items:center;gap:8px;font-weight:600;font-size:.86rem}
.pp-pastille-couleur{width:12px;height:12px;border-radius:3px;flex:none}
.pp-quota-nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-quota-obj{font-size:.72rem;color:var(--soft);font-weight:500}
.pp-crayon{border:none;background:none;color:var(--soft);font-size:.9rem;padding:0 2px}
.pp-jauge{height:7px;background:var(--cream-dark);margin:8px 0 6px;position:relative;overflow:hidden}
.pp-jauge i{position:absolute;left:0;top:0;bottom:0}
.pp-chiffres{display:flex;justify-content:space-between;font-size:.74rem}
.pp-reste{font-weight:600}
.pp-depasse{color:var(--red);font-weight:700}
.pp-deplace{margin-top:5px;font-size:.7rem;color:#8a6614;background:#fdf6e6;border-left:2px solid var(--gold);padding:3px 7px}
.pp-legende{margin-top:14px;padding-top:12px;border-top:1px solid var(--border);font-size:.7rem;color:var(--soft);display:grid;gap:6px}
.pp-legende span{display:flex;align-items:center;gap:7px}
.pp-legende i{width:16px;height:11px;display:inline-block;border-radius:2px}
.pp-legende-conflit{background:#3f7d5c;opacity:.42;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.4) 0 3px,transparent 3px 7px)}

.pp-mobile{display:none}

.pp-voile{position:fixed;inset:0;z-index:50;background:rgba(13,43,69,.35);display:grid;place-items:center;padding:16px}
.pp-dlg{background:#fff;border:1px solid var(--border);border-top:3px solid var(--navy);width:100%;max-width:380px;max-height:92vh;overflow:auto;padding:18px 20px;box-shadow:0 12px 32px rgba(13,43,69,.2)}
.pp-dlg h3{font-family:Fraunces,Georgia,serif;font-size:1.02rem;margin:0 0 12px}
.pp-champ{margin-bottom:12px}
.pp-champ>label{display:block;font-size:.66rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);margin-bottom:5px}
.pp-inp{width:100%;border:1.5px solid var(--border);padding:7px 10px;font:500 .86rem Inter,system-ui,sans-serif;background:var(--cream);color:var(--navy)}
.pp-lecture{color:var(--soft)}
.pp-deux{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pp-puces{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.pp-puce{border:1.5px solid var(--border);padding:5px 10px;font-size:.78rem;font-weight:600;background:var(--cream);color:var(--navy)}
.pp-puce.pp-on{border-color:var(--navy);background:var(--navy);color:#fff}
.pp-libre{font-size:.78rem;color:var(--soft);display:flex;align-items:center;gap:4px}
.pp-libre input{width:64px;border:1.5px solid var(--border);padding:4px 6px;font:500 .8rem Inter,system-ui,sans-serif}
.pp-radio{display:flex;gap:8px;align-items:flex-start;font-size:.82rem;margin-bottom:7px;line-height:1.35;cursor:pointer}
.pp-radio input{margin-top:3px;accent-color:var(--navy)}
.pp-radio small{display:block;color:var(--soft);font-size:.7rem}
.pp-couleurs{display:flex;gap:8px;flex-wrap:wrap}
.pp-couleurs button{width:24px;height:24px;border-radius:50%;border:none}
.pp-couleurs button.pp-on{outline:2px solid var(--navy);outline-offset:2px}
.pp-info-dlg{font-size:.76rem;color:var(--soft);background:var(--cream);padding:8px 10px;margin:0 0 12px;border-left:3px solid var(--gold)}
.pp-erreur-dlg{font-size:.76rem;color:var(--red);margin:0 0 8px}
.pp-act{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}

/* ---------- mobile : liste par jour ---------- */
@media (max-width:720px){
  .pp-barre{padding:12px 14px;gap:8px}
  .pp-barre h1{flex-basis:100%;font-size:1.15rem}
  .pp-semaine{flex-basis:100%;justify-content:space-between}
  .pp-titre-semaine{min-width:0;font-size:.82rem}
  .pp-barre .pp-btn{flex:1;padding:8px 6px;font-size:.74rem}
  .pp-corps{grid-template-columns:1fr}
  .pp-grille-zone{display:none}
  .pp-mobile{display:block;position:relative;padding-bottom:70px}
  .pp-panneau{border-top:1px solid var(--border)}
  .pp-jours{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:10px 12px;border-bottom:1px solid var(--border)}
  .pp-jours button{border:1px solid var(--border);background:#fff;color:var(--navy);padding:6px 0;font-size:.64rem;font-weight:600}
  .pp-jours button b{display:block;font-family:Fraunces,Georgia,serif;font-size:.95rem}
  .pp-jours button.pp-auj{color:var(--red)}
  .pp-jours button.pp-on{background:var(--navy);color:#fff;border-color:var(--navy)}
  .pp-liste{padding:10px 12px;display:grid;gap:8px}
  .pp-item{width:100%;display:flex;gap:10px;text-align:left;background:#fff;border:1px solid var(--border);border-left:5px solid var(--border);padding:9px 10px;color:var(--navy);font:inherit}
  .pp-item-h{font-size:.72rem;font-weight:700;min-width:84px}
  .pp-item b{display:block;font-size:.86rem}
  .pp-item span{display:block;font-size:.7rem;color:var(--soft)}
  .pp-item em{display:block;font-style:normal;font-size:.68rem;font-weight:700;color:var(--red);margin-top:2px}
  .pp-item-cours{background:var(--navy);color:#fff;border-color:var(--navy)}
  .pp-item-cours span{color:rgba(255,255,255,.72)}
  .pp-item-conflit b{text-decoration:line-through;opacity:.6}
  .pp-fab{position:absolute;right:14px;bottom:10px;width:50px;height:50px;border-radius:50%;border:none;background:var(--navy);color:#fff;font-size:1.6rem;box-shadow:3px 3px 0 var(--gold)}
}

/* ---------- impression : semaine complète en A4 paysage ---------- */
@page{size:A4 landscape;margin:8mm}
@media print{
  .pp{min-height:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
  .pp-barre,.pp-messages,.pp-mobile,.pp-voile,.pp-crayon,.pp-poignee,.pp-arrondi{display:none !important}
  .pp-arrondi-impression{display:block;font-size:8.5px;color:var(--soft);margin:-8px 0 6px}
  .pp-filet{order:0}
  .pp-impression-titre{display:block;font-family:Inter,system-ui,sans-serif;font-size:11px;padding:0 0 4px;border-bottom:2px solid var(--navy);margin-bottom:0}
  .pp-impression-titre strong{font-family:Fraunces,Georgia,serif}
  .pp-corps{display:grid !important;grid-template-columns:minmax(0,1fr) 62mm !important}
  .pp-grille-zone{display:block !important;padding:4px 6px 0 0}
  .pp-grille{--k:.66 !important}
  .pp-entetes>div{padding:2px 0 4px;font-size:9px}
  .pp-entetes b{font-size:12px}
  .pp-bloc{font-size:8px;padding:1px 3px}
  .pp-heure{font-size:7px}
  .pp-badge{font-size:7px}
  .pp-panneau{display:block !important;padding:6px 3mm 0 8px;border-top:none !important;min-width:0;overflow:hidden}
  .pp-chiffres{flex-wrap:wrap;gap:0 6px}
  .pp-panneau h2{font-size:12px}
  .pp-quota{padding:6px 0;break-inside:avoid}
  .pp-quota-tete{font-size:10px}
  .pp-chiffres,.pp-deplace,.pp-legende{font-size:8.5px}
}
`;
