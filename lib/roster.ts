/**
 * Roster des élèves : tarif, plateforme, fréquence et critères d'évaluation.
 *
 * Seuls les faits bruts sont stockés. Tout le reste — net horaire, revenu
 * hebdomadaire et mensuel, part du net moyen, score — est recalculé à l'affichage,
 * pour qu'un changement de commission ou de taux de change se propage partout.
 *
 * Prénoms et tarifs sont des données personnelles : ce module n'est utilisé que par
 * l'administration, jamais par une page ou une API publique.
 */

export const PLATEFORMES = ['Direct', 'Preply'] as const;
export type Plateforme = (typeof PLATEFORMES)[number];

export const DEVISES = ['EUR', 'USD', 'GBP'] as const;
export type Devise = (typeof DEVISES)[number];

export const SYMBOLE: Record<Devise, string> = { EUR: '€', USD: '$', GBP: '£' };

/** Les quatre critères notés, dans l'ordre d'affichage. */
export const CRITERES = [
  { cle: 'relation', titre: 'Relation' },
  { cle: 'horaire', titre: 'Horaire' },
  { cle: 'prix', titre: 'Prix' },
  { cle: 'assiduite', titre: 'Assiduité' },
] as const;
export type CleCritere = (typeof CRITERES)[number]['cle'];

export const NOM_MAX = 60;
export const TEXTE_MAX = 120;
export const ELEVES_MAX = 300;
export const TARIF_MAX = 1000;
export const FREQUENCE_MAX = 14;

export type EleveRoster = {
  id: string;
  nom: string;
  plateforme: Plateforme;
  tarif: number;
  devise: Devise;
  /** Cours par semaine : 0,5 pour un cours toutes les deux semaines. */
  frequence: number;
  /** Notes sur 100, ou null quand le critère n'est pas encore évalué. */
  relation: number | null;
  horaire: number | null;
  prix: number | null;
  assiduite: number | null;
  derniereAugmentation: string;
  note: string;
};

export type Reglages = {
  /** Part prélevée par Preply, entre 0 et 1. */
  commissionPreply: number;
  /** Un dollar vaut tant d'euros. */
  tauxUSD: number;
  /** Une livre vaut tant d'euros. */
  tauxGBP: number;
  semainesParMois: number;
};

export type Roster = { eleves: EleveRoster[]; reglages: Reglages };

export const REGLAGES_DEFAUT: Reglages = {
  commissionPreply: 0.18,
  tauxUSD: 0.86,
  tauxGBP: 1.167,
  semainesParMois: 4.33,
};

export const EMPTY_ROSTER: Roster = { eleves: [], reglages: REGLAGES_DEFAUT };

export const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- calculs ---------- */

/** Un euro par euro, sinon le taux du réglage. */
export function tauxDe(devise: Devise, r: Reglages): number {
  return devise === 'EUR' ? 1 : devise === 'USD' ? r.tauxUSD : r.tauxGBP;
}

/** Ce qui reste réellement, en euros, pour une heure de cours. */
export function netHoraire(e: EleveRoster, r: Reglages): number {
  const commission = e.plateforme === 'Preply' ? r.commissionPreply : 0;
  return e.tarif * (1 - commission) * tauxDe(e.devise, r);
}

/**
 * Moyenne des quatre critères — et seulement s'ils sont tous renseignés :
 * noter un élève 100 % sur un seul critère le placerait en tête du classement
 * sans rien dire de fiable.
 */
export function score(e: EleveRoster): number | null {
  const notes = CRITERES.map((c) => e[c.cle]);
  return notes.every((n): n is number => n !== null)
    ? notes.reduce((s, n) => s + n, 0) / notes.length
    : null;
}

export type LigneCalculee = EleveRoster & {
  net: number;
  hebdo: number;
  mensuel: number;
  /** Part du net horaire moyen, en pourcentage. */
  partNetMoyen: number;
  score: number | null;
};

export type Totaux = {
  nbEleves: number;
  netMoyen: number;
  frequence: number;
  hebdo: number;
  mensuel: number;
  /** Moyenne de chaque critère sur les élèves qui l'ont renseigné. */
  criteres: Record<CleCritere, number | null>;
  scoreMoyen: number | null;
};

const moyenne = (l: number[]) => (l.length ? l.reduce((s, n) => s + n, 0) / l.length : null);

