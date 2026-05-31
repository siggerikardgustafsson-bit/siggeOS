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

// ===== LÖNEMODELL (Humana / Vårdföretagarna 2025-2027) =====
const PAY = {
  timlön:       149.00,
  ob_kväll:      25.87,  // 18:00–22:00
  ob_natt:       52.41,  // 22:00–06:00
  ob_helg:       64.64,  // lör/sön alla timmar
  ob_storhelg:  129.39,  // storhelger
  jour:          41.08,  // sovpass 22:00–06:00
}

// Storhelger (röda dagar + dagar som räknas som storhelg)
const STORHELGER = [
  '01-01','01-06','12-24','12-25','12-26','12-31',
  '04-18','04-19','04-20','04-21', // Påsk 2025 (uppdatera varje år)
  '05-01','05-29','06-06','06-21', // Valborg, Kristi, Nationaldagen, Midsommarafton
]

function isStorhelg(date) {
  const mmdd = format(date, 'MM-dd')
  return STORHELGER.includes(mmdd)
}

function isHelg(date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

// Beräkna OB-tillägg för ett specifikt klockslag-intervall
function calcOBForHour(hourStart, date, shiftType) {
  const h = hourStart
  const isNatt = h >= 22 || h < 6
  const isKväll = h >= 18 && h < 22
  const storhelg = isStorhelg(date)
  const helg = isHelg(date)

  let ob = 0
  if (storhelg) ob += PAY.ob_storhelg
  else if (helg) ob += PAY.ob_helg

  if (isNatt && !storhelg) ob += PAY.ob_natt
  else if (isKväll && !storhelg) ob += PAY.ob_kväll

  return ob
}

// Huvudfunktion — beräkna estimerad bruttolön för ett pass
function calculateShiftPay(startTime, endTime, shiftType) {
  if (!startTime || !endTime) return null
  const start = new Date(startTime)
  const end = new Date(endTime)
  if (end <= start) return null

  let totalPay = 0
  let current = new Date(start)

  while (current < end) {
    const next = new Date(current)
    next.setMinutes(0, 0, 0)
    next.setHours(next.getHours() + 1)
    const sliceEnd = next < end ? next : end
    const fraction = (sliceEnd - current) / 3600000 // timmar som decimal
    const h = current.getHours()
    const isNatt = h >= 22 || h < 6

    let rate
    if (shiftType === 'sov' && isNatt) {
      // Sovpass: jourersättning under nattimmarna (22-06)
      rate = PAY.jour
    } else {
      // Vaken eller dag-del av sovpass: full timlön
      rate = PAY.timlön
    }

    // OB ovanpå
    const ob = calcOBForHour(h, current, shiftType)
    totalPay += (rate + ob) * fraction
    current = next
  }

  return Math.round(totalPay)
}

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
                        color: 'var(--muted)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
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
    shift_type: 'sov',
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
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase.functions.invoke('google-calendar-sync', {
        body: { action: 'check' },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setCalendarConnected(data?.connected || false)
    } catch { setCalendarConnected(false) }
  }

  async function connectGoogleCalendar() {
    const clientId = '891411567089-bia7jceedhri8lhf5aa6hqnmuq9crv3n.apps.googleusercontent.com'
    const redirectUri = `${window.location.origin}/auth/callback`
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: 'google_calendar',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  async function syncCalendar() {
    setLoadingCalendar(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { alert('Inte inloggad'); setLoadingCalendar(false); return }
      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        body: { action: 'sync' },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (error) throw error
      if (data?.error === 'not_connected') {
        alert('Koppla Google Calendar först')
      } else if (data?.success) {
        await fetchAll()
        alert(`✓ Synkade ${data.synced} PA-pass från Google Kalender (av ${data.pa_events} hittade)`)
      } else {
        alert('Något gick fel: ' + (data?.error || 'okänt'))
      }
    } catch (err) {
      console.error(err)
      alert('Fel: ' + err.message)
    }
    setLoadingCalendar(false)
  }

  async function saveShift() {
    setSaving(true)
    const startDt = new Date(`${shiftForm.date}T${shiftForm.start_time}`)
    let endDate = shiftForm.date
    if (shiftForm.end_time < shiftForm.start_time) {
      const next = new Date(shiftForm.date)
      next.setDate(next.getDate() + 1)
      endDate = format(next, 'yyyy-MM-dd')
    }
    const endDt = new Date(`${endDate}T${shiftForm.end_time}`)
    const hours = (endDt - startDt) / 3600000
    const estimatedPay = calculateShiftPay(startDt.toISOString(), endDt.toISOString(), shiftForm.shift_type)

    await supabase.from('pa_shifts').insert({
      user_id: user.id,
      date: shiftForm.date,
      start_time: startDt.toISOString(),
      end_time: endDt.toISOString(),
      hours_worked: Math.round(hours * 100) / 100,
      client_name: shiftForm.client_name,
      notes: shiftForm.notes,
      shift_type: shiftForm.shift_type,
      estimated_pay: estimatedPay,
      is_night_shift: shiftForm.start_time >= '20:00' || shiftForm.start_time <= '06:00',
    })

    await fetchAll()
    setShiftForm({ date: format(new Date(), 'yyyy-MM-dd'), start_time: '22:00', end_time: '07:00', client_name: '', notes: '', shift_type: 'sov' })
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
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Jobb</div>
          <div className="page-header-sub">{totalHours.toFixed(1)}h PA denna månad</div>
        </div>
        <div className="page-header-actions">
          <button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} className="btn btn-ghost btn-icon">←</button><button onClick={() => setSelectedMonth(new Date())} className="btn btn-ghost">Idag</button><button onClick={() => setSelectedMonth(subMonths(selectedMonth, -1))} className="btn btn-ghost btn-icon">→</button>
        </div>
      </div>
      <div className="page-content-scroll">
        <div style={{ padding: "16px 16px 0", maxWidth: "1000px", margin: "0 auto" }}>

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
            fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ===== PA-JOBB ===== */}
      {activeTab === 'pa' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Pass', value: paShifts.length, color: '#3b82f6' },
              { label: 'Timmar', value: `${totalHours.toFixed(1)}h`, color: '#10b981' },
              { label: 'Nattpass', value: paShifts.filter(s => s.is_night_shift).length, color: '#8b5cf6' },
              { label: 'Est. bruttolön', value: (() => {
                const total = paShifts.reduce((sum, s) => sum + (s.estimated_pay || calculateShiftPay(s.start_time, s.end_time, s.shift_type || 'sov') || 0), 0)
                return total > 0 ? `~${Math.round(total).toLocaleString('sv-SE')} kr` : '—'
              })(), color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card">
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                <div className="mono" style={{ fontSize: '20px', fontWeight: '600', color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Google Calendar */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} color={calendarConnected ? '#10b981' : 'var(--muted)'} />
                  Google Calendar
                  {calendarConnected && <span style={{ fontSize: '11px', color: '#10b981' }}>● Kopplad</span>}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                  {calendarConnected
                    ? 'Synkar PA-pass automatiskt från din kalender'
                    : 'Koppla för att hämta pass direkt från Google Kalender'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {calendarConnected ? (
                  <button onClick={syncCalendar} className="btn btn-ghost" disabled={loadingCalendar}>
                    {loadingCalendar
                      ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Synkar...</>
                      : <><Calendar size={13} /> Synka nu</>}
                  </button>
                ) : (
                  <button onClick={connectGoogleCalendar} className="btn btn-primary">
                    <ExternalLink size={13} /> Koppla Google
                  </button>
                )}
              </div>
            </div>
            {calendarConnected && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)', padding: '8px 10px', background: 'rgba(16,185,129,0.06)', borderRadius: '6px' }}>
                Pass som innehåller "assistanstid" eller "hos hw" i titeln importeras automatiskt. Synka varannan vecka för att hålla listan uppdaterad.
              </div>
            )}
          </div>

          {/* Shifts list */}
          {paShifts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga pass loggade denna månad</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {paShifts.map(shift => {
                // Calculate on the fly if not stored
                const pay = shift.estimated_pay || calculateShiftPay(shift.start_time, shift.end_time, shift.shift_type || 'sov')
                const isSov = shift.shift_type === 'sov'
                return (
                  <div key={shift.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {isSov ? 'Sovpass' : 'Vak'}
                          {format(parseISO(shift.date), 'EEEE d MMM', { locale: sv })}
                          {shift.client_name && ` · ${shift.client_name}`}
                          <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                            background: isSov ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)',
                            color: isSov ? '#a78bfa' : '#60a5fa' }}>
                            {isSov ? 'Sovpass' : 'Vakenpass'}
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {shift.start_time && format(parseISO(shift.start_time), 'HH:mm')} –{' '}
                          {shift.end_time && format(parseISO(shift.end_time), 'HH:mm')}
                        </div>
                        {shift.notes && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '3px', fontStyle: 'italic' }}>{shift.notes}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono" style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
                            {shift.hours_worked?.toFixed(1)}h
                          </div>
                          {pay && (
                            <div className="mono" style={{ fontSize: '12px', color: '#f59e0b' }}>
                              ~{pay.toLocaleString('sv-SE')} kr
                            </div>
                          )}
                        </div>
                        <button onClick={() => deleteShift(shift.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4 }}>
                          <X size={14} />
                        </button>
                        <button onClick={async () => {
                          const newType = isSov ? 'vaken' : 'sov'
                          const newPay = calculateShiftPay(shift.start_time, shift.end_time, newType)
                          await supabase.from('pa_shifts').update({ shift_type: newType, estimated_pay: newPay }).eq('id', shift.id)
                          await fetchAll()
                        }} style={{
                          fontSize: '10px', padding: '3px 8px', borderRadius: '5px', cursor: 'pointer',
                          border: '1px solid var(--border)', background: 'transparent',
                          color: 'var(--muted)', fontFamily: 'Inter, sans-serif',
                        }}>
                          {isSov ? '→ Vaken' : '→ Sov'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Monthly pay summary */}
              {(() => {
                const totalPay = paShifts.reduce((sum, s) => {
                  const pay = s.estimated_pay || calculateShiftPay(s.start_time, s.end_time, s.shift_type || 'sov') || 0
                  return sum + pay
                }, 0)
                return totalPay > 0 ? (
                  <div style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Estimerad bruttolön denna månad</div>
                    <div className="mono" style={{ fontSize: '16px', fontWeight: '700', color: '#f59e0b' }}>~{Math.round(totalPay).toLocaleString('sv-SE')} kr</div>
                  </div>
                ) : null
              })()}
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
              className="btn btn-primary">
              <Plus size={14} /> Nytt uppdrag
            </button>
            <button onClick={() => setShowNewPayment(true)} className="btn btn-ghost" style={{ fontSize: '13px', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>
              <DollarSign size={14} /> Logga betalning
            </button>
            <button onClick={() => setShowNewContact(true)} className="btn btn-ghost">
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
                Räknas inte mot CSN-fribeloppet
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
                      <div>{p.description || 'Betalning'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{format(parseISO(p.date), 'd MMM', { locale: sv })}</div>
                    </div>
                    <div className="mono" style={{ fontSize: '14px', fontWeight: '600', color: '#10b981' }}>
                      {p.amount.toLocaleString('sv-SE')} kr
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', fontWeight: '600' }}>
                  <span>Totalt</span>
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
                    {['Datum', 'Start', 'Slut', 'Timmar', 'Typ', 'Est. lön'].map(h => (
                      <th key={h} style={{ padding: '8px', textAlign: 'left', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...paShifts].reverse().map(shift => {
                    const pay = shift.estimated_pay || calculateShiftPay(shift.start_time, shift.end_time, shift.shift_type || 'sov')
                    return (
                      <tr key={shift.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '10px 8px' }}>{format(parseISO(shift.date), 'd MMM', { locale: sv })}</td>
                        <td className="mono" style={{ padding: '10px 8px' }}>{shift.start_time ? format(parseISO(shift.start_time), 'HH:mm') : '—'}</td>
                        <td className="mono" style={{ padding: '10px 8px' }}>{shift.end_time ? format(parseISO(shift.end_time), 'HH:mm') : '—'}</td>
                        <td className="mono" style={{ padding: '10px 8px', color: '#10b981', fontWeight: '600' }}>{shift.hours_worked?.toFixed(1)}</td>
                        <td style={{ padding: '10px 8px' }}>{shift.shift_type === 'sov' ? 'Sov Sov' : 'Vak Vaken'}</td>
                        <td className="mono" style={{ padding: '10px 8px', color: '#f59e0b' }}>{pay ? `~${pay.toLocaleString('sv-SE')} kr` : '—'}</td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid var(--border)', fontWeight: '600' }}>
                    <td colSpan={3} style={{ padding: '10px 8px' }}>Totalt</td>
                    <td className="mono" style={{ padding: '10px 8px', color: '#10b981' }}>{totalHours.toFixed(1)}h</td>
                    <td></td>
                    <td className="mono" style={{ padding: '10px 8px', color: '#f59e0b' }}>
                      ~{Math.round(paShifts.reduce((sum, s) => sum + (s.estimated_pay || calculateShiftPay(s.start_time, s.end_time, s.shift_type || 'sov') || 0), 0)).toLocaleString('sv-SE')} kr
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
        </div>
      </div>
  )
}