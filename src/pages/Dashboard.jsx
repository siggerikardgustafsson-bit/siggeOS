import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays, differenceInDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import {
  Dumbbell, Heart, GraduationCap, DollarSign,
  BookOpen, Briefcase, Zap, TrendingUp, TrendingDown,
  AlertTriangle, ChevronRight, Moon, Scale, Footprints,
  Clock, CheckCircle2
} from 'lucide-react'

const WEIGHTS = {
  training: 0.20,
  health:   0.20,
  study:    0.15,
  economy:  0.15,
  journal:  0.15,
  work:     0.15,
}

const CATEGORIES = [
  { key: 'training', label: 'Träning',  icon: Dumbbell,     to: '/traning',  color: '#3b82f6' },
  { key: 'health',   label: 'Hälsa',    icon: Heart,        to: '/halsa',    color: '#10b981' },
  { key: 'study',    label: 'Plugg',    icon: GraduationCap,to: '/plugg',    color: '#f59e0b' },
  { key: 'economy',  label: 'Ekonomi',  icon: DollarSign,   to: '/ekonomi',  color: '#8b5cf6' },
  { key: 'journal',  label: 'Journal',  icon: BookOpen,     to: '/journal',  color: '#06b6d4' },
  { key: 'work',     label: 'Jobb',     icon: Briefcase,    to: '/jobb',     color: '#f97316' },
]

