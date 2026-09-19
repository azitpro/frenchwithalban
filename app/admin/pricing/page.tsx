'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../admin-ui';
import { useDocumentEnregistre } from '../use-document';
import {
  DEVISES, EMPTY_ROSTER, NOM_MAX, NOTES, PLATEFORMES, SYMBOLE, TEXTE_MAX,
  calculer, decoderCsv, lettreDe, lireCsv, nouvelId,
} from '@/lib/roster';
import type { Devise, EleveRoster, LigneRoster, Note, Plateforme, Reglages, Roster, Sens, Tri } from '@/lib/roster';

// Page protégée par proxy.ts (authentification HTTP Basic) : le navigateur envoie le même
// mot de passe à /api/admin/roster.
// Les prénoms et les tarifs des élèves sont des données personnelles : ils ne figurent
// jamais dans le code (servi publiquement) et arrivent uniquement par l'API admin.

const eur = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const freq = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Les colonnes du tableau, dans l'ordre, avec la clé de tri de chacune. */
const COLONNES: { tri: Tri; titre: string; nombre: boolean; aide?: string }[] = [
  { tri: 'nom', titre: 'Élève', nombre: false },
  { tri: 'plateforme', titre: 'Plateforme', nombre: false },
  { tri: 'tarif', titre: 'Tarif brut', nombre: true, aide: 'Ce que paie l’élève. Le tri se fait sur la valeur en euros, les devises n’étant pas comparables entre elles.' },
  { tri: 'sansCommission', titre: 'Sans commission', nombre: true, aide: 'En euros, une fois la commission de la plateforme déduite. Calculé, non modifiable.' },
  { tri: 'sansUrssaf', titre: 'Sans URSSAF', nombre: true, aide: 'Ce qu’il vous reste vraiment, cotisations déduites. Calculé, non modifiable.' },
  { tri: 'frequence', titre: 'Fréquence', nombre: true, aide: 'Cours par semaine.' },
  { tri: 'assiduite', titre: 'Assiduité', nombre: true, aide: 'Note que vous attribuez, de A à F. Les élèves non notés restent en bas du classement.' },
];

