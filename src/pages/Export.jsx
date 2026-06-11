import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Download, Loader, CheckCircle, Dumbbell, Heart, BookOpen, DollarSign, Briefcase, GraduationCap, Zap, Package, Info } from 'lucide-react'
import * as XLSX from 'xlsx'

const EXPORTS = [
  {
    id: 'training',
    label: 'Träningspass',
    Icon: Dumbbell,
    description: 'Alla gympass och löppass med distans, tid, tempo och övningar',
    color: '#3b82f6',
    table: 'training_sessions',
    select: 'date, session_type, duration_minutes, distance_km, pace_per_km, feeling, notes, source',
    orderBy: 'date',
  },
  {
    id: 'health',
    label: 'Hälsadata',
    Icon: Heart,
    description: 'Vikt, sömn, steg, energi, alkohol och nikotin per dag',
    color: '#10b981',
    table: 'health_logs',
    select: 'date, weight_kg, sleep_hours, sleep_type, steps, energy, alcohol_units, nicotine',
    orderBy: 'date',
  },
  {
    id: 'journal',
    label: 'Journal',
    Icon: BookOpen,
    description: 'Alla journalanteckningar med humör, energi och reflektioner',
    color: '#06b6d4',
    table: 'journal_entries',
    select: 'date, mood, energy, sleep_hours, social_score, content',
    orderBy: 'date',
  },
  {
    id: 'economy',
    label: 'Ekonomi',
    Icon: DollarSign,
    description: 'Inkomster och utgifter per kategori',
    color: '#8b5cf6',
    tables: [
      { table: 'income_logs', select: 'date, amount, source, description', sheet: 'Inkomster' },
      { table: 'expense_logs', select: 'date, amount, category, description', sheet: 'Utgifter' },
    ],
  },
  {
    id: 'pa',
    label: 'PA-pass',
    Icon: Briefcase,
    description: 'PA-pass med timmar, lön och passtyp',
    color: '#f97316',
    table: 'pa_shifts',
    select: 'date, start_time, end_time, hours_worked, shift_type, estimated_pay',
    orderBy: 'date',
  },
  {
    id: 'study',
    label: 'Studielogg',
    Icon: GraduationCap,
    description: 'Studiesessioner och kursinfo',
    color: '#f59e0b',
    table: 'study_sessions',
    select: 'date, hours, notes',
    orderBy: 'date',
  },
  {
    id: 'scores',
    label: 'Dagsscore',
    Icon: Zap,
    description: 'Dagliga scores för träning, hälsa, plugg och ekonomi',
    color: '#a78bfa',
    table: 'daily_scores',
    select: 'date, score_training, score_health, score_study, score_economy, score_work',
    orderBy: 'date',
  },
  {
    id: 'all',
    label: 'Allt (fullständig export)',
    Icon: Package,
    description: 'Alla datapunkter i en Excel-fil med separata flikar',
    color: '#34d399',
    isAll: true,
  },
]

const PERIODS = [
  { label: '30 dagar', days: 30 },
  { label: '90 dagar', days: 90 },
  { label: '6 månader', days: 180 },
  { label: '1 år', days: 365 },
  { label: 'Allt', days: 0 },
]

