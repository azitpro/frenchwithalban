'use client';
import { useState } from 'react';

type Lead = {
  id: string;
  name: string;
  email: string;
  schedulePref: string;
  level: string;
  goals: string;
  priorities: string;
  lessonsPerWeek: string;
  submittedAt: string;
};

export default function LeadsAdmin() {
  const [password, setPassword] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function tryLogin() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/leads', {
        headers: { 'x-admin-password': password },
      });
      if (res.ok) {
        const data = await res.json();
        setLeads(data.slice().reverse());
        setAuthenticated(true);
      } else {
        setError('Mot de passe incorrect.');
      }
    } catch (e) {
      setError('Erreur de connexion.');
    }
    setLoading(false);
  }

  const inputStyle = { padding: 10, border: '1.5px solid #ddd8ce', fontFamily: 'Inter, sans-serif' };
  const btnStyle = { padding: '10px 18px', background: '#0d2b45', color: '#faf7f2', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' };

  if (!authenticated) {
    return (
      <div style={{ maxWidth: 400, margin: '100px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 20 }}>Demandes de contact</h1>
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tryLogin()}
          style={{ ...inputStyle, width: '100%', marginBottom: 12 }}
        />
        <button onClick={tryLogin} disabled={loading} style={{ ...btnStyle, width: '100%' }}>
          {loading ? 'Vérification...' : 'Se connecter'}
        </button>
        {error && <p style={{ color: '#c0392b', marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 24 }}>
        Demandes de contact ({leads.length})
      </h1>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {leads.map((l) => (
          <div key={l.id} style={{ padding: 18, background: '#f0ece4', border: '1px solid #ddd8ce' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <strong style={{ color: '#0d2b45' }}>{l.name}</strong>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>{new Date(l.submittedAt).toLocaleString('fr-FR')}</span>
            </div>
            <p style={{ fontSize: '0.85rem', marginBottom: 4 }}><b>Email :</b> {l.email}</p>
            <p style={{ fontSize: '0.85rem', marginBottom: 4 }}><b>Créneaux préférés :</b> {l.schedulePref}</p>
            <p style={{ fontSize: '0.85rem', marginBottom: 4 }}><b>Niveau :</b> {l.level}</p>
            <p style={{ fontSize: '0.85rem', marginBottom: 4 }}><b>Objectifs :</b> {l.goals}</p>
            <p style={{ fontSize: '0.85rem', marginBottom: 4 }}><b>Priorités :</b> {l.priorities}</p>
            <p style={{ fontSize: '0.85rem' }}><b>Cours/semaine souhaités :</b> {l.lessonsPerWeek}</p>
          </div>
        ))}
        {leads.length === 0 && <p style={{ color: '#999', fontStyle: 'italic' }}>Aucune demande pour le moment.</p>}
      </div>
    </div>
  );
}