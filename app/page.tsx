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
    if (authenticated) loadSlots();
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
    <div style={{ maxWidth: 600, margin: '60px auto', padding: 24, fontFamily: 'Inter,