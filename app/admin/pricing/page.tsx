'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../admin-ui';
import { useDocumentEnregistre } from '../use-document';
import {
  CRITERES, DEVISES, EMPTY_ROSTER, NOM_MAX, PLATEFORMES, SYMBOLE, TEXTE_MAX,
  calculer, lireCsv, nouvelId,
} from '@/lib/roster';
import type { Devise, EleveRoster, Plateforme, Reglages, Roster } from '@/lib/roster';

// Page protégée par proxy.ts (authentification HTTP Basic) : le navigateur envoie le même
// mot de passe à /api/admin/roster.
// Les prénoms et les tarifs des élèves sont des données personnelles : ils ne figurent
// jamais dans le code (servi publiquement) et arrivent uniquement par l'API admin.

const eur = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const freq = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n)} %`);

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

  const [ouvert, setOuvert] = useState('');
  const [csv, setCsv] = useState('');
  const [apercu, setApercu] = useState<{ eleves: EleveRoster[]; ignorees: string[] } | null>(null);
  const [csvErreur, setCsvErreur] = useState('');

  const { lignes, totaux } = useMemo(() => calculer(roster), [roster]);

  const modifier = (id: string, champ: keyof EleveRoster, valeur: unknown) =>
    appliquer((r) => ({ ...r, eleves: r.eleves.map((e) => (e.id === id ? { ...e, [champ]: valeur } : e)) }));

  const modifierReglage = (champ: keyof Reglages, valeur: number) =>
    appliquer((r) => ({ ...r, reglages: { ...r.reglages, [champ]: valeur } }));

  function ajouter() {
    const e: EleveRoster = {
      id: nouvelId(), nom: 'Nouvel élève', plateforme: 'Direct', tarif: 20, devise: 'EUR',
      frequence: 1, relation: null, horaire: null, prix: null, assiduite: null, derniereAugmentation: '', note: '',
    };
    appliquer((r) => ({ ...r, eleves: [...r.eleves, e] }));
    setOuvert(e.id);
  }

  const supprimer = (id: string) => {
    appliquer((r) => ({ ...r, eleves: r.eleves.filter((e) => e.id !== id) }));
    setOuvert('');
  };

  function analyser() {
    const r = lireCsv(csv);
    if (!r.ok) { setCsvErreur(r.error); setApercu(null); return; }
    setCsvErreur('');
    setApercu({ eleves: r.eleves, ignorees: r.ignorees });
  }

  function importer() {
    if (!apercu) return;
    appliquer((r) => ({ ...r, eleves: apercu.eleves }));
    setApercu(null);
    setCsv('');
  }

  const nombre = (v: number) => (Number.isFinite(v) ? eur.format(v) : '—');

  return (
    <AdminShell
      titre="Tarifs"
      largeur="large"
      intro="Le prix réel est affiché barré sur la page de réservation, le prix remisé à côté. En dessous, le roster de vos élèves : ce que chacun rapporte réellement."
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
          Seuls le tarif, la plateforme, la fréquence et les quatre critères sont enregistrés.
          Le net horaire, les revenus et le score sont recalculés : changez la commission ou un taux de change, tout suit.
        </p>

        {fatal && <p className="ad-message ad-erreur">{fatal}</p>}
        {erreur && <p className="ad-message ad-erreur">{erreur}</p>}
        {avert && <p className="ad-message ad-ok">{avert}</p>}
        {chargement && <p className="ad-vide">Chargement du roster…</p>}

        {!chargement && !fatal && (
          <>
            <details className="ap-reglages">
              <summary>Commission et taux de change</summary>
              <div className="ap-grille ap-grille-4">
                <label className="ad-champ"><span>Commission Preply (%)</span>
                  <input type="number" step="0.5" min="0" max="99" value={Math.round(roster.reglages.commissionPreply * 1000) / 10}
                    onChange={(e) => modifierReglage('commissionPreply', Number(e.target.value) / 100)} />
                </label>
                <label className="ad-champ"><span>1 $ en €</span>
                  <input type="number" step="0.001" min="0.001" value={roster.reglages.tauxUSD}
                    onChange={(e) => modifierReglage('tauxUSD', Number(e.target.value))} />
                </label>
                <label className="ad-champ"><span>1 £ en €</span>
                  <input type="number" step="0.001" min="0.001" value={roster.reglages.tauxGBP}
                    onChange={(e) => modifierReglage('tauxGBP', Number(e.target.value))} />
                </label>
                <label className="ad-champ"><span>Semaines par mois</span>
                  <input type="number" step="0.01" min="1" max="6" value={roster.reglages.semainesParMois}
                    onChange={(e) => modifierReglage('semainesParMois', Number(e.target.value))} />
                </label>
              </div>
            </details>

            {lignes.length === 0 ? (
              <p className="ad-vide">Aucun élève : ajoutez-en un, ou importez votre CSV ci-dessous.</p>
            ) : (
              <div className="ap-defilement">
                <table className="ap-table">
                  <thead>
                    <tr>
                      <th scope="col">Élève</th>
                      <th scope="col">Plateforme</th>
                      <th scope="col" className="ap-num">Tarif</th>
                      <th scope="col" className="ap-num">Net/h</th>
                      <th scope="col" className="ap-num">% moyen</th>
                      <th scope="col" className="ap-num">Fréq.</th>
                      <th scope="col" className="ap-num">Hebdo</th>
                      <th scope="col" className="ap-num">Mensuel</th>
                      {CRITERES.map((c) => <th scope="col" key={c.cle} className="ap-num">{c.titre}</th>)}
                      <th scope="col" className="ap-num">Score</th>
                      <th scope="col">Dern. augm.</th>
                      <th scope="col">Note</th>
                      <th scope="col"><span className="ad-invisible">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <RowGroup key={l.id} l={l} ouvert={ouvert === l.id}
                        basculer={() => setOuvert(ouvert === l.id ? '' : l.id)}
                        modifier={modifier} supprimer={supprimer} nombre={nombre} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">Total · {totaux.nbEleves} élèves</th>
                      <td />
                      <td />
                      <td className="ap-num">{nombre(totaux.netMoyen)} €</td>
                      <td />
                      <td className="ap-num">{freq.format(totaux.frequence)}</td>
                      <td className="ap-num">{nombre(totaux.hebdo)} €</td>
                      <td className="ap-num">{nombre(totaux.mensuel)} €</td>
                      {CRITERES.map((c) => <td key={c.cle} className="ap-num">{pct(totaux.criteres[c.cle])}</td>)}
                      <td className="ap-num">{pct(totaux.scoreMoyen)}</td>
                      <td />
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="ap-actions">
              <button className="ad-btn ad-plein" onClick={ajouter}>Ajouter un élève</button>
            </div>

            <details className="ap-import">
              <summary>Importer depuis un CSV</summary>
              <p className="ad-aide">
                Collez le contenu de votre tableur, séparateur « ; ». Les colonnes calculées sont ignorées puisque le site les recalcule.
                <strong> L’import remplace tout le roster.</strong>
              </p>
              <textarea className="ap-csv" rows={6} value={csv} placeholder="Nom;Plateforme;Tarif;…"
                onChange={(e) => { setCsv(e.target.value); setApercu(null); setCsvErreur(''); }} aria-label="Contenu du CSV" />
              {csvErreur && <p className="ad-message ad-erreur">{csvErreur}</p>}
              <div className="ap-actions">
                <button className="ad-btn" onClick={analyser} disabled={!csv.trim()}>Analyser</button>
                {apercu && <button className="ad-btn ad-plein" onClick={importer}>Remplacer le roster par ces {apercu.eleves.length} élèves</button>}
              </div>
              {apercu && (
                <div className="ap-apercu-csv">
                  <p><strong>{apercu.eleves.length}</strong> élève{apercu.eleves.length > 1 ? 's' : ''} lu{apercu.eleves.length > 1 ? 's' : ''} : {apercu.eleves.map((e) => e.nom).join(', ')}</p>
                  {apercu.ignorees.length > 0 && <p className="ap-ignorees">Lignes ignorées : {apercu.ignorees.join(' · ')}</p>}
                </div>
              )}
            </details>
          </>
        )}
      </section>
    </AdminShell>
  );
}

/* ---------- une ligne, et son formulaire de modification ---------- */

type LigneProps = {
  l: ReturnType<typeof calculer>['lignes'][number];
  ouvert: boolean;
  basculer: () => void;
  modifier: (id: string, champ: keyof EleveRoster, valeur: unknown) => void;
  supprimer: (id: string) => void;
  nombre: (v: number) => string;
};

function RowGroup({ l, ouvert, basculer, modifier, supprimer, nombre }: LigneProps) {
  const [confirme, setConfirme] = useState(false);
  return (
    <>
      <tr className={ouvert ? 'ap-ouvert' : ''}>
        <th scope="row">{l.nom}</th>
        <td>{l.plateforme}</td>
        <td className="ap-num">{l.tarif} {SYMBOLE[l.devise]}</td>
        <td className="ap-num ap-fort">{nombre(l.net)} €</td>
        <td className="ap-num">{Math.round(l.partNetMoyen)} %</td>
        <td className="ap-num">{freq.format(l.frequence)}</td>
        <td className="ap-num">{nombre(l.hebdo)} €</td>
        <td className="ap-num">{nombre(l.mensuel)} €</td>
        {CRITERES.map((c) => <td key={c.cle} className="ap-num">{pct(l[c.cle])}</td>)}
        <td className="ap-num">
          {l.score === null
            ? <span className="ap-rien">—</span>
            : <span className={`ap-score${l.score < 50 ? ' ap-score-bas' : ''}`}>{pct(l.score)}</span>}
        </td>
        <td>{l.derniereAugmentation || <span className="ap-rien">—</span>}</td>
        <td>{l.note ? <span className="ap-tag">{l.note}</span> : <span className="ap-rien">—</span>}</td>
        <td>
          <button className="ad-btn ad-petit" onClick={basculer} aria-expanded={ouvert}>
            {ouvert ? 'Fermer' : 'Modifier'}
          </button>
        </td>
      </tr>

      {ouvert && (
        <tr className="ap-edition">
          <td colSpan={16}>
            <div className="ap-form">
              <label className="ad-champ"><span>Prénom</span>
                <input type="text" maxLength={NOM_MAX} value={l.nom} onChange={(e) => modifier(l.id, 'nom', e.target.value)} />
              </label>
              <label className="ad-champ"><span>Plateforme</span>
                <select value={l.plateforme} onChange={(e) => modifier(l.id, 'plateforme', e.target.value as Plateforme)}>
                  {PLATEFORMES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="ad-champ"><span>Tarif</span>
                <input type="number" step="0.5" min="0" value={l.tarif} onChange={(e) => modifier(l.id, 'tarif', Number(e.target.value))} />
              </label>
              <label className="ad-champ"><span>Devise</span>
                <select value={l.devise} onChange={(e) => modifier(l.id, 'devise', e.target.value as Devise)}>
                  {DEVISES.map((d) => <option key={d} value={d}>{d} {SYMBOLE[d]}</option>)}
                </select>
              </label>
              <label className="ad-champ"><span>Cours / semaine</span>
                <input type="number" step="0.5" min="0" value={l.frequence} onChange={(e) => modifier(l.id, 'frequence', Number(e.target.value))} />
              </label>
              {CRITERES.map((c) => (
                <label className="ad-champ" key={c.cle}><span>{c.titre} (%)</span>
                  <input type="number" step="1" min="0" max="100" value={l[c.cle] ?? ''}
                    onChange={(e) => modifier(l.id, c.cle, e.target.value === '' ? null : Number(e.target.value))} />
                </label>
              ))}
              <label className="ad-champ"><span>Dernière augmentation</span>
                <input type="text" maxLength={TEXTE_MAX} value={l.derniereAugmentation}
                  onChange={(e) => modifier(l.id, 'derniereAugmentation', e.target.value)} />
              </label>
              <label className="ad-champ ap-large-champ"><span>Note</span>
                <input type="text" maxLength={TEXTE_MAX} value={l.note} placeholder="À sortir, +1 $ (avril 2027)…"
                  onChange={(e) => modifier(l.id, 'note', e.target.value)} />
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
.ap-grille-4{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:12px}
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
.ap-defilement{overflow-x:auto;margin:14px -4px 0}
.ap-table{width:100%;min-width:1080px;border-collapse:collapse;font-size:.86rem}
.ap-table th,.ap-table td{padding:6px 9px;text-align:left;vertical-align:middle;border-bottom:2px solid #eae5f2;white-space:nowrap}
.ap-table thead th{background:var(--ink);color:#fff;font-family:var(--titre);font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;border-bottom:0}
.ap-table thead th:first-child{border-radius:10px 0 0 0}
.ap-table thead th:last-child{border-radius:0 10px 0 0}
.ap-table tbody th{font-weight:700}
.ap-table .ap-num{text-align:right}
.ap-table tbody tr.ap-ouvert{background:#f6f3ff}
.ap-fort{font-weight:700}
.ap-rien{color:var(--soft)}
.ap-score{display:inline-block;min-width:44px;padding:1px 8px;background:var(--lime);border:2px solid var(--ink);border-radius:99px;text-align:center;font-weight:800;font-size:.78rem}
.ap-score-bas{background:var(--lemon)}
.ap-tag{display:inline-block;padding:1px 8px;background:#ffe1ee;border:2px solid var(--ink);border-radius:99px;font-size:.76rem;font-weight:700}
.ap-table tfoot th,.ap-table tfoot td{border-top:3px solid var(--ink);border-bottom:0;font-weight:800;background:var(--bg)}

.ap-edition td{background:#f6f3ff;white-space:normal}
.ap-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;padding:6px 0 10px}
.ap-large-champ{grid-column:span 2}
.ap-suppression{display:flex;align-items:flex-end;gap:8px;flex-wrap:wrap}

.ap-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.ap-csv{width:100%;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.82rem}
.ap-apercu-csv{margin-top:10px;padding:10px 14px;background:var(--bg);border:2.5px dashed var(--ink);border-radius:12px;font-size:.86rem}
.ap-ignorees{color:var(--rose);font-weight:600}
.ad-invisible{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
@media (max-width:760px){.ap-grille,.ap-grille-4{grid-template-columns:minmax(0,1fr)}.ap-large-champ{grid-column:auto}}
`;
