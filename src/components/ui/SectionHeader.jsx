// Shared section header — one consistent title row for cards, panels and
// page sections. Pairs with .mx-section in index.css.
//
//   <SectionHeader title="Tier-utveckling" />
//   <SectionHeader kicker label="Tier-utveckling" actions={<.../>} />
//   <SectionHeader title="Senaste pass" sub="30 dagar" actions={<button/>} />
//   <SectionHeader icon={Icon} title="Konto" sub="E-post och lösenord" />
//
// `kicker` renders the uppercase micro-label style (with accent dot) instead
// of the full title — for compact panel headers like the Dashboard graph.
// `icon` is an optional lucide component rendered in a leading badge — lets the
// page-level headers (Profile, Settings) drop their local copies (AUDIT.md P2-8).
export default function SectionHeader({ title, sub, subtitle, kicker = false, label, icon: Icon, actions, style }) {
  const subText = sub ?? subtitle
  return (
    <div className="mx-section" style={style}>
      {kicker ? (
        <span className="mx-label">
          <span className="mx-label-dot" />
          {label || title}
        </span>
      ) : (
        <div className="mx-section-main" style={Icon ? { display: 'flex', alignItems: 'center', gap: 12 } : undefined}>
          {Icon && <span className="mx-section-badge"><Icon size={15} /></span>}
          <div>
            {title && <div className="mx-section-title">{title}</div>}
            {subText && <div className="mx-section-sub">{subText}</div>}
          </div>
        </div>
      )}
      {actions && <div className="mx-section-actions">{actions}</div>}
    </div>
  )
}
