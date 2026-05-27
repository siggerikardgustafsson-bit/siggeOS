import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek,
  endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth,
  differenceInDays, isToday
} from 'date-fns'
import { sv } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Loader, RefreshCw } from 'lucide-react'

const EVENT_TYPES = {
  training:   { label: 'Träning',      color: '#3b82f6', emoji: '💪' },
  run:        { label: 'Löpning',      color: '#10b981', emoji: '🏃' },
  pa:         { label: 'PA-pass',      color: '#f97316', emoji: '🌙' },
  exam:       { label: 'Tenta',        color: '#ef4444', emoji: '📝' },
  mandatory:  { label: 'Obligatorisk', color: '#8b5cf6', emoji: '🎓' },
  journal:    { label: 'Journal',      color: '#06b6d4', emoji: '📔' },
  health:     { label: 'Hälsa',        color: '#10b981', emoji: '❤️' },
  erik:       { label: 'Erik',         color: '#f59e0b', emoji: '💼' },
}

function EventDot({ type }) {
  const t = EVENT_TYPES[type] || EVENT_TYPES.training
  return (
    <div style={{
      fontSize: '9px', padding: '1px 4px', borderRadius: '3px',
      background: t.color + '25', color: t.color, fontWeight: '600',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      maxWidth: '100%',
    }}>
      {t.emoji} {t.label}
    </div>
  )
}

