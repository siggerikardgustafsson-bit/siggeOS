import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays, startOfWeek } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import {
  Dumbbell, Heart, GraduationCap, DollarSign, Users,
  BookOpen, Briefcase, Zap, TrendingUp, AlertTriangle,
  Calendar, ChevronRight
} from 'lucide-react'

// Score weights
const WEIGHTS = {
  training: 0.20,
  health:   0.20,
  study:    0.15,
  economy:  0.15,
  social:   0.15,
  journal:  0.10,
  work:     0.05,
}

const CATEGORIES = [
  { key: 'training', label: 'Träning',  icon: Dumbbell,      to: '/traning',  color: '#3b82f6' },
  { key: 'health',   label: 'Hälsa',    icon: Heart,          to: '/halsa',    color: '#10b981' },
  { key: 'study',    label: 'Plugg',    icon: GraduationCap,  to: '/plugg',    color: '#f59e0b' },
  { key: 'economy',  label: 'Ekonomi',  icon: DollarSign,     to: '/ekonomi',  color: '#8b5cf6' },
  { key: 'social',   label: 'Socialt',  icon: Users,          to: '/socialt',  color: '#ec4899' },
  { key: 'journal',  label: 'Journal',  icon: BookOpen,       to: '/journal',  color: '#06b6d4' },
  { key: 'work',     label: 'Jobb',     icon: Briefcase,      to: '/jobb',     color: '#f97316' },
]

function ScoreRing({ score, size = 120, strokeWidth = 10, color = '#3b82f6', children }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
      />
      <foreignObject x={0} y={0} width={size} height={size} style={{ transform: 'rotate(90deg)' }}>
        <div style={{
          width: size, height: size,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column',
        }}>
          {children}
        </div>
      </foreignObject>
    </svg>
  )
}

