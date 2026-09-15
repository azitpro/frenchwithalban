'use client';
import { useEffect, useState } from 'react';
import { trouverQuestion } from '@/lib/placement';
import type { TestPlacement } from '@/lib/placement';

// Page protégée par proxy.ts (authentification HTTP Basic) : le navigateur envoie le même
// mot de passe aux routes /api/admin appelées ici.

type Lead = {
  id: string;
  firstName: string;
  email: string;
  timezone: string;
  availability: string[];
  level: string;
  goals: string;
  priorities: string;
  lessonsPerWeek: string;
  other: string;
  submittedAt: string;
};

type Filtre = 'tous' | 'reservations' | 'tests';
type Entree = { type: 'reservation'; date: string; lead: Lead } | { type: 'test'; date: string; test: TestPlacement };

const LETTRES = ['a', 'b', 'c', 'd'];

export default function LeadsAdmin() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tests, setTests] = useState<TestPlacement[]>([]);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [resLeads, resTests] = await Promise.all([
          fetch('/api/admin/leads', { cache: 'no-store' }),
          fetch('/api/admin/placement', { cache: 'no-store' }),
        ]);
        if (!resLeads.ok || !resTests.ok) throw new Error('chargement');
        const donneesLeads: Lead[] = await resLeads.json();
        const donneesTests: { tests: TestPlacement[] } = await resTests.json();
        if (annule) return;
        setLeads(donneesLeads);
        setTests(donneesTests.tests);
      } catch {
        if (!annule) setError('Impossible de charger les demandes.');
      }
      if (!annule) setLoading(false);
    })();
    return () => {
      annule = true;
    };
  }, []);

  async function supprimer(entree: Entree) {
    const url = entree.type === 'test' ? '/api/admin/placement' : '/api/admin/leads';
    const id = entree.type === 'test' ? entree.test.id : entree.lead.id;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setError('Erreur lors de la suppression.');
      return;
    }
    if (entree.type === 'test') setTests(tests.filter((t) => t.id !== id));
    else setLeads(leads.filter((l) => l.id !== id));
  }

  const entrees: Entree[] = [
    ...leads.map((lead): Entree => ({ type: 'reservation', date: lead.submittedAt, lead })),
    ...tests.map((test): Entree => ({ type: 'test', date: test.passeLe, test })),
  ]
    .filter((e) => filtre === 'tous' || (filtre === 'tests' ? e.type === 'test' : e.type === 'reservation'))
    .sort((a, b) => b.date.localeCompare(a.date));

  const dangerStyle = { padding: '6px 12px', cursor: 'pointer', color: '#c0392b', background: 'none', border: '1px solid #c0392b', fontFamily: 'Inter, sans-serif', fontSize: '0.8rem' };
  const ligne = { fontSize: '0.85rem', marginBottom: 4 };
  const etiquette = (texte: string, fond: string) => (
    <span style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', padding: '2px 8px', marginLeft: 10, background: fond, color: '#faf7f2' }}>{texte}</span>
  );
  const boutonFiltre = (valeur: Filtre, libelle: string, nombre: number) => (
    <button
      key={valeur}
      onClick={() => setFiltre(valeur)}
      aria-pressed={filtre === valeur}
      style={{
        padding: '8px 14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem',
        border: '1px solid #0d2b45', background: filtre === valeur ? '#0d2b45' : 'transparent', color: filtre === valeur ? '#faf7f2' : '#0d2b45',
      }}
    >
      {libelle} ({nombre})
    </button>
  );

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 16 }}>
        Demandes de contact ({leads.length + tests.length})
      </h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {boutonFiltre('tous', 'Tous', leads.length + tests.length)}
        {boutonFiltre('reservations', 'Réservations', leads.length)}
        {boutonFiltre('tests', 'Tests de placement', tests.length)}
      </div>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {loading && <p style={{ color: '#999', fontStyle: 'italic' }}>Chargement…</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {entrees.map((e) => (
          <div key={`${e.type}-${e.type === 'test' ? e.test.id : e.lead.id}`} style={{ padding: 18, background: '#f0ece4', border: '1px solid #ddd8ce' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
              <span>
                <strong style={{ color: '#0d2b45' }}>
                  {e.type === 'test' ? e.test.prenom || 'Anonyme' : e.lead.firstName}
                </strong>
                {e.type === 'test' ? etiquette('Test de placement', '#c9972a') : etiquette('Réservation', '#0d2b45')}
              </span>
              <span style={{ fontSize: '0.78rem', color: '#666', whiteSpace: 'nowrap' }}>{new Date(e.date).toLocaleString('fr-FR')}</span>
            </div>

            {e.type === 'reservation' ? (
              <>
                <p style={ligne}><b>Email :</b> {e.lead.email}</p>
                <p style={ligne}><b>Fuseau horaire :</b> {e.lead.timezone}</p>
                <p style={ligne}><b>Disponibilités :</b> {(e.lead.availability || []).join(', ')}</p>
                <p style={ligne}><b>Niveau :</b> {e.lead.level}</p>
                <p style={ligne}><b>Objectifs :</b> {e.lead.goals}</p>
                <p style={ligne}><b>Priorités :</b> {e.lead.priorities}</p>
                <p style={{ ...ligne, marginBottom: e.lead.other ? 4 : 12 }}><b>Cours/semaine souhaités :</b> {e.lead.lessonsPerWeek}</p>
                {e.lead.other && <p style={{ ...ligne, marginBottom: 12 }}><b>Autre :</b> {e.lead.other}</p>}
              </>
            ) : (
              <>
                <p style={{ fontFamily: 'Fraunces, serif', fontSize: '1.6rem', color: '#0d2b45', margin: '2px 0 6px' }}>{e.test.resultat}</p>
                {e.test.email ? (
                  <p style={ligne}><b>Email :</b> {e.test.email}</p>
                ) : (
                  <p style={{ ...ligne, color: '#666', fontStyle: 'italic' }}>Coordonnées non laissées</p>
                )}
                <p style={ligne}>
                  <b>Scores :</b>{' '}
                  {e.test.scores
                    .map((s) => `${s.niveau} ${s.bonnes}/10${s.jeNeSaisPas ? ` (${s.jeNeSaisPas} « je ne sais pas »)` : ''}`)
                    .join(' · ')}
                </p>
                <p style={{ ...ligne, marginBottom: 8 }}><b>Langue de la page :</b> {e.test.langue === 'en' ? 'anglais' : 'français'}</p>
                {e.test.erreurs.length > 0 && (
                  <details style={{ marginBottom: 12, fontSize: '0.85rem' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#0d2b45' }}>Erreurs ({e.test.erreurs.length})</summary>
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {e.test.erreurs.map((err) => {
                        const question = trouverQuestion(err.id);
                        if (!question) return null;
                        return (
                          <li key={err.id}>
                            <span style={{ color: '#666' }}>{err.id} · </span>
                            {question.phrase}
                            <br />
                            <span style={{ color: '#c0392b' }}>
                              Choisi : {err.choix === null ? 'Je ne sais pas' : `${LETTRES[err.choix]}) ${question.options[err.choix]}`}
                            </span>
                            {' · '}
                            <span style={{ color: '#2e7d32' }}>
                              Attendu : {LETTRES[question.reponse]}) {question.options[question.reponse]}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </>
            )}
            <button onClick={() => supprimer(e)} style={dangerStyle}>Supprimer</button>
          </div>
        ))}
        {!loading && entrees.length === 0 && <p style={{ color: '#999', fontStyle: 'italic' }}>Aucune demande pour le moment.</p>}
      </div>
    </div>
  );
}
