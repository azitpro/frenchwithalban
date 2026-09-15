/**
 * Test de placement : questions, barème et correction.
 *
 * Seule source des questions : la page publique test_placement.html les charge par
 * /api/placement/questions, l'administration s'en sert pour afficher les erreurs,
 * et le serveur recalcule lui-même les scores à partir des réponses : il ne se fie
 * jamais au résultat calculé par la page.
 *
 * Aucun import propre au serveur ici : ce module est aussi utilisé par la page d'administration.
 */

export const NIVEAUX = ['A1', 'A2', 'B1', 'B2', 'C1'] as const;
export type Niveau = (typeof NIVEAUX)[number];

/** « ___ » marque le blanc ; reponse est l'index (0 à 3) de la bonne option. */
export type Question = { id: string; phrase: string; options: [string, string, string, string]; reponse: number };

/** Niveau validé à partir de cette note sur 10 : on passe au niveau suivant. */
export const SEUIL_VALIDATION = 7;

/** Résultat quand le test s'arrête à ce niveau, selon la note : 0–2, 3–4, 5–6, 7+ (C1 seulement). */
export const RESULTATS: Record<Niveau, [string, string, string, string | null]> = {
  A1: ['A0', 'A1', 'A1+', null],
  A2: ['A2-', 'A2', 'A2+', null],
  B1: ['B1-', 'B1', 'B1+', null],
  B2: ['B2-', 'B2', 'B2+', null],
  C1: ['C1-', 'C1', 'C1+', 'C2'],
};

const q = (id: string, phrase: string, options: [string, string, string, string], reponse: number): Question => ({ id, phrase, options, reponse });

