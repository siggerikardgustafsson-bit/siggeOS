import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, BookOpen, Dumbbell, Heart,
  DollarSign, GraduationCap, Briefcase,
  BarChart2, MessageSquare, LogOut, Compass, Settings, CalendarDays, Download,
  ChevronRight,
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
  { to: '/kalender',    icon: CalendarDays,    label: 'Kalender' },
  { to: '/insights',    icon: BarChart2,       label: 'Insights' },
  { to: '/export',      icon: Download,        label: 'Exportera' },
]

export default function Sidebar() {
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="maxx-rail">
      <aside className="maxx-rail-panel">

        {/* Logo / brand */}
        <div className="maxx-rail-brand">
          <div className="maxx-rail-mark">
            <span>M</span>
            <i className="maxx-rail-mark-ring" />
          </div>
          <div className="maxx-rail-label maxx-rail-wordmark">
            <span className="brand-logo-main">Maxx</span><span className="brand-logo-os">It</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="maxx-rail-nav">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `maxx-rail-item ${isActive ? 'active' : ''}`}
            >
              <span className="maxx-rail-ico"><Icon size={18} /></span>
              <span className="maxx-rail-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom — settings + sign out */}
        <div className="maxx-rail-foot">
          <NavLink
            to="/installningar"
            className={({ isActive }) => `maxx-rail-item ${isActive ? 'active' : ''}`}
          >
            <span className="maxx-rail-ico"><Settings size={18} /></span>
            <span className="maxx-rail-label">Inställningar</span>
          </NavLink>

          <button onClick={handleSignOut} className="maxx-rail-item maxx-rail-signout" type="button">
            <span className="maxx-rail-ico"><LogOut size={18} /></span>
            <span className="maxx-rail-label">Logga ut</span>
          </button>
        </div>

        {/* Hover hint chevron */}
        <span className="maxx-rail-hint"><ChevronRight size={14} /></span>
      </aside>
    </div>
  )
}
