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

  return (
    <>
      {/* More menu overlay */}
      {showMore && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
        }} onClick={() => setShowMore(false)}>
          <div style={{
            position: 'absolute', bottom: '70px', left: 0, right: 0,
            background: 'var(--surface)',
            backdropFilter: 'blur(20px)',
            borderTop: '1px solid var(--border)',
            padding: '16px',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--muted)' }}>ALLA SIDOR</div>
              <button onClick={() => setShowMore(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {moreNav.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} onClick={() => setShowMore(false)} style={({ isActive }) => ({
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
                  padding: '12px 8px', borderRadius: '10px', textDecoration: 'none',
                  background: isActive ? 'var(--accent-soft)' : 'var(--surface2)',
                  border: `1px solid ${isActive ? 'var(--accent-border)' : 'var(--border)'}`,
                  color: isActive ? 'var(--accent)' : 'var(--muted2)',
                  fontSize: '11px', fontWeight: '500', transition: 'all 0.15s',
                })}>
                  <Icon size={18} />
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
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid var(--border)',
        display: 'flex', zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
      }}>
        {primaryNav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '10px 4px', textDecoration: 'none',
            color: isActive ? 'var(--accent)' : 'var(--muted)', fontSize: '10px',
            gap: '3px', transition: 'color 0.15s',
          })}>
            <Icon size={20} />
            {label}
          </NavLink>
        ))}

        {/* Mer-knapp */}
        <button onClick={() => setShowMore(!showMore)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '10px 4px', background: 'none', border: 'none',
          color: showMore ? 'var(--accent)' : 'var(--muted)', fontSize: '10px',
          gap: '3px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}>
          <Grid size={20} />
          Mer
        </button>
      </nav>
    </>
  )
}
