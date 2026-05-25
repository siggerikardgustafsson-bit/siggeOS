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
      background: 'rgba(255,255,255,0.03)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      padding: '0',
      position: 'sticky',
      top: 0,
      boxShadow: '1px 0 0 rgba(255,255,255,0.04)',
    }}>

      {/* Logo */}
      <div style={{
        padding: '22px 20px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          fontSize: '19px',
          fontWeight: '700',
          letterSpacing: '-0.5px',
          color: 'rgba(255,255,255,0.95)',
        }}>
          Sigge<span style={{
            background: 'linear-gradient(135deg, #4f8ef7, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>OS</span>
        </div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '2px', letterSpacing: '0.02em' }}>
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
              color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
              background: isActive
                ? 'rgba(255,255,255,0.08)'
                : 'transparent',
              border: isActive
                ? '1px solid rgba(255,255,255,0.10)'
                : '1px solid transparent',
              boxShadow: isActive
                ? '0 2px 8px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.06) inset'
                : 'none',
              transition: 'all 0.18s',
              position: 'relative',
            })}
          >
            {({ isActive }) => (
              <>
                <span style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: isActive ? '#4f8ef7' : 'inherit',
                  transition: 'color 0.18s',
                }}>
                  <Icon size={15} />
                </span>
                {label}
                {isActive && (
                  <span style={{
                    marginLeft: 'auto',
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: '#4f8ef7',
                    boxShadow: '0 0 6px rgba(79,142,247,0.8)',
                  }} />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '10px 10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavLink to="/installningar" style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
          borderRadius: '10px', textDecoration: 'none', fontSize: '13.5px',
          fontWeight: isActive ? '500' : '400',
          color: isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
          background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
          border: isActive ? '1px solid rgba(255,255,255,0.10)' : '1px solid transparent',
          transition: 'all 0.18s',
        })}>
          {({ isActive }) => (
            <>
              <span style={{ color: isActive ? 'var(--accent)' : 'inherit', display: 'flex' }}><Settings size={15} /></span>
              Inställningar
              {isActive && <span style={{ marginLeft: 'auto', width: '4px', height: '4px', borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 6px var(--accent)' }} />}
            </>
          )}
        </NavLink>
        <button
          onClick={handleSignOut}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 10px',
            borderRadius: '10px',
            background: 'transparent',
            border: '1px solid transparent',
            color: 'rgba(255,255,255,0.3)',
            fontSize: '13.5px',
            fontWeight: '400',
            cursor: 'pointer',
            width: '100%',
            transition: 'all 0.18s',
            fontFamily: 'Inter, sans-serif',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'rgba(248,113,113,0.8)'
            e.currentTarget.style.background = 'rgba(248,113,113,0.08)'
            e.currentTarget.style.borderColor = 'rgba(248,113,113,0.15)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
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
