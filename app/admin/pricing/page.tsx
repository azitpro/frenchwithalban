'use client';

import { useEffect, useState } from 'react';
import { AdminShell } from '../admin-ui';

export default function AdminPricing() {
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
    <AdminShell titre="Tarifs" largeur="etroite"
      intro="Le prix réel est affiché barré sur la page de réservation, le prix remisé à côté, avec la remise calculée automatiquement.">
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
    </AdminShell>
  );
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
@media (max-width:480px){.ap-grille{grid-template-columns:minmax(0,1fr)}}
`;
