'use client';

import { useEffect, useState } from 'react';

type Lang = 'fr' | 'en';

export default function Home() {
  const [lang, setLang] = useState<Lang>('fr');
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let choix: Lang | null = null;
    try {
      const enregistre = localStorage.getItem('fwa-lang');
      if (enregistre === 'fr' || enregistre === 'en') choix = enregistre;
    } catch {}
    if (!choix) {
      const nav = (navigator.language || 'fr').toLowerCase();
      choix = nav.startsWith('fr') ? 'fr' : 'en';
    }
    setLang(choix);
    setPret(true);
  }, []);

  useEffect(() => {
    if (!pret) return;
    try { localStorage.setItem('fwa-lang', lang); } catch {}
    document.documentElement.lang = lang;
  }, [lang, pret]);

  const t = (fr: string, en: string) => (lang === 'fr' ? fr : en);

  return (
    <>
      <style precedence="default" href="main-styles">{`
        :root {
          --cream: #faf7f2;
          --cream-dark: #f0ece4;
          --navy: #0d2b45;
          --red: #c0392b;
          --gold: #c9972a;
          --border: #ddd8ce;
          --text-soft: #666;
        }
        body { background: var(--cream); font-family: 'Inter', sans-serif; color: var(--navy); }
        .gold-line { height: 2px; background: var(--gold); width: 100%; }
        header { padding: 28px 48px; border-bottom: 3px solid var(--navy); display: flex; justify-content: space-between; align-items: center; background: var(--cream); width: 100%; box-sizing: border-box; }
        .logo { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        nav { display: flex; gap: 44px; align-items: center; }
        nav a { font-size: 1.05rem; font-weight: 500; letter-spacing: 0.03em; color: var(--navy); text-decoration: none; opacity: 0.65; transition: opacity 0.2s; }
        nav a:hover { opacity: 1; }
        .nav-cta { padding: 11px 26px; background: var(--red); color: var(--cream) !important; opacity: 1 !important; font-weight: 600 !important; box-shadow: 3px 3px 0 var(--navy); transition: all 0.15s !important; }
        .nav-cta:hover { transform: translate(-1px, -1px) !important; box-shadow: 4px 4px 0 var(--navy) !important; }

        /* ---------- SÉLECTEUR DE LANGUE ---------- */
        .langues { position: fixed; right: 22px; bottom: 22px; z-index: 500; display: flex; flex-direction: column; gap: 10px; }
        .lang-btn { width: 46px; height: 54px; padding: 0; border: none; background: none; cursor: pointer; line-height: 0; opacity: 0.45; transition: opacity .2s, transform .2s; filter: drop-shadow(2px 2px 0 rgba(13,43,69,.25)); }
        .lang-btn:hover { opacity: 0.85; transform: translateY(-2px); }
        .lang-btn.actif { opacity: 1; filter: drop-shadow(0 0 0 transparent); }
        .lang-btn svg { width: 100%; height: 100%; display: block; }
        .lang-btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }

        .hero { padding: 88px 64px 72px; display: grid; grid-template-columns: 460px 1fr 300px; gap: 0; align-items: stretch; border-bottom: 1px solid var(--border); }
        .hero-photos { align-self: center; justify-self: center; width: 100%; max-width: 460px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px 20px; align-items: start; }
        .photo { border: 2px solid var(--navy); line-height: 0; position: relative; transition: transform 0.25s; }
        .photo img { width: 100%; display: block; object-fit: cover; }
        .photo-1 { grid-column: 1; grid-row: 1; width: 120%; margin-left: -16%; transform: rotate(-6deg); box-shadow: 5px 5px 0 var(--gold); z-index: 2; }
        .photo-1 img { aspect-ratio: 3 / 4; object-position: center 25%; }
        .photo-2 { grid-column: 2; grid-row: 1 / span 2; align-self: center; width: 110%; margin-left: 0; transform: rotate(5deg); box-shadow: 5px 5px 0 var(--red); z-index: 1; }
        .photo-2 img { aspect-ratio: 3 / 4; object-position: center 30%; }
        .photo-3 { grid-column: 1; grid-row: 2; margin-left: -8%; box-shadow: 5px 5px 0 var(--navy); z-index: 3; }
        .photo-3 img { aspect-ratio: 3 / 4; }
        .photo:hover { transform: rotate(0deg) scale(1.03); z-index: 5; }

        .hero-left { padding-right: 64px; display: flex; flex-direction: column; justify-content: flex-start; padding-top: 8px; }
        .hero-overline { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
        .hero-overline-line { width: 28px; height: 2px; background: var(--red); }
        .hero-overline-text { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--red); }
        h1 { font-family: 'DM Serif Display', serif; font-size: 4.8rem; font-weight: 400; line-height: 1.05; color: var(--navy); margin-bottom: 28px; letter-spacing: -0.02em; }
        h1 .red { color: var(--red); }
        .hero-body { font-size: 1rem; font-weight: 300; line-height: 1.8; color: var(--text-soft); max-width: 420px; margin-bottom: 40px; }
        .hero-actions { display: flex; gap: 16px; align-items: center; }
        .btn-primary { display: inline-block; padding: 13px 30px; background: var(--navy); color: var(--cream); text-decoration: none; font-size: 0.84rem; font-weight: 600; letter-spacing: 0.06em; box-shadow: 4px 4px 0 var(--red); transition: all 0.15s; }
        .btn-primary:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--red); }
        .btn-ghost { font-size: 0.84rem; font-weight: 400; color: var(--navy); text-decoration: none; border-bottom: 2px solid var(--gold); padding-bottom: 2px; }
        .conj-card { background: var(--navy); padding: 40px 32px; display: flex; flex-direction: column; justify-content: center; gap: 16px; }
        .conj-card-tag { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); }
        .conj-card-title { font-family: 'DM Serif Display', serif; font-size: 1.6rem; color: var(--cream); text-decoration: none; line-height: 1.2; }
        .conj-card-desc { font-size: 0.84rem; font-weight: 300; color: rgba(250,247,242,0.6); line-height: 1.7; margin: 0; max-height: 0; overflow: hidden; transition: max-height 0.3s ease, opacity 0.3s ease; opacity: 0; }
        .conj-card:hover .conj-card-desc { max-height: 80px; opacity: 1; }
        .conj-card-btn { display: inline-block; padding: 11px 24px; background: var(--red); color: var(--cream); text-decoration: none; font-size: 0.82rem; font-weight: 600; letter-spacing: 0.06em; box-shadow: 3px 3px 0 var(--gold); width: fit-content; transition: all 0.15s; }
        .conj-card-btn:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--gold); }
        .res-card { background: var(--cream-dark); padding: 24px 32px; display: flex; flex-direction: column; justify-content: center; gap: 12px; border-top: 2px solid var(--gold); }
        .res-card-tag { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); }
        .res-card-title { font-family: 'DM Serif Display', serif; font-size: 1.2rem; color: var(--navy); text-decoration: none; line-height: 1.2; }
        .res-card-btn { display: inline-block; padding: 9px 20px; background: var(--navy); color: var(--cream); text-decoration: none; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.06em; box-shadow: 3px 3px 0 var(--gold); width: fit-content; transition: all 0.15s; }
        .res-card-btn:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 var(--gold); }
        .hero-right { display: flex; flex-direction: column; }
        .stats { background: var(--red); padding: 28px 64px; display: grid; grid-template-columns: repeat(4, 1fr); }
        .stat { padding: 0 32px; border-right: 1px solid rgba(250,247,242,0.2); display: flex; align-items: center; gap: 14px; }
        .stat:first-child { padding-left: 0; }
        .stat:last-child { border-right: none; }
        .stat-n { font-family: 'Fraunces', serif; font-size: 2.2rem; font-weight: 300; color: var(--cream); line-height: 1; }
        .stat-n span { color: var(--gold); }
        .stat-l { font-size: 0.7rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(250,247,242,0.7); }
        .intro { padding: 80px 64px; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; max-width: 1240px; margin: 0 auto; }
        .section-label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--red); margin-bottom: 18px; }
        .intro-title { font-family: 'Fraunces', serif; font-size: 2.2rem; font-weight: 400; line-height: 1.2; color: var(--navy); margin-bottom: 18px; }
        .intro-body { font-size: 0.95rem; font-weight: 300; line-height: 1.8; color: var(--text-soft); }
        .features { padding: 0 64px 80px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 1240px; margin: 0 auto; }
        .feature-card { background: var(--cream-dark); padding: 32px 28px; border: 1px solid var(--border); border-top: 2px solid var(--red); transition: box-shadow 0.2s; }
        .feature-card:hover { box-shadow: 4px 4px 0 var(--navy); }
        .feature-title { font-family: 'Fraunces', serif; font-size: 1.05rem; font-weight: 600; color: var(--navy); margin-bottom: 10px; }
        .feature-body { font-size: 0.86rem; font-weight: 300; color: var(--text-soft); line-height: 1.7; }
        footer { background: var(--navy); padding: 28px 48px; border-top: 4px solid var(--gold); display: flex; justify-content: space-between; align-items: center; }
        .footer-logo { display: flex; align-items: center; gap: 8px; }
        .footer-copy { font-size: 0.72rem; font-weight: 300; color: rgba(250,247,242,0.4); letter-spacing: 0.04em; }
        .footer-copy a { color: rgba(250,247,242,0.6); }

        @media (max-width: 1200px) {
          .hero { grid-template-columns: 1fr 1fr; padding: 64px 40px 56px; gap: 40px; }
          .hero-photos { grid-column: 1 / -1; order: 3; max-width: 460px; margin: 0 auto; }
          .hero-left { padding-right: 24px; }
          h1 { font-size: 3.6rem; }
        }

        @media (max-width: 860px) {
          header { padding: 18px 20px; flex-wrap: wrap; gap: 14px; }
          nav { gap: 18px; flex-wrap: wrap; }
          nav a { font-size: 0.92rem; }
          .nav-cta { padding: 9px 20px; }
          .hero { grid-template-columns: 1fr; padding: 40px 20px 48px; gap: 32px; }
          .hero-photos { max-width: 340px; margin: 0 auto; grid-template-columns: 1fr 1fr; gap: 12px 14px; }
          .hero-left { padding-right: 0; }
          h1 { font-size: 2.6rem; margin-bottom: 20px; }
          .hero-body { font-size: 0.95rem; margin-bottom: 28px; max-width: none; }
          .hero-actions { flex-wrap: wrap; gap: 14px; }
          .conj-card { padding: 28px 24px; }
          .conj-card-desc { max-height: 100px; opacity: 1; }
          .stats { grid-template-columns: 1fr 1fr; gap: 22px; padding: 24px 20px; }
          .stat { padding: 0; border-right: none; }
          .stat-n { font-size: 1.8rem; }
          .intro { grid-template-columns: 1fr; gap: 36px; padding: 48px 20px; }
          .intro-title { font-size: 1.7rem; }
          .features { grid-template-columns: 1fr; padding: 0 20px 48px; }
          .feature-card { padding: 24px 22px; }
          footer { padding: 22px 20px; flex-direction: column; gap: 12px; text-align: center; }
          .langues { right: 14px; bottom: 14px; flex-direction: row; }
          .lang-btn { width: 38px; height: 45px; }
        }
      `}</style>

      {/* ---------- SÉLECTEUR DE LANGUE ---------- */}
      <div className="langues" role="group" aria-label={t('Choix de la langue', 'Language')}>
        <button
          type="button"
          className={'lang-btn' + (lang === 'fr' ? ' actif' : '')}
          onClick={() => setLang('fr')}
          aria-pressed={lang === 'fr'}
          title="Français"
        >
          <svg viewBox="-2 -2 34 39" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="hxFR"><polygon points="15,0 30,8.75 30,26.25 15,35 0,26.25 0,8.75"/></clipPath>
            </defs>
            <polygon points="15,0 30,8.75 30,26.25 15,35 0,26.25 0,8.75" fill="none"
                     stroke={lang === 'fr' ? '#c9972a' : '#0d2b45'} strokeWidth="4" strokeLinejoin="round"/>
            <g clipPath="url(#hxFR)">
              <rect x="0" y="0" width="10" height="35" fill="#002395"/>
              <rect x="10" y="0" width="10" height="35" fill="#ffffff"/>
              <rect x="20" y="0" width="10" height="35" fill="#ED2939"/>
            </g>
            <polygon points="15,0 30,8.75 30,26.25 15,35 0,26.25 0,8.75" fill="none"
                     stroke={lang === 'fr' ? '#c9972a' : '#0d2b45'} strokeWidth="2.4" strokeLinejoin="round"/>
          </svg>
        </button>

        <button
          type="button"
          className={'lang-btn' + (lang === 'en' ? ' actif' : '')}
          onClick={() => setLang('en')}
          aria-pressed={lang === 'en'}
          title="English"
        >
          <svg viewBox="-2 -2 34 39" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="hxEN"><polygon points="15,0 30,8.75 30,26.25 15,35 0,26.25 0,8.75"/></clipPath>
            </defs>
            <polygon points="15,0 30,8.75 30,26.25 15,35 0,26.25 0,8.75" fill="none"
                     stroke={lang === 'en' ? '#c9972a' : '#0d2b45'} strokeWidth="4" strokeLinejoin="round"/>
            <g clipPath="url(#hxEN)">
              <rect x="0" y="0" width="30" height="35" fill="#012169"/>
              <line x1="0" y1="0" x2="30" y2="35" stroke="#ffffff" strokeWidth="7"/>
              <line x1="30" y1="0" x2="0" y2="35" stroke="#ffffff" strokeWidth="7"/>
              <line x1="14.1" y1="18.3" x2="-0.9" y2="0.8" stroke="#C8102E" strokeWidth="2.4"/>
              <line x1="15.9" y1="18.3" x2="0.9" y2="35.8" stroke="#C8102E" strokeWidth="2.4"/>
              <line x1="15.9" y1="16.7" x2="30.9" y2="34.2" stroke="#C8102E" strokeWidth="2.4"/>
              <line x1="14.1" y1="16.7" x2="29.1" y2="-0.8" stroke="#C8102E" strokeWidth="2.4"/>
              <rect x="10.4" y="0" width="9.2" height="35" fill="#ffffff"/>
              <rect x="0" y="12.9" width="30" height="9.2" fill="#ffffff"/>
              <rect x="12.2" y="0" width="5.6" height="35" fill="#C8102E"/>
              <rect x="0" y="14.7" width="30" height="5.6" fill="#C8102E"/>
            </g>
            <polygon points="15,0 30,8.75 30,26.25 15,35 0,26.25 0,8.75" fill="none"
                     stroke={lang === 'en' ? '#c9972a' : '#0d2b45'} strokeWidth="2.4" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <header>
        <a href="/" className="logo">
          <svg width="30" height="35" viewBox="-1 -1 26 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="hxHeader">
                <polygon points="12,1 23,7 23,21 12,27 1,21 1,7"/>
              </clipPath>
            </defs>
            <rect x="0" y="0" width="8" height="28" fill="#002395" clipPath="url(#hxHeader)"/>
            <rect x="8" y="0" width="8" height="28" fill="#ffffff" clipPath="url(#hxHeader)"/>
            <rect x="16" y="0" width="8" height="28" fill="#ED2939" clipPath="url(#hxHeader)"/>
            <polygon points="12,1 23,7 23,21 12,27 1,21 1,7" fill="none" stroke="#0d2b45" strokeWidth="1.5"/>
          </svg>
          <span style={{fontFamily: "'Fraunces', serif", fontSize: "1.7rem", fontWeight: 700, color: "#0d2b45", letterSpacing: "-0.01em"}}>
            French with <span style={{color: "#c0392b"}}>Alban</span>
          </span>
        </a>
        <nav>
          <a href="/planning_public.html">{t('Créneaux', 'Availability')}</a>
          <a href="/ressources.html">{t('Ressources', 'Resources')}</a>
          <a href="/apropos.html">{t('À propos', 'About')}</a>
          <a href="/reserver.html" className="nav-cta">{t('Réserver', 'Book a lesson')}</a>
        </nav>
      </header>
      <div className="gold-line"></div>

      <div className="hero">
        <div className="hero-left">
          <div className="hero-overline">
            <div className="hero-overline-line"></div>
            <span className="hero-overline-text">{t('Professeur natif · En ligne', 'Native teacher · Online')}</span>
          </div>
          <h1>
            {lang === 'fr'
              ? <>Apprenez<br />le <span className="red">français</span><br />autrement.</>
              : <>Learn<br /><span className="red">French</span><br />differently.</>}
          </h1>
          <p className="hero-body">
            {t(
              "Des cours particuliers avec un enseignant français natif. Approche personnalisée, progression mesurable, horaires adaptés à votre vie.",
              "One-to-one lessons with a native French teacher. A personalised approach, measurable progress, and hours that fit around your life."
            )}
          </p>
          <div className="hero-actions">
            <a href="/reserver.html" className="btn-primary">{t('Réserver un cours', 'Book a lesson')}</a>
            <a href="/ressources.html" className="btn-ghost">{t('Voir les ressources', 'Browse the resources')}</a>
          </div>
        </div>

        <div className="hero-photos">
          <div className="photo photo-1"><img src="/img/alban-paris.jpg" alt={t("Alban devant la Fondation Louis Vuitton à Paris", "Alban outside the Fondation Louis Vuitton in Paris")} /></div>
          <div className="photo photo-2"><img src="/img/nice.jpg" alt={t("La promenade des Anglais à Nice au coucher du soleil", "The Promenade des Anglais in Nice at sunset")} /></div>
          <div className="photo photo-3"><img src="/img/tour-eiffel.jpg" alt={t("La tour Eiffel vue d'en dessous", "The Eiffel Tower seen from below")} /></div>
        </div>

        <div className="hero-right">
          <div className="conj-card">
            <div className="conj-card-tag">{t('Exercice interactif', 'Interactive exercise')}</div>
            <a href="/conjugaison.html" className="conj-card-title">{t('Test de conjugaison', 'Conjugation test')}</a>
            <p className="conj-card-desc">
              {t('28 verbes irréguliers essentiels — présent, imparfait, passé composé.',
                 '28 essential irregular verbs — present, imperfect and perfect tenses.')}
            </p>
            <a href="/conjugaison.html" className="conj-card-btn">{t('Commencer', 'Start')} →</a>
          </div>
          <div className="res-card">
            <div className="res-card-tag">{t('Ressource', 'Resource')}</div>
            <a href="/verbes_er.html" className="res-card-title">{t('Les verbes en -ER', '-ER verbs')}</a>
            <a href="/verbes_er.html" className="res-card-btn">{t('Consulter', 'View')} →</a>
          </div>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-n">20<span>+</span></div>
          <div className="stat-l">{t('Étudiants actifs', 'Active students')}</div>
        </div>
        <div className="stat">
          <div className="stat-n">A1<span>→</span>C1</div>
          <div className="stat-l">{t('Tous niveaux', 'All levels')}</div>
        </div>
        <div className="stat">
          <div className="stat-n">11</div>
          <div className="stat-l">{t('Nationalités', 'Nationalities')}</div>
        </div>
        <div className="stat">
          <div className="stat-n">100<span>%</span></div>
          <div className="stat-l">{t('En ligne · Flexible', 'Online · Flexible')}</div>
        </div>
      </div>

      <div className="intro">
        <div className="intro-left">
          <div className="section-label">{t('Une approche personnalisée', 'A tailored approach')}</div>
          <div className="intro-title">{t('Chaque cours pensé pour vous.', 'Every lesson built around you.')}</div>
          <p className="intro-body">
            {t("Ici, pas de méthode toute faite. Vos objectifs, votre rythme, votre niveau — tout est pris en compte dès le premier cours.",
               "No off-the-shelf method here. Your goals, your pace and your level shape the lessons from the very first one.")}
          </p>
        </div>
        <div className="intro-right">
          <div className="section-label">{t('Ce que vous obtenez', 'What you get')}</div>
          <div className="intro-title">{t("Bien plus qu'un cours.", 'Much more than a lesson.')}</div>
          <p className="intro-body">
            {t("Ressources pédagogiques, exercices interactifs, suivi personnalisé et flexibilité totale.",
               "Teaching resources, interactive exercises, personal follow-up and complete flexibility.")}
          </p>
        </div>
      </div>

      <div className="features">
        <div className="feature-card">
          <div className="feature-title">{t('Cours sur mesure', 'Tailored lessons')}</div>
          <div className="feature-body">
            {t("Chaque séance est construite autour de vos objectifs et de votre niveau du moment.",
               "Each session is built around your goals and your current level.")}
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-title">{t('Ressources incluses', 'Resources included')}</div>
          <div className="feature-body">
            {t("PDFs, exercices et outils de pratique disponibles entre les cours.",
               "PDFs, exercises and practice tools available between lessons.")}
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-title">{t('Flexibilité totale', 'Complete flexibility')}</div>
          <div className="feature-body">
            {t("Choisissez l'horaire qui vous convient, où que vous soyez dans le monde.",
               "Choose the time that suits you, wherever you are in the world.")}
          </div>
        </div>
      </div>

      <footer>
        <div className="footer-logo">
          <svg width="18" height="22" viewBox="-1 -1 26 30" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="hxFooter">
                <polygon points="12,1 23,7 23,21 12,27 1,21 1,7"/>
              </clipPath>
            </defs>
            <rect x="0" y="0" width="8" height="28" fill="#002395" clipPath="url(#hxFooter)"/>
            <rect x="8" y="0" width="8" height="28" fill="#ffffff" clipPath="url(#hxFooter)"/>
            <rect x="16" y="0" width="8" height="28" fill="#ED2939" clipPath="url(#hxFooter)"/>
            <polygon points="12,1 23,7 23,21 12,27 1,21 1,7" fill="none" stroke="#faf7f2" strokeWidth="1.5"/>
          </svg>
          <span style={{fontFamily: "'Fraunces', serif", fontSize: "1rem", color: "#faf7f2"}}>French with Alban</span>
        </div>
        <div className="footer-copy">
          © 2026 · frenchwithalban.com · <a href="https://donate.stripe.com/cNidR2aQf8ehaKvbCv4gg00" target="_blank" rel="noopener">{t('Soutenir le site', 'Support the site')}</a>
        </div>
      </footer>
    </>
  );
}
