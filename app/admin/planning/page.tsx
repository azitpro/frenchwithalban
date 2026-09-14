'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { EMPTY_SCHEDULE, withDefaults } from '@/lib/schedule';
import type { Schedule } from '@/lib/schedule';
import {
  DAY_END_MIN, DAY_START_MIN, DEFAULT_SETTINGS, EMPTY_PLANNING, EVENT_COLORS, EVENT_TITLE_MAX, JOURNAL_ITEM_MAX, JOURNAL_MAX_ITEMS,
  RETENTION_WEEKS, ROUNDING_OPTIONS, ROUTINE_COLORS, WEEKDAY_NAMES,
  addDays, addEvent, addRoutine, addSlot, deleteEvent, deleteOccurrence, deleteRoutine, eventRef, eventsForWeek,
  fmtDuration, fmtTime, lessonsForWeek, nowInParis, occurrenceRef, occurrencesForWeek, retentionStart, setJournal, setRounding,
  updateEvent, updateOccurrence, updateRoutine, weekDates, weekStartOf, weeklyQuotas,
} from '@/lib/planning';
import type {
  EventInput, Lesson, Occurrence, PlacementDefaults, Planning, PlanningEvent, PreplyBusy, Routine, RoundingMin, Scope,
} from '@/lib/planning';

/* ======================= réglages ======================= */

const K = 1.1; // pixels par minute à l'écran (réduit à l'impression)
const DURATIONS = [25, 50, 60];

type Dialog =
  | { type: 'place'; date: string; startMin: number; mode: 'routine' | 'event' }
  | { type: 'edit'; occ: Occurrence; durationMin?: number }
  | { type: 'event'; event: PlanningEvent }
  | { type: 'routine'; routine?: Routine }
  | null;

/** Bloc personnel affiché dans la grille : occurrence de routine ou événement ponctuel. */
type Bloc = { key: string; startMin: number; endMin: number; occ?: Occurrence; event?: PlanningEvent };

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

/** Répartit en colonnes les blocs (routines et événements) qui se chevauchent entre eux. */
function laneLayout(blocs: Bloc[]): Map<string, { lane: number; lanes: number }> {
  const result = new Map<string, { lane: number; lanes: number }>();
  const sorted = [...blocs].sort((a, b) => a.startMin - b.startMin);
  let cluster: Bloc[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned = cluster.map((b) => {
      let lane = laneEnds.findIndex((end) => end <= b.startMin);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
      laneEnds[lane] = b.endMin;
      return { b, lane };
    });
    assigned.forEach(({ b, lane }) => result.set(b.key, { lane, lanes: laneEnds.length }));
  };
  for (const b of sorted) {
    if (cluster.length && b.startMin >= clusterEnd) { flush(); cluster = []; clusterEnd = -1; }
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.endMin);
  }
  if (cluster.length) flush();
  return result;
}

