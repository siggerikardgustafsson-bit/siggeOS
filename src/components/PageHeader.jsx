// Återanvändbar sticky glasheader — används på alla sidor
// Användning: <PageHeader title="Träning" subtitle="3 pass denna vecka" actions={<><button>...</button></>} />

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 30,
      padding: '12px 24px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'var(--surface)',
      backdropFilter: 'blur(32px)',
      WebkitBackdropFilter: 'blur(32px)',
      borderBottom: '1px solid var(--glass-border)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      // Subtil shimmer linje
    }}>
      {/* Shimmer top */}
      <div style={{
        position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--border2), transparent)',
        pointerEvents: 'none',
      }} />

      <div>
        <div style={{
          fontSize: '17px',
          fontWeight: '600',
          color: 'var(--text)',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
            {subtitle}
          </div>
        )}
      </div>

      {actions && (
        <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
