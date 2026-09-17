'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { AdminChargement, AdminShell } from '../admin-ui';
import { useDocumentEnregistre } from '../use-document';
import {
  DEVOIRS_PAR_DEFAUT, EMPTY_ELEVES, NIVEAUX_ELEVE, PRENOM_MAX, PUCES_MAX, PUCE_MAX, RUBRIQUES,
  ajouterFiche, ajouterPuces, appliquerImport, changerNiveau, deplacerPuce, ficheEnTexte, lireTexte, modifierPuce,
  nettoyerPrenom, nettoyerPuce, prenomPris, renommer, supprimerFiche, supprimerPuce,
} from '@/lib/eleves';
import type { CleRubrique, Eleves, Fiche, ImportFiche, NiveauEleve, Puce } from '@/lib/eleves';

// Page protégée par proxy.ts. Les fiches (données personnelles) arrivent uniquement par /api/admin/eleves.

const dateLongue = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(iso));

/** Lignes collées : une puce par ligne, sans les tirets ou numéros de liste. */
const lignesCollees = (texte: string) =>
  texte.split(/\r?\n/).map((l) => l.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, '')).filter(Boolean);

export default function FichesEleves() {
  const { donnees: eleves, chargement, fatal, erreur, avert, etat, appliquer, reessayer } = useDocumentEnregistre<Eleves>(
    '/api/admin/eleves', 'eleves', EMPTY_ELEVES,
    'Les fiches ont été modifiées ailleurs (autre onglet ou appareil) : la version la plus récente est affichée, votre dernière modification n’a pas été enregistrée.',
  );
  const [choisi, setChoisi] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [erreurNouveau, setErreurNouveau] = useState('');
  const [prenomsPlanning, setPrenomsPlanning] = useState<string[]>([]);
  const [fenetre, setFenetre] = useState<'import' | 'copie' | null>(null);
  const [message, setMessage] = useState('');
  const zoneFiche = useRef<HTMLDivElement>(null);

  // suggestions : élèves du planning des cours qui n'ont pas encore de fiche (facultatif)
  useEffect(() => {
    fetch('/api/admin/schedule', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        const noms = [...(s.students ?? []), ...(s.recurring ?? []).map((x: { student: string }) => x.student), ...(s.oneOff ?? []).map((x: { student: string }) => x.student)];
        setPrenomsPlanning([...new Set(noms.filter((n): n is string => typeof n === 'string' && !!n.trim()))]);
      })
      .catch(() => {});
  }, []);

  const fiches = useMemo(
    () => [...eleves.fiches].sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' })),
    [eleves],
  );
  const fiche = eleves.fiches.find((f) => f.id === choisi) ?? null;
  const filtre = recherche.trim().toLocaleLowerCase('fr');
  const visibles = filtre ? fiches.filter((f) => f.prenom.toLocaleLowerCase('fr').includes(filtre)) : fiches;
  const suggestions = prenomsPlanning.filter((p) => !prenomPris(eleves, p)).sort((a, b) => a.localeCompare(b, 'fr'));

  function choisir(id: string) {
    setChoisi(id);
    setMessage('');
    // sur petit écran, la fiche est sous la liste
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 900px)').matches) zoneFiche.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function creer(e: FormEvent) {
    e.preventDefault();
    const prenom = nettoyerPrenom(nouveau);
    if (!prenom) { setErreurNouveau(`Écrivez un prénom (${PRENOM_MAX} caractères au plus).`); return; }
    if (prenomPris(eleves, prenom)) { setErreurNouveau('Une fiche existe déjà pour cet élève.'); return; }
    let id = '';
    appliquer((d) => { const r = ajouterFiche(d, prenom); id = r.id; return r.eleves; });
    setNouveau('');
    setErreurNouveau('');
    if (id) choisir(id);
  }

  async function copier(f: Fiche) {
    try {
      await navigator.clipboard.writeText(ficheEnTexte(f));
      setMessage('Fiche copiée : collez-la dans la conversation avec l’IA.');
    } catch {
      setFenetre('copie'); // presse-papiers indisponible : le texte est affiché pour une copie manuelle
    }
  }

  if (chargement) return <AdminChargement texte="Chargement des fiches…" />;
  if (fatal) {
    return (
      <AdminShell titre="Fiches élèves">
        <p className="ad-message ad-erreur">{fatal}</p>
        <button className="ad-btn ad-plein" onClick={() => window.location.reload()}>Recharger</button>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      titre="Fiches élèves"
      largeur="large"
      intro="Le suivi de chaque élève : niveau, points forts et faibles, notions à retenir, devoirs et prochaines étapes. Tout se modifie à la main, ou se remplace en important un texte."
      actions={<span className="fe-etat" aria-live="polite">{etat}</span>}
    >
      <style href="admin-eleves" precedence="default">{CSS}</style>
      {erreur && (
        <p className="ad-message ad-erreur fe-message">{erreur} <button className="ad-btn ad-petit" onClick={reessayer}>Réessayer</button></p>
      )}
      {avert && <p className="ad-message ad-avert">{avert}</p>}

      <div className="fe-grille">
        {/* ---------- liste ---------- */}
        <aside className="ad-carte fe-liste" aria-label="Élèves">
          <h2 className="ad-h2">Élèves <span className="fe-nombre">{fiches.length}</span></h2>
          {fiches.length > 6 && (
            <input type="search" className="fe-recherche" placeholder="Rechercher…" aria-label="Rechercher un élève"
              value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          )}
          <ul className="fe-eleves">
            {visibles.map((f) => (
              <li key={f.id}>
                <button type="button" className={`fe-eleve ${f.id === choisi ? 'fe-actif' : ''}`} aria-current={f.id === choisi ? 'true' : undefined} onClick={() => choisir(f.id)}>
                  <span className="fe-eleve-nom">{f.prenom}</span>
                  {f.niveau && <span className="fe-niveau-pastille">{f.niveau}</span>}
                </button>
              </li>
            ))}
          </ul>
          {fiches.length === 0 && <p className="ad-vide">Aucune fiche pour l’instant.</p>}
          {fiches.length > 0 && visibles.length === 0 && <p className="ad-vide">Aucun élève trouvé.</p>}

          <form className="fe-nouveau" onSubmit={creer} noValidate>
            <label className="ad-champ"><span>Nouvelle fiche</span>
              <input type="text" list="fe-suggestions" maxLength={PRENOM_MAX} placeholder="Prénom de l’élève"
                value={nouveau} onChange={(e) => { setNouveau(e.target.value); setErreurNouveau(''); }} />
            </label>
            <datalist id="fe-suggestions">{suggestions.map((p) => <option key={p} value={p} />)}</datalist>
            {erreurNouveau && <p className="fe-erreur" role="alert">{erreurNouveau}</p>}
            <button type="submit" className="ad-btn ad-rose">Créer la fiche</button>
          </form>
        </aside>

        {/* ---------- fiche ---------- */}
        <div ref={zoneFiche} className="fe-zone">
          {fiche ? (
            <FicheEleve key={fiche.id} fiche={fiche} eleves={eleves} message={message}
              onChanger={appliquer}
              onCopier={() => copier(fiche)}
              onImporter={() => { setMessage(''); setFenetre('import'); }}
              onSupprimer={() => { appliquer((d) => supprimerFiche(d, fiche.id)); setChoisi(null); }} />
          ) : (
            <div className="ad-carte fe-accueil">
              <h2 className="ad-h2">{fiches.length ? 'Choisissez un élève' : 'Créez la première fiche'}</h2>
              <p className="ad-aide">
                {fiches.length ? 'Sa fiche s’affiche ici.' : 'Écrivez le prénom d’un élève dans « Nouvelle fiche ».'} Pour faire mettre une fiche à jour par l’IA :
                copiez-la, collez-la dans la conversation avec vos notes de cours, puis importez le texte renvoyé.
              </p>
            </div>
          )}
        </div>
      </div>

      {fenetre === 'import' && fiche && (
        <Import fiche={fiche} onFermer={() => setFenetre(null)}
          onAppliquer={(imp) => { appliquer((d) => appliquerImport(d, fiche.id, imp)); setFenetre(null); setMessage('Texte importé.'); }} />
      )}
      {fenetre === 'copie' && fiche && (
        <Fenetre titre={`Fiche de ${fiche.prenom} (texte)`} onFermer={() => setFenetre(null)}
          pied={<button className="ad-btn ad-plein" onClick={() => setFenetre(null)}>Fermer</button>}>
          <p className="ad-aide">La copie automatique n’est pas disponible : sélectionnez le texte ci-dessous et copiez-le.</p>
          <textarea className="fe-texte" readOnly value={ficheEnTexte(fiche)} onFocus={(e) => e.currentTarget.select()} aria-label="Texte de la fiche" />
        </Fenetre>
      )}
    </AdminShell>
  );
}

