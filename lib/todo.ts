/**
 * To-do list personnelle de l'administration : objectifs classés par horizon.
 *
 * Horizons : un jour précis, une semaine (du lundi au dimanche), un autre horizon
 * nommé librement (avec une échéance facultative) ou le long terme.
 * Chaque objectif peut avoir des étapes à cocher.
 *
 * Données privées : aucune route publique ne les lit. Aucun import propre au serveur ici,
 * ce module sert aussi à la page d'administration.
 */
import { addDays, isDateKey, weekStartOf } from './planning';

export type Horizon =
  | { type: 'jour'; date: string }
  | { type: 'semaine'; semaine: string } // lundi de la semaine
  | { type: 'autre'; libelle: string; echeance: string | null }
  | { type: 'long-terme' };

export type TypeHorizon = Horizon['type'];

export type Etape = { id: string; texte: string; fait: boolean };

export type Objectif = {
  id: string;
  titre: string;
  notes: string;
  horizon: Horizon;
  etapes: Etape[];
  fait: boolean;
  creeLe: string; // ISO
  faitLe: string | null; // ISO
};

export type Todo = { objectifs: Objectif[] };

export const EMPTY_TODO: Todo = { objectifs: [] };

export const TITRE_MAX = 200;
export const NOTES_MAX = 4000;
export const LIBELLE_MAX = 60;
export const ETAPE_MAX = 200;
export const ETAPES_MAX = 50;
export const OBJECTIFS_MAX = 1000;
/** Les objectifs terminés depuis plus longtemps sont effacés à l'enregistrement. */
export const CONSERVATION_JOURS = 365;

export const TYPES_HORIZON: { type: TypeHorizon; nom: string }[] = [
  { type: 'jour', nom: 'Un jour' },
  { type: 'semaine', nom: 'Une semaine' },
  { type: 'autre', nom: 'Autre horizon' },
  { type: 'long-terme', nom: 'Long terme' },
];

/* ======================= validation ======================= */

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const ISO = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
const sansControle = (s: string) => [...s].every((c) => c === '\n' || c.charCodeAt(0) >= 32);

function texte(v: unknown, max: number, nom: string, multiligne = false): string {
  if (typeof v !== 'string') throw new Error(`${nom} invalide.`);
  const t = multiligne ? v.replace(/\r\n?/g, '\n').trim() : v.trim();
  if (t.length > max) throw new Error(`${nom} trop long (${max} caractères au plus).`);
  if (!sansControle(t) || (!multiligne && t.includes('\n'))) throw new Error(`${nom} invalide.`);
  return t;
}

export function validerHorizon(v: unknown): Horizon {
  const h = v as Record<string, unknown> | null;
  switch (h?.type) {
    case 'jour':
      if (!isDateKey(h.date)) throw new Error('Date du jour invalide.');
      return { type: 'jour', date: h.date };
    case 'semaine':
      if (!isDateKey(h.semaine)) throw new Error('Semaine invalide.');
      return { type: 'semaine', semaine: weekStartOf(h.semaine) };
    case 'autre': {
      const libelle = texte(h.libelle, LIBELLE_MAX, "Nom de l'horizon");
      if (!libelle) throw new Error("Donnez un nom à l'horizon (par exemple « Ce mois-ci »).");
      if (h.echeance !== null && h.echeance !== undefined && !isDateKey(h.echeance)) throw new Error('Échéance invalide.');
      return { type: 'autre', libelle, echeance: (h.echeance as string | null | undefined) ?? null };
    }
    case 'long-terme':
      return { type: 'long-terme' };
    default:
      throw new Error('Horizon invalide.');
  }
}

