export default function Home() {
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
        .content-wrap { max-width: 1200px; margin: 0 auto; }
        header { padding: 28px 48px; border-bottom: 3px solid var(--navy); display: flex; justify-content: space-between; align-items: center; background: var(--cream); width: 100%; box-sizing: border-box; }
        .logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        nav { display: flex; gap: 44px; align-items: center; }
        nav a { font-size: 1.05rem; font-weight: 500; letter-spacing: 0.03em; color: var(--navy); text-decoration: none; opacity: 0.65; transition: opacity 0.2s; }
        nav a:hover { opacity: 1; }
        .nav-cta { padding: 11px 26px; background: var(--red); color: var(--cream) !important; opacity: 1 !important; font-weight: 600 !important; box-shadow: 3px 3px 0 var(--navy); transition: all 0.15s !important; }
        .nav-cta:hover { transform: translate(-1px, -1px) !important; box-shadow: 4px 4px 0 var(--navy) !important; }
        .hero { padding: 88px 64px 72px; display: grid; grid-template-columns: 1fr 300px; gap: 0; align-items: stretch; border-bottom: 1px solid var(--border); }
        .hero-left { padding-right: 64px; display: flex; flex-direction: column; justify-content: center; }
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
        .intro { padding: 80px 64px; display: grid; grid-template-columns: 1fr 1fr; gap: 80px; align-items: start; }
        .section-label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--red); margin-bottom: 18px; }
        .intro-title { font-family: 'Fraunces', serif; font-size: 2.2rem; font-weight: 400; line-height: 1.2; color: var(--navy); margin-bottom: 18px; }
        .intro-body { font-size: 0.95rem; font-weight: 300; line-height: 1.8; color: var(--text-soft); }
        .features { padding: 0 64px 80px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .feature-card { background: var(--cream-dark); padding: 32px 28px; border: 1px solid var(--border); border-top: 2px solid var(--red); transition: box-shadow 0.2s; }
        .feature-card:hover { box-shadow: 4px 4px 0 var(--navy); }
        .feature-title { font-family: 'Fraunces', serif; font-size: 1.05rem; font-weight: 600; color: var(--navy); margin-bottom: 10px; }
        .feature-body { font-size: 0.86rem; font-weight: 300; color: var(--text-soft); line-height: 1.7; }
        footer { background: var(--navy); padding: 36px 48px; border-top: 4px solid var(--gold); display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box; }
        .footer-logo { display: flex; align-items: center; gap: 8px; }
        .footer-copy { font-size: 0.72rem; font-weight: 300; color: rgba(250,247,242,0.4); letter-spacing: 0.04em; }
      `}</style>

      <header>
        <a href="/" className="logo">
          <svg width="30" height="35" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
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
          <a href="#">Cours</a>
          <a href="/ressources.html">Ressources</a>
          <a href="#">À propos</a>
          <a href="#" className="nav-cta">Réserver</a>
        </nav>
      </header>

      <div className="content-wrap">

        <div className="hero">
          <div className="hero-left">
            <div className="hero-overline">
              <div className="hero-overline-line"></div>
              <span className="hero-overline-text">Professeur natif · En ligne</span>
            </div>
            <h1>Apprenez<br />le <span className="red">français</span><br />autrement.</h1>
            <p className="hero-body">Des cours particuliers avec un enseignant français natif. Approche personnalisée, progression mesurable, horaires adaptés à votre vie.</p>
            <div className="hero-actions">
              <a href="#" className="btn-primary">Réserver un cours</a>
              <a href="/conjugaison.html" className="btn-ghost">Voir les ressources</a>
            </div>
          </div>
          <div className="hero-right">
            <div className="conj-card">
              <div className="conj-card-tag">Exercice interactif</div>
              <a href="/conjugaison.html" className="conj-card-title">Test de conjugaison</a>
              <p className="conj-card-desc">28 verbes irréguliers essentiels — présent, imparfait, passé composé.</p>
              <a href="/conjugaison.html" className="conj-card-btn">Commencer →</a>
            </div>
            <div className="res-card">
              <div className="res-card-tag">Ressource PDF</div>
              <a href="/verbes_er.html" className="res-card-title">Les verbes en -ER</a>
              <a href="/verbes_er.html" className="res-card-btn">Consulter →</a>
            </div>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-n">20<span>+</span></div>
            <div className="stat-l">Étudiants actifs</div>
          </div>
          <div className="stat">
            <div className="stat-n">A1<span>→</span>C1</div>
            <div className="stat-l">Tous niveaux</div>
          </div>
          <div className="stat">
            <div className="stat-n">11</div>
            <div className="stat-l">Nationalités</div>
          </div>
          <div className="stat">
            <div className="stat-n">100<span>%</span></div>
            <div className="stat-l">En ligne · Flexible</div>
          </div>
        </div>

        <div className="intro">
          <div className="intro-left">
            <div className="section-label">Une approche personnalisée</div>
            <div className="intro-title">Chaque cours pensé pour vous.</div>
            <p className="intro-body">Ici, pas de méthode toute faite. Vos objectifs, votre rythme, votre niveau — tout est pris en compte dès le premier cours.</p>
          </div>
          <div className="intro-right">
            <div className="section-label">Ce que vous obtenez</div>
            <div className="intro-title">Bien plus qu'un cours.</div>
            <p className="intro-body">Ressources pédagogiques, exercices interactifs, suivi personnalisé et flexibilité totale.</p>
          </div>
        </div>

        <div className="features">
          <div className="feature-card">
            <div className="feature-title">Cours sur mesure</div>
            <div className="feature-body">Chaque séance est construite autour de vos objectifs et de votre niveau du moment.</div>
          </div>
          <div className="feature-card">
            <div className="feature-title">Ressources incluses</div>
            <div className="feature-body">PDFs, exercices et outils de pratique disponibles entre les cours.</div>
          </div>
          <div className="feature-card">
            <div className="feature-title">Flexibilité totale</div>
            <div className="feature-body">Choisissez l'horaire qui vous convient. Annulation gratuite jusqu'à 12h avant.</div>
          </div>
        </div>

      </div>

      <footer>
        <div className="footer-logo">
          <svg width="18" height="22" viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <div className="footer-copy">© 2026 · frenchwithalban.com</div>
      </footer>
    </>
  );
}