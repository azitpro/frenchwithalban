export default function Home() {
  return (
    <main style={{
      fontFamily: 'Georgia, serif',
      background: '#faf7f2',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '40px 20px',
    }}>
      <h1 style={{ fontSize: '2.8rem', color: '#0d2b45', marginBottom: '8px' }}>
        French with Alban
      </h1>
      <p style={{ fontSize: '1.1rem', color: '#c0392b', marginBottom: '32px', letterSpacing: '0.05em' }}>
        Learn French with a native teacher
      </p>
      <p style={{ fontSize: '1rem', color: '#555', maxWidth: '500px', lineHeight: '1.7' }}>
        Online French lessons for English speakers. Beginner to advanced. 
        Flexible scheduling, personalized approach.
      </p>
      <a href="mailto:alban@frenchwithalban.com" style={{
        marginTop: '40px',
        padding: '14px 32px',
        background: '#c0392b',
        color: 'white',
        borderRadius: '6px',
        textDecoration: 'none',
        fontSize: '1rem',
        fontFamily: 'Inter, sans-serif',
      }}>
        Book a lesson
      </a>
      <a href="/conjugaison.html" style={{
  marginTop: '16px',
  padding: '14px 32px',
  background: '#0d2b45',
  color: 'white',
  borderRadius: '6px',
  textDecoration: 'none',
  fontSize: '1rem',
  fontFamily: 'Inter, sans-serif',
}}>
  Practice conjugation
</a>
    </main>
  )
}
