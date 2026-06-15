// Reusable premium empty-state. Pairs with .mx-empty in index.css.
// Usage:
//   <EmptyState icon={Dumbbell} title="Inga pass än" text="Logga ditt första pass."
//     action={{ label: 'Logga pass', onClick: () => ... }} />
export default function EmptyState({ icon: Icon, title, text, action, children }) {
  return (
    <div className="mx-empty">
      {Icon && (
        <div className="mx-empty-ico">
          <Icon size={22} strokeWidth={1.9} />
        </div>
      )}
      {title && <div className="mx-empty-title">{title}</div>}
      {text && <div className="mx-empty-text">{text}</div>}
      {action && (
        <button className="btn btn-primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {children}
    </div>
  )
}
