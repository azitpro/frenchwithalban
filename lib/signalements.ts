/**
 * Signalements de problème envoyés depuis le pied de page du site (page /signaler.html).
 * Ils apparaissent dans « Demandes de contact » de l'administration.
 *
 * Aucun import propre au serveur ici : ce module sert aussi à la page d'administration.
 */

export type Signalement = {
  id: string;
  message: string;
  email: string; // facultatif
  page: string; // page concernée, telle qu'indiquée par le visiteur
  langue: 'fr' | 'en';
  envoyeLe: string; // ISO
};

export const MESSAGE_MAX = 2000;
export const PAGE_MAX = 300;
export const EMAIL_MAX = 254;

const aUnCaractereDeControle = (texte: string) =>
  [...texte].some((c) => c !== '\n' && (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127));

export type Entree = { message?: unknown; email?: unknown; page?: unknown; langue?: unknown };

/** Nettoie et vérifie ce qu'envoie le formulaire. */
export function validerSignalement(entree: Entree): { ok: true; valeur: Omit<Signalement, 'id' | 'envoyeLe'> } | { ok: false; erreur: string } {
  const message = typeof entree.message === 'string' ? entree.message.replace(/\r\n?/g, '\n').trim() : '';
  if (!message) return { ok: false, erreur: 'Écrivez le problème rencontré.' };
  if (message.length > MESSAGE_MAX) return { ok: false, erreur: `Message trop long (${MESSAGE_MAX} caractères au plus).` };
  if (aUnCaractereDeControle(message)) return { ok: false, erreur: 'Message invalide.' };

  const emailBrut = typeof entree.email === 'string' ? entree.email.trim() : '';
  if (emailBrut && (emailBrut.length > EMAIL_MAX || aUnCaractereDeControle(emailBrut) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBrut))) {
    return { ok: false, erreur: 'Adresse email invalide.' };
  }

  const pageBrute = typeof entree.page === 'string' ? entree.page.replace(/\s+/g, ' ').trim() : '';
  if (pageBrute.length > PAGE_MAX || aUnCaractereDeControle(pageBrute)) return { ok: false, erreur: 'Page concernée invalide.' };

  return {
    ok: true,
    valeur: { message, email: emailBrut, page: pageBrute, langue: entree.langue === 'en' ? 'en' : 'fr' },
  };
}
