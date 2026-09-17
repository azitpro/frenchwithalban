'use client';

import { useEffect, useState } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

type Lang = 'fr' | 'en';

const DUREE_ECRAN = 9000; // durée d'affichage de chaque écran du carrousel, en millisecondes
const NB_ECRANS = 2;
const DON = 'https://donate.stripe.com/cNidR2aQf8ehaKvbCv4gg00';

/** Hexagone tricolore du logo : bandes découpées à la main (sans clipPath), rendu identique aux pages statiques. */
function HexDrapeau({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 28" aria-hidden="true" focusable="false">
      <polygon points="1,7 8,3.18 8,24.82 1,21" fill="#002395" />
      <polygon points="8,3.18 12,1 16,3.18 16,24.82 12,27 8,24.82" fill="#ffffff" />
      <polygon points="16,3.18 23,7 23,21 16,24.82" fill="#ED2939" />
      <polygon points="12,1 23,7 23,21 12,27 1,21 1,7" fill="none" stroke="#1b1340" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

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
    <div className="accueil suite-sections" lang={lang}>
      <style precedence="default" href="accueil-styles">{CSS}</style>

      {/* ---------- en-tête (identique aux pages acidulées) ---------- */}
      <header className="ac-entete">
        <div className="ac-wrap ac-barre">
          <a href="/" className="ac-logo">
            <HexDrapeau className="logo-hex" />
            <span className="logo-pile"><small>French with</small> <span className="logo-nom">Alban</span></span>
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
                <div className="ac-preuves suite">
                  <div><strong>{t('3 700+', '3,700+')}</strong>{t('cours donnés', 'lessons taught')}</div>
                  <div><strong>15+</strong>{t('nationalités', 'nationalities')}</div>
                  <div><strong>A1→C2</strong>{t('tous niveaux', 'all levels')}</div>
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
                <div className="ac-preuves suite">
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

      {/* ---------- comment ça se passe (de vraies étapes : numérotées) ---------- */}
      <section className="ac-section ac-alt">
        <div className="ac-wrap">
          <div className="ac-tete">
            <div className="ac-over">{t('Comment ça se passe', 'How it works')}</div>
            <h2>{t('Trois étapes, sans engagement de durée.', 'Three steps, with no long-term commitment.')}</h2>
          </div>
          <div className="ac-etapes suite">
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
          <div className="ac-offre suite">
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
          <div className="ac-avis suite">
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

      {/* ---------- niveaux (mêmes couleurs que la page Ressources) ---------- */}
      <section className="ac-section">
        <div className="ac-wrap">
          <div className="ac-tete">
            <div className="ac-over">{t('Pour tous les niveaux', 'For every level')}</div>
            <h2>{t('Du premier mot à la nuance.', 'From first words to fine nuance.')}</h2>
            <p>{t('Si vous hésitez, on détermine votre niveau ensemble au premier cours.',
                  'If you are unsure, we work out your level together in the first lesson.')}</p>
          </div>
          <div className="ac-niveaux suite">
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
          <div className="ac-final-carte">
            <HexDrapeau className="ac-final-hex" />
            <div>
              <h2>{t('On commence par discuter de vos objectifs ?','Shall we start by talking about your goals?')}</h2>
              <p>{t('Un vrai professeur en face de vous, pas une application.', 'A real teacher in front of you, not an app.')}</p>
            </div>
            <a href="/reserver.html" className="ac-btn ac-rouge">{t('Réserver un cours →', 'Book a lesson →')}</a>
          </div>
        </div>
      </div>

      {/* pied de page : charte du site, comme sur les pages statiques */}
      <footer className="ac-pied">
        <div className="ac-pied-wrap">
          <div className="ac-pied-marque">
            <HexDrapeau className="ac-pied-hex" />
            <div>
              <span className="ac-pied-nom">French with <b>Alban</b></span>
              <p className="ac-pied-slogan">{t('Cours de français en ligne, du débutant complet au niveau avancé.', 'French lessons online, from complete beginner to advanced.')}</p>
            </div>
          </div>
          <nav className="ac-pied-liens" aria-label={t('Pied de page', 'Footer')}>
            <a href="/cours.html">{t('Cours', 'Lessons')}</a>
            <a href="/planning_public.html">{t('Créneaux', 'Availability')}</a>
            <a href="/ressources.html">{t('Ressources', 'Resources')}</a>
            <a href="/apropos.html">{t('À propos', 'About')}</a>
            <a href={DON} target="_blank" rel="noopener">{t('Soutenir le site', 'Support the site')}</a>
          </nav>
          <div className="ac-pied-actions">
            <a href="/signaler.html" className="ac-pied-signaler">{t('Signaler un problème', 'Report a problem')}</a>
            <div className="ac-pied-legal">
              <a href="/mentions-legales.html">{t('Mentions légales', 'Legal notice')}</a>
              <a href="/confidentialite.html">{t('Confidentialité', 'Privacy')}</a>
            </div>
          </div>
        </div>
        <div className="ac-pied-bas">© 2026 · frenchwithalban.com</div>
      </footer>

      {/* ---------- barre de réservation (mobile) ---------- */}
      <div className="ac-barre-mobile">
        <div>{t('Cours de 50 min', '50-minute lesson')}<strong>$38</strong></div>
        <a href="/reserver.html" className="ac-btn ac-rouge">{t('Réserver', 'Book')}</a>
      </div>
    </div>
  );
}

