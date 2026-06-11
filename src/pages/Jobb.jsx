import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Plus, X, Save, Loader, Calendar, Briefcase, ChevronDown,
  ChevronUp, Check, Clock, DollarSign, FileText, MessageSquare,
  Tag, AlertTriangle, ExternalLink, FolderKanban, Circle, Edit2, Trash2
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

// Fasta storhelger (samma datum varje år)
const FASTA_STORHELGER = [
  '01-01', // Nyårsdagen
  '01-06', // Trettondedag jul
  '05-01', // Första maj
  '06-06', // Nationaldagen
  '12-24', // Julafton
  '12-25', // Juldagen
  '12-26', // Annandag jul
  '12-31', // Nyårsafton
]

// Beräkna påskdagen (Computus, Meeus/Jones/Butcher-algoritmen) → Date
function getEasterSunday(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3 = mars, 4 = april
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Beräkna alla rörliga storhelger för ett givet år → Set av 'MM-dd'
function getRorligaStorhelger(year) {
  const easter = getEasterSunday(year)
  const dates = [
    addDays(easter, -2), // Långfredag
    addDays(easter, -1), // Påskafton
    easter,              // Påskdagen
    addDays(easter, 1),  // Annandag påsk
    addDays(easter, 39), // Kristi himmelsfärdsdag
  ]
  // Midsommarafton = fredag mellan 19–25 juni
  for (let day = 19; day <= 25; day++) {
    const d = new Date(year, 5, day)
    if (d.getDay() === 5) { dates.push(d); break }
  }
  return new Set(dates.map(d => format(d, 'MM-dd')))
}

// Cache per år så vi inte räknar om för varje pass
const _storhelgCache = {}
function getStorhelgerForYear(year) {
  if (!_storhelgCache[year]) {
    _storhelgCache[year] = new Set([...FASTA_STORHELGER, ...getRorligaStorhelger(year)])
  }
  return _storhelgCache[year]
}

function isStorhelg(date) {
  const mmdd = format(date, 'MM-dd')
  return getStorhelgerForYear(date.getFullYear()).has(mmdd)
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

function KanbanColumn({ title, color, statusId, tasks, onEdit, onMove, onDelete, onDrop }) {
  const [dragOver, setDragOver] = useState(false)

  return (
    <div
      style={{ flex: 1, minWidth: '0' }}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const id = e.dataTransfer.getData('taskId'); if (id) onDrop(id, statusId) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
        <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--muted)' }}>{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: 'auto' }}>{tasks.length}</div>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '60px',
        borderRadius: '10px', padding: dragOver ? '6px' : '0',
        background: dragOver ? color + '0a' : 'transparent',
        border: dragOver ? `1px dashed ${color}50` : '1px solid transparent',
        transition: 'all 0.15s',
      }}>
        {tasks.map(task => {
          const daysLeft = task.deadline ? Math.ceil((new Date(task.deadline) - new Date()) / 86400000) : null
          const urgent = daysLeft !== null && daysLeft <= 2 && task.status !== 'klart'
          const tagColor = TAG_COLORS[task.tag] || '#6b7280'
          return (
            <div
              key={task.id}
              className="card-sm"
              draggable
              onDragStart={e => { e.dataTransfer.setData('taskId', task.id); e.currentTarget.style.opacity = '0.5' }}
              onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
              style={{
                cursor: 'grab',
                borderColor: urgent ? 'rgba(239,68,68,0.3)' : 'var(--border)',
                background: urgent ? 'rgba(239,68,68,0.04)' : 'var(--surface2)',
              }}
              onClick={() => onEdit(task)}
            >
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
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectKanban({ tasks, onEdit, onMove, onDelete }) {
  const [dragOver, setDragOver] = useState(null)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {TASK_STATUSES.map(col => {
        const colTasks = tasks.filter(t => t.status === col.id)
        const isOver = dragOver === col.id
        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('taskId'); if (id) onMove(id, col.id) }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color }} />
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>{col.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{colTasks.length}</div>
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60,
              borderRadius: 10, padding: isOver ? 6 : 0,
              background: isOver ? col.color + '0a' : 'transparent',
              border: isOver ? `1px dashed ${col.color}50` : '1px solid transparent',
              transition: 'all 0.15s',
            }}>
              {colTasks.map(task => {
                const daysLeft = task.deadline ? Math.ceil((new Date(task.deadline) - new Date()) / 86400000) : null
                const urgent = daysLeft !== null && daysLeft <= 2 && task.status !== 'klart'
                const prioColor = task.priority === 'high' ? '#ef4444' : task.priority === 'medium' ? '#f59e0b' : '#6b7280'
                return (
                  <div
                    key={task.id}
                    className="card-sm"
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('taskId', task.id); e.currentTarget.style.opacity = '0.5' }}
                    onDragEnd={e => { e.currentTarget.style.opacity = '1' }}
                    style={{ cursor: 'grab', borderColor: urgent ? 'rgba(239,68,68,0.3)' : 'var(--border)', background: urgent ? 'rgba(239,68,68,0.04)' : 'var(--surface2)' }}
                    onClick={() => onEdit(task)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, flex: 1, marginRight: 6 }}>{task.title}</div>
                      <button onClick={e => { e.stopPropagation(); onDelete(task.id) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4, padding: 0, flexShrink: 0 }}>
                        <X size={12} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: prioColor }} />
                        {daysLeft !== null && (
                          <span style={{ fontSize: 11, color: urgent ? '#ef4444' : daysLeft <= 7 ? '#f59e0b' : 'var(--muted)' }}>
                            {daysLeft < 0 ? 'Försenad' : daysLeft === 0 ? 'Idag' : `${daysLeft}d`}
                          </span>
                        )}
                      </div>
                    </div>
                    {task.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, lineHeight: 1.4 }}>{task.description.slice(0, 80)}{task.description.length > 80 ? '…' : ''}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function JobbPage() {
  const { user } = useAuth()
  const { toast } = useToast()
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

  // Projekt state
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectTasks, setProjectTasks] = useState([])
  const [showNewProject, setShowNewProject] = useState(false)
  const [editingProjectTask, setEditingProjectTask] = useState(null)
  const [showNewProjectTask, setShowNewProjectTask] = useState(false)
  const [projectForm, setProjectForm] = useState({ name: '', type: 'sidoprojekt', client: '', color: '#4f8ef7', description: '' })
  const [projectTaskForm, setProjectTaskForm] = useState({ title: '', description: '', deadline: '', priority: 'medium', notes: '' })
  const [projectNotes, setProjectNotes] = useState('')
  const [savingProjectNotes, setSavingProjectNotes] = useState(false)
  const [projectNotesSaved, setProjectNotesSaved] = useState(false)

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
    if (user) { fetchAll(); checkCalendarConnection(); fetchProjects() }
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
      if (!session) { toast({ message: 'Inte inloggad.', type: 'error' }); setLoadingCalendar(false); return }
      const { data, error } = await supabase.functions.invoke('google-calendar-sync', {
        body: { action: 'sync' },
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (error) throw error
      if (data?.error === 'not_connected') {
        toast({ message: 'Koppla Google Calendar först.', type: 'error' })
      } else if (data?.success) {
        await fetchAll()
        toast({ message: `Synkade ${data.synced} PA-pass från Google Kalender (av ${data.pa_events} hittade).`, type: 'success' })
      } else {
        toast({ message: 'Något gick fel: ' + (data?.error || 'okänt'), type: 'error' })
      }
    } catch (err) {
      console.error(err)
      toast({ message: 'Fel: ' + err.message, type: 'error' })
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
    const removed = paShifts.find(s => s.id === id)
    setPaShifts(prev => prev.filter(s => s.id !== id))
    let undone = false
    toast({
      message: 'Pass borttaget.',
      action: { label: 'Ångra', onClick: () => { undone = true; if (removed) setPaShifts(prev => [...prev, removed]) } },
      duration: 5000,
    })
    setTimeout(async () => {
      if (undone) return
      await supabase.from('pa_shifts').delete().eq('id', id)
    }, 5000)
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
    const removed = erikTasks.find(t => t.id === id)
    setErikTasks(prev => prev.filter(t => t.id !== id))
    let undone = false
    toast({
      message: 'Uppdrag borttaget.',
      action: { label: 'Ångra', onClick: () => { undone = true; if (removed) setErikTasks(prev => [...prev, removed]) } },
      duration: 5000,
    })
    setTimeout(async () => {
      if (undone) return
      await supabase.from('erik_tasks').delete().eq('id', id)
    }, 5000)
  }

  async function savePayment() {
    const amount = parseFloat(paymentForm.amount)
    if (!isFinite(amount) || amount <= 0) {
      toast({ message: 'Ange ett giltigt belopp större än 0.', type: 'error' })
      return
    }
    setSaving(true)
    await supabase.from('erik_payments').insert({
      user_id: user.id, date: paymentForm.date,
      amount,
      description: paymentForm.description,
    })
    // Also log to income (not counting toward CSN)
    await supabase.from('income_logs').insert({
      user_id: user.id, date: paymentForm.date,
      amount,
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

  async function fetchProjects() {
    const { data } = await supabase.from('projects').select('*').eq('user_id', user.id).order('created_at')
    const projectList = data || []
    // Seed default projects if none exist
    if (projectList.length === 0) {
      const seeds = [
        { user_id: user.id, name: 'Erik Norling', type: 'jobb', client: 'Erik Norling', color: '#f59e0b', description: 'Fastigheter, uppdrag och löpande arbete för Erik.' },
        { user_id: user.id, name: 'MaxxIt', type: 'sidoprojekt', client: '', color: '#4f8ef7', description: 'Personlig life-management app byggd med React + Supabase.' },
      ]
      const { data: seeded } = await supabase.from('projects').insert(seeds).select()
      setProjects(seeded || [])
      if (seeded?.length) { setSelectedProject(seeded[0]); fetchProjectTasks(seeded[0].id) }
      return
    }
    setProjects(projectList)
    if (!selectedProject && projectList.length) {
      setSelectedProject(projectList[0])
      fetchProjectTasks(projectList[0].id)
    }
  }

  async function fetchProjectTasks(projectId) {
    const { data } = await supabase.from('project_tasks').select('*')
      .eq('project_id', projectId).order('status').order('deadline', { nullsFirst: false })
    setProjectTasks(data || [])
    // Load notes for this project
    const { data: proj } = await supabase.from('projects').select('notes').eq('id', projectId).maybeSingle()
    setProjectNotes(proj?.notes || '')
    setProjectNotesSaved(false)
  }

  async function saveProjectNotes() {
    if (!selectedProject) return
    setSavingProjectNotes(true)
    await supabase.from('projects').update({ notes: projectNotes }).eq('id', selectedProject.id)
    setSavingProjectNotes(false)
    setProjectNotesSaved(true)
    setTimeout(() => setProjectNotesSaved(false), 2000)
  }

  async function saveProject() {
    setSaving(true)
    const payload = { user_id: user.id, ...projectForm }
    const { data } = await supabase.from('projects').insert(payload).select().single()
    if (data) { setProjects(p => [...p, data]); setSelectedProject(data); setProjectTasks([]) }
    setShowNewProject(false)
    setProjectForm({ name: '', type: 'sidoprojekt', client: '', color: '#4f8ef7', description: '' })
    setSaving(false)
  }

  async function deleteProject(id) {
    if (!window.confirm('Ta bort projektet och alla dess tasks?')) return
    await supabase.from('project_tasks').delete().eq('project_id', id)
    await supabase.from('projects').delete().eq('id', id)
    const remaining = projects.filter(p => p.id !== id)
    setProjects(remaining)
    if (selectedProject?.id === id) {
      const next = remaining[0] || null
      setSelectedProject(next)
      if (next) fetchProjectTasks(next.id)
      else setProjectTasks([])
    }
  }

  async function saveProjectTask() {
    if (!selectedProject) return
    setSaving(true)
    const payload = {
      project_id: selectedProject.id,
      user_id: user.id,
      title: projectTaskForm.title,
      description: projectTaskForm.description || null,
      deadline: projectTaskForm.deadline || null,
      priority: projectTaskForm.priority,
      notes: projectTaskForm.notes || null,
      status: 'ej_påbörjat',
    }
    if (editingProjectTask) {
      await supabase.from('project_tasks').update(payload).eq('id', editingProjectTask.id)
    } else {
      await supabase.from('project_tasks').insert(payload)
    }
    await fetchProjectTasks(selectedProject.id)
    setShowNewProjectTask(false)
    setEditingProjectTask(null)
    setProjectTaskForm({ title: '', description: '', deadline: '', priority: 'medium', notes: '' })
    setSaving(false)
  }

  async function moveProjectTask(taskId, newStatus) {
    await supabase.from('project_tasks').update({ status: newStatus }).eq('id', taskId)
    setProjectTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
  }

  async function deleteProjectTask(taskId) {
    await supabase.from('project_tasks').delete().eq('id', taskId)
    setProjectTasks(prev => prev.filter(t => t.id !== taskId))
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
    { id: 'pa',         label: 'PA-jobb',    icon: Briefcase },
    { id: 'projekt',    label: 'Projekt',    icon: FolderKanban },
    { id: 'tidrapport', label: 'Tidrapport', icon: FileText },
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
      <div className="mx-segment" style={{ display: 'flex', width: '100%', marginBottom: '20px' }}>
        {tabs.map(tab => {
          const TabIcon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`mx-segment-btn ${activeTab === tab.id ? 'active' : ''}`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
              <TabIcon size={15} className="mx-seg-ico" /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* ===== PA-JOBB ===== */}
      {activeTab === 'pa' && (
        <>
          {/* Stats */}
          <div className="jobb-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Pass', value: paShifts.length, color: '#3b82f6' },
              { label: 'Timmar', value: `${totalHours.toFixed(1)}h`, color: '#10b981' },
              { label: 'Nattpass', value: paShifts.filter(s => s.is_night_shift).length, color: '#8b5cf6' },
              { label: 'Est. bruttolön', value: (() => {
                const total = paShifts.reduce((sum, s) => sum + (s.estimated_pay || calculateShiftPay(s.start_time, s.end_time, s.shift_type || 'sov') || 0), 0)
                return total > 0 ? `~${Math.round(total).toLocaleString('sv-SE')} kr` : '—'
              })(), color: '#f59e0b' },
            ].map(({ label, value, color }) => (
              <div key={label} className="pg-stat" style={{ '--pg-c': color }}>
                <div className="pg-stat-cap">{label}</div>
                <div className="pg-stat-num mono">{value}</div>
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

      {/* ===== PROJEKT ===== */}
      {activeTab === 'projekt' && (
        <>
          {/* Project selector + new project */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              {projects.map(p => (
                <button key={p.id} onClick={() => { setSelectedProject(p); fetchProjectTasks(p.id); setShowNewProjectTask(false); setEditingProjectTask(null); setProjectNotes('') }} style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px',
                  borderRadius: 20, border: '1px solid',
                  borderColor: selectedProject?.id === p.id ? p.color : 'var(--border)',
                  background: selectedProject?.id === p.id ? p.color + '18' : 'var(--surface2)',
                  color: selectedProject?.id === p.id ? p.color : 'var(--muted)',
                  fontSize: 13, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  fontWeight: selectedProject?.id === p.id ? 600 : 400,
                }}>
                  <Circle size={8} fill={p.color} color={p.color} />
                  {p.name}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewProject(v => !v)} className="btn btn-ghost" style={{ fontSize: 12 }}>
              <Plus size={12} /> Nytt projekt
            </button>
          </div>

          {/* New project form */}
          {showNewProject && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>Nytt projekt</div>
                <button onClick={() => setShowNewProject(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>NAMN</label>
                  <input className="input" placeholder="t.ex. Min app" value={projectForm.name} onChange={e => setProjectForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>TYP</label>
                  <select className="input" value={projectForm.type} onChange={e => setProjectForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="jobb">Jobb</option>
                    <option value="sidoprojekt">Sidoprojekt</option>
                    <option value="studie">Studie</option>
                    <option value="övrigt">Övrigt</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>FÄRG</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['#4f8ef7','#10b981','#f59e0b','#a78bfa','#f472b6','#06b6d4','#ef4444'].map(c => (
                      <button key={c} onClick={() => setProjectForm(f => ({ ...f, color: c }))} style={{
                        width: 24, height: 24, borderRadius: '50%', background: c, border: projectForm.color === c ? '2px solid white' : '2px solid transparent',
                        cursor: 'pointer', flexShrink: 0,
                      }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>KUND / ARBETSGIVARE</label>
                  <input className="input" placeholder="Valfritt" value={projectForm.client} onChange={e => setProjectForm(f => ({ ...f, client: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>BESKRIVNING</label>
                  <textarea className="input" rows={2} placeholder="Vad handlar projektet om?" value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewProject(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveProject} disabled={saving || !projectForm.name} className="btn btn-primary">
                  {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Selected project */}
          {selectedProject && (
            <>
              {/* Project header */}
              <div className="card" style={{ marginBottom: 16, borderColor: selectedProject.color + '30' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: selectedProject.color, flexShrink: 0 }} />
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedProject.name}</div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: selectedProject.color + '18', color: selectedProject.color, fontWeight: 600 }}>
                        {selectedProject.type}
                      </span>
                    </div>
                    {selectedProject.client && <div style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 20, marginBottom: 4 }}>Kund: {selectedProject.client}</div>}
                    {selectedProject.description && <div style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 20, lineHeight: 1.5 }}>{selectedProject.description}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setShowNewProjectTask(true); setEditingProjectTask(null); setProjectTaskForm({ title: '', description: '', deadline: '', priority: 'medium', notes: '' }) }} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
                      <Plus size={12} /> Task
                    </button>
                    <button onClick={() => deleteProject(selectedProject.id)} style={{
                      background: 'none', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 7, padding: '6px 10px',
                      color: 'rgba(248,113,113,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Project stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  {[
                    { label: 'Totalt', value: projectTasks.length, color: '#3b82f6' },
                    { label: 'Pågående', value: projectTasks.filter(t => t.status === 'pågående').length, color: '#f59e0b' },
                    { label: 'Klart', value: projectTasks.filter(t => t.status === 'klart').length, color: '#10b981' },
                    { label: 'Brådskande', value: projectTasks.filter(t => t.status !== 'klart' && t.deadline && Math.ceil((new Date(t.deadline) - new Date()) / 86400000) <= 2).length, color: '#ef4444' },
                  ].map(s => (
                    <div key={s.label} className="pg-stat" style={{ '--pg-c': s.color }}>
                      <div className="pg-stat-cap">{s.label}</div>
                      <div className="pg-stat-num mono">{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Project notes */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>ANTECKNINGAR</div>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Löpande anteckningar om projektet — idéer, kontakter, nästa steg..."
                    value={projectNotes}
                    onChange={e => { setProjectNotes(e.target.value); setProjectNotesSaved(false) }}
                    style={{ resize: 'vertical', fontSize: 13, lineHeight: 1.6 }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                    <button onClick={saveProjectNotes} disabled={savingProjectNotes} style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '5px 14px',
                      borderRadius: 7, border: '1px solid var(--border)', background: projectNotesSaved ? 'rgba(16,185,129,0.1)' : 'var(--surface2)',
                      color: projectNotesSaved ? '#10b981' : 'var(--muted)',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 500,
                      transition: 'all 0.2s',
                    }}>
                      {savingProjectNotes
                        ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</>
                        : projectNotesSaved
                        ? <><Check size={11} /> Sparat</>
                        : <><Save size={11} /> Spara</>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Task form */}
              {(showNewProjectTask || editingProjectTask) && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontWeight: 600 }}>{editingProjectTask ? 'Redigera task' : 'Ny task'}</div>
                    <button onClick={() => { setShowNewProjectTask(false); setEditingProjectTask(null) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>TITEL</label>
                      <input className="input" placeholder="Vad ska göras?" autoFocus value={projectTaskForm.title} onChange={e => setProjectTaskForm(f => ({ ...f, title: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>DEADLINE</label>
                      <input className="input" type="date" value={projectTaskForm.deadline} onChange={e => setProjectTaskForm(f => ({ ...f, deadline: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>PRIORITET</label>
                      <select className="input" value={projectTaskForm.priority} onChange={e => setProjectTaskForm(f => ({ ...f, priority: e.target.value }))}>
                        <option value="low">Låg</option>
                        <option value="medium">Medium</option>
                        <option value="high">Hög</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>BESKRIVNING</label>
                      <textarea className="input" rows={2} placeholder="Detaljer..." value={projectTaskForm.description} onChange={e => setProjectTaskForm(f => ({ ...f, description: e.target.value }))} style={{ resize: 'none' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowNewProjectTask(false); setEditingProjectTask(null) }} className="btn btn-ghost">Avbryt</button>
                    <button onClick={saveProjectTask} disabled={saving || !projectTaskForm.title} className="btn btn-primary">
                      {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Spara
                    </button>
                  </div>
                </div>
              )}

              {/* Kanban */}
              {projectTasks.length === 0 && !showNewProjectTask ? (
                <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                  <FolderKanban size={32} style={{ margin: '0 auto 12px', opacity: 0.25, display: 'block' }} />
                  <div style={{ marginBottom: 12 }}>Inga tasks ännu</div>
                  <button onClick={() => setShowNewProjectTask(true)} className="btn btn-primary" style={{ margin: '0 auto' }}>
                    <Plus size={13} /> Lägg till task
                  </button>
                </div>
              ) : (
                <ProjectKanban
                  tasks={projectTasks}
                  onEdit={task => { setEditingProjectTask(task); setProjectTaskForm({ title: task.title, description: task.description || '', deadline: task.deadline || '', priority: task.priority || 'medium', notes: task.notes || '' }); setShowNewProjectTask(false) }}
                  onMove={moveProjectTask}
                  onDelete={deleteProjectTask}
                />
              )}
            </>
          )}

          {projects.length === 0 && !showNewProject && (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <FolderKanban size={32} style={{ margin: '0 auto 12px', opacity: 0.25, display: 'block' }} />
              <div>Inga projekt ännu</div>
            </div>
          )}
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
              <div className="table-scroll-wrap">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '420px' }}>
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
            </div>
          )}
        </>
      )}
    </div>
        </div>
      </div>
  )
}