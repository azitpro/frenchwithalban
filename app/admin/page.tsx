import { AdminShell } from './admin-ui';
import { PastillePreply } from './pastille-preply';

const SECTIONS = [
  { titre: 'To-do list', desc: 'Objectifs du jour, de la semaine, à un autre horizon ou à long terme.', href: '/admin/todo', signe: '✓' },
  { titre: 'Fiches élèves', desc: 'Niveau, points forts et faibles, notions à retenir, devoirs et prochains cours.', href: '/admin/eleves', signe: '✎' },
  { titre: 'Organisation personnelle', desc: 'Semaine type : cours, routines et quotas hebdomadaires, export PDF.', href: '/admin/planning', signe: '▦' },
  { titre: 'Planning des cours', desc: 'Disponibilités générales, créneaux élèves, cours ponctuels, indisponibilités.', href: '/admin/schedule', signe: '◷', pastille: true },
  { titre: 'Demandes de contact', desc: 'Formulaires de la page Réserver et résultats du test de placement.', href: '/admin/leads', signe: '✉' },
  { titre: 'Tarifs', desc: 'Prix réel et prix remisé affichés sur la page Réserver.', href: '/admin/pricing', signe: '€' },
];

export default function AdminHub() {
  return (
    <AdminShell titre="Tableau de bord" accueil intro="Tout ce qui fait tourner French with Alban, au même endroit.">
      <style href="admin-hub" precedence="default">{CSS}</style>
      <nav className="hub ad-suite" aria-label="Sections de l’administration">
        {SECTIONS.map((s) => (
          <a key={s.href} href={s.href} className="hub-carte">
            <span className="hub-signe" aria-hidden="true">{s.signe}</span>
            <span className="hub-texte">
              <span className="hub-titre">{s.titre}{s.pastille && <PastillePreply />}</span>
              <span className="hub-desc">{s.desc}</span>
            </span>
            <span className="hub-fleche" aria-hidden="true">→</span>
          </a>
        ))}
      </nav>
    </AdminShell>
  );
}

const CSS = `
.hub{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:18px;margin-top:8px}
.hub-carte{display:flex;align-items:center;gap:16px;padding:18px 20px;background:#fff;border:3px solid var(--ink);border-radius:20px;box-shadow:5px 5px 0 var(--ink);text-decoration:none;transition:translate .15s,box-shadow .15s}
.hub-carte:hover{translate:-2px -2px;box-shadow:7px 7px 0 var(--ink)}
.hub-signe{flex:none;display:grid;place-items:center;width:58px;height:58px;background:var(--c);color:var(--c-texte);border:3px solid var(--ink);border-radius:16px;box-shadow:3px 3px 0 var(--ink);font-family:var(--titre);font-size:1.7rem;font-weight:800;line-height:1;rotate:-4deg}
.hub-carte:nth-child(even) .hub-signe{rotate:4deg}
.hub-texte{flex:1;min-width:0}
.hub-titre{display:block;font-family:var(--titre);font-weight:800;font-size:1.3rem;letter-spacing:-.02em;line-height:1.15}
.hub-pastille{display:inline-block;margin-left:8px;padding:1px 10px;border:2px solid var(--ink);border-radius:99px;background:var(--rose);color:#fff;font-family:Inter,system-ui,sans-serif;font-weight:700;font-size:.72rem;vertical-align:middle;white-space:nowrap}
.hub-desc{display:block;margin-top:3px;font-size:.88rem;color:var(--soft)}
.hub-fleche{flex:none;display:grid;place-items:center;width:36px;height:36px;border:2.5px solid var(--ink);border-radius:50%;font-weight:800;transition:background .15s,translate .15s}
.hub-carte:hover .hub-fleche{background:var(--lime);translate:3px 0}
@media (prefers-reduced-motion:reduce){.hub-carte,.hub-fleche{transition:none}}
@media (max-width:720px){.hub-carte{padding:14px;gap:12px}.hub-signe{width:48px;height:48px;font-size:1.4rem}.hub-titre{font-size:1.12rem}}
`;
