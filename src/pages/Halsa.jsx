import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Save, Loader, Upload, TrendingDown, Moon, Smartphone, Wine, Cigarette, Pill, Apple, X, Plus } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const DEFAULT_SUPPLEMENTS = ['Kreatin', 'D-vitamin', 'Omega-3', 'Multivitamin', 'Magnesium']

const NICOTINE_TYPES = [
  { id: 'snus',       label: 'Snus',       emoji: '🟫' },
  { id: 'vape',       label: 'Vape',       emoji: '💨' },
  { id: 'cigaretter', label: 'Cigaretter', emoji: '🚬' },
]

function MiniLineChart({ data, dataKey, color, unit = '' }) {
  if (!data || data.length < 2) return (
    <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '12px' }}>
      Inte tillräckligt med data
    </div>
  )
  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        <XAxis dataKey="date" hide />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}
          formatter={v => [`${v}${unit}`, '']}
          labelFormatter={l => format(parseISO(l), 'd MMM', { locale: sv })}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function HalsaPage() {
  const { user } = useAuth()
  const fileRef = useRef()
  const [logs, setLogs] = useState([])
  const [supplements, setSupplements] = useState(DEFAULT_SUPPLEMENTS)
  const [newSupplement, setNewSupplement] = useState('')
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [activeTab, setActiveTab] = useState('log') // log | graphs | supplements

  const today = format(new Date(), 'yyyy-MM-dd')
  const [todayLog, setTodayLog] = useState(null)

  const [form, setForm] = useState({
    date: today,
    weight_kg: '',
    sleep_hours: '',
    sleep_quality: 7,
    screen_time_minutes: '',
    alcohol_units: '',
    nicotine: [],
    retatrutide_dose_mg: '',
    retatrutide_injected: false,
    energy: 7,
    fasting: false,
    calories: '',
    protein_g: '',
    water_liters: '',
    supplements_taken: [],
    notes: '',
  })

  useEffect(() => {
    if (user) { fetchLogs(); fetchTodayLog() }
  }, [user])

  async function fetchLogs() {
    const { data } = await supabase
      .from('health_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(90)
    setLogs(data || [])
  }

  async function fetchTodayLog() {
    const { data } = await supabase
      .from('health_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    if (data) {
      setTodayLog(data)
      setForm(f => ({
        ...f,
        weight_kg: data.weight_kg || '',
        sleep_hours: data.sleep_hours || '',
        sleep_quality: data.sleep_quality || 7,
        screen_time_minutes: data.screen_time_minutes || '',
        alcohol_units: data.alcohol_units || '',
        nicotine: data.nicotine ? ['snus'] : [], // legacy boolean
        retatrutide_dose_mg: data.retatrutide_dose_mg || '',
        energy: data.energy || 7,
      }))
    }
  }

  async function saveLog() {
    setSaving(true)

    const payload = {
      user_id: user.id,
      date: form.date,
      weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
      sleep_hours: form.sleep_hours ? parseFloat(form.sleep_hours) : null,
      sleep_quality: form.sleep_quality,
      screen_time_minutes: form.screen_time_minutes ? parseInt(form.screen_time_minutes) : null,
      alcohol_units: form.alcohol_units ? parseFloat(form.alcohol_units) : null,
      nicotine: form.nicotine.length > 0,
      retatrutide_dose_mg: form.retatrutide_injected ? parseFloat(form.retatrutide_dose_mg) || 2.5 : null,
      energy: form.energy,
      source: 'manual',
    }

    await supabase.from('health_logs').upsert(payload, { onConflict: 'user_id,date' })

    // Log nutrition if provided
    if (form.calories || form.protein_g || form.water_liters) {
      await supabase.from('nutrition_logs').upsert({
        user_id: user.id,
        date: form.date,
        total_calories: form.fasting ? 0 : (form.calories ? parseInt(form.calories) : null),
        protein_g: form.protein_g ? parseInt(form.protein_g) : null,
        water_liters: form.water_liters ? parseFloat(form.water_liters) : null,
      }, { onConflict: 'user_id,date' })
    }

    // Update health score
    let score = 50
    if (form.sleep_hours) {
      const sleepScore = form.sleep_hours >= 7 && form.sleep_hours <= 9 ? 25 : form.sleep_hours >= 6 ? 15 : 5
      score += sleepScore
    }
    if (form.alcohol_units === '' || parseFloat(form.alcohol_units) === 0) score += 15
    if (form.screen_time_minutes && parseInt(form.screen_time_minutes) <= 360) score += 10
    score = Math.min(score, 100)

    const { data: existing } = await supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', form.date).single()
    if (existing) {
      await supabase.from('daily_scores').update({ score_health: score }).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({ user_id: user.id, date: form.date, score_health: score })
    }

    await fetchLogs()
    setSaving(false)
  }

  // Apple Health XML import
  async function handleFileImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    const text = await file.text()
    const parser = new DOMParser()
    const xml = parser.parseFromString(text, 'text/xml')

    const records = xml.querySelectorAll('Record')
    const weightMap = {}
    const stepsMap = {}

    records.forEach(r => {
      const type = r.getAttribute('type')
      const dateStr = r.getAttribute('startDate')?.slice(0, 10)
      const value = parseFloat(r.getAttribute('value'))

      if (!dateStr || isNaN(value)) return

      if (type === 'HKQuantityTypeIdentifierBodyMass') {
        // Convert lbs to kg if needed
        const unit = r.getAttribute('unit')
        const kg = unit === 'lb' ? value * 0.453592 : value
        if (!weightMap[dateStr] || kg < weightMap[dateStr]) weightMap[dateStr] = Math.round(kg * 10) / 10
      }

      if (type === 'HKQuantityTypeIdentifierStepCount') {
        stepsMap[dateStr] = (stepsMap[dateStr] || 0) + Math.round(value)
      }
    })

    // Upsert all collected data
    const dates = new Set([...Object.keys(weightMap), ...Object.keys(stepsMap)])
    let count = 0

    for (const date of dates) {
      const update = {}
      if (weightMap[date]) update.weight_kg = weightMap[date]
      if (stepsMap[date]) update.steps = stepsMap[date]
      if (Object.keys(update).length > 0) {
        await supabase.from('health_logs').upsert({
          user_id: user.id,
          date,
          ...update,
          source: 'apple_health',
        }, { onConflict: 'user_id,date' })
        count++
      }
    }

    await fetchLogs()
    setImportResult({ weights: Object.keys(weightMap).length, steps: Object.keys(stepsMap).length, total: count })
    setImporting(false)
    e.target.value = ''
  }

  // Chart data
  const chartData = logs.slice().reverse().map(l => ({
    date: l.date,
    weight: l.weight_kg,
    sleep: l.sleep_hours,
    screen: l.screen_time_minutes ? Math.round(l.screen_time_minutes / 60 * 10) / 10 : null,
    alcohol: l.alcohol_units,
    energy: l.energy,
  }))

  // Latest stats
  const latestWeight = logs.find(l => l.weight_kg)?.weight_kg
  const avgSleep = logs.slice(0, 7).filter(l => l.sleep_hours).reduce((s, l, _, a) => s + l.sleep_hours / a.length, 0)
  const avgAlcohol = logs.slice(0, 7).filter(l => l.alcohol_units).reduce((s, l, _, a) => s + l.alcohol_units / a.length, 0)

  const tabs = [
    { id: 'log',         label: 'Logga' },
    { id: 'graphs',      label: 'Grafer' },
    { id: 'supplements', label: 'Tillskott' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '600' }}>Hälsa</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            {latestWeight && <span style={{ color: '#10b981', marginRight: '12px' }}>⚖️ {latestWeight} kg</span>}
            {avgSleep > 0 && <span style={{ color: '#06b6d4', marginRight: '12px' }}>💤 {avgSleep.toFixed(1)}h snitt</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input ref={fileRef} type="file" accept=".xml" onChange={handleFileImport} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} className="btn btn-ghost" style={{ fontSize: '12px' }}>
            <Apple size={13} /> Apple Health
          </button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', color: '#10b981' }}>
            ✓ Importerade {importResult.weights} viktvärden och {importResult.steps} stegtillfällen
          </span>
          <button onClick={() => setImportResult(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={14} /></button>
        </div>
      )}

      {importing && (
        <div style={{ padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--muted)' }}>
          <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Importerar Apple Health-data...
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', borderRadius: '10px', padding: '4px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--surface3)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontWeight: '500', fontFamily: 'DM Sans, sans-serif',
            transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* LOG TAB */}
      {activeTab === 'log' && (
        <div className="card">
          {/* Date */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
            <input className="input" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>

          {/* Body */}
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.05em' }}>KROPP</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Vikt (kg)</label>
              <input className="input" type="number" step="0.1" placeholder="77.0" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Energi {form.energy}/10</label>
              <input type="range" min="1" max="10" value={form.energy} onChange={e => setForm(f => ({ ...f, energy: parseInt(e.target.value) }))} style={{ width: '100%', accentColor: '#f59e0b', marginTop: '8px' }} />
            </div>
          </div>

          {/* Sleep */}
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.05em' }}>SÖMN</div>
          {todayLog?.source === 'journal' && (
            <div style={{ padding: '8px 12px', background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '6px' }}>
              💤 Sömndata hämtad från journal
              {todayLog.sleep_type && todayLog.sleep_type !== 'normal' && (
                <span style={{ color: 'var(--muted)' }}>· {todayLog.sleep_type === 'uppdelad' ? '✂️ Uppdelad' : '🌙 Nattjobb'}{todayLog.sleep_note ? ` — ${todayLog.sleep_note}` : ''}</span>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Timmar</label>
              <input className="input" type="number" step="0.5" placeholder="7.5" value={form.sleep_hours} onChange={e => setForm(f => ({ ...f, sleep_hours: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kvalitet {form.sleep_quality}/10</label>
              <input type="range" min="1" max="10" value={form.sleep_quality} onChange={e => setForm(f => ({ ...f, sleep_quality: parseInt(e.target.value) }))} style={{ width: '100%', accentColor: '#06b6d4', marginTop: '8px' }} />
            </div>
          </div>

          {/* Substances */}
          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.05em' }}>SUBSTANSER</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Alkohol (enheter)</label>
              <input className="input" type="number" step="0.5" placeholder="0" value={form.alcohol_units} onChange={e => setForm(f => ({ ...f, alcohol_units: e.target.value }))} />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Skärmtid (minuter)</label>
              <input className="input" type="number" placeholder="360" value={form.screen_time_minutes} onChange={e => setForm(f => ({ ...f, screen_time_minutes: e.target.value }))} />
            </div>
          </div>

          {/* Nicotine toggles */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Nikotin</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {NICOTINE_TYPES.map(n => {
                const active = form.nicotine.includes(n.id)
                return (
                  <button key={n.id} onClick={() => setForm(f => ({
                    ...f,
                    nicotine: active ? f.nicotine.filter(x => x !== n.id) : [...f.nicotine, n.id]
                  }))} style={{
                    padding: '8px 14px', borderRadius: '8px', border: `1px solid ${active ? '#f59e0b' : 'var(--border)'}`,
                    background: active ? 'rgba(245,158,11,0.15)' : 'transparent',
                    color: active ? '#f59e0b' : 'var(--muted)',
                    cursor: 'pointer', fontSize: '13px', fontFamily: 'DM Sans, sans-serif',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}>
                    {n.emoji} {n.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Marijuana */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Övrigt</label>
            <button onClick={() => setForm(f => ({ ...f, marijuana: !f.marijuana }))} style={{
              padding: '8px 14px', borderRadius: '8px',
              border: `1px solid ${form.marijuana ? '#10b981' : 'var(--border)'}`,
              background: form.marijuana ? 'rgba(16,185,129,0.15)' : 'transparent',
              color: form.marijuana ? '#10b981' : 'var(--muted)',
              cursor: 'pointer', fontSize: '13px', fontFamily: 'DM Sans, sans-serif',
            }}>
              🌿 Marijuana
            </button>
          </div>

          {/* Retatrutide */}
          <div style={{ marginBottom: '20px', padding: '14px', background: 'rgba(139,92,246,0.06)', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.15)' }}>
            <div style={{ fontSize: '12px', color: '#a78bfa', fontWeight: '600', marginBottom: '10px' }}>💉 RETATRUTIDE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: form.retatrutide_injected ? '10px' : '0' }}>
              <input type="checkbox" id="retinjected" checked={form.retatrutide_injected}
                onChange={e => setForm(f => ({ ...f, retatrutide_injected: e.target.checked }))}
                style={{ accentColor: '#8b5cf6', width: '16px', height: '16px', cursor: 'pointer' }} />
              <label htmlFor="retinjected" style={{ fontSize: '13px', cursor: 'pointer' }}>Injicerade idag</label>
            </div>
            {form.retatrutide_injected && (
              <div>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Dos (mg)</label>
                <input className="input" type="number" step="0.5" placeholder="2.5" value={form.retatrutide_dose_mg}
                  onChange={e => setForm(f => ({ ...f, retatrutide_dose_mg: e.target.value }))}
                  style={{ maxWidth: '120px' }} />
              </div>
            )}
          </div>

          {/* Nutrition (optional) */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              KOST <span style={{ fontWeight: '400', color: 'var(--muted)', fontSize: '11px' }}>(valfritt)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <input type="checkbox" id="fasting" checked={form.fasting}
                onChange={e => setForm(f => ({ ...f, fasting: e.target.checked }))}
                style={{ accentColor: '#f59e0b', width: '16px', height: '16px', cursor: 'pointer' }} />
              <label htmlFor="fasting" style={{ fontSize: '13px', cursor: 'pointer' }}>🕐 Fastedag</label>
            </div>
            {!form.fasting && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kalorier</label>
                  <input className="input" type="number" placeholder="2000" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Protein (g)</label>
                  <input className="input" type="number" placeholder="150" value={form.protein_g} onChange={e => setForm(f => ({ ...f, protein_g: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Vatten (L)</label>
                  <input className="input" type="number" step="0.1" placeholder="2.5" value={form.water_liters} onChange={e => setForm(f => ({ ...f, water_liters: e.target.value }))} />
                </div>
              </div>
            )}
          </div>

          <button onClick={saveLog} className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
            {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Spara hälsolog</>}
          </button>
        </div>
      )}

      {/* GRAPHS TAB */}
      {activeTab === 'graphs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { label: 'Vikt', dataKey: 'weight', color: '#10b981', unit: ' kg', refLine: 75, refLabel: 'Mål 75kg' },
            { label: 'Sömn', dataKey: 'sleep', color: '#06b6d4', unit: 'h', refLine: 7.5, refLabel: 'Mål 7.5h' },
            { label: 'Skärmtid', dataKey: 'screen', color: '#f59e0b', unit: 'h', refLine: 6, refLabel: 'Mål 6h' },
            { label: 'Alkohol (enheter)', dataKey: 'alcohol', color: '#ef4444', unit: ' enh' },
            { label: 'Energi', dataKey: 'energy', color: '#f59e0b', unit: '/10' },
          ].map(({ label, dataKey, color, unit, refLine, refLabel }) => {
            const filtered = chartData.filter(d => d[dataKey] != null)
            if (filtered.length === 0) return null
            const latest = filtered[filtered.length - 1]?.[dataKey]
            return (
              <div key={dataKey} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '500' }}>{label}</div>
                  {latest && <div className="mono" style={{ fontSize: '13px', color }}>{latest}{unit}</div>}
                </div>
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={filtered}>
                    <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    {refLine && <ReferenceLine y={refLine} stroke={color} strokeDasharray="3 3" opacity={0.4} label={{ value: refLabel, fontSize: 10, fill: color, opacity: 0.6 }} />}
                    <Tooltip
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}
                      formatter={v => [`${v}${unit}`, label]}
                      labelFormatter={l => format(parseISO(l), 'd MMM', { locale: sv })}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })}

          {/* Recent logs table */}
          <div className="card">
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '12px' }}>SENASTE 14 DAGAR</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                    {['Datum', 'Vikt', 'Sömn', 'Typ', 'Energi', 'Alkohol', 'Ret.'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 14).map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '8px', color: 'var(--muted)' }}>{format(parseISO(log.date), 'd MMM', { locale: sv })}</td>
                      <td className="mono" style={{ padding: '8px', color: '#10b981' }}>{log.weight_kg ? `${log.weight_kg}` : '—'}</td>
                      <td className="mono" style={{ padding: '8px', color: '#06b6d4' }}>{log.sleep_hours ? `${log.sleep_hours}h` : '—'}</td>
                      <td style={{ padding: '8px', fontSize: '11px', color: 'var(--muted)' }} title={log.sleep_note || ''}>
                        {log.sleep_type === 'uppdelad' ? '✂️' : log.sleep_type === 'nattjobb' ? '🌙' : log.sleep_hours ? '😴' : '—'}
                      </td>
                      <td className="mono" style={{ padding: '8px' }}>{log.energy ? `${log.energy}/10` : '—'}</td>
                      <td className="mono" style={{ padding: '8px', color: log.alcohol_units > 0 ? '#ef4444' : 'var(--muted)' }}>{log.alcohol_units > 0 ? log.alcohol_units : '—'}</td>
                      <td style={{ padding: '8px' }}>{log.nicotine ? '✓' : '—'}</td>
                      <td style={{ padding: '8px', color: '#a78bfa' }}>{log.retatrutide_dose_mg ? `${log.retatrutide_dose_mg}mg` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUPPLEMENTS TAB */}
      {activeTab === 'supplements' && (
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '14px' }}>DAGLIGA TILLSKOTT — {format(new Date(), 'd MMM', { locale: sv })}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {supplements.map(supp => {
                const taken = form.supplements_taken.includes(supp)
                return (
                  <button key={supp} onClick={() => setForm(f => ({
                    ...f,
                    supplements_taken: taken
                      ? f.supplements_taken.filter(s => s !== supp)
                      : [...f.supplements_taken, supp]
                  }))} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', borderRadius: '8px',
                    border: `1px solid ${taken ? '#10b981' : 'var(--border)'}`,
                    background: taken ? 'rgba(16,185,129,0.08)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans, sans-serif',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '50%',
                      border: `2px solid ${taken ? '#10b981' : 'var(--border)'}`,
                      background: taken ? '#10b981' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {taken && <span style={{ color: 'white', fontSize: '12px' }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '14px', color: taken ? '#10b981' : 'var(--text)' }}>💊 {supp}</span>
                  </button>
                )
              })}
            </div>

            {/* Add supplement */}
            <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <input
                className="input"
                placeholder="Lägg till tillskott..."
                value={newSupplement}
                onChange={e => setNewSupplement(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newSupplement.trim()) {
                    setSupplements(prev => [...prev, newSupplement.trim()])
                    setNewSupplement('')
                  }
                }}
              />
              <button
                onClick={() => { if (newSupplement.trim()) { setSupplements(prev => [...prev, newSupplement.trim()]); setNewSupplement('') } }}
                className="btn btn-primary" style={{ flexShrink: 0 }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '0 4px' }}>
            Tillskott-loggning sparas tillsammans med hälsologen. Bocka av och tryck "Spara hälsolog" under Logga-fliken.
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