/* ======================= styles (style acidulé du site) ======================= */

const CSS = `
html:has(.accueil),body:has(.accueil){background:#fff7ee}
.accueil{
  /* charte du site (pied de page) */
  --cream:#faf7f2;--navy:#0d2b45;--gold:#c9972a;
  /* style acidulé */
  --ink:#1b1340;--soft:#564f70;--bg:#fff7ee;
  --lime:#c8f560;--pink:#ff5fa2;--orange:#ff8a3d;--lemon:#ffe45c;--aqua:#3ee0c6;--violet:#7c5cff;
  --titre:'Bricolage Grotesque',system-ui,sans-serif;--sans:'Inter',system-ui,sans-serif;
  --radius:18px;--shadow:5px 5px 0 var(--ink);
  background:var(--bg);color:var(--ink);font-family:var(--sans);font-size:17px;line-height:1.6;color-scheme:light;overflow-x:clip;
}
/* réglages de base sans poids (:where) : les couleurs et marges propres à chaque bloc l'emportent toujours */
:where(.accueil) *{box-sizing:border-box}
:where(.accueil) img{max-width:100%;display:block}
:where(.accueil) a{color:inherit;text-decoration:none}
:where(.accueil) :is(h1,h2,h3,p,figure,blockquote){margin:0}
.accueil :focus-visible{outline:3px solid var(--violet);outline-offset:3px}

/* ---------- ORDRE OFFICIEL DES COULEURS ----------
   1 citron vert · 2 rose · 3 turquoise · 4 jaune · 5 orange · 6 violet, puis on recommence.
   « .suite » : les enfants directs suivent cet ordre ; « .suite-sections » : ses <section> le suivent.
   Chaque rang définit --c (fond) et --c-texte (texte lisible dessus). Ne pas attribuer de couleur à la main. */
.accueil .suite > :nth-child(6n+1),.suite-sections > section:nth-of-type(6n+1){--c:var(--lime);--c-texte:var(--ink)}
.accueil .suite > :nth-child(6n+2),.suite-sections > section:nth-of-type(6n+2){--c:var(--pink);--c-texte:#fff}
.accueil .suite > :nth-child(6n+3),.suite-sections > section:nth-of-type(6n+3){--c:var(--aqua);--c-texte:var(--ink)}
.accueil .suite > :nth-child(6n+4),.suite-sections > section:nth-of-type(6n+4){--c:var(--lemon);--c-texte:var(--ink)}
.accueil .suite > :nth-child(6n+5),.suite-sections > section:nth-of-type(6n+5){--c:var(--orange);--c-texte:#fff}
.accueil .suite > :nth-child(6n),.suite-sections > section:nth-of-type(6n){--c:var(--violet);--c-texte:#fff}

.ac-wrap{max-width:1180px;margin:0 auto;padding:0 40px}

/* ---------- en-tête acidulé (mêmes règles que les pages statiques) ---------- */
.ac-entete{position:sticky;top:0;z-index:40;color:var(--ink);background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-bottom:3px solid var(--ink);line-height:1.6}
.ac-barre{display:flex;align-items:center;gap:22px;height:76px}
.ac-logo{display:flex;align-items:center;gap:.28em;margin-right:auto;white-space:nowrap;color:var(--ink);font-size:26px;line-height:1}
.logo-hex{width:1.3em;height:1.53em;flex:none;rotate:-12deg;filter:drop-shadow(.07em .1em 0 var(--ink));overflow:visible}
.logo-pile{display:flex;flex-direction:column;align-items:flex-start;gap:.12em}
.logo-pile small{font-family:var(--sans);font-weight:700;font-size:max(8.5px,.36em);letter-spacing:.16em;text-transform:uppercase;color:var(--soft);padding-left:.15em}
.logo-nom{display:inline-block;font-family:var(--titre);font-weight:800;letter-spacing:-.03em;color:var(--ink);background:var(--lime);border:.065em solid var(--ink);border-radius:.2em;padding:0 .16em .04em;box-shadow:.07em .07em 0 var(--ink);rotate:-2deg}
.ac-nav{display:flex;gap:6px;font-size:.95rem;font-weight:600}
.ac-nav a{color:var(--ink);padding:6px 14px;border-radius:99px;border:2px solid transparent;transition:background .15s,border-color .15s}
.ac-nav a:hover{background:var(--lemon);border-color:var(--ink)}
.ac-langue{display:flex;gap:2px;padding:2px;border:2.5px solid var(--ink);border-radius:99px;background:#fff;box-shadow:2px 2px 0 var(--ink)}
.ac-langue button{border:none;background:none;padding:3px 10px;border-radius:99px;font:700 .78rem var(--sans);color:var(--ink);cursor:pointer}
.ac-langue button.on{background:var(--ink);color:#fff}
.ac-burger{display:none;width:42px;height:42px;border:2.5px solid var(--ink);border-radius:12px;background:#fff;box-shadow:2px 2px 0 var(--ink);cursor:pointer;place-items:center}
.ac-burger i{display:block;width:18px;height:2.5px;border-radius:2px;background:var(--ink);box-shadow:0 -6px 0 var(--ink),0 6px 0 var(--ink)}
.ac-menu{display:none}
.ac-burger,.ac-langue{flex:none}

/* ---------- boutons ---------- */
.ac-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:.95rem;padding:10px 22px;border-radius:99px;white-space:nowrap;border:2.5px solid var(--ink);transition:translate .15s,box-shadow .15s}
.ac-btn:hover{translate:-1px -1px}
.ac-rouge{background:var(--pink);color:#fff !important;box-shadow:3px 3px 0 var(--ink)}
.ac-rouge:hover{box-shadow:4px 4px 0 var(--ink)}
.ac-navy{background:var(--ink);color:#fff !important;box-shadow:3px 3px 0 var(--pink)}
.ac-navy:hover{box-shadow:4px 4px 0 var(--pink)}
.ac-ligne{background:#fff;color:var(--ink);box-shadow:3px 3px 0 var(--ink)}
.ac-ligne:hover{background:var(--lemon);box-shadow:4px 4px 0 var(--ink)}

/* ---------- pastille de sur-titre ---------- */
.ac-over{display:inline-block;padding:4px 14px;border:2.5px solid var(--ink);border-radius:99px;background:var(--c,#fff);color:var(--c-texte,var(--ink));
  font-weight:700;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;box-shadow:2px 2px 0 var(--ink);rotate:-2deg;margin-bottom:22px}
.ac-hero .ac-over{--c:var(--ink);--c-texte:#fff}

/* ---------- carrousel ---------- */
.ac-hero{padding:40px 0 44px;
  background:radial-gradient(circle at 4% 6%,rgba(200,245,96,.55) 0,transparent 26%),radial-gradient(circle at 96% 18%,rgba(255,95,162,.24) 0,transparent 24%),radial-gradient(circle at 60% 100%,rgba(62,224,198,.2) 0,transparent 26%)}
.ac-diapos{display:grid}
.ac-diapo{grid-area:1/1;display:grid;grid-template-columns:1.05fr .95fr;gap:64px;align-items:center;
  opacity:0;visibility:hidden;translate:0 14px;transition:opacity .6s ease,translate .6s ease,visibility 0s linear .6s}
.ac-diapo.actif{opacity:1;visibility:visible;translate:0 0;transition:opacity .6s ease,translate .6s ease}
.ac-titre{font-family:var(--titre);font-weight:800;font-size:4.1rem;line-height:1.02;letter-spacing:-.035em;margin-bottom:24px !important}
.ac-titre em{font-style:normal;display:inline-block;background:var(--lime);border:.05em solid var(--ink);border-radius:.16em;padding:0 .12em .03em;box-shadow:.06em .06em 0 var(--ink);rotate:-2deg;line-height:1.08}
.ac-lead{font-size:1.2rem;color:var(--soft);max-width:520px;margin-bottom:32px !important}
.ac-actions{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:34px}
.ac-actions .ac-btn{padding:13px 26px;font-size:1rem}
.ac-preuves{display:flex;gap:14px;flex-wrap:wrap}
.ac-preuves div{background:var(--c);color:var(--c-texte);border:2.5px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);padding:8px 14px 9px;font-size:.78rem;font-weight:700;line-height:1.25}
.ac-preuves div:nth-child(odd){rotate:-1.5deg}
.ac-preuves div:nth-child(even){rotate:1.5deg}
.ac-preuves strong{display:block;font-family:var(--titre);font-size:1.6rem;font-weight:800;letter-spacing:-.02em;line-height:1.1}

.ac-portrait{position:relative;justify-self:end;width:100%;max-width:450px}
.ac-portrait img{width:100%;aspect-ratio:4/5;object-fit:cover;object-position:center 30%;border:3px solid var(--ink);border-radius:24px;box-shadow:10px 10px 0 var(--ink);rotate:2deg;background:#fff}
.ac-carte-avis{position:absolute;left:-56px;bottom:38px;width:300px;background:#fff;border:3px solid var(--ink);border-radius:18px;padding:16px 20px;box-shadow:5px 5px 0 var(--ink);rotate:-2deg}
.ac-etiquette{display:inline-block;background:var(--lemon);border:2px solid var(--ink);border-radius:99px;padding:1px 10px;font-size:.64rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.ac-carte-avis p{font-family:var(--titre);font-weight:600;font-size:1.02rem;line-height:1.4;margin-bottom:8px}
.ac-carte-avis small{font-size:.8rem;font-weight:700;color:var(--soft)}
.ac-carte-prix{position:absolute;right:-22px;top:22px;width:108px;height:108px;display:grid;place-content:center;text-align:center;background:var(--pink);color:#fff;border:3px solid var(--ink);border-radius:50%;box-shadow:4px 4px 0 var(--ink);rotate:10deg}
.ac-carte-prix strong{display:block;font-family:var(--titre);font-size:1.9rem;font-weight:800;line-height:1}
.ac-carte-prix span{font-size:.78rem;font-weight:700}

.ac-collage{position:relative;height:650px;width:100%;max-width:500px;justify-self:end}
.ac-rc{position:absolute;display:block;border:3px solid var(--ink);border-radius:18px;padding:18px 20px;box-shadow:5px 5px 0 var(--ink);transition:rotate .25s,scale .25s,box-shadow .25s}
.ac-rc:hover{rotate:0deg;scale:1.02;z-index:5;box-shadow:8px 8px 0 var(--ink)}
.ac-rc small{display:table;font-size:.64rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:1px 9px;border:2px solid var(--ink);border-radius:99px;background:var(--lemon);color:var(--ink);margin-bottom:8px}
.ac-rc strong{display:block;font-family:var(--titre);font-size:1.4rem;font-weight:800;line-height:1.15;letter-spacing:-.015em}
.ac-rc p{font-size:.9rem;line-height:1.45;margin-top:6px}
.ac-rc-adj{left:0;top:0;width:330px;background:#fff;rotate:-3deg;z-index:2}
.ac-paire{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;margin-bottom:14px}
.ac-paire img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;border:2.5px solid var(--ink)}
.ac-paire figure{text-align:center}
.ac-paire figcaption{font-family:var(--titre);font-size:1.1rem;font-weight:800;margin-top:6px}
.ac-paire span{font-family:var(--titre);font-size:1.8rem;font-weight:800;color:var(--pink);margin-bottom:26px}
.ac-rc-conj{right:0;top:270px;width:300px;background:var(--ink);color:#fff;rotate:3deg;z-index:3;box-shadow:6px 6px 0 var(--lime)}
.ac-rc-conj:hover{box-shadow:9px 9px 0 var(--lime)}
.ac-rc-conj small{background:var(--pink);color:#fff;border-color:#fff}
.ac-rc-conj p{color:rgba(255,255,255,.8)}
.ac-go{display:inline-block;margin-top:14px;background:var(--pink);color:#fff;padding:7px 16px;border:2.5px solid #fff;border-radius:99px;font-size:.85rem;font-weight:700}
.ac-rc-nb{left:10px;bottom:0;width:310px;background:var(--lemon);rotate:-1.5deg;z-index:1}
.ac-rc-nb small{background:#fff}
.ac-chiffres{font-family:var(--titre);font-size:2.3rem;font-weight:800;line-height:1;margin-bottom:10px;letter-spacing:-.01em}

@keyframes ac-entree{from{opacity:0;translate:0 26px}to{opacity:1;translate:0 0}}
.ac-diapo.actif .ac-portrait,.ac-diapo.actif .ac-rc{animation:ac-entree .8s cubic-bezier(.2,.7,.2,1) both}
.ac-diapo.actif .ac-rc-conj{animation-delay:.12s}
.ac-diapo.actif .ac-rc-nb{animation-delay:.24s}

.ac-commandes{display:flex;gap:28px;align-items:center;margin-top:30px}
.ac-onglet{flex:0 1 260px;background:none;border:none;text-align:left;font:700 .92rem var(--sans);color:var(--soft);cursor:pointer;padding:6px 0}
.ac-onglet:hover,.ac-onglet.actif{color:var(--ink)}
.ac-onglet i{display:block;height:12px;background:#fff;border:2.5px solid var(--ink);margin-top:8px;border-radius:99px;overflow:hidden}
.ac-onglet.actif i{box-shadow:2px 2px 0 var(--ink)}
.ac-onglet b{display:block;height:100%;width:0;background:var(--pink);animation:ac-remplir linear forwards}
.en-pause .ac-onglet b{animation-play-state:paused}
@keyframes ac-remplir{from{width:0}to{width:100%}}
.ac-pause{margin-left:auto;width:44px;height:44px;flex:none;border-radius:50%;border:2.5px solid var(--ink);background:#fff;color:var(--ink);box-shadow:2px 2px 0 var(--ink);font-size:.8rem;cursor:pointer;display:grid;place-items:center}
.ac-pause:hover{background:var(--lemon)}

@media (prefers-reduced-motion:reduce){
  .ac-diapo,.ac-diapo.actif{transition:none;translate:none}
  .ac-diapo.actif .ac-portrait,.ac-diapo.actif .ac-rc{animation:none}
  .ac-nav a,.ac-btn,.ac-rc{transition:none}
}

/* ---------- sections ---------- */
.ac-section{padding:88px 0}
.ac-alt{background:#fff;border-block:3px solid var(--ink)}
.ac-tete{max-width:680px;margin-bottom:44px}
.ac-tete .ac-over{margin-bottom:16px}
.accueil h2{font-family:var(--titre);font-weight:800;font-size:2.8rem;line-height:1.05;letter-spacing:-.025em;margin-bottom:14px}
.ac-tete p{font-size:1.1rem;color:var(--soft)}

.ac-etapes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;counter-reset:etape}
.ac-etape{background:var(--bg);border:3px solid var(--ink);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px 24px 26px}
.ac-etape::before{counter-increment:etape;content:counter(etape);display:grid;place-items:center;width:52px;height:52px;margin-bottom:14px;border:3px solid var(--ink);border-radius:50%;
  background:var(--c);color:var(--c-texte);font-family:var(--titre);font-weight:800;font-size:1.6rem;line-height:1;box-shadow:3px 3px 0 var(--ink);rotate:-6deg}
.ac-etape h3{font-family:var(--titre);font-size:1.3rem;font-weight:800;line-height:1.2;margin-bottom:8px}
.ac-etape p{color:var(--soft);font-size:1rem}

.ac-offre{display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:22px;align-items:stretch}
.ac-format{background:#fff;border:3px solid var(--ink);border-radius:var(--radius);box-shadow:var(--shadow);padding:28px}
.ac-duree{display:inline-block;font-family:var(--titre);font-size:2.4rem;font-weight:800;line-height:1;letter-spacing:-.02em;margin-bottom:16px;padding:4px 14px 6px;background:var(--c);color:var(--c-texte);border:3px solid var(--ink);border-radius:14px;box-shadow:3px 3px 0 var(--ink);rotate:-2deg}
.ac-format p{color:var(--soft);font-size:1rem}
.ac-tarif{background:var(--ink);color:#fff;border:3px solid var(--ink);border-radius:22px;box-shadow:7px 7px 0 var(--c);padding:30px;display:flex;flex-direction:column;gap:14px}
.ac-label{align-self:flex-start;padding:1px 12px;border:2px solid #fff;border-radius:99px;background:var(--lime);color:var(--ink);font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;font-weight:800}
.ac-montant{font-family:var(--titre);font-size:3.8rem;font-weight:800;line-height:1;letter-spacing:-.03em}
.ac-montant span{font-family:var(--sans);font-size:1rem;font-weight:500;letter-spacing:0;opacity:.75}
.ac-tarif p{font-size:.95rem;color:rgba(255,255,255,.78)}
.ac-tarif .ac-btn{align-self:flex-start;margin-top:auto;border-color:#fff}

.ac-avis{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:22px;align-items:start}
.ac-avis figure{background:var(--bg);border:3px solid var(--ink);border-radius:var(--radius);box-shadow:var(--shadow);padding:26px;display:flex;flex-direction:column;gap:16px}
.ac-avis figure:first-child{background:var(--ink);color:#fff;box-shadow:6px 6px 0 var(--pink)}
.ac-avis figure:nth-child(2){rotate:1deg}
.ac-avis figure:nth-child(3){rotate:-1deg}
.ac-avis blockquote{font-family:var(--titre);font-weight:500;font-size:1.12rem;line-height:1.45;color:var(--ink)}
.ac-avis figure:first-child blockquote{color:#fff;font-size:1.3rem}
.ac-avis blockquote::before{content:"«\\00a0"}
.ac-avis blockquote::after{content:"\\00a0»"}
.accueil[lang="en"] .ac-avis blockquote::before{content:"“"}
.accueil[lang="en"] .ac-avis blockquote::after{content:"”"}
.ac-avis figcaption{align-self:flex-start;padding:3px 12px;border:2px solid var(--ink);border-radius:99px;background:var(--c);color:var(--c-texte);font-size:.88rem;font-weight:700}
.ac-avis figure:first-child figcaption{border-color:#fff}
.ac-avis figcaption span{font-weight:500}
.ac-avis figcaption span::before{content:" · "}

.ac-niveaux{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}
.ac-niveau{background:var(--c);color:var(--c-texte);border:3px solid var(--ink);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px 18px 24px;text-align:center}
.ac-niveau:nth-child(odd){rotate:-1.2deg}
.ac-niveau:nth-child(even){rotate:1.2deg}
.ac-niveau img{width:84px;height:84px;object-fit:contain;margin:0 auto 10px;filter:drop-shadow(3px 4px 0 rgba(27,19,64,.25))}
.ac-niveau h3{font-family:var(--titre);font-size:1.3rem;font-weight:800;line-height:1.15}
.ac-code{display:inline-block;margin:8px 0 10px;padding:0 10px;background:#fff;color:var(--ink);border:2px solid var(--ink);border-radius:99px;font-size:.76rem;font-weight:800;letter-spacing:.06em}
.ac-niveau p{font-size:.95rem}
.ac-plus{display:inline-block;margin-top:36px;padding:10px 20px;font-weight:700;background:#fff;border:2.5px solid var(--ink);border-radius:99px;box-shadow:3px 3px 0 var(--ink);transition:background .15s}
.ac-plus:hover{background:var(--lemon)}

.ac-final{padding:0 0 88px}
.ac-final-carte{position:relative;display:flex;align-items:center;justify-content:space-between;gap:24px 40px;background:var(--ink);color:#fff;border-radius:26px;padding:40px 44px 40px 110px;box-shadow:8px 8px 0 var(--lime)}
.ac-final-hex{position:absolute;left:36px;top:50%;width:46px;height:54px;margin-top:-27px;rotate:-12deg;filter:drop-shadow(3px 4px 0 var(--lime))}
.ac-final h2{color:#fff;margin:0 !important;max-width:620px}
.ac-final p{color:rgba(255,255,255,.75);margin-top:10px}
.ac-final .ac-btn{border-color:#fff}

/* ---------- PIED DE PAGE ----------
   Fond encre, liseré tricolore en haut, bouton de signalement. Même bloc sur toutes les pages. */
.ac-pied { background: var(--ink); color: #fff; text-align: left; font-size: .9rem; }
.ac-pied::before { content: ""; display: block; height: 6px; background: linear-gradient(90deg, #002395 0 33.34%, #fff 33.34% 66.67%, #ED2939 66.67%); }
.ac-pied-wrap { max-width: 1180px; margin: 0 auto; padding: 30px 40px 24px; display: grid; grid-template-columns: 1.4fr 1fr auto; gap: 26px 32px; align-items: start; }
.ac-pied-marque { display: flex; align-items: flex-start; gap: 14px; }
.ac-pied-hex { width: 30px; height: 35px; flex: none; rotate: -12deg; filter: drop-shadow(2px 3px 0 rgba(0,0,0,.4)); }
.ac-pied-nom { display: block; font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-size: 1.2rem; letter-spacing: -.02em; }
.ac-pied-nom b { display: inline-block; padding: 0 6px 1px; background: var(--lime); color: var(--ink); border-radius: 6px; rotate: -2deg; }
.ac-pied-slogan { margin: 7px 0 0; max-width: 300px; color: rgba(255,255,255,.7); font-size: .85rem; line-height: 1.5; }
.ac-pied-liens { display: grid; gap: 6px; }
.ac-pied :where(a) { color: #fff; text-decoration: none; }
.ac-pied-liens a { width: fit-content; color: rgba(255,255,255,.85); border-bottom: 2px solid transparent; }
.ac-pied-liens a:hover { color: var(--lime); border-bottom-color: var(--lime); }
.ac-pied-actions { display: grid; gap: 12px; justify-items: start; }
.ac-pied-signaler { display: inline-flex; align-items: center; gap: 9px; padding: 9px 18px; background: var(--lime); color: var(--ink); border: 2.5px solid var(--ink); border-radius: 99px; box-shadow: 3px 3px 0 rgba(255,255,255,.35); font-weight: 800; font-size: .88rem; transition: translate .15s, box-shadow .15s; }
.ac-pied-signaler::before { content: "!"; display: grid; place-items: center; width: 19px; height: 19px; flex: none; border: 2px solid var(--ink); border-radius: 50%; font-size: .72rem; }
.ac-pied-signaler:hover { translate: -1px -1px; box-shadow: 4px 4px 0 rgba(255,255,255,.5); }
.ac-pied-legal { display: flex; gap: 12px; flex-wrap: wrap; font-size: .8rem; }
.ac-pied-legal a { color: rgba(255,255,255,.6); text-decoration: underline; text-underline-offset: 3px; }
.ac-pied-legal a:hover { color: #fff; }
.ac-pied-bas { border-top: 1px solid rgba(255,255,255,.18); padding: 12px 40px; text-align: center; font-size: .75rem; color: rgba(255,255,255,.45); }
@media (prefers-reduced-motion: reduce) { .ac-pied-signaler { transition: none; } }
@media (max-width: 860px) {
  .ac-pied-wrap { grid-template-columns: 1fr; gap: 20px; padding: 26px 20px 20px; }
  .ac-pied-bas { padding: 12px 20px; }
}
/* fin pied de page */
.ac-barre-mobile{display:none}

/* ---------- tablette et mobile ---------- */
@media (max-width:1060px){
  .ac-nav{gap:2px}
  .ac-nav a{padding:6px 10px}
  .ac-barre{gap:14px}
  .ac-titre{font-size:3.3rem}
  .ac-diapo{gap:40px}
  .ac-carte-avis{left:-24px}
  .ac-niveaux{gap:16px}
}
@media (max-width:900px){
  .accueil{font-size:16px}
  .ac-wrap{padding:0 20px}
  .ac-barre{height:64px;gap:12px}
  .ac-logo{font-size:21px}
  .ac-nav,.ac-btn-entete{display:none}
  .ac-burger{display:grid}
  .ac-menu:not([hidden]){display:grid;gap:8px;padding:12px 20px 20px;border-top:2px solid var(--ink);background:var(--bg)}
  .ac-menu a{padding:10px 14px;font-weight:600;border:2px solid var(--ink);border-radius:12px;background:#fff;color:var(--ink)}
  .ac-menu .ac-btn{margin-top:6px;padding:12px 22px;background:var(--pink);color:#fff;border-width:2.5px}
  .ac-hero{padding:22px 0 36px}
  .ac-hero-wrap{display:flex;flex-direction:column}
  .ac-commandes{order:-1;gap:16px;margin:0 0 22px}
  .ac-onglet{flex:1;font-size:.82rem}
  .ac-diapo{grid-template-columns:1fr;gap:36px;align-self:start}
  .ac-titre{font-size:2.8rem}
  .ac-lead{font-size:1.08rem}
  .ac-actions{flex-direction:column}
  .ac-preuves{gap:10px}
  .ac-preuves div{padding:6px 11px 7px}
  .ac-preuves strong{font-size:1.3rem}
  .ac-portrait{justify-self:center;max-width:340px;order:-1}
  .ac-portrait img{aspect-ratio:5/4;box-shadow:7px 7px 0 var(--ink);rotate:1deg}
  .ac-carte-avis{position:relative;left:auto;bottom:auto;width:auto;margin:-40px 16px 0;rotate:-1deg}
  .ac-carte-prix{right:-6px;top:-14px;width:84px;height:84px}
  .ac-carte-prix strong{font-size:1.45rem}
  .ac-carte-prix span{font-size:.68rem}
  .ac-collage{order:-1;height:auto;max-width:360px;justify-self:center;display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  .ac-rc{position:relative;inset:auto;width:auto;rotate:none;padding:14px;box-shadow:4px 4px 0 var(--ink)}
  .ac-rc-conj{box-shadow:4px 4px 0 var(--lime)}
  .ac-rc-adj{grid-column:1/-1}
  .ac-paire{margin-bottom:10px}
  .ac-paire figcaption{font-size:.95rem}
  .ac-paire span{margin-bottom:22px}
  .ac-rc small{font-size:.56rem;padding:1px 7px;border-radius:8px;line-height:1.35}
  .ac-rc strong{font-size:1.05rem}
  .ac-rc p{font-size:.8rem}
  .ac-go{margin-top:10px;padding:5px 11px;font-size:.76rem;border-width:2px}
  .ac-chiffres{font-size:1.5rem}
  .ac-section{padding:60px 0}
  .accueil h2{font-size:2rem}
  .ac-etapes,.ac-offre,.ac-avis{grid-template-columns:1fr}
  .ac-avis figure:nth-child(n){rotate:none}
  .ac-niveaux{grid-template-columns:1fr 1fr;gap:14px}
  .ac-niveau{padding:16px 10px 18px}
  .ac-niveau img{width:60px;height:60px}
  .ac-niveau h3{font-size:1.1rem}
  .ac-niveau p{font-size:.86rem}
  .ac-final{padding-bottom:60px}
  .ac-final-carte{flex-direction:column;align-items:flex-start;padding:28px 22px;box-shadow:6px 6px 0 var(--lime)}
  .ac-final-hex{position:static;margin:0;width:36px;height:42px}
  .accueil .ac-final h2{font-size:1.7rem}
  .ac-barre-mobile{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:30;background:#fff;border-top:3px solid var(--ink);padding:10px 16px;align-items:center;gap:12px}
  .ac-barre-mobile div{font-size:.8rem;color:var(--soft);line-height:1.2;margin-right:auto}
  .ac-barre-mobile strong{display:block;font-family:var(--titre);font-size:1.35rem;font-weight:800;color:var(--ink)}
  .ac-pied-bas{padding-bottom:90px}
}
@media (max-width:370px){
  .ac-wrap{padding:0 12px}
  .ac-barre{gap:6px}
  .ac-logo{font-size:19px}
  .ac-langue button{padding:3px 6px;font-size:.72rem}
  .ac-burger{width:38px;height:38px}
  .ac-titre{font-size:2.3rem}
  .ac-preuves{gap:8px}
  .ac-preuves div{padding:5px 8px 6px;font-size:.7rem}
  .ac-preuves strong{font-size:1.1rem}
  .ac-niveaux{gap:10px}
}
/* ---------- EN-TÊTE TRICOLORE ----------
   Fond en fondu doux bleu → blanc → rouge, et liseré bleu-blanc-rouge sous l'en-tête
   (le liseré remplace l'ancien trait foncé du bas, encadré de deux traits foncés). */
.ac-entete { background: linear-gradient(90deg, #c9d4ff 0%, #fff 35%, #fff 65%, #ffd0d4 100%); border-bottom: 0; }
.ac-entete::after { content: ""; display: block; box-sizing: content-box; height: 6px; background: linear-gradient(90deg, #002395 0 33.34%, #fff 33.34% 66.67%, #ED2939 66.67%); border-top: 2px solid var(--ink); border-bottom: 3px solid var(--ink); }
/* fin en-tête tricolore */
`;
