export default function AdminHub() {
  const sections = [
    {
      title: 'Planning',
      desc: 'Disponibilités générales, créneaux élèves, cours ponctuels, indisponibilités.',
      href: '/admin/schedule',
    },
    {
      title: 'Demandes de contact',
      desc: 'Formulaires envoyés depuis la page Réserver.',
            href: '/admin/leads',
    },
    {
      title: 'Tarifs',
      desc: 'Prix réel et prix remisé affichés sur la page Réserver.',
      href: '/admin/pricing',
    },
  ];

  return (
    <div style={{ maxWidth: 700, margin: '80px auto', padding: 24, fontFamily: 'Inter, sans-serif' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', color: '#0d2b45', marginBottom: 8, fontSize: '2rem' }}>
        Administration
      </h1>
      <p style={{ color: '#666', marginBottom: 32, fontSize: '0.9rem' }}>
        French with Alban — tableau de bord
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {sections.map((s) => (
          <a key={s.href} href={s.href} style={{
            display: 'block',
            padding: 22,
            background: '#f0ece4',
            border: '1px solid #ddd8ce',
            borderLeft: '3px solid #0d2b45',
            textDecoration: 'none',
            color: '#0d2b45',
          }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: '1.1rem', fontWeight: 600, marginBottom: 6 }}>
              {s.title} →
            </div>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>{s.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}