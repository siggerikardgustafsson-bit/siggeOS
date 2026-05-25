import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, BookOpen, Dumbbell, Heart,
  DollarSign, GraduationCap, Briefcase,
  BarChart2, MessageSquare, LogOut, Compass, Settings
} from 'lucide-react'

const navItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jarvis',      icon: MessageSquare,   label: 'Jarvis' },
  { to: '/journal',     icon: BookOpen,        label: 'Journal' },
  { to: '/traning',     icon: Dumbbell,        label: 'Träning' },
  { to: '/halsa',       icon: Heart,           label: 'Hälsa' },
  { to: '/ekonomi',     icon: DollarSign,      label: 'Ekonomi' },
  { to: '/plugg',       icon: GraduationCap,   label: 'Plugg' },
  { to: '/jobb',        icon: Briefcase,       label: 'Jobb' },
  { to: '/upplevelser', icon: Compass,         label: 'Upplevelser' },
  { to: '/insights',    icon: BarChart2,       label: 'Insights' },
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
      width: '210px',
      minWidth: '210px',
      height: '100vh',
      background: 'var(--surface)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      boxShadow: '1px 0 0 var(--border)',
    }}>

      {/* Logo */}
      <div style={{
        padding: '22px 20px 18px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: '19px',
          fontWeight: '700',
          letterSpacing: '-0.5px',
          color: 'var(--text)',
        }}>
          Sigge<span style={{
            background: 'linear-gradient(135deg, var(--accent), var(--accent2, #a78bfa))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>OS</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', letterSpacing: '0.02em' }}>
          Personal OS
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1,
        padding: '10px 10px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1px',
      }}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '10px',
              textDecoration: 'none',
              fontSize: '13.5px',
              fontWeight: isActive ? '500' : '400',
              color: isActive ? 'var(--text)' : 'var(--muted)',
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
              transition: 'all 0.18s',
            })}
          >
            {({ isActive }) => (
              <>
                <span style={{ color: isActive ? 'var(--accent)' : 'var(--muted)', display: 'flex', transition: 'color 0.18s' }}>
                  <Icon size={15} />
                </span>
                {label}
                {isActive && (
                  <span style={{
                    marginLeft: 'auto',
                    width: '5px', height: '5px',
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 8px var(--accent-glow)',
                  }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom — settings + sign out */}
      <div style={{ padding: '10px 10px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <NavLink
          to="/installningar"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
            borderRadius: '10px', textDecoration: 'none', fontSize: '13.5px',
            fontWeight: isActive ? '500' : '400',
            color: isActive ? 'var(--text)' : 'var(--muted)',
            background: isActive ? 'var(--accent-soft)' : 'transparent',
            border: isActive ? '1px solid var(--accent-border)' : '1px solid transparent',
            transition: 'all 0.18s',
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{ color: isActive ? 'var(--accent)' : 'var(--muted)', display: 'flex' }}>
                <Settings size={15} />
              </span>
              Inställningar
              {isActive && <span style={{ marginLeft: 'auto', width: '5px', height: '5px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent-glow)' }} />}
            </>
          )}
        </NavLink>

        <button
          onClick={handleSignOut}
          style={{
            display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
            borderRadius: '10px', background: 'transparent', border: '1px solid transparent',
            color: 'var(--muted)', fontSize: '13.5px', fontWeight: '400',
            cursor: 'pointer', width: '100%', transition: 'all 0.18s', fontFamily: 'Inter, sans-serif',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'var(--red)'
            e.currentTarget.style.background = 'rgba(248,113,113,0.08)'
            e.currentTarget.style.borderColor = 'rgba(248,113,113,0.15)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'var(--muted)'
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          <LogOut size={15} />
          Logga ut
        </button>
      </div>
    </aside>
  )
}