/* ======================= fiche ======================= */

function FicheEleve({ fiche, eleves, message, onChanger, onCopier, onImporter, onSupprimer }: {
  fiche: Fiche; eleves: Eleves; message: string;
  onChanger: (f: (d: Eleves) => Eleves) => void; onCopier: () => void; onImporter: () => void; onSupprimer: () => void;
}) {
  const [renommage, setRenommage] = useState<string | null>(null);
  const [erreurNom, setErreurNom] = useState('');
  const [confirmer, setConfirmer] = useState(false);

  function validerNom(e?: FormEvent) {
    e?.preventDefault();
    if (renommage === null) return;
    const prenom = nettoyerPrenom(renommage);
    if (!prenom) { setErreurNom('Prénom invalide.'); return; }
    if (prenomPris(eleves, prenom, fiche.id)) { setErreurNom('Une autre fiche porte déjà ce prénom.'); return; }
    if (prenom !== fiche.prenom) onChanger((d) => renommer(d, fiche.id, prenom));
    setRenommage(null);
    setErreurNom('');
  }

  return (
    <article className="fe-fiche" aria-labelledby="fe-prenom">
      <header className="ad-carte fe-tete">
        <div className="fe-identite">
          {renommage === null ? (
            <h2 id="fe-prenom" className="fe-prenom">
              {fiche.prenom}
              <button type="button" className="ad-btn ad-petit" onClick={() => setRenommage(fiche.prenom)}>Renommer</button>
            </h2>
          ) : (
            <form className="fe-renommer" onSubmit={validerNom} noValidate>
              <input type="text" autoFocus maxLength={PRENOM_MAX} aria-label="Prénom" value={renommage}
                onChange={(e) => { setRenommage(e.target.value); setErreurNom(''); }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setRenommage(null); setErreurNom(''); } }} />
              <button type="submit" className="ad-btn ad-petit ad-plein">OK</button>
              <button type="button" className="ad-btn ad-petit" onClick={() => { setRenommage(null); setErreurNom(''); }}>Annuler</button>
              {erreurNom && <p className="fe-erreur" role="alert">{erreurNom}</p>}
            </form>
          )}
          <label className="fe-niveau">
            <span className="ad-label">Niveau</span>
            <select value={fiche.niveau} onChange={(e) => onChanger((d) => changerNiveau(d, fiche.id, e.target.value as NiveauEleve))}>
              <option value="">Non renseigné</option>
              {NIVEAUX_ELEVE.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <p className="fe-maj">Mise à jour le {dateLongue(fiche.majLe)}</p>
        </div>
        <div className="fe-actions">
          <button type="button" className="ad-btn" onClick={onCopier}>Copier le texte</button>
          <button type="button" className="ad-btn ad-or" onClick={onImporter}>Importer un texte</button>
          {confirmer ? (
            <>
              <button type="button" className="ad-btn ad-danger" onClick={onSupprimer}>Confirmer la suppression</button>
              <button type="button" className="ad-btn" onClick={() => setConfirmer(false)}>Annuler</button>
            </>
          ) : (
            <button type="button" className="ad-btn ad-danger" onClick={() => setConfirmer(true)}>Supprimer la fiche</button>
          )}
        </div>
        {message && <p className="ad-message ad-ok fe-info" role="status">{message}</p>}
      </header>

      <div className="fe-rubriques ad-suite">
        {RUBRIQUES.map((r) => (
          <Rubrique key={r.cle} titre={r.titre} cle={r.cle} puces={fiche.rubriques[r.cle]} ficheId={fiche.id} onChanger={onChanger} />
        ))}
      </div>
    </article>
  );
}

