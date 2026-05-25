import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Plus, X, Save, Loader, Calendar, Briefcase, ChevronDown,
  ChevronUp, Check, Clock, DollarSign, FileText, MessageSquare,
  Tag, AlertTriangle, ExternalLink
} from 'lucide-react'

const ERIK_TAGS = [
  'Hotell Vänersborg',
  'Brålanda Vandrarhem',
  'Tygladan',
  'Vargöns Varuhus',
  'Övriga fastigheter',
  'Övrig verksamhet',
  'Personal',
]

const TASK_STATUSES = [
  { id: 'ej_påbörjat', label: 'Ej påbörjat', color: '#6b7280' },
  { id: 'pågående',    label: 'Pågående',    color: '#f59e0b' },
  { id: 'klart',       label: 'Klart',       color: '#10b981' },
]

const TAG_COLORS = {
  'Hotell Vänersborg':   '#3b82f6',
  'Brålanda Vandrarhem': '#8b5cf6',
  'Tygladan':            '#ec4899',
  'Vargöns Varuhus':     '#f97316',
  'Övriga fastigheter':  '#06b6d4',
  'Övrig verksamhet':    '#6b7280',
  'Personal':            '#10b981',
}

function KanbanColumn({ title, color, tasks, onEdit, onMove, onDelete }) {
  return (
    <div style={{ flex: 1, minWidth: '0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto' }}>{tasks.length}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '60px' }}>
        {tasks.map(task => {
          const daysLeft = task.deadline ? Math.ceil((new Date(task.deadline) - new Date()) / 86400000) : null
          const urgent = daysLeft !== null && daysLeft <= 2 && task.status !== 'klart'
          const tagColor = TAG_COLORS[task.tag] || '#6b7280'
          return (
            <div key={task.id} className="card-sm" style={{
              cursor: 'pointer',
              borderColor: urgent ? 'rgba(239,68,68,0.3)' : 'var(--border)',
              background: urgent ? 'rgba(239,68,68,0.04)' : 'var(--surface2)',
            }} onClick={() => onEdit(task)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', lineHeight: '1.4', flex: 1, marginRight: '8px' }}>{task.title}</div>
                <button onClick={e => { e.stopPropagation(); onDelete(task.id) }}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4, flexShrink: 0, padding: '0' }}>
                  <X size={12} />
                </button>
              </div>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                  background: tagColor + '20', color: tagColor, fontWeight: '500' }}>
                  {task.tag}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {daysLeft !== null && (
                  <span style={{ fontSize: '11px', color: urgent ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : 'var(--muted)' }}>
                    {urgent && <AlertTriangle size={10} style={{ marginRight: '3px' }} />}
                    {daysLeft < 0 ? 'Försenad' : daysLeft === 0 ? 'Idag' : `${daysLeft}d`}
                  </span>
                )}
                <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
                  {TASK_STATUSES.filter(s => s.id !== task.status).map(s => (
                    <button key={s.id} onClick={e => { e.stopPropagation(); onMove(task.id, s.id) }}
                      style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                        color: 'var(--muted)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                      → {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function JobbPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('pa') // pa | erik | tidrapport
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  // PA state
  const [paShifts, setPaShifts] = useState([])
  const [calendarEvents, setCalendarEvents] = useState([])
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  const [showNewShift, setShowNewShift] = useState(false)
  const [shiftForm, setShiftForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '22:00',
    end_time: '07:00',
    client_name: '',
    notes: '',
  })

  // Erik state
  const [erikTasks, setErikTasks] = useState([])
  const [erikPayments, setErikPayments] = useState([])
  const [erikContacts, setErikContacts] = useState([])
  const [showNewTask, setShowNewTask] = useState(false)
  const [showNewPayment, setShowNewPayment] = useState(false)
  const [showNewContact, setShowNewContact] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [expandedContact, setExpandedContact] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)

  const [taskForm, setTaskForm] = useState({
    title: '', description: '', deadline: '', tag: 'Övrig verksamhet', priority: 'medium', notes: ''
  })
  const [paymentForm, setPaymentForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'), amount: '', description: ''
  })
  const [contactForm, setContactForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'), channel: 'telefon', summary: ''
  })

  useEffect(() => {
    if (user) { fetchAll(); checkCalendarConnection() }
  }, [user, selectedMonth])

  async function fetchAll() {
    const start = format(startOfMonth(selectedMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(selectedMonth), 'yyyy-MM-dd')

    const [shiftsRes, tasksRes, paymentsRes, contactsRes] = await Promise.all([
      supabase.from('pa_shifts').select('*').eq('user_id', user.id)
        .gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).order('status').order('deadline'),
      supabase.from('erik_payments').select('*').eq('user_id', user.id)
        .gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('erik_contact_log').select('*').eq('user_id', user.id)
        .order('date', { ascending: false }).limit(20),
    ])

    setPaShifts(shiftsRes.data || [])
    setErikTasks(tasksRes.data || [])
    setErikPayments(paymentsRes.data || [])
    setErikContacts(contactsRes.data || [])
  }

  async function checkCalendarConnection() {
    const { data } = await supabase
      .from('google_calendar_tokens')
      .select('id')
      .eq('user_id', user.id)
      .single()
    setCalendarConnected(!!data)
  }

  async function connectGoogleCalendar() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.readonly',
        redirectTo: window.location.href,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) console.error(error)
  }

  async function fetchCalendarEvents() {
    setLoadingCalendar(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const providerToken = session?.provider_token

      if (!providerToken) {
        alert('Koppla Google Calendar först')
        setLoadingCalendar(false)
        return
      }

      const start = new Date(startOfMonth(selectedMonth)).toISOString()
      const end = new Date(endOfMonth(selectedMonth)).toISOString()

      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start}&timeMax=${end}&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${providerToken}` } }
      )
      const data = await resp.json()

      if (data.items) {
        // Filter PA-related events
        const paEvents = data.items.filter(e => {
          const title = (e.summary || '').toLowerCase()
          return title.includes('pa') || title.includes('natt') || title.includes('pass') || title.includes('jobb')
        })
        setCalendarEvents(data.items)

        // Auto-suggest PA shifts from calendar
        if (paEvents.length > 0) {
          alert(`Hittade ${paEvents.length} möjliga PA-pass i kalendern. De visas nu i listan nedan.`)
        }
      }
    } catch (err) {
      console.error('Calendar fetch failed:', err)
    }
    setLoadingCalendar(false)
  }

  async function saveShift() {
    setSaving(true)
    const startDt = new Date(`${shiftForm.date}T${shiftForm.start_time}`)
    let endDate = shiftForm.date
    // If end time is earlier than start, it's next day
    if (shiftForm.end_time < shiftForm.start_time) {
      const next = new Date(shiftForm.date)
      next.setDate(next.getDate() + 1)
      endDate = format(next, 'yyyy-MM-dd')
    }
    const endDt = new Date(`${endDate}T${shiftForm.end_time}`)
    const hours = (endDt - startDt) / 3600000

    await supabase.from('pa_shifts').insert({
      user_id: user.id,
      date: shiftForm.date,
      start_time: startDt.toISOString(),
      end_time: endDt.toISOString(),
      hours_worked: Math.round(hours * 100) / 100,
      client_name: shiftForm.client_name,
      notes: shiftForm.notes,
      is_night_shift: shiftForm.start_time >= '20:00' || shiftForm.start_time <= '06:00',
    })

    await fetchAll()
    setShiftForm({ date: format(new Date(), 'yyyy-MM-dd'), start_time: '22:00', end_time: '07:00', client_name: '', notes: '' })
    setShowNewShift(false)
    setSaving(false)
  }

  async function deleteShift(id) {
    if (!window.confirm('Ta bort detta pass?')) return
    await supabase.from('pa_shifts').delete().eq('id', id)
    await fetchAll()
  }

  async function saveTask() {
    setSaving(true)
    if (editingTask) {
      await supabase.from('erik_tasks').update({
        title: taskForm.title, description: taskForm.description,
        deadline: taskForm.deadline || null, tag: taskForm.tag,
        priority: taskForm.priority, notes: taskForm.notes,
      }).eq('id', editingTask.id)
    } else {
      await supabase.from('erik_tasks').insert({
        user_id: user.id, title: taskForm.title, description: taskForm.description,
        deadline: taskForm.deadline || null, tag: taskForm.tag,
        priority: taskForm.priority, notes: taskForm.notes,
        status: 'ej_påbörjat',
      })
    }
    await fetchAll()
    setTaskForm({ title: '', description: '', deadline: '', tag: 'Övrig verksamhet', priority: 'medium', notes: '' })
    setShowNewTask(false)
    setEditingTask(null)
    setSaving(false)
  }

  async function moveTask(id, status) {
    await supabase.from('erik_tasks').update({ status }).eq('id', id)
    await fetchAll()
  }

  async function deleteTask(id) {
    if (!window.confirm('Ta bort uppdraget?')) return
    await supabase.from('erik_tasks').delete().eq('id', id)
    await fetchAll()
  }

  async function savePayment() {
    setSaving(true)
    await supabase.from('erik_payments').insert({
      user_id: user.id, date: paymentForm.date,
      amount: parseFloat(paymentForm.amount),
      description: paymentForm.description,
    })
    // Also log to income (not counting toward CSN)
    await supabase.from('income_logs').insert({
      user_id: user.id, date: paymentForm.date,
      amount: parseFloat(paymentForm.amount),
      source: 'Erik Norling',
      counts_toward_csn: false,
      notes: paymentForm.description,
    })
    await fetchAll()
    setPaymentForm({ date: format(new Date(), 'yyyy-MM-dd'), amount: '', description: '' })
    setShowNewPayment(false)
    setSaving(false)
  }

  async function saveContact() {
    setSaving(true)
    await supabase.from('erik_contact_log').insert({
      user_id: user.id, date: contactForm.date,
      channel: contactForm.channel, summary: contactForm.summary,
    })
    await fetchAll()
    setContactForm({ date: format(new Date(), 'yyyy-MM-dd'), channel: 'telefon', summary: '' })
    setShowNewContact(false)
    setSaving(false)
  }

  // Stats
  const totalHours = paShifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0)
  const totalErikThisMonth = erikPayments.reduce((sum, p) => sum + p.amount, 0)
  const activeTasks = erikTasks.filter(t => t.status !== 'klart')
  const urgentTasks = erikTasks.filter(t => {
    if (t.status === 'klart' || !t.deadline) return false
    return Math.ceil((new Date(t.deadline) - new Date()) / 86400000) <= 2
  })

  const kanbanCols = TASK_STATUSES.map(s => ({
    ...s,
    tasks: erikTasks.filter(t => t.status === s.id),
  }))

  const tabs = [
    { id: 'pa',         label: 'PA-jobb' },
    { id: 'erik',       label: 'Erik Norling' },
    { id: 'tidrapport', label: 'Tidrapport' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '600' }}>Jobb</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            <span style={{ marginRight: '12px' }}>⏱ {totalHours.toFixed(1)}h PA denna månad</span>
            {urgentTasks.length > 0 && <span style={{ color: '#ef4444' }}>⚠️ {urgentTasks.length} brådskande uppdrag</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} className="btn btn-ghost" style={{ padding: '7px 10px' }}>←</button>
          <button onClick={() => setSelectedMonth(new Date())} className="btn btn-ghost" style={{ fontSize: '12px' }}>Idag</button>
          <button onClick={() => setSelectedMonth(subMonths(selectedMonth, -1))} className="btn btn-ghost" style={{ padding: '7px 10px' }}>→</button>
        </div>
      </div>

      {/* Month label */}
      <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px', textTransform: 'capitalize' }}>
        {format(selectedMonth, 'MMMM yyyy', { locale: sv })}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', borderRadius: '10px', padding: '4px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--surface3)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontWeight: '500', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ===== PA-JOBB ===== */}
      {activeTab === 'pa' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Pass', value: paShifts.length, color: '#3b82f6' },
              { label: 'Timmar', value: `${totalHours.toFixed(1)}h`, color: '#10b981' },
              { label: 'Nattpass', value: paShifts.filter(s => s.is_night_shift).length, color: '#8b5cf6' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card">
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                <div className="mono" style={{ fontSize: '22px', fontWeight: '600', color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Google Calendar */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500' }}>Google Calendar</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {calendarConnected ? 'Kopplad — hämta pass från din kalender' : 'Koppla för att importera pass automatiskt'}
                </div>
              </div>
              {calendarConnected ? (
                <button onClick={fetchCalendarEvents} className="btn btn-ghost" style={{ fontSize: '12px' }} disabled={loadingCalendar}>
                  {loadingCalendar ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Hämtar...</> : <><Calendar size={13} /> Hämta pass</>}
                </button>
              ) : (
                <button onClick={connectGoogleCalendar} className="btn btn-primary" style={{ fontSize: '12px' }}>
                  <ExternalLink size={13} /> Koppla Google
                </button>
              )}
            </div>

            {/* Calendar events */}
            {calendarEvents.length > 0 && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', fontWeight: '600' }}>
                  HÄNDELSER DENNA MÅNAD ({calendarEvents.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
                  {calendarEvents.map(event => (
                    <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'var(--surface2)', borderRadius: '6px', fontSize: '12px' }}>
                      <span>{event.summary}</span>
                      <span style={{ color: 'var(--muted)' }}>
                        {event.start?.dateTime ? format(parseISO(event.start.dateTime), 'd MMM HH:mm', { locale: sv }) : event.start?.date}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* New shift button */}
          <button onClick={() => setShowNewShift(true)} className="btn btn-primary" style={{ marginBottom: '16px' }}>
            <Plus size={14} /> Logga pass
          </button>

          {showNewShift && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Logga PA-pass</div>
                <button onClick={() => setShowNewShift(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                  <input className="input" type="date" value={shiftForm.date} onChange={e => setShiftForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Brukare (valfritt)</label>
                  <input className="input" placeholder="Namn..." value={shiftForm.client_name} onChange={e => setShiftForm(f => ({ ...f, client_name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Starttid</label>
                  <input className="input" type="time" value={shiftForm.start_time} onChange={e => setShiftForm(f => ({ ...f, start_time: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Sluttid</label>
                  <input className="input" type="time" value={shiftForm.end_time} onChange={e => setShiftForm(f => ({ ...f, end_time: e.target.value }))} />
                </div>
              </div>

              {/* Calculated hours */}
              {shiftForm.start_time && shiftForm.end_time && (() => {
                const s = new Date(`${shiftForm.date}T${shiftForm.start_time}`)
                let e = new Date(`${shiftForm.date}T${shiftForm.end_time}`)
                if (shiftForm.end_time < shiftForm.start_time) e.setDate(e.getDate() + 1)
                const h = (e - s) / 3600000
                return h > 0 ? (
                  <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: '6px', marginBottom: '12px', fontSize: '13px', color: '#10b981' }}>
                    ⏱ {h.toFixed(1)} timmar
                    {shiftForm.start_time >= '20:00' || shiftForm.start_time <= '06:00' ? ' · 🌙 Nattpass' : ''}
                  </div>
                ) : null
              })()}

              <input className="input" placeholder="Anteckningar (valfritt)" value={shiftForm.notes}
                onChange={e => setShiftForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: '12px' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewShift(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveShift} className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Shifts list */}
          {paShifts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga pass loggade denna månad</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {paShifts.map(shift => (
                <div key={shift.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '3px' }}>
                        {shift.is_night_shift ? '🌙 ' : '☀️ '}
                        {format(parseISO(shift.date), 'EEEE d MMM', { locale: sv })}
                        {shift.client_name && ` · ${shift.client_name}`}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                        {shift.start_time && format(parseISO(shift.start_time), 'HH:mm')} –{' '}
                        {shift.end_time && format(parseISO(shift.end_time), 'HH:mm')}
                      </div>
                      {shift.notes && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px', fontStyle: 'italic' }}>{shift.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="mono" style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
                        {shift.hours_worked?.toFixed(1)}h
                      </div>
                      <button onClick={() => deleteShift(shift.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4 }}>
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== ERIK NORLING ===== */}
      {activeTab === 'erik' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Aktiva uppdrag', value: activeTasks.length, color: '#f59e0b' },
              { label: 'Betalningar denna månad', value: `${totalErikThisMonth.toLocaleString('sv-SE')} kr`, color: '#10b981' },
              { label: 'Brådskande', value: urgentTasks.length, color: urgentTasks.length > 0 ? '#ef4444' : '#6b7280' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card">
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                <div className="mono" style={{ fontSize: urgentTasks.length > 0 && label === 'Brådskande' ? '22px' : '18px', fontWeight: '600', color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button onClick={() => { setShowNewTask(true); setEditingTask(null); setTaskForm({ title: '', description: '', deadline: '', tag: 'Övrig verksamhet', priority: 'medium', notes: '' }) }}
              className="btn btn-primary" style={{ fontSize: '13px' }}>
              <Plus size={14} /> Nytt uppdrag
            </button>
            <button onClick={() => setShowNewPayment(true)} className="btn btn-ghost" style={{ fontSize: '13px', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
              <DollarSign size={14} /> Logga betalning
            </button>
            <button onClick={() => setShowNewContact(true)} className="btn btn-ghost" style={{ fontSize: '13px' }}>
              <MessageSquare size={14} /> Logga kontakt
            </button>
          </div>

          {/* Task form */}
          {(showNewTask || editingTask) && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>{editingTask ? 'Redigera uppdrag' : 'Nytt uppdrag'}</div>
                <button onClick={() => { setShowNewTask(false); setEditingTask(null) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Titel</label>
                  <input className="input" placeholder="Vad ska göras?" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Tagg</label>
                  <select className="input" value={taskForm.tag} onChange={e => setTaskForm(f => ({ ...f, tag: e.target.value }))}>
                    {ERIK_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Deadline</label>
                  <input className="input" type="date" value={taskForm.deadline} onChange={e => setTaskForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Beskrivning</label>
                  <textarea className="input" rows={2} placeholder="Detaljer..." value={taskForm.description}
                    onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Anteckningar</label>
                  <textarea className="input" rows={2} placeholder="Egna anteckningar..." value={taskForm.notes}
                    onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowNewTask(false); setEditingTask(null) }} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveTask} className="btn btn-primary" disabled={saving || !taskForm.title}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Payment form */}
          {showNewPayment && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Logga betalning från Erik</div>
                <button onClick={() => setShowNewPayment(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Belopp (kr)</label>
                  <input className="input" type="number" placeholder="0" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: '20px' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                  <input className="input" type="date" value={paymentForm.date} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Beskrivning</label>
                  <input className="input" placeholder="Vad för?" value={paymentForm.description} onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>
              <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.08)', borderRadius: '6px', marginBottom: '12px', fontSize: '12px', color: '#10b981' }}>
                💡 Räknas inte mot CSN-fribeloppet
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewPayment(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={savePayment} className="btn btn-primary" disabled={saving || !paymentForm.amount}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Contact form */}
          {showNewContact && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Logga kontakt med Erik</div>
                <button onClick={() => setShowNewContact(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kanal</label>
                  <select className="input" value={contactForm.channel} onChange={e => setContactForm(f => ({ ...f, channel: e.target.value }))}>
                    {['telefon', 'sms', 'möte', 'mail', 'övrigt'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                  <input className="input" type="date" value={contactForm.date} onChange={e => setContactForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Vad diskuterades?</label>
                  <textarea className="input" rows={3} placeholder="Kort sammanfattning..." value={contactForm.summary}
                    onChange={e => setContactForm(f => ({ ...f, summary: e.target.value }))} style={{ resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewContact(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveContact} className="btn btn-primary" disabled={saving || !contactForm.summary}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Kanban */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
            {kanbanCols.map(col => (
              <KanbanColumn key={col.id} title={col.label} color={col.color} tasks={col.tasks}
                onEdit={task => { setEditingTask(task); setTaskForm({ title: task.title, description: task.description || '', deadline: task.deadline || '', tag: task.tag || 'Övrig verksamhet', priority: task.priority || 'medium', notes: task.notes || '' }) }}
                onMove={moveTask} onDelete={deleteTask} />
            ))}
          </div>

          {/* Payments this month */}
          {erikPayments.length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>
                BETALNINGAR — {format(selectedMonth, 'MMMM', { locale: sv }).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {erikPayments.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ fontSize: '13px' }}>{p.description || 'Betalning'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{format(parseISO(p.date), 'd MMM', { locale: sv })}</div>
                    </div>
                    <div className="mono" style={{ fontSize: '14px', fontWeight: '600', color: '#10b981' }}>
                      {p.amount.toLocaleString('sv-SE')} kr
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', fontWeight: '600' }}>
                  <span style={{ fontSize: '13px' }}>Totalt</span>
                  <span className="mono" style={{ fontSize: '14px', color: '#10b981' }}>{totalErikThisMonth.toLocaleString('sv-SE')} kr</span>
                </div>
              </div>
            </div>
          )}

          {/* Contact log */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', cursor: 'pointer' }}
              onClick={() => setExpandedContact(!expandedContact)}>
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600' }}>KONTAKTLOGG</div>
              {expandedContact ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
            </div>
            {expandedContact && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {erikContacts.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Ingen kontakt loggad ännu</div>
                ) : erikContacts.map(c => (
                  <div key={c.id} style={{ padding: '10px', background: 'var(--surface2)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6' }}>{c.channel}</span>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{format(parseISO(c.date), 'd MMM yyyy', { locale: sv })}</span>
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: '1.5' }}>{c.summary}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== TIDRAPPORT ===== */}
      {activeTab === 'tidrapport' && (
        <>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '16px' }}>
            Tidrapport för {format(selectedMonth, 'MMMM yyyy', { locale: sv })}
          </div>

          {paShifts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga pass loggade denna månad</div>
            </div>
          ) : (
            <div className="card">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                    {['Datum', 'Start', 'Slut', 'Timmar', 'Typ', 'Brukare'].map(h => (
                      <th key={h} style={{ padding: '8px', textAlign: 'left', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...paShifts].reverse().map(shift => (
                    <tr key={shift.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 8px' }}>{format(parseISO(shift.date), 'd MMM', { locale: sv })}</td>
                      <td className="mono" style={{ padding: '10px 8px' }}>{shift.start_time ? format(parseISO(shift.start_time), 'HH:mm') : '—'}</td>
                      <td className="mono" style={{ padding: '10px 8px' }}>{shift.end_time ? format(parseISO(shift.end_time), 'HH:mm') : '—'}</td>
                      <td className="mono" style={{ padding: '10px 8px', color: '#10b981', fontWeight: '600' }}>{shift.hours_worked?.toFixed(1)}</td>
                      <td style={{ padding: '10px 8px' }}>{shift.is_night_shift ? '🌙 Natt' : '☀️ Dag'}</td>
                      <td style={{ padding: '10px 8px', color: 'var(--muted)' }}>{shift.client_name || '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: '600' }}>
                    <td colSpan={3} style={{ padding: '10px 8px' }}>Totalt</td>
                    <td className="mono" style={{ padding: '10px 8px', color: '#10b981' }}>{totalHours.toFixed(1)}h</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
