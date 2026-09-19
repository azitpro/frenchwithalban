/**
 * Roster des élèves : ce que chacun rapporte vraiment, une fois la commission
 * de la plateforme et les cotisations URSSAF déduites.
 *
 * Seuls les faits bruts sont stockés — tarif, plateforme, fréquence, assiduité.
 * Les montants nets sont recalculés à l'affichage, pour qu'un changement de
 * commission, de taux de change ou de cotisations se propage partout.
 *
 * Prénoms et tarifs sont des données personnelles : ce module n'est utilisé que par
 * l'administration, jamais par une page ou une API publique.
 */

export const PLATEFORMES = ['Direct', 'Preply'] as const;
export type Plateforme = (typeof PLATEFORMES)[number];

export const DEVISES = ['EUR', 'USD', 'GBP'] as const;
export type Devise = (typeof DEVISES)[number];

export const SYMBOLE: Record<Devise, string> = { EUR: '€', USD: '$', GBP: '£' };

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
  /** Note sur 100, ou null tant qu'elle n'est pas évaluée. */
  assiduite: number | null;
  /** Gardés pour mémoire, hors du tableau : « juin 2026 », « À sortir ». */
  derniereAugmentation: string;
  note: string;
};

export type Reglages = {
  /** Part prélevée par Preply, entre 0 et 1. */
  commissionPreply: number;
  /** Cotisations URSSAF, entre 0 et 1, appliquées après la commission. */
  cotisationsUrssaf: number;
  /** Un dollar vaut tant d'euros. */
  tauxUSD: number;
  /** Une livre vaut tant d'euros. */
  tauxGBP: number;
  semainesParMois: number;
};

export type Roster = { eleves: EleveRoster[]; reglages: Reglages };