function Rubrique({ titre, cle, puces, ficheId, onChanger }: {
  titre: string; cle: CleRubrique; puces: Puce[]; ficheId: string; onChanger: (f: (d: Eleves) => Eleves) => void;
}) {
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState('');
  const [edition, setEdition] = useState<{ id: string; texte: string } | null>(null);
  // Entrée termine l'édition, puis le champ disparaît et perd le focus : on ne valide qu'une fois
  const editionTerminee = useRef(false);
  const plein = puces.length >= PUCES_MAX;
  const commencerEdition = (p: Puce) => { editionTerminee.current = false; setEdition({ id: p.id, texte: p.texte }); setErreur(''); };

  function ajouter(textes: string[]) {
    const propres = textes.map((t) => nettoyerPuce(t)).filter((t): t is string => !!t);
    if (!propres.length) { setErreur(textes.length ? `Point trop long (${PUCE_MAX} caractères au plus).` : ''); return false; }
    if (propres.length < textes.length) setErreur(`Certains points trop longs ont été ignorés (${PUCE_MAX} caractères au plus).`);
    else setErreur('');
    const place = Math.max(0, PUCES_MAX - puces.length);
    onChanger((d) => ajouterPuces(d, ficheId, cle, propres.slice(0, place)));
    return true;
  }
  function soumettre(e: FormEvent) {
    e.preventDefault();
    const t = saisie.trim();
    if (!t) return;
    if (ajouter([t])) setSaisie('');
  }
  // plusieurs lignes collées d'un coup : un point par ligne
  function coller(e: ReactClipboardEvent<HTMLInputElement>) {
    const texte = e.clipboardData.getData('text');
    if (!/\n/.test(texte.trim())) return;
    e.preventDefault();
    if (ajouter(lignesCollees(texte))) setSaisie('');
  }
  function finEdition() {
    if (!edition || editionTerminee.current) return;
    const texte = nettoyerPuce(edition.texte);
    const avant = puces.find((p) => p.id === edition.id);
    if (!texte) {
      if (!edition.texte.trim()) onChanger((d) => supprimerPuce(d, ficheId, cle, edition.id));
      else { setErreur(`Point trop long (${PUCE_MAX} caractères au plus).`); return; }
    } else if (avant && texte !== avant.texte) {
      onChanger((d) => modifierPuce(d, ficheId, cle, edition.id, texte));
    }
    editionTerminee.current = true;
    setErreur('');
    setEdition(null);
  }
  function toucheEdition(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); finEdition(); }
    if (e.key === 'Escape') { editionTerminee.current = true; setEdition(null); setErreur(''); }
  }

  return (
    <section className="ad-carte fe-rubrique" aria-labelledby={`fe-${cle}`}>
      <h3 id={`fe-${cle}`} className="fe-rubrique-titre"><span className="fe-puce-couleur" aria-hidden="true" />{titre}</h3>
      <ul className="fe-puces">
        {puces.map((p, i) => (
          <li key={p.id} className="fe-puce">
            {edition?.id === p.id ? (
              <input type="text" autoFocus className="fe-puce-edition" maxLength={PUCE_MAX + 50} aria-label={`Modifier : ${p.texte}`}
                value={edition.texte} onChange={(e) => setEdition({ id: p.id, texte: e.target.value })} onBlur={finEdition} onKeyDown={toucheEdition} />
            ) : (
              <button type="button" className="fe-puce-texte" onClick={() => commencerEdition(p)} title="Modifier">{p.texte}</button>
            )}
            <span className="fe-puce-outils">
              <button type="button" disabled={i === 0} aria-label={`Monter : ${p.texte}`} onClick={() => onChanger((d) => deplacerPuce(d, ficheId, cle, p.id, -1))}>↑</button>
              <button type="button" disabled={i === puces.length - 1} aria-label={`Descendre : ${p.texte}`} onClick={() => onChanger((d) => deplacerPuce(d, ficheId, cle, p.id, 1))}>↓</button>
              <button type="button" className="fe-retirer" aria-label={`Supprimer : ${p.texte}`} onClick={() => onChanger((d) => supprimerPuce(d, ficheId, cle, p.id))}>×</button>
            </span>
          </li>
        ))}
        {puces.length === 0 && cle === 'devoirs' && (
          <li className="fe-puce fe-defaut"><span>{DEVOIRS_PAR_DEFAUT}</span><span className="fe-defaut-tag">par défaut</span></li>
        )}
      </ul>
      {puces.length === 0 && cle !== 'devoirs' && <p className="fe-vide">Rien pour l’instant.</p>}
      <form className="fe-ajout" onSubmit={soumettre} noValidate>
        <input type="text" value={saisie} maxLength={PUCE_MAX + 50} placeholder={plein ? `${PUCES_MAX} points au plus` : 'Ajouter un point…'} disabled={plein}
          aria-label={`Ajouter un point : ${titre}`} onChange={(e) => { setSaisie(e.target.value); setErreur(''); }} onPaste={coller} />
        <button type="submit" className="ad-btn ad-petit" disabled={plein || !saisie.trim()}>Ajouter</button>
      </form>
      {erreur && <p className="fe-erreur" role="alert">{erreur}</p>}
    </section>
  );
}

