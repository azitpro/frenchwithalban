'use client';
import { useEffect, useState } from 'react';
import { AdminChargement, AdminShell } from '../admin-ui';

// Page protégée par proxy.ts (authentification HTTP Basic) : le navigateur envoie le même
// mot de passe à /api/admin/schedule.

type RecurringSlot = {
  id: string;
  student: string;
  weekday: string;
  hour: number;
  duration: 25 | 50;
  active: boolean;
};

type Exception = { recurringId: string; date: string };

type OneOff = {
  id: string;
  student: string;
  date: string;
  hour: number;
  duration: 25 | 50;
};

type AvailabilityWindow = {
  id: string;
  weekday: string;
  start: number;
  end: number;
};

type Unavailability = {
  id: string;
  type: 'day' | 'range';
  date: string;
  start?: number;
  end?: number;
};

type Forced = {
  id: string;
  date: string;
  hour: number;
};

type Schedule = {
  recurring: RecurringSlot[];
  exceptions: Exception[];
  oneOff: OneOff[];
  availability: AvailabilityWindow[];
  unavailability: Unavailability[];
  forced: Forced[];
};

const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const STUDENTS = [
  'Daniele', 'Susanne', 'Eric', 'Anaé', 'Wojciech', 'Brian', 'Marc', 'Nicola',
  'Michael', 'Monika', 'Rick', 'Michal', 'Annamaria', 'Aimé', 'Miso', 'Tomas',
  'Nadya', 'Gabriel', 'Sarah', 'Ola', 'Omri', 'Sylvia', 'Nobuko', 'Amanda',
  'Anastasiia', 'Yoshi',
];

