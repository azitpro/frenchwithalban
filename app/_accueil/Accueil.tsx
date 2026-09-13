'use client';

import { useEffect, useState } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

type Lang = 'fr' | 'en';

const DUREE_ECRAN = 9000; // durée d'affichage de chaque écran du carrousel, en millisecondes
const NB_ECRANS = 2;
const DON = 'https://donate.stripe.com/cNidR2aQf8ehaKvbCv4gg00';

export default function Accueil({ nombreRessources }: { nombreRessources: number | null }) {
  const [lang, setLang] = useState<Lang>('fr');
  const [pret, setPret] = useState(false);
  const [menu, setMenu] = useState(false);

  // carrousel
  const [ecran, setEcran] = useState(0);
  const [tour, setTour] = useState(0); // relance la barre de progression
  const [pauseManuelle, setPauseManuelle] = useState(false);
  const [lecture, setLecture] = useState(false); // souris sur le texte
  const [clavier, setClavier] = useState(false); // navigation au clavier dans le carrousel
  const [ongletCache, setOngletCache] = useState(false);
  const enPause = pauseManuelle || lecture || clavier || ongletCache;

  /* ---------- langue : choix enregistré, sinon langue du navigateur ---------- */
  useEffect(() => {
    let choix: Lang | null = null;
    try {
      const enregistre = localStorage.getItem('fwa-lang');
      if (enregistre === 'fr' || enregistre === 'en') choix = enregistre;
    } catch {}
    if (!choix) choix = (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
    setLang(choix);
    setPret(true);
  }, []);

  useEffect(() => {
    if (!pret) return;
    try { localStorage.setItem('fwa-lang', lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang, pret]);

  /* ---------- carrousel : pas de défilement si les animations sont réduites, pause si l'onglet est caché ---------- */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPauseManuelle(true);
    const surVisibilite = () => setOngletCache(document.hidden);
    document.addEventListener('visibilitychange', surVisibilite);
    return () => document.removeEventListener('visibilitychange', surVisibilite);
  }, []);

  const t = (fr: string, en: string) => (lang === 'fr' ? fr : en);
  const aller = (n: number) => {
    setEcran((n + NB_ECRANS) % NB_ECRANS);
    setTour((x) => x + 1);
  };
  const survolTexte = {
    onPointerEnter: (e: PointerEvent) => { if (e.pointerType === 'mouse') setLecture(true); },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType === 'mouse') setLecture(false); },
  };
  const ecranProps = (i: number, label: string) => ({
    className: `ac-diapo${ecran === i ? ' actif' : ''}`,
    role: 'group',
    'aria-roledescription': t('diapositive', 'slide'),
    'aria-label': label,
    'aria-hidden': ecran !== i,
    inert: ecran !== i,
  });

  return (
    <div className="accueil" lang={lang}>
      <style precedence="default" href="accueil-styles">{CSS}</style>

      {/* ---------- en-tête ---------- */}
      <header className="ac-entete">
        <div className="ac-wrap ac-barre">
          <a href="/" className="ac-logo">
            <svg width="26" height="30" viewBox="0 0 24 28" aria-hidden="true">
              <defs><clipPath id="acHex"><polygon points="12,1 23,7 23,21 12,27 1,21 1,7" /></clipPath></defs>
              <rect width="8" height="28" fill="#002395" clipPath="url(#acHex)" />
              <rect x="8" width="8" height="28" fill="#ffffff" clipPath="url(#acHex)" />
              <rect x="16" width="8" height="28" fill="#ED2939" clipPath="url(#acHex)" />
              <polygon points="12,1 23,7 23,21 12,27 1,21 1,7" fill="none" stroke="#0d2b45" strokeWidth="1.5" />
            </svg>
            <span>French with <b>Alban</b></span>
          </a>
          <nav className="ac-nav" aria-label={t('Navigation principale', 'Main navigation')}>
            <a href="/cours.html">{t('Cours', 'Lessons')}</a>
            <a href="/planning_public.html">{t('Créneaux', 'Availability')}</a>
            <a href="/ressources.html">{t('Ressources', 'Resources')}</a>
            <a href="/apropos.html">{t('À propos', 'About')}</a>
          </nav>
          <div className="ac-langue" role="group" aria-label={t('Choix de la langue', 'Language')}>
            <button type="button" className={lang === 'fr' ? 'on' : ''} aria-pressed={lang === 'fr'} onClick={() => setLang('fr')} title="Français">FR</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')} title="English">EN</button>
          </div>
          <a href="/reserver.html" className="ac-btn ac-rouge ac-btn-entete">{t('Réserver', 'Book a lesson')}</a>
          <button type="button" className="ac-burger" aria-expanded={menu} aria-controls="ac-menu"
            aria-label={menu ? t('Fermer le menu', 'Close menu') : t('Ouvrir le menu', 'Open menu')} onClick={() => setMenu(!menu)}>
            <i />
          </button>
        </div>
        <div id="ac-menu" className="ac-menu" hidden={!menu}>
          <a href="/cours.html">{t('Cours', 'Lessons')}</a>
          <a href="/planning_public.html">{t('Créneaux', 'Availability')}</a>
          <a href="/ressources.html">{t('Ressources', 'Resources')}</a>
          <a href="/apropos.html">{t('À propos', 'About')}</a>
          <a href="/reserver.html" className="ac-btn ac-rouge">{t('Réserver un cours', 'Book a lesson')}</a>
        </div>
      </header>

      {/* ---------- carrousel : cours, puis ressources ---------- */}
      <div
        className={`ac-hero${enPause ? ' en-pause' : ''}`}
        aria-roledescription={t('carrousel', 'carousel')}
        aria-label={t('À la une', 'Featured')}
        data-ecran={ecran}
        onFocus={(e: FocusEvent<HTMLDivElement>) => setClavier(e.target.matches(':focus-visible'))}
        onBlur={(e: FocusEvent<HTMLDivElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setClavier(false); }}
      >
        <div className="ac-wrap ac-hero-wrap">
          <div className="ac-diapos">
            <div {...ecranProps(0, t('1 sur 2 : cours particuliers', '1 of 2: one-to-one lessons'))}>
              <div className="ac-texte" {...survolTexte}>
                <div className="ac-over">{t('Professeur natif · En ligne', 'Native teacher · Online')}</div>
                <h1 className="ac-titre">
                  {lang === 'fr' ? <>Apprenez le <em>français</em> autrement.</> : <>Learn <em>French</em> differently.</>}
                </h1>
                <p className="ac-lead">
                  {t('Des cours particuliers avec un enseignant français natif. Approche personnalisée, progression mesurable, horaires adaptés à votre vie.',
                     'One-to-one lessons with a native French teacher. A personalised approach, measurable progress, and hours that fit around your life.')}
                </p>
                <div className="ac-actions">
                  <a href="/reserver.html" className="ac-btn ac-navy">{t('Réserver un cours →', 'Book a lesson →')}</a>
                  <a href="/planning_public.html" className="ac-btn ac-ligne">{t('Voir les créneaux', 'See available slots')}</a>
                </div>
                <div className="ac-preuves">
                  <div><strong>{t('3 670', '3,670')}</strong>{t('cours donnés', 'lessons taught')}</div>
                  <div><strong>11</strong>{t('nationalités', 'nationalities')}</div>
                  <div><strong>A1→C1</strong>{t('tous niveaux', 'all levels')}</div>
                </div>
              </div>
              <div className="ac-portrait">
                <img src="/alban.jpg" alt={t('Alban, professeur de français', 'Alban, French teacher')} />
                <div className="ac-carte-prix"><strong>$38</strong><span>/ 50 min</span></div>
                <div className="ac-carte-avis">
                  <div className="ac-etiquette">{t("Ce qu'en disent mes élèves", 'What my students say')}</div>
                  <p>{t('Plus de deux ans de cours ensemble. Il est attentif, patient, et il a nettement accéléré mon apprentissage.',
                        'More than two years of lessons together. He is attentive, patient, and he has clearly sped up my learning.')}</p>
                  <small>{t('Ola · plus de 150 cours', 'Ola · 150+ lessons')}</small>
                </div>
              </div>
            </div>

            <div {...ecranProps(1, t('2 sur 2 : ressources gratuites', '2 of 2: free resources'))}>
              <div className="ac-texte" {...survolTexte}>
                <div className="ac-over">{t('Ressources gratuites', 'Free resources')}</div>
                <p className="ac-titre">
                  {lang === 'fr' ? <>Entraînez-vous <em>gratuitement</em>, à votre rythme.</> : <>Practise <em>for free</em>, at your own pace.</>}
                </p>
                <p className="ac-lead">
                  {t('Fiches, exercices et outils pour progresser en français, classés par niveau. Tout est gratuit.',
                     'Sheets, exercises and tools to improve your French, sorted by level. Everything is free.')}
                </p>
                <div className="ac-actions">
                  <a href="/ressources.html" className="ac-btn ac-navy">{t('Parcourir les ressources →', 'Browse the resources →')}</a>
                  <a href="/conjugaison.html" className="ac-btn ac-ligne">{t('Test de conjugaison', 'Conjugation test')}</a>
                </div>
                <div className="ac-preuves">
                  {nombreRessources !== null && <div><strong>{nombreRessources}</strong>{t('ressources en ligne', 'resources online')}</div>}
                  <div><strong>A0→A2</strong>{t('niveaux couverts', 'levels covered')}</div>
                  <div><strong>{t('100 %', '100%')}</strong>{t('gratuit', 'free')}</div>
                </div>
              </div>
              <div className="ac-collage">
                <a className="ac-rc ac-rc-adj" href="/adjectifs.html">
                  <div className="ac-paire">
                    <figure><img src="/img/adjectifs/rapide.jpg" alt="" /><figcaption>rapide</figcaption></figure>
                    <span aria-hidden="true">≠</span>
                    <figure><img src="/img/adjectifs/lent.jpg" alt="" /><figcaption>lent</figcaption></figure>
                  </div>
                  <small>{t('Vocabulaire', 'Vocabulary')}</small>
                  <strong>{t('Les adjectifs essentiels', 'The essential adjectives')}</strong>
                </a>
                <a className="ac-rc ac-rc-conj" href="/conjugaison.html">
                  <small>{t('Exercice interactif', 'Interactive exercise')}</small>
                  <strong>{t('Test de conjugaison', 'Conjugation test')}</strong>
                  <p>{t('28 verbes irréguliers essentiels — présent, imparfait, passé composé.',
                        '28 essential irregular verbs — present, imperfect and perfect tenses.')}</p>
                  <span className="ac-go">{t('Commencer →', 'Start →')}</span>
                </a>
                <a className="ac-rc ac-rc-nb" href="/les_nombres.html">
                  <div className="ac-chiffres">70 · 80 · 90</div>
                  <small>{t('Vocabulaire', 'Vocabulary')}</small>
                  <strong>{t('Les nombres', 'Numbers')}</strong>
                  <p>{t('De 1 à 1 milliard, avec le détail de 60 à 99 et deux exercices.',
                        'From 1 to a billion, with the tricky 60 to 99 explained, plus two exercises.')}</p>
                </a>
              </div>
            </div>
          </div>

          <div className="ac-commandes">
            {[t('Cours particuliers', 'One-to-one lessons'), t('Ressources gratuites', 'Free resources')].map((label, i) => (
              <button key={i} type="button" className={`ac-onglet${ecran === i ? ' actif' : ''}`} aria-pressed={ecran === i} onClick={() => aller(i)}>
                <span>{label}</span>
                <i>
                  {ecran === i && (
                    <b key={tour} style={{ animationDuration: `${DUREE_ECRAN}ms` }}
                      onAnimationEnd={(e) => { if (e.animationName === 'ac-remplir') aller(ecran + 1); }} />
                  )}
                </i>
              </button>
            ))}
            <button type="button" className="ac-pause" onClick={() => setPauseManuelle(!pauseManuelle)}
              aria-label={pauseManuelle ? t('Reprendre le défilement', 'Resume the slideshow') : t('Mettre le défilement en pause', 'Pause the slideshow')}>
              {pauseManuelle ? '▶' : '❚❚'}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- comment ça se passe ---------- */}
      <section className="ac-section ac-alt">
        <div className="ac-wrap">
          <div className="ac-tete">
            <div className="ac-over">{t('Comment ça se passe', 'How it works')}</div>
            <h2>{t('Trois étapes, sans engagement de durée.', 'Three steps, with no long-term commitment.')}</h2>
          </div>
          <div className="ac-etapes">
            <div className="ac-etape">
              <h3>{t('Vous me dites où vous en êtes', 'You tell me where you are')}</h3>
              <p>{t('Par le formulaire ou via Preply : votre niveau estimé, vos objectifs, vos disponibilités et votre fuseau horaire.',
                    'Through the form or via Preply: your estimated level, your goals, your availability and your time zone.')}</p>
            </div>
            <div className="ac-etape">
              <h3>{t('On fixe un créneau', 'We set a time')}</h3>
              <p>{t("Un ou plusieurs rendez-vous par semaine, à l'horaire qui vous arrange, affiché dans votre fuseau. Les créneaux libres sont visibles en ligne.",
                    'One or more sessions a week, at a time that suits you, shown in your own time zone. Available slots are listed online.')}</p>
            </div>
            <div className="ac-etape">
              <h3>{t('On travaille, et vous gardez la main', 'We work, and you stay in control')}</h3>
              <p>{t('Chaque séance est construite sur vos objectifs du moment. Entre les cours, les ressources du site prolongent le travail.',
                    "Each session is built on your current goals. Between lessons, the site's resources carry the work on.")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- formats et tarif ---------- */}
      <section className="ac-section">
        <div className="ac-wrap">
          <div className="ac-tete">
            <div className="ac-over">{t('Formats et tarif', 'Formats and rate')}</div>
            <h2>{t('Deux durées, un tarif clair.', 'Two lengths, one clear rate.')}</h2>
            <p>{t('Les cours ont lieu en visioconférence, où que vous soyez. Le rythme et la durée se décident ensemble.',
                  'Lessons take place by video call, wherever you are. Pace and length are decided together.')}</p>
          </div>
          <div className="ac-offre">
            <div className="ac-format">
              <div className="ac-duree">25 min</div>
              <p>{t('Un format court, qui se glisse dans un emploi du temps chargé et se prête bien à une pratique fréquente.',
                    'A short format that fits into a busy schedule and lends itself to frequent practice.')}</p>
            </div>
            <div className="ac-format">
              <div className="ac-duree">50 min</div>
              <p>{t("Le format complet : le temps d'aborder un point de grammaire, de le pratiquer à l'oral et de faire le point.",
                    'The full format: time to cover a grammar point, practise it aloud and take stock.')}</p>
            </div>
            <div className="ac-tarif">
              <div className="ac-label">{t('Tarif', 'Rate')}</div>
              <div className="ac-montant">$38 <span>/ 50 min</span></div>
              <p>{t('En contact direct, sans frais de plateforme. Les cours réservés via Preply suivent la tarification de Preply, frais de service inclus.',
                    "Booking directly, with no platform fees. Lessons booked through Preply follow Preply's own pricing, service fees included.")}</p>
              <a href="/reserver.html" className="ac-btn ac-rouge">{t('Réserver un cours →', 'Book a lesson →')}</a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- avis ---------- */}
      <section className="ac-section ac-alt">
        <div className="ac-wrap">
          <div className="ac-tete">
            <div className="ac-over">{t("Ce qu'en disent mes élèves", 'What my students say')}</div>
            <h2>{t('Des élèves qui restent.', 'Students who stay.')}</h2>
          </div>
          <div className="ac-avis">
            <figure>
              <blockquote>{t("Deux cours par semaine depuis deux ans et demi, et toujours pas envie d'arrêter. Alban sait relancer une conversation, poser les bonnes questions, et transformer un échange ordinaire en leçon.",
                             'Two lessons a week for two and a half years, and still no wish to stop. Alban knows how to keep a conversation going, ask the right questions, and turn an ordinary exchange into a lesson.')}</blockquote>
              <figcaption>Omri<span>{t('plus de 200 cours', '200+ lessons')}</span></figcaption>
            </figure>
            <figure>
              <blockquote>{t('Plus de deux ans de cours ensemble. Il est attentif, patient, et il a nettement accéléré mon apprentissage.',
                             'More than two years of lessons together. He is attentive, patient, and he has clearly sped up my learning.')}</blockquote>
              <figcaption>Ola<span>{t('plus de 150 cours', '150+ lessons')}</span></figcaption>
            </figure>
            <figure>
              <blockquote>{t('Un professeur fiable et bienveillant, d’une grande patience avec ma fille adolescente. Nous sommes très contents des progrès.',
                             'A reliable and kind teacher, extremely patient with my teenage daughter. We are very happy with her progress.')}</blockquote>
              <figcaption>Susanne<span>{t('39 cours', '39 lessons')}</span></figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ---------- niveaux ---------- */}
      <section className="ac-section">
        <div className="ac-wrap">
          <div className="ac-tete">
            <div className="ac-over">{t('Pour tous les niveaux', 'For every level')}</div>
            <h2>{t('Du premier mot à la nuance.', 'From first words to fine nuance.')}</h2>
            <p>{t('Si vous hésitez, on détermine votre niveau ensemble au premier cours.',
                  'If you are unsure, we work out your level together in the first lesson.')}</p>
          </div>
          <div className="ac-niveaux">
            {[
              { img: 'oeuf', fr: 'Débutant complet', en: 'Complete beginner', code: 'A0',
                dfr: 'Vous partez de zéro : premiers mots, premières phrases, prononciation.', den: 'Starting from scratch: first words, first sentences, pronunciation.' },
              { img: 'poussin', fr: 'Faux débutant', en: 'Elementary', code: 'A1 – A2',
                dfr: "Vous connaissez les bases : il s'agit maintenant de construire des phrases justes.", den: "You know the basics — now it's about building correct sentences." },
              { img: 'coquelet', fr: 'Intermédiaire', en: 'Intermediate', code: 'B1 – B2',
                dfr: 'Vous vous exprimez sans difficulté majeure et cherchez à gagner en précision.', den: 'You speak without major difficulty and want to gain precision.' },
              { img: 'coq-drapeau', fr: 'Avancé', en: 'Advanced', code: 'C1+',
                dfr: 'Vous visez la nuance, le registre et le français réellement parlé.', den: "You're after nuance, register and the French people actually speak." },
            ].map((n) => (
              <div key={n.img} className="ac-niveau">
                <img src={`/img/niveaux/${n.img}.png`} alt="" />
                <h3>{t(n.fr, n.en)}</h3>
                <div className="ac-code">{n.code}</div>
                <p>{t(n.dfr, n.den)}</p>
              </div>
            ))}
          </div>
          <a href="/cours.html" className="ac-plus">{t('Voir le programme des cours →', 'See the course outline →')}</a>
        </div>
      </section>

      {/* ---------- appel final ---------- */}
      <div className="ac-final">
        <div className="ac-wrap">
          <div>
            <h2>{t('On commence par discuter de vos objectifs ?', 'Shall we start by talking about your goals?')}</h2>
            <p>{t('Un vrai professeur en face de vous, pas une application.', 'A real teacher in front of you, not an app.')}</p>
          </div>
          <a href="/reserver.html" className="ac-btn ac-rouge">{t('Réserver un cours →', 'Book a lesson →')}</a>
        </div>
      </div>

      <footer className="ac-pied">
        <div className="ac-wrap">
          <span className="ac-logo">French with <b>Alban</b></span>
          <span>
            © 2026 · frenchwithalban.com · <a href={DON} target="_blank" rel="noopener">{t('Soutenir le site', 'Support the site')}</a>
            {' · '}<a href="/mentions-legales.html">{t('Mentions légales', 'Legal notice')}</a>
            {' · '}<a href="/confidentialite.html">{t('Confidentialité', 'Privacy')}</a>
          </span>
        </div>
      </footer>

      {/* ---------- barre de réservation (mobile) ---------- */}
      <div className="ac-barre-mobile">
        <div>{t('Cours de 50 min', '50-minute lesson')}<strong>$38</strong></div>
        <a href="/reserver.html" className="ac-btn ac-rouge">{t('Réserver', 'Book')}</a>
      </div>
    </div>
  );
}