export const REGLAGES_DEFAUT: Reglages = {
  commissionPreply: 0.18,
  cotisationsUrssaf: 0.246,
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

/** Tarif converti en euros, commission de la plateforme déduite. */
export function sansCommission(e: EleveRoster, r: Reglages): number {
  const commission = e.plateforme === 'Preply' ? r.commissionPreply : 0;
  return e.tarif * (1 - commission) * tauxDe(e.devise, r);
}

/** Ce qui reste une fois les cotisations payées. */
export function sansUrssaf(e: EleveRoster, r: Reglages): number {
  return sansCommission(e, r) * (1 - r.cotisationsUrssaf);
}

export type LigneRoster = EleveRoster & {
  sansCommission: number;
  sansUrssaf: number;
  /** Revenu hebdomadaire net de tout, pour les totaux. */
  hebdo: number;
};

export type Totaux = {
  nbEleves: number;
  frequence: number;
  hebdo: number;
  mensuel: number;
  assiduiteMoyenne: number | null;
};

/** Les colonnes sur lesquelles on peut trier. */
export const TRIS = ['nom', 'plateforme', 'tarif', 'sansCommission', 'sansUrssaf', 'frequence', 'assiduite'] as const;
export type Tri = (typeof TRIS)[number];
export type Sens = 'asc' | 'desc';

function comparer(a: LigneRoster, b: LigneRoster, tri: Tri): number {
  switch (tri) {
    case 'nom': return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
    case 'plateforme': return a.plateforme.localeCompare(b.plateforme, 'fr');
    // le tarif brut n'est comparable qu'une fois ramené à une même monnaie
    case 'tarif': return a.sansCommission - b.sansCommission;
    case 'assiduite': {
      // les élèves non évalués restent en bas, quel que soit le sens
      if (a.assiduite === null || b.assiduite === null) return 0;
      return a.assiduite - b.assiduite;
    }
    default: return a[tri] - b[tri];
  }
}

/** Lignes calculées et triées, plus les totaux. */
export function calculer(roster: Roster, tri: Tri = 'sansUrssaf', sens: Sens = 'desc'): { lignes: LigneRoster[]; totaux: Totaux } {
  const { reglages } = roster;

  const lignes: LigneRoster[] = roster.eleves.map((e) => {
    const net = sansUrssaf(e, reglages);
    return { ...e, sansCommission: sansCommission(e, reglages), sansUrssaf: net, hebdo: net * e.frequence };
  });

  const signe = sens === 'asc' ? 1 : -1;
  lignes.sort((a, b) => {
    // un élève sans assiduité n'a pas sa place en tête du classement
    if (tri === 'assiduite') {
      if (a.assiduite === null && b.assiduite !== null) return 1;
      if (b.assiduite === null && a.assiduite !== null) return -1;
    }
    return comparer(a, b, tri) * signe || a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
  });

  const notees = lignes.map((l) => l.assiduite).filter((n): n is number => n !== null);
  const hebdo = lignes.reduce((s, l) => s + l.hebdo, 0);

  return {
    lignes,
    totaux: {
      nbEleves: lignes.length,
      frequence: lignes.reduce((s, l) => s + l.frequence, 0),
      hebdo,
      mensuel: hebdo * reglages.semainesParMois,
      assiduiteMoyenne: notees.length ? notees.reduce((s, n) => s + n, 0) / notees.length : null,
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

const part = (v: unknown, defaut: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1 ? Math.round(n * 10000) / 10000 : defaut;
};

export function validerReglages(brut: unknown): Reglages {
  const r = brut && typeof brut === 'object' ? (brut as Partial<Reglages>) : {};
  return {
    commissionPreply: part(r.commissionPreply, REGLAGES_DEFAUT.commissionPreply),
    cotisationsUrssaf: part(r.cotisationsUrssaf, REGLAGES_DEFAUT.cotisationsUrssaf),
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

type CleColonne = 'nom' | 'plateforme' | 'tarif' | 'frequence' | 'assiduite' | 'augmentation' | 'note';

/** Disposition de secours, quand le fichier n'a pas de ligne d'en-tête. */
const POSITIONS: Record<CleColonne, number> = {
  nom: 0, plateforme: 1, tarif: 2, frequence: 5, assiduite: 11, augmentation: 13, note: 14,
};

/** « Freq./sem » et « Assiduité » deviennent « freqsem » et « assiduite ». */
const normaliser = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Un en-tête par colonne : le premier qui correspond gagne. */
const RECONNAISSANCE: [CleColonne, (t: string) => boolean][] = [
  ['nom', (t) => t.startsWith('nom') || t.startsWith('prenom') || t.startsWith('eleve')],
  ['plateforme', (t) => t.startsWith('plateforme')],
  ['tarif', (t) => t.startsWith('tarif')],
  ['frequence', (t) => t.startsWith('freq')],
  ['assiduite', (t) => t.startsWith('assiduit')],
  ['augmentation', (t) => t.includes('augm')],
  ['note', (t) => t === 'note' || t.startsWith('commentaire') || t.startsWith('remarque')],
];

/**
 * Associe chaque donnée à sa colonne d'après les titres, pour qu'un tableur réorganisé
 * n'envoie pas les valeurs dans le mauvais champ. Renvoie null si la ligne n'est pas un en-tête.
 */
function lireEntete(ligne: string): Record<CleColonne, number> | null {
  const cellules = ligne.split(';').map((c) => normaliser(c));
  const colonnes = {} as Record<CleColonne, number>;
  for (const [cle, correspond] of RECONNAISSANCE) {
    const i = cellules.findIndex((t) => t && correspond(t));
    if (i !== -1) colonnes[cle] = i;
  }
  if (colonnes.nom === undefined) return null; // sans colonne « Nom », ce n'est pas un en-tête

  // la colonne des notes n'a pas toujours de titre : on prend la première colonne sans titre après les autres
  if (colonnes.note === undefined) {
    const dernier = Math.max(...Object.values(colonnes));
    const i = cellules.findIndex((t, j) => j > dernier && !t);
    if (i !== -1) colonnes.note = i;
  }
  return colonnes;
}

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
 * Lit le CSV exporté du tableur : séparateur « ; », décimales à la virgule.
 * Les colonnes inconnues sont ignorées, la ligne TOTAL écartée.
 */
export function lireCsv(texte: string): { ok: true; eleves: EleveRoster[]; ignorees: string[] } | { ok: false; error: string } {
  // un fichier enregistré en UTF-8 commence souvent par une marque d'ordre invisible
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lignes.length) return { ok: false, error: 'Le fichier est vide.' };

  const entete = lireEntete(lignes[0]);
  const colonnes = entete ?? POSITIONS;
  const debut = entete ? 1 : 0;
  if (lignes.length === debut) return { ok: false, error: 'Le fichier ne contient aucune ligne d’élève.' };

  const eleves: EleveRoster[] = [];
  const ignorees: string[] = [];
  for (const ligne of lignes.slice(debut)) {
    const c = ligne.split(';');
    /** Cellule d'une colonne, vide si cette colonne n'existe pas dans le fichier. */
    const cellule = (cle: CleColonne) => (colonnes[cle] === undefined ? '' : c[colonnes[cle]] ?? '');

    const nom = nettoyerNom(cellule('nom'));
    if (!nom) { ignorees.push(ligne.slice(0, 40)); continue; }
    if (nom.toUpperCase() === 'TOTAL') continue;

    const tarif = lireTarif(cellule('tarif'));
    if (!tarif) { ignorees.push(nom + ' — tarif illisible'); continue; }

    const frequence = nombreFr(cellule('frequence'));
    const assiduite = nombreFr(cellule('assiduite'));

    eleves.push({
      id: nouvelId(),
      nom,
      plateforme: cellule('plateforme').trim().toLowerCase() === 'preply' ? 'Preply' : 'Direct',
      tarif: tarif.tarif,
      devise: tarif.devise,
      frequence: frequence && frequence > 0 && frequence <= FREQUENCE_MAX ? frequence : 1,
      assiduite: assiduite === null || assiduite < 0 || assiduite > 100 ? null : assiduite,
      derniereAugmentation: texteCourt(cellule('augmentation'), TEXTE_MAX),
      note: texteCourt(cellule('note'), TEXTE_MAX),
    });
  }

  if (!eleves.length) return { ok: false, error: 'Aucun élève lisible dans ce fichier.' };
  if (eleves.length > ELEVES_MAX) return { ok: false, error: `Trop d'élèves (${ELEVES_MAX} au plus).` };
  return { ok: true, eleves, ignorees };
}
