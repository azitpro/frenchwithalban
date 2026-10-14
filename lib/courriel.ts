/**
 * Notifications par courriel, envoyées par l'API de Resend.
 *
 * Trois variables d'environnement, à régler sur Vercel :
 *   RESEND_API_KEY          clé fournie par Resend
 *   COURRIEL_EXPEDITEUR     adresse d'envoi, sur un domaine vérifié chez Resend
 *                           ex. « French with Alban <notifications@frenchwithalban.com> »
 *   COURRIEL_DESTINATAIRE   l'adresse où Alban veut recevoir les notifications
 *
 * Tant qu'elles ne sont pas réglées, l'envoi ne fait rien : le site fonctionne
 * exactement comme avant. Un envoi qui échoue n'interrompt jamais la demande du
 * visiteur — il a envoyé son message, ce qui compte est qu'il soit enregistré.
 */

import { after } from 'next/server';

export type Notification = { sujet: string; lignes: string[]; repondreA?: string };

export const courrielConfigure = (): boolean =>
  Boolean(process.env.RESEND_API_KEY && process.env.COURRIEL_EXPEDITEUR && process.env.COURRIEL_DESTINATAIRE);

const echapper = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Un corps simple et lisible, qui passe aussi bien en texte qu'en HTML. */
function corps(lignes: string[]): { texte: string; html: string } {
  const texte = lignes.join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#1b1340">
${lignes.map((l) => (l ? `<p style="margin:0 0 10px">${echapper(l)}</p>` : '<hr style="border:0;border-top:1px solid #ded8e8;margin:14px 0">')).join('\n')}
<p style="margin:18px 0 0;font-size:13px;color:#564f70">Envoyé automatiquement par frenchwithalban.com · <a href="https://frenchwithalban.com/admin/leads" style="color:#7c5cff">voir dans l'administration</a></p>
</div>`;
  return { texte, html };
}

/**
 * Envoie une notification. Ne lève jamais : renvoie seulement ce qui s'est passé,
 * pour que l'appelant puisse le journaliser sans risquer la réponse au visiteur.
 */
export async function envoyerNotification(n: Notification): Promise<{ ok: boolean; raison?: string }> {
  if (!courrielConfigure()) return { ok: false, raison: 'non configuré' };
  const { texte, html } = corps(n.lignes);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.COURRIEL_EXPEDITEUR,
        to: [process.env.COURRIEL_DESTINATAIRE],
        subject: n.sujet,
        text: texte,
        html,
        // répondre au message ouvre directement une réponse à l'élève
        ...(n.repondreA ? { reply_to: n.repondreA } : {}),
      }),
    });
    if (!res.ok) return { ok: false, raison: `Resend a répondu ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, raison: e instanceof Error ? e.message : 'envoi impossible' };
  }
}

/**
 * Notifie sans faire attendre le visiteur ni risquer de faire échouer sa demande.
 * L'échec est seulement journalisé : la demande, elle, est déjà enregistrée.
 *
 * `after` de Next tient la fonction éveillée le temps de l'envoi : une simple
 * promesse laissée de côté serait gelée avec la réponse, et le courriel ne
 * partirait jamais.
 */
export function notifierEnArrierePlan(n: Notification): void {
  if (!courrielConfigure()) return;
  const envoi = async () => {
    const r = await envoyerNotification(n);
    if (!r.ok) console.error(`Notification « ${n.sujet} » non envoyée : ${r.raison}`);
  };
  try {
    after(envoi);
  } catch {
    // hors d'une requête (script, test) : on envoie quand même
    void envoi();
  }
}
