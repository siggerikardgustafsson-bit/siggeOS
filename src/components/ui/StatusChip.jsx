// Shared status chip — tier badges, profile quality, sync state, filters.
// Pairs with .mx-chip in index.css. Color flows through the --chip-c custom
// property so one class serves every status color.
//
//   <StatusChip color="#34d399" label="T5/8" sub="Avancerad" />
//   <StatusChip color={c} label="72%" sub="profil" onClick={...} title="..." />
//   <StatusChip color={c.color} dot label={c.label} off={!active} onClick={...} />
export default function StatusChip({
  color,
  label,
  sub,
  dot = true,
  off = false,
  onClick,
  title,
  icon = null,
  className = '',
  style,
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className={`mx-chip${off ? ' is-off' : ''}${className ? ' ' + className : ''}`}
      style={{ '--chip-c': color, ...style }}
      onClick={onClick}
      title={title}
      type={onClick ? 'button' : undefined}
    >
      {icon}
      {dot && <span className="mx-chip-dot" />}
      <span>{label}</span>
      {sub && (
        <>
          <span className="mx-chip-sep" />
          <span className="mx-chip-sub">{sub}</span>
        </>
      )}
    </Tag>
  )
}