/** Lignes calculées, triées par score décroissant — les non évalués à la fin. */
export function calculer(roster: Roster): { lignes: LigneCalculee[]; totaux: Totaux } {
  const { reglages } = roster;
  const nets = roster.eleves.map((e) => netHoraire(e, reglages));
  const netMoyen = nets.length ? nets.reduce((s, n) => s + n, 0) / nets.length : 0;

  const lignes: LigneCalculee[] = roster.eleves.map((e, i) => {
    const net = nets[i];
    const hebdo = net * e.frequence;
    return {
      ...e,
      net,
      hebdo,
      mensuel: hebdo * reglages.semainesParMois,
      partNetMoyen: netMoyen > 0 ? (net / netMoyen) * 100 : 0,
      score: score(e),
    };
  });

  lignes.sort((a, b) => {
    if (a.score === null && b.score === null) return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
  });

  const criteres = Object.fromEntries(
    CRITERES.map((c) => [c.cle, moyenne(roster.eleves.map((e) => e[c.cle]).filter((n): n is number => n !== null))]),
  ) as Record<CleCritere, number | null>;

  return {
    lignes,
    totaux: {
      nbEleves: lignes.length,
      netMoyen,
      frequence: lignes.reduce((s, l) => s + l.frequence, 0),
      hebdo: lignes.reduce((s, l) => s + l.hebdo, 0),
      mensuel: lignes.reduce((s, l) => s + l.mensuel, 0),
      criteres,
      scoreMoyen: moyenne(lignes.map((l) => l.score).filter((n): n is number => n !== null)),
    },
  };
}

/* ---------- validation ---------- */

const texteCourt = (v: unknown, max: number): string => {
  if (typeof v !== 'string') return '';
  const t = v.trim().replace(/\s+/g, ' ');
  if (t.length > max || [...t].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return '';
  return t;
};

export function nettoyerNom(v: unknown): string | null {
  const t = texteCourt(v, NOM_MAX);
  return t || null;
}

const noteValide = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
};

const nombrePositif = (v: unknown, max: number, defaut: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n * 1000) / 1000 : defaut;
};

export function validerReglages(brut: unknown): Reglages {
  const r = brut && typeof brut === 'object' ? (brut as Partial<Reglages>) : {};
  const commission = Number(r.commissionPreply);
  return {
    commissionPreply: Number.isFinite(commission) && commission >= 0 && commission < 1 ? Math.round(commission * 10000) / 10000 : REGLAGES_DEFAUT.commissionPreply,
    tauxUSD: nombrePositif(r.tauxUSD, 100, REGLAGES_DEFAUT.tauxUSD),
    tauxGBP: nombrePositif(r.tauxGBP, 100, REGLAGES_DEFAUT.tauxGBP),
    semainesParMois: nombrePositif(r.semainesParMois, 6, REGLAGES_DEFAUT.semainesParMois),
  };
}

export function validerRoster(brut: unknown): { ok: true; value: Roster } | { ok: false; error: string } {
  if (!brut || typeof brut !== 'object') return { ok: false, error: 'Roster manquant.' };
  const source = brut as Partial<Roster>;
  if (!Array.isArray(source.eleves)) return { ok: false, error: "La liste des élèves n'est pas un tableau." };
  if (source.eleves.length > ELEVES_MAX) return { ok: false, error: `Trop d'élèves (${ELEVES_MAX} au plus).` };

  const ids = new Set<string>();
  const eleves: EleveRoster[] = [];
  for (const brute of source.eleves) {
    const e = brute && typeof brute === 'object' ? (brute as Partial<EleveRoster>) : {};
    const nom = nettoyerNom(e.nom);
    if (!nom) return { ok: false, error: `Élève sans prénom valide (${NOM_MAX} caractères au plus).` };
    let id = texteCourt(e.id, 40) || nouvelId();
    while (ids.has(id)) id = nouvelId();
    ids.add(id);
    eleves.push({
      id,
      nom,
      plateforme: PLATEFORMES.includes(e.plateforme as Plateforme) ? (e.plateforme as Plateforme) : 'Direct',
      tarif: nombrePositif(e.tarif, TARIF_MAX, 0),
      devise: DEVISES.includes(e.devise as Devise) ? (e.devise as Devise) : 'EUR',
      frequence: nombrePositif(e.frequence, FREQUENCE_MAX, 1),
      relation: noteValide(e.relation),
      horaire: noteValide(e.horaire),
      prix: noteValide(e.prix),
      assiduite: noteValide(e.assiduite),
      derniereAugmentation: texteCourt(e.derniereAugmentation, TEXTE_MAX),
      note: texteCourt(e.note, TEXTE_MAX),
    });
  }

  return { ok: true, value: { eleves, reglages: validerReglages(source.reglages) } };
}

