'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, SVGProps } from 'react';
import { EMPTY_SCHEDULE, withDefaults } from '@/lib/schedule';
import type { Schedule } from '@/lib/schedule';
import {
  DAY_END_MIN, DAY_START_MIN, DEFAULT_SETTINGS, EMPTY_PLANNING, EVENT_COLORS, EVENT_TITLE_MAX, JOURNAL_ITEM_MAX, JOURNAL_MAX_ITEMS,
  JOURNAL_NOTES_MAX, RETENTION_WEEKS, ROUNDING_OPTIONS, ROUTINE_COLORS, WEEKDAY_NAMES,
  addDays, addEvent, addRoutine, addSlot, deleteEvent, deleteOccurrence, deleteRoutine, eventRef, eventsForWeek,
  fmtDuration, fmtTime, lessonsForWeek, normalizeNotes, nowInParis, occurrenceRef, occurrencesForWeek, retentionStart, setJournal, setRounding,
  updateEvent, updateOccurrence, updateRoutine, weekDates, weekStartOf, weeklyQuotas,
} from '@/lib/planning';
import type {
  EventInput, JournalEntry, Lesson, Occurrence, PlacementDefaults, Planning, PlanningEvent, PreplyBusy, Routine, RoundingMin, Scope,
} from '@/lib/planning';

/* ======================= réglages ======================= */

const K = 1.1; // pixels par minute à l'écran (réduit à l'impression)
const DURATIONS = [25, 50, 60];
const INK = '#1b1340';

type Dialog =
  | { type: 'place'; date: string; startMin: number; mode: 'routine' | 'event' }
  | { type: 'edit'; occ: Occurrence; durationMin?: number }
  | { type: 'event'; event: PlanningEvent }
  | { type: 'routine'; routine?: Routine }
  | null;

/** Bloc personnel affiché dans la grille : occurrence de routine ou événement ponctuel. */
type Bloc = { key: string; startMin: number; endMin: number; occ?: Occurrence; event?: PlanningEvent };

const EMPTY_ENTRY: JournalEntry = { ref: '', items: [] };

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

/** Texte foncé sur les couleurs claires (citron vert, jaune…), blanc sinon. */
function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? INK : '#ffffff';
}

/** Paragraphes d'un journal (séparés par une ligne vide). */
const paragraphs = (notes: string) => notes.split(/\n{2,}/).filter((p) => p.trim());

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

