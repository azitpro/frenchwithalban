'use client';
import { useState, useEffect } from 'react';

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

type Schedule = {
  recurring: RecurringSlot[];
  exceptions: Exception[];
  oneOff: OneOff[];
  availability: AvailabilityWindow[];
};

const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const STUDENTS = [
  'Daniele', 'Susanne', 'Eric', 'Anaé', 'Wojciech', 'Brian', 'Marc', 'Nicola',
  'Michael', 'Monika', 'Rick', 'Michal', 'Annamaria', 'Aimé', 'Miso', 'Tomas',
  'Nadya', 'Gabriel', 'Sarah', 'Ola', 'Omri', 'Sylvia', 'Nobuko', 'Amanda',
  'Anastasiia', 'Yoshi',
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ScheduleAdmin() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [schedule, setSchedule] = useState<Schedule>({ recurring: [], exceptions: [], oneOff: [], availability: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [availWeekday, setAvailWeekday] = useState('Lundi');
  const [availStart, setAvailStart] = useState('9');
  const [availEnd, setAvailEnd] = useState('18');

  const [newStudent, setNewStudent] = useState(STUDENTS[0]);
  const [newWeekday, setNewWeekday] = useState('Lundi');
  const [newHour, setNewHour] = useState('10');
  const [newDuration, setNewDuration] = useState<25 | 50>(50);

  const [oneOffStudent, setOneOffStudent] = useState(STUDENTS[0]);
  const [oneOffDate, setOneOffDate] = useState('');
  const [oneOffHour, setOneOffHour] = useState('10');
  const [oneOffDuration, setOneOffDuration] = useState<25 | 50>(50);

  const [excDate, setExcDate] = useState('');

  useEffect(() => {
    if (authenticated) load();
  }, [authenticated]);

  async function load() {
    const res = await fetch('/api/schedule');
    const data = await res.json();
    setSchedule({
      recurring: data.recurring || [],
      exceptions: data.exceptions || [],
      oneOff: data.oneOff || [],
      availability: data.availability || [],
    });
  }

  async function save(updated: Schedule) {
    setSaving(true);
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, schedule: updated }),
    });
    if (res.ok) {
      setSchedule(updated);
    } else {
      setError('Erreur de sauvegarde');
    }
    setSaving(false);
  }

  function tryLogin() {
    setAuthenticated(true);
    setError('');
  }

  function addAvailability() {
    const win: AvailabilityWindow = {
      id: uid(),
      weekday: availWeekday,
      start: parseFloat(availStart),
      end: parseFloat(availEnd),
    };
    save({ ...schedule, availability: [...schedule.availability, win] });
  }

  function removeAvailability(id: string) {
    save({ ...schedule, availability: schedule.availability.filter((a) => a.id !== id) });
  }

  function addRecurring() {
    const slot: RecurringSlot = {
      id: uid(),
      student: newStudent,
      weekday: newWeekday,
      hour: parseFloat(newHour),
      duration: newDuration,
      active: true,
    };
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
    if (!excDate) return;
    save({ ...schedule, exceptions: [...schedule.exceptions, { recurringId, date: excDate }] });
    setExcDate('');
  }

  function removeException(recurringId: string, date: string) {
    save({
      ...schedule,
      exceptions: schedule.exceptions.filter((e) => !(e.recurringId === recurringId && e.date === date)),
    });
  }

  function addOneOff() {
    if (!oneOffDate) return;
    const item: OneOff = {
      id: uid(),
      student: oneOffStudent,
      date: oneOffDate,
      hour: parseFloat(oneOffHour),
      duration: oneOffDuration,
    };
    save({ ...schedule, oneOff: [...schedule.oneOff, item] });
    setOneOffDate('');
  }

  function removeOneOff(id: string) {
    save({ ...schedule, oneOff: schedule.oneOff.filter((o) => o.id !== id) });
  }

  const inputStyle = { padding: 10, border: '1.5px solid #ddd8ce', fontFamily: 'Inter, sans-serif' };
  const btnStyle = { padding: '10px 18px', background: '#0d2b45', color: '#faf7f2', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' };
  const dangerStyle = { padding: '6px 12px', cursor: 'pointer', color: '#c0392b', background: 'none', border: '1px solid #c0392b', fontFamily: 'Inter, sans-serif' };

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 400, margin: '100px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 20 }}>Gestion du planning</h1>
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tryLogin()}
          style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
        />
        <button onClick={tryLogin} style={{ ...btnStyle, width: '100%' }}>Se connecter</button>
        {error && <p style={{ color: '#c0392b', marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 24 }}>Gestion du planning</h1>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {saving && <p style={{ color: '#666' }}>Sauvegarde...</p>}

      {/* AVAILABILITY WINDOWS */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', fontSize: '1.2rem', marginBottom: 6 }}>
          Disponibilités générales
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#666', marginBottom: 12 }}>
          Les jours et plages horaires où vous acceptez d'enseigner. Aucun créneau ne s'affiche publiquement en dehors de ces plages.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={availWeekday} onChange={(e) => setAvailWeekday(e.target.value)} style={inputStyle}>
            {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="number" step="0.5" placeholder="Début (ex: 9)" value={availStart} onChange={(e) => setAvailStart(e.target.value)} style={{ ...inputStyle, width: 130 }} />
          <input type="number" step="0.5" placeholder="Fin (ex: 18)" value={availEnd} onChange={(e) => setAvailEnd(e.target.value)} style={{ ...inputStyle, width: 130 }} />
          <button onClick={addAvailability} style={btnStyle}>Ajouter</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {schedule.availability.map((a) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: '#f0ece4', border: '1px solid #ddd8ce' }}>
              <span style={{ flex: 1 }}><strong>{a.weekday}</strong> — {a.start}h à {a.end}h</span>
              <button onClick={() => removeAvailability(a.id)} style={dangerStyle}>Supprimer</button>
            </div>
          ))}
          {schedule.availability.length === 0 && (
            <p style={{ fontSize: '0.82rem', color: '#999', fontStyle: 'italic' }}>Aucune disponibilité définie — rien ne s'affichera publiquement.</p>
          )}
        </div>
      </section>

      {/* RECURRING SLOTS */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', fontSize: '1.2rem', marginBottom: 12 }}>
          Créneaux hebdomadaires (élèves)
        </h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={newStudent} onChange={(e) => setNewStudent(e.target.value)} style={inputStyle}>
            {STUDENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={newWeekday} onChange={(e) => setNewWeekday(e.target.value)} style={inputStyle}>
            {WEEKDAYS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input type="number" step="0.5" placeholder="Heure (ex: 10 ou 13.5)" value={newHour} onChange={(e) => setNewHour(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          <select value={newDuration} onChange={(e) => setNewDuration(Number(e.target.value) as 25 | 50)} style={inputStyle}>
            <option value={25}>25 min</option>
            <option value={50}>50 min</option>
          </select>
          <button onClick={addRecurring} style={btnStyle}>Ajouter</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {schedule.recurring.map((r) => {
            const exceptionsForThis = schedule.exceptions.filter((e) => e.recurringId === r.id);
            return (
              <div key={r.id} style={{ padding: 12, background: '#f0ece4', border: '1px solid #ddd8ce' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ flex: 1 }}>
                    <strong>{r.student}</strong> — {r.weekday} {r.hour}h ({r.duration} min)
                  </span>
                  <button onClick={() => removeRecurring(r.id)} style={dangerStyle}>Supprimer</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>Annuler une occurrence :</span>
                  <input type="date" value={excDate} onChange={(e) => setExcDate(e.target.value)} style={{ ...inputStyle, padding: 6 }} />
                  <button onClick={() => addException(r.id)} style={{ ...btnStyle, padding: '6px 12px' }}>Annuler cette date</button>
                </div>
                {exceptionsForThis.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {exceptionsForThis.map((e) => (
                      <span key={e.date} style={{ fontSize: '0.8rem', background: '#fbeae8', padding: '4px 8px', border: '1px solid #c0392b', color: '#c0392b' }}>
                        {e.date} <button onClick={() => removeException(r.id, e.date)} style={{ marginLeft: 6, cursor: 'pointer', border: 'none', background: 'none', color: '#c0392b' }}>×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ONE-OFF LESSONS */}
      <section>
        <h2 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', fontSize: '1.2rem', marginBottom: 12 }}>
          Cours ponctuels
        </h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <select value={oneOffStudent} onChange={(e) => setOneOffStudent(e.target.value)} style={inputStyle}>
            {STUDENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={oneOffDate} onChange={(e) => setOneOffDate(e.target.value)} style={inputStyle} />
          <input type="number" step="0.5" placeholder="Heure" value={oneOffHour} onChange={(e) => setOneOffHour(e.target.value)} style={{ ...inputStyle, width: 100 }} />
          <select value={oneOffDuration} onChange={(e) => setOneOffDuration(Number(e.target.value) as 25 | 50)} style={inputStyle}>
            <option value={25}>25 min</option>
            <option value={50}>50 min</option>
          </select>
          <button onClick={addOneOff} style={btnStyle}>Ajouter</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {schedule.oneOff.map((o) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#f0ece4', border: '1px solid #ddd8ce' }}>
              <span style={{ flex: 1 }}>
                <strong>{o.student}</strong> — {o.date} à {o.hour}h ({o.duration} min)
              </span>
              <button onClick={() => removeOneOff(o.id)} style={dangerStyle}>Supprimer</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}