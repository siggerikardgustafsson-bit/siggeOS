import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, BookOpen, Dumbbell,
  DollarSign, Heart, GraduationCap, Briefcase, Compass,
  BarChart2, CalendarDays, Download, Settings, X, Grid, Target
} from 'lucide-react'

const primaryNav = [
  { to: '/',        icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/jarvis',  icon: MessageSquare,   label: 'Jarvis' },
  { to: '/traning', icon: Dumbbell,        label: 'Träning' },
  { to: '/halsa',   icon: Heart,           label: 'Hälsa' },
]

const moreNav = [
  { to: '/mal',         icon: Target,        label: 'Mål' },
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

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }} onClick={() => setShowMore(false)}>
          <div style={{
            position: 'absolute', bottom: 'calc(60px + env(safe-area-inset-bottom))',
            left: '8px', right: '8px',
            background: 'var(--surface)',
            backdropFilter: 'blur(32px)',
            WebkitBackdropFilter: 'blur(32px)',
            border: '1px solid var(--glass-border)',
            borderRadius: '20px',
            padding: '16px',
            boxShadow: 'var(--glass-shadow)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--muted)', letterSpacing: '0.08em' }}>ALLA SIDOR</div>
              <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {moreNav.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setShowMore(false)} style={({ isActive }) => ({
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  padding: '14px 8px', borderRadius: '12px', textDecoration: 'none',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface2)',
                  border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border)'}`,
                  color: isActive ? 'var(--accent)' : 'var(--muted2)',
                  fontSize: '11px', fontWeight: '500', transition: 'all 0.15s',
                })}>
                  <Icon size={20} />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        borderTop: '1px solid var(--glass-border)',
        display: 'flex', zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.25)',
      }}>
        {primaryNav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '10px 4px 8px', textDecoration: 'none',
            color: isActive ? 'var(--accent)' : 'var(--muted)', fontSize: '10px',
            fontWeight: '500', gap: '4px', transition: 'color 0.15s',
            minWidth: '44px',
          })}>
            <Icon size={22} />
            {label}
          </NavLink>
        ))}

        {/* Mer-knapp */}
        <button onClick={() => setShowMore(!showMore)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '10px 4px 8px', background: 'none', border: 'none',
          color: showMore ? 'var(--accent)' : 'var(--muted)', fontSize: '10px',
          fontWeight: '500', gap: '4px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
          minWidth: '44px',
        }}>
          <Grid size={22} />
          Mer
        </button>
      </nav>
    </>
  )
}