function ScoreRing({ score, size = 120, strokeWidth = 10, color = '#3b82f6', children }) {
  const r = (size - strokeWidth) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }} />
      <foreignObject x={0} y={0} width={size} height={size} style={{ transform: 'rotate(90deg)' }}>
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          {children}
        </div>
      </foreignObject>
    </svg>
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
  const [latestHealth, setLatestHealth] = useState(null)
  const [paThisMonth, setPaThisMonth] = useState(0)
  const [nextPaShift, setNextPaShift] = useState(null)
  const [studyThisWeek, setStudyThisWeek] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (!user) return; fetchAll() }, [user])

  function getHalfYearStart() {
    const now = new Date()
    return now.getMonth() < 6 ? `${now.getFullYear()}-01-01` : `${now.getFullYear()}-07-01`
  }

  async function fetchAll() {
    setLoading(true)
    const halfStart = getHalfYearStart()
    const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    const [scoresRes, weekRes, csnRes, examsRes, tasksRes, journalRes, healthRes, paRes, nextPaRes, studyRes] = await Promise.all([
      supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('daily_scores').select('*').eq('user_id', user.id).gte('date', format(subDays(new Date(), 6), 'yyyy-MM-dd')).order('date'),
      supabase.from('income_logs').select('amount').eq('user_id', user.id).eq('counts_toward_csn', true).gte('date', halfStart).lte('date', today),
      supabase.from('course_exams').select('name, exam_date, courses(name)').eq('user_id', user.id).is('grade', null).not('exam_date', 'is', null).gte('exam_date', today).order('exam_date').limit(4),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).neq('status', 'klart').order('deadline').limit(4),
      supabase.from('journal_entries').select('mood, energy, sleep_hours, sleep_type').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('health_logs').select('weight_kg, steps, energy').eq('user_id', user.id).order('date', { ascending: false }).limit(1).single(),
      supabase.from('pa_shifts').select('hours_worked').eq('user_id', user.id).gte('date', monthStart).lte('date', today),
      supabase.from('pa_shifts').select('date, start_time, end_time, hours_worked').eq('user_id', user.id).gte('date', today).order('date').limit(1).single(),
      supabase.from('study_sessions').select('hours').eq('user_id', user.id).gte('date', weekAgo),
    ])

    setCsnUsage((csnRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0))
    setScores(scoresRes.data)
    setWeekScores(weekRes.data || [])
    setUpcomingExams(examsRes.data || [])
    setErikTasks(tasksRes.data || [])
    setTodayJournal(journalRes.data)
    setLatestHealth(healthRes.data)
    setPaThisMonth((paRes.data || []).reduce((sum, s) => sum + (s.hours_worked || 0), 0))
    setNextPaShift(nextPaRes.data)
    setStudyThisWeek((studyRes.data || []).reduce((sum, s) => sum + (s.hours || 0), 0))
    setLoading(false)
  }

  const totalScore = scores
    ? Math.round(CATEGORIES.reduce((sum, c) => sum + (scores[`score_${c.key}`] || 0) * WEIGHTS[c.key], 0))
    : 0

  const peakMode = CATEGORIES.filter(c => (scores?.[`score_${c.key}`] || 0) >= 70).length >= 4
  const csnPct = (csnUsage / 114500) * 100
  const csnWarn = csnPct >= 80
  const momentumTrend = weekScores.length >= 2
    ? weekScores[weekScores.length - 1]?.total_score - weekScores[0]?.total_score
    : 0
  const dateLabel = format(new Date(), "EEEE d MMMM", { locale: sv })
  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'God morgon' : hour < 17 ? 'God dag' : hour < 21 ? 'God kväll' : 'God natt'

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
      Laddar...
    </div>
  )

  return (
    <div style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ color: 'var(--muted)', fontSize: '13px', textTransform: 'capitalize' }}>{dateLabel}</div>
        <div style={{ fontSize: '24px', fontWeight: '600', marginTop: '2px' }}>
          {greeting}, Sigge
          {peakMode && <span style={{ marginLeft: '10px', fontSize: '14px', color: '#10b981', fontWeight: '500' }}>⚡ Peak mode</span>}
        </div>
      </div>

      {/* ROW 1: Score ring + category tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* Main score */}
        <div className={`card ${peakMode ? 'peak-glow' : ''}`} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '8px', padding: '20px 24px', minWidth: '170px',
        }}>
          <ScoreRing score={totalScore} size={120} strokeWidth={9} color={peakMode ? '#10b981' : '#3b82f6'}>
            <div className="mono" style={{ fontSize: '30px', fontWeight: '700', color: peakMode ? '#10b981' : 'var(--text)', lineHeight: 1 }}>{totalScore}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.05em', marginTop: '2px' }}>DAGSSCORE</div>
          </ScoreRing>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: momentumTrend >= 0 ? '#10b981' : '#ef4444' }}>
            {momentumTrend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span className="mono">{momentumTrend >= 0 ? '+' : ''}{momentumTrend.toFixed(0)}</span>
            <span style={{ color: 'var(--muted)' }}>7d</span>
          </div>
        </div>

        {/* Category tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
          {CATEGORIES.map(({ key, label, icon: Icon, to, color }) => {
            const val = scores?.[`score_${key}`] || 0
            return (
              <Link key={key} to={to} style={{ textDecoration: 'none' }}>
                <div className="card-sm" style={{ cursor: 'pointer', transition: 'all 0.15s', height: '100%' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = color + '60'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <Icon size={13} color={color} />
                    {val >= 70 && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />}
                  </div>
                  <div className="mono" style={{ fontSize: '22px', fontWeight: '700', color: val >= 70 ? color : 'var(--text)', marginBottom: '3px', lineHeight: 1 }}>
                    {Math.round(val)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px' }}>{label}</div>
                  <div style={{ height: '3px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${val}%`, background: color, borderRadius: '2px', transition: 'width 0.6s' }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ROW 2: Vitals strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', marginBottom: '14px' }}>
        {[
          { label: 'Vikt', value: latestHealth?.weight_kg ? `${latestHealth.weight_kg} kg` : '—', icon: Scale, color: '#10b981' },
          { label: 'Sömn', value: todayJournal?.sleep_hours ? `${todayJournal.sleep_hours}h` : '—', icon: Moon, color: '#8b5cf6',
            sub: todayJournal?.sleep_type === 'nattjobb' ? '🌙 Nattjobb' : todayJournal?.sleep_type === 'uppdelad' ? '✂️ Uppdelad' : null },
          { label: 'Energi', value: todayJournal?.energy ? `${todayJournal.energy}/10` : '—', icon: Zap, color: '#f59e0b' },
          { label: 'Steg', value: latestHealth?.steps ? latestHealth.steps.toLocaleString('sv-SE') : '—', icon: Footprints, color: '#06b6d4' },
          { label: 'Plugg/vecka', value: `${studyThisWeek.toFixed(1)}h`, icon: GraduationCap, color: '#f59e0b' },
          { label: 'PA denna månad', value: `${paThisMonth.toFixed(1)}h`, icon: Briefcase, color: '#f97316' },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card-sm" style={{ padding: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
              <Icon size={11} color={color} />
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{label}</span>
            </div>
            <div className="mono" style={{ fontSize: '16px', fontWeight: '600', color, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '3px' }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ROW 3: Momentum + Tentor + Erik */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '14px' }}>

        {/* 7-day bars */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.05em' }}>MOMENTUM — 7 DAGAR</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '56px' }}>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
              const entry = weekScores.find(s => s.date === d)
              const val = entry?.total_score || 0
              const isToday = i === 6
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div title={`${val}`} style={{
                    width: '100%', height: `${Math.max(val * 0.56, 3)}px`,
                    background: isToday ? 'var(--blue)' : val > 0 ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.04)',
                    borderRadius: '3px 3px 0 0', transition: 'height 0.6s ease',
                  }} />
                  <span style={{ fontSize: '9px', color: isToday ? 'var(--text)' : 'var(--muted)' }}>
                    {format(subDays(new Date(), 6 - i), 'EEE', { locale: sv }).slice(0, 2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming exams */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em' }}>KOMMANDE TENTOR</div>
            <Link to="/plugg" style={{ fontSize: '11px', color: 'var(--blue)', textDecoration: 'none' }}>Alla →</Link>
          </div>
          {upcomingExams.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga tentor planerade</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {upcomingExams.map(exam => {
                const days = Math.ceil((new Date(exam.exam_date) - new Date()) / 86400000)
                const color = days <= 7 ? '#ef4444' : days <= 14 ? '#f59e0b' : 'var(--muted)'
                return (
                  <div key={exam.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '500' }}>{exam.name}</div>
                      {exam.courses?.name && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{exam.courses.name}</div>}
                    </div>
                    <div className="mono" style={{ fontSize: '12px', color, fontWeight: '600', flexShrink: 0 }}>{days}d</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Erik tasks */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em' }}>ERIK-UPPDRAG</div>
            <Link to="/jobb" style={{ fontSize: '11px', color: 'var(--blue)', textDecoration: 'none' }}>Alla →</Link>
          </div>
          {erikTasks.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga aktiva uppdrag</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {erikTasks.slice(0, 4).map(task => {
                const days = task.deadline ? Math.ceil((new Date(task.deadline) - new Date()) / 86400000) : null
                const urgent = days !== null && days <= 2
                const tagColor = {
                  'Hotell Vänersborg': '#3b82f6', 'Brålanda Vandrarhem': '#8b5cf6',
                  'Tygladan': '#ec4899', 'Vargöns Varuhus': '#f97316',
                }[task.tag] || '#6b7280'
                return (
                  <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        {urgent && <AlertTriangle size={10} color="#ef4444" />}
                        {task.title}
                      </div>
                      <div style={{ fontSize: '10px', color: tagColor }}>{task.tag}</div>
                    </div>
                    {days !== null && <div className="mono" style={{ fontSize: '11px', color: urgent ? '#ef4444' : 'var(--muted)', flexShrink: 0 }}>{days}d</div>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ROW 4: CSN + Next PA shift + Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '14px' }}>

        {/* CSN */}
        <div className={`card ${csnWarn ? 'peak-glow' : ''}`} style={csnWarn ? { borderColor: 'rgba(245,158,11,0.4)' } : {}}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em' }}>CSN FRIBELOPP</div>
            {csnWarn && <AlertTriangle size={13} color="#f59e0b" />}
          </div>
          <div className="mono" style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
            {Math.round(csnUsage).toLocaleString('sv-SE')} <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '400' }}>kr</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>av 114 500 kr</div>
          <div style={{ height: '5px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(csnPct, 100)}%`, background: csnWarn ? '#f59e0b' : '#10b981', borderRadius: '3px', transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: '10px', color: csnWarn ? '#f59e0b' : 'var(--muted)', marginTop: '5px' }}>
            {csnPct.toFixed(0)}% · {Math.round(114500 - csnUsage).toLocaleString('sv-SE')} kr kvar
          </div>
        </div>

        {/* Next PA shift */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '8px' }}>NÄSTA PASS</div>
          {nextPaShift ? (
            <>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>
                {format(parseISO(nextPaShift.date), 'EEEE d MMM', { locale: sv })}
              </div>
              <div className="mono" style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {nextPaShift.start_time ? format(parseISO(nextPaShift.start_time), 'HH:mm') : '—'}
                {' – '}
                {nextPaShift.end_time ? format(parseISO(nextPaShift.end_time), 'HH:mm') : '—'}
              </div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#f97316', marginTop: '8px' }}>
                {nextPaShift.hours_worked?.toFixed(1)}h
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga kommande pass</div>
          )}
        </div>

        {/* Quick actions */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '10px' }}>SNABBÅTGÄRDER</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {[
              { label: '+ Träningspass', to: '/traning', color: '#3b82f6' },
              { label: todayJournal ? '✓ Journal' : '+ Journal', to: '/journal', color: '#06b6d4', done: !!todayJournal },
              { label: '+ Utgift', to: '/ekonomi', color: '#8b5cf6' },
              { label: '+ Studiepass', to: '/plugg', color: '#f59e0b' },
              { label: '⚡ Jarvis', to: '/jarvis', color: '#10b981' },
              { label: '📊 Insights', to: '/insights', color: '#a78bfa' },
            ].map(({ label, to, color, done }) => (
              <Link key={label} to={to} style={{
                padding: '7px 12px', borderRadius: '7px',
                background: done ? color + '20' : color + '12',
                border: `1px solid ${color}${done ? '50' : '25'}`,
                color, textDecoration: 'none', fontSize: '12px', fontWeight: '500',
                transition: 'all 0.15s',
              }}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