/* ---------- import CSV ---------- */

/** « 1 234,56 » et « 91 % » deviennent 1234.56 et 91. */
function nombreFr(v: string): number | null {
  const t = v.replace(/\s| /g, '').replace('%', '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * « 27 $ », « 17 € », « 20 £ » → montant et devise.
 * Tout ce qui n'est pas un chiffre est retiré avant lecture : un symbole monétaire
 * abîmé par un mauvais encodage n'empêche pas de lire le montant, et l'euro reste
 * la devise par défaut.
 */
function lireTarif(v: string): { tarif: number; devise: Devise } | null {
  const t = v.trim();
  const devise: Devise = t.includes('$') ? 'USD' : t.includes('£') ? 'GBP' : 'EUR';
  const montant = nombreFr(t.replace(/[^\d,.-]/g, ''));
  if (montant === null || montant <= 0) return null;
  return { tarif: montant, devise };
}

const ENTETES: Record<string, number> = {
  nom: 0, plateforme: 1, tarif: 2, frequence: 5, relation: 8, horaire: 9, prix: 10, assiduite: 11, augmentation: 13, note: 14,
};

/**
 * Texte d'un fichier CSV, quel que soit son encodage.
 *
 * Un tableur français enregistre indifféremment en UTF-8 ou en Windows-1252.
 * On tente l'UTF-8 ; s'il en sort des caractères de remplacement, c'est que le
 * fichier était en Windows-1252, et on relit avec cet encodage.
 */
export function decoderCsv(octets: ArrayBuffer | Uint8Array): string {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  const utf8 = new TextDecoder('utf-8').decode(vue);
  if (!utf8.includes('�')) return utf8;
  try {
    return new TextDecoder('windows-1252').decode(vue);
  } catch {
    return utf8;
  }
}

/**
 * Lit le CSV exporté du tableur : séparateur « ; », décimales à la virgule,
 * colonnes calculées ignorées puisqu'elles sont recalculées, ligne TOTAL écartée.
 */
export function lireCsv(texte: string): { ok: true; eleves: EleveRoster[]; ignorees: string[] } | { ok: false; error: string } {
  // un fichier enregistré en UTF-8 commence souvent par une marque d'ordre invisible
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lignes.length) return { ok: false, error: 'Le fichier est vide.' };

  const premiere = lignes[0].toLowerCase().trimStart();
  const debut = premiere.startsWith('nom;') || premiere.startsWith('nom ;') ? 1 : 0;
  if (lignes.length === debut) return { ok: false, error: 'Le fichier ne contient aucune ligne d’élève.' };

  const eleves: EleveRoster[] = [];
  const ignorees: string[] = [];
  for (const ligne of lignes.slice(debut)) {
    const c = ligne.split(';');
    const nom = nettoyerNom(c[ENTETES.nom]);
    if (!nom) { ignorees.push(ligne.slice(0, 40)); continue; }
    if (nom.toUpperCase() === 'TOTAL') continue;

    const tarif = lireTarif(c[ENTETES.tarif] ?? '');
    if (!tarif) { ignorees.push(nom + ' — tarif illisible'); continue; }

    const frequence = nombreFr(c[ENTETES.frequence] ?? '');
    const note = (i: number) => {
      const n = nombreFr(c[i] ?? '');
      return n === null || n < 0 || n > 100 ? null : n;
    };

    eleves.push({
      id: nouvelId(),
      nom,
      plateforme: (c[ENTETES.plateforme] ?? '').trim().toLowerCase() === 'preply' ? 'Preply' : 'Direct',
      tarif: tarif.tarif,
      devise: tarif.devise,
      frequence: frequence && frequence > 0 && frequence <= FREQUENCE_MAX ? frequence : 1,
      relation: note(ENTETES.relation),
      horaire: note(ENTETES.horaire),
      prix: note(ENTETES.prix),
      assiduite: note(ENTETES.assiduite),
      derniereAugmentation: texteCourt(c[ENTETES.augmentation], TEXTE_MAX),
      note: texteCourt(c[ENTETES.note], TEXTE_MAX),
    });
  }

  if (!eleves.length) return { ok: false, error: 'Aucun élève lisible dans ce fichier.' };
  if (eleves.length > ELEVES_MAX) return { ok: false, error: `Trop d'élèves (${ELEVES_MAX} au plus).` };
  return { ok: true, eleves, ignorees };
}
