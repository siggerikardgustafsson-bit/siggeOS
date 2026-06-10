import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, BookOpen, Dumbbell, Heart,
  DollarSign, GraduationCap, Briefcase, Compass, CalendarDays,
  BarChart2, Download, Settings, Search,
} from 'lucide-react'

const COMMANDS = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard',   keywords: 'hem start' },
  { to: '/jarvis',       icon: MessageSquare,   label: 'Jarvis',      keywords: 'chat ai assistent' },
  { to: '/journal',      icon: BookOpen,        label: 'Journal',     keywords: 'dagbok anteckning' },
  { to: '/traning',      icon: Dumbbell,        label: 'Träning',     keywords: 'gym workout pass' },
  { to: '/halsa',        icon: Heart,           label: 'Hälsa',       keywords: 'health sömn vikt' },
  { to: '/ekonomi',      icon: DollarSign,      label: 'Ekonomi',     keywords: 'pengar budget economy' },
  { to: '/plugg',        icon: GraduationCap,   label: 'Plugg',       keywords: 'studier skola' },
  { to: '/jobb',         icon: Briefcase,       label: 'Jobb',        keywords: 'arbete work' },
  { to: '/upplevelser',  icon: Compass,         label: 'Upplevelser', keywords: 'resor adventure' },
  { to: '/kalender',     icon: CalendarDays,    label: 'Kalender',    keywords: 'calendar agenda' },
  { to: '/insights',     icon: BarChart2,       label: 'Insights',    keywords: 'statistik analys' },
  { to: '/export',       icon: Download,        label: 'Exportera',   keywords: 'export data' },
  { to: '/installningar', icon: Settings,       label: 'Inställningar', keywords: 'settings konto tema' },
]

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.keywords.includes(q)
    )
  }, [query])

  useEffect(() => { setActive(0) }, [query])

  const go = (cmd) => {
    if (!cmd) return
    setOpen(false)
    navigate(cmd.to)
  }

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
  }

  if (!open) return null

  return (
    <div className="cmdk-overlay" onMouseDown={() => setOpen(false)}>
      <div className="cmdk-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ paddingLeft: 18, color: 'var(--muted)', display: 'inline-flex' }}>
            <Search size={18} />
          </span>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Sök sida eller kommando…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
          />
        </div>
        <div className="cmdk-list">
          {results.length === 0 && <div className="cmdk-empty">Inga träffar</div>}
          {results.map((c, i) => {
            const Icon = c.icon
            return (
              <div
                key={c.to}
                className={`cmdk-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); go(c) }}
              >
                <span className="cmdk-ico"><Icon size={16} /></span>
                {c.label}
              </div>
            )
          })}
        </div>
        <div className="cmdk-hint">
          <span><span className="cmdk-kbd">↑↓</span> navigera</span>
          <span><span className="cmdk-kbd">↵</span> öppna</span>
          <span><span className="cmdk-kbd">esc</span> stäng</span>
        </div>
      </div>
    </div>
  )
}