export const QUESTIONS: Record<Niveau, Question[]> = {
  A1: [
    q('A1-01', '___ étudiant.', ['Je vais', "J'est", 'Je suis', "J'ai"], 2),
    q('A1-02', '___ pomme est rouge.', ['La', 'Le', "L'", 'Les'], 0),
    q('A1-03', 'Nous ___ à Paris.', ['habite', 'habitez', 'habites', 'habitons'], 3),
    q('A1-04', 'Elle a deux ___.', ['chat', 'chaton', 'chate', 'chats'], 3),
    q('A1-05', 'Tu ___ un café ?', ['veut', 'veux', 'voulons', 'veulent'], 1),
    q('A1-06', 'Je ne parle ___ allemand.', ['pas', 'rien', 'non', 'un peu'], 0),
    q('A1-07', "C'est ___ amie Sophie.", ['mon', 'ma', 'mes', 'me'], 0),
    q('A1-08', 'Ils ___ au cinéma ce soir.', ['va', 'allons', 'vont', 'vas'], 2),
    q('A1-09', '___ habites-tu ? — À Lyon.', ['Quand', 'Où', 'Qui', 'Combien'], 1),
    q('A1-10', 'Je vais ___ supermarché.', ['à le', 'aux', 'à la', 'au'], 3),
  ],
  A2: [
    q('A2-01', 'Hier, nous ___ au restaurant.', ['avons allés', 'allons', 'avons allé', 'sommes allés'], 3),
    q('A2-02', "J'habite à Lyon ___ trois ans.", ['depuis', 'il y a', 'pendant', 'ça fait'], 0),
    q('A2-03', 'Tu connais Marc ? — Oui, je ___ connais bien.', ['le', 'lui', 'la', 'leur'], 0),
    q('A2-04', 'Tu as parlé à tes parents ? — Oui, ___ ai parlé.', ['je les', "j'y", 'je leur', 'je lui'], 2),
    q('A2-05', "Il y a du pain ? — Non, il n'y a plus ___ pain.", ['du', 'de', 'des', 'le'], 1),
    q('A2-06', 'Demain, il ___ beau.', ['faisait', 'a fait', 'fasse', 'fera'], 3),
    q('A2-07', 'Paris est ___ grande que Lyon.', ['le plus', 'meilleure', 'plus', 'autant'], 2),
    q('A2-08', "Elle s'est ___ à 7 heures.", ['levé', 'levés', 'levée', 'lever'], 2),
    q('A2-09', 'Je pense souvent ___ mes vacances.', ['de', 'à', 'en', 'sur'], 1),
    q('A2-10', 'Tu vas à la piscine ? — Oui, ___ vais.', ["j'en", 'je le', 'je lui', "j'y"], 3),
  ],
  B1: [
    q('B1-01', "Si j'avais le temps, ___ plus.", ['je lirais', 'je lirai', "j'aurai lu", 'je lisais'], 0),
    q('B1-02', 'Il faut que tu ___ tes devoirs.', ['fais', 'feras', 'faisais', 'fasses'], 3),
    q('B1-03', "C'est la ville ___ je suis né.", ['que', 'où', 'dont', 'qui'], 1),
    q('B1-04', "Le livre ___ je t'ai parlé est génial.", ['que', 'où', 'dont', 'lequel'], 2),
    q('B1-05', 'Dis-moi ___ te fait plaisir.', ['ce que', "qu'est-ce qui", 'ce qui', 'que'], 2),
    q('B1-06', "Les fleurs qu'il a ___ sont magnifiques.", ['achetées', 'acheté', 'achetés', 'achetée'], 0),
    q('B1-07', "Il m'a dit qu'il ___ samedi prochain.", ['vienne', 'viendrais', 'serait venu', 'viendrait'], 3),
    q('B1-08', "___ ses efforts, il n'a pas réussi l'examen.", ['Grâce à', 'Malgré', 'Bien que', 'À cause de'], 1),
    q('B1-09', 'Des pommes ? ___ ai acheté un kilo.', ["J'y", "J'en", 'Je les', 'Je leur'], 1),
    q('B1-10', 'Cette lettre ___ par le directeur hier.', ['a écrit', 'était écrite', 'écrivait', 'a été écrite'], 3),
  ],
  B2: [
    q('B2-01', "Bien qu'il ___ malade, il est venu.", ['est', 'était', 'soit', 'sera'], 2),
    q('B2-02', "Si j'avais su, ___ venu.", ["j'aurais", 'je serais', "j'étais", 'je serai'], 1),
    q('B2-03', "Elle s'est ___ couper les cheveux.", ['faite', 'fait', 'faites', 'faits'], 1),
    q('B2-04', 'Il est parti avant que nous ___ lui dire au revoir.', ['puissions', 'pouvons', 'pourrions', 'avons pu'], 0),
    q('B2-05', 'La raison ___ est parti reste un mystère.', ['dont il', 'pourquoi il', "qu'il", 'pour laquelle il'], 3),
    q('B2-06', "Ce sont des questions ___ je n'ai pas encore réfléchi.", ['desquelles', 'dont', 'auxquelles', 'lesquelles'], 2),
    q('B2-07', '___ fini son travail, il est sorti.', ['Étant', 'Après il a', 'Avant', 'Ayant'], 3),
    q('B2-08', "Je doute qu'il ___ la vérité.", ['dise', 'dit', 'dira', 'dirait'], 0),
    q('B2-09', 'Il a tellement plu ___ la route est inondée.', ['si bien', 'donc', 'que', 'alors'], 2),
    q('B2-10', "Elle s'est ___ les mains.", ['lavée', 'lavées', 'laver', 'lavé'], 3),
  ],
  C1: [
    q('C1-01', "Quoi qu'il ___, je ne changerai pas d'avis.", ['dit', 'dira', 'dirait', 'dise'], 3),
    q('C1-02', "Pour peu qu'on lui ___ confiance, il travaille très bien.", ['fasse', 'fait', 'ferait', 'fera'], 0),
    q('C1-03', "Il a fait tous les efforts qu'il a ___.", ['dus', 'dûs', 'dû', 'due'], 2),
    q('C1-04', 'Elle parle ___ elle connaissait parfaitement le sujet.', ['même si', 'comme si', 'comme', 'quand bien même'], 1),
    q('C1-05', '___ vous me le demanderiez, je refuserais.', ['Même si', 'Quand bien même', 'Bien que', 'Pourvu que'], 1),
    q('C1-06', "Ce n'est pas qu'il ___ incompétent, mais il manque d'expérience.", ['est', 'serait', 'était', 'soit'], 3),
    q('C1-07', "Les trois heures que ce film a ___ m'ont paru interminables.", ['duré', 'durées', 'durés', 'durée'], 0),
    q('C1-08', "Je crains qu'il ___ trop tard.", ["n'est", 'soit pas', 'ne soit', 'ne sera'], 2),
    q('C1-09', "Ils ___ la ville à l'aube.", ['quittèrent', 'quittirent', 'quittâmes', 'quitterent'], 0),
    q('C1-10', 'Il a beau ___, personne ne le croit.', ["qu'il crie", 'crie', 'criant', 'crier'], 3),
  ],
};

