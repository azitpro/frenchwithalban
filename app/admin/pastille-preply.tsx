'use client';
import { useEffect, useState } from 'react';

/**
 * Pastille du tableau de bord : nombre de créneaux qui reviennent chaque semaine
 * sur Preply sans être déclarés dans le planning. Rien ne s'affiche s'il n'y en a pas.
 */
export function PastillePreply() {
  const [nombre, setNombre] = useState(0);

  useEffect(() => {
    fetch('/api/admin/preply-recurrents', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setNombre(Array.isArray(d?.creneaux) ? d.creneaux.length : 0))
      .catch(() => setNombre(0));
  }, []);

  if (!nombre) return null;
  return (
    <span className="hub-pastille">
      {nombre} créneau{nombre > 1 ? 'x' : ''} à déclarer
    </span>
  );
}
