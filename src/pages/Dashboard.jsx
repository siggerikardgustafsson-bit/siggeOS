import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import {
  Dumbbell, Heart, GraduationCap, DollarSign,
  BookOpen, Briefcase, Zap, TrendingUp, TrendingDown,
  AlertTriangle, Moon, Scale, Clock
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

function ScoreRing({ score, size = 120, strokeWidth = 9, color = '#3b82f6', children }) {
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
  const weekAgo = format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')

  const [scores, setScores] = useState(null)
  const [weekScores, setWeekScores] = useState([])
  const [csnUsage, setCsnUsage] = useState(0)
  const [upcomingExams, setUpcomingExams] = useState([])
  const [erikTasks, setErikTasks] = useState([])
  const [todayJournal, setTodayJournal] = useState(null)
  const [latestWeight, setLatestWeight] = useState(null)
  const [paThisMonth, setPaThisMonth] = useState(0)
  const [nextPaShift, setNextPaShift] = useState(null)
  const [studyThisWeek, setStudyThisWeek] = useState(0)
  const [incomeThisWeek, setIncomeThisWeek] = useState(0)
  const [avgSleepWeek, setAvgSleepWeek] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (!user) return; fetchAll() }, [user])

  function getHalfYearStart() {
    const now = new Date()
    return now.getMonth() < 6 ? `${now.getFullYear()}-01-01` : `${now.getFullYear()}-07-01`
  }

  async function fetchAll() {
    setLoading(true)
    const halfStart = getHalfYearStart()

    const [scoresRes, weekRes, csnRes, examsRes, tasksRes, journalRes, weightRes,
           paRes, nextPaRes, studyRes, incomeRes, paWeekRes, sleepRes] = await Promise.all([
      supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('daily_scores').select('*').eq('user_id', user.id).gte('date', weekAgo).order('date'),
      supabase.from('income_logs').select('amount').eq('user_id', user.id).eq('counts_toward_csn', true).gte('date', halfStart).lte('date', today),
      supabase.from('course_exams').select('name, exam_date, courses(name)').eq('user_id', user.id).is('grade', null).not('exam_date', 'is', null).gte('exam_date', today).order('exam_date').limit(4),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).neq('status', 'klart').order('deadline').limit(4),
      supabase.from('journal_entries').select('mood, energy, sleep_hours, sleep_type').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('health_logs').select('weight_kg').eq('user_id', user.id).not('weight_kg', 'is', null).gt('weight_kg', 0).order('date', { ascending: false }).limit(1).single(),
      supabase.from('pa_shifts').select('hours_worked').eq('user_id', user.id).gte('date', monthStart).lte('date', today),
      supabase.from('pa_shifts').select('date, start_time, end_time, hours_worked').eq('user_id', user.id).gte('date', today).order('date').limit(1).single(),
      supabase.from('study_sessions').select('hours').eq('user_id', user.id).gte('date', weekAgo),
      supabase.from('erik_payments').select('amount').eq('user_id', user.id).gte('date', weekAgo).lte('date', today),
      supabase.from('pa_shifts').select('start_time, end_time, shift_type, estimated_pay').eq('user_id', user.id).gte('date', weekAgo).lte('date', today),
      supabase.from('journal_entries').select('sleep_hours').eq('user_id', user.id).gte('date', weekAgo).not('sleep_hours', 'is', null).gt('sleep_hours', 0),
    ])

    setCsnUsage((csnRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0))
    setScores(scoresRes.data)
    setWeekScores(weekRes.data || [])
    setUpcomingExams(examsRes.data || [])
    setErikTasks(tasksRes.data || [])
    setTodayJournal(journalRes.data)
    setLatestWeight(weightRes.data?.weight_kg || null)
    setPaThisMonth((paRes.data || []).reduce((sum, s) => sum + (s.hours_worked || 0), 0))
    setNextPaShift(nextPaRes.data)
    setStudyThisWeek((studyRes.data || []).reduce((sum, s) => sum + (s.hours || 0), 0))

    // Förtjänat denna vecka = Erik-betalningar + estimerad PA nettolön (brutto × 0.70)
    const erikWeek = (incomeRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0)
    const paWeekPay = (paWeekRes.data || []).reduce((sum, s) => sum + (s.estimated_pay || 0), 0)
    const paWeekNet = Math.round(paWeekPay * 0.70) // ~30% skatt
    setIncomeThisWeek(Math.round(erikWeek + paWeekNet))

    const sleepEntries = (sleepRes.data || []).filter(e => e.sleep_hours > 0)
    setAvgSleepWeek(sleepEntries.length ? sleepEntries.reduce((sum, e) => sum + e.sleep_hours, 0) / sleepEntries.length : 0)
    setLoading(false)
  }

  const totalScore = scores
    ? Math.round(CATEGORIES.reduce((sum, c) => sum + (scores[`score_${c.key}`] || 0) * WEIGHTS[c.key], 0))
    : 0
  const peakMode = CATEGORIES.filter(c => (scores?.[`score_${c.key}`] || 0) >= 70).length >= 4
  const csnPct = (csnUsage / 114500) * 100
  const csnWarn = csnPct >= 80
  const momentumTrend = weekScores.length >= 2
    ? (weekScores[weekScores.length - 1]?.total_score || 0) - (weekScores[0]?.total_score || 0)
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
      <div style={{ marginBottom: '22px' }}>
        <div style={{ color: 'var(--muted)', fontSize: '13px', textTransform: 'capitalize' }}>{dateLabel}</div>
        <div style={{ fontSize: '24px', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {greeting}, Sigge
          {peakMode && (
            <span style={{ fontSize: '13px', color: '#10b981', fontWeight: '500',
              padding: '3px 10px', borderRadius: '20px', background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.2)' }}>
              ⚡ Peak mode
            </span>
          )}
        </div>
      </div>

      {/* ROW 1: Score ring + category tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px', marginBottom: '12px' }}>

        {/* Main score */}
        <div className={`card ${peakMode ? 'peak-glow' : ''}`} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '8px', padding: '20px 24px', minWidth: '165px',
        }}>
          <ScoreRing score={totalScore} size={118} strokeWidth={9} color={peakMode ? '#10b981' : '#3b82f6'}>
            <div className="mono" style={{ fontSize: '32px', fontWeight: '700', color: peakMode ? '#10b981' : 'var(--text)', lineHeight: 1 }}>{totalScore}</div>
            <div style={{ fontSize: '9px', color: 'var(--muted)', letterSpacing: '0.08em', marginTop: '3px' }}>DAGSSCORE</div>
          </ScoreRing>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: momentumTrend >= 0 ? '#10b981' : '#ef4444' }}>
            {momentumTrend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span className="mono">{momentumTrend >= 0 ? '+' : ''}{momentumTrend.toFixed(0)}</span>
            <span style={{ color: 'var(--muted)', fontSize: '11px' }}>denna vecka</span>
          </div>
        </div>

        {/* Category tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
          {CATEGORIES.map(({ key, label, icon: Icon, to, color }) => {
            const val = scores?.[`score_${key}`] || 0
            const active = val >= 70
            return (
              <Link key={key} to={to} style={{ textDecoration: 'none' }}>
                <div className="card-sm" style={{
                  cursor: 'pointer', transition: 'all 0.15s', height: '100%',
                  borderColor: active ? color + '40' : 'var(--border)',
                  background: active ? color + '08' : 'var(--surface2)',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = color + '70'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = active ? color + '40' : 'var(--border)'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <Icon size={13} color={active ? color : 'var(--muted)'} />
                    {active && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />}
                  </div>
                  <div className="mono" style={{ fontSize: '24px', fontWeight: '700', color: active ? color : 'var(--text)', marginBottom: '2px', lineHeight: 1 }}>
                    {Math.round(val)}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '8px' }}>{label}</div>
                  <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '1px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${val}%`, background: color, borderRadius: '1px', transition: 'width 0.8s ease' }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ROW 2: Vitals — 4 kort */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
        {[
          {
            label: 'Vikt',
            value: latestWeight ? `${latestWeight} kg` : '—',
            icon: Scale, color: '#10b981',
            sub: null,
          },
          {
            label: 'Snitt sömn (7 dagar)',
            value: avgSleepWeek > 0 ? `${avgSleepWeek.toFixed(1)}h` : '—',
            icon: Moon, color: '#8b5cf6',
            sub: todayJournal?.sleep_type === 'nattjobb' ? '🌙 Nattjobb idag' : todayJournal?.sleep_type === 'uppdelad' ? '✂️ Uppdelad idag' : null,
          },
          {
            label: 'Förtjänat denna vecka (netto)',
            value: incomeThisWeek > 0 ? `${incomeThisWeek.toLocaleString('sv-SE')} kr` : '—',
            icon: DollarSign, color: '#10b981',
            sub: null,
          },
          {
            label: 'Plugg denna vecka',
            value: `${studyThisWeek.toFixed(1)}h`,
            icon: GraduationCap, color: '#f59e0b',
            sub: null,
          },
        ].map(({ label, value, icon: Icon, color, sub }) => (
          <div key={label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Icon size={12} color={color} />
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '500' }}>{label.toUpperCase()}</span>
            </div>
            <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* ROW 3: Momentum + Tentor + Erik */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>

        {/* 7-day bars */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '14px', letterSpacing: '0.05em' }}>MOMENTUM — 7 DAGAR</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '52px' }}>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd')
              const entry = weekScores.find(s => s.date === d)
              const val = entry?.total_score || 0
              const isToday = i === 6
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                  <div title={val > 0 ? String(Math.round(val)) : 'Ingen data'} style={{
                    width: '100%', height: `${Math.max(val * 0.52, 2)}px`,
                    background: isToday ? '#3b82f6' : val > 0 ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.04)',
                    borderRadius: '3px 3px 0 0', transition: 'height 0.6s ease',
                  }} />
                  <span style={{ fontSize: '9px', color: isToday ? 'var(--text)' : 'var(--muted)', fontWeight: isToday ? '600' : '400' }}>
                    {format(subDays(new Date(), 6 - i), 'EEE', { locale: sv }).slice(0, 2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming exams */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em' }}>KOMMANDE TENTOR</div>
            <Link to="/plugg" style={{ fontSize: '11px', color: 'var(--blue)', textDecoration: 'none' }}>Alla →</Link>
          </div>
          {upcomingExams.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga tentor planerade</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {upcomingExams.map(exam => {
                const days = Math.ceil((new Date(exam.exam_date) - new Date()) / 86400000)
                const color = days <= 7 ? '#ef4444' : days <= 14 ? '#f59e0b' : 'var(--muted)'
                return (
                  <div key={exam.name + exam.exam_date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exam.name}</div>
                      {exam.courses?.name && <div style={{ fontSize: '10px', color: 'var(--muted)' }}>{exam.courses.name}</div>}
                    </div>
                    <div className="mono" style={{ fontSize: '12px', color, fontWeight: '600', flexShrink: 0, marginLeft: '8px' }}>{days}d</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Erik tasks */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em' }}>ERIK-UPPDRAG</div>
            <Link to="/jobb" style={{ fontSize: '11px', color: 'var(--blue)', textDecoration: 'none' }}>Alla →</Link>
          </div>
          {erikTasks.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga aktiva uppdrag</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

      {/* ROW 4: CSN + Nästa pass + Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>

        {/* CSN */}
        <div className="card" style={csnWarn ? { borderColor: 'rgba(245,158,11,0.4)' } : {}}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em' }}>CSN FRIBELOPP</div>
            {csnWarn && <AlertTriangle size={13} color="#f59e0b" />}
          </div>
          <div className="mono" style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
            {Math.round(csnUsage).toLocaleString('sv-SE')} <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '400' }}>kr</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px' }}>av 114 500 kr</div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(csnPct, 100)}%`, background: csnWarn ? '#f59e0b' : '#10b981', borderRadius: '2px', transition: 'width 0.6s' }} />
          </div>
          <div style={{ fontSize: '10px', color: csnWarn ? '#f59e0b' : 'var(--muted)', marginTop: '5px' }}>
            {csnPct.toFixed(0)}% · {Math.round(114500 - csnUsage).toLocaleString('sv-SE')} kr kvar
          </div>
        </div>

        {/* Nästa pass */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '10px' }}>NÄSTA PASS</div>
          {nextPaShift ? (
            <>
              <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px', textTransform: 'capitalize' }}>
                {format(parseISO(nextPaShift.date), 'EEEE d MMM', { locale: sv })}
              </div>
              <div className="mono" style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>
                {nextPaShift.start_time ? format(parseISO(nextPaShift.start_time), 'HH:mm') : '—'}
                {' – '}
                {nextPaShift.end_time ? format(parseISO(nextPaShift.end_time), 'HH:mm') : '—'}
              </div>
              <div className="mono" style={{ fontSize: '22px', fontWeight: '700', color: '#f97316' }}>
                {nextPaShift.hours_worked?.toFixed(1)}<span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '400' }}>h</span>
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga kommande pass</div>
          )}
        </div>

        {/* Quick actions */}
        <div className="card">
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.05em', marginBottom: '12px' }}>SNABBÅTGÄRDER</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {[
              { label: '+ Träningspass', to: '/traning', color: '#3b82f6' },
              { label: todayJournal ? '✓ Journal idag' : '+ Journal', to: '/journal', color: '#06b6d4', done: !!todayJournal },
              { label: '+ Utgift', to: '/ekonomi', color: '#8b5cf6' },
              { label: '+ Studiepass', to: '/plugg', color: '#f59e0b' },
              { label: '⚡ Jarvis', to: '/jarvis', color: '#10b981' },
              { label: '📊 Insights', to: '/insights', color: '#a78bfa' },
            ].map(({ label, to, color, done }) => (
              <Link key={label} to={to} style={{
                padding: '7px 13px', borderRadius: '7px',
                background: done ? color + '18' : color + '10',
                border: `1px solid ${color}${done ? '45' : '22'}`,
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
