import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, BookOpen, Dumbbell, DollarSign
} from 'lucide-react'

const mobileNavItems = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jarvis',  icon: MessageSquare,   label: 'Jarvis' },
  { to: '/journal', icon: BookOpen,        label: 'Journal' },
  { to: '/traning', icon: Dumbbell,        label: 'Träning' },
  { to: '/ekonomi', icon: DollarSign,      label: 'Ekonomi' },
]

export default function BottomNav() {
  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {mobileNavItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px 4px',
            textDecoration: 'none',
            color: isActive ? 'var(--blue)' : 'var(--muted)',
            fontSize: '10px',
            gap: '4px',
            transition: 'color 0.15s',
          })}
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
