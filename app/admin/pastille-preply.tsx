'use client';
import { useEffect, useState } from 'react';

/**
 * Pastilles du tableau de bord : les deux écarts entre l'agenda Preply et le planning.
 * Rien ne s'affiche s'il n'y a rien à signaler.
 */
export function PastillePreply() {
  const [aDeclarer, setADeclarer] = useState(0);
  const [aLiberer, setALiberer] = useState(0);

  useEffect(() => {
    fetch('/api/admin/preply', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setADeclarer(Array.isArray(d?.creneaux) ? d.creneaux.length : 0);
        setALiberer(Array.isArray(d?.absences) ? d.absences.length : 0);
      })
      .catch(() => { setADeclarer(0); setALiberer(0); });
  }, []);

  return (
    <>
      {aDeclarer > 0 && (
        <span className="hub-pastille">
          {aDeclarer} créneau{aDeclarer > 1 ? 'x' : ''} à déclarer
        </span>
      )}
      {aLiberer > 0 && (
        <span className="hub-pastille">
          {aLiberer} créneau{aLiberer > 1 ? 'x' : ''} à libérer
        </span>
      )}
    </>
  );
}