const HOUR_OPTIONS: { value: number; label: string }[] = [];
for (let h = 6; h <= 23; h++) {
  HOUR_OPTIONS.push({ value: h, label: `${h}h00` });
  HOUR_OPTIONS.push({ value: h + 0.5, label: `${h}h30` });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function fmtHour(h: number) {
  const hh = Math.floor(h);
  const mm = h % 1 === 0.5 ? '30' : '00';
  return `${hh}h${mm}`;
}

function fmtDate(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return date;
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function HourSelect({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(parseFloat(e.target.value))} aria-label={label}>
      {HOUR_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const normaliser = (current: Partial<Schedule> | null): Schedule => ({
  recurring: current?.recurring || [],
  exceptions: current?.exceptions || [],
  oneOff: current?.oneOff || [],
  availability: current?.availability || [],
  unavailability: current?.unavailability || [],
  forced: current?.forced || [],
});

export default function ScheduleAdmin() {
  const [schedule, setSchedule] = useState<Schedule>(normaliser(null));
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [forcedDate, setForcedDate] = useState('');
  const [forcedHour, setForcedHour] = useState(10);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [availWeekday, setAvailWeekday] = useState('Lundi');
  const [availStart, setAvailStart] = useState(9);
  const [availEnd, setAvailEnd] = useState(18);

  const [newStudent, setNewStudent] = useState(STUDENTS[0]);
  const [newWeekday, setNewWeekday] = useState('Lundi');
  const [newHour, setNewHour] = useState(10);
  const [newDuration, setNewDuration] = useState<25 | 50>(50);

  const [oneOffStudent, setOneOffStudent] = useState(STUDENTS[0]);
  const [oneOffDate, setOneOffDate] = useState('');
  const [oneOffHour, setOneOffHour] = useState(10);
  const [oneOffDuration, setOneOffDuration] = useState<25 | 50>(50);

  const [excDates, setExcDates] = useState<Record<string, string>>({});

  const [unavType, setUnavType] = useState<'day' | 'range'>('day');
  const [unavDate, setUnavDate] = useState('');
  const [unavStart, setUnavStart] = useState(9);
  const [unavEnd, setUnavEnd] = useState(18);

  useEffect(() => {
    fetch('/api/admin/schedule', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => setSchedule(normaliser(data)))
      .catch(() => setFatal('Impossible de charger le planning.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(updated: Schedule) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: updated }),
      });
      if (res.ok) {
        setSchedule(updated);
      } else {
        const data = await res.json().catch(() => null);
        setError(res.status === 401 ? 'Session expirée : rechargez la page.' : data?.error || 'Erreur de sauvegarde.');
      }
    } catch {
      setError('Erreur de sauvegarde : vérifiez la connexion.');
    }
    setSaving(false);
  }

  function addAvailability() {
    const win: AvailabilityWindow = { id: uid(), weekday: availWeekday, start: availStart, end: availEnd };
    save({ ...schedule, availability: [...schedule.availability, win] });
  }

  function removeAvailability(id: string) {
    save({ ...schedule, availability: schedule.availability.filter((a) => a.id !== id) });
  }

  function addRecurring() {
    const slot: RecurringSlot = { id: uid(), student: newStudent, weekday: newWeekday, hour: newHour, duration: newDuration, active: true };
    save({ ...schedule, recurring: [...schedule.recurring, slot] });
  }

  function removeRecurring(id: string) {
    save({
      ...schedule,
      recurring: schedule.recurring.filter((r) => r.id !== id),
      exceptions: schedule.exceptions.filter((e) => e.recurringId !== id),
    });
  }

  function addException(recurringId: string) {
    const date = excDates[recurringId];
    if (!date) return;
    save({ ...schedule, exceptions: [...schedule.exceptions, { recurringId, date }] });
    setExcDates((d) => ({ ...d, [recurringId]: '' }));
  }

  function removeException(recurringId: string, date: string) {
    save({ ...schedule, exceptions: schedule.exceptions.filter((e) => !(e.recurringId === recurringId && e.date === date)) });
  }

  function addOneOff() {
    if (!oneOffDate) return;
    const item: OneOff = { id: uid(), student: oneOffStudent, date: oneOffDate, hour: oneOffHour, duration: oneOffDuration };
    save({ ...schedule, oneOff: [...schedule.oneOff, item] });
    setOneOffDate('');
  }

  function removeOneOff(id: string) {
    save({ ...schedule, oneOff: schedule.oneOff.filter((o) => o.id !== id) });
  }

  function addUnavailability() {
    if (!unavDate) return;
    const item: Unavailability = unavType === 'day'
      ? { id: uid(), type: 'day', date: unavDate }
      : { id: uid(), type: 'range', date: unavDate, start: unavStart, end: unavEnd };
    save({ ...schedule, unavailability: [...schedule.unavailability, item] });
    setUnavDate('');
  }

  function removeUnavailability(id: string) {
    save({ ...schedule, unavailability: schedule.unavailability.filter((u) => u.id !== id) });
  }

  function addForced() {
    if (!forcedDate) return;
    const item: Forced = { id: uid(), date: forcedDate, hour: forcedHour };
    save({ ...schedule, forced: [...(schedule.forced || []), item] });
    setForcedDate('');
  }

  function removeForced(id: string) {
    save({ ...schedule, forced: (schedule.forced || []).filter((f) => f.id !== id) });
  }

  if (loading) return <AdminChargement texte="Chargement du planning…" />;
  if (fatal) {
    return (
      <AdminShell titre="Planning des cours">
        <p className="ad-message ad-erreur">{fatal}</p>
        <button className="ad-btn ad-plein" onClick={() => window.location.reload()}>Recharger</button>
      </AdminShell>
    );
  }

  const supprimer = (onClick: () => void, quoi: string) => (
    <button className="ad-btn ad-petit ad-danger" onClick={onClick} disabled={saving} aria-label={`Supprimer ${quoi}`}>Supprimer</button>
  );

  return (
    <AdminShell
      titre="Planning des cours"
      intro="Ce qui s’affiche sur la page publique des créneaux : disponibilités, indisponibilités, cours des élèves."
      actions={<span className="sc-etat" aria-live="polite">{saving ? 'Sauvegarde…' : error ? 'Non enregistré' : 'Enregistré'}</span>}
    >
      <style href="admin-schedule" precedence="default">{CSS}</style>
      {error && <p className="ad-message ad-erreur">{error}</p>}

      <div className="sc-sections ad-suite">
        {/* DISPONIBILITÉS */}
        <section className="ad-carte sc-section">
          <h2 className="ad-h2"><span className="sc-puce" aria-hidden="true" />Disponibilités générales</h2>
          <p className="ad-aide">Les jours et plages horaires où vous acceptez d’enseigner. Aucun créneau ne s’affiche publiquement en dehors de ces plages.</p>
          <div className="ad-champs sc-form">
            <select value={availWeekday} onChange={(e) => setAvailWeekday(e.target.value)} aria-label="Jour">
              {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <HourSelect value={availStart} onChange={setAvailStart} label="Début" />
            <span className="ad-texte-sep">à</span>
            <HourSelect value={availEnd} onChange={setAvailEnd} label="Fin" />
            <button className="ad-btn ad-plein" onClick={addAvailability} disabled={saving}>Ajouter</button>
          </div>
          <div className="ad-liste">
            {schedule.availability.map((a) => (
              <div key={a.id} className="ad-ligne">
                <span className="ad-ligne-texte"><strong>{a.weekday}</strong> · {fmtHour(a.start)} à {fmtHour(a.end)}</span>
                {supprimer(() => removeAvailability(a.id), `la disponibilité du ${a.weekday}`)}
              </div>
            ))}
            {schedule.availability.length === 0 && <p className="ad-vide">Aucune disponibilité définie : rien ne s’affichera publiquement.</p>}
          </div>
        </section>

        {/* INDISPONIBILITÉS */}
        <section className="ad-carte sc-section">
          <h2 className="ad-h2"><span className="sc-puce" aria-hidden="true" />Indisponibilités</h2>
          <p className="ad-aide">Bloquez une journée entière ou une plage horaire précise (vacances, absence…), au-dessus de vos disponibilités générales.</p>
          <div className="ad-champs sc-form">
            <select value={unavType} onChange={(e) => setUnavType(e.target.value as 'day' | 'range')} aria-label="Type d’indisponibilité">
              <option value="day">Journée entière</option>
              <option value="range">Plage horaire</option>
            </select>
            <input type="date" value={unavDate} onChange={(e) => setUnavDate(e.target.value)} aria-label="Date" />
            {unavType === 'range' && (
              <>
                <HourSelect value={unavStart} onChange={setUnavStart} label="Début" />
                <span className="ad-texte-sep">à</span>
                <HourSelect value={unavEnd} onChange={setUnavEnd} label="Fin" />
              </>
            )}
            <button className="ad-btn ad-plein" onClick={addUnavailability} disabled={saving || !unavDate}>Ajouter</button>
          </div>
          <div className="ad-liste">
            {schedule.unavailability.map((u) => (
              <div key={u.id} className="ad-ligne ad-rouge">
                <span className="ad-ligne-texte">
                  <strong>{fmtDate(u.date)}</strong> · {u.type === 'day' ? 'journée entière' : `${fmtHour(u.start!)} à ${fmtHour(u.end!)}`}
                </span>
                {supprimer(() => removeUnavailability(u.id), `l’indisponibilité du ${u.date}`)}
              </div>
            ))}
            {schedule.unavailability.length === 0 && <p className="ad-vide">Aucune indisponibilité définie.</p>}
          </div>
        </section>

        {/* CRÉNEAUX FORCÉS */}
        <section className="ad-carte sc-section">
          <h2 className="ad-h2"><span className="sc-puce" aria-hidden="true" />Créneaux forcés</h2>
          <p className="ad-aide">Affiche un créneau comme disponible même s’il est occupé (Preply, cours récurrent, indisponibilité). À utiliser exceptionnellement.</p>
          <div className="ad-champs sc-form">
            <input type="date" value={forcedDate} onChange={(e) => setForcedDate(e.target.value)} aria-label="Date" />
            <HourSelect value={forcedHour} onChange={setForcedHour} label="Heure" />
            <button className="ad-btn ad-plein" onClick={addForced} disabled={saving || !forcedDate}>Ajouter</button>
          </div>
          <div className="ad-liste">
            {(schedule.forced || []).map((f) => (
              <div key={f.id} className="ad-ligne ad-jaune">
                <span className="ad-ligne-texte"><strong>{fmtDate(f.date)}</strong> · {fmtHour(f.hour)}</span>
                {supprimer(() => removeForced(f.id), `le créneau forcé du ${f.date}`)}
              </div>
            ))}
            {(schedule.forced || []).length === 0 && <p className="ad-vide">Aucun créneau forcé.</p>}
          </div>
        </section>

        {/* CRÉNEAUX HEBDOMADAIRES */}
        <section className="ad-carte sc-section">
          <h2 className="ad-h2"><span className="sc-puce" aria-hidden="true" />Créneaux hebdomadaires (élèves)</h2>
          <p className="ad-aide">Cours qui reviennent chaque semaine. Une occurrence peut être annulée à une date précise.</p>
          <div className="ad-champs sc-form">
            <select value={newStudent} onChange={(e) => setNewStudent(e.target.value)} aria-label="Élève">
              {STUDENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={newWeekday} onChange={(e) => setNewWeekday(e.target.value)} aria-label="Jour">
              {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <HourSelect value={newHour} onChange={setNewHour} label="Heure" />
            <select value={newDuration} onChange={(e) => setNewDuration(Number(e.target.value) as 25 | 50)} aria-label="Durée">
              <option value={25}>25 min</option>
              <option value={50}>50 min</option>
            </select>
            <button className="ad-btn ad-plein" onClick={addRecurring} disabled={saving}>Ajouter</button>
          </div>
          <div className="ad-liste">
            {schedule.recurring.map((r) => {
              const exceptionsForThis = schedule.exceptions.filter((e) => e.recurringId === r.id);
              return (
                <div key={r.id} className="ad-ligne sc-recurrent">
                  <span className="ad-ligne-texte"><strong>{r.student}</strong> · {r.weekday} {fmtHour(r.hour)} ({r.duration} min)</span>
                  {supprimer(() => removeRecurring(r.id), `le créneau de ${r.student}`)}
                  <div className="sc-annuler">
                    <span className="ad-label">Annuler une occurrence</span>
                    <input type="date" value={excDates[r.id] || ''} aria-label={`Date à annuler pour ${r.student}`}
                      onChange={(e) => setExcDates((d) => ({ ...d, [r.id]: e.target.value }))} />
                    <button className="ad-btn ad-petit" onClick={() => addException(r.id)} disabled={saving || !excDates[r.id]}>Annuler cette date</button>
                  </div>
                  {exceptionsForThis.length > 0 && (
                    <div className="sc-exceptions">
                      {exceptionsForThis.map((e) => (
                        <span key={e.date} className="sc-exception">
                          {fmtDate(e.date)}
                          <button onClick={() => removeException(r.id, e.date)} disabled={saving} aria-label={`Rétablir le cours du ${e.date}`}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {schedule.recurring.length === 0 && <p className="ad-vide">Aucun créneau hebdomadaire.</p>}
          </div>
        </section>

        {/* COURS PONCTUELS */}
        <section className="ad-carte sc-section">
          <h2 className="ad-h2"><span className="sc-puce" aria-hidden="true" />Cours ponctuels</h2>
          <p className="ad-aide">Cours isolés, à une date précise.</p>
          <div className="ad-champs sc-form">
            <select value={oneOffStudent} onChange={(e) => setOneOffStudent(e.target.value)} aria-label="Élève">
              {STUDENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="date" value={oneOffDate} onChange={(e) => setOneOffDate(e.target.value)} aria-label="Date" />
            <HourSelect value={oneOffHour} onChange={setOneOffHour} label="Heure" />
            <select value={oneOffDuration} onChange={(e) => setOneOffDuration(Number(e.target.value) as 25 | 50)} aria-label="Durée">
              <option value={25}>25 min</option>
              <option value={50}>50 min</option>
            </select>
            <button className="ad-btn ad-plein" onClick={addOneOff} disabled={saving || !oneOffDate}>Ajouter</button>
          </div>
          <div className="ad-liste">
            {schedule.oneOff.map((o) => (
              <div key={o.id} className="ad-ligne">
                <span className="ad-ligne-texte"><strong>{o.student}</strong> · {fmtDate(o.date)} à {fmtHour(o.hour)} ({o.duration} min)</span>
                {supprimer(() => removeOneOff(o.id), `le cours de ${o.student}`)}
              </div>
            ))}
            {schedule.oneOff.length === 0 && <p className="ad-vide">Aucun cours ponctuel.</p>}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

const CSS = `
.sc-etat{font-size:.75rem;font-weight:700;color:var(--soft)}
.sc-sections{display:grid;gap:22px}
.sc-section .ad-h2{display:flex;align-items:center;gap:10px}
.sc-puce{flex:none;width:18px;height:18px;border:2.5px solid var(--ink);border-radius:6px;background:var(--c);rotate:-8deg}
.sc-form{margin-bottom:14px;align-items:center}
.sc-form .ad-texte-sep{padding-bottom:0}
.sc-form select,.sc-form input{width:auto!important;min-width:0}
.sc-recurrent{align-items:flex-start}
.sc-annuler{display:flex;align-items:center;gap:8px;flex-wrap:wrap;width:100%}
.sc-annuler input{width:auto!important;padding:4px 10px!important;font-size:.85rem!important;border-width:2px!important}
.sc-exceptions{display:flex;gap:6px;flex-wrap:wrap;width:100%}
.sc-exception{display:inline-flex;align-items:center;gap:4px;padding:1px 4px 1px 10px;border:2px solid var(--ink);border-radius:99px;background:#ffe1ee;font-size:.78rem;font-weight:600}
.sc-exception button{border:0;background:none;padding:0 5px;font-weight:800;font-size:.95rem;line-height:1}
.sc-exception button:hover{color:var(--rose)}
@media (max-width:560px){.sc-form select,.sc-form input{flex:1 1 140px}}
`;
