'use client';
import { useEffect, useState } from 'react';
import { AdminChargement, AdminShell } from '../admin-ui';
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
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

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

  const cle = (e: Entree) => `${e.type}-${e.type === 'test' ? e.test.id : e.lead.id}`;

  async function supprimer(entree: Entree) {
    const url = entree.type === 'test' ? '/api/admin/placement' : '/api/admin/leads';
    const id = entree.type === 'test' ? entree.test.id : entree.lead.id;
    setAConfirmer(null);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      setError('Erreur lors de la suppression.');
      return;
    }
    if (entree.type === 'test') setTests((t) => t.filter((x) => x.id !== id));
    else setLeads((l) => l.filter((x) => x.id !== id));
  }

  if (loading) return <AdminChargement texte="Chargement des demandes…" />;

  const entrees: Entree[] = [
    ...leads.map((lead): Entree => ({ type: 'reservation', date: lead.submittedAt, lead })),
    ...tests.map((test): Entree => ({ type: 'test', date: test.passeLe, test })),
  ]
    .filter((e) => filtre === 'tous' || (filtre === 'tests' ? e.type === 'test' : e.type === 'reservation'))
    .sort((a, b) => b.date.localeCompare(a.date));

  const boutonFiltre = (valeur: Filtre, libelle: string, nombre: number) => (
    <button key={valeur} className="ad-btn" onClick={() => setFiltre(valeur)} aria-pressed={filtre === valeur}>
      {libelle} <span className="dl-nombre">{nombre}</span>
    </button>
  );

  return (
    <AdminShell titre="Demandes de contact" intro="Formulaires envoyés depuis la page Réserver et résultats du test de placement, du plus récent au plus ancien.">
      <style href="admin-leads" precedence="default">{CSS}</style>
      <div className="dl-filtres">
        {boutonFiltre('tous', 'Tous', leads.length + tests.length)}
        {boutonFiltre('reservations', 'Réservations', leads.length)}
        {boutonFiltre('tests', 'Tests de placement', tests.length)}
      </div>
      {error && <p className="ad-message ad-erreur">{error}</p>}

      <div className="ad-liste dl-liste">
        {entrees.map((e) => (
          <article key={cle(e)} className={`dl-carte ${e.type === 'test' ? 'dl-test' : 'dl-resa'}`}>
            <div className="dl-tete">
              <strong className="dl-nom">{e.type === 'test' ? e.test.prenom || 'Anonyme' : e.lead.firstName}</strong>
              <span className="ad-etiquette dl-type">{e.type === 'test' ? 'Test de placement' : 'Réservation'}</span>
              <span className="dl-date">{new Date(e.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>

            {e.type === 'reservation' ? (
              <dl className="dl-champs">
                <dt>Email</dt><dd><a href={`mailto:${e.lead.email}`}>{e.lead.email}</a></dd>
                <dt>Fuseau horaire</dt><dd>{e.lead.timezone}</dd>
                <dt>Disponibilités</dt><dd>{(e.lead.availability || []).join(', ')}</dd>
                <dt>Niveau</dt><dd>{e.lead.level}</dd>
                <dt>Objectifs</dt><dd>{e.lead.goals}</dd>
                <dt>Priorités</dt><dd>{e.lead.priorities}</dd>
                <dt>Cours / semaine</dt><dd>{e.lead.lessonsPerWeek}</dd>
                {e.lead.other && <><dt>Autre</dt><dd>{e.lead.other}</dd></>}
              </dl>
            ) : (
              <>
                <div className="dl-resultat">
                  <span className="dl-niveau">{e.test.resultat}</span>
                  <ul className="dl-scores">
                    {e.test.scores.map((s) => (
                      <li key={s.niveau} className={s.bonnes >= 7 ? 'dl-valide' : ''}>
                        <b>{s.niveau}</b> {s.bonnes}/10{s.jeNeSaisPas ? <small> · {s.jeNeSaisPas} « je ne sais pas »</small> : null}
                      </li>
                    ))}
                  </ul>
                </div>
                <dl className="dl-champs">
                  <dt>Email</dt>
                  <dd>{e.test.email ? <a href={`mailto:${e.test.email}`}>{e.test.email}</a> : <i>Coordonnées non laissées</i>}</dd>
                  <dt>Langue de la page</dt><dd>{e.test.langue === 'en' ? 'anglais' : 'français'}</dd>
                </dl>
                {e.test.erreurs.length > 0 && (
                  <details className="dl-erreurs">
                    <summary>Erreurs ({e.test.erreurs.length})</summary>
                    <ul>
                      {e.test.erreurs.map((err) => {
                        const question = trouverQuestion(err.id);
                        if (!question) return null;
                        return (
                          <li key={err.id}>
                            <span className="dl-id">{err.id}</span> {question.phrase}
                            <br />
                            <span className="dl-choisi">Choisi : {err.choix === null ? 'Je ne sais pas' : `${LETTRES[err.choix]}) ${question.options[err.choix]}`}</span>
                            {' · '}
                            <span className="dl-attendu">Attendu : {LETTRES[question.reponse]}) {question.options[question.reponse]}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </>
            )}
            <div className="dl-pied">
              {aConfirmer === cle(e) ? (
                <>
                  <button className="ad-btn ad-petit ad-danger" onClick={() => supprimer(e)}>Confirmer la suppression</button>
                  <button className="ad-btn ad-petit" onClick={() => setAConfirmer(null)}>Annuler</button>
                </>
              ) : (
                <button className="ad-btn ad-petit ad-danger" onClick={() => setAConfirmer(cle(e))}>Supprimer</button>
              )}
            </div>
          </article>
        ))}
        {entrees.length === 0 && <p className="ad-vide">Aucune demande pour le moment.</p>}
      </div>
    </AdminShell>
  );
}

const CSS = `
.dl-filtres{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
.dl-nombre{min-width:22px;padding:0 6px;border:1.5px solid currentColor;border-radius:99px;font-size:.72rem;text-align:center}
.dl-liste{gap:16px}
.dl-carte{background:#fff;border:3px solid var(--ink);border-radius:18px;box-shadow:5px 5px 0 var(--ink);padding:14px 18px}
.dl-resa{--c:var(--aqua);--c-texte:var(--ink)}
.dl-test{--c:var(--lemon);--c-texte:var(--ink)}
.dl-tete{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap;margin-bottom:10px}
.dl-nom{font-family:var(--titre);font-weight:800;font-size:1.25rem;letter-spacing:-.01em}
.dl-date{margin-left:auto;font-size:.78rem;font-weight:600;color:var(--soft);white-space:nowrap}
.dl-champs{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 14px;margin:0;font-size:.9rem}
.dl-champs dt{font-weight:700;color:var(--soft)}
.dl-champs dd{margin:0;overflow-wrap:anywhere}
.dl-champs a{text-decoration-color:var(--pink);text-decoration-thickness:2px;text-underline-offset:3px}
.dl-resultat{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;margin-bottom:10px}
.dl-niveau{display:inline-block;padding:0 14px 3px;background:var(--lime);border:3px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);font-family:var(--titre);font-weight:800;font-size:1.9rem;line-height:1.1;rotate:-2deg}
.dl-scores{list-style:none;margin:0;padding:0;display:flex;gap:6px;flex-wrap:wrap}
.dl-scores li{padding:1px 9px;border:2px solid var(--ink);border-radius:99px;background:#fff;font-size:.8rem}
.dl-scores li.dl-valide{background:#ecffc4}
.dl-scores small{color:var(--soft)}
.dl-erreurs{margin-top:10px;font-size:.86rem}
.dl-erreurs summary{cursor:pointer;font-weight:700}
.dl-erreurs ul{margin:8px 0 0;padding-left:18px;display:grid;gap:6px}
.dl-id{font-weight:700;color:var(--soft)}
.dl-choisi{color:var(--rose);font-weight:600}
.dl-attendu{color:#2c7a2c;font-weight:600}
.dl-pied{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
@media (max-width:560px){.dl-date{margin-left:0;width:100%}.dl-champs{grid-template-columns:minmax(0,1fr)}.dl-champs dd{margin-bottom:6px}}
`;