/** Hexagone tricolore du logo (bandes découpées à la main, rendu identique partout). */
function HexDrapeau(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true" focusable="false" {...props}>
      <polygon points="1,7 8,3.18 8,24.82 1,21" fill="#002395" />
      <polygon points="8,3.18 12,1 16,3.18 16,24.82 12,27 8,24.82" fill="#ffffff" />
      <polygon points="16,3.18 23,7 23,21 16,24.82" fill="#ED2939" />
      <polygon points="12,1 23,7 23,21 12,27 1,21 1,7" fill="none" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
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
  const journal = useMemo(() => new Map((planning.journal ?? []).map((j) => [j.ref, j])), [planning.journal]);
  const rounding = planning.settings?.countRoundingMin ?? DEFAULT_SETTINGS.countRoundingMin;
  const oldestWeek = retentionStart(today);
  const isEnded = (date: string, endMin: number) => date < clock.date || (date === clock.date && endMin <= clock.minutes);

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
        <div className="pp-logo">
          <a href="/admin" aria-label="Retour à l’administration" title="Administration"><HexDrapeau /></a>
          <div>
            <small>French with Alban</small>
            <h1>Planning personnel</h1>
          </div>
        </div>
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
          <h2><HexDrapeau className="pp-h2-hex" />Quotas de la semaine</h2>
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
                <div className="pp-jauge"><i style={{ width: `${pct}%`, background: q.overMin ? '#ff5fa2' : r.color }} /></div>
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
            <span><i style={{ background: INK }} />Cours (lecture seule)</span>
            <span><i style={{ background: INK, boxShadow: 'inset 0 -4px 0 #ffe45c' }} />Créneau occupé Preply</span>
            <span><i style={{ background: '#c8f560' }} />↻ routine hebdomadaire · sans ↻ : ponctuelle</span>
            <span><i className="pp-legende-evenement" />◆ événement ponctuel, hors routine</span>
            <span><i className="pp-legende-conflit" />Routine écrasée par un cours</span>
            <span><b className="pp-legende-fait">✓ 2 ✎</b>Lignes « Ce que j’ai fait » · ✎ journal</span>
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
          entry={journal.get(occurrenceRef(dialog.occ)) ?? EMPTY_ENTRY}
          ended={isEnded(dialog.occ.date, dialog.occ.endMin)}
          onCancel={() => setDialog(null)}
          onSave={(values, scope, items, notes) => {
            const occ = dialog.occ;
            setDialog(null);
            // le bilan d'abord : en cas de scission de la série, il suit la nouvelle série
            let next = setJournal(planning, occurrenceRef(occ), items, notes);
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
          entry={journal.get(eventRef(dialog.event.id)) ?? EMPTY_ENTRY}
          ended={isEnded(dialog.event.date, dialog.event.startMin + dialog.event.durationMin)}
          onCancel={() => setDialog(null)}
          onSave={(values, items, notes) => {
            const id = dialog.event.id;
            setDialog(null);
            persist(setJournal(updateEvent(planning, id, values), eventRef(id), items, notes));
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

function faitBadge(entry: JournalEntry | undefined) {
  const count = entry?.items.length ?? 0;
  const parts = [count > 0 ? `✓ ${count}` : '', entry?.notes ? '✎' : ''].filter(Boolean);
  if (!parts.length) return null;
  const title = [count > 0 ? `${count} ligne${count > 1 ? 's' : ''} dans « Ce que j’ai fait »` : '', entry?.notes ? 'journal rempli' : ''].filter(Boolean).join(' · ');
  return <span className="pp-fait" title={title}>{parts.join(' ')}</span>;
}

function DayColumn(props: {
  date: string;
  isToday: boolean;
  lessons: Lesson[];
  occurrences: Occurrence[];
  events: PlanningEvent[];
  routineById: Map<string, Routine>;
  journal: Map<string, JournalEntry>;
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
              {faitBadge(journal.get(occurrenceRef(o)))}
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
            {faitBadge(journal.get(eventRef(ev.id)))}
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
  journal: Map<string, JournalEntry>;
  onEdit: (occ: Occurrence) => void;
  onEditEvent: (event: PlanningEvent) => void;
}) {
  type Item = { start: number; key: string; node: ReactNode };
  const fait = (entry: JournalEntry | undefined) => {
    const count = entry?.items.length ?? 0;
    const parts = [count > 0 ? `✓ ${count} ligne${count > 1 ? 's' : ''} notée${count > 1 ? 's' : ''}` : '', entry?.notes ? '✎ journal' : ''].filter(Boolean);
    return parts.length ? <em className="pp-item-fait">{parts.join(' · ')}</em> : null;
  };
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
              {fait(props.journal.get(occurrenceRef(o)))}
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
            {fait(props.journal.get(eventRef(ev.id)))}
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
  journal: Map<string, JournalEntry>;
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
        node: <div className="pp-bilan-titre pp-bilan-cours"><i style={{ background: INK }} /><span>{l.source === 'preply' ? 'Occupé (Preply)' : `Cours · ${l.label}`}</span></div>,
      });
    }
    for (const o of props.occurrences.filter((x) => x.date === date)) {
      const r = props.routineById.get(o.routineId);
      if (!r) continue;
      lignes.push({
        key: `r-${o.slotId}`, startMin: o.startMin, endMin: o.endMin,
        node: (
          <Entree entry={props.journal.get(occurrenceRef(o))} ended={props.isEnded(o.date, o.endMin)} onOpen={() => props.onOpenOcc(o)}
            color={r.color} title={r.name} tag={o.kind === 'weekly' ? 'routine hebdomadaire' : 'routine ponctuelle'} />
        ),
      });
    }
    for (const ev of props.events.filter((x) => x.date === date)) {
      lignes.push({
        key: `e-${ev.id}`, startMin: ev.startMin, endMin: ev.startMin + ev.durationMin,
        node: (
          <Entree entry={props.journal.get(eventRef(ev.id))} ended={props.isEnded(ev.date, ev.startMin + ev.durationMin)} onOpen={() => props.onOpenEvent(ev)}
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
        <h2><HexDrapeau className="pp-h2-hex" />Bilan de la semaine</h2>
        <span className="pp-bilan-semaine">{props.label}</span>
        <p>Heure par heure, avec ce que vous avez fait et votre journal pour chaque créneau. Ce bilan figure aussi dans le PDF. Les semaines passées restent disponibles 12 mois.</p>
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

function Entree(props: { entry?: JournalEntry; ended: boolean; onOpen: () => void; color: string; title: string; tag: string }) {
  const items = props.entry?.items ?? [];
  const notes = props.entry?.notes ?? '';
  return (
    <>
      <div className="pp-bilan-titre">
        <button type="button" className="pp-bilan-ouvrir" onClick={props.onOpen}>
          <i style={{ background: props.color }} /><span>{props.title}</span>
        </button>
        <small>{props.tag}</small>
      </div>
      {items.length > 0 && <ul>{items.map((it, k) => <li key={k}>{it}</li>)}</ul>}
      {notes && (
        <div className="pp-bilan-notes">
          {paragraphs(notes).map((p, k) => <p key={k}>{p}</p>)}
        </div>
      )}
      {items.length === 0 && !notes && props.ended && (
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

/** Fenêtre modale : Échap ou clic sur le fond appellent onCancel (qui peut demander confirmation). */
function Modal({ title, children, onCancel, large }: { title: string; children: ReactNode; onCancel: () => void; large?: boolean }) {
  const cancelRef = useRef(onCancel);
  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancelRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    // mousedown plutôt que click : une sélection de texte qui déborde de la fenêtre ne la ferme pas
    <div className="pp-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={`pp-dlg ${large ? 'pp-dlg-large' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
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
  const list = colors.includes(value) ? colors : [...colors, value]; // une couleur d'avant reste sélectionnable
  return (
    <div className="pp-couleurs">
      {list.map((c) => (
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
      <div className="pp-section-tete">
        <label htmlFor="pp-journal-saisie">Ce que j’ai fait</label>
        <small>une action par ligne</small>
      </div>
      {!props.ended && <p className="pp-note-dlg">Ce créneau n’est pas encore terminé : vous pourrez compléter ensuite.</p>}
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

/** Journal libre, sur plusieurs paragraphes (une ligne vide sépare deux paragraphes). */
function NotesEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const long = value.length > JOURNAL_NOTES_MAX * 0.8;
  return (
    <div className="pp-champ pp-journal-zone pp-notes-zone">
      <div className="pp-section-tete">
        <label htmlFor="pp-journal-notes">Journal</label>
        <small>notes libres · laissez une ligne vide entre deux paragraphes</small>
      </div>
      <textarea id="pp-journal-notes" className="pp-inp pp-notes" value={value} maxLength={JOURNAL_NOTES_MAX} rows={8}
        placeholder={'Comment ça s’est passé, ce que vous avez appris, ce qu’il reste à faire…\n\nUn autre paragraphe si besoin.'}
        onChange={(e) => onChange(e.target.value)} />
      {long && <small className="pp-compteur">{value.length.toLocaleString('fr-FR')} / {JOURNAL_NOTES_MAX.toLocaleString('fr-FR')} caractères</small>}
    </div>
  );
}

const withDraft = (items: string[], draft: string) => (draft.trim() ? [...items, draft.trim()] : items);
const ABANDON = 'Abandonner les modifications non enregistrées ?';

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
  entry: JournalEntry;
  ended: boolean;
  onCancel: () => void;
  onSave: (values: { date: string; startMin: number; durationMin: number }, scope: Scope, items: string[], notes: string) => void;
  onDelete: (scope: Scope) => void;
}) {
  const { occ } = props;
  const [date, setDate] = useState(occ.date);
  const [start, setStart] = useState(fmtTime(occ.startMin));
  const [durationMin, setDurationMin] = useState(props.initialDuration ?? occ.durationMin);
  const [scope, setScope] = useState<Scope>('this');
  const [items, setItems] = useState(props.entry.items);
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState(props.entry.notes ?? '');
  const weekly = occ.kind === 'weekly';
  const startMin = toMinutes(start);
  const error = validTiming(startMin, durationMin);

  const dirty = date !== occ.date || startMin !== occ.startMin || durationMin !== occ.durationMin || !!draft.trim()
    || JSON.stringify(items) !== JSON.stringify(props.entry.items) || normalizeNotes(notes) !== (props.entry.notes ?? '');
  const annuler = () => { if (!dirty || window.confirm(ABANDON)) props.onCancel(); };

  const deleteLabel = !weekly ? 'Supprimer' : scope === 'this' ? 'Supprimer cette semaine' : 'Supprimer cette semaine et les suivantes';
  const confirmDelete = () => {
    const perdu = withDraft(items, draft).length;
    const journalPerdu = normalizeNotes(notes) ? ' et le journal' : '';
    if ((perdu || journalPerdu) && !window.confirm(`Ce créneau a ${perdu ? `${perdu} ligne${perdu > 1 ? 's' : ''} dans « Ce que j’ai fait »` : 'du contenu'}${journalPerdu}. Tout sera supprimé. Continuer ?`)) return;
    props.onDelete(scope);
  };

  return (
    <Modal title={weekly ? 'Modifier un créneau hebdomadaire' : 'Modifier un créneau'} onCancel={annuler} large>
      <p className="pp-info-dlg">
        {weekly ? '↻ ' : ''}{props.routine?.name} · {weekly ? `chaque ${WEEKDAY_NAMES[props.dates.indexOf(occ.date)]?.toLowerCase() ?? ''}` : 'ponctuel'}
        {occ.moved ? ' · déplacé cette semaine' : ''}
        {occ.displacedMin > 0 ? ` · ${fmtDuration(occ.displacedMin)} écrasées par un cours` : ''}
      </p>
      <div className="pp-horaires">
        <div className="pp-champ"><label>Jour</label><DaySelect dates={props.dates} value={date} onChange={setDate} /></div>
        <div className="pp-deux">
          <div className="pp-champ"><label>Début</label><input className="pp-inp" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="pp-champ"><label>Fin</label><div className="pp-inp pp-lecture">{error ? '—' : fmtTime(startMin + durationMin)}</div></div>
        </div>
      </div>
      <div className="pp-champ"><label>Durée</label><DurationPicker value={durationMin} onChange={setDurationMin} /></div>
      {weekly && (
        <div className="pp-champ"><label>Appliquer à</label>
          <label className="pp-radio"><input type="radio" checked={scope === 'this'} onChange={() => setScope('this')} /><span>Cette semaine seulement<small>Les autres semaines ne changent pas</small></span></label>
          <label className="pp-radio"><input type="radio" checked={scope === 'future'} onChange={() => setScope('future')} /><span>Cette semaine et toutes les suivantes<small>Les semaines passées ne changent pas</small></span></label>
        </div>
      )}
      <JournalEditor items={items} onChange={setItems} draft={draft} onDraft={setDraft} ended={props.ended} />
      <NotesEditor value={notes} onChange={setNotes} />
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        <button className="pp-btn pp-rouge" onClick={confirmDelete}>{deleteLabel}</button>
        <button className="pp-btn" onClick={annuler}>Annuler</button>
        <button className="pp-btn pp-plein" disabled={!!error} onClick={() => props.onSave({ date, startMin, durationMin }, scope, withDraft(items, draft), notes)}>Enregistrer</button>
      </div>
    </Modal>
  );
}

function EventDialog(props: {
  dates: string[];
  event: PlanningEvent;
  entry: JournalEntry;
  ended: boolean;
  onCancel: () => void;
  onSave: (values: EventInput, items: string[], notes: string) => void;
  onDelete: () => void;
}) {
  const ev = props.event;
  const [title, setTitle] = useState(ev.title);
  const [color, setColor] = useState(ev.color);
  const [date, setDate] = useState(ev.date);
  const [start, setStart] = useState(fmtTime(ev.startMin));
  const [durationMin, setDurationMin] = useState(ev.durationMin);
  const [items, setItems] = useState(props.entry.items);
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState(props.entry.notes ?? '');
  const startMin = toMinutes(start);
  const timingError = validTiming(startMin, durationMin);
  const error = !title.trim() ? 'Donnez un titre à l’événement.' : timingError;

  const dirty = title !== ev.title || color !== ev.color || date !== ev.date || startMin !== ev.startMin || durationMin !== ev.durationMin || !!draft.trim()
    || JSON.stringify(items) !== JSON.stringify(props.entry.items) || normalizeNotes(notes) !== (props.entry.notes ?? '');
  const annuler = () => { if (!dirty || window.confirm(ABANDON)) props.onCancel(); };

  const confirmDelete = () => {
    const perdu = withDraft(items, draft).length;
    const details = [perdu ? `ses ${perdu} ligne${perdu > 1 ? 's' : ''} dans « Ce que j’ai fait »` : '', normalizeNotes(notes) ? 'son journal' : ''].filter(Boolean).join(' et ');
    if (window.confirm(`Supprimer « ${ev.title} »${details ? ` avec ${details}` : ''} ?`)) props.onDelete();
  };

  return (
    <Modal title="Modifier l’événement" onCancel={annuler} large>
      <p className="pp-info-dlg">◆ Événement ponctuel · ne compte dans aucun quota</p>
      <div className="pp-champ"><label htmlFor="pp-titre-evenement">Titre</label>
        <input id="pp-titre-evenement" className="pp-inp" value={title} maxLength={EVENT_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="pp-champ"><label>Couleur</label><ColorPicker colors={EVENT_COLORS} value={color} onChange={setColor} /></div>
      <div className="pp-horaires">
        <div className="pp-champ"><label>Jour</label><DaySelect dates={props.dates} value={date} onChange={setDate} /></div>
        <div className="pp-deux">
          <div className="pp-champ"><label>Début</label><input className="pp-inp" type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="pp-champ"><label>Fin</label><div className="pp-inp pp-lecture">{timingError ? '—' : fmtTime(startMin + durationMin)}</div></div>
        </div>
      </div>
      <div className="pp-champ"><label>Durée</label><DurationPicker value={durationMin} onChange={setDurationMin} /></div>
      <JournalEditor items={items} onChange={setItems} draft={draft} onDraft={setDraft} ended={props.ended} />
      <NotesEditor value={notes} onChange={setNotes} />
      {error && <p className="pp-erreur-dlg">{error}</p>}
      <div className="pp-act">
        <button className="pp-btn pp-rouge" onClick={confirmDelete}>Supprimer</button>
        <button className="pp-btn" onClick={annuler}>Annuler</button>
        <button className="pp-btn pp-plein" disabled={!!error}
          onClick={() => props.onSave({ title: title.trim(), color, date, startMin, durationMin }, withDraft(items, draft), notes)}>Enregistrer</button>
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
            const detail = props.slotCount ? ` et ses ${props.slotCount} créneau${props.slotCount > 1 ? 'x' : ''} (bilans et journaux compris)` : '';
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

/* ======================= styles (style acidulé du site) ======================= */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&display=swap');
.pp{--ink:#1b1340;--soft:#564f70;--bg:#fff7ee;--lime:#c8f560;--pink:#ff5fa2;--rose:#c81d64;--aqua:#3ee0c6;--lemon:#ffe45c;--orange:#ff8a3d;--violet:#7c5cff;
  --ligne:#efe6d8;--ligne-h:#e2d6c2;--titre:'Bricolage Grotesque',Inter,system-ui,sans-serif;
  min-height:100vh;color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:14px;color-scheme:light;
  background:radial-gradient(circle at 3% 0%,rgba(200,245,96,.42) 0,transparent 26%),radial-gradient(circle at 100% 26%,rgba(62,224,198,.2) 0,transparent 24%),radial-gradient(circle at 0% 100%,rgba(255,228,92,.32) 0,transparent 28%),var(--bg)}
.pp *{box-sizing:border-box}
.pp button{font-family:inherit;cursor:pointer}
.pp :focus-visible{outline:3px solid var(--violet);outline-offset:2px}
.pp-etat{padding:40px;text-align:center;color:var(--soft)}

/* ---------- barre du haut ---------- */
.pp-barre{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px 12px;flex-wrap:wrap;padding:12px 22px;background:rgba(255,255,255,.96);border-bottom:3px solid var(--ink)}
.pp-logo{display:flex;align-items:center;gap:12px;margin-right:auto;min-width:0}
.pp-logo a{display:block;line-height:0}
.pp-logo svg{width:32px;height:38px;rotate:-12deg;filter:drop-shadow(2px 3px 0 var(--ink))}
.pp-logo small{display:block;font-size:.6rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.pp-barre h1{font-family:var(--titre);font-size:1.5rem;font-weight:800;letter-spacing:-.025em;line-height:1.05;margin:0}
.pp-semaine{display:flex;align-items:center;gap:8px}
.pp-fleche{width:36px;height:36px;border-radius:50%;border:2.5px solid var(--ink);background:#fff;color:var(--ink);font-size:1.2rem;line-height:1;box-shadow:2px 2px 0 var(--ink)}
.pp-fleche:hover:not(:disabled){background:var(--lemon)}
.pp-fleche:disabled{opacity:.3;cursor:not-allowed;box-shadow:none}
.pp-titre-semaine{font-family:var(--titre);font-weight:700;font-size:1rem;min-width:250px;text-align:center}
.pp-btn{border:2.5px solid var(--ink);background:#fff;color:var(--ink);padding:7px 15px;border-radius:99px;font-weight:700;font-size:.8rem;box-shadow:2px 2px 0 var(--ink);transition:translate .12s,box-shadow .12s}
.pp-btn:hover:not(:disabled){translate:-1px -1px;box-shadow:3px 3px 0 var(--ink)}
.pp-btn:disabled{opacity:.4;cursor:default;box-shadow:none}
.pp-plein{background:var(--ink);color:#fff;box-shadow:3px 3px 0 var(--pink)}
.pp-plein:hover:not(:disabled){box-shadow:4px 4px 0 var(--pink)}
.pp-or{background:var(--lemon)}
.pp-rouge{background:#ffe1ee;margin-right:auto}
.pp-filet,.pp-impression-titre{display:none}

.pp-messages{padding:14px 22px 0;display:grid;gap:8px}
.pp-messages p{margin:0;padding:9px 14px;font-size:.84rem;border:2px solid var(--ink);border-radius:12px;box-shadow:2px 2px 0 var(--ink)}
.pp-erreur{background:#ffe1ee;color:var(--ink)}
.pp-avert{background:#fff4c2;color:var(--ink)}
.pp-info{background:#fff;color:var(--soft)}

/* ---------- grille ---------- */
.pp-corps{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;padding:20px 22px;align-items:start}
.pp-grille-zone{background:#fff;border:3px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);padding:10px 12px 14px 0;min-width:0}
.pp-entetes,.pp-grille{display:grid;grid-template-columns:52px repeat(7,minmax(0,1fr))}
.pp-entetes>div{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--soft);padding:2px 0 8px}
.pp-entetes b{font-family:var(--titre);font-size:1.25rem;font-weight:800;letter-spacing:0;color:var(--ink);line-height:1.2;padding:0 8px;border:2px solid transparent;border-radius:10px}
.pp-entetes .pp-auj{color:var(--ink)}
.pp-entetes .pp-auj b{background:var(--lime);border-color:var(--ink);box-shadow:2px 2px 0 var(--ink)}
.pp-heures{position:relative;height:calc(var(--total) * var(--k) * 1px)}
.pp-heures span{position:absolute;right:8px;top:calc(var(--s) * var(--k) * 1px);transform:translateY(-50%);font-size:.66rem;font-weight:600;color:var(--soft)}
.pp-jour{position:relative;height:calc(var(--total) * var(--k) * 1px);border-left:1.5px solid var(--ligne);cursor:copy;
  background-image:linear-gradient(var(--ligne-h) 1px,transparent 1px),linear-gradient(var(--ligne) 1px,transparent 1px);
  background-size:100% calc(60 * var(--k) * 1px),100% calc(30 * var(--k) * 1px)}
.pp-jour.pp-auj{background-color:rgba(200,245,96,.16)}

.pp-bloc{position:absolute;top:calc(var(--s) * var(--k) * 1px);height:calc(var(--d) * var(--k) * 1px);padding:2px 6px;
  font-size:.68rem;line-height:1.25;overflow:hidden;border-radius:7px;border:1.5px solid var(--ink);cursor:pointer}
.pp-nom{font-family:var(--titre);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pp-heure{font-size:.62rem;font-weight:500;opacity:.92;white-space:nowrap}
.pp-routine{z-index:1;left:calc(3px + (100% - 6px) * var(--lane) / var(--lanes));width:calc((100% - 6px) / var(--lanes) - 2px)}
.pp-routine:hover{filter:brightness(1.05);z-index:2}
.pp-evenement{border-radius:12px;border-width:2px;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0 6px,transparent 6px 12px)}
.pp-fait{position:absolute;right:3px;bottom:8px;font-size:.56rem;font-weight:700;line-height:1.3;background:#fff;color:var(--ink);border:1.5px solid var(--ink);padding:0 4px;border-radius:99px;pointer-events:none}
.pp-conflit{opacity:.45;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.5) 0 4px,transparent 4px 9px)}
.pp-conflit .pp-nom{text-decoration:line-through}
.pp-badge{position:absolute;z-index:4;top:calc(var(--s) * var(--k) * 1px - 8px);left:calc(5px + (100% - 6px) * var(--lane) / var(--lanes));
  font-size:.58rem;font-weight:700;background:var(--pink);color:#fff;border:1.5px solid var(--ink);padding:0 6px;border-radius:99px;white-space:nowrap;pointer-events:none}
.pp-poignee{position:absolute;left:0;right:0;bottom:0;height:6px;cursor:ns-resize;background:rgba(27,19,64,.22);touch-action:none}
.pp-coupe{position:absolute;right:3px;top:1px;font-size:.55rem;font-weight:700}
.pp-coupe-bas{top:auto;bottom:6px}
.pp-cours{z-index:3;left:3px;right:3px;background:var(--ink);color:#fff;cursor:default}
.pp-decale{left:22%}
.pp-preply{box-shadow:inset 0 -3px 0 var(--lemon)}
.pp-src{display:inline-block;margin-left:4px;padding:0 5px;border-radius:99px;background:var(--lemon);color:var(--ink);font-family:Inter,sans-serif;font-size:.5rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}

/* ---------- panneau ---------- */
.pp-panneau{background:#fff;border:3px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);padding:16px 18px}
.pp-panneau h2,.pp-bilan-tete h2{display:flex;align-items:center;gap:10px;font-family:var(--titre);font-size:1.25rem;font-weight:800;letter-spacing:-.02em;margin:0 0 4px}
.pp-h2-hex{width:22px;height:26px;flex:none;rotate:-12deg;filter:drop-shadow(1.5px 2px 0 var(--ink))}
.pp-resume{display:grid;gap:2px;margin:0 0 16px;padding:10px 12px;background:var(--lime);border:2.5px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);font-size:.78rem}
.pp-resume b{font-family:var(--titre);font-size:.95rem;font-weight:800}
.pp-resume a{color:var(--ink);font-weight:700;font-size:.76rem}
.pp-sous{font-size:.74rem;color:var(--soft);margin:0 0 14px;line-height:1.45}
.pp-vide{font-size:.82rem;color:var(--soft)}
.pp-arrondi{display:block;margin:0 0 14px}
.pp-arrondi>span{display:block;font-size:.64rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin-bottom:5px}
.pp-arrondi select{padding:6px 8px;font-size:.8rem}
.pp-arrondi small{display:block;font-size:.7rem;color:var(--soft);margin-top:5px;line-height:1.35}
.pp-arrondi-impression{display:none}
.pp-quota{padding:12px 0;border-top:2px dashed var(--ligne-h)}
.pp-quota-tete{display:flex;align-items:center;gap:8px;font-weight:700;font-size:.88rem}
.pp-pastille-couleur{width:14px;height:14px;border-radius:4px;border:1.5px solid var(--ink);flex:none}
.pp-quota-nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pp-quota-obj{font-size:.72rem;color:var(--soft);font-weight:600}
.pp-crayon{border:none;background:none;color:var(--ink);font-size:.95rem;padding:0 2px}
.pp-jauge{height:11px;background:#fff;border:2px solid var(--ink);border-radius:99px;margin:8px 0 6px;position:relative;overflow:hidden}
.pp-jauge i{position:absolute;left:0;top:0;bottom:0;border-right:2px solid var(--ink)}
.pp-chiffres{display:flex;justify-content:space-between;font-size:.76rem}
.pp-reste{font-weight:700}
.pp-depasse{color:var(--rose);font-weight:800}
.pp-deplace{margin-top:6px;font-size:.72rem;background:#fff4c2;border:1.5px solid var(--ink);border-radius:8px;padding:3px 8px}
.pp-legende{margin-top:14px;padding-top:12px;border-top:2px dashed var(--ligne-h);font-size:.72rem;color:var(--soft);display:grid;gap:7px}
.pp-legende span{display:flex;align-items:center;gap:8px}
.pp-legende i{width:18px;height:12px;display:inline-block;border-radius:4px;border:1.5px solid var(--ink);flex:none}
.pp-legende-conflit{background:#c8f560;opacity:.5;background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.55) 0 3px,transparent 3px 7px)}
.pp-legende-evenement{background:#b197fc;border-radius:7px !important;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.35) 0 3px,transparent 3px 6px)}
.pp-legende-fait{font-size:.6rem;background:#fff;border:1.5px solid var(--ink);color:var(--ink);padding:0 5px;border-radius:99px;white-space:nowrap}

/* ---------- bilan heure par heure ---------- */
.pp-bilan{margin:0 22px 34px;background:#fff;border:3px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);padding:18px 20px 22px;scroll-margin-top:90px}
.pp-bilan-tete{display:flex;align-items:baseline;gap:4px 12px;flex-wrap:wrap;margin-bottom:14px}
.pp-bilan-tete h2{margin:0;align-self:center}
.pp-bilan-semaine{font-weight:700;font-size:.86rem;padding:2px 10px;border:2px solid var(--ink);border-radius:99px;background:var(--lemon)}
.pp-bilan-tete p{flex-basis:100%;margin:4px 0 0;font-size:.76rem;color:var(--soft)}
.pp-bilan-jours{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;align-items:start}
.pp-bilan-jour{background:#fff;border:2.5px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);overflow:hidden}
.pp-bilan-jour h3{font-family:var(--titre);font-size:1rem;font-weight:800;margin:0;padding:7px 12px;background:var(--lime);border-bottom:2.5px solid var(--ink)}
.pp-bilan-ligne{display:grid;grid-template-columns:88px minmax(0,1fr);gap:2px 10px;padding:8px 12px;border-top:1.5px dashed var(--ligne-h);font-size:.82rem;break-inside:avoid}
.pp-bilan-jour h3+.pp-bilan-ligne{border-top:none}
.pp-bilan-h{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pp-bilan-titre{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;font-weight:700;min-width:0}
.pp-bilan-titre i{width:12px;height:12px;border-radius:4px;border:1.5px solid var(--ink);flex:none;display:inline-block}
.pp-bilan-titre small{font-weight:500;color:var(--soft);font-size:.68rem}
.pp-bilan-cours{color:var(--soft);font-weight:600}
.pp-bilan-ouvrir{border:none;background:none;padding:0;font:inherit;color:inherit;text-align:left;display:inline-flex;align-items:center;gap:6px}
.pp-bilan-ouvrir:hover span{text-decoration:underline}
.pp-bilan-ligne ul{grid-column:2;margin:4px 0 0;padding-left:18px}
.pp-bilan-ligne li{margin:1px 0;line-height:1.4;overflow-wrap:anywhere}
.pp-bilan-notes{grid-column:2;margin-top:6px;padding:7px 11px;background:var(--bg);border-left:4px solid var(--violet);border-radius:0 10px 10px 0}
.pp-bilan-notes p{margin:0;white-space:pre-line;line-height:1.5;overflow-wrap:anywhere}
.pp-bilan-notes p+p{margin-top:7px}
.pp-a-completer{grid-column:2;justify-self:start;margin-top:4px;border:1.5px dashed var(--ink);background:var(--lemon);color:var(--ink);font-size:.68rem;font-weight:700;padding:1px 9px;border-radius:99px}

.pp-mobile{display:none}

/* ---------- fenêtres ---------- */
.pp-voile{position:fixed;inset:0;z-index:50;background:rgba(27,19,64,.42);display:grid;place-items:center;padding:16px}
.pp-dlg{background:#fff;border:3px solid var(--ink);border-radius:20px;box-shadow:8px 8px 0 var(--ink);width:100%;max-width:440px;max-height:92vh;overflow:auto;padding:20px 22px}
.pp-dlg-large{max-width:640px}
.pp-dlg h3{font-family:var(--titre);font-size:1.35rem;font-weight:800;letter-spacing:-.02em;margin:0 0 12px}
.pp-onglets{display:flex;gap:3px;margin:0 0 14px;padding:3px;border:2.5px solid var(--ink);border-radius:99px;box-shadow:2px 2px 0 var(--ink)}
.pp-onglets button{flex:1;border:none;background:none;color:var(--ink);padding:6px;border-radius:99px;font-weight:700;font-size:.8rem}
.pp-onglets button.pp-on{background:var(--ink);color:#fff}
.pp-champ{margin-bottom:12px}
.pp-champ>label:not(.pp-radio),.pp-section-tete label{display:block;font-size:.64rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);margin-bottom:5px}
.pp-inp{width:100%;border:2px solid var(--ink);border-radius:10px;padding:8px 11px;font:500 .88rem Inter,system-ui,sans-serif;background:#fff;color:var(--ink)}
.pp-lecture{color:var(--soft);background:var(--bg)}
.pp-deux{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pp-horaires{display:grid;grid-template-columns:1fr;gap:0}
.pp-puces{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.pp-puce{border:2px solid var(--ink);padding:5px 11px;border-radius:99px;font-size:.78rem;font-weight:700;background:#fff;color:var(--ink)}
.pp-puce.pp-on{background:var(--ink);color:#fff}
.pp-libre{font-size:.78rem;color:var(--soft);display:flex;align-items:center;gap:4px}
.pp-libre input{width:66px;border:2px solid var(--ink);border-radius:8px;padding:4px 6px;font:500 .8rem Inter,system-ui,sans-serif}
.pp-radio{display:flex;gap:8px;align-items:flex-start;font-size:.84rem;margin-bottom:7px;line-height:1.35;cursor:pointer}
.pp-radio input{margin-top:3px;accent-color:var(--violet)}
.pp-radio small{display:block;color:var(--soft);font-size:.72rem}
.pp-couleurs{display:flex;gap:9px;flex-wrap:wrap}
.pp-couleurs button{width:28px;height:28px;border-radius:50%;border:2px solid var(--ink)}
.pp-couleurs button.pp-on{outline:3px solid var(--violet);outline-offset:2px}
.pp-info-dlg{font-size:.78rem;color:var(--soft);background:var(--bg);padding:8px 11px;margin:0 0 12px;border:2px solid var(--ink);border-left:6px solid var(--violet);border-radius:10px}
.pp-journal-zone{margin:14px 0 0;padding:12px 14px;border:2.5px solid var(--ink);border-radius:14px;background:#fbfff0}
.pp-notes-zone{background:#f6f2ff}
.pp-section-tete{display:flex;align-items:baseline;gap:4px 10px;flex-wrap:wrap;margin-bottom:6px}
.pp-section-tete label{font-family:var(--titre);font-size:1.02rem;font-weight:800;letter-spacing:-.01em;text-transform:none;color:var(--ink);margin:0}
.pp-section-tete small{font-size:.72rem;color:var(--soft)}
.pp-note-dlg{font-size:.74rem;color:var(--soft);margin:0 0 6px}
.pp-journal{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:5px}
.pp-journal li{display:flex;gap:8px;align-items:flex-start;background:#fff;border:1.5px solid var(--ink);border-left:6px solid var(--lime);border-radius:8px;padding:5px 8px;font-size:.84rem;line-height:1.35}
.pp-journal li span{flex:1;min-width:0;overflow-wrap:anywhere}
.pp-journal li button{border:none;background:none;color:var(--ink);font-size:1.1rem;line-height:1;padding:0 2px}
.pp-journal-ajout{display:flex;gap:6px}
.pp-journal-ajout .pp-btn{flex:none}
.pp-notes{min-height:190px;resize:vertical;line-height:1.6;font-size:.92rem}
.pp-compteur{display:block;text-align:right;font-size:.7rem;color:var(--soft);margin-top:4px}
.pp-erreur-dlg{font-size:.78rem;font-weight:600;color:var(--rose);margin:10px 0 0}
.pp-act{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}

@media (prefers-reduced-motion:reduce){.pp-btn{transition:none}}

/* ---------- tablette ---------- */
@media (max-width:1100px){
  .pp-corps{grid-template-columns:minmax(0,1fr) 260px;gap:16px}
  .pp-titre-semaine{min-width:0}
}

/* ---------- mobile : liste par jour ---------- */
@media (max-width:720px){
  .pp-barre{position:static;padding:12px 14px;gap:8px}
  .pp-logo{flex-basis:100%}
  .pp-barre h1{font-size:1.25rem}
  .pp-semaine{flex-basis:100%;justify-content:space-between}
  .pp-titre-semaine{font-size:.86rem}
  .pp-barre .pp-btn{flex:1 1 40%;padding:8px 6px;font-size:.74rem}
  .pp-messages{padding:12px 12px 0}
  .pp-corps{grid-template-columns:1fr;padding:12px;gap:14px}
  .pp-grille-zone{display:none}
  .pp-mobile{display:block;position:relative;padding-bottom:70px}
  .pp-jours{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 0 10px}
  .pp-jours button{border:2px solid var(--ink);border-radius:10px;background:#fff;color:var(--ink);padding:5px 0;font-size:.62rem;font-weight:700;text-transform:uppercase}
  .pp-jours button b{display:block;font-family:var(--titre);font-size:1rem;font-weight:800}
  .pp-jours button.pp-auj{background:var(--lime)}
  .pp-jours button.pp-on{background:var(--ink);color:#fff}
  .pp-liste{display:grid;gap:8px}
  .pp-item{width:100%;display:flex;gap:10px;text-align:left;background:#fff;border:2px solid var(--ink);border-left:8px solid var(--ink);border-radius:12px;padding:9px 10px;color:var(--ink);font:inherit;box-shadow:2px 2px 0 var(--ink)}
  .pp-item-h{font-size:.74rem;font-weight:700;min-width:84px}
  .pp-item b{display:block;font-family:var(--titre);font-size:.95rem;font-weight:800}
  .pp-item span{display:block;font-size:.72rem;color:var(--soft)}
  .pp-item em{display:block;font-style:normal;font-size:.7rem;font-weight:700;color:var(--rose);margin-top:2px}
  .pp-item em.pp-item-fait{color:#2d7a3e}
  .pp-item-cours{background:var(--ink);color:#fff}
  .pp-item-cours span{color:rgba(255,255,255,.75)}
  .pp-item-conflit b{text-decoration:line-through;opacity:.6}
  .pp-fab{position:absolute;right:6px;bottom:6px;width:54px;height:54px;border-radius:50%;border:3px solid var(--ink);background:var(--pink);color:#fff;font-size:1.7rem;font-weight:700;box-shadow:3px 3px 0 var(--ink)}
  .pp-bilan{margin:0 12px 24px;padding:14px 12px 16px}
  .pp-bilan-jours{grid-template-columns:minmax(0,1fr)}
  .pp-bilan-ligne{grid-template-columns:78px minmax(0,1fr)}
  .pp-dlg{padding:16px 16px}
}

/* ---------- impression : page 1 = semaine en A4 paysage, pages suivantes = bilan ---------- */
@page{size:A4 landscape;margin:8mm}
@media print{
  .pp{min-height:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff}
  .pp-barre,.pp-messages,.pp-mobile,.pp-voile,.pp-crayon,.pp-poignee,.pp-arrondi,.pp-resume,.pp-a-completer{display:none !important}
  .pp-arrondi-impression{display:block;font-size:8.5px;color:var(--soft);margin:-8px 0 6px}
  .pp-impression-titre{display:block;font-family:var(--titre);font-size:12px;font-weight:600;padding:0 0 4px;border-bottom:2px solid var(--ink)}
  .pp-impression-titre strong{font-weight:800}
  .pp-corps{display:grid !important;grid-template-columns:minmax(0,1fr) 62mm !important;gap:0;padding:0}
  .pp-grille-zone{display:block !important;padding:4px 6px 0 0;border:none;border-radius:0;box-shadow:none}
  .pp-grille{--k:.66 !important}
  .pp-entetes>div{padding:2px 0 3px;font-size:8px;gap:0}
  .pp-entetes b{font-size:11px;padding:0 5px;border-width:1.5px}
  .pp-entetes .pp-auj b{box-shadow:none}
  .pp-bloc{font-size:8px;padding:1px 3px;border-width:1px;border-radius:4px}
  .pp-heure{font-size:7px}
  .pp-badge{font-size:7px;border-width:1px}
  .pp-fait{font-size:6.5px;bottom:2px;border-width:1px}
  .pp-panneau{display:block !important;padding:6px 3mm 0 8px;border:none;border-radius:0;box-shadow:none;min-width:0;overflow:hidden}
  .pp-panneau h2{font-size:12px}
  .pp-h2-hex{width:12px;height:14px}
  .pp-sous{font-size:8px;margin-bottom:8px}
  .pp-chiffres{flex-wrap:wrap;gap:0 6px}
  .pp-quota{padding:6px 0;break-inside:avoid}
  .pp-quota-tete{font-size:10px}
  .pp-jauge{height:7px;border-width:1.5px;margin:4px 0}
  .pp-chiffres,.pp-deplace,.pp-legende{font-size:8.5px}
  .pp-legende i{border-width:1px}
  .pp-bilan{break-before:page;margin:0;padding:4px 0 0;border:none;border-top:2px solid var(--ink);border-radius:0;box-shadow:none}
  .pp-bilan-tete{margin-bottom:6px}
  .pp-bilan-tete h2{font-size:13px}
  .pp-bilan-semaine{font-size:9px;padding:0 6px;border-width:1.5px}
  .pp-bilan-tete p{display:none}
  .pp-bilan-jours{display:block;column-count:3;column-gap:5mm}
  .pp-bilan-jour{margin:0 0 4mm;border-width:1.5px;border-radius:6px;box-shadow:none;break-inside:auto}
  .pp-bilan-jour h3{font-size:10px;padding:3px 7px;border-bottom-width:1.5px;break-after:avoid}
  .pp-bilan-ligne{grid-template-columns:58px minmax(0,1fr);font-size:8.5px;padding:3px 7px;gap:1px 6px}
  .pp-bilan-titre small{font-size:7px}
  .pp-bilan-titre i{width:8px;height:8px;border-width:1px}
  .pp-bilan-notes{padding:3px 6px;border-left-width:2.5px;margin-top:3px}
  .pp-bilan-notes p+p{margin-top:3px}
  .pp-bilan-ouvrir{cursor:default}
}
`;
