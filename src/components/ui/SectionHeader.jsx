// Shared section header — one consistent title row for cards, panels and
// page sections. Pairs with .mx-section in index.css.
//
//   <SectionHeader title="Tier-utveckling" />
//   <SectionHeader kicker label="Tier-utveckling" actions={<.../>} />
//   <SectionHeader title="Senaste pass" sub="30 dagar" actions={<button/>} />
//
// `kicker` renders the uppercase micro-label style (with accent dot) instead
// of the full title — for compact panel headers like the Dashboard graph.
export default function SectionHeader({ title, sub, kicker = false, label, actions, style }) {
  return (
    <div className="mx-section" style={style}>
      {kicker ? (
        <span className="mx-label">
          <span className="mx-label-dot" />
          {label || title}
        </span>
      ) : (
        <div className="mx-section-main">
          {title && <div className="mx-section-title">{title}</div>}
          {sub && <div className="mx-section-sub">{sub}</div>}
        </div>
      )}
      {actions && <div className="mx-section-actions">{actions}</div>}
    </div>
  )
}