export default function KalenderPage() {
  const { user } = useAuth()
  const [month, setMonth] = useState(new Date())
  const [events, setEvents] = useState({}) // date -> events[]
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [filterTypes, setFilterTypes] = useState(new Set(Object.keys(EVENT_TYPES)))

  useEffect(() => { if (user) fetchAll() }, [user, month])

  async function fetchAll() {
    setLoading(true)
    const start = format(startOfMonth(month), 'yyyy-MM-dd')
    const end = format(endOfMonth(month), 'yyyy-MM-dd')

    const [trainRes, paRes, examRes, mandRes, journalRes, healthRes, erikRes] = await Promise.all([
      supabase.from('training_sessions').select('date, session_type, distance_km, duration_minutes, notes').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase.from('pa_shifts').select('date, hours_worked, shift_type, start_time, end_time').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase.from('course_exams').select('exam_date, name, courses(name)').eq('user_id', user.id).not('exam_date', 'is', null).gte('exam_date', start).lte('exam_date', end),
      supabase.from('mandatory_sessions').select('date, title, start_time, end_time, attended').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase.from('journal_entries').select('date, mood, energy').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase.from('health_logs').select('date, weight_kg, steps').eq('user_id', user.id).gte('date', start).lte('date', end),
      supabase.from('erik_tasks').select('deadline, title, tag').eq('user_id', user.id).not('deadline', 'is', null).gte('deadline', start).lte('deadline', end),
    ])

    const map = {}
    const add = (date, type, data) => {
      if (!map[date]) map[date] = []
      map[date].push({ type, ...data })
    }

    for (const s of trainRes.data || []) {
      const t = s.session_type === 'run' ? 'run' : 'training'
      add(s.date, t, { label: s.session_type === 'run' ? `${s.distance_km?.toFixed(1) || '?'}km` : 'Gym', sub: s.duration_minutes ? `${s.duration_minutes}min` : '', notes: s.notes })
    }
    for (const s of paRes.data || []) {
      add(s.date, 'pa', { label: `${s.shift_type === 'sov' ? '😴' : '👁️'} ${s.hours_worked?.toFixed(1)}h`, sub: s.shift_type })
    }
    for (const e of examRes.data || []) {
      add(e.exam_date, 'exam', { label: e.name, sub: e.courses?.name })
    }
    for (const m of mandRes.data || []) {
      const timeStr = m.start_time ? format(parseISO(m.start_time), 'HH:mm') + (m.end_time ? '–' + format(parseISO(m.end_time), 'HH:mm') : '') : null
      add(m.date, 'mandatory', { label: m.title, attended: m.attended, id: m.id, time: timeStr })
    }
    for (const j of journalRes.data || []) {
      add(j.date, 'journal', { label: `humör ${j.mood}/10`, sub: `energi ${j.energy}/10` })
    }
    for (const h of healthRes.data || []) {
      if (h.weight_kg || h.steps) add(h.date, 'health', { label: h.weight_kg ? `${h.weight_kg}kg` : '', sub: h.steps ? `${h.steps.toLocaleString('sv-SE')} steg` : '' })
    }
    for (const t of erikRes.data || []) {
      add(t.deadline, 'erik', { label: t.title, sub: t.tag })
    }

    setEvents(map)
    setLoading(false)
  }

  async function syncMandatory() {
    setSyncing(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?action=mandatory`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }
      })
      const data = await res.json()
      alert(`✓ Synkade ${data.synced || 0} obligatoriska moment`)
      await fetchAll()
    } catch(e) { alert('Sync misslyckades: ' + e.message) }
    setSyncing(false)
  }

  async function toggleAttended(eventId, current) {
    await supabase.from('mandatory_sessions').update({ attended: !current }).eq('id', eventId)
    await fetchAll()
  }

  const calStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const calEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  const dayHeaders = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']

  const selectedEvents = selectedDay ? (events[selectedDay] || []) : []
  const filteredEvents = (date) => (events[date] || []).filter(e => filterTypes.has(e.type))

  // Month stats
  const allEvents = Object.values(events).flat()
  const trainCount = allEvents.filter(e => e.type === 'training' || e.type === 'run').length
  const paCount = allEvents.filter(e => e.type === 'pa').length
  const mandCount = allEvents.filter(e => e.type === 'mandatory').length
  const examCount = allEvents.filter(e => e.type === 'exam').length

  return (
    <div className="page-wrap">

      {/* Floating sticky header */}
      <div className="page-header">
        <div>
          <div className="page-header-title">Kalender</div>
          <div className="page-header-sub">{format(month, 'MMMM yyyy', { locale: sv })}</div>
        </div>
        <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
          <button onClick={syncMandatory} disabled={syncing} className="btn btn-ghost" style={{ fontSize: '12px' }}>{syncing ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={13} />} Synka</button><button onClick={() => setMonth(subMonths(month, 1))} className="btn btn-ghost" style={{ padding: '7px 10px' }}><ChevronLeft size={15} /></button><button onClick={() => setMonth(new Date())} className="btn btn-ghost" style={{ fontSize: '12px' }}>Idag</button><button onClick={() => setMonth(addMonths(month, 1))} className="btn btn-ghost" style={{ padding: '7px 10px' }}><ChevronRight size={15} /></button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="page-content-scroll">
      <div style={{ padding: '16px 16px 0', maxWidth: '1200px', margin: '0 auto' }}>
      </div>

      {/* Month title */}
      <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', textTransform: 'capitalize' }}>
        {format(month, 'MMMM yyyy', { locale: sv })}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
        {Object.entries(EVENT_TYPES).map(([key, { label, color, emoji }]) => {
          const active = filterTypes.has(key)
          return (
            <button key={key} onClick={() => {
              const next = new Set(filterTypes)
              if (active) next.delete(key); else next.add(key)
              setFilterTypes(next)
            }} style={{
              padding: '4px 10px', borderRadius: '20px', border: `1px solid ${active ? color : 'var(--border)'}`,
              background: active ? color + '18' : 'transparent', color: active ? color : 'var(--muted)',
              fontSize: '11px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              transition: 'all 0.15s',
            }}>
              {emoji} {label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedDay ? '1fr 300px' : '1fr', gap: '16px', alignItems: 'start' }}>

        {/* Calendar grid */}
        <div className="card" style={{ padding: '16px' }}>
          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
            {dayHeaders.map(d => (
              <div key={d} style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', fontWeight: '600', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const dayEvents = filteredEvents(dateStr)
              const inMonth = isSameMonth(day, month)
              const today = isToday(day)
              const isSelected = selectedDay === dateStr
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              const hasExam = dayEvents.some(e => e.type === 'exam')
              const hasPA = dayEvents.some(e => e.type === 'pa')

              return (
                <div key={dateStr} onClick={() => setSelectedDay(isSelected ? null : dateStr)} style={{
                  minHeight: '68px', padding: '4px', borderRadius: '6px', cursor: 'pointer',
                  background: isSelected ? 'var(--accent-soft)' : today ? 'rgba(79,142,247,0.06)' : hasExam ? 'rgba(239,68,68,0.04)' : hasPA ? 'rgba(249,115,22,0.04)' : isWeekend ? 'rgba(255,255,255,0.01)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--accent-border)' : today ? 'var(--accent-border)' : dayEvents.length > 0 ? 'var(--border)' : 'transparent'}`,
                  opacity: inMonth ? 1 : 0.3,
                  transition: 'all 0.12s',
                  overflow: 'hidden',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: today ? '700' : '400', color: today ? 'var(--accent)' : isWeekend ? 'var(--muted2)' : 'var(--muted)', marginBottom: '3px' }}>
                    {format(day, 'd')}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                    {dayEvents.slice(0, 4).map((ev, i) => {
                      const t = EVENT_TYPES[ev.type]
                      return (
                        <div key={i} style={{
                          width: '14px', height: '14px', borderRadius: '3px',
                          background: t.color + '25', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '9px', flexShrink: 0,
                        }} title={ev.label}>
                          {t.emoji}
                        </div>
                      )
                    })}
                    {dayEvents.length > 4 && (
                      <div style={{ fontSize: '8px', color: 'var(--muted)', lineHeight: '14px' }}>+{dayEvents.length - 4}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDay && (
          <div className="card" style={{ position: 'sticky', top: '24px', maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontWeight: '600', fontSize: '14px', textTransform: 'capitalize' }}>
                {format(parseISO(selectedDay), 'EEEE d MMMM', { locale: sv })}
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '18px' }}>×</button>
            </div>

            {selectedEvents.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inget loggat denna dag</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedEvents.map((ev, i) => {
                  const t = EVENT_TYPES[ev.type]
                  return (
                    <div key={i} style={{ padding: '10px 12px', borderRadius: '10px', background: t.color + '10', border: `1px solid ${t.color}25` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '14px' }}>{t.emoji}</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: t.color }}>{t.label}</span>
                        {ev.type === 'mandatory' && (
                          <button onClick={() => toggleAttended(ev.id, ev.attended)} style={{
                            marginLeft: 'auto', fontSize: '10px', padding: '2px 8px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                            background: ev.attended ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.08)',
                            color: ev.attended ? '#10b981' : 'var(--muted)', fontFamily: 'Inter, sans-serif',
                          }}>
                            {ev.attended ? '✓ Närvaro' : 'Markera'}
                          </button>
                        )}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '500', lineHeight: '1.4' }}>{ev.label}</div>
                      {ev.time && <div style={{ fontSize: '11px', color: t.color, fontWeight: '600', marginTop: '3px' }}>🕐 {ev.time}</div>}
                      {ev.sub && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{ev.sub}</div>}
                      {ev.notes && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', fontStyle: 'italic' }}>{ev.notes}</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
      </div>
  )
}