/* ======================= styles ======================= */

const CSS = `
html:has(.accueil),body:has(.accueil){background:#faf7f2}
.accueil{
  --cream:#faf7f2;--cream-dark:#f0ebe2;--navy:#0d2b45;--red:#c0392b;--gold:#c9972a;
  --border:#e2dbcf;--text:#34414e;--muted:#5b6672;
  --serif:'Fraunces',Georgia,serif;--sans:'Inter',system-ui,sans-serif;
  background:var(--cream);color:var(--navy);font-family:var(--sans);font-size:17px;line-height:1.6;color-scheme:light;
}
/* réglages de base sans poids (:where) : les couleurs et marges propres à chaque bloc l'emportent toujours */
:where(.accueil) *{box-sizing:border-box}
:where(.accueil) img{max-width:100%;display:block}
:where(.accueil) a{color:inherit;text-decoration:none}
:where(.accueil) :is(h1,h2,h3,p,figure,blockquote){margin:0}
.ac-wrap{max-width:1180px;margin:0 auto;padding:0 40px}

/* ---------- en-tête ---------- */
.ac-entete{position:sticky;top:0;z-index:40;background:rgba(250,247,242,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.ac-barre{display:flex;align-items:center;gap:28px;height:76px}
.ac-logo{display:flex;align-items:center;gap:10px;font-family:var(--serif);font-weight:700;font-size:1.45rem;letter-spacing:-.01em;margin-right:auto;white-space:nowrap}
.ac-logo b{color:var(--red);font-weight:700}
.ac-nav{display:flex;gap:30px;font-size:.95rem;font-weight:500}
.ac-nav a{color:var(--muted)}
.ac-nav a:hover{color:var(--navy)}
.ac-langue{display:flex;border:1.5px solid var(--border);border-radius:99px;overflow:hidden}
.ac-langue button{border:none;background:none;padding:5px 11px;font:600 .78rem var(--sans);color:var(--muted);cursor:pointer}
.ac-langue button.on{background:var(--navy);color:#fff}
.ac-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:600;font-size:.95rem;padding:13px 24px;border-radius:6px;transition:transform .15s;white-space:nowrap}
.ac-btn:hover{transform:translateY(-1px)}
.ac-rouge{background:var(--red);color:#fff !important;box-shadow:3px 3px 0 var(--navy)}
.ac-navy{background:var(--navy);color:#fff !important;box-shadow:3px 3px 0 var(--gold)}
.ac-ligne{color:var(--navy);border:1.5px solid var(--navy)}
.ac-burger{display:none;width:40px;height:40px;border:1.5px solid var(--border);border-radius:8px;background:none;cursor:pointer;place-items:center}
.ac-burger i{display:block;width:18px;height:2px;background:var(--navy);box-shadow:0 -6px 0 var(--navy),0 6px 0 var(--navy)}
.ac-menu{display:none}
.accueil :focus-visible{outline:3px solid var(--gold);outline-offset:3px}

/* ---------- carrousel ---------- */
.ac-hero{padding:36px 0 40px}
.ac-diapos{display:grid}
.ac-diapo{grid-area:1/1;display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center;
  opacity:0;visibility:hidden;translate:0 14px;transition:opacity .6s ease,translate .6s ease,visibility 0s linear .6s}
.ac-diapo.actif{opacity:1;visibility:visible;translate:0 0;transition:opacity .6s ease,translate .6s ease}
.ac-over{font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--red);display:flex;align-items:center;gap:12px;margin-bottom:22px}
.ac-over::before{content:"";width:28px;height:2px;background:var(--red)}
.ac-titre{font-family:var(--serif);font-weight:600;font-size:4.2rem;line-height:1.02;letter-spacing:-.025em;margin-bottom:24px !important}
.ac-titre em{font-style:normal;color:var(--red)}
.ac-lead{font-size:1.2rem;color:var(--text);max-width:500px;margin-bottom:34px !important}
.ac-actions{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:40px}
.ac-preuves{display:flex;gap:34px;padding-top:26px;border-top:1px solid var(--border)}
.ac-preuves div{font-size:.85rem;color:var(--muted);line-height:1.35}
.ac-preuves strong{display:block;font-family:var(--serif);font-size:1.75rem;font-weight:600;color:var(--navy)}

.ac-portrait{position:relative;justify-self:end;width:100%;max-width:470px}
.ac-portrait img{width:100%;aspect-ratio:4/5;object-fit:cover;object-position:center 30%;border-radius:10px;box-shadow:14px 14px 0 var(--gold)}
.ac-carte-avis{position:absolute;left:-56px;bottom:38px;width:300px;background:#fff;border-radius:10px;padding:20px 22px;box-shadow:0 18px 40px rgba(13,43,69,.16)}
.ac-etiquette{color:var(--gold);letter-spacing:.14em;text-transform:uppercase;font-size:.68rem;font-weight:600;margin-bottom:8px}
.ac-carte-avis p{font-size:.95rem;line-height:1.5;color:var(--text);margin-bottom:10px}
.ac-carte-avis small{font-size:.8rem;font-weight:600}
.ac-carte-prix{position:absolute;right:-18px;top:30px;background:var(--navy);color:#fff;border-radius:10px;padding:14px 18px;text-align:center;box-shadow:0 12px 28px rgba(13,43,69,.25)}
.ac-carte-prix strong{display:block;font-family:var(--serif);font-size:1.9rem;line-height:1}
.ac-carte-prix span{font-size:.78rem;opacity:.8}

.ac-collage{position:relative;height:650px;width:100%;max-width:500px;justify-self:end}
.ac-rc{position:absolute;display:block;border-radius:10px;padding:20px 22px;box-shadow:0 18px 40px rgba(13,43,69,.15);transition:rotate .25s,scale .25s}
.ac-rc:hover{rotate:0deg;scale:1.02;z-index:5}
.ac-rc small{display:block;font-size:.68rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
.ac-rc strong{display:block;font-family:var(--serif);font-size:1.35rem;font-weight:600;line-height:1.2}
.ac-rc p{font-size:.9rem;line-height:1.45;margin-top:6px}
.ac-rc-adj{left:0;top:0;width:330px;background:#fff;rotate:-3deg;z-index:2}
.ac-paire{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:14px}
.ac-paire img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:6px;border:2px solid var(--navy)}
.ac-paire figure{text-align:center}
.ac-paire figcaption{font-family:var(--serif);font-size:1.05rem;font-weight:600;margin-top:6px}
.ac-paire span{font-family:var(--serif);font-size:1.6rem;color:var(--gold);margin-bottom:26px}
.ac-rc-conj{right:0;top:270px;width:300px;background:var(--navy);color:#fff;rotate:3deg;z-index:3}
.ac-rc-conj p{color:rgba(255,255,255,.8)}
.ac-go{display:inline-block;margin-top:14px;background:var(--red);padding:8px 16px;border-radius:5px;font-size:.85rem;font-weight:600;box-shadow:3px 3px 0 var(--gold)}
.ac-rc-nb{left:10px;bottom:0;width:310px;background:var(--cream-dark);border:1px solid var(--border);rotate:-1.5deg;z-index:1}
.ac-rc-nb p{color:var(--text)}
.ac-chiffres{font-family:var(--serif);font-size:2.1rem;font-weight:600;color:var(--red);line-height:1;margin-bottom:8px;letter-spacing:.02em}

@keyframes ac-entree{from{opacity:0;translate:0 26px}to{opacity:1;translate:0 0}}
.ac-diapo.actif .ac-portrait,.ac-diapo.actif .ac-rc{animation:ac-entree .8s cubic-bezier(.2,.7,.2,1) both}
.ac-diapo.actif .ac-rc-conj{animation-delay:.12s}
.ac-diapo.actif .ac-rc-nb{animation-delay:.24s}

.ac-commandes{display:flex;gap:28px;align-items:center;margin-top:28px}
.ac-onglet{flex:0 1 260px;background:none;border:none;text-align:left;font:600 .92rem var(--sans);color:var(--muted);cursor:pointer;padding:6px 0}
.ac-onglet:hover,.ac-onglet.actif{color:var(--navy)}
.ac-onglet i{display:block;height:3px;background:var(--border);margin-top:10px;border-radius:2px;overflow:hidden}
.ac-onglet b{display:block;height:100%;width:0;background:var(--red);animation:ac-remplir linear forwards}
.en-pause .ac-onglet b{animation-play-state:paused}
@keyframes ac-remplir{from{width:0}to{width:100%}}
.ac-pause{margin-left:auto;width:42px;height:42px;flex:none;border-radius:50%;border:1.5px solid var(--border);background:#fff;color:var(--navy);font-size:.8rem;cursor:pointer;display:grid;place-items:center}
.ac-pause:hover{border-color:var(--navy)}

@media (prefers-reduced-motion:reduce){
  .ac-diapo,.ac-diapo.actif{transition:none;translate:none}
  .ac-diapo.actif .ac-portrait,.ac-diapo.actif .ac-rc{animation:none}
}

/* ---------- sections ---------- */
.ac-section{padding:96px 0}
.ac-alt{background:#fff;border-block:1px solid var(--border)}
.ac-tete{max-width:640px;margin-bottom:48px}
.ac-tete .ac-over{margin-bottom:14px}
.accueil h2{font-family:var(--serif);font-weight:600;font-size:2.6rem;line-height:1.1;letter-spacing:-.02em;margin-bottom:14px}
.ac-tete p{font-size:1.1rem;color:var(--text)}

.ac-etapes{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;counter-reset:etape}
.ac-etape{padding-top:22px;border-top:3px solid var(--navy)}
.ac-etape::before{counter-increment:etape;content:counter(etape);font-family:var(--serif);font-size:2.4rem;color:var(--gold);line-height:1;display:block;margin-bottom:12px}
.ac-etape h3{font-size:1.15rem;font-weight:600;margin-bottom:8px}
.ac-etape p{color:var(--text);font-size:1rem}

.ac-offre{display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:20px;align-items:stretch}
.ac-format{background:var(--cream);border:1px solid var(--border);border-radius:10px;padding:30px}
.ac-duree{font-family:var(--serif);font-size:2.4rem;font-weight:600;line-height:1;margin-bottom:12px}
.ac-format p{color:var(--text);font-size:1rem}
.ac-tarif{background:var(--navy);color:#fff;border-radius:10px;padding:32px;display:flex;flex-direction:column;gap:14px}
.ac-label{font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);font-weight:600}
.ac-montant{font-family:var(--serif);font-size:3.6rem;font-weight:600;line-height:1}
.ac-montant span{font-family:var(--sans);font-size:1rem;font-weight:400;opacity:.75}
.ac-tarif p{font-size:.95rem;color:rgba(255,255,255,.78)}
.ac-tarif .ac-btn{align-self:flex-start;margin-top:auto}

.ac-avis{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:20px}
.ac-avis figure{background:#fff;border:1px solid var(--border);border-radius:10px;padding:30px;display:flex;flex-direction:column;gap:18px}
.ac-avis figure:first-child{background:var(--navy);color:#fff;border:none}
.ac-avis figure:first-child blockquote{color:#fff;font-size:1.3rem}
.ac-avis blockquote{font-family:var(--serif);font-size:1.12rem;line-height:1.45;color:var(--navy)}
.ac-avis blockquote::before{content:"«\\00a0"}
.ac-avis blockquote::after{content:"\\00a0»"}
.accueil[lang="en"] .ac-avis blockquote::before{content:"“"}
.accueil[lang="en"] .ac-avis blockquote::after{content:"”"}
.ac-avis figcaption{margin-top:auto;font-size:.88rem;font-weight:600}
.ac-avis figcaption span{display:block;font-weight:400;opacity:.7}

.ac-niveaux{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.ac-niveau{background:var(--cream);border:1px solid var(--border);border-radius:10px;padding:26px 22px;text-align:center}
.ac-niveau img{width:64px;height:64px;object-fit:contain;margin:0 auto 12px}
.ac-niveau h3{font-family:var(--serif);font-size:1.2rem;font-weight:600}
.ac-code{font-size:.75rem;font-weight:600;letter-spacing:.12em;color:var(--gold);margin:2px 0 10px}
.ac-niveau p{font-size:.95rem;color:var(--text)}
.ac-plus{margin-top:32px;font-weight:600;border-bottom:2px solid var(--gold);display:inline-block}

.ac-final{background:var(--navy);color:#fff;padding:84px 0}
.ac-final .ac-wrap{display:flex;align-items:center;justify-content:space-between;gap:40px}
.ac-final h2{color:#fff;margin:0 !important;max-width:620px}
.ac-final p{color:rgba(255,255,255,.75);margin-top:10px}
.ac-pied{background:var(--navy);border-top:1px solid rgba(255,255,255,.12);color:rgba(255,255,255,.6);font-size:.85rem;padding:26px 0}
.ac-pied .ac-wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
.ac-pied .ac-logo{font-size:1.05rem;color:#fff;margin:0}
.ac-pied .ac-logo b{color:#fff}
.ac-pied a{color:rgba(255,255,255,.85);text-decoration:underline;text-underline-offset:3px}
.ac-barre-mobile{display:none}

/* ---------- tablette et mobile ---------- */
@media (max-width:1060px){
  .ac-nav{gap:20px}
  .ac-barre{gap:18px}
  .ac-titre{font-size:3.4rem}
  .ac-diapo{gap:40px}
  .ac-carte-avis{left:-24px}
}
@media (max-width:900px){
  .accueil{font-size:16px}
  .ac-wrap{padding:0 20px}
  .ac-barre{height:64px;gap:12px}
  .ac-logo{font-size:1.12rem}
  .ac-logo svg{width:22px;height:26px}
  .ac-nav,.ac-btn-entete{display:none}
  .ac-burger{display:grid}
  .ac-menu:not([hidden]){display:grid;gap:4px;padding:8px 20px 18px;border-top:1px solid var(--border);background:var(--cream)}
  .ac-menu a{padding:10px 0;font-weight:500;border-bottom:1px solid var(--border)}
  .ac-menu .ac-btn{margin-top:10px;border-bottom:none;padding:13px 24px}
  .ac-hero{padding:22px 0 36px}
  .ac-hero-wrap{display:flex;flex-direction:column}
  .ac-commandes{order:-1;gap:16px;margin:0 0 22px}
  .ac-onglet{flex:1;font-size:.82rem}
  .ac-diapo{grid-template-columns:1fr;gap:36px;align-self:start}
  .ac-titre{font-size:2.8rem}
  .ac-lead{font-size:1.08rem}
  .ac-actions{flex-direction:column}
  .ac-preuves{gap:18px;justify-content:space-between}
  .ac-preuves strong{font-size:1.4rem}
  .ac-portrait{justify-self:center;max-width:340px;order:-1}
  .ac-portrait img{aspect-ratio:5/4;box-shadow:8px 8px 0 var(--gold)}
  .ac-carte-avis{position:relative;left:auto;bottom:auto;width:auto;margin:-40px 16px 0}
  .ac-carte-prix{right:-6px;top:14px;padding:10px 14px}
  .ac-carte-prix strong{font-size:1.5rem}
  .ac-collage{order:-1;height:auto;max-width:360px;justify-self:center;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
  .ac-rc{position:relative;inset:auto;width:auto;rotate:none;padding:14px}
  .ac-rc-adj{grid-column:1/-1}
  .ac-paire{margin-bottom:10px}
  .ac-paire figcaption{font-size:.95rem}
  .ac-paire span{margin-bottom:22px}
  .ac-rc strong{font-size:1.05rem}
  .ac-rc p{font-size:.8rem}
  .ac-go{margin-top:10px;padding:6px 12px;font-size:.78rem}
  .ac-chiffres{font-size:1.5rem}
  .ac-section{padding:64px 0}
  .accueil h2{font-size:2rem}
  .ac-etapes,.ac-offre,.ac-avis{grid-template-columns:1fr}
  .ac-niveaux{grid-template-columns:1fr 1fr;gap:12px}
  .ac-niveau{padding:20px 14px}
  .ac-final .ac-wrap{flex-direction:column;align-items:flex-start}
  .ac-barre-mobile{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;background:#fff;border-top:1px solid var(--border);padding:10px 16px;align-items:center;gap:12px;box-shadow:0 -6px 20px rgba(13,43,69,.08)}
  .ac-barre-mobile div{font-size:.8rem;color:var(--muted);line-height:1.2;margin-right:auto}
  .ac-barre-mobile strong{display:block;font-family:var(--serif);font-size:1.3rem;color:var(--navy)}
  .ac-pied{padding-bottom:90px}
}
@media (max-width:370px){
  .ac-titre{font-size:2.35rem}
  .ac-preuves{gap:10px}
  .ac-preuves strong{font-size:1.2rem}
  .ac-langue button{padding:5px 8px}
}
`;