function MiniBar({ value, color }) {
  return (
    <div style={{ height: '28px', width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, opacity: 0.7, borderRadius: '3px', transition: 'width 0.6s ease' }} />
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [scores, setScores] = useState(null)
  const [weekScores, setWeekScores] = useState([])
  const [csnUsage, setCsnUsage] = useState(0)
  const [upcomingExams, setUpcomingExams] = useState([])
  const [erikTasks, setErikTasks] = useState([])
  const [todayJournal, setTodayJournal] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    fetchAll()
  }, [user])

  async function fetchAll() {
    setLoading(true)
    const [scoresRes, weekRes, csnRes, examsRes, tasksRes, journalRes] = await Promise.all([
      supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('daily_scores').select('*').eq('user_id', user.id).gte('date', format(subDays(new Date(), 6), 'yyyy-MM-dd')).order('date'),
      supabase.rpc('get_csn_usage', { p_user_id: user.id }),
      supabase.from('courses').select('name, exam_date').eq('user_id', user.id).eq('active', true).not('exam_date', 'is', null).gte('exam_date', today).order('exam_date').limit(3),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).neq('status', 'klart').order('deadline').limit(5),
      supabase.from('journal_entries').select('mood, energy, sleep_hours').eq('user_id', user.id).eq('date', today).single(),
    ])

    setScores(scoresRes.data)
    setWeekScores(weekRes.data || [])
    setCsnUsage(csnRes.data || 0)
    setUpcomingExams(examsRes.data || [])
    setErikTasks(tasksRes.data || [])
    setTodayJournal(journalRes.data)
    setLoading(false)
  }

  const totalScore = scores
    ? Math.round(
        CATEGORIES.reduce((sum, c) => sum + (scores[`score_${c.key}`] || 0) * WEIGHTS[c.key], 0)
      )
    : 0

  const peakMode = CATEGORIES.filter(c => (scores?.[`score_${c.key}`] || 0) >= 70).length >= 4
  const csnPct = (csnUsage / 114500) * 100
  const csnWarn = csnPct >= 80

  const momentumTrend = weekScores.length >= 2
    ? weekScores[weekScores.length - 1]?.total_score - weekScores[0]?.total_score
    : 0

  const dateLabel = format(new Date(), "EEEE d MMMM", { locale: sv })

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
        Laddar...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div className="fade-up" style={{ marginBottom: '24px' }}>
        <div style={{ color: 'var(--muted)', fontSize: '13px', textTransform: 'capitalize' }}>{dateLabel}</div>
        <div style={{ fontSize: '22px', fontWeight: '600', marginTop: '2px' }}>
          God dag, Sigge
        </div>
      </div>

      {/* Top row: Main score + category scores */}
      <div className="fade-up fade-up-delay-1" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* Main score ring */}
        <div className={`card ${peakMode ? 'peak-glow' : ''}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '24px 28px', minWidth: '180px' }}>
          <ScoreRing score={totalScore} size={130} strokeWidth={10} color={peakMode ? '#10b981' : '#3b82f6'}>
            <div className="mono" style={{ fontSize: '32px', fontWeight: '600', color: peakMode ? '#10b981' : 'var(--text)' }}>{totalScore}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', letterSpacing: '0.05em' }}>DAGSSCORE</div>
          </ScoreRing>

          {peakMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#10b981', fontSize: '12px', fontWeight: '600' }}>
              <Zap size={13} />
              PEAK MODE
            </div>
          )}

          {/* Momentum */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: momentumTrend >= 0 ? '#10b981' : '#ef4444' }}>
            <TrendingUp size={13} />
            <span className="mono">{momentumTrend >= 0 ? '+' : ''}{momentumTrend.toFixed(0)}</span>
            <span style={{ color: 'var(--muted)' }}>7 dagar</span>
          </div>
        </div>

        {/* Category grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
          {CATEGORIES.map(({ key, label, icon: Icon, to, color }) => {
            const val = scores?.[`score_${key}`] || 0
            const weight = Math.round(WEIGHTS[key] * 100)
            return (
              <Link key={key} to={to} style={{ textDecoration: 'none' }}>
                <div className="card-sm" style={{ cursor: 'pointer', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = color + '50'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Icon size={14} color={color} />
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{weight}%</span>
                  </div>
                  <div className="mono" style={{ fontSize: '22px', fontWeight: '600', color: val >= 70 ? color : 'var(--text)', marginBottom: '4px' }}>
                    {Math.round(val)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>{label}</div>
                  <MiniBar value={val} color={color} />
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Second row: Week momentum + Quick stats */}
      <div className="fade-up fade-up-delay-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* 7-day momentum bars */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', fontWeight: '500' }}>MOMENTUM — 7 DAGAR</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '60px' }}>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
              const entry = weekScores.find(s => s.date === d)
              const val = entry?.total_score || 0
              const isToday = i === 6
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(val * 0.6, 4)}px`,
                    background: isToday ? 'var(--blue)' : 'rgba(59,130,246,0.3)',
                    borderRadius: '3px 3px 0 0',
                    transition: 'height 0.6s ease',
                  }} />
                  <span style={{ fontSize: '9px', color: 'var(--muted)' }}>
                    {format(subDays(new Date(), 6 - i), 'EEE', { locale: sv }).slice(0,2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Today's vitals from journal */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '12px', fontWeight: '500' }}>DAGENS VITALS</div>
          {todayJournal ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {[
                { label: 'Humör', val: todayJournal.mood, suffix: '/10' },
                { label: 'Energi', val: todayJournal.energy, suffix: '/10' },
                { label: 'Sömn', val: todayJournal.sleep_hours, suffix: 'h' },
              ].map(({ label, val, suffix }) => (
                <div key={label}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{label}</div>
                  <div className="mono" style={{ fontSize: '20px', fontWeight: '600' }}>
                    {val ?? '—'}<span style={{ fontSize: '12px', color: 'var(--muted)' }}>{suffix}</span>
                  </div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Journal</div>
                <div style={{ fontSize: '12px', color: '#10b981' }}>✓ Loggad</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Ingen journal idag</div>
              <Link to="/journal" className="btn btn-primary" style={{ fontSize: '13px', padding: '8px 14px' }}>
                Skriv journal →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Third row: CSN + Upcoming exams + Erik tasks */}
      <div className="fade-up fade-up-delay-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        {/* CSN Fribelopp */}
        <div className={`card ${csnWarn ? 'peak-glow' : ''}`} style={csnWarn ? { borderColor: 'rgba(245,158,11,0.4)' } : {}}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500' }}>CSN FRIBELOPP</div>
            {csnWarn && <AlertTriangle size={14} color="#f59e0b" />}
          </div>
          <div className="mono" style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px' }}>
            {Math.round(csnUsage).toLocaleString('sv-SE')} kr
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px' }}>av 114 500 kr</div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(csnPct, 100)}%`,
              background: csnWarn ? '#f59e0b' : '#10b981',
              borderRadius: '3px',
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ fontSize: '11px', color: csnWarn ? '#f59e0b' : 'var(--muted)', marginTop: '6px' }}>
            {csnPct.toFixed(0)}% förbrukat · {Math.round(114500 - csnUsage).toLocaleString('sv-SE')} kvar
          </div>
        </div>

        {/* Upcoming exams */}
        <div className="card">
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', fontWeight: '500' }}>TENTOR</div>
          {upcomingExams.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga tentor planerade</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {upcomingExams.map(exam => {
                const daysLeft = Math.ceil((new Date(exam.exam_date) - new Date()) / 86400000)
                return (
                  <div key={exam.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px' }}>{exam.name}</div>
                    <div className="mono" style={{ fontSize: '12px', color: daysLeft <= 7 ? '#ef4444' : daysLeft <= 14 ? '#f59e0b' : 'var(--muted)' }}>
                      {daysLeft}d
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Erik tasks */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500' }}>ERIK-UPPDRAG</div>
            <Link to="/jobb" style={{ color: 'var(--blue)', fontSize: '11px', textDecoration: 'none' }}>Alla →</Link>
          </div>
          {erikTasks.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga aktiva uppdrag</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {erikTasks.slice(0, 3).map(task => {
                const daysLeft = task.deadline
                  ? Math.ceil((new Date(task.deadline) - new Date()) / 86400000)
                  : null
                const urgent = daysLeft !== null && daysLeft <= 2
                return (
                  <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {urgent && <AlertTriangle size={11} color="#ef4444" />}
                      {task.title}
                    </div>
                    {daysLeft !== null && (
                      <div className="mono" style={{ fontSize: '11px', color: urgent ? '#ef4444' : 'var(--muted)' }}>
                        {daysLeft}d
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="fade-up fade-up-delay-4">
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '10px' }}>SNABBA ÅTGÄRDER</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {[
            { label: '+ Träningspass', to: '/traning', color: '#3b82f6' },
            { label: '+ Journalentry', to: '/journal', color: '#06b6d4' },
            { label: '+ Utgift', to: '/ekonomi', color: '#8b5cf6' },
            { label: '+ Studiepass', to: '/plugg', color: '#f59e0b' },
            { label: 'Prata med Jarvis', to: '/jarvis', color: '#10b981' },
          ].map(({ label, to, color }) => (
            <Link
              key={label}
              to={to}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: color + '15',
                border: `1px solid ${color}30`,
                color: color,
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
