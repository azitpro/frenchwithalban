'use client';
import { useEffect, useState } from 'react';
import { AdminChargement, AdminShell } from '../admin-ui';
import { trouverQuestion } from '@/lib/placement';
import type { TestPlacement } from '@/lib/placement';
import type { Signalement } from '@/lib/signalements';
import { formaterDate, formaterHeure } from '@/lib/reservations';
import type { Reservation } from '@/lib/reservations';

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

type Filtre = 'tous' | 'creneaux' | 'contacts' | 'tests' | 'signalements';
type Entree =
  | { type: 'creneau'; date: string; reservation: Reservation }
  | { type: 'contact'; date: string; lead: Lead }
  | { type: 'test'; date: string; test: TestPlacement }
  | { type: 'signalement'; date: string; signalement: Signalement };

/** Identifiant de l'entrée, quel que soit son type. */
const idDe = (e: Entree) =>
  e.type === 'creneau' ? e.reservation.id
    : e.type === 'test' ? e.test.id
      : e.type === 'signalement' ? e.signalement.id : e.lead.id;

const ROUTES: Record<Entree['type'], string> = {
  creneau: '/api/admin/reservations',
  contact: '/api/admin/leads',
  test: '/api/admin/placement',
  signalement: '/api/admin/signalements',
};

const TITRES: Record<Entree['type'], string> = {
  creneau: 'Créneau demandé',
  contact: 'Demande de contact',
  test: 'Test de placement',
  signalement: 'Signalement',
};

const LETTRES = ['a', 'b', 'c', 'd'];

