/**
 * Fiches de suivi des élèves (administration) : niveau, puis des listes à puces
 * (points forts, points faibles, grammaire et vocabulaire à retenir, devoirs, prochain cours, long terme).
 *
 * Chaque fiche peut être copiée et importée sous forme de texte (format ci-dessous) : c'est ainsi
 * qu'une fiche mise à jour ailleurs (par exemple par une IA à partir de notes de cours) est recollée.
 *
 *   # Prénom
 *   Niveau : B1+
 *
 *   ## Points forts
 *   - …
 *   ## Devoirs pour le prochain cours
 *   - …
 *
 * Données personnelles : aucune route publique ne les lit. Aucun import propre au serveur ici.
 */

export const NIVEAUX_ELEVE = ['A0', 'A1', 'A1+', 'A2-', 'A2', 'A2+', 'B1-', 'B1', 'B1+', 'B2-', 'B2', 'B2+', 'C1-', 'C1', 'C1+', 'C2'] as const;
export type NiveauEleve = (typeof NIVEAUX_ELEVE)[number] | '';

export const RUBRIQUES = [
  { cle: 'pointsForts', titre: 'Points forts' },
  { cle: 'pointsFaibles', titre: 'Points faibles' },
  { cle: 'grammaire', titre: 'Grammaire à retenir' },
  { cle: 'vocabulaire', titre: 'Vocabulaire à retenir' },
  { cle: 'devoirs', titre: 'Devoirs pour le prochain cours' },
  { cle: 'prochainCours', titre: 'Au prochain cours' },
  { cle: 'longTerme', titre: 'À travailler sur le long terme' },
] as const;
export type CleRubrique = (typeof RUBRIQUES)[number]['cle'];

/** Affiché (et copié) quand aucun devoir n'est noté. */
export const DEVOIRS_PAR_DEFAUT = 'Réviser les notions de grammaire et le vocabulaire';

export type Puce = { id: string; texte: string };
export type Fiche = {
  id: string;
  prenom: string;
  niveau: NiveauEleve;
  rubriques: Record<CleRubrique, Puce[]>;
  creeLe: string;
  majLe: string;
};
export type Eleves = { fiches: Fiche[] };

export const EMPTY_ELEVES: Eleves = { fiches: [] };

export const PRENOM_MAX = 60;
export const PUCE_MAX = 500;
export const PUCES_MAX = 100;
export const FICHES_MAX = 300;

const rubriquesVides = (): Record<CleRubrique, Puce[]> =>
  Object.fromEntries(RUBRIQUES.map((r) => [r.cle, []])) as unknown as Record<CleRubrique, Puce[]>;

export const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ======================= validation ======================= */

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const ISO = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const aDesControles = (s: string) => [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

/** Texte d'une puce : une ligne, espaces resserrés, sans caractère de contrôle ; null s'il est invalide. */
export function nettoyerPuce(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t || t.length > PUCE_MAX || aDesControles(t)) return null;
  return t;
}

export function nettoyerPrenom(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t || t.length > PRENOM_MAX || aDesControles(t)) return null;
  return t;
}

