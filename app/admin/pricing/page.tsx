'use client';

import { useEffect, useState } from 'react';

export default function AdminPricing() {
  const [password, setPassword] = useState('');
  const [realPrice, setRealPrice] = useState('');
  const [discountPrice, setDiscountPrice] = useState('');
  const [currency, setCurrency] = useState('$');
  const [duration, setDuration] = useState('50 min');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/pricing')
      .then((r) => r.json())
      .then((p) => {
        setRealPrice(String(p.realPrice));
        setDiscountPrice(String(p.discountPrice));
        setCurrency(p.currency || '$');
        setDuration(p.duration || '50 min');
      })
      .catch(() => setMessage('Impossible de charger les tarifs.'));
  }, []);

  const real = Number(realPrice);
  const disc = Number(discountPrice);
  const pct =
    Number.isFinite(real) && Number.isFinite(disc) && real > 0 && disc < real
      ? Math.ceil(((real - disc) / real) * 100)
      : 0;

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, realPrice: real, discountPrice: disc, currency, duration }),
      });
      const data = await res.json();
      setMessage(res.ok ? 'Tarifs enregistrés.' : data.error || "Erreur d'enregistrement.");
    } catch {
      setMessage("Erreur d'enregistrement.");
    }
    setSaving(false);
  }

  return (
    <>
      <style precedence="default" href="admin-pricing-styles">{`
        .ap-wrap { max-width: 560px; margin: 0 auto; padding: 48px 20px 80px; font-family: 'Inter', sans-serif; color: #0d2b45; }
        .ap-wrap h1 { font-family: 'DM Serif Display', serif; font-size: 2rem; font-weight: 400; margin-bottom: 6px; }
        .ap-sub { font-size: 0.88rem; color: #666; margin-bottom: 28px; }
        .ap-card { background: #f0ece4; border: 1px solid #ddd8ce; border-top: 3px solid #0d2b45; padding: 28px; }
        .ap-field { margin-bottom: 18px; }
        .ap-field label { display: block; font-size: 0.82rem; font-weight: 600; color: #0d2b45; margin-bottom: 6px; }
        .ap-field input { width: 100%; padding: 11px 14px; border: 1.5px solid #ddd8ce; background: #faf7f2; font-family: 'Inter', sans-serif; font-size: 0.95rem; color: #0d2b45; outline: none; }
        .ap-field input:focus { border-color: #0d2b45; }
        .ap-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .ap-preview { background: #faf7f2; border: 1px dashed #ddd8ce; padding: 18px; text-align: center; margin: 22px 0; }
        .ap-preview .old { font-size: 1.1rem; color: #666; text-decoration: line-through; margin-right: 10px; }
        .ap-preview .new { font-family: 'DM Serif Display', serif; font-size: 1.9rem; color: #0d2b45; }
        .ap-preview .off { display: inline-block; margin-left: 10px; background: #c0392b; color: #faf7f2; font-size: 0.78rem; font-weight: 700; padding: 3px 9px; letter-spacing: 0.04em; }
        .ap-preview .note { font-size: 0.78rem; color: #666; margin-top: 6px; }
        .ap-btn { width: 100%; padding: 13px; background: #0d2b45; color: #faf7f2; border: none; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 0.92rem; cursor: pointer; box-shadow: 3px 3px 0 #c0392b; }
        .ap-btn:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
        .ap-msg { margin-top: 14px; font-size: 0.88rem; text-align: center; font-weight: 600; }
        .ap-back { display: inline-block; margin-bottom: 20px; font-size: 0.82rem; color: #0d2b45; text-decoration: none; opacity: 0.65; }
      `}</style>

      <div className="ap-wrap">
        <a href="/admin" className="ap-back">← Retour à l'admin</a>
        <h1>Tarifs</h1>
        <div className="ap-sub">
          Le prix réel est affiché barré sur la page de réservation, le prix remisé à côté, avec la
          remise calculée automatiquement.
        </div>

        <div className="ap-card">
          <div className="ap-row">
            <div className="ap-field">
              <label htmlFor="real">Prix réel (barré)</label>
              <input id="real" type="number" step="1" value={realPrice}
                     onChange={(e) => setRealPrice(e.target.value)} />
            </div>
            <div className="ap-field">
              <label htmlFor="disc">Prix remisé (affiché)</label>
              <input id="disc" type="number" step="1" value={discountPrice}
                     onChange={(e) => setDiscountPrice(e.target.value)} />
            </div>
          </div>

          <div className="ap-row">
            <div className="ap-field">
              <label htmlFor="cur">Devise</label>
              <input id="cur" type="text" value={currency}
                     onChange={(e) => setCurrency(e.target.value)} />
            </div>
            <div className="ap-field">
              <label htmlFor="dur">Durée</label>
              <input id="dur" type="text" value={duration}
                     onChange={(e) => setDuration(e.target.value)} />
            </div>
          </div>

          <div className="ap-preview">
            <span className="old">{currency}{realPrice}</span>
            <span className="new">{currency}{discountPrice}</span>
            {pct > 0 && <span className="off">−{pct}%</span>}
            <div className="note">/ {duration} · Offre du moment</div>
          </div>

          <div className="ap-field">
            <label htmlFor="pwd">Mot de passe admin</label>
            <input id="pwd" type="password" value={password}
                   onChange={(e) => setPassword(e.target.value)} />
          </div>

          <button className="ap-btn" onClick={save} disabled={saving || !password}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>

          {message && (
            <div className="ap-msg" style={{ color: message === 'Tarifs enregistrés.' ? '#2e7d4f' : '#c0392b' }}>
              {message}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
