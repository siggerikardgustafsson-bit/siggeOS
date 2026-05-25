// Placeholder component used for modules not yet built
// Replace one by one as we build each module

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

export function JournalPage() {
  return <PlaceholderPage title="Journal" description="Daglig loggning av tankar, humör, energi och sömn" color="#06b6d4" />
}

export function TraningPage() {
  return <PlaceholderPage title="Träning" description="Gympass, löpning, progressionsgraf och PRs" color="#3b82f6" />
}

export function HalsaPage() {
  return <PlaceholderPage title="Hälsa" description="Vikt, sömn, steg, retatrutide, alkohol och skärmtid" color="#10b981" />
}

export function KostPage() {
  return <PlaceholderPage title="Kost" description="Protein, kalorier, vatten och måltidslogg" color="#f97316" />
}

export function EkonomiPage() {
  return <PlaceholderPage title="Ekonomi" description="Inkomster, utgifter och CSN-fribelopp" color="#8b5cf6" />
}

export function PluggPage() {
  return <PlaceholderPage title="Plugg" description="Kurser, tentor, lärandemål och Jarvis-förhör" color="#f59e0b" />
}

export function JobbPage() {
  return <PlaceholderPage title="Jobb" description="PA-pass och Erik Norling CRM" color="#f97316" />
}

export function SocialtPage() {
  return <PlaceholderPage title="Socialt" description="Vänner, interaktioner och socialt score" color="#ec4899" />
}

export function ResorPage() {
  return <PlaceholderPage title="Resor" description="Resehistorik, planerade resor och budget" color="#06b6d4" />
}

export function InsightsPage() {
  return <PlaceholderPage title="Insights" description="Korrelationer, veckosummering och månadsrapport" color="#3b82f6" />
}
