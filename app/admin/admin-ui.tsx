import type { ReactNode, SVGProps } from 'react';

/**
 * Habillage commun des pages d'administration, dans le style acidulé du site :
 * barre du haut avec le logo (retour au tableau de bord), boutons, cartes et champs.
 * La page « Organisation personnelle » garde sa propre barre (navigation par semaine, impression).
 */

const INK = '#1b1340';

/** Hexagone tricolore du logo (bandes découpées à la main, rendu identique partout). */
export function HexDrapeau(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true" focusable="false" {...props}>
      <polygon points="1,7 8,3.18 8,24.82 1,21" fill="#002395" />
      <polygon points="8,3.18 12,1 16,3.18 16,24.82 12,27 8,24.82" fill="#ffffff" />
      <polygon points="16,3.18 23,7 23,21 16,24.82" fill="#ED2939" />
      <polygon points="12,1 23,7 23,21 12,27 1,21 1,7" fill="none" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminStyles() {
  return <style href="admin-ui" precedence="default">{ADMIN_CSS}</style>;
}

type ShellProps = {
  titre: string;
  intro?: ReactNode;
  actions?: ReactNode;
  largeur?: 'etroite' | 'normale' | 'large';
  accueil?: boolean; // tableau de bord : pas de lien de retour
  children: ReactNode;
};

export function AdminShell({ titre, intro, actions, largeur = 'normale', accueil = false, children }: ShellProps) {
  return (
    <div className="ad">
      <AdminStyles />
      <header className="ad-barre">
        <a href="/admin" className="ad-logo" aria-label="Tableau de bord de l’administration">
          <HexDrapeau className="ad-hex" />
          <span>
            <small>French with Alban · Administration</small>
            <span className="ad-titre">{titre}</span>
          </span>
        </a>
        {actions && <div className="ad-actions">{actions}</div>}
      </header>
      <main className={`ad-corps ad-${largeur}`}>
        {!accueil && <a href="/admin" className="ad-retour">← Tableau de bord</a>}
        <h1 className="ad-h1">{titre}</h1>
        {intro && <p className="ad-intro">{intro}</p>}
        {children}
      </main>
    </div>
  );
}

export function AdminChargement({ texte }: { texte: string }) {
  return (
    <div className="ad">
      <AdminStyles />
      <div className="ad-chargement" role="status">
        <HexDrapeau className="ad-chargement-hex" />
        <span>{texte}</span>
      </div>
    </div>
  );
}

export const ADMIN_CSS = `
.ad{--ink:#1b1340;--soft:#564f70;--bg:#fff7ee;--lime:#c8f560;--pink:#ff5fa2;--rose:#d42a78;--aqua:#3ee0c6;--lemon:#ffe45c;--orange:#ff8a3d;--violet:#7c5cff;
  --titre:'Bricolage Grotesque',Inter,system-ui,sans-serif;
  min-height:100vh;color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.5;color-scheme:light;
  background:radial-gradient(circle at 3% 0%,rgba(200,245,96,.42) 0,transparent 26%),radial-gradient(circle at 100% 22%,rgba(255,95,162,.16) 0,transparent 24%),radial-gradient(circle at 0% 100%,rgba(255,228,92,.32) 0,transparent 28%),var(--bg)}
:where(.ad) *{box-sizing:border-box}
:where(.ad) :where(button,input,select,textarea){font:inherit;color:inherit}
:where(.ad) button{cursor:pointer}
.ad :focus-visible{outline:3px solid var(--violet);outline-offset:2px}
:where(.ad) a{color:inherit}

/* ordre officiel des couleurs : citron vert, rose, turquoise, jaune, orange, violet */
.ad-suite>:nth-child(6n+1){--c:var(--lime);--c-texte:var(--ink)}
.ad-suite>:nth-child(6n+2){--c:var(--pink);--c-texte:#fff}
.ad-suite>:nth-child(6n+3){--c:var(--aqua);--c-texte:var(--ink)}
.ad-suite>:nth-child(6n+4){--c:var(--lemon);--c-texte:var(--ink)}
.ad-suite>:nth-child(6n+5){--c:var(--orange);--c-texte:#fff}
.ad-suite>:nth-child(6n){--c:var(--violet);--c-texte:#fff}

/* ---------- chargement ---------- */
.ad-chargement{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px}
.ad-chargement-hex{width:54px;height:63px;animation:ad-tourne 1.1s cubic-bezier(.6,.05,.3,.95) infinite}
.ad-chargement span{font-family:var(--titre);font-weight:700;font-size:.95rem;letter-spacing:.1em;text-transform:uppercase;opacity:.6}
@keyframes ad-tourne{to{rotate:360deg}}
@media (prefers-reduced-motion:reduce){.ad-chargement-hex{animation-duration:3s}}

/* ---------- barre du haut ---------- */
.ad-barre{position:sticky;top:0;z-index:30;display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:10px 22px;
  background:linear-gradient(90deg,#c9d4ff 0%,#fff 35%,#fff 65%,#ffd0d4 100%);border-bottom:3px solid var(--ink)}
.ad-logo{display:flex;align-items:center;gap:12px;margin-right:auto;min-width:0;text-decoration:none}
.ad-hex{width:32px;height:38px;flex:none;rotate:-12deg;filter:drop-shadow(2px 3px 0 var(--ink))}
.ad-logo small{display:block;font-size:.6rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--soft)}
.ad-titre{display:block;font-family:var(--titre);font-size:1.3rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}
.ad-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}

/* ---------- corps ---------- */
.ad-corps{margin:0 auto;padding:22px 22px 70px}
.ad-etroite{max-width:620px}.ad-normale{max-width:920px}.ad-large{max-width:1400px}
.ad-retour{display:inline-block;margin-bottom:14px;padding:3px 13px;border:2px solid var(--ink);border-radius:99px;background:#fff;font-size:.8rem;font-weight:600;text-decoration:none;box-shadow:2px 2px 0 var(--ink)}
.ad-retour:hover{background:var(--lemon)}
.ad-h1{font-family:var(--titre);font-weight:800;font-size:2.6rem;line-height:1.02;letter-spacing:-.035em;margin:0 0 8px}
.ad-intro{color:var(--soft);max-width:680px;margin:0 0 22px}
.ad-section{margin-top:30px}
.ad-section>h2,.ad-h2{font-family:var(--titre);font-weight:800;font-size:1.4rem;letter-spacing:-.02em;line-height:1.15;margin:0 0 4px}
.ad-section>p,.ad-aide{color:var(--soft);font-size:.88rem;margin:0 0 12px}

/* ---------- boutons ---------- */
.ad-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:2.5px solid var(--ink);background:#fff;color:var(--ink);padding:7px 15px;border-radius:99px;
  font-weight:700;font-size:.85rem;line-height:1.3;text-decoration:none;white-space:nowrap;box-shadow:2px 2px 0 var(--ink);transition:translate .12s,box-shadow .12s,background .15s}
.ad-btn:hover:not(:disabled){translate:-1px -1px;box-shadow:3px 3px 0 var(--ink)}
.ad-btn:disabled{opacity:.4;cursor:default;box-shadow:none}
.ad-plein{background:var(--ink);color:#fff;box-shadow:3px 3px 0 var(--pink)}
.ad-plein:hover:not(:disabled){box-shadow:4px 4px 0 var(--pink)}
.ad-rose{background:var(--pink);color:#fff}
.ad-or{background:var(--lemon)}
.ad-danger{background:#ffe1ee}
.ad-petit{padding:3px 10px;font-size:.75rem;border-width:2px;box-shadow:1.5px 1.5px 0 var(--ink)}
.ad-btn[aria-pressed="true"]{background:var(--lime)}
@media (prefers-reduced-motion:reduce){.ad-btn{transition:none}}

/* ---------- cartes et listes ---------- */
.ad-carte{background:#fff;border:3px solid var(--ink);border-radius:20px;box-shadow:5px 5px 0 var(--ink);padding:20px 22px}
.ad-liste{display:grid;gap:10px}
.ad-ligne{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:10px 14px;background:#fff;border:2.5px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink)}
.ad-ligne>.ad-ligne-texte{flex:1;min-width:180px}
.ad-ligne.ad-rouge{background:#ffe1ee}
.ad-ligne.ad-jaune{background:#fff4c2}
.ad-vide{margin:0;padding:12px 14px;border:2.5px dashed rgba(27,19,64,.3);border-radius:14px;color:var(--soft);font-size:.88rem;font-style:italic}
.ad-etiquette{display:inline-block;padding:1px 10px;border:2px solid var(--ink);border-radius:99px;background:var(--c,#fff);color:var(--c-texte,var(--ink));font-size:.68rem;font-weight:800;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}

/* ---------- messages ---------- */
.ad-message{margin:0 0 14px;padding:9px 14px;font-size:.88rem;font-weight:600;border:2px solid var(--ink);border-radius:12px;box-shadow:2px 2px 0 var(--ink)}
.ad-erreur{background:#ffe1ee}.ad-ok{background:#ecffc4}.ad-avert{background:#fff4c2}.ad-info{background:#fff;color:var(--soft)}

/* ---------- champs ---------- */
.ad-champs{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
.ad-champ{display:flex;flex-direction:column;gap:5px;min-width:0}
.ad-champ>span,.ad-label{font-size:.66rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--soft)}
:where(.ad) :where(input:not([type=checkbox]):not([type=radio]),select,textarea){width:100%;padding:8px 12px;border:2.5px solid var(--ink);border-radius:12px;background:var(--bg);font-size:.95rem;line-height:1.35}
:where(.ad) select{-webkit-appearance:none;appearance:none;padding-right:34px;cursor:pointer;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 14 9'%3E%3Cpath d='M1.5 1.5 7 7l5.5-5.5' fill='none' stroke='%231b1340' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 12px center}
:where(.ad) :where(input,select,textarea):focus{outline:3px solid var(--violet);outline-offset:1px;background-color:#fff}
:where(.ad) textarea{resize:vertical;min-height:80px}
.ad-texte-sep{align-self:center;padding-bottom:9px;color:var(--soft);font-weight:600}

@media (max-width:720px){
  .ad-barre{padding:8px 14px}
  .ad-titre{font-size:1.1rem}
  .ad-corps{padding:16px 14px 56px}
  .ad-h1{font-size:2rem}
  .ad-carte{padding:16px 14px;border-radius:16px;box-shadow:4px 4px 0 var(--ink)}
}
`;