export function validerEleves(v: unknown): { ok: true; eleves: Eleves } | { ok: false; error: string } {
  try {
    const liste = (v as { fiches?: unknown } | null)?.fiches;
    if (!Array.isArray(liste)) throw new Error('Liste des fiches manquante.');
    if (liste.length > FICHES_MAX) throw new Error(`${FICHES_MAX} fiches au plus.`);
    const ids = new Set<string>();
    const prenoms = new Set<string>();
    const fiches = liste.map((brut): Fiche => {
      const f = brut as Record<string, unknown>;
      if (typeof f?.id !== 'string' || !ID.test(f.id) || ids.has(f.id)) throw new Error('Identifiant de fiche invalide.');
      ids.add(f.id);
      const prenom = nettoyerPrenom(f.prenom);
      if (!prenom) throw new Error('Prénom invalide.');
      if (prenoms.has(prenom.toLocaleLowerCase('fr'))) throw new Error(`Deux fiches portent le prénom « ${prenom} ».`);
      prenoms.add(prenom.toLocaleLowerCase('fr'));
      if (f.niveau !== '' && !NIVEAUX_ELEVE.includes(f.niveau as never)) throw new Error(`Niveau invalide pour ${prenom}.`);
      const brutes = (f.rubriques ?? {}) as Record<string, unknown>;
      const rubriques = rubriquesVides();
      for (const { cle, titre } of RUBRIQUES) {
        const puces = brutes[cle] ?? [];
        if (!Array.isArray(puces) || puces.length > PUCES_MAX) throw new Error(`${titre} (${prenom}) : ${PUCES_MAX} points au plus.`);
        const idsPuces = new Set<string>();
        rubriques[cle] = puces.map((b): Puce => {
          const p = b as Record<string, unknown>;
          if (typeof p?.id !== 'string' || !ID.test(p.id) || idsPuces.has(p.id)) throw new Error('Identifiant de point invalide.');
          idsPuces.add(p.id);
          const texte = nettoyerPuce(p.texte);
          if (!texte) throw new Error(`${titre} (${prenom}) : point vide ou trop long (${PUCE_MAX} caractères au plus).`);
          return { id: p.id, texte };
        });
      }
      if (!ISO(f.creeLe) || !ISO(f.majLe)) throw new Error('Dates de fiche invalides.');
      return { id: f.id, prenom, niveau: f.niveau as NiveauEleve, rubriques, creeLe: f.creeLe, majLe: f.majLe };
    });
    return { ok: true, eleves: { fiches } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Données invalides.' };
  }
}

/* ======================= modifications ======================= */

const toucher = (f: Fiche, maintenant: Date): Fiche => ({ ...f, majLe: maintenant.toISOString() });

function modifierFiche(e: Eleves, id: string, changer: (f: Fiche) => Fiche, maintenant: Date): Eleves {
  return { fiches: e.fiches.map((f) => (f.id === id ? toucher(changer(f), maintenant) : f)) };
}

export function prenomPris(e: Eleves, prenom: string, sauf?: string): boolean {
  const cle = prenom.toLocaleLowerCase('fr');
  return e.fiches.some((f) => f.id !== sauf && f.prenom.toLocaleLowerCase('fr') === cle);
}

export function ajouterFiche(e: Eleves, prenom: string, maintenant = new Date()): { eleves: Eleves; id: string } {
  const id = nouvelId();
  const iso = maintenant.toISOString();
  const fiche: Fiche = { id, prenom: prenom.trim(), niveau: '', rubriques: rubriquesVides(), creeLe: iso, majLe: iso };
  return { eleves: { fiches: [...e.fiches, fiche] }, id };
}

export const supprimerFiche = (e: Eleves, id: string): Eleves => ({ fiches: e.fiches.filter((f) => f.id !== id) });

export const renommer = (e: Eleves, id: string, prenom: string, maintenant = new Date()) =>
  modifierFiche(e, id, (f) => ({ ...f, prenom }), maintenant);

export const changerNiveau = (e: Eleves, id: string, niveau: NiveauEleve, maintenant = new Date()) =>
  modifierFiche(e, id, (f) => ({ ...f, niveau }), maintenant);

export function ajouterPuces(e: Eleves, id: string, cle: CleRubrique, textes: string[], maintenant = new Date()): Eleves {
  return modifierFiche(e, id, (f) => ({
    ...f,
    rubriques: { ...f.rubriques, [cle]: [...f.rubriques[cle], ...textes.map((texte) => ({ id: nouvelId() + Math.random().toString(36).slice(2, 5), texte }))] },
  }), maintenant);
}

export function modifierPuce(e: Eleves, id: string, cle: CleRubrique, puceId: string, texte: string, maintenant = new Date()): Eleves {
  return modifierFiche(e, id, (f) => ({ ...f, rubriques: { ...f.rubriques, [cle]: f.rubriques[cle].map((p) => (p.id === puceId ? { ...p, texte } : p)) } }), maintenant);
}

export function supprimerPuce(e: Eleves, id: string, cle: CleRubrique, puceId: string, maintenant = new Date()): Eleves {
  return modifierFiche(e, id, (f) => ({ ...f, rubriques: { ...f.rubriques, [cle]: f.rubriques[cle].filter((p) => p.id !== puceId) } }), maintenant);
}

export function deplacerPuce(e: Eleves, id: string, cle: CleRubrique, puceId: string, sens: -1 | 1, maintenant = new Date()): Eleves {
  const fiche = e.fiches.find((f) => f.id === id);
  const i = fiche?.rubriques[cle].findIndex((p) => p.id === puceId) ?? -1;
  const j = i + sens;
  if (!fiche || i < 0 || j < 0 || j >= fiche.rubriques[cle].length) return e;
  return modifierFiche(e, id, (f) => {
    const liste = [...f.rubriques[cle]];
    [liste[i], liste[j]] = [liste[j], liste[i]];
    return { ...f, rubriques: { ...f.rubriques, [cle]: liste } };
  }, maintenant);
}

/** Remplace les rubriques présentes dans l'import (et le niveau s'il est indiqué). */
export function appliquerImport(e: Eleves, id: string, imp: ImportFiche, maintenant = new Date()): Eleves {
  return modifierFiche(e, id, (f) => {
    const rubriques = { ...f.rubriques };
    for (const cle of Object.keys(imp.rubriques) as CleRubrique[]) {
      rubriques[cle] = imp.rubriques[cle]!.map((texte, k) => ({ id: nouvelId() + k.toString(36), texte }));
    }
    return { ...f, niveau: imp.niveau ?? f.niveau, rubriques };
  }, maintenant);
}

/* ======================= texte : copie et import ======================= */

export function ficheEnTexte(f: Fiche): string {
  const lignes = [`# ${f.prenom}`, `Niveau : ${f.niveau || 'non renseigné'}`];
  for (const { cle, titre } of RUBRIQUES) {
    lignes.push('', `## ${titre}`);
    const puces = f.rubriques[cle];
    if (puces.length) puces.forEach((p) => lignes.push(`- ${p.texte}`));
    else if (cle === 'devoirs') lignes.push(`(par défaut : ${DEVOIRS_PAR_DEFAUT})`);
  }
  return lignes.join('\n') + '\n';
}

export type ImportFiche = {
  prenom: string | null;
  niveau: NiveauEleve | null; // null : non indiqué, le niveau actuel est gardé
  rubriques: Partial<Record<CleRubrique, string[]>>;
  avertissements: string[];
};

const simplifier = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+ -]/g, ' ').replace(/\s+/g, ' ').trim();

