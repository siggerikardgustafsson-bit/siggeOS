// Shared section header — one consistent title row for cards, panels and
// page sections. Pairs with .mx-section in index.css.
//
//   <SectionHeader title="Senaste pass" />
//   <SectionHeader kicker label="Tier-utveckling" actions={<.../>} />
//   <SectionHeader title="Senaste pass" sub="30 dagar" actions={<button/>} />
//   <SectionHeader icon={User} title="Konto" sub="E-post och lösenord" />
//   <SectionHeader color={COLORS.red} title="Samband & mönster" />
//
// Modes:
//   kicker  — uppercase micro-label with accent dot (compact panel headers).
//   icon    — leading glass badge, 15px/600 title, divider under the row
//             (the page-section style used across Profile / Settings).
//   color   — leading colored bar, 13px/700 title, no divider
//             (the analytics category dividers on Insights).
// icon + color are the two "head" variants; without either you get a plain
// 15px/600 title row with the same divider. One component now covers all four
// header styles the app had grown (AUDIT.md P2-8).
export default function SectionHeader({
  title, sub, subtitle, kicker = false, label, icon: Icon, color, actions, style,
}) {
  const subText = sub ?? subtitle

  if (kicker) {
    return (
      <div className="mx-section" style={style}>
        <span className="mx-label">
          <span className="mx-label-dot" />
          {label || title}
        </span>
        {actions && <div className="mx-section-actions">{actions}</div>}
      </div>
    )
  }

  return (
    <div
      className={`mx-section mx-section--head${color ? ' mx-section--bar' : ''}`}
      style={color ? { '--mx-sec-c': color, ...style } : style}
    >
      <div className="mx-section-main">
        {color && <span className="mx-section-rule" />}
        {Icon && <span className="mx-section-badge"><Icon size={15} /></span>}
        <div className="mx-section-text">
          {title && <div className="mx-section-title">{title}</div>}
          {subText && <div className="mx-section-sub">{subText}</div>}
        </div>
      </div>
      {actions && <div className="mx-section-actions">{actions}</div>}
    </div>
  )
}