export default function ExportPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [period, setPeriod] = useState(365)
  const [loading, setLoading] = useState({})
  const [done, setDone] = useState({})

  async function fetchData(table, select, orderBy) {
    let query = supabase.from(table).select(select).eq('user_id', user.id).order(orderBy || 'date')
    if (period > 0) {
      const from = format(subDays(new Date(), period), 'yyyy-MM-dd')
      query = query.gte('date', from)
    }
    const { data } = await query
    return data || []
  }

  function flattenRow(row) {
    const flat = {}
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) flat[k] = ''
      else if (typeof v === 'object') flat[k] = JSON.stringify(v)
      else flat[k] = v
    }
    return flat
  }

  async function exportSingle(exp) {
    setLoading(prev => ({ ...prev, [exp.id]: true }))
    try {
      const wb = XLSX.utils.book_new()

      if (exp.tables) {
        // Multi-sheet (economy)
        for (const t of exp.tables) {
          const data = await fetchData(t.table, t.select, 'date')
          const ws = XLSX.utils.json_to_sheet(data.map(flattenRow))
          XLSX.utils.book_append_sheet(wb, ws, t.sheet)
        }
      } else {
        const data = await fetchData(exp.table, exp.select, exp.orderBy)
        const ws = XLSX.utils.json_to_sheet(data.map(flattenRow))
        XLSX.utils.book_append_sheet(wb, ws, exp.label)
      }

      const filename = `sigge-os-${exp.id}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      XLSX.writeFile(wb, filename)
      setDone(prev => ({ ...prev, [exp.id]: true }))
      setTimeout(() => setDone(prev => ({ ...prev, [exp.id]: false })), 3000)
    } catch (e) { console.error(e); toast({ message: `Kunde inte exportera ${exp.label}`, type: 'error' }) }
    setLoading(prev => ({ ...prev, [exp.id]: false }))
  }

  async function exportAll() {
    setLoading(prev => ({ ...prev, all: true }))
    try {
      const wb = XLSX.utils.book_new()
      const exports = EXPORTS.filter(e => !e.isAll)

      for (const exp of exports) {
        if (exp.tables) {
          for (const t of exp.tables) {
            const data = await fetchData(t.table, t.select, 'date')
            if (data.length > 0) {
              const ws = XLSX.utils.json_to_sheet(data.map(flattenRow))
              XLSX.utils.book_append_sheet(wb, ws, t.sheet)
            }
          }
        } else {
          const data = await fetchData(exp.table, exp.select, exp.orderBy)
          if (data.length > 0) {
            const ws = XLSX.utils.json_to_sheet(data.map(flattenRow))
            XLSX.utils.book_append_sheet(wb, ws, exp.label)
          }
        }
      }

      const filename = `sigge-os-komplett-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
      XLSX.writeFile(wb, filename)
      setDone(prev => ({ ...prev, all: true }))
      setTimeout(() => setDone(prev => ({ ...prev, all: false })), 3000)
    } catch (e) { console.error(e); toast({ message: 'Kunde inte skapa den kompletta exporten', type: 'error' }) }
    setLoading(prev => ({ ...prev, all: false }))
  }

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Exportera data</div>
          <div className="page-header-sub">Exportera rådata för analys, backup och Jarvis-kontroll</div>
        </div>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding: '16px 16px 0', maxWidth: '900px', margin: '0 auto' }}>

      {/* Period selector */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.05em' }}>TIDSPERIOD</div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {PERIODS.map(({ label, days }) => (
            <button key={days} onClick={() => setPeriod(days)} className={`exp-period${period === days ? ' is-active' : ''}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Export cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {EXPORTS.map(exp => {
          const isLoading = loading[exp.id]
          const isDone = done[exp.id]
          return (
            <div key={exp.id} className="card exp-card" style={{ '--exp-c': exp.color || 'var(--accent)' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center', position: 'relative', paddingLeft: '4px' }}>
                <div className="exp-badge" style={{ '--exp-c': exp.color || 'var(--accent)' }}>
                  {exp.Icon && <exp.Icon size={18} color={exp.color} />}
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: exp.color }}>{exp.label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{exp.description}</div>
                </div>
              </div>
              <button
                onClick={() => exp.isAll ? exportAll() : exportSingle(exp)}
                disabled={isLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '9px 16px', borderRadius: '9px', border: 'none', cursor: 'pointer',
                  background: isDone ? 'rgba(16,185,129,0.15)' : exp.isAll ? 'var(--accent)' : 'var(--surface2)',
                  color: isDone ? '#10b981' : exp.isAll ? 'white' : 'var(--muted2)',
                  fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                  transition: 'all 0.15s', flexShrink: 0, marginLeft: '16px',
                  boxShadow: exp.isAll ? '0 2px 12px var(--accent-glow)' : 'none',
                }}>
                {isLoading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> :
                 isDone ? <CheckCircle size={14} /> : <Download size={14} />}
                {isDone ? 'Klar!' : 'Excel'}
              </button>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '20px', padding: '14px 16px', background: 'rgba(79,142,247,0.06)', border: '1px solid rgba(79,142,247,0.15)', borderRadius: '10px', fontSize: '13px', color: 'var(--muted)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <Info size={14} color='#4f8ef7' style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Filerna öppnas i Excel, Google Sheets eller Numbers. Välj "Allt" för en komplett export med alla moduler i separata flikar.</span>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    </div>
  )
}
