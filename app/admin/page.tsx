'use client';
import { useState, useEffect } from 'react';

type Slot = { day: string; hour: string; status: string };

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [newDay, setNewDay] = useState('');
  const [newHour, setNewHour] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authenticated) loadSlots();git add .
  }, [authenticated]);

  async function loadSlots() {
    const res = await fetch('/api/slots');
    const data = await res.json();
    setSlots(data);
  }

  async function saveSlots(updated: Slot[]) {
    setSaving(true);
    const res = await fetch('/api/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, slots: updated }),
    });
    if (res.ok) {
      setSlots(updated);
    } else {
      setError('Erreur de sauvegarde');
    }
    setSaving(false);
  }

  function tryLogin() {
    setAuthenticated(true);
    setError('');
  }

  function toggleStatus(index: number) {
    const updated = [...slots];
    updated[index].status = updated[index].status === 'libre' ? 'pris' : 'libre';
    saveSlots(updated);
  }

  function removeSlot(index: number) {
    const updated = slots.filter((_, i) => i !== index);
    saveSlots(updated);
  }

  function addSlot() {
    if (!newDay || !newHour) return;
    const updated = [...slots, { day: newDay, hour: newHour, status: 'libre' }];
    saveSlots(updated);
    setNewDay('');
    setNewHour('');
  }

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 400, margin: '100px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 20 }}>Administration</h1>
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tryLogin()}
          style={{ width: '100%', padding: 12, border: '1.5px solid #ddd8ce', marginBottom: 12 }}
        />
        <button
          onClick={tryLogin}
          style={{ width: '100%', padding: 12, background: '#0d2b45', color: '#faf7f2', border: 'none', cursor: 'pointer' }}
        >
          Se connecter
        </button>
        {error && <p style={{ color: '#c0392b', marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 20 }}>Gestion des créneaux</h1>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {slots.map((slot, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: 12,
              background: slot.status === 'libre' ? '#e8f4ed' : '#fbeae8',
              border: `1px solid ${slot.status === 'libre' ? '#2e7d4f' : '#c0392b'}`,
            }}
          >
            <span style={{ flex: 1 }}>{slot.day} — {slot.hour}</span>
            <button onClick={() => toggleStatus(i)} style={{ padding: '6px 12px', cursor: 'pointer' }}>
              {slot.status === 'libre' ? 'Marquer pris' : 'Marquer libre'}
            </button>
            <button onClick={() => removeSlot(i)} style={{ padding: '6px 12px', cursor: 'pointer', color: '#c0392b' }}>
              Supprimer
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          placeholder="Jour (ex: Lundi 24)"
          value={newDay}
          onChange={(e) => setNewDay(e.target.value)}
          style={{ flex: 1, padding: 10, border: '1.5px solid #ddd8ce' }}
        />
        <input
          placeholder="Heure (ex: 14h)"
          value={newHour}
          onChange={(e) => setNewHour(e.target.value)}
          style={{ flex: 1, padding: 10, border: '1.5px solid #ddd8ce' }}
        />
        <button onClick={addSlot} style={{ padding: '10px 20px', background: '#0d2b45', color: '#faf7f2', border: 'none', cursor: 'pointer' }}>
          Ajouter
        </button>
      </div>
      {saving && <p style={{ marginTop: 10, color: '#666' }}>Sauvegarde...</p>}
    </div>
  );
}