/* ======================= import ======================= */

function Import({ fiche, onFermer, onAppliquer }: { fiche: Fiche; onFermer: () => void; onAppliquer: (imp: ImportFiche) => void }) {
  const [texte, setTexte] = useState('');
  const [resultat, setResultat] = useState<ReturnType<typeof lireTexte> | null>(null);
  const imp = resultat?.ok ? resultat.import : null;

  function analyser() {
    setResultat(texte.trim() ? lireTexte(texte) : { ok: false, error: 'Collez d’abord le texte de la fiche.' });
  }

  return (
    <Fenetre titre={`Importer un texte · ${fiche.prenom}`} onFermer={onFermer} pied={
      <>
        <button type="button" className="ad-btn" onClick={onFermer}>Annuler</button>
        {imp ? (
          <button type="button" className="ad-btn ad-plein" onClick={() => onAppliquer(imp)}>Appliquer à la fiche</button>
        ) : (
          <button type="button" className="ad-btn ad-plein" onClick={analyser}>Vérifier le texte</button>
        )}
      </>
    }>
      {!imp ? (
        <>
          <p className="ad-aide">
            Collez une fiche au format texte (celle copiée avec « Copier le texte », mise à jour par l’IA). Les rubriques présentes
            dans le texte remplacent celles de la fiche ; les rubriques absentes ne changent pas.
          </p>
          <textarea className="fe-texte" value={texte} autoFocus aria-label="Texte à importer"
            placeholder={'# Prénom\nNiveau : B1\n\n## Points forts\n- …\n\n## Devoirs pour le prochain cours\n- …'}
            onChange={(e) => { setTexte(e.target.value); setResultat(null); }} />
          {resultat && !resultat.ok && <p className="fe-erreur" role="alert">{resultat.error}</p>}
        </>
      ) : (
        <div className="fe-apercu">
          <p className="ad-aide">Vérifiez les changements avant de les appliquer :</p>
          {imp.prenom && imp.prenom.toLocaleLowerCase('fr') !== fiche.prenom.toLocaleLowerCase('fr') && (
            <p className="ad-message ad-avert">Le texte concerne « {imp.prenom} », mais la fiche ouverte est celle de {fiche.prenom}. Le prénom de la fiche ne sera pas changé.</p>
          )}
          <ul className="fe-changements">
            {imp.niveau !== null && (
              <li><b>Niveau</b> : {fiche.niveau || 'non renseigné'} → {imp.niveau || 'non renseigné'}</li>
            )}
            {RUBRIQUES.filter((r) => imp.rubriques[r.cle]).map((r) => (
              <li key={r.cle}>
                <b>{r.titre}</b> : {fiche.rubriques[r.cle].length} → {imp.rubriques[r.cle]!.length} point{imp.rubriques[r.cle]!.length > 1 ? 's' : ''}
                {imp.rubriques[r.cle]!.length === 0 && r.cle === 'devoirs' && ' (devoirs par défaut)'}
              </li>
            ))}
            {RUBRIQUES.filter((r) => !imp.rubriques[r.cle]).length > 0 && (
              <li className="fe-inchange">Inchangé : {RUBRIQUES.filter((r) => !imp.rubriques[r.cle]).map((r) => r.titre).join(', ')}</li>
            )}
          </ul>
          {imp.avertissements.length > 0 && (
            <ul className="fe-avertissements">{imp.avertissements.map((a, i) => <li key={i}>{a}</li>)}</ul>
          )}
          <button type="button" className="ad-btn ad-petit" onClick={() => setResultat(null)}>← Modifier le texte</button>
        </div>
      )}
    </Fenetre>
  );
}

