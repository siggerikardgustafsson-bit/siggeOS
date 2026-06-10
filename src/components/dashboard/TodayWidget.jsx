import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { Dumbbell, Briefcase, FileText, Stethoscope, CheckSquare, Clock } from 'lucide-react'

const EVENT_TYPES = {
  training:  { color: '#4f8ef7', Icon: Dumbbell,     label: 'Träning' },
  pa_shift:  { color: '#34d399', Icon: Briefcase,    label: 'PA-pass' },
  exam:      { color: '#f87171', Icon: FileText,      label: 'Tenta' },
  mandatory: { color: '#a78bfa', Icon: Stethoscope,  label: 'Obligatorisk' },
  task:      { color: '#fbbf24', Icon: CheckSquare,  label: 'Uppgift' },
}

export default function TodayWidget({ userId }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayDisplay = format(new Date(), 'EEEE d MMM').charAt(0).toUpperCase() + format(new Date(), 'EEEE d MMM').slice(1)

  useEffect(() => {
    if (!userId) return
    async function fetch() {
      setLoading(true)
      const [
        { data: training },
        { data: shifts },
        { data: exams },
        { data: mandatory },
        { data: tasks },
      ] = await Promise.all([
        supabase.from('training_sessions').select('date,session_type,distance_km,duration_minutes').eq('user_id', userId).eq('date', today),
        supabase.from('pa_shifts').select('date,start_time,end_time,hours_worked,shift_type').eq('user_id', userId).eq('date', today),
        supabase.from('course_exams').select('exam_date,name,courses(name)').eq('user_id', userId).eq('exam_date', today),
        supabase.from('mandatory_sessions').select('date,title,start_time,end_time,attended').eq('user_id', userId).eq('date', today),
        supabase.from('erik_tasks').select('deadline,title,tag').eq('user_id', userId).eq('deadline', today),
      ])

      const all = []
      ;(training || []).forEach(t => all.push({
        type: 'training',
        title: t.session_type || 'Träning',
        sub: t.distance_km ? t.distance_km + ' km' : t.duration_minutes ? t.duration_minutes + ' min' : '',
        time: null,
      }))
      ;(shifts || []).forEach(s => all.push({
        type: 'pa_shift',
        title: 'PA-pass' + (s.shift_type ? ' · ' + s.shift_type : ''),
        sub: s.hours_worked ? s.hours_worked + ' timmar' : '',
        time: s.start_time ? s.start_time.slice(0,5) : null,
      }))
      ;(exams || []).forEach(e => all.push({
        type: 'exam',
        title: e.name,
        sub: e.courses?.name || '',
        time: null,
      }))
      ;(mandatory || []).forEach(m => all.push({
        type: 'mandatory',
        title: m.title,
        sub: m.attended ? 'Närvaro bekräftad' : '',
        time: m.start_time ? m.start_time.slice(0,5) : null,
      }))
      ;(tasks || []).forEach(t => all.push({
        type: 'task',
        title: t.title,
        sub: t.tag || '',
        time: null,
      }))

      all.sort((a, b) => {
        if (!a.time) return 1
        if (!b.time) return -1
        return a.time.localeCompare(b.time)
      })

      setEvents(all)
      setLoading(false)
    }
    fetch()
  }, [userId, today])

  return (
    <div style={{
      background: 'var(--surface)',
      backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--r-lg)',
      padding: '18px',
      boxShadow: 'var(--glass-shadow)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--border2), transparent)',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>Idag</div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{todayDisplay}</div>
        </div>
        <div style={{
          fontSize: '10px', fontWeight: 700,
          padding: '3px 9px', borderRadius: '20px',
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-border)',
          color: 'var(--accent)',
          letterSpacing: '0.05em',
        }}>
          {events.length} händelse{events.length !== 1 ? 'r' : ''}
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--muted)', fontSize: '12px', padding: '12px 0', textAlign: 'center' }}>Laddar...</div>
      ) : events.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 0', textAlign: 'center' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '12px', display: 'grid', placeItems: 'center', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.28)' }}>
            <CheckSquare size={18} color="#34d399" />
          </div>
          <div style={{ color: 'var(--muted2)', fontSize: '12px', fontWeight: 600 }}>Allt klart idag</div>
          <div style={{ color: 'var(--muted)', fontSize: '10.5px' }}>Inga schemalagda händelser</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {events.map((ev, i) => {
            const cfg = EVENT_TYPES[ev.type]
            const IconComp = cfg.Icon
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px',
                background: cfg.color + '0d',
                border: '1px solid ' + cfg.color + '22',
                borderRadius: '10px',
                borderLeft: '2px solid ' + cfg.color,
              }}>
                <span style={{ color: cfg.color, flexShrink: 0, display: 'flex' }}>
                  <IconComp size={14} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {ev.title}
                  </div>
                  {ev.sub && (
                    <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '1px' }}>{ev.sub}</div>
                  )}
                </div>
                {ev.time && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 600, color: cfg.color, flexShrink: 0 }}>
                    <Clock size={10} /> {ev.time}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
