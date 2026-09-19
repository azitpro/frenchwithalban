'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '../admin-ui';
import { construireRoster } from '@/lib/roster';
import { withDefaults } from '@/lib/schedule';
import { EMPTY_ELEVES } from '@/lib/eleves';
import type { Roster } from '@/lib/roster';

// Les prénoms et les niveaux des élèves sont des données personnelles : ils n'apparaissent
// jamais dans le code (servi publiquement) et arrivent uniquement par les API d'administration.

export default function AdminPricing() {
  const [realPrice, setRealPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [currency, setCurrency] = useState('$');
  const [duration, setDuration] = useState('50 min');
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [rosterErreur, setRosterErreur] = useState('');

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

  // le roster est reconstruit à l'affichage : rien n'est stocké en propre
  useEffect(() => {
    const lire = async (url: string) => {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(url);
      return res.json();
    };
    Promise.all([lire('/api/admin/schedule'), lire('/api/admin/eleves')])
      .then(([planning, fiches]) => {
        const aujourdHui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
        setRoster(construireRoster(withDefaults(planning), fiches?.eleves ?? EMPTY_ELEVES, aujourdHui));
      })
      .catch(() => setRosterErreur('Impossible de charger la liste des élèves.'));
  }, []);

  const real = Number(realPrice);
  const disc = Number(discountPrice);
  const pct = Number.isFinite(real) && Number.isFinite(disc) && real > 0 && disc < real ? Math.ceil(((real - disc) / real) * 100) : 0;

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

  return (
    <AdminShell titre="Tarifs" largeur="normale"
      intro="Le prix réel est affiché barré sur la page de réservation, le prix remisé à côté, avec la remise calculée automatiquement. En dessous, le récapitulatif de vos élèves.">
      <style href="admin-pricing" precedence="default">{CSS}</style>
      <div className="ad-carte">
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
            {pct > 0 && <span className="ap-remise">−{pct} %</span>}
          </div>
          <div className="ap-note">/ {duration} · Offre du moment</div>
        </div>

        {message && <p className={`ad-message ${message.ok ? 'ad-ok' : 'ad-erreur'}`} role="status">{message.texte}</p>}
        <button className="ad-btn ad-plein ap-enregistrer" onClick={save} disabled={saving || !loaded}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      <section className="ad-carte ap-roster" aria-labelledby="ap-roster-titre">
        <h2 className="ad-h2" id="ap-roster-titre">Mes élèves</h2>
        <p className="ad-aide">
          Récapitulatif construit à partir du planning et des fiches élèves : il se met à jour tout seul.
          Le tarif affiché est le tarif remisé ci-dessus, appliqué à tout le monde.
        </p>

        {rosterErreur && <p className="ad-message ad-erreur">{rosterErreur}</p>}
        {!roster && !rosterErreur && <p className="ad-vide">Chargement des élèves…</p>}

        {roster && roster.lignes.length === 0 && (
          <p className="ad-vide">Aucun élève : ajoutez-en dans le planning ou dans les fiches élèves.</p>
        )}

        {roster && roster.lignes.length > 0 && (
          <>
            <div className="ap-defilement">
              <table className="ap-table">
                <thead>
                  <tr>
                    <th scope="col">Élève</th>
                    <th scope="col">Niveau</th>
                    <th scope="col">Créneaux hebdomadaires</th>
                    <th scope="col">Durée</th>
                    <th scope="col">Tarif</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.lignes.map((l) => {
                    const enCours = l.creneaux.some((c) => c.active) || l.ponctuels > 0;
                    const durees = [...new Set(l.creneaux.map((c) => c.duration))].sort((a, b) => a - b);
                    return (
                      <tr key={l.prenom} className={enCours ? '' : 'ap-inactif'}>
                        <th scope="row">{l.prenom}</th>
                        <td>{l.niveau ? <span className="ap-niveau">{l.niveau}</span> : <span className="ap-rien">—</span>}</td>
                        <td>
                          {l.creneaux.length === 0
                            ? <span className="ap-rien">aucun</span>
                            : l.creneaux.map((c) => (
                                <span key={`${c.weekday}-${c.hour}`} className={`ap-creneau${c.active ? '' : ' ap-suspendu'}`}>
                                  {c.weekday} {fmtHeure(c.hour)}{c.active ? '' : ' · suspendu'}
                                </span>
                              ))}
                          {l.ponctuels > 0 && <span className="ap-ponctuel">+ {l.ponctuels} ponctuel{l.ponctuels > 1 ? 's' : ''}</span>}
                        </td>
                        <td>{durees.length ? durees.map((d) => `${d} min`).join(' · ') : <span className="ap-rien">—</span>}</td>
                        <td>{enCours ? `${currency}${discountPrice}` : <span className="ap-rien">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="ap-bilan">
              <strong>{roster.nbActifs}</strong> élève{roster.nbActifs > 1 ? 's' : ''} en cours ·{' '}
              <strong>{roster.nbCoursHebdo}</strong> cours par semaine
              {roster.dureeUnique
                ? <> · <strong>{currency}{disc * roster.nbCoursHebdo}</strong> par semaine au tarif affiché</>
                : roster.nbCoursHebdo > 0 && <> · total non calculé : deux durées de cours coexistent</>}
            </p>
          </>
        )}
      </section>
    </AdminShell>
  );
}

/** « 17 » et « 17.5 » deviennent « 17h00 » et « 17h30 ». */
function fmtHeure(h: number) {
  return `${Math.floor(h)}h${h % 1 === 0.5 ? '30' : '00'}`;
}

const CSS = `
.ap-grille{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ap-apercu{margin:20px 0;padding:16px;text-align:center;background:var(--bg);border:2.5px dashed var(--ink);border-radius:16px}
.ap-apercu .ad-label{display:block;margin-bottom:4px}
.ap-ancien{font-size:1.15rem;color:var(--soft);text-decoration:line-through;margin-right:10px}
.ap-nouveau{font-family:var(--titre);font-weight:800;font-size:2.2rem;letter-spacing:-.02em}
.ap-remise{display:inline-block;margin-left:10px;padding:2px 10px;background:var(--pink);color:#fff;border:2px solid var(--ink);border-radius:99px;font-size:.8rem;font-weight:800;vertical-align:.5em;rotate:-4deg}
.ap-note{font-size:.8rem;color:var(--soft);margin-top:2px}
.ap-enregistrer{width:100%;padding:11px}
.ap-roster{margin-top:22px}
.ap-defilement{overflow-x:auto;margin:0 -4px}
.ap-table{width:100%;min-width:560px;border-collapse:collapse;font-size:.92rem}
.ap-table th,.ap-table td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:2px solid #eae5f2}
.ap-table thead th{background:var(--ink);color:#fff;font-family:var(--titre);font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;border-bottom:0}
.ap-table thead th:first-child{border-radius:10px 0 0 0}
.ap-table thead th:last-child{border-radius:0 10px 0 0}
.ap-table tbody th{font-weight:700}
.ap-table tbody tr:last-child th,.ap-table tbody tr:last-child td{border-bottom:0}
.ap-inactif{color:var(--soft)}
.ap-niveau{display:inline-block;padding:1px 9px;background:var(--lime);border:2px solid var(--ink);border-radius:99px;font-size:.78rem;font-weight:800}
.ap-creneau{display:block;white-space:nowrap}
.ap-suspendu{color:var(--soft);font-style:italic}
.ap-ponctuel{display:block;margin-top:2px;font-size:.8rem;color:var(--soft)}
.ap-rien{color:var(--soft)}
.ap-bilan{margin:14px 0 0;padding:10px 14px;background:var(--bg);border:2.5px dashed var(--ink);border-radius:12px;font-size:.9rem}
.ap-bilan strong{font-family:var(--titre);font-size:1.05rem}
@media (max-width:480px){.ap-grille{grid-template-columns:minmax(0,1fr)}}
`;
