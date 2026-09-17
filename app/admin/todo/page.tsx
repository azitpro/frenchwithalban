'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AdminChargement, AdminShell } from '../admin-ui';
import { addDays, nowInParis, weekStartOf } from '@/lib/planning';
import {
  EMPTY_TODO, ETAPES_MAX, ETAPE_MAX, LIBELLE_MAX, NOTES_MAX, TITRE_MAX, TYPES_HORIZON,
  ajouterEtape, ajouterObjectif, basculerEtape, basculerObjectif, enRetard, grouper, modifierObjectif,
  avantLe, nomSemaine, supprimerObjectif, validerHorizon,
} from '@/lib/todo';
import type { Horizon, Objectif, Todo, TypeHorizon } from '@/lib/todo';

/* ======================= brouillon d'horizon ======================= */

type Brouillon = { type: TypeHorizon; date: string; semaine: string; libelle: string; echeance: string };

const brouillonVide = (aujourdhui: string): Brouillon => ({ type: 'jour', date: aujourdhui, semaine: weekStartOf(aujourdhui), libelle: '', echeance: '' });

function brouillonDe(h: Horizon, aujourdhui: string): Brouillon {
  const b = brouillonVide(aujourdhui);
  if (h.type === 'jour') return { ...b, type: 'jour', date: h.date };
  if (h.type === 'semaine') return { ...b, type: 'semaine', semaine: h.semaine };
  if (h.type === 'autre') return { ...b, type: 'autre', libelle: h.libelle, echeance: h.echeance ?? '' };
  return { ...b, type: 'long-terme' };
}

function horizonDe(b: Brouillon): { ok: true; horizon: Horizon } | { ok: false; erreur: string } {
  try {
    const brut =
      b.type === 'jour' ? { type: 'jour', date: b.date }
        : b.type === 'semaine' ? { type: 'semaine', semaine: b.semaine }
          : b.type === 'autre' ? { type: 'autre', libelle: b.libelle, echeance: b.echeance || null }
            : { type: 'long-terme' };
    return { ok: true, horizon: validerHorizon(brut) };
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : 'Horizon invalide.' };
  }
}

const SUGGESTIONS = ['Ce mois-ci', 'Le mois prochain', 'Ce trimestre', 'Cette année'];

function ChoixHorizon({ valeur, onChange, aujourdhui, libelles, prefixe }: {
  valeur: Brouillon; onChange: (b: Brouillon) => void; aujourdhui: string; libelles: string[]; prefixe: string;
}) {
  const maj = (champ: Partial<Brouillon>) => onChange({ ...valeur, ...champ });
  const semaineCourante = weekStartOf(aujourdhui);
  const propositions = [...new Set([...libelles, ...SUGGESTIONS])];
  return (
    <div className="td-horizon">
      <div className="td-types ad-suite" role="radiogroup" aria-label="Horizon">
        {TYPES_HORIZON.map((t) => (
          <button key={t.type} type="button" role="radio" aria-checked={valeur.type === t.type}
            className={`td-type ${valeur.type === t.type ? 'td-actif' : ''}`} onClick={() => maj({ type: t.type })}>
            {t.nom}
          </button>
        ))}
      </div>

      {valeur.type === 'jour' && (
        <div className="ad-champs">
          <label className="ad-champ td-date"><span>Jour</span>
            <input type="date" value={valeur.date} onChange={(e) => maj({ date: e.target.value })} required />
          </label>
          <button type="button" className="ad-btn ad-petit" aria-pressed={valeur.date === aujourdhui} onClick={() => maj({ date: aujourdhui })}>Aujourd’hui</button>
          <button type="button" className="ad-btn ad-petit" aria-pressed={valeur.date === addDays(aujourdhui, 1)} onClick={() => maj({ date: addDays(aujourdhui, 1) })}>Demain</button>
        </div>
      )}

      {valeur.type === 'semaine' && (
        <div className="ad-champs">
          <button type="button" className="ad-btn ad-petit" aria-pressed={valeur.semaine === semaineCourante} onClick={() => maj({ semaine: semaineCourante })}>Cette semaine</button>
          <button type="button" className="ad-btn ad-petit" aria-pressed={valeur.semaine === addDays(semaineCourante, 7)} onClick={() => maj({ semaine: addDays(semaineCourante, 7) })}>Semaine prochaine</button>
          <label className="ad-champ td-date"><span>Ou un jour de la semaine voulue</span>
            <input type="date" value={valeur.semaine} onChange={(e) => e.target.value && maj({ semaine: weekStartOf(e.target.value) })} />
          </label>
          <p className="td-precision">{valeur.semaine ? nomSemaine(valeur.semaine, aujourdhui) : ''}</p>
        </div>
      )}

      {valeur.type === 'autre' && (
        <div className="ad-champs">
          <label className="ad-champ td-libelle"><span>Nom de l’horizon</span>
            <input type="text" list={`${prefixe}-libelles`} maxLength={LIBELLE_MAX} placeholder="Ce mois-ci, avant l’été…"
              value={valeur.libelle} onChange={(e) => maj({ libelle: e.target.value })} />
            <datalist id={`${prefixe}-libelles`}>{propositions.map((l) => <option key={l} value={l} />)}</datalist>
          </label>
          <label className="ad-champ td-date"><span>Échéance (facultative)</span>
            <input type="date" value={valeur.echeance} onChange={(e) => maj({ echeance: e.target.value })} />
          </label>
        </div>
      )}

      {valeur.type === 'long-terme' && <p className="td-precision">Sans date : un cap à garder en tête.</p>}
    </div>
  );
}