/** Titre de rubrique reconnu, avec quelques variantes (l'ordre des tests compte). */
export function rubriqueDuTitre(titre: string): CleRubrique | null {
  const t = simplifier(titre);
  if (/devoir/.test(t)) return 'devoirs';
  if (/fort|force|reussi|acquis/.test(t)) return 'pointsForts';
  if (/faible|faiblesse|difficult|ameliorer/.test(t)) return 'pointsFaibles';
  if (/long terme/.test(t)) return 'longTerme';
  if (/prochain|prochaine seance|a venir|a etudier/.test(t)) return 'prochainCours';
  if (/grammaire|conjugaison/.test(t)) return 'grammaire';
  if (/vocabulaire|lexique|expression/.test(t)) return 'vocabulaire';
  return null;
}

/**
 * Lit une fiche en texte. Titres : « ## Titre » (ou « Titre : » seul sur sa ligne) ; points : « - », « * », « • » ou « 1. ».
 * Les lignes hors puces sont ignorées. Une rubrique absente du texte n'est pas modifiée ; une rubrique présente sans
 * aucun point est vidée.
 */
export function lireTexte(texte: string): { ok: true; import: ImportFiche } | { ok: false; error: string } {
  const imp: ImportFiche = { prenom: null, niveau: null, rubriques: {}, avertissements: [] };
  let courante: CleRubrique | null = null;
  let ignoree = false;
  for (const brute of texte.replace(/\r\n?/g, '\n').split('\n')) {
    const ligne = brute.trim();
    if (!ligne) continue;
    const titre1 = /^#\s+(.+)$/.exec(ligne);
    if (titre1) { imp.prenom = nettoyerPrenom(titre1[1].replace(/^fiche\s*(de|d')?\s*/i, '')); courante = null; continue; }
    const niveau = /^\**niveau\**\s*:\s*\**(.*?)\**$/i.exec(ligne);
    if (niveau && !courante) {
      const v = niveau[1].trim().toUpperCase().replace(/\s+/g, '').replace('−', '-');
      if (!v || /^NON/.test(v)) imp.niveau = '';
      else if (NIVEAUX_ELEVE.includes(v as never)) imp.niveau = v as NiveauEleve;
      else imp.avertissements.push(`Niveau « ${niveau[1].trim()} » non reconnu : le niveau actuel est gardé.`);
      continue;
    }
    const titre = /^#{2,6}\s+(.+?)\s*:?\s*$/.exec(ligne) ?? (!/^([-*•]|\d+[.)])\s/.test(ligne) ? /^\**([^:]{3,60}?)\**\s*:\s*$/.exec(ligne) : null);
    if (titre) {
      courante = rubriqueDuTitre(titre[1]);
      ignoree = !courante;
      if (courante) imp.rubriques[courante] = imp.rubriques[courante] ?? [];
      else imp.avertissements.push(`Rubrique « ${titre[1]} » non reconnue : ignorée.`);
      continue;
    }
    const puce = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(ligne);
    if (puce && courante) {
      const t = nettoyerPuce(puce[1].replace(/^\[[ xX]\]\s*/, ''));
      if (!t) { imp.avertissements.push(`Point trop long ignoré (${PUCE_MAX} caractères au plus).`); continue; }
      if (courante === 'devoirs' && simplifier(t) === simplifier(DEVOIRS_PAR_DEFAUT)) continue; // la valeur par défaut n'est pas enregistrée
      const liste = imp.rubriques[courante]!;
      if (liste.length < PUCES_MAX) liste.push(t);
    } else if (puce && !ignoree) {
      imp.avertissements.push(`Point hors rubrique ignoré : « ${puce[1].slice(0, 40)} ».`);
    }
  }
  if (imp.niveau === null && !Object.keys(imp.rubriques).length) {
    return { ok: false, error: 'Aucune rubrique reconnue. Utilisez des titres comme « ## Points forts » suivis de lignes « - … ».' };
  }
  return { ok: true, import: imp };
}
