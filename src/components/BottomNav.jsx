import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, BookOpen, Dumbbell,
  DollarSign, Heart, GraduationCap, Briefcase, Compass,
  BarChart2, CalendarDays, Download, Settings, X, Grid
} from 'lucide-react'

const primaryNav = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jarvis',  icon: MessageSquare,   label: 'Jarvis' },
  { to: '/traning', icon: Dumbbell,        label: 'Träning' },
  { to: '/halsa',   icon: Heart,           label: 'Hälsa' },
]

const moreNav = [
  { to: '/journal',     icon: BookOpen,      label: 'Journal' },
  { to: '/ekonomi',     icon: DollarSign,    label: 'Ekonomi' },
  { to: '/plugg',       icon: GraduationCap, label: 'Plugg' },
  { to: '/jobb',        icon: Briefcase,     label: 'Jobb' },
  { to: '/upplevelser', icon: Compass,       label: 'Upplevelser' },
  { to: '/kalender',    icon: CalendarDays,  label: 'Kalender' },
  { to: '/insights',    icon: BarChart2,     label: 'Insights' },
  { to: '/export',      icon: Download,      label: 'Exportera' },
  { to: '/installningar', icon: Settings,    label: 'Inställningar' },
]

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false)

  const navHeight = 'calc(64px + env(safe-area-inset-bottom))'

  return (
    <>
      {showMore && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.58)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }} onClick={() => setShowMore(false)}>
          <div style={{
            position: 'absolute',
            bottom: 'calc(76px + env(safe-area-inset-bottom))',
            left: '10px', right: '10px',
            background: 'rgba(25,31,48,0.86)',
            backdropFilter: 'blur(34px)',
            WebkitBackdropFilter: 'blur(34px)',
            border: '1px solid var(--glass-border)',
            borderRadius: '22px',
            padding: '16px',
            boxShadow: 'var(--glass-shadow)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--muted2)', letterSpacing: '0.08em' }}>ALLA SIDOR</div>
              <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted2)', padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
              {moreNav.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setShowMore(false)} style={({ isActive }) => ({
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  padding: '14px 6px', borderRadius: '14px', textDecoration: 'none',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface2)',
                  border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border)'}`,
                  color: isActive ? 'var(--accent)' : 'var(--muted2)',
                  fontSize: '11px', fontWeight: '600', transition: 'all 0.15s',
                  minWidth: 0,
                })}>
                  <Icon size={20} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: navHeight,
        background: 'rgba(29,34,51,0.82)',
        backdropFilter: 'blur(34px) saturate(1.15)',
        WebkitBackdropFilter: 'blur(34px) saturate(1.15)',
        borderTop: '1px solid var(--glass-border)',
        display: 'flex',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.30)',
      }}>
        {primaryNav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 4px 7px',
            textDecoration: 'none',
            color: isActive ? 'var(--accent)' : 'var(--muted2)',
            fontSize: '11px',
            lineHeight: 1,
            fontWeight: '650',
            gap: '5px',
            transition: 'color 0.15s',
            minWidth: '44px',
          })}>
            <Icon size={23} />
            <span>{label}</span>
          </NavLink>
        ))}

        <button onClick={() => setShowMore(!showMore)} style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 4px 7px',
          background: 'none',
          border: 'none',
          color: showMore ? 'var(--accent)' : 'var(--muted2)',
          fontSize: '11px',
          lineHeight: 1,
          fontWeight: '650',
          gap: '5px',
          cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          minWidth: '44px',
        }}>
          <Grid size={23} />
          <span>Mer</span>
        </button>
      </nav>
    </>
  )
}