async function fetchPlanning(): Promise<{ planning: Planning; revision: number }> {
  const res = await fetch('/api/admin/planning', { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.planning || !Number.isInteger(data.revision)) throw new Error(data?.error || 'Chargement impossible.');
  return data;
}

/* ======================= page ======================= */

export default function PlanningPersonnel() {
  const [clock, setClock] = useState(() => nowInParis());
  const today = clock.date;
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
  const [notice, setNotice] = useState('');

  // révision du planning chargé, enregistrements en file d'attente, file annulée après un conflit
  const revisionRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);
  const generationRef = useRef(0);
  const dialogRef = useRef<Dialog>(null);

  /* ---------- horloge : sert à savoir quels créneaux sont terminés ---------- */
  useEffect(() => {
    const t = setInterval(() => setClock(nowInParis()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* ---------- chargement ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const notes: string[] = [];
      const [planningRes, scheduleRes, preplyRes] = await Promise.allSettled([
        fetchPlanning(),
        fetch('/api/admin/schedule', { cache: 'no-store' }),
        fetch('/api/preply-busy'),
      ]);
      if (cancelled) return;

      if (planningRes.status === 'fulfilled') {
        revisionRef.current = planningRes.value.revision;
        setPlanning(planningRes.value.planning);
      } else {
        setFatal('Impossible de charger le planning. Pour ne pas écraser vos données, la page reste bloquée tant que le chargement n’a pas réussi.');
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

  /* ---------- enregistrement ----------
     Optimiste et en file d'attente. Chaque envoi porte la révision chargée : si le planning a été
     modifié ailleurs (autre onglet, autre appareil), le serveur refuse et la dernière version est
     affichée, au lieu d'écraser des données plus récentes. */
  function persist(next: Planning) {
    const previous = planning;
    const generation = generationRef.current;
    setPlanning(next);
    pendingRef.current += 1;
    setSaving(true);
    setSaveError('');
    setNotice('');
    queueRef.current = queueRef.current.then(async () => {
      try {
        if (generation !== generationRef.current) return; // annulé par un conflit ou un échec précédent
        const res = await fetch('/api/admin/planning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planning: next, revision: revisionRef.current }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data.planning) {
          generationRef.current += 1;
          revisionRef.current = data.revision;
          setPlanning(data.planning);
          setSaveError('Le planning a été modifié depuis un autre onglet ou appareil. Pour ne rien écraser, la dernière version enregistrée est affichée : refaites votre modification.');
          return;
        }
        if (!res.ok) throw new Error(data.error || 'Enregistrement refusé.');
        revisionRef.current = data.revision;
        if (pendingRef.current === 1) setPlanning(data.planning);
      } catch (e) {
        generationRef.current += 1;
        setPlanning(previous);
        setSaveError(`${e instanceof Error ? e.message : 'Enregistrement impossible.'} Vos dernières modifications ont été annulées.`);
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setSaving(false);
      }
    });
  }

  /* ---------- calculs de la semaine ---------- */
  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const lessons = useMemo(() => lessonsForWeek(weekStart, schedule, preply), [weekStart, schedule, preply]);
  const occurrences = useMemo(() => occurrencesForWeek(weekStart, planning, lessons), [weekStart, planning, lessons]);
  const events = useMemo(() => eventsForWeek(weekStart, planning), [weekStart, planning]);
  const quotas = useMemo(() => weeklyQuotas(planning, occurrences), [planning, occurrences]);
  const routineById = useMemo(() => new Map(planning.routines.map((r) => [r.id, r])), [planning.routines]);
  const journal = useMemo(() => new Map((planning.journal ?? []).map((j) => [j.ref, j.items])), [planning.journal]);
  const rounding = planning.settings?.countRoundingMin ?? DEFAULT_SETTINGS.countRoundingMin;
  const oldestWeek = retentionStart(today);
  const isEnded = (date: string, endMin: number) => date < clock.date || (date === clock.date && endMin <= clock.minutes);

  /* ---------- clavier : Échap ferme la fenêtre ---------- */
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDialog(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  /* ---------- PDF : nom de fichier proposé = titre de la page pendant l'impression ---------- */
  useEffect(() => {
    let previousTitle = '';
    const before = () => { previousTitle = document.title; document.title = `Planning ${weekStart}`; };
    const after = () => { if (previousTitle) document.title = previousTitle; };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [weekStart]);

  /* ---------- retour sur l'onglet : recharger si le planning a changé ailleurs ---------- */
  useEffect(() => { dialogRef.current = dialog; }, [dialog]);
  useEffect(() => {
    if (loading || fatal) return;
    const sync = async () => {
      if (document.visibilityState !== 'visible' || pendingRef.current > 0 || dialogRef.current) return;
      try {
        const data = await fetchPlanning();
        if (pendingRef.current > 0 || data.revision === revisionRef.current) return;
        revisionRef.current = data.revision;
        setPlanning(data.planning);
        setNotice('Planning mis à jour : des modifications ont été faites depuis un autre onglet ou appareil.');
      } catch {
        // hors ligne : nouvel essai au prochain retour sur l'onglet
      }
    };
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, [loading, fatal]);

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
    setDialog({ type: 'place', date, startMin, mode: planning.routines.length ? 'routine' : 'event' });
  }

  function openNewEvent() {
    const inWeek = dates.includes(today);
    const date = inWeek ? today : dates[0];
    const startMin = inWeek
      ? Math.min(DAY_END_MIN - 60, Math.max(DAY_START_MIN, Math.ceil(clock.minutes / 30) * 30))
      : 9 * 60;
    setDialog({ type: 'place', date, startMin, mode: 'event' });
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
  if (fatal) {
    return (
      <div className="pp">
        <style>{CSS}</style>
        <div className="pp-messages"><p className="pp-erreur">{fatal}</p></div>
        <p className="pp-etat"><button className="pp-btn pp-plein" onClick={() => window.location.reload()}>Recharger</button></p>
      </div>
    );
  }

  const isCurrentWeek = weekStart === currentWeek;
  const canGoBack = addDays(weekStart, -7) >= oldestWeek;
  const label = weekLabel(weekStart);
  const endedBlocs = [
    ...occurrences.filter((o) => isEnded(o.date, o.endMin)).map((o) => occurrenceRef(o)),
    ...events.filter((e) => isEnded(e.date, e.startMin + e.durationMin)).map((e) => eventRef(e.id)),
  ];
  const filledCount = endedBlocs.filter((ref) => journal.has(ref)).length;

  return (
    <div className="pp">
      <style>{CSS}</style>

      <header className="pp-barre">
        <h1>Planning personnel</h1>
        <div className="pp-semaine">
          <button className="pp-fleche" onClick={() => goToWeek(addDays(weekStart, -7))} disabled={!canGoBack}
            aria-label="Semaine précédente" title={canGoBack ? undefined : `Les semaines passées sont conservées ${RETENTION_WEEKS / 52 === 1 ? '12 mois' : `${RETENTION_WEEKS} semaines`}.`}>‹</button>
          <span className="pp-titre-semaine">{label}</span>
          <button className="pp-fleche" onClick={() => goToWeek(addDays(weekStart, 7))} aria-label="Semaine suivante">›</button>
        </div>
        <button className="pp-btn" onClick={() => goToWeek(currentWeek)} disabled={isCurrentWeek}>Semaine courante</button>
        <button className="pp-btn pp-or" onClick={() => setDialog({ type: 'routine' })}>+ Routine</button>
        <button className="pp-btn pp-or" onClick={openNewEvent}>+ Événement</button>
        <button className="pp-btn pp-plein" onClick={() => window.print()}>Télécharger le PDF</button>
      </header>
      <div className="pp-filet" />

      <div className="pp-impression-titre">
        <strong>French with Alban</strong> · Planning personnel · {label}
      </div>

      {(saveError || notice || warnings.length > 0 || saving) && (
        <div className="pp-messages">
          {saveError && <p className="pp-erreur">{saveError}</p>}
          {notice && <p className="pp-avert">{notice}</p>}
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
                events={events.filter((e) => e.date === date)}
                routineById={routineById}
                journal={journal}
                resize={resize}
                onColumnClick={onColumnClick}
                onEdit={(occ) => setDialog({ type: 'edit', occ })}
                onEditEvent={(event) => setDialog({ type: 'event', event })}
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
            lessons={lessons.filter((l) => l.date === dates[mobileDay])}
            occurrences={occurrences.filter((o) => o.date === dates[mobileDay])}
            events={events.filter((e) => e.date === dates[mobileDay])}
            routineById={routineById}
            journal={journal}
            onEdit={(occ) => setDialog({ type: 'edit', occ })}
            onEditEvent={(event) => setDialog({ type: 'event', event })}
          />
          <button className="pp-fab" aria-label="Placer un créneau ou un événement"
            onClick={() => setDialog({ type: 'place', date: dates[mobileDay], startMin: 9 * 60, mode: planning.routines.length ? 'routine' : 'event' })}>+</button>
        </div>

        {/* ---------- quotas ---------- */}
        <aside className="pp-panneau">
          <div className="pp-resume">
            <b>Bilan de la semaine</b>
            <span>{endedBlocs.length === 0
              ? 'Aucun créneau terminé pour l’instant.'
              : `${filledCount} / ${endedBlocs.length} créneau${endedBlocs.length > 1 ? 'x' : ''} terminé${endedBlocs.length > 1 ? 's' : ''} renseigné${filledCount > 1 ? 's' : ''}`}</span>
            <a href="#bilan">Voir le bilan ↓</a>
          </div>
          <h2>Quotas de la semaine</h2>
          <p className="pp-sous">Remis à zéro chaque lundi. Les minutes couvertes par un cours ne comptent pas. Les événements ponctuels ne comptent dans aucun quota.</p>
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
            <span><i className="pp-legende-evenement" />◆ événement ponctuel, hors routine</span>
            <span><i className="pp-legende-conflit" />Routine écrasée par un cours</span>
            <span><b className="pp-legende-fait">✓ 2</b>Lignes notées dans « Ce que j’ai fait »</span>
          </div>
        </aside>
      </div>

      {/* ---------- bilan heure par heure (écran et pages suivantes du PDF) ---------- */}
      <WeekReport
        label={label}
        dates={dates}
        lessons={lessons}
        occurrences={occurrences}
        events={events}
        routineById={routineById}
        journal={journal}
        isEnded={isEnded}
        onOpenOcc={(occ) => setDialog({ type: 'edit', occ })}
        onOpenEvent={(event) => setDialog({ type: 'event', event })}
      />

      {dialog?.type === 'place' && (
        <PlaceDialog
          dates={dates}
          defaults={planning.settings?.lastPlacement}
          initialDate={dialog.date}
          initialStart={dialog.startMin}
          initialMode={dialog.mode}
          routines={planning.routines}
          onCreateRoutine={() => setDialog({ type: 'routine' })}
          onCancel={() => setDialog(null)}
          onSubmitSlot={(input) => { setDialog(null); persist(addSlot(planning, input)); }}
          onSubmitEvent={(input) => { setDialog(null); persist(addEvent(planning, input)); }}
        />
      )}
      {dialog?.type === 'edit' && (
        <EditDialog
          dates={dates}
          occ={dialog.occ}
          initialDuration={dialog.durationMin}
          routine={routineById.get(dialog.occ.routineId)}
          items={journal.get(occurrenceRef(dialog.occ)) ?? []}
          ended={isEnded(dialog.occ.date, dialog.occ.endMin)}
          onCancel={() => setDialog(null)}
          onSave={(values, scope, items) => {
            const occ = dialog.occ;
            setDialog(null);
            // le bilan d'abord : en cas de scission de la série, il suit la nouvelle série
            let next = setJournal(planning, occurrenceRef(occ), items);
            const moved = values.date !== occ.date || values.startMin !== occ.startMin || values.durationMin !== occ.durationMin;
            if (moved) next = updateOccurrence(next, occ, values, scope);
            persist(next);
          }}
          onDelete={(scope) => { setDialog(null); persist(deleteOccurrence(planning, dialog.occ, scope)); }}
        />
      )}
      {dialog?.type === 'event' && (
        <EventDialog
          dates={dates}
          event={dialog.event}
          items={journal.get(eventRef(dialog.event.id)) ?? []}
          ended={isEnded(dialog.event.date, dialog.event.startMin + dialog.event.durationMin)}
          onCancel={() => setDialog(null)}
          onSave={(values, items) => {
            const id = dialog.event.id;
            setDialog(null);
            persist(setJournal(updateEvent(planning, id, values), eventRef(id), items));
          }}
          onDelete={() => { setDialog(null); persist(deleteEvent(planning, dialog.event.id)); }}
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
  events: PlanningEvent[];
  routineById: Map<string, Routine>;
  journal: Map<string, string[]>;
  resize: { occ: Occurrence; durationMin: number } | null;
  onColumnClick: (e: ReactMouseEvent<HTMLDivElement>, date: string) => void;
  onEdit: (occ: Occurrence) => void;
  onEditEvent: (event: PlanningEvent) => void;
  onResizeStart: (e: ReactPointerEvent<HTMLDivElement>, occ: Occurrence) => void;
  onResizeMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeEnd: () => void;
}) {
  const { date, lessons, occurrences, events, routineById, journal, resize } = props;
  const blocs: Bloc[] = [
    ...occurrences.map((o) => ({ key: `r-${o.slotId}`, startMin: o.startMin, endMin: o.endMin, occ: o })),
    ...events.map((e) => ({ key: `e-${e.id}`, startMin: e.startMin, endMin: e.startMin + e.durationMin, event: e })),
  ];
  const lanes = laneLayout(blocs);

  // position dans la fenêtre 7h–22h ; ce qui déborde est coupé et signalé
  const place = (start: number, end: number) => {
    const s = Math.max(start, DAY_START_MIN);
    const e = Math.min(end, DAY_END_MIN);
    return { visible: e > s, top: s - DAY_START_MIN, height: e - s, cutTop: start < DAY_START_MIN, cutBottom: end > DAY_END_MIN };
  };
  const faitBadge = (count: number) => (count > 0 ? <span className="pp-fait" title={`${count} ligne${count > 1 ? 's' : ''} dans « Ce que j’ai fait »`}>✓ {count}</span> : null);

  return (
    <div className={`pp-jour ${props.isToday ? 'pp-auj' : ''}`} onClick={(e) => props.onColumnClick(e, date)}>
      {occurrences.map((o) => {
        const r = routineById.get(o.routineId);
        if (!r) return null;
        const duration = resize && resize.occ.slotId === o.slotId && resize.occ.date === o.date ? resize.durationMin : o.durationMin;
        const pos = place(o.startMin, o.startMin + duration);
        if (!pos.visible) return null;
        const lane = lanes.get(`r-${o.slotId}`) ?? { lane: 0, lanes: 1 };
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
              {faitBadge(journal.get(occurrenceRef(o))?.length ?? 0)}
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
      {events.map((ev) => {
        const end = ev.startMin + ev.durationMin;
        const pos = place(ev.startMin, end);
        if (!pos.visible) return null;
        const lane = lanes.get(`e-${ev.id}`) ?? { lane: 0, lanes: 1 };
        return (
          <div
            key={`e-${ev.id}`}
            className="pp-bloc pp-routine pp-evenement"
            style={{
              ...cssVars({ '--s': pos.top, '--d': pos.height, '--lane': lane.lane, '--lanes': lane.lanes }),
              background: ev.color, color: textOn(ev.color),
            }}
            title={`Événement · ${ev.title} · ${fmtTime(ev.startMin)}–${fmtTime(end)}`}
            onClick={(e) => { e.stopPropagation(); props.onEditEvent(ev); }}
          >
            {pos.cutTop && <span className="pp-coupe">↑ {fmtTime(ev.startMin)}</span>}
            <div className="pp-nom">◆ {ev.title}</div>
            <div className="pp-heure">{fmtTime(ev.startMin)}–{fmtTime(end)}</div>
            {pos.cutBottom && <span className="pp-coupe pp-coupe-bas">↓ {fmtTime(end)}</span>}
            {faitBadge(journal.get(eventRef(ev.id))?.length ?? 0)}
          </div>
        );
      })}
      {lessons.map((l) => {
        const pos = place(l.startMin, l.endMin);
        if (!pos.visible) return null;
        const overBloc = blocs.some((b) => Math.min(b.endMin, l.endMin) > Math.max(b.startMin, l.startMin));
        return (
          <div
            key={`${l.source}-${l.startMin}-${l.label}`}
            className={`pp-bloc pp-cours ${overBloc ? 'pp-decale' : ''} ${l.source === 'preply' ? 'pp-preply' : ''}`}
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
  lessons: Lesson[];
  occurrences: Occurrence[];
  events: PlanningEvent[];
  routineById: Map<string, Routine>;
  journal: Map<string, string[]>;
  onEdit: (occ: Occurrence) => void;
  onEditEvent: (event: PlanningEvent) => void;
}) {
  type Item = { start: number; key: string; node: ReactNode };
  const fait = (count: number) => (count > 0 ? <em className="pp-item-fait">✓ {count} ligne{count > 1 ? 's' : ''} notée{count > 1 ? 's' : ''}</em> : null);
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
              {fait(props.journal.get(occurrenceRef(o))?.length ?? 0)}
            </div>
          </button>
        ),
      };
    }),
    ...props.events.map((ev) => ({
      start: ev.startMin,
      key: `e-${ev.id}`,
      node: (
        <button className="pp-item pp-item-evenement" style={{ borderLeftColor: ev.color }} onClick={() => props.onEditEvent(ev)}>
          <div className="pp-item-h">{fmtTime(ev.startMin)} – {fmtTime(ev.startMin + ev.durationMin)}</div>
          <div>
            <b>◆ {ev.title}</b>
            <span>Événement ponctuel</span>
            {fait(props.journal.get(eventRef(ev.id))?.length ?? 0)}
          </div>
        </button>
      ),
    })),
  ].sort((a, b) => a.start - b.start);

  return (
    <div className="pp-liste">
      {items.length === 0 && <p className="pp-vide">Rien de prévu ce jour-là.</p>}
      {items.map((i) => <div key={i.key}>{i.node}</div>)}
    </div>
  );
}

/* ======================= bilan heure par heure ======================= */

function WeekReport(props: {
  label: string;
  dates: string[];
  lessons: Lesson[];
  occurrences: Occurrence[];
  events: PlanningEvent[];
  routineById: Map<string, Routine>;
  journal: Map<string, string[]>;
  isEnded: (date: string, endMin: number) => boolean;
  onOpenOcc: (occ: Occurrence) => void;
  onOpenEvent: (event: PlanningEvent) => void;
}) {
  type Ligne = { key: string; startMin: number; endMin: number; node: ReactNode };
  const jours = props.dates.map((date, i) => {
    const lignes: Ligne[] = [];
    for (const l of props.lessons.filter((x) => x.date === date)) {
      lignes.push({
        key: `c-${l.source}-${l.startMin}`, startMin: l.startMin, endMin: l.endMin,
        node: <div className="pp-bilan-titre pp-bilan-cours"><i style={{ background: '#0d2b45' }} /><span>{l.source === 'preply' ? 'Occupé (Preply)' : `Cours · ${l.label}`}</span></div>,
      });
    }
    for (const o of props.occurrences.filter((x) => x.date === date)) {
      const r = props.routineById.get(o.routineId);
      if (!r) continue;
      lignes.push({
        key: `r-${o.slotId}`, startMin: o.startMin, endMin: o.endMin,
        node: (
          <Entree items={props.journal.get(occurrenceRef(o)) ?? []} ended={props.isEnded(o.date, o.endMin)} onOpen={() => props.onOpenOcc(o)}
            color={r.color} title={r.name} tag={o.kind === 'weekly' ? 'routine hebdomadaire' : 'routine ponctuelle'} />
        ),
      });
    }
    for (const ev of props.events.filter((x) => x.date === date)) {
      lignes.push({
        key: `e-${ev.id}`, startMin: ev.startMin, endMin: ev.startMin + ev.durationMin,
        node: (
          <Entree items={props.journal.get(eventRef(ev.id)) ?? []} ended={props.isEnded(ev.date, ev.startMin + ev.durationMin)} onOpen={() => props.onOpenEvent(ev)}
            color={ev.color} title={`◆ ${ev.title}`} tag="événement" />
        ),
      });
    }
    lignes.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    return { date, nom: `${WEEKDAY_NAMES[i]} ${formatLongDate(date, false)}`, lignes };
  }).filter((j) => j.lignes.length > 0);

  return (
    <section className="pp-bilan" id="bilan" aria-label="Bilan de la semaine">
      <div className="pp-bilan-tete">
        <h2>Bilan de la semaine</h2>
        <span className="pp-bilan-semaine">{props.label}</span>
        <p>Heure par heure, avec ce que vous avez noté dans chaque créneau. Ce bilan figure aussi dans le PDF. Les semaines passées restent disponibles 12 mois.</p>
      </div>
      {jours.length === 0 && <p className="pp-vide">Rien de prévu cette semaine.</p>}
      <div className="pp-bilan-jours">
        {jours.map((j) => (
          <div key={j.date} className="pp-bilan-jour">
            <h3>{j.nom}</h3>
            {j.lignes.map((l) => (
              <div key={l.key} className="pp-bilan-ligne">
                <span className="pp-bilan-h">{fmtTime(l.startMin)}–{fmtTime(l.endMin)}</span>
                {l.node}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Entree(props: { items: string[]; ended: boolean; onOpen: () => void; color: string; title: string; tag: string }) {
  return (
    <>
      <div className="pp-bilan-titre">
        <button type="button" className="pp-bilan-ouvrir" onClick={props.onOpen}>
          <i style={{ background: props.color }} /><span>{props.title}</span>
        </button>
        <small>{props.tag}</small>
      </div>
      {props.items.length > 0 && <ul>{props.items.map((it, k) => <li key={k}>{it}</li>)}</ul>}
      {props.items.length === 0 && props.ended && (
        <button type="button" className="pp-a-completer" onClick={props.onOpen}>À compléter</button>
      )}
    </>
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

function Modal({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }) {
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

function ColorPicker({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="pp-couleurs">
      {colors.map((c) => (
        <button type="button" key={c} className={c === value ? 'pp-on' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={`Couleur ${c}`} />
      ))}
    </div>
  );
}

/** Liste « Ce que j'ai fait » ; la ligne en cours de saisie est ajoutée aussi à l'enregistrement. */
function JournalEditor(props: { items: string[]; onChange: (items: string[]) => void; draft: string; onDraft: (v: string) => void; ended: boolean }) {
  const { items, draft } = props;
  const full = items.length >= JOURNAL_MAX_ITEMS;
  const add = () => {
    const text = draft.trim();
    if (!text || full) return;
    props.onChange([...items, text]);
    props.onDraft('');
  };
  return (
    <div className="pp-champ pp-journal-zone">
      <label htmlFor="pp-journal-saisie">Ce que j’ai fait</label>
      {!props.ended && <p className="pp-note-dlg">Ce créneau n’est pas encore terminé : vous pourrez compléter la liste ensuite.</p>}
      {items.length > 0 && (
        <ul className="pp-journal">
          {items.map((it, i) => (
            <li key={i}>
              <span>{it}</span>
              <button type="button" aria-label={`Retirer « ${it} »`} onClick={() => props.onChange(items.filter((_, k) => k !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="pp-journal-ajout">
        <input id="pp-journal-saisie" className="pp-inp" value={draft} maxLength={JOURNAL_ITEM_MAX} disabled={full}
          placeholder={full ? `${JOURNAL_MAX_ITEMS} lignes au plus` : 'Ex. : préparé la leçon sur le passé composé'}
          onChange={(e) => props.onDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="pp-btn" onClick={add} disabled={!draft.trim() || full}>Ajouter</button>
      </div>
    </div>
  );
}

const withDraft = (items: string[], draft: string) => (draft.trim() ? [...items, draft.trim()] : items);

function PlaceDialog(props: {
  dates: string[];
  initialDate: string;
  initialStart: number;
  initialMode: 'routine' | 'event';
  routines: Routine[];
  defaults?: PlacementDefaults;
  onCreateRoutine: () => void;
  onCancel: () => void;
  onSubmitSlot: (input: { routineId: string; kind: 'weekly' | 'once'; date: string; startMin: number; durationMin: number }) => void;
  onSubmitEvent: (input: EventInput) => void;
}) {
  // reprend la routine, la durée et la répétition du dernier créneau placé ; l'heure reste celle du clic
  const last = props.routines.some((r) => r.id === props.defaults?.routineId) ? props.defaults : undefined;
  const [mode, setMode] = useState(props.initialMode);
  const [routineId, setRoutineId] = useState(last?.routineId ?? props.routines[0]?.id ?? '');
  const [date, setDate] = useState(props.initialDate);
  const [start, setStart] = useState(fmtTime(props.initialStart));
  const [durationMin, setDurationMin] = useState(props.initialMode === 'event' ? 60 : last?.durationMin ?? 60);
  const [kind, setKind] = useState<'weekly' | 'once'>(last?.kind ?? 'once');
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(EVENT_COLORS[0]);

  const startMin = toMinutes(start);
  const timingError = validTiming(startMin, durationMin);
  const error = mode === 'event' && !title.trim() ? 'Donnez un titre à l’événement.' : timingError;
  const noRoutine = mode === 'routine' && props.routines.length === 0;

  return (
    <Modal title={mode === 'event' ? 'Nouvel événement' : 'Placer un créneau'} onCancel={props.onCancel}>
      <div className="pp-onglets" role="tablist" aria-label="Type de bloc">
        <button type="button" role="tab" aria-selected={mode === 'routine'} className={mode === 'routine' ? 'pp-on' : ''} onClick={() => setMode('routine')}>Routine</button>
        <button type="button" role="tab" aria-selected={mode === 'event'} className={mode === 'event' ? 'pp-on' : ''} onClick={() => setMode('event')}>Événement ponctuel</button>
      </div>

      {noRoutine ? (
        <>
          <p className="pp-info-dlg">Créez d’abord une routine : un créneau de routine appartient toujours à une routine. Pour un rendez-vous isolé, choisissez « Événement ponctuel ».</p>
          <div className="pp-act">
            <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
            <button className="pp-btn pp-plein" onClick={props.onCreateRoutine}>Créer une routine</button>
          </div>
        </>
      ) : (
        <>
          {mode === 'routine' ? (
            <div className="pp-champ"><label>Routine</label>
              <select className="pp-inp" value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
                {props.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          ) : (
            <>
              <p className="pp-info-dlg">Un événement ponctuel ne fait partie d’aucune routine et ne compte dans aucun quota.</p>
              <div className="pp-champ"><label htmlFor="pp-titre-evenement">Titre</label>
                <input id="pp-titre-evenement" className="pp-inp" value={title} maxLength={EVENT_TITLE_MAX} autoFocus
                  placeholder="Rendez-vous chez le dentiste" onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="pp-champ"><label>Couleur</label><ColorPicker colors={EVENT_COLORS} value={color} onChange={setColor} /></div>
            </>
          )}
          <div className="pp-champ"><label>Jour</label><DaySelect dates={props.dates} value={date} onChange={setDate} /></div>
          <div className="pp-deux">
            <div className="pp-champ"><label>Début</label><input className="pp-inp" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="pp-champ"><label>Fin</label><div className="pp-inp pp-lecture">{timingError ? '—' : fmtTime(startMin + durationMin)}</div></div>
          </div>
          <div className="pp-champ"><label>Durée</label><DurationPicker value={durationMin} onChange={setDurationMin} /></div>
          {mode === 'routine' && (
            <div className="pp-champ"><label>Répétition</label>
              <label className="pp-radio"><input type="radio" checked={kind === 'once'} onChange={() => setKind('once')} /><span>Cette semaine seulement<small>Créneau ponctuel</small></span></label>
              <label className="pp-radio"><input type="radio" checked={kind === 'weekly'} onChange={() => setKind('weekly')} /><span>Chaque semaine<small>Reproduit à partir de cette semaine</small></span></label>
            </div>
          )}
          {error && <p className="pp-erreur-dlg">{error}</p>}
          <div className="pp-act">
            <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
            <button className="pp-btn pp-plein" disabled={!!error}
              onClick={() => (mode === 'routine'
                ? props.onSubmitSlot({ routineId, kind, date, startMin, durationMin })
                : props.onSubmitEvent({ title: title.trim(), color, date, startMin, durationMin }))}>
              {mode === 'routine' ? 'Placer' : 'Ajouter l’événement'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function EditDialog(props: {
  dates: string[];
  occ: Occurrence;
  initialDuration?: number;
  routine?: Routine;
  items: string[];
  ended: boolean;
  onCancel: () => void;
  onSave: (values: { date: string; startMin: number; durationMin: number }, scope: Scope, items: string[]) => void;
  onDelete: (scope: Scope) => void;
}) {
  const { occ } = props;
  const [date, setDate] = useState(occ.date);
  const [start, setStart] = useState(fmtTime(occ.startMin));
  const [durationMin, setDurationMin] = useState(props.initialDuration ?? occ.durationMin);
  const [scope, setScope] = useState<Scope>('this');
  const [items, setItems] = useState(props.items);
  const [draft, setDraft] = useState('');
  const weekly = occ.kind === 'weekly';
  const startMin = toMinutes(start);
  const error = validTiming(startMin, durationMin);

  const deleteLabel = !weekly ? 'Supprimer' : scope === 'this' ? 'Supprimer cette semaine' : 'Supprimer cette semaine et les suivantes';
  const confirmDelete = () => {
    const perdu = withDraft(items, draft).length;
    if (perdu && !window.confirm(`Ce créneau a ${perdu} ligne${perdu > 1 ? 's' : ''} dans « Ce que j’ai fait ». Elle${perdu > 1 ? 's seront supprimées' : ' sera supprimée'} aussi. Continuer ?`)) return;
    props.onDelete(scope);
  };

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
      <JournalEditor items={items} onChange={setItems} draft={draft} onDraft={setDraft} ended={props.ended} />
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        <button className="pp-btn pp-rouge" onClick={confirmDelete}>{deleteLabel}</button>
        <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
        <button className="pp-btn pp-plein" disabled={!!error} onClick={() => props.onSave({ date, startMin, durationMin }, scope, withDraft(items, draft))}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function EventDialog(props: {
  dates: string[];
  event: PlanningEvent;
  items: string[];
  ended: boolean;
  onCancel: () => void;
  onSave: (values: EventInput, items: string[]) => void;
  onDelete: () => void;
}) {
  const ev = props.event;
  const [title, setTitle] = useState(ev.title);
  const [color, setColor] = useState(ev.color);
  const [date, setDate] = useState(ev.date);
  const [start, setStart] = useState(fmtTime(ev.startMin));
  const [durationMin, setDurationMin] = useState(ev.durationMin);
  const [items, setItems] = useState(props.items);
  const [draft, setDraft] = useState('');
  const startMin = toMinutes(start);
  const timingError = validTiming(startMin, durationMin);
  const error = !title.trim() ? 'Donnez un titre à l’événement.' : timingError;
  const colors = EVENT_COLORS.includes(ev.color) ? EVENT_COLORS : [...EVENT_COLORS, ev.color];

  const confirmDelete = () => {
    const perdu = withDraft(items, draft).length;
    const detail = perdu ? ` et ses ${perdu} ligne${perdu > 1 ? 's' : ''} dans « Ce que j’ai fait »` : '';
    if (window.confirm(`Supprimer « ${ev.title} »${detail} ?`)) props.onDelete();
  };

  return (
    <Modal title="Modifier l’événement" onCancel={props.onCancel}>
      <p className="pp-info-dlg">◆ Événement ponctuel · ne compte dans aucun quota</p>
      <div className="pp-champ"><label htmlFor="pp-titre-evenement">Titre</label>
        <input id="pp-titre-evenement" className="pp-inp" value={title} maxLength={EVENT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="pp-champ"><label>Couleur</label><ColorPicker colors={colors} value={color} onChange={setColor} /></div>
      <div className="pp-champ"><label>Jour</label><DaySelect dates={props.dates} value={date} onChange={setDate} /></div>
      <div className="pp-deux">
        <div className="pp-champ"><label>Début</label><input className="pp-inp" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="pp-champ"><label>Fin</label><div className="pp-inp pp-lecture">{timingError ? '—' : fmtTime(startMin + durationMin)}</div></div>
      </div>
      <div className="pp-champ"><label>Durée</label><DurationPicker value={durationMin} onChange={setDurationMin} /></div>
      <JournalEditor items={items} onChange={setItems} draft={draft} onDraft={setDraft} ended={props.ended} />
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        <button className="pp-btn pp-rouge" onClick={confirmDelete}>Supprimer</button>
        <button className="pp-btn" onClick={props.onCancel}>Annuler</button>
        <button className="pp-btn pp-plein" disabled={!!error}
          onClick={() => props.onSave({ title: title.trim(), color, date, startMin, durationMin }, withDraft(items, draft))}>Enregistrer</button>
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
      <div className="pp-champ"><label>Couleur</label><ColorPicker colors={ROUTINE_COLORS} value={color} onChange={setColor} /></div>
      <div className="pp-champ"><label>Quota hebdomadaire (heures)</label>
        <input className="pp-inp" type="number" min={0} step={0.25} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="10" />
      </div>
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        {r && (
          <button className="pp-btn pp-rouge" onClick={() => {
            const detail = props.slotCount ? ` et ses ${props.slotCount} créneau${props.slotCount > 1 ? 'x' : ''} (bilans compris)` : '';
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
.pp-fleche:disabled{opacity:.35;cursor:not-allowed}
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
.pp-evenement{border-radius:6px;box-shadow:inset 3px 0 0 rgba(255,255,255,.75);
  background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.14) 0 6px,transparent 6px 12px)}
.pp-fait{position:absolute;right:3px;bottom:8px;font-size:.56rem;font-weight:700;line-height:1.3;background:rgba(255,255,255,.92);color:var(--navy);padding:0 4px;border-radius:6px;pointer-events:none}
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
.pp-resume{display:grid;gap:2px;margin:0 0 16px;padding:9px 11px;background:#fff;border:1px solid var(--border);border-left:3px solid #3f7d5c;font-size:.76rem}
.pp-resume b{font-size:.8rem}
.pp-resume span{color:var(--soft)}
.pp-resume a{color:var(--navy);font-weight:600;font-size:.74rem}
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
.pp-legende-evenement{background:#546e7a;border-radius:4px !important;box-shadow:inset 2px 0 0 rgba(255,255,255,.75)}
.pp-legende-fait{font-size:.6rem;background:#fff;border:1px solid var(--border);color:var(--navy);padding:0 4px;border-radius:6px}

/* ---------- bilan heure par heure ---------- */
.pp-bilan{padding:20px 22px 34px;border-top:3px solid var(--navy);scroll-margin-top:10px}
.pp-bilan-tete{display:flex;align-items:baseline;gap:4px 12px;flex-wrap:wrap;margin-bottom:14px}
.pp-bilan-tete h2{font-family:Fraunces,Georgia,serif;font-size:1.15rem;margin:0}
.pp-bilan-semaine{font-weight:600;font-size:.84rem}
.pp-bilan-tete p{flex-basis:100%;margin:2px 0 0;font-size:.74rem;color:var(--soft)}
.pp-bilan-jours{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;align-items:start}
.pp-bilan-jour{background:#fff;border:1px solid var(--border);border-top:3px solid var(--navy);padding:10px 12px;break-inside:avoid}
.pp-bilan-jour h3{font-family:Fraunces,Georgia,serif;font-size:.92rem;margin:0 0 4px}
.pp-bilan-ligne{display:grid;grid-template-columns:88px minmax(0,1fr);gap:2px 10px;padding:6px 0;border-top:1px dashed #e6dfd2;font-size:.8rem;break-inside:avoid}
.pp-bilan-jour h3+.pp-bilan-ligne{border-top:none}
.pp-bilan-h{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pp-bilan-titre{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;font-weight:600;min-width:0}
.pp-bilan-titre i{width:10px;height:10px;border-radius:2px;flex:none;display:inline-block}
.pp-bilan-titre small{font-weight:500;color:var(--soft);font-size:.68rem}
.pp-bilan-cours{color:var(--soft);font-weight:500}
.pp-bilan-ouvrir{border:none;background:none;padding:0;font:inherit;color:inherit;text-align:left;display:inline-flex;align-items:center;gap:6px}
.pp-bilan-ouvrir:hover span{text-decoration:underline}
.pp-bilan-ligne ul{grid-column:2;margin:3px 0 0;padding-left:17px}
.pp-bilan-ligne li{margin:1px 0;line-height:1.4;overflow-wrap:anywhere}
.pp-a-completer{grid-column:2;justify-self:start;margin-top:3px;border:1px dashed var(--gold);background:#fdf6e6;color:#8a6614;font-size:.68rem;font-weight:700;padding:1px 8px}

.pp-mobile{display:none}

.pp-voile{position:fixed;inset:0;z-index:50;background:rgba(13,43,69,.35);display:grid;place-items:center;padding:16px}
.pp-dlg{background:#fff;border:1px solid var(--border);border-top:3px solid var(--navy);width:100%;max-width:420px;max-height:92vh;overflow:auto;padding:18px 20px;box-shadow:0 12px 32px rgba(13,43,69,.2)}
.pp-dlg h3{font-family:Fraunces,Georgia,serif;font-size:1.02rem;margin:0 0 12px}
.pp-onglets{display:flex;margin:0 0 14px;border:1.5px solid var(--navy)}
.pp-onglets button{flex:1;border:none;background:#fff;color:var(--navy);padding:7px 6px;font-weight:600;font-size:.8rem}
.pp-onglets button.pp-on{background:var(--navy);color:#fff}
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
.pp-journal-zone{padding-top:12px;border-top:1px solid var(--border)}
.pp-note-dlg{font-size:.72rem;color:var(--soft);margin:0 0 6px}
.pp-journal{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:4px}
.pp-journal li{display:flex;gap:8px;align-items:flex-start;background:var(--cream);border-left:3px solid #3f7d5c;padding:5px 8px;font-size:.82rem;line-height:1.35}
.pp-journal li span{flex:1;min-width:0;overflow-wrap:anywhere}
.pp-journal li button{border:none;background:none;color:var(--soft);font-size:1.05rem;line-height:1;padding:0 2px}
.pp-journal-ajout{display:flex;gap:6px}
.pp-journal-ajout .pp-btn{flex:none}
.pp-erreur-dlg{font-size:.76rem;color:var(--red);margin:0 0 8px}
.pp-act{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}

/* ---------- mobile : liste par jour ---------- */
@media (max-width:720px){
  .pp-barre{padding:12px 14px;gap:8px}
  .pp-barre h1{flex-basis:100%;font-size:1.15rem}
  .pp-semaine{flex-basis:100%;justify-content:space-between}
  .pp-titre-semaine{min-width:0;font-size:.82rem}
  .pp-barre .pp-btn{flex:1 1 40%;padding:8px 6px;font-size:.74rem}
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
  .pp-item em.pp-item-fait{color:#2e6b4a}
  .pp-item-cours{background:var(--navy);color:#fff;border-color:var(--navy)}
  .pp-item-cours span{color:rgba(255,255,255,.72)}
  .pp-item-conflit b{text-decoration:line-through;opacity:.6}
  .pp-fab{position:absolute;right:14px;bottom:10px;width:50px;height:50px;border-radius:50%;border:none;background:var(--navy);color:#fff;font-size:1.6rem;box-shadow:3px 3px 0 var(--gold)}
  .pp-bilan{padding:16px 12px 28px}
  .pp-bilan-jours{grid-template-columns:minmax(0,1fr)}
  .pp-bilan-ligne{grid-template-columns:78px minmax(0,1fr)}
}

/* ---------- impression : page 1 = semaine en A4 paysage, pages suivantes = bilan ---------- */
@page{size:A4 landscape;margin:8mm}
@media print{
  .pp{min-height:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
  .pp-barre,.pp-messages,.pp-mobile,.pp-voile,.pp-crayon,.pp-poignee,.pp-arrondi,.pp-resume,.pp-a-completer{display:none !important}
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
  .pp-fait{font-size:6.5px;bottom:2px}
  .pp-panneau{display:block !important;padding:6px 3mm 0 8px;border-top:none !important;min-width:0;overflow:hidden}
  .pp-chiffres{flex-wrap:wrap;gap:0 6px}
  .pp-panneau h2{font-size:12px}
  .pp-sous{font-size:8px;margin-bottom:8px}
  .pp-quota{padding:6px 0;break-inside:avoid}
  .pp-quota-tete{font-size:10px}
  .pp-chiffres,.pp-deplace,.pp-legende{font-size:8.5px}
  .pp-bilan{break-before:page;border-top:2px solid var(--navy);padding:4px 0 0}
  .pp-bilan-tete{margin-bottom:6px}
  .pp-bilan-tete h2{font-size:13px}
  .pp-bilan-semaine{font-size:10px}
  .pp-bilan-tete p{display:none}
  .pp-bilan-jours{display:block;column-count:3;column-gap:5mm}
  .pp-bilan-jour{margin:0 0 4mm;padding:5px 7px;border-color:#cfc8bb}
  .pp-bilan-jour h3{font-size:10px}
  .pp-bilan-ligne{grid-template-columns:58px minmax(0,1fr);font-size:8.5px;padding:3px 0;gap:1px 6px}
  .pp-bilan-titre small{font-size:7px}
  .pp-bilan-ouvrir{cursor:default}
}
`;
