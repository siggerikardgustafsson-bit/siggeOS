import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, BookOpen, Dumbbell, Heart, Utensils,
  DollarSign, GraduationCap, Briefcase, Users, Map,
  BarChart2, MessageSquare, LogOut
} from 'lucide-react'

const navItems = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jarvis',    icon: MessageSquare,   label: 'Jarvis' },
  { to: '/journal',   icon: BookOpen,        label: 'Journal' },
  { to: '/traning',   icon: Dumbbell,        label: 'Träning' },
  { to: '/halsa',     icon: Heart,           label: 'Hälsa' },
  { to: '/kost',      icon: Utensils,        label: 'Kost' },
  { to: '/ekonomi',   icon: DollarSign,      label: 'Ekonomi' },
  { to: '/plugg',     icon: GraduationCap,   label: 'Plugg' },
  { to: '/jobb',      icon: Briefcase,       label: 'Jobb' },
  { to: '/socialt',   icon: Users,           label: 'Socialt' },
  { to: '/resor',     icon: Map,             label: 'Resor' },
  { to: '/insights',  icon: BarChart2,       label: 'Insights' },
]

export default function Sidebar() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <aside style={{
      width: '200px',
      minWidth: '200px',
      height: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 0',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-0.3px' }}>
          Sigge<span style={{ color: 'var(--blue)' }}>OS</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 10px',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '500',
              color: isActive ? 'var(--blue)' : 'var(--muted)',
              background: isActive ? 'rgba(59,130,246,0.08)' : 'transparent',
              transition: 'all 0.15s',
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid var(--border)' }}>
        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '9px 10px',
            borderRadius: '8px',
            background: 'transparent',
            border: 'none',
            color: 'var(--muted)',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            width: '100%',
            transition: 'color 0.15s',
          }}
        >
          <LogOut size={16} />
          Logga ut
        </button>
      </div>
    </aside>
  )
}