export function validerTodo(v: unknown): { ok: true; todo: Todo } | { ok: false; error: string } {
  try {
    const liste = (v as { objectifs?: unknown } | null)?.objectifs;
    if (!Array.isArray(liste)) throw new Error('Liste des objectifs manquante.');
    if (liste.length > OBJECTIFS_MAX) throw new Error(`${OBJECTIFS_MAX} objectifs au plus.`);
    const ids = new Set<string>();
    const objectifs = liste.map((brut): Objectif => {
      const o = brut as Record<string, unknown>;
      if (typeof o?.id !== 'string' || !ID.test(o.id) || ids.has(o.id)) throw new Error('Identifiant d’objectif invalide.');
      ids.add(o.id);
      const titre = texte(o.titre, TITRE_MAX, 'Objectif');
      if (!titre) throw new Error('Un objectif ne peut pas être vide.');
      if (!Array.isArray(o.etapes) || o.etapes.length > ETAPES_MAX) throw new Error(`${ETAPES_MAX} étapes au plus par objectif.`);
      const idsEtapes = new Set<string>();
      const etapes = o.etapes.map((b): Etape => {
        const e = b as Record<string, unknown>;
        if (typeof e?.id !== 'string' || !ID.test(e.id) || idsEtapes.has(e.id)) throw new Error('Identifiant d’étape invalide.');
        idsEtapes.add(e.id);
        const t = texte(e.texte, ETAPE_MAX, 'Étape');
        if (!t) throw new Error('Une étape ne peut pas être vide.');
        return { id: e.id, texte: t, fait: e.fait === true };
      });
      if (typeof o.fait !== 'boolean') throw new Error('État de l’objectif invalide.');
      if (!ISO(o.creeLe)) throw new Error('Date de création invalide.');
      if (o.faitLe !== null && !ISO(o.faitLe)) throw new Error('Date de fin invalide.');
      return {
        id: o.id,
        titre,
        notes: texte(o.notes ?? '', NOTES_MAX, 'Notes', true),
        horizon: validerHorizon(o.horizon),
        etapes,
        fait: o.fait,
        creeLe: o.creeLe,
        faitLe: o.fait ? ((o.faitLe as string | null) ?? o.creeLe) : null,
      };
    });
    return { ok: true, todo: { objectifs } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Données invalides.' };
  }
}

/** Retire les objectifs terminés depuis plus de CONSERVATION_JOURS jours. */
export function nettoyer(todo: Todo, maintenant: Date = new Date()): Todo {
  const limite = maintenant.getTime() - CONSERVATION_JOURS * 24 * 3600 * 1000;
  return { objectifs: todo.objectifs.filter((o) => !o.fait || !o.faitLe || Date.parse(o.faitLe) >= limite) };
}

/* ======================= modifications ======================= */

export const nouvelId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function ajouterObjectif(todo: Todo, titre: string, horizon: Horizon, maintenant = new Date()): Todo {
  const o: Objectif = { id: nouvelId(), titre: titre.trim(), notes: '', horizon, etapes: [], fait: false, creeLe: maintenant.toISOString(), faitLe: null };
  return { objectifs: [...todo.objectifs, o] };
}

export function modifierObjectif(todo: Todo, id: string, changement: Partial<Pick<Objectif, 'titre' | 'notes' | 'horizon' | 'etapes'>>): Todo {
  return { objectifs: todo.objectifs.map((o) => (o.id === id ? { ...o, ...changement } : o)) };
}

export function basculerObjectif(todo: Todo, id: string, maintenant = new Date()): Todo {
  return {
    objectifs: todo.objectifs.map((o) =>
      o.id === id ? { ...o, fait: !o.fait, faitLe: o.fait ? null : maintenant.toISOString() } : o),
  };
}

/** Déplace l'objectif juste avant (ou juste après) un autre objectif de la liste. */
export function placerObjectif(todo: Todo, id: string, cibleId: string, apres: boolean): Todo {
  if (id === cibleId) return todo;
  const deplace = todo.objectifs.find((o) => o.id === id);
  if (!deplace || !todo.objectifs.some((o) => o.id === cibleId)) return todo;
  const reste = todo.objectifs.filter((o) => o.id !== id);
  const i = reste.findIndex((o) => o.id === cibleId) + (apres ? 1 : 0);
  const objectifs = [...reste.slice(0, i), deplace, ...reste.slice(i)];
  return objectifs.every((o, k) => o === todo.objectifs[k]) ? todo : { objectifs };
}

export function supprimerObjectif(todo: Todo, id: string): Todo {
  return { objectifs: todo.objectifs.filter((o) => o.id !== id) };
}

export function ajouterEtape(todo: Todo, id: string, texteEtape: string): Todo {
  return { objectifs: todo.objectifs.map((o) => (o.id === id ? { ...o, etapes: [...o.etapes, { id: nouvelId(), texte: texteEtape.trim(), fait: false }] } : o)) };
}

export function basculerEtape(todo: Todo, id: string, etapeId: string): Todo {
  return {
    objectifs: todo.objectifs.map((o) =>
      o.id === id ? { ...o, etapes: o.etapes.map((e) => (e.id === etapeId ? { ...e, fait: !e.fait } : e)) } : o),
  };
}

/* ======================= dates et classement ======================= */

/** Dernier jour couvert par l'horizon (null : pas d'échéance). */
export function finHorizon(h: Horizon): string | null {
  if (h.type === 'jour') return h.date;
  if (h.type === 'semaine') return addDays(h.semaine, 6);
  if (h.type === 'autre') return h.echeance;
  return null;
}

export const enRetard = (o: Objectif, aujourdhui: string) => {
  const fin = finHorizon(o.horizon);
  return !o.fait && fin !== null && fin < aujourdhui;
};

function dateLongue(date: string, avecAnnee = false): string {
  const t = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', ...(avecAnnee ? { year: 'numeric' } : {}), timeZone: 'UTC' })
    .format(new Date(date + 'T00:00:00Z'));
  return t.replace(/^1(?=\s)/, '1er');
}

export function nomJour(date: string, aujourdhui: string): string {
  if (date === aujourdhui) return "Aujourd'hui";
  if (date === addDays(aujourdhui, 1)) return 'Demain';
  if (date === addDays(aujourdhui, -1)) return 'Hier';
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  const texteDate = `${jour} ${dateLongue(date, date.slice(0, 4) !== aujourdhui.slice(0, 4))}`;
  return texteDate.charAt(0).toUpperCase() + texteDate.slice(1);
}

export function nomSemaine(lundi: string, aujourdhui: string): string {
  const courante = weekStartOf(aujourdhui);
  if (lundi === courante) return 'Cette semaine';
  if (lundi === addDays(courante, 7)) return 'Semaine prochaine';
  if (lundi === addDays(courante, -7)) return 'Semaine dernière';
  const dimanche = addDays(lundi, 6);
  const memeMois = lundi.slice(0, 7) === dimanche.slice(0, 7);
  const debut = memeMois ? (lundi.endsWith('-01') ? '1er' : String(Number(lundi.slice(8)))) : dateLongue(lundi, lundi.slice(0, 4) !== dimanche.slice(0, 4));
  return `Semaine du ${debut} au ${dateLongue(dimanche, dimanche.slice(0, 4) !== aujourdhui.slice(0, 4))}`;
}

export const avantLe = (date: string, aujourdhui: string) => `avant le ${dateLongue(date, date.slice(0, 4) !== aujourdhui.slice(0, 4))}`;

/** Texte court de l'horizon, pour une étiquette. */
export function resumeHorizon(h: Horizon, aujourdhui: string): string {
  if (h.type === 'jour') return nomJour(h.date, aujourdhui);
  if (h.type === 'semaine') return nomSemaine(h.semaine, aujourdhui);
  if (h.type === 'autre') return h.echeance ? `${h.libelle} · ${avantLe(h.echeance, aujourdhui)}` : h.libelle;
  return 'Long terme';
}

export type Groupe = { cle: string; titre: string; retard: boolean; objectifs: Objectif[] };

/**
 * Objectifs d'une colonne (un type d'horizon), regroupés :
 * jours et semaines par date (en retard d'abord), autres horizons par nom (échéance la plus proche d'abord).
 * Dans un groupe : à faire d'abord, puis terminés ; sinon l'ordre de la liste enregistrée,
 * que l'on change en déplaçant les objectifs (placerObjectif).
 */
export function grouper(objectifs: Objectif[], type: TypeHorizon, aujourdhui: string): Groupe[] {
  const position = new Map(objectifs.map((o, i) => [o.id, i]));
  const liste = objectifs.filter((o) => o.horizon.type === type);
  const ordreInterne = (a: Objectif, b: Objectif) => Number(a.fait) - Number(b.fait) || position.get(a.id)! - position.get(b.id)!;
  const groupes = new Map<string, Groupe & { tri: string }>();
  for (const o of liste) {
    const h = o.horizon;
    let cle: string; let titre: string; let tri: string;
    if (h.type === 'jour') { cle = h.date; titre = nomJour(h.date, aujourdhui); tri = h.date; }
    else if (h.type === 'semaine') { cle = h.semaine; titre = nomSemaine(h.semaine, aujourdhui); tri = h.semaine; }
    else if (h.type === 'autre') { cle = h.libelle.toLowerCase(); titre = h.libelle; tri = h.echeance ?? '9999-12-31'; }
    else { cle = 'long-terme'; titre = 'Long terme'; tri = ''; }
    const g = groupes.get(cle) ?? { cle, titre, retard: false, objectifs: [], tri };
    if (h.type === 'autre' && tri < g.tri) g.tri = tri;
    g.objectifs.push(o);
    groupes.set(cle, g);
  }
  return [...groupes.values()]
    .map((g) => ({ ...g, retard: g.objectifs.some((o) => enRetard(o, aujourdhui)), objectifs: g.objectifs.sort(ordreInterne) }))
    .sort((a, b) => a.tri.localeCompare(b.tri) || a.titre.localeCompare(b.titre, 'fr'))
    .map(({ tri: _tri, ...g }) => g);
}