/* ======================= page ======================= */

async function charger(): Promise<{ todo: Todo; revision: number }> {
  const res = await fetch('/api/admin/todo', { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.todo || !Number.isInteger(data.revision)) throw new Error(data?.error || 'Chargement impossible.');
  return data;
}

const COLONNES: { type: TypeHorizon; titre: string; vide: string }[] = [
  { type: 'jour', titre: 'Jour', vide: 'Aucun objectif daté.' },
  { type: 'semaine', titre: 'Semaine', vide: 'Aucun objectif de semaine.' },
  { type: 'autre', titre: 'Autres horizons', vide: 'Aucun autre horizon.' },
  { type: 'long-terme', titre: 'Long terme', vide: 'Aucun objectif à long terme.' },
];

export default function TodoAdmin() {
  const [aujourdhui, setAujourdhui] = useState(() => nowInParis().date);
  const [todo, setTodo] = useState<Todo>(EMPTY_TODO);
  const [chargement, setChargement] = useState(true);
  const [fatal, setFatal] = useState('');
  const [erreur, setErreur] = useState('');
  const [avert, setAvert] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [voirTermines, setVoirTermines] = useState(false);
  const [cochesSession, setCochesSession] = useState<Set<string>>(() => new Set());
  const [edition, setEdition] = useState<Objectif | null>(null);

  const [titre, setTitre] = useState('');
  const [brouillon, setBrouillon] = useState<Brouillon>(() => brouillonVide(nowInParis().date));
  const [erreurForm, setErreurForm] = useState('');
  const champTitre = useRef<HTMLInputElement>(null);

  // enregistrement : la dernière version locale est envoyée avec la révision chargée ; une seule requête à la fois
  const todoRef = useRef<Todo>(EMPTY_TODO);
  const revisionRef = useRef(0);
  const modifieRef = useRef(false);
  const fileRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    charger()
      .then((d) => { todoRef.current = d.todo; revisionRef.current = d.revision; setTodo(d.todo); })
      .catch((e) => setFatal(e instanceof Error ? e.message : 'Chargement impossible.'))
      .finally(() => setChargement(false));
    const minute = setInterval(() => setAujourdhui(nowInParis().date), 60_000);
    const avantDepart = (e: BeforeUnloadEvent) => { if (modifieRef.current) e.preventDefault(); };
    window.addEventListener('beforeunload', avantDepart);
    return () => { clearInterval(minute); window.removeEventListener('beforeunload', avantDepart); };
  }, []);

  async function enregistrer() {
    if (!modifieRef.current) return;
    modifieRef.current = false;
    const envoye = todoRef.current;
    setEnCours(true);
    try {
      const res = await fetch('/api/admin/todo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todo: envoye, revision: revisionRef.current }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.todo) {
        revisionRef.current = data.revision;
        setErreur('');
        if (!modifieRef.current) { todoRef.current = data.todo; setTodo(data.todo); }
      } else if (res.status === 409 && data?.todo) {
        revisionRef.current = data.revision;
        modifieRef.current = false;
        todoRef.current = data.todo;
        setTodo(data.todo);
        setAvert('La liste a été modifiée ailleurs (autre onglet ou appareil) : la version la plus récente est affichée, votre dernière modification n’a pas été enregistrée.');
      } else {
        modifieRef.current = true;
        setErreur(res.status === 401 ? 'Session expirée : rechargez la page.' : data?.error || 'Enregistrement impossible.');
      }
    } catch {
      modifieRef.current = true;
      setErreur('Enregistrement impossible : vérifiez la connexion.');
    }
    setEnCours(false);
  }

  function appliquer(changer: (t: Todo) => Todo) {
    const suivant = changer(todoRef.current);
    todoRef.current = suivant;
    setTodo(suivant);
    setAvert('');
    modifieRef.current = true;
    fileRef.current = fileRef.current.then(enregistrer);
  }
  const reessayer = () => { fileRef.current = fileRef.current.then(enregistrer); };

  function ajouter(e: FormEvent) {
    e.preventDefault();
    const t = titre.trim();
    if (!t) { setErreurForm('Écrivez d’abord l’objectif.'); champTitre.current?.focus(); return; }
    const h = horizonDe(brouillon);
    if (!h.ok) { setErreurForm(h.erreur); return; }
    appliquer((d) => ajouterObjectif(d, t, h.horizon));
    setTitre('');
    setErreurForm('');
    champTitre.current?.focus();
  }

  function cocher(o: Objectif) {
    if (!o.fait) setCochesSession((s) => new Set(s).add(o.id));
    appliquer((d) => basculerObjectif(d, o.id));
  }

  const libelles = useMemo(
    () => [...new Set(todo.objectifs.flatMap((o) => (o.horizon.type === 'autre' ? [o.horizon.libelle] : [])))],
    [todo],
  );
  const visibles = todo.objectifs.filter((o) => !o.fait || voirTermines || cochesSession.has(o.id));
  const nbTermines = todo.objectifs.filter((o) => o.fait).length;
  const nbRetard = todo.objectifs.filter((o) => enRetard(o, aujourdhui)).length;

  if (chargement) return <AdminChargement texte="Chargement de la liste…" />;
  if (fatal) {
    return (
      <AdminShell titre="To-do list">
        <p className="ad-message ad-erreur">{fatal}</p>
        <button className="ad-btn ad-plein" onClick={() => window.location.reload()}>Recharger</button>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      titre="To-do list"
      largeur="large"
      intro="Définissez un objectif, puis son horizon : un jour, une semaine, un autre horizon ou le long terme."
      actions={
        <>
          <span className="td-etat" aria-live="polite">{enCours ? 'Enregistrement…' : erreur ? 'Non enregistré' : 'Enregistré'}</span>
          <button className="ad-btn ad-petit" aria-pressed={voirTermines} onClick={() => setVoirTermines((v) => !v)}>
            {voirTermines ? 'Masquer' : 'Afficher'} les terminés ({nbTermines})
          </button>
        </>
      }
    >
      <style href="admin-todo" precedence="default">{CSS}</style>

      {erreur && (
        <p className="ad-message ad-erreur td-message">
          {erreur} <button className="ad-btn ad-petit" onClick={reessayer}>Réessayer</button>
        </p>
      )}
      {avert && <p className="ad-message ad-avert">{avert}</p>}

      <form className="ad-carte td-nouveau" onSubmit={ajouter} noValidate>
        <h2 className="ad-h2">Nouvel objectif</h2>
        <div className="td-nouveau-ligne">
          <label className="ad-champ td-titre-champ"><span>Objectif</span>
            <input ref={champTitre} type="text" maxLength={TITRE_MAX} placeholder="Préparer la leçon sur le subjonctif…"
              value={titre} onChange={(e) => { setTitre(e.target.value); setErreurForm(''); }} />
          </label>
        </div>
        <span className="ad-label">Horizon</span>
        <ChoixHorizon valeur={brouillon} onChange={(b) => { setBrouillon(b); setErreurForm(''); }} aujourdhui={aujourdhui} libelles={libelles} prefixe="nouveau" />
        <div className="td-nouveau-pied">
          {erreurForm && <p className="td-erreur-form" role="alert">{erreurForm}</p>}
          <button type="submit" className="ad-btn ad-rose">Ajouter l’objectif</button>
        </div>
      </form>

      {nbRetard > 0 && <p className="ad-message ad-avert td-retard-resume">{nbRetard} objectif{nbRetard > 1 ? 's' : ''} en retard.</p>}

      <div className="td-colonnes ad-suite">
        {COLONNES.map((col) => {
          const groupes = grouper(visibles, col.type, aujourdhui);
          const aFaire = todo.objectifs.filter((o) => o.horizon.type === col.type && !o.fait).length;
          return (
            <section key={col.type} className="td-colonne" aria-labelledby={`col-${col.type}`}>
              <h2 id={`col-${col.type}`} className="td-colonne-tete">
                {col.titre}<span className="td-compte">{aFaire}</span>
              </h2>
              {groupes.length === 0 && <p className="ad-vide">{col.vide}</p>}
              {groupes.map((g) => (
                <div key={g.cle} className="td-groupe">
                  {col.type !== 'long-terme' && (
                    <h3 className="td-groupe-titre">
                      {g.titre}
                      {g.retard && <span className="td-puce-retard">en retard</span>}
                    </h3>
                  )}
                  <ul className="td-liste">
                    {g.objectifs.map((o) => (
                      <CarteObjectif key={o.id} objectif={o} aujourdhui={aujourdhui}
                        onCocher={() => cocher(o)} onModifier={() => setEdition(o)}
                        onChanger={appliquer} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {edition && (
        <Edition
          objectif={todo.objectifs.find((o) => o.id === edition.id) ?? edition}
          aujourdhui={aujourdhui}
          libelles={libelles}
          onFermer={() => setEdition(null)}
          onEnregistrer={(changement) => { appliquer((d) => modifierObjectif(d, edition.id, changement)); setEdition(null); }}
          onSupprimer={() => { appliquer((d) => supprimerObjectif(d, edition.id)); setEdition(null); }}
        />
      )}
    </AdminShell>
  );
}

/* ======================= carte d'un objectif ======================= */

function CarteObjectif({ objectif: o, aujourdhui, onCocher, onModifier, onChanger }: {
  objectif: Objectif; aujourdhui: string; onCocher: () => void; onModifier: () => void; onChanger: (f: (t: Todo) => Todo) => void;
}) {
  const [nouvelleEtape, setNouvelleEtape] = useState<string | null>(null);
  const faites = o.etapes.filter((e) => e.fait).length;
  const retard = enRetard(o, aujourdhui);

  function validerEtape() {
    const t = (nouvelleEtape ?? '').trim();
    if (t) onChanger((d) => ajouterEtape(d, o.id, t));
    setNouvelleEtape(t ? '' : null);
  }
  function touche(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); validerEtape(); }
    if (e.key === 'Escape') setNouvelleEtape(null);
  }

  return (
    <li className={`td-objectif ${o.fait ? 'td-fait' : ''} ${retard ? 'td-en-retard' : ''}`}>
      <div className="td-objectif-tete">
        <button type="button" className="td-case" role="checkbox" aria-checked={o.fait} onClick={onCocher}
          aria-label={`${o.fait ? 'Marquer comme à faire' : 'Marquer comme terminé'} : ${o.titre}`}>
          <span aria-hidden="true">✓</span>
        </button>
        <button type="button" className="td-objectif-titre" onClick={onModifier} title="Modifier">{o.titre}</button>
      </div>
      <div className="td-meta">
        {o.horizon.type === 'autre' && o.horizon.echeance && <span>{avantLe(o.horizon.echeance, aujourdhui)}</span>}
        {o.etapes.length > 0 && <span>{faites}/{o.etapes.length} étape{o.etapes.length > 1 ? 's' : ''}</span>}
        {o.notes && <span title={o.notes}>notes</span>}
      </div>
      {o.etapes.length > 0 && (
        <ul className="td-etapes">
          {o.etapes.map((e) => (
            <li key={e.id} className={e.fait ? 'td-fait' : ''}>
              <label>
                <input type="checkbox" checked={e.fait} onChange={() => onChanger((d) => basculerEtape(d, o.id, e.id))} />
                <span>{e.texte}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {nouvelleEtape === null ? (
        !o.fait && o.etapes.length < ETAPES_MAX && (
          <button type="button" className="td-ajout-etape" onClick={() => setNouvelleEtape('')}>+ Étape</button>
        )
      ) : (
        <div className="td-etape-saisie">
          <input type="text" autoFocus maxLength={ETAPE_MAX} placeholder="Nouvelle étape" aria-label="Nouvelle étape"
            value={nouvelleEtape} onChange={(e) => setNouvelleEtape(e.target.value)} onKeyDown={touche} />
          <button type="button" className="ad-btn ad-petit" onClick={validerEtape}>OK</button>
        </div>
      )}
    </li>
  );
}

/* ======================= fenêtre de modification ======================= */

function Edition({ objectif, aujourdhui, libelles, onFermer, onEnregistrer, onSupprimer }: {
  objectif: Objectif; aujourdhui: string; libelles: string[];
  onFermer: () => void; onEnregistrer: (c: Partial<Pick<Objectif, 'titre' | 'notes' | 'horizon' | 'etapes'>>) => void; onSupprimer: () => void;
}) {
  const [titre, setTitre] = useState(objectif.titre);
  const [notes, setNotes] = useState(objectif.notes);
  const [brouillon, setBrouillon] = useState(() => brouillonDe(objectif.horizon, aujourdhui));
  const [etapes, setEtapes] = useState(objectif.etapes);
  const [confirmer, setConfirmer] = useState(false);
  const [erreurForm, setErreurForm] = useState('');
  const fenetre = useRef<HTMLDivElement>(null);
  const fermer = useRef(onFermer);
  useEffect(() => { fermer.current = onFermer; });

  // à l'ouverture seulement : focus dans la fenêtre, Échap pour fermer, focus rendu à la fermeture
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    fenetre.current?.querySelector<HTMLInputElement>('input')?.focus();
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer.current(); };
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('keydown', echap); precedent?.focus(); };
  }, []);

  function valider(e: FormEvent) {
    e.preventDefault();
    const t = titre.trim();
    if (!t) { setErreurForm('L’objectif ne peut pas être vide.'); return; }
    const h = horizonDe(brouillon);
    if (!h.ok) { setErreurForm(h.erreur); return; }
    const etapesPropres = etapes.map((x) => ({ ...x, texte: x.texte.trim() })).filter((x) => x.texte);
    onEnregistrer({ titre: t, notes: notes.trim(), horizon: h.horizon, etapes: etapesPropres });
  }

  return (
    <div className="td-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div ref={fenetre} className="ad-carte td-fenetre" role="dialog" aria-modal="true" aria-labelledby="td-edition-titre">
        <form onSubmit={valider} noValidate>
          <h2 id="td-edition-titre" className="ad-h2">Modifier l’objectif</h2>
          <label className="ad-champ td-bloc"><span>Objectif</span>
            <input type="text" maxLength={TITRE_MAX} value={titre} onChange={(e) => { setTitre(e.target.value); setErreurForm(''); }} />
          </label>
          <span className="ad-label">Horizon</span>
          <ChoixHorizon valeur={brouillon} onChange={(b) => { setBrouillon(b); setErreurForm(''); }} aujourdhui={aujourdhui} libelles={libelles} prefixe="edition" />
          {etapes.length > 0 && (
            <div className="td-bloc">
              <span className="ad-label">Étapes</span>
              <ul className="td-etapes-edition">
                {etapes.map((x) => (
                  <li key={x.id}>
                    <input type="text" maxLength={ETAPE_MAX} value={x.texte} aria-label="Étape"
                      onChange={(e) => setEtapes((l) => l.map((y) => (y.id === x.id ? { ...y, texte: e.target.value } : y)))} />
                    <button type="button" className="ad-btn ad-petit ad-danger" aria-label={`Supprimer l’étape ${x.texte}`}
                      onClick={() => setEtapes((l) => l.filter((y) => y.id !== x.id))}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="ad-champ td-bloc"><span>Notes</span>
            <textarea maxLength={NOTES_MAX} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Détails, liens, idées…" />
          </label>
          {erreurForm && <p className="td-erreur-form" role="alert">{erreurForm}</p>}
          <div className="td-fenetre-pied">
            {confirmer ? (
              <button type="button" className="ad-btn ad-danger td-gauche" onClick={onSupprimer}>Confirmer la suppression</button>
            ) : (
              <button type="button" className="ad-btn ad-danger td-gauche" onClick={() => setConfirmer(true)}>Supprimer</button>
            )}
            <button type="button" className="ad-btn" onClick={onFermer}>Annuler</button>
            <button type="submit" className="ad-btn ad-plein">Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const CSS = `
.td-etat{font-size:.75rem;font-weight:700;color:var(--soft)}
.td-message{display:flex;align-items:center;gap:10px;flex-wrap:wrap}

/* ---------- nouvel objectif ---------- */
.td-nouveau{margin-bottom:22px}
.td-nouveau .ad-h2{margin-bottom:12px}
.td-nouveau-ligne{margin-bottom:14px}
.td-titre-champ input{font-size:1.1rem!important;padding:11px 14px!important}
.td-horizon{display:grid;gap:12px;margin-top:6px}
.td-types{display:flex;gap:8px;flex-wrap:wrap}
.td-type{padding:7px 15px;border:2.5px solid var(--ink);border-radius:99px;background:#fff;font-weight:700;font-size:.88rem;box-shadow:2px 2px 0 var(--ink);transition:translate .12s,box-shadow .12s}
.td-type:hover{translate:-1px -1px;box-shadow:3px 3px 0 var(--ink)}
.td-type.td-actif{background:var(--c);color:var(--c-texte)}
.td-date{width:190px}
.td-libelle{flex:1;min-width:200px;max-width:340px}
.td-precision{margin:0;align-self:center;padding-bottom:6px;font-size:.88rem;font-weight:600;color:var(--soft)}
.td-nouveau-pied{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;margin-top:16px}
.td-erreur-form{margin:0 auto 0 0;color:var(--rose);font-weight:700;font-size:.88rem}
.td-retard-resume{display:inline-block}

/* ---------- colonnes ---------- */
.td-colonnes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;align-items:start}
.td-colonne{background:rgba(255,255,255,.6);border:3px solid var(--ink);border-radius:20px;box-shadow:5px 5px 0 var(--ink);padding:0 12px 14px;overflow:hidden}
.td-colonne-tete{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 -12px 12px;padding:10px 14px;background:var(--c);color:var(--c-texte);border-bottom:3px solid var(--ink);font-family:var(--titre);font-weight:800;font-size:1.2rem;letter-spacing:-.01em}
.td-compte{min-width:28px;padding:0 8px;border:2px solid var(--ink);border-radius:99px;background:#fff;color:var(--ink);font-size:.8rem;text-align:center}
.td-groupe+.td-groupe{margin-top:14px}
.td-groupe-titre{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 7px;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
.td-puce-retard{padding:0 8px;border:2px solid var(--ink);border-radius:99px;background:var(--pink);color:#fff;letter-spacing:.04em}
.td-liste{list-style:none;margin:0;padding:0;display:grid;gap:9px}

.td-objectif{background:#fff;border:2.5px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:9px 11px}
.td-objectif.td-en-retard{background:#fff0f6;border-color:var(--rose)}
.td-objectif-tete{display:flex;align-items:flex-start;gap:9px}
.td-case{flex:none;display:grid;place-items:center;width:26px;height:26px;margin-top:1px;border:2.5px solid var(--ink);border-radius:50%;background:#fff;padding:0}
.td-case span{font-weight:900;font-size:.85rem;line-height:1;opacity:0}
.td-case:hover span{opacity:.35}
.td-case[aria-checked="true"]{background:var(--lime)}
.td-case[aria-checked="true"] span{opacity:1}
.td-objectif-titre{flex:1;min-width:0;padding:2px 0;border:0;background:none;text-align:left;font-weight:600;font-size:.95rem;line-height:1.35;overflow-wrap:anywhere}
.td-objectif-titre:hover{text-decoration:underline;text-decoration-color:var(--pink);text-decoration-thickness:2px;text-underline-offset:3px}
.td-objectif.td-fait{background:#f6f3ee;box-shadow:none;border-style:dashed}
.td-objectif.td-fait .td-objectif-titre{text-decoration:line-through;color:var(--soft)}
.td-meta{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 0 35px}
.td-meta:empty{display:none}
.td-meta span{padding:0 7px;border:1.5px solid var(--ink);border-radius:99px;font-size:.66rem;font-weight:700;background:var(--bg)}
.td-etapes{list-style:none;margin:7px 0 0 35px;padding:0;display:grid;gap:3px}
.td-etapes label{display:flex;align-items:flex-start;gap:7px;font-size:.84rem;line-height:1.35;cursor:pointer}
.td-etapes input{flex:none;width:15px;height:15px;margin:2px 0 0;accent-color:var(--violet)}
.td-etapes .td-fait span{text-decoration:line-through;color:var(--soft)}
.td-ajout-etape{margin:6px 0 0 35px;padding:0 8px;border:1.5px dashed var(--ink);border-radius:99px;background:none;font-size:.72rem;font-weight:700;color:var(--soft)}
.td-ajout-etape:hover{background:var(--lemon);color:var(--ink)}
.td-etape-saisie{display:flex;gap:6px;margin:7px 0 0 35px}
.td-etape-saisie input{padding:4px 9px!important;font-size:.84rem!important;border-width:2px!important;border-radius:9px!important}

/* ---------- fenêtre ---------- */
.td-voile{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:rgba(27,19,64,.45)}
.td-fenetre{width:min(620px,100%);max-height:calc(100vh - 32px);overflow:auto}
.td-fenetre .ad-h2{margin-bottom:14px}
.td-bloc{margin:14px 0}
.td-fenetre .td-horizon{margin-bottom:6px}
.td-etapes-edition{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px}
.td-etapes-edition li{display:flex;gap:6px;align-items:center}
.td-etapes-edition input{padding:5px 10px!important;font-size:.9rem!important}
.td-fenetre-pied{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}
.td-gauche{margin-right:auto}

@media (prefers-reduced-motion:reduce){.td-type{transition:none}}
@media (max-width:1180px){.td-colonnes{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){
  .td-colonnes{grid-template-columns:minmax(0,1fr)}
  .td-date{width:100%}
  .td-libelle{max-width:none}
  .td-nouveau-pied .ad-btn{flex:1}
}
`;