export default function AdminPricing() {
  /* ---------- tarifs publics ---------- */
  const [realPrice, setRealPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [currency, setCurrency] = useState('$');
  const [duration, setDuration] = useState('50 min');
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then((r) => r.json())
      .then((p) => {
        setRealPrice(String(p.realPrice));
        setDiscountPrice(String(p.discountPrice));
        setCurrency(p.currency || '$');
        setDuration(p.duration || '50 min');
        setLoaded(true);
      })
      .catch(() => setMessage({ ok: false, texte: 'Impossible de charger les tarifs.' }));
  }, []);

  const real = Number(realPrice);
  const disc = Number(discountPrice);
  const remise = Number.isFinite(real) && Number.isFinite(disc) && real > 0 && disc < real ? Math.ceil(((real - disc) / real) * 100) : 0;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realPrice: real, discountPrice: disc, currency, duration }),
      });
      const data = await res.json().catch(() => null);
      setMessage(res.ok
        ? { ok: true, texte: 'Tarifs enregistrés.' }
        : { ok: false, texte: res.status === 401 ? 'Session expirée : rechargez la page.' : data?.error || "Erreur d'enregistrement." });
    } catch {
      setMessage({ ok: false, texte: "Erreur d'enregistrement." });
    }
    setSaving(false);
  }

  /* ---------- roster ---------- */
  const { donnees: roster, chargement, fatal, erreur, avert, etat, appliquer } =
    useDocumentEnregistre<Roster>('/api/admin/roster', 'roster', EMPTY_ROSTER, 'Le roster a été modifié ailleurs : la version du serveur est affichée.');

  const [tri, setTri] = useState<Tri>('sansUrssaf');
  const [sens, setSens] = useState<Sens>('desc');
  const [ouvert, setOuvert] = useState('');
  const [csv, setCsv] = useState('');
  const [apercu, setApercu] = useState<{ eleves: EleveRoster[]; ignorees: string[] } | null>(null);
  const [csvErreur, setCsvErreur] = useState('');
  const [survol, setSurvol] = useState(false);
  const [nomFichier, setNomFichier] = useState('');

  const { lignes, totaux } = useMemo(() => calculer(roster, tri, sens), [roster, tri, sens]);

  /** Un clic sur un en-tête trie dessus ; un second inverse le sens. */
  function trierPar(cle: Tri) {
    if (cle === tri) { setSens(sens === 'asc' ? 'desc' : 'asc'); return; }
    setTri(cle);
    // un nom se lit de A à Z, un montant se regarde du plus gros au plus petit
    setSens(cle === 'nom' || cle === 'plateforme' ? 'asc' : 'desc');
  }

  const modifier = (id: string, champ: keyof EleveRoster, valeur: unknown) =>
    appliquer((r) => ({ ...r, eleves: r.eleves.map((e) => (e.id === id ? { ...e, [champ]: valeur } : e)) }));

  const modifierReglage = (champ: keyof Reglages, valeur: number) =>
    appliquer((r) => ({ ...r, reglages: { ...r.reglages, [champ]: valeur } }));

  function ajouter() {
    const e: EleveRoster = {
      id: nouvelId(), nom: 'Nouvel élève', plateforme: 'Direct', tarif: 20, devise: 'EUR',
      frequence: 1, assiduite: null, derniereAugmentation: '', note: '',
    };
    appliquer((r) => ({ ...r, eleves: [...r.eleves, e] }));
    setOuvert(e.id);
  }

  const supprimer = (id: string) => {
    appliquer((r) => ({ ...r, eleves: r.eleves.filter((e) => e.id !== id) }));
    setOuvert('');
  };

  function analyser(texte: string) {
    const r = lireCsv(texte);
    if (!r.ok) { setCsvErreur(r.error); setApercu(null); return; }
    setCsvErreur('');
    setApercu({ eleves: r.eleves, ignorees: r.ignorees });
  }

  /** Un fichier choisi ou déposé est lu puis analysé tout de suite : rien d'autre à cliquer. */
  async function lireFichier(fichier: File | undefined) {
    if (!fichier) return;
    setNomFichier(fichier.name);
    try {
      const texte = decoderCsv(await fichier.arrayBuffer());
      setCsv(texte);
      analyser(texte);
    } catch {
      setCsvErreur('Fichier illisible.');
      setApercu(null);
    }
  }

  function importer() {
    if (!apercu) return;
    appliquer((r) => ({ ...r, eleves: apercu.eleves }));
    setApercu(null);
    setCsv('');
  }

  const montant = (v: number) => (Number.isFinite(v) ? `${eur.format(v)} €` : '—');

  return (
    <AdminShell
      titre="Tarifs"
      largeur="large"
      intro="Le prix réel est affiché barré sur la page de réservation, le prix remisé à côté. En dessous, le roster : ce que chaque élève vous rapporte réellement."
      actions={<span className="ap-etat" aria-live="polite">{chargement ? '' : etat}</span>}
    >
      <style href="admin-pricing" precedence="default">{CSS}</style>

      {/* ---------- TARIFS PUBLICS ---------- */}
      <div className="ad-carte">
        <h2 className="ad-h2">Prix affiché sur le site</h2>
        <div className="ap-grille">
          <label className="ad-champ"><span>Prix réel (barré)</span>
            <input type="number" step="1" min="1" value={realPrice} onChange={(e) => setRealPrice(e.target.value)} />
          </label>
          <label className="ad-champ"><span>Prix remisé (affiché)</span>
            <input type="number" step="1" min="1" value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)} />
          </label>
          <label className="ad-champ"><span>Devise</span>
            <input type="text" maxLength={20} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </label>
          <label className="ad-champ"><span>Durée</span>
            <input type="text" maxLength={20} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </label>
        </div>

        <div className="ap-apercu" aria-label="Aperçu">
          <span className="ad-label">Aperçu</span>
          <div>
            <span className="ap-ancien">{currency}{realPrice}</span>
            <span className="ap-nouveau">{currency}{discountPrice}</span>
            {remise > 0 && <span className="ap-remise">−{remise} %</span>}
          </div>
          <div className="ap-note">/ {duration} · Offre du moment</div>
        </div>

        {message && <p className={`ad-message ${message.ok ? 'ad-ok' : 'ad-erreur'}`} role="status">{message.texte}</p>}
        <button className="ad-btn ad-plein ap-enregistrer" onClick={save} disabled={saving || !loaded}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* ---------- ROSTER ---------- */}
      <section className="ad-carte ap-roster" aria-labelledby="ap-roster-titre">
        <h2 className="ad-h2" id="ap-roster-titre">Roster des élèves</h2>
        <p className="ad-aide">
          Tout se modifie directement dans le tableau : cliquez dans une case et changez la valeur.
          Seules les deux colonnes de net sont calculées. Cliquez sur un titre de colonne pour trier dessus, une seconde fois pour inverser.
        </p>

        {fatal && <p className="ad-message ad-erreur">{fatal}</p>}
        {erreur && <p className="ad-message ad-erreur">{erreur}</p>}
        {avert && <p className="ad-message ad-ok">{avert}</p>}
        {chargement && <p className="ad-vide">Chargement du roster…</p>}

        {!chargement && !fatal && (
          <>
            <details className="ap-reglages">
              <summary>Commission, cotisations et taux de change</summary>
              <div className="ap-grille ap-grille-3">
                <label className="ad-champ"><span>Commission Preply (%)</span>
                  <input type="number" step="0.5" min="0" max="99" value={Math.round(roster.reglages.commissionPreply * 1000) / 10}
                    onChange={(e) => modifierReglage('commissionPreply', Number(e.target.value) / 100)} />
                </label>
                <label className="ad-champ"><span>Cotisations URSSAF (%)</span>
                  <input type="number" step="0.1" min="0" max="99" value={Math.round(roster.reglages.cotisationsUrssaf * 1000) / 10}
                    onChange={(e) => modifierReglage('cotisationsUrssaf', Number(e.target.value) / 100)} />
                </label>
                <label className="ad-champ"><span>Semaines par mois</span>
                  <input type="number" step="0.01" min="1" max="6" value={roster.reglages.semainesParMois}
                    onChange={(e) => modifierReglage('semainesParMois', Number(e.target.value))} />
                </label>
                <label className="ad-champ"><span>1 $ en €</span>
                  <input type="number" step="0.001" min="0.001" value={roster.reglages.tauxUSD}
                    onChange={(e) => modifierReglage('tauxUSD', Number(e.target.value))} />
                </label>
                <label className="ad-champ"><span>1 £ en €</span>
                  <input type="number" step="0.001" min="0.001" value={roster.reglages.tauxGBP}
                    onChange={(e) => modifierReglage('tauxGBP', Number(e.target.value))} />
                </label>
              </div>
              <p className="ad-aide ap-verifier">
                Le taux URSSAF est à vérifier selon votre régime : j’ai mis 24,6 % par défaut.
              </p>
            </details>

            <div className="ap-impression-tete" aria-hidden="true">
              <strong>Roster des élèves</strong>
              <span>{totaux.nbEleves} élèves · {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>

            {lignes.length === 0 ? (
              <p className="ad-vide">Aucun élève : ajoutez-en un, ou importez votre CSV ci-dessous.</p>
            ) : (
              <div className="ap-defilement">
                <table className="ap-table">
                  <thead>
                    <tr>
                      {COLONNES.map((c) => (
                        <th key={c.tri} scope="col" className={c.nombre ? 'ap-num' : ''}
                          aria-sort={tri === c.tri ? (sens === 'asc' ? 'ascending' : 'descending') : 'none'}>
                          <button type="button" onClick={() => trierPar(c.tri)} title={c.aide}>
                            {c.titre}
                            <span className="ap-fleche" aria-hidden="true">{tri === c.tri ? (sens === 'asc' ? '▲' : '▼') : '⇅'}</span>
                          </button>
                          <span className="ap-imprime ap-imprime-titre">{c.titre}</span>
                        </th>
                      ))}
                      <th scope="col"><span className="ad-invisible">Notes et suppression</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <Ligne key={l.id} l={l} ouvert={ouvert === l.id}
                        basculer={() => setOuvert(ouvert === l.id ? '' : l.id)}
                        modifier={modifier} supprimer={supprimer} montant={montant} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">{totaux.nbEleves} élèves</th>
                      <td />
                      <td />
                      <td />
                      <td className="ap-num">{montant(totaux.hebdo)} / sem.</td>
                      <td className="ap-num">{freq.format(totaux.frequence)}</td>
                      <td className="ap-num">
                        {totaux.assiduiteMoyenne === null
                          ? <span className="ap-rien">—</span>
                          : <span className={`ap-note-lettre ap-note-${lettreDe(totaux.assiduiteMoyenne)}`}
                              title={`${totaux.assiduiteMoyenne.toFixed(2)} sur 4`}>{lettreDe(totaux.assiduiteMoyenne)}</span>}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {lignes.length > 0 && (
              <p className="ap-bilan">
                Net de tout : <strong>{montant(totaux.hebdo)}</strong> par semaine ·{' '}
                <strong>{montant(totaux.mensuel)}</strong> par mois
              </p>
            )}

            <div className="ap-actions">
              <button className="ad-btn ad-plein" onClick={ajouter}>Ajouter un élève</button>
              {lignes.length > 0 && (
                <button className="ad-btn" onClick={() => window.print()}>Télécharger le PDF</button>
              )}
            </div>

            <details className="ap-import">
              <summary>Importer depuis un CSV</summary>
              <p className="ad-aide">
                Choisissez le fichier exporté de votre tableur, ou déposez-le ici. Les colonnes inconnues sont ignorées,
                et une assiduité en pourcentage est convertie en note.
                <strong> L’import remplace tout le roster.</strong>
              </p>

              <label className={`ap-depot${survol ? ' ap-survol' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
                onDragLeave={() => setSurvol(false)}
                onDrop={(e) => { e.preventDefault(); setSurvol(false); lireFichier(e.dataTransfer.files[0]); }}>
                <input type="file" accept=".csv,text/csv,text/plain" className="ad-invisible"
                  onChange={(e) => { lireFichier(e.target.files?.[0]); e.target.value = ''; }} />
                <span className="ap-depot-bouton">Choisir un fichier CSV</span>
                <span className="ap-depot-note">{nomFichier || 'ou déposez le fichier ici'}</span>
              </label>

              {csvErreur && <p className="ad-message ad-erreur">{csvErreur}</p>}
              {apercu && (
                <div className="ap-actions">
                  <button className="ad-btn ad-plein" onClick={importer}>Remplacer le roster par ces {apercu.eleves.length} élèves</button>
                  <button className="ad-btn" onClick={() => { setApercu(null); setCsv(''); setNomFichier(''); }}>Annuler</button>
                </div>
              )}
              {apercu && (
                <div className="ap-apercu-csv">
                  <p><strong>{apercu.eleves.length}</strong> élève{apercu.eleves.length > 1 ? 's' : ''} lu{apercu.eleves.length > 1 ? 's' : ''} : {apercu.eleves.map((e) => e.nom).join(', ')}</p>
                  {apercu.ignorees.length > 0 && <p className="ap-ignorees">Lignes ignorées : {apercu.ignorees.join(' · ')}</p>}
                </div>
              )}

              <details className="ap-collage">
                <summary>Ou coller le texte à la main</summary>
                <textarea className="ap-csv" rows={5} value={csv} placeholder="Nom;Plateforme;Tarif;…"
                  onChange={(e) => { setCsv(e.target.value); setApercu(null); setCsvErreur(''); setNomFichier(''); }} aria-label="Contenu du CSV" />
                <div className="ap-actions">
                  <button className="ad-btn" onClick={() => analyser(csv)} disabled={!csv.trim()}>Analyser</button>
                </div>
              </details>
            </details>
          </>
        )}
      </section>
    </AdminShell>
  );
}

/* ---------- une ligne : tout y est modifiable sur place ---------- */

type LigneProps = {
  l: LigneRoster;
  ouvert: boolean;
  basculer: () => void;
  modifier: (id: string, champ: keyof EleveRoster, valeur: unknown) => void;
  supprimer: (id: string) => void;
  montant: (v: number) => string;
};

function Ligne({ l, ouvert, basculer, modifier, supprimer, montant }: LigneProps) {
  const [confirme, setConfirme] = useState(false);
  const champ = (c: keyof EleveRoster) => (v: unknown) => modifier(l.id, c, v);
  return (
    <>
      <tr className={ouvert ? 'ap-ouvert' : ''}>
        <th scope="row">
          <input className="ap-saisie ap-saisie-nom" type="text" maxLength={NOM_MAX} value={l.nom}
            aria-label={`Prénom de ${l.nom}`} onChange={(e) => champ('nom')(e.target.value)} />
          <span className="ap-imprime">{l.nom}</span>
          {l.note && <span className="ap-tag">{l.note}</span>}
        </th>

        <td>
          <select className={`ap-plateforme ap-${l.plateforme.toLowerCase()}`} value={l.plateforme}
            aria-label={`Plateforme de ${l.nom}`} onChange={(e) => champ('plateforme')(e.target.value as Plateforme)}>
            {PLATEFORMES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="ap-imprime ap-imprime-pastille">{l.plateforme}</span>
        </td>

        <td className="ap-num">
          <span className="ap-tarif">
            <input className="ap-saisie ap-saisie-nombre" type="number" step="0.5" min="0" value={l.tarif}
              aria-label={`Tarif de ${l.nom}`} onChange={(e) => champ('tarif')(Number(e.target.value))} />
            <select className="ap-devise" value={l.devise} aria-label={`Devise de ${l.nom}`}
              onChange={(e) => champ('devise')(e.target.value as Devise)}>
              {DEVISES.map((d) => <option key={d} value={d}>{SYMBOLE[d]}</option>)}
            </select>
            <span className="ap-imprime">{l.tarif} {SYMBOLE[l.devise]}</span>
          </span>
        </td>

        <td className="ap-num ap-calcule">{montant(l.sansCommission)}</td>
        <td className="ap-num ap-calcule ap-fort">{montant(l.sansUrssaf)}</td>

        <td className="ap-num">
          <input className="ap-saisie ap-saisie-nombre" type="number" step="0.5" min="0" value={l.frequence}
            aria-label={`Cours par semaine de ${l.nom}`} onChange={(e) => champ('frequence')(Number(e.target.value))} />
          <span className="ap-imprime">{freq.format(l.frequence)}</span>
        </td>

        <td className="ap-num">
          <select className={`ap-note-lettre ap-note-${l.assiduite ?? 'vide'}`} value={l.assiduite ?? ''}
            aria-label={`Assiduité de ${l.nom}`}
            onChange={(e) => champ('assiduite')(e.target.value === '' ? null : (e.target.value as Note))}>
            <option value="">—</option>
            {NOTES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="ap-imprime ap-imprime-pastille">{l.assiduite ?? '—'}</span>
        </td>

        <td>
          <button className="ad-btn ad-petit" onClick={basculer} aria-expanded={ouvert}
            aria-label={`Note et suppression pour ${l.nom}`}>{ouvert ? 'Fermer' : '···'}</button>
        </td>
      </tr>

      {ouvert && (
        <tr className="ap-edition">
          <td colSpan={8}>
            <div className="ap-form">
              <label className="ad-champ"><span>Note</span>
                <input type="text" maxLength={TEXTE_MAX} value={l.note} placeholder="À sortir, +1 $ (avril 2027)…"
                  onChange={(e) => champ('note')(e.target.value)} />
              </label>
              <label className="ad-champ"><span>Dernière augmentation</span>
                <input type="text" maxLength={TEXTE_MAX} value={l.derniereAugmentation} placeholder="juin 2026"
                  onChange={(e) => champ('derniereAugmentation')(e.target.value)} />
              </label>
              <div className="ap-suppression">
                {confirme ? (
                  <>
                    <button className="ad-btn ad-petit ad-danger" onClick={() => supprimer(l.id)}>Confirmer la suppression</button>
                    <button className="ad-btn ad-petit" onClick={() => setConfirme(false)}>Annuler</button>
                  </>
                ) : (
                  <button className="ad-btn ad-petit ad-danger" onClick={() => setConfirme(true)}>Retirer du roster</button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const CSS = `
.ap-etat{font-size:.75rem;font-weight:700;color:var(--soft)}
.ap-grille{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ap-grille-3{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px}
.ap-apercu{margin:20px 0;padding:16px;text-align:center;background:var(--bg);border:2.5px dashed var(--ink);border-radius:16px}
.ap-apercu .ad-label{display:block;margin-bottom:4px}
.ap-ancien{font-size:1.15rem;color:var(--soft);text-decoration:line-through;margin-right:10px}
.ap-nouveau{font-family:var(--titre);font-weight:800;font-size:2.2rem;letter-spacing:-.02em}
.ap-remise{display:inline-block;margin-left:10px;padding:2px 10px;background:var(--pink);color:#fff;border:2px solid var(--ink);border-radius:99px;font-size:.8rem;font-weight:800;vertical-align:.5em;rotate:-4deg}
.ap-note{font-size:.8rem;color:var(--soft);margin-top:2px}
.ap-enregistrer{width:100%;padding:11px}

.ap-roster{margin-top:22px}
.ap-reglages,.ap-import{margin:14px 0}
.ap-reglages summary,.ap-import summary{cursor:pointer;font-weight:700;font-size:.9rem}
.ap-verifier{margin-top:10px}
.ap-defilement{overflow-x:auto;margin:14px -4px 0}
.ap-table{width:100%;min-width:780px;border-collapse:collapse;font-size:.9rem}
.ap-table th,.ap-table td{padding:4px 8px;text-align:left;vertical-align:middle;border-bottom:2px solid #eae5f2;white-space:nowrap}
.ap-table thead th{padding:0;background:var(--ink);border-bottom:0}
.ap-table thead th:first-child{border-radius:10px 0 0 0}
.ap-table thead th:last-child{border-radius:0 10px 0 0}
.ap-table thead button{display:flex;align-items:center;gap:6px;width:100%;padding:7px 8px;background:none;border:0;color:#fff;font-family:var(--titre);font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;cursor:pointer}
.ap-table thead .ap-num button{justify-content:flex-end}
.ap-table thead button:hover{background:rgba(255,255,255,.14)}
.ap-fleche{opacity:.45;font-size:.8em}
.ap-table thead th[aria-sort="ascending"] .ap-fleche,.ap-table thead th[aria-sort="descending"] .ap-fleche{opacity:1;color:var(--lime)}
.ap-table .ap-num{text-align:right}
.ap-table tbody tr.ap-ouvert{background:#f6f3ff}
.ap-calcule{color:var(--soft)}
.ap-fort{font-weight:800;color:var(--ink)}
.ap-rien{color:var(--soft)}

/* saisies : discrètes tant qu'on n'y touche pas, pour que le tableau reste lisible */
.ap-saisie{width:100%;padding:3px 6px!important;background:transparent;border:2px solid transparent!important;border-radius:8px;font:inherit;color:inherit}
.ap-saisie:hover{border-color:#ded8e8!important;background:#fff}
.ap-saisie:focus{border-color:var(--violet)!important;background:#fff;outline:none}
.ap-saisie-nom{width:150px!important;font-weight:700}
.ap-saisie-nombre{width:62px!important;text-align:right;-moz-appearance:textfield}
.ap-saisie-nombre::-webkit-outer-spin-button,.ap-saisie-nombre::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.ap-tarif{display:inline-flex;align-items:center;gap:2px}
.ap-devise{width:auto!important;padding:3px 2px!important;background:transparent;border:2px solid transparent!important;font:inherit;text-align:center}
.ap-devise:hover,.ap-devise:focus{border-color:#ded8e8!important;background:#fff;outline:none}

.ap-plateforme{width:auto!important;padding:2px 10px!important;border:2px solid var(--ink)!important;border-radius:99px!important;font-size:.78rem;font-weight:800;cursor:pointer}
.ap-direct{background:var(--lime)}
.ap-preply{background:var(--orange)}
.ap-note-lettre{width:auto!important;min-width:40px;padding:2px 10px!important;border:2px solid var(--ink)!important;border-radius:99px!important;text-align:center;font-family:var(--titre);font-weight:800;font-size:.86rem;cursor:pointer}
.ap-note-A{background:var(--aqua)}
.ap-note-B{background:var(--lime)}
.ap-note-C{background:var(--lemon)}
.ap-note-D{background:var(--orange)}
.ap-note-F{background:var(--pink);color:#fff}
.ap-note-vide{background:transparent;border-color:#ded8e8!important;color:var(--soft)}
.ap-tag{display:inline-block;margin-left:6px;padding:0 8px;background:#ffe1ee;border:2px solid var(--ink);border-radius:99px;font-size:.72rem;font-weight:700;white-space:nowrap}
.ap-table tfoot th,.ap-table tfoot td{border-top:3px solid var(--ink);border-bottom:0;padding:8px;font-weight:800;background:var(--bg)}
.ap-bilan{margin:14px 0 0;padding:10px 14px;background:var(--lime);border:2.5px solid var(--ink);border-radius:12px;font-size:.92rem}
.ap-bilan strong{font-family:var(--titre);font-size:1.08rem}

.ap-edition td{background:#f6f3ff;white-space:normal}
.ap-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:6px 0 10px}
.ap-suppression{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap}

.ap-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.ap-csv{width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
.ap-depot{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:18px 20px;background:var(--bg);border:3px dashed var(--ink);border-radius:16px;cursor:pointer;transition:background .15s}
.ap-depot:hover,.ap-survol{background:#f3ffdd}
.ap-survol{border-style:solid}
.ap-depot-bouton{padding:9px 18px;background:var(--lime);border:2.5px solid var(--ink);border-radius:99px;box-shadow:3px 3px 0 var(--ink);font-weight:800;font-size:.9rem}
.ap-depot-note{color:var(--soft);font-size:.86rem}
.ap-collage{margin-top:14px}
.ap-collage summary{cursor:pointer;font-size:.84rem;color:var(--soft);font-weight:700}
.ap-collage .ap-csv{margin-top:8px}
.ap-apercu-csv{margin-top:10px;padding:10px 14px;background:var(--bg);border:2.5px dashed var(--ink);border-radius:12px;font-size:.86rem}
.ap-ignorees{color:var(--rose);font-weight:600}
.ad-invisible{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@media (prefers-reduced-motion:reduce){.ap-depot{transition:none}}
@media (max-width:760px){.ap-grille,.ap-grille-3{grid-template-columns:minmax(0,1fr)}}

/* les doublures de texte ne servent qu'à l'impression */
.ap-imprime,.ap-impression-tete{display:none}

/* ---------- impression : le roster seul, en A4 portrait ---------- */
@page{size:A4 portrait;margin:12mm}
@media print{
  .ad-barre,.ad-retour,.ad-h1,.ad-intro,.ap-roster>.ad-aide,.ap-reglages,.ap-import,.ap-actions,.ap-etat{display:none!important}
  .ad-carte:not(.ap-roster){display:none!important}
  .ad{background:#fff}
  .ad-corps{max-width:none;padding:0}
  .ap-roster{margin:0;padding:0;border:0;border-radius:0;box-shadow:none}
  .ap-roster>.ad-h2{display:none}
  .ap-impression-tete{display:flex;justify-content:space-between;align-items:baseline;gap:12px;
    margin-bottom:6mm;padding-bottom:2mm;border-bottom:2px solid var(--ink)}
  .ap-impression-tete strong{font-family:var(--titre);font-size:15pt}
  .ap-impression-tete span{font-size:9pt;color:var(--soft)}
  .ap-defilement{overflow:visible;margin:0}
  .ap-table{min-width:0;font-size:9pt}
  .ap-table th,.ap-table td{padding:1.6mm 2mm}
  .ap-table tr{break-inside:avoid}
  .ap-table thead{display:table-header-group} /* l'en-tête se répète à chaque page */
  .ap-table thead th{background:var(--ink)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ap-table thead button{display:none!important}
  .ap-imprime-titre{display:block;padding:1.6mm 2mm;color:#fff;font-family:var(--titre);
    font-size:7.5pt;letter-spacing:.05em;text-transform:uppercase}
  .ap-table thead .ap-num .ap-imprime-titre{text-align:right}
  /* la ligne de totaux ne doit apparaître qu'une fois, à la fin */
  .ap-table tfoot{display:table-row-group}
  .ap-table th:last-child,.ap-table td:last-child{display:none} /* colonne des boutons */
  .ap-saisie,.ap-plateforme,.ap-note-lettre,.ap-devise,.ap-tarif select,.ap-tarif input{display:none!important}
  .ap-imprime{display:inline;font:inherit}
  .ap-imprime-pastille{display:inline-block;padding:.4mm 2.5mm;border:.4mm solid var(--ink);border-radius:99px;
    font-weight:800;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ap-direct+.ap-imprime-pastille{background:var(--lime)}
  .ap-preply+.ap-imprime-pastille{background:var(--orange)}
  .ap-note-A+.ap-imprime-pastille{background:var(--aqua)}
  .ap-note-B+.ap-imprime-pastille{background:var(--lime)}
  .ap-note-C+.ap-imprime-pastille{background:var(--lemon)}
  .ap-note-D+.ap-imprime-pastille{background:var(--orange)}
  .ap-note-F+.ap-imprime-pastille{background:var(--pink);color:#fff}
  .ap-note-vide+.ap-imprime-pastille{border-color:#ded8e8;color:var(--soft)}
  .ap-bilan{background:transparent!important;border:.5mm solid var(--ink);margin-top:5mm;font-size:10pt}
  .ap-edition{display:none}
  .ap-tag{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;