/** Ce que reçoit la page publique : questions, barème et seuil. */
export function donneesPubliques() {
  return {
    seuil: SEUIL_VALIDATION,
    resultats: RESULTATS,
    niveaux: NIVEAUX.map((niveau) => ({ niveau, questions: QUESTIONS[niveau] })),
  };
}

export function trouverQuestion(id: string): Question | undefined {
  const niveau = id.slice(0, 2) as Niveau;
  return QUESTIONS[niveau]?.find((question) => question.id === id);
}

/** null : le niveau est validé et le test continue au niveau suivant. */
export function resultatPour(niveau: Niveau, bonnes: number): string | null {
  const [bas, moyen, bon, excellent] = RESULTATS[niveau];
  if (bonnes >= SEUIL_VALIDATION) return excellent;
  if (bonnes >= 5) return bon;
  if (bonnes >= 3) return moyen;
  return bas;
}

/** index de l'option choisie (0 à 3), ou null pour « Je ne sais pas ». */
export type Choix = number | null;
export type ScoreNiveau = { niveau: Niveau; bonnes: number; jeNeSaisPas: number };
export type Erreur = { id: string; choix: Choix };
export type Correction = { resultat: string; scores: ScoreNiveau[]; erreurs: Erreur[] };

/** Test tel qu'affiché dans l'administration. */
export type TestPlacement = Correction & {
  id: string;
  passeLe: string;
  langue: 'fr' | 'en';
  prenom: string;
  email: string;
  contactLe: string | null;
};

/**
 * Vérifie les réponses envoyées par la page et recalcule le résultat.
 * Attendu : un tableau de niveaux dans l'ordre A1, A2…, chacun avec ses 10 questions exactement,
 * tous validés sauf le dernier (qui peut être C1 validé, pour le résultat C2).
 */
export function corriger(entree: unknown): { ok: true; correction: Correction } | { ok: false; erreur: string } {
  if (!Array.isArray(entree) || entree.length < 1 || entree.length > NIVEAUX.length) {
    return { ok: false, erreur: 'Réponses manquantes.' };
  }
  const scores: ScoreNiveau[] = [];
  const erreurs: Erreur[] = [];
  let resultat: string | null = null;

  for (let i = 0; i < entree.length; i++) {
    const niveau = NIVEAUX[i];
    const bloc = entree[i] as { niveau?: unknown; reponses?: unknown } | null;
    if (!bloc || bloc.niveau !== niveau || !Array.isArray(bloc.reponses)) {
      return { ok: false, erreur: `Niveau ${niveau} attendu.` };
    }
    const questions = QUESTIONS[niveau];
    if (bloc.reponses.length !== questions.length) return { ok: false, erreur: `Réponses incomplètes en ${niveau}.` };

    const vues = new Set<string>();
    let bonnes = 0;
    let jeNeSaisPas = 0;
    for (const brute of bloc.reponses as { id?: unknown; choix?: unknown }[]) {
      const question = questions.find((qu) => qu.id === brute?.id);
      const choix = brute?.choix;
      const choixValide = choix === null || (Number.isInteger(choix) && (choix as number) >= 0 && (choix as number) <= 3);
      if (!question || vues.has(question.id) || !choixValide) return { ok: false, erreur: `Réponse invalide en ${niveau}.` };
      vues.add(question.id);
      if (choix === question.reponse) bonnes++;
      else {
        if (choix === null) jeNeSaisPas++;
        erreurs.push({ id: question.id, choix: choix as Choix });
      }
    }
    scores.push({ niveau, bonnes, jeNeSaisPas });

    const r = resultatPour(niveau, bonnes);
    const dernier = i === entree.length - 1;
    if (!dernier && bonnes < SEUIL_VALIDATION) return { ok: false, erreur: `Le test aurait dû s'arrêter en ${niveau}.` };
    if (dernier) {
      if (r === null) return { ok: false, erreur: `Le test aurait dû continuer après ${niveau}.` };
      resultat = r;
    }
  }
  return { ok: true, correction: { resultat: resultat as string, scores, erreurs } };
}