export default function LeadsAdmin() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tests, setTests] = useState<TestPlacement[]>([]);
  const [signalements, setSignalements] = useState<Signalement[]>([]);
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [aConfirmer, setAConfirmer] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [resResas, resLeads, resTests, resSignalements] = await Promise.all([
          fetch('/api/admin/reservations', { cache: 'no-store' }),
          fetch('/api/admin/leads', { cache: 'no-store' }),
          fetch('/api/admin/placement', { cache: 'no-store' }),
          fetch('/api/admin/signalements', { cache: 'no-store' }),
        ]);
        if (!resResas.ok || !resLeads.ok || !resTests.ok || !resSignalements.ok) throw new Error('chargement');
        const donneesResas: { reservations: Reservation[] } = await resResas.json();
        const donneesLeads: Lead[] = await resLeads.json();
        const donneesTests: { tests: TestPlacement[] } = await resTests.json();
        const donneesSignalements: { signalements: Signalement[] } = await resSignalements.json();
        if (annule) return;
        setReservations(donneesResas.reservations);
        setLeads(donneesLeads);
        setTests(donneesTests.tests);
        setSignalements(donneesSignalements.signalements);
      } catch {
        if (!annule) setError('Impossible de charger les demandes.');
      }
      if (!annule) setLoading(false);
    })();
    return () => {
      annule = true;
    };
  }, []);

  const cle = (e: Entree) => `${e.type}-${idDe(e)}`;

  async function supprimer(entree: Entree) {
    const url = ROUTES[entree.type];
    const id = idDe(entree);
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
    if (entree.type === 'creneau') setReservations((r) => r.filter((x) => x.id !== id));
    else if (entree.type === 'test') setTests((t) => t.filter((x) => x.id !== id));
    else if (entree.type === 'signalement') setSignalements((s) => s.filter((x) => x.id !== id));
    else setLeads((l) => l.filter((x) => x.id !== id));
  }

  if (loading) return <AdminChargement texte="Chargement des demandes…" />;

  const entrees: Entree[] = [
    ...reservations.map((reservation): Entree => ({ type: 'creneau', date: reservation.envoyeLe, reservation })),
    ...leads.map((lead): Entree => ({ type: 'contact', date: lead.submittedAt, lead })),
    ...tests.map((test): Entree => ({ type: 'test', date: test.passeLe, test })),
    ...signalements.map((signalement): Entree => ({ type: 'signalement', date: signalement.envoyeLe, signalement })),
  ]
    .filter((e) => filtre === 'tous'
      || (filtre === 'creneaux' && e.type === 'creneau')
      || (filtre === 'contacts' && e.type === 'contact')
      || (filtre === 'tests' && e.type === 'test')
      || (filtre === 'signalements' && e.type === 'signalement'))
    .sort((a, b) => b.date.localeCompare(a.date));

  const boutonFiltre = (valeur: Filtre, libelle: string, nombre: number) => (
    <button key={valeur} className="ad-btn" onClick={() => setFiltre(valeur)} aria-pressed={filtre === valeur}>
      {libelle} <span className="dl-nombre">{nombre}</span>
    </button>
  );

  const total = reservations.length + leads.length + tests.length + signalements.length;

  return (
    <AdminShell titre="Demandes de contact" intro="Créneaux demandés, formulaires de la page Réserver, résultats du test de placement et problèmes signalés par les visiteurs, du plus récent au plus ancien.">
      <style href="admin-leads" precedence="default">{CSS}</style>
      <div className="dl-filtres">
        {boutonFiltre('tous', 'Tous', total)}
        {boutonFiltre('creneaux', 'Créneaux demandés', reservations.length)}
        {boutonFiltre('contacts', 'Demandes de contact', leads.length)}
        {boutonFiltre('tests', 'Tests de placement', tests.length)}
        {boutonFiltre('signalements', 'Signalements', signalements.length)}
      </div>
      {error && <p className="ad-message ad-erreur">{error}</p>}

      <div className="ad-liste dl-liste">
        {entrees.map((e) => (
          <article key={cle(e)} className={`dl-carte dl-${e.type}`}>
            <div className="dl-tete">
              <strong className="dl-nom">
                {e.type === 'creneau' ? e.reservation.prenom
                  : e.type === 'test' ? e.test.prenom || 'Anonyme'
                    : e.type === 'signalement' ? 'Problème signalé' : e.lead.firstName}
              </strong>
              <span className="ad-etiquette dl-type">{TITRES[e.type]}</span>
              <span className="dl-date">{new Date(e.date).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>

            {e.type === 'creneau' ? (
              <>
                <p className="dl-creneau-ligne">
                  <span className="dl-creneau-quand">{formaterDate(e.reservation.date)} à {formaterHeure(e.reservation.heure)}</span>
                  <span className="dl-creneau-duree">{e.reservation.duree} min</span>
                </p>
                {e.reservation.message && <p className="dl-message">{e.reservation.message}</p>}
                <dl className="dl-champs">
                  <dt>Email</dt>
                  <dd>{e.reservation.email ? <a href={`mailto:${e.reservation.email}`}>{e.reservation.email}</a> : <i>non laissé</i>}</dd>
                  <dt>Fuseau de l’élève</dt><dd>{e.reservation.fuseau || <i>non précisé</i>}</dd>
                  <dt>Langue de la page</dt><dd>{e.reservation.langue === 'en' ? 'anglais' : 'français'}</dd>
                </dl>
                <p className="dl-rappel">Le créneau reste affiché comme libre : à confirmer dans le planning.</p>
              </>
            ) : e.type === 'signalement' ? (
              <>
                <p className="dl-message">{e.signalement.message}</p>
                <dl className="dl-champs">
                  <dt>Page</dt><dd>{e.signalement.page || <i>non précisée</i>}</dd>
                  <dt>Email</dt>
                  <dd>{e.signalement.email ? <a href={`mailto:${e.signalement.email}`}>{e.signalement.email}</a> : <i>non laissé</i>}</dd>
                  <dt>Langue de la page</dt><dd>{e.signalement.langue === 'en' ? 'anglais' : 'français'}</dd>
                </dl>
              </>
            ) : e.type === 'contact' ? (
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
.dl-creneau{--c:var(--lime);--c-texte:var(--ink)}
.dl-contact{--c:var(--aqua);--c-texte:var(--ink)}
.dl-test{--c:var(--lemon);--c-texte:var(--ink)}
.dl-signalement{--c:var(--pink);--c-texte:#fff}
.dl-creneau-ligne{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px}
.dl-creneau-quand{display:inline-block;padding:1px 14px 3px;background:var(--lime);border:3px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);font-family:var(--titre);font-weight:800;font-size:1.15rem;line-height:1.3;rotate:-1deg}
.dl-creneau-duree{padding:1px 10px;border:2px solid var(--ink);border-radius:99px;background:#fff;font-size:.8rem;font-weight:700}
.dl-rappel{margin:10px 0 0;font-size:.82rem;font-weight:600;color:var(--soft)}
.dl-message{margin:0 0 10px;padding:10px 14px;background:var(--bg);border:2px solid var(--ink);border-radius:12px;font-size:.95rem;white-space:pre-wrap;overflow-wrap:anywhere}
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
