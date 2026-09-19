/**
 * Roster des élèves : récapitulatif en lecture seule, reconstruit à chaque affichage
 * à partir du planning et des fiches. Rien n'est stocké en propre.
 *
 * Prénoms et niveaux sont des données personnelles : ce module n'est utilisé que par
 * l'administration, jamais par une page ou une API publique.
 */

import { JOURS } from './preply-recurrents'; // ordre des jours de la semaine
import type { Schedule } from './schedule';
import type { Eleves, NiveauEleve } from './eleves';

export type CreneauRoster = { weekday: string; hour: number; duration: 25 | 50; active: boolean };

export type LigneRoster = {
  prenom: string;
  niveau: NiveauEleve;
  creneaux: CreneauRoster[];
  /** Cours ponctuels à venir, aujourd'hui compris. */
  ponctuels: number;
};

export type Roster = {
  lignes: LigneRoster[];
  /** Élèves ayant au moins un créneau hebdomadaire actif ou un cours ponctuel à venir. */
  nbActifs: number;
  /** Créneaux hebdomadaires actifs, toutes durées confondues. */
  nbCoursHebdo: number;
  /** Durée commune à tous les créneaux actifs, ou null si plusieurs durées coexistent. */
  dureeUnique: 25 | 50 | null;
};

const rang = (weekday: string) => {
  const i = JOURS.indexOf(weekday as (typeof JOURS)[number]);
  return i === -1 ? JOURS.length : i;
};

const clef = (prenom: string) => prenom.trim().toLocaleLowerCase('fr');

export function construireRoster(schedule: Schedule, eleves: Eleves, aujourdHui: string): Roster {
  // niveau connu par prénom, la casse ne doit pas empêcher le rapprochement
  const niveaux = new Map<string, NiveauEleve>();
  for (const f of eleves.fiches) niveaux.set(clef(f.prenom), f.niveau);

  // tous les prénoms connus, quelle que soit leur origine
  const prenoms = new Map<string, string>();
  const retenir = (p: unknown) => {
    if (typeof p !== 'string' || !p.trim()) return;
    const k = clef(p);
    if (!prenoms.has(k)) prenoms.set(k, p.trim());
  };
  schedule.students.forEach(retenir);
  schedule.recurring.forEach((r) => retenir(r.student));
  schedule.oneOff.forEach((o) => retenir(o.student));
  eleves.fiches.forEach((f) => retenir(f.prenom));

  const lignes: LigneRoster[] = [...prenoms.entries()]
    .map(([k, prenom]) => ({
      prenom,
      niveau: niveaux.get(k) ?? ('' as NiveauEleve),
      creneaux: schedule.recurring
        .filter((r) => clef(r.student) === k)
        .map(({ weekday, hour, duration, active }) => ({ weekday, hour, duration, active }))
        .sort((a, b) => rang(a.weekday) - rang(b.weekday) || a.hour - b.hour),
      ponctuels: schedule.oneOff.filter((o) => clef(o.student) === k && o.date >= aujourdHui).length,
    }))
    .sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr', { sensitivity: 'base' }));

  const actifs = schedule.recurring.filter((r) => r.active);
  const durees = new Set(actifs.map((r) => r.duration));

  return {
    lignes,
    nbActifs: lignes.filter((l) => l.creneaux.some((c) => c.active) || l.ponctuels > 0).length,
    nbCoursHebdo: actifs.length,
    dureeUnique: durees.size === 1 ? [...durees][0] : null,
  };
}