/* ======================= fenêtre ======================= */

function Fenetre({ titre, children, pied, onFermer }: { titre: string; children: ReactNode; pied: ReactNode; onFermer: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const fermer = useRef(onFermer);
  useEffect(() => { fermer.current = onFermer; });
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    if (!boite.current?.contains(document.activeElement)) boite.current?.querySelector<HTMLElement>('textarea, button')?.focus();
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer.current(); };
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('keydown', echap); precedent?.focus(); };
  }, []);
  return (
    <div className="fe-voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div ref={boite} className="ad-carte fe-fenetre" role="dialog" aria-modal="true" aria-labelledby="fe-fenetre-titre">
        <h2 id="fe-fenetre-titre" className="ad-h2">{titre}</h2>
        {children}
        <div className="fe-fenetre-pied">{pied}</div>
      </div>
    </div>
  );
}

const CSS = `
.fe-etat{font-size:.75rem;font-weight:700;color:var(--soft)}
.fe-message{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fe-grille{display:grid;grid-template-columns:290px minmax(0,1fr);gap:22px;align-items:start}

/* ---------- liste ---------- */
.fe-liste{position:sticky;top:84px;padding:16px}
.fe-liste .ad-h2{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.fe-nombre{min-width:26px;padding:0 8px;border:2px solid var(--ink);border-radius:99px;font-size:.8rem;text-align:center;background:var(--lime)}
.fe-recherche{margin-bottom:10px}
.fe-eleves{list-style:none;margin:0 0 14px;padding:0;display:grid;gap:6px;max-height:calc(100vh - 380px);overflow:auto}
.fe-eleve{display:flex;align-items:center;gap:8px;width:100%;padding:7px 12px;border:2px solid var(--ink);border-radius:12px;background:#fff;text-align:left;font-weight:600;transition:background .12s}
.fe-eleve:hover{background:var(--lemon)}
.fe-eleve.fe-actif{background:var(--lime);box-shadow:2px 2px 0 var(--ink)}
.fe-eleve-nom{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fe-niveau-pastille{flex:none;padding:0 8px;border:1.5px solid var(--ink);border-radius:99px;background:#fff;font-size:.7rem;font-weight:800}
.fe-nouveau{display:grid;gap:8px;padding-top:14px;border-top:2.5px dashed rgba(27,19,64,.25)}
.fe-erreur{margin:4px 0 0;color:var(--rose);font-weight:700;font-size:.85rem}

/* ---------- fiche ---------- */
.fe-accueil{max-width:640px}
.fe-tete{display:grid;gap:12px;margin-bottom:20px}
.fe-identite{display:flex;align-items:center;gap:10px 22px;flex-wrap:wrap}
.fe-prenom{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0;font-family:var(--titre);font-weight:800;font-size:2.1rem;line-height:1.05;letter-spacing:-.03em;overflow-wrap:anywhere}
.fe-renommer{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fe-renommer input{width:min(260px,100%);font-family:var(--titre);font-weight:800;font-size:1.3rem}
.fe-renommer .fe-erreur{width:100%}
.fe-niveau{display:flex;align-items:center;gap:8px}
.fe-niveau select{width:auto;min-width:150px;background-color:var(--lime);font-weight:800}
.fe-maj{margin:0 0 0 auto;font-size:.8rem;color:var(--soft)}
.fe-actions{display:flex;gap:8px;flex-wrap:wrap}
.fe-info{margin:0}

.fe-rubriques{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:start}
.fe-rubrique{padding:16px 18px}
.fe-rubrique-titre{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-family:var(--titre);font-weight:800;font-size:1.2rem;letter-spacing:-.01em;line-height:1.2}
.fe-puce-couleur{flex:none;width:16px;height:16px;border:2.5px solid var(--ink);border-radius:5px;background:var(--c);rotate:-8deg}
.fe-puces{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.fe-puce{position:relative;display:flex;align-items:flex-start;gap:6px;padding:3px 0 3px 18px;border-radius:8px}
.fe-puce::before{content:"";position:absolute;left:4px;top:.72em;width:7px;height:7px;border-radius:50%;background:var(--c);border:1.5px solid var(--ink)}
.fe-puce:hover{background:var(--bg)}
.fe-puce-texte{flex:1;min-width:0;padding:1px 2px;border:0;background:none;text-align:left;font-size:.93rem;line-height:1.45;overflow-wrap:anywhere;cursor:text}
.fe-puce-edition{flex:1;padding:2px 8px;font-size:.93rem;border-width:2px;border-radius:8px}
.fe-puce-outils{flex:none;display:flex;gap:1px;opacity:.25;transition:opacity .15s}
.fe-puce:hover .fe-puce-outils,.fe-puce-outils:focus-within{opacity:1}
@media (hover:none){.fe-puce-outils{opacity:1}}
.fe-puce-outils button{width:24px;height:24px;padding:0;border:1.5px solid transparent;border-radius:6px;background:none;font-weight:800;font-size:.8rem;line-height:1}
.fe-puce-outils button:hover:not(:disabled){border-color:var(--ink);background:var(--lemon)}
.fe-puce-outils button:disabled{opacity:.25;cursor:default}
.fe-puce-outils .fe-retirer:hover:not(:disabled){background:#ffe1ee}
.fe-defaut{align-items:center;color:var(--soft);font-style:italic;font-size:.93rem}
.fe-defaut::before{background:#fff}
.fe-defaut-tag{flex:none;padding:0 7px;border:1.5px dashed var(--ink);border-radius:99px;font-size:.66rem;font-style:normal;font-weight:700}
.fe-vide{margin:0;color:var(--soft);font-size:.86rem;font-style:italic}
.fe-ajout{display:flex;gap:6px;margin-top:10px}
.fe-ajout input{padding:5px 10px;font-size:.88rem;border-width:2px;border-radius:10px}

/* ---------- fenêtres ---------- */
.fe-voile{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:rgba(27,19,64,.45)}
.fe-fenetre{width:min(680px,100%);max-height:calc(100vh - 32px);overflow:auto}
.fe-fenetre .ad-h2{margin-bottom:10px}
.fe-texte{min-height:300px;font-family:ui-monospace,Consolas,monospace;font-size:.85rem;line-height:1.5}
.fe-fenetre-pied{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:16px}
.fe-changements{margin:0 0 12px;padding-left:20px;display:grid;gap:4px}
.fe-inchange{color:var(--soft)}
.fe-avertissements{margin:0 0 12px;padding:10px 14px 10px 30px;background:#fff4c2;border:2px solid var(--ink);border-radius:12px;font-size:.86rem}

@media (prefers-reduced-motion:reduce){.fe-eleve,.fe-puce-outils{transition:none}}
@media (max-width:1180px){.fe-rubriques{grid-template-columns:minmax(0,1fr)}}
@media (max-width:900px){
  .fe-grille{grid-template-columns:minmax(0,1fr)}
  .fe-liste{position:static}
  .fe-eleves{max-height:260px}
  .fe-zone{scroll-margin-top:80px}
  .fe-maj{margin-left:0;width:100%}
  .fe-prenom{font-size:1.7rem}
}
`;
