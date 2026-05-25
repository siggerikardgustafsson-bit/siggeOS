export function PlaceholderPage({ title, description, color = '#3b82f6' }) {
  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '8px', fontSize: '22px', fontWeight: '600' }}>{title}</div>
      <div style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '32px' }}>{description}</div>
      <div style={{
        padding: '40px',
        border: `1px dashed ${color}40`,
        borderRadius: '12px',
        textAlign: 'center',
        color: 'var(--muted)',
        background: `${color}08`,
      }}>
        Kommer snart — byggs modul för modul
      </div>
    </div>
  )
}

export function JobbPage() {
  return <PlaceholderPage title="Jobb" description="PA-pass och Erik Norling CRM" color="#f97316" />
}

export function UpplevelserPage() {
  return <PlaceholderPage title="Upplevelser" description="Resor, äventyr och minnen" color="#06b6d4" />
}

export function InsightsPage() {
  return <PlaceholderPage title="Insights" description="Korrelationer, veckosummering och månadsrapport" color="#3b82f6" />
}
