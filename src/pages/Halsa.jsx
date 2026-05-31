import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Loader, Upload, Apple, X, Plus, Edit2, Check, Scale, Moon, Wine, Syringe, Utensils, Pill } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const DEFAULT_SUPPLEMENTS = ['Kreatin', 'D-vitamin', 'Omega-3', 'Multivitamin', 'Magnesium']
const NICOTINE_TYPES = [
  { id: 'snus', label: 'Snus' },
  { id: 'vape', label: 'Vape' },
  { id: 'cigaretter', label: 'Cigaretter' },
]

function Widget({ title, icon, color = 'var(--accent)', children, action }) {
  return (
    <div style={{
      background: 'var(--surface)', backdropFilter: 'var(--glass-blur)',
      WebkitBackdropFilter: 'var(--glass-blur)',
      border: '1px solid var(--glass-border)', borderRadius: '16px',
      padding: '18px', boxShadow: 'var(--glass-shadow)',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: '15%', right: '15%', height: '1px', background: 'linear-gradient(90deg, transparent, var(--border2), transparent)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 28, height: 28, borderRadius: '8px', background: color + '18', border: '1px solid ' + color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
          </div>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text)' }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function SaveBtn({ onClick, saving, saved }) {
  return (
    <button onClick={onClick} disabled={saving} className="btn btn-primary" style={{ fontSize: '11px', padding: '5px 12px' }}>
      {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <><Check size={12} /> Sparat</> : <><Check size={12} /> Spara</>}
    </button>
  )
}

export default function HalsaPage() {
  const { user } = useAuth()
  const fileRef = useRef()
  const [logs, setLogs] = useState([])
  const [supplements, setSupplements] = useState(DEFAULT_SUPPLEMENTS)
  const [newSupplement, setNewSupplement] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [activeTab, setActiveTab] = useState('log')
  const [graphPeriod, setGraphPeriod] = useState(30)
  const [editingLog, setEditingLog] = useState(null)
  const [userSettings, setUserSettings] = useState(null)

  const today = format(new Date(), 'yyyy-MM-dd')
  const [todayLog, setTodayLog] = useState(null)
  const [savingWidget, setSavingWidget] = useState({})
  const [savedWidget, setSavedWidget] = useState({})

  // Per-widget form state
  const [weightForm, setWeightForm] = useState({ date: today, weight_kg: '' })
  const [sleepForm, setSleepForm] = useState({ date: today, sleep_hours: '', sleep_quality: 7 })
  const [substanceForm, setSubstanceForm] = useState({ date: today, alcohol_units: '', nicotine: [], marijuana: false })
  const [retForm, setRetForm] = useState({ date: today, retatrutide_injected: false, retatrutide_dose_mg: '' })
  const [nutritionForm, setNutritionForm] = useState({ date: today, fasting: false, calories: '', protein_g: '', water_liters: '' })
  const [suppForm, setSuppForm] = useState({ date: today, supplements_taken: [] })

  useEffect(() => { if (user) { fetchLogs(); fetchTodayLog(); fetchUserSettings() } }, [user])

  async function fetchLogs() {
    const since = format(subDays(new Date(), 90), 'yyyy-MM-dd')
    const { data } = await supabase.from('health_logs').select('*').eq('user_id', user.id).gte('date', since).order('date', { ascending: false })
    setLogs(data || [])
  }

  async function fetchTodayLog() {
    const { data } = await supabase.from('health_logs').select('*').eq('user_id', user.id).eq('date', today).single()
    if (data) {
      setTodayLog(data)
      setWeightForm(f => ({ ...f, weight_kg: data.weight_kg || '' }))
      setSleepForm(f => ({ ...f, sleep_hours: data.sleep_hours || '', sleep_quality: data.sleep_quality || 7 }))
      setSubstanceForm(f => ({ ...f, alcohol_units: data.alcohol_units || '', nicotine: data.nicotine ? ['snus'] : [] }))
      if (data.retatrutide_dose_mg) setRetForm(f => ({ ...f, retatrutide_injected: true, retatrutide_dose_mg: data.retatrutide_dose_mg }))
    }
  }

  async function fetchUserSettings() {
    const { data } = await supabase
      .from('user_settings')
      .select('goals')
      .eq('user_id', user.id)
      .single()
    setUserSettings(data || null)
  }

  async function saveWidget(widget, payload) {
    setSavingWidget(s => ({ ...s, [widget]: true }))
    await supabase.from('health_logs').upsert({ user_id: user.id, source: 'manual', ...payload }, { onConflict: 'user_id,date' })
    await fetchLogs()
    setSavingWidget(s => ({ ...s, [widget]: false }))
    setSavedWidget(s => ({ ...s, [widget]: true }))
    setTimeout(() => setSavedWidget(s => ({ ...s, [widget]: false })), 2000)
  }

  async function saveNutrition(payload) {
    setSavingWidget(s => ({ ...s, nutrition: true }))
    await supabase.from('nutrition_logs').upsert({ user_id: user.id, ...payload }, { onConflict: 'user_id,date' })
    setSavingWidget(s => ({ ...s, nutrition: false }))
    setSavedWidget(s => ({ ...s, nutrition: true }))
    setTimeout(() => setSavedWidget(s => ({ ...s, nutrition: false })), 2000)
  }

  async function openEditLog(log) {
    setEditingLog({
      ...log,
      weight_kg: log.weight_kg || '',
      sleep_hours: log.sleep_hours || '',
      sleep_quality: log.sleep_quality || 7,
      alcohol_units: log.alcohol_units || '',
      nicotine: log.nicotine ? ['snus'] : [],
      retatrutide_dose_mg: log.retatrutide_dose_mg || '',
      retatrutide_injected: !!log.retatrutide_dose_mg,
    })
  }

  async function saveEditLog() {
    if (!editingLog) return
    await supabase.from('health_logs').update({
      date: editingLog.date,
      weight_kg: editingLog.weight_kg ? parseFloat(editingLog.weight_kg) : null,
      sleep_hours: editingLog.sleep_hours ? parseFloat(editingLog.sleep_hours) : null,
      sleep_quality: editingLog.sleep_quality,
      alcohol_units: editingLog.alcohol_units ? parseFloat(editingLog.alcohol_units) : null,
      nicotine: editingLog.nicotine?.length > 0,
      retatrutide_dose_mg: editingLog.retatrutide_injected ? parseFloat(editingLog.retatrutide_dose_mg) || 2.5 : null,
    }).eq('id', editingLog.id)
    await fetchLogs()
    setEditingLog(null)
  }

  async function handleFileImport(e) {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    const text = await file.text()
    const xml = new DOMParser().parseFromString(text, 'text/xml')
    const records = xml.querySelectorAll('Record')
    const weightMap = {}, stepsMap = {}
    records.forEach(r => {
      const type = r.getAttribute('type'), dateStr = r.getAttribute('startDate')?.slice(0,10), value = parseFloat(r.getAttribute('value'))
      if (!dateStr || isNaN(value)) return
      if (type === 'HKQuantityTypeIdentifierBodyMass') { const kg = r.getAttribute('unit') === 'lb' ? value * 0.453592 : value; if (!weightMap[dateStr] || kg < weightMap[dateStr]) weightMap[dateStr] = Math.round(kg*10)/10 }
      if (type === 'HKQuantityTypeIdentifierStepCount') stepsMap[dateStr] = (stepsMap[dateStr]||0) + Math.round(value)
    })
    const dates = new Set([...Object.keys(weightMap), ...Object.keys(stepsMap)])
    let count = 0
    for (const date of dates) {
      const update = {}
      if (weightMap[date]) update.weight_kg = weightMap[date]
      if (stepsMap[date]) update.steps = stepsMap[date]
      if (Object.keys(update).length > 0) { await supabase.from('health_logs').upsert({ user_id: user.id, date, ...update, source: 'apple_health' }, { onConflict: 'user_id,date' }); count++ }
    }
    await fetchLogs()
    setImportResult({ weights: Object.keys(weightMap).length, steps: Object.keys(stepsMap).length })
    setImporting(false)
    e.target.value = ''
  }

  const latestWeight = logs.find(l => l.weight_kg)?.weight_kg
  const targetWeightRaw = userSettings?.goals?.target_weight || userSettings?.goals?.body_weight_goal
  const targetWeight = targetWeightRaw ? parseFloat(targetWeightRaw) : null
  const avgSleep = logs.slice(0,7).filter(l => l.sleep_hours).reduce((s,l,_,a) => s+l.sleep_hours/a.length, 0)
  const avgSteps = logs.slice(0,7).filter(l => l.steps).reduce((s,l,_,a) => s+l.steps/a.length, 0)
  const chartData = logs.slice().reverse().map(l => ({ date: l.date, weight: l.weight_kg||null, sleep: l.sleep_hours||null, steps: l.steps||null, alcohol: l.alcohol_units||null }))

  const tabs = [{ id:'log', label:'Logga' }, { id:'grafer', label:'Grafer' }, { id:'historik', label:'Historik' }]

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Hälsa</div>
          <div className="page-header-sub" style={{ display:'flex', gap:'10px' }}>
            {latestWeight && <span style={{ color:'#10b981' }}>⚖ {latestWeight} kg</span>}
            {targetWeight && <span style={{ color:'#f59e0b' }}>mål {targetWeight} kg</span>}
            {avgSleep > 0 && <span style={{ color:'#06b6d4' }}> {avgSleep.toFixed(1)}h</span>}
            {avgSteps > 0 && <span style={{ color:'#f59e0b' }}>{Math.round(avgSteps).toLocaleString('sv-SE')} steg</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:'7px' }}>
          <input ref={fileRef} type="file" accept=".xml" onChange={handleFileImport} style={{ display:'none' }} />
          <button onClick={() => fileRef.current?.click()} className="btn btn-ghost" style={{ fontSize:'12px' }}>
            <Apple size={13} /> Apple Health
          </button>
        </div>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding:'12px 12px 0', maxWidth:'960px', margin:'0 auto' }}>

          {/* Import feedback */}
          {(importResult || importing) && (
            <div style={{ padding:'10px 14px', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:'10px', marginBottom:'12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              {importing
                ? <span style={{ fontSize:'13px', color:'var(--muted)', display:'flex', alignItems:'center', gap:'8px' }}><Loader size={13} style={{ animation:'spin 1s linear infinite' }} /> Importerar...</span>
                : <span style={{ fontSize:'13px', color:'#10b981' }}>✓ {importResult.weights} viktvärden · {importResult.steps} stegdagar</span>}
              {!importing && <button onClick={() => setImportResult(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}><X size={13} /></button>}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display:'flex', gap:'4px', marginBottom:'14px', background:'var(--surface)', borderRadius:'10px', padding:'4px', backdropFilter:'var(--glass-blur)' }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                flex:1, padding:'8px', borderRadius:'7px', border:'none', cursor:'pointer',
                background: activeTab===tab.id ? 'var(--surface3)' : 'transparent',
                color: activeTab===tab.id ? 'var(--text)' : 'var(--muted)',
                fontSize:'13px', fontWeight:'500', fontFamily:'DM Sans, sans-serif', transition:'all 0.15s',
              }}>{tab.label}</button>
            ))}
          </div>

          {/* ── LOG TAB ── */}
          {activeTab === 'log' && (
            <div className="widget-grid-2" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>

              {/* VIKT */}
              <Widget title="Vikt" icon={<Scale size={14} color="#10b981" />} color="#10b981"
                action={<SaveBtn onClick={() => saveWidget('weight', { date: weightForm.date, weight_kg: weightForm.weight_kg ? parseFloat(weightForm.weight_kg) : null })} saving={savingWidget.weight} saved={savedWidget.weight} />}>
                <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                  <input type="date" className="input" value={weightForm.date} onChange={e => setWeightForm(f => ({...f, date:e.target.value}))} style={{ fontSize:'12px', flex:1 }} />
                  <input type="number" step="0.1" placeholder="kg" className="input" value={weightForm.weight_kg} onChange={e => setWeightForm(f => ({...f, weight_kg:e.target.value}))} style={{ fontSize:'14px', maxWidth:'90px', fontWeight:'600' }} />
                </div>
                {logs.slice(0,5).filter(l => l.weight_kg).length > 0 && (
                  <div style={{ marginTop:'10px', display:'flex', gap:'4px', flexWrap:'wrap' }}>
                    {logs.slice(0,5).filter(l => l.weight_kg).map(l => (
                      <span key={l.id} style={{ fontSize:'11px', padding:'2px 7px', borderRadius:'6px', background:'var(--surface2)', border:'1px solid var(--border)', color:'var(--muted)' }}>
                        {format(parseISO(l.date),'d/M')} — {l.weight_kg}kg
                      </span>
                    ))}
                  </div>
                )}
              </Widget>

              {/* SÖMN */}
              <Widget title="Sömn" icon={<Moon size={14} color="#8b5cf6" />} color="#8b5cf6"
                action={<SaveBtn onClick={() => saveWidget('sleep', { date: sleepForm.date, sleep_hours: sleepForm.sleep_hours ? parseFloat(sleepForm.sleep_hours) : null, sleep_quality: sleepForm.sleep_quality })} saving={savingWidget.sleep} saved={savedWidget.sleep} />}>
                {todayLog?.source === 'journal' && (
                  <div style={{ padding:'6px 10px', background:'rgba(6,182,212,0.08)', border:'1px solid rgba(6,182,212,0.2)', borderRadius:'7px', marginBottom:'10px', fontSize:'11px', color:'#06b6d4' }}>
                     Hämtad från journal
                  </div>
                )}
                <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px' }}>
                  <input type="date" className="input" value={sleepForm.date} onChange={e => setSleepForm(f => ({...f, date:e.target.value}))} style={{ fontSize:'12px', flex:1 }} />
                  <input type="number" step="0.5" placeholder="h" className="input" value={sleepForm.sleep_hours} onChange={e => setSleepForm(f => ({...f, sleep_hours:e.target.value}))} style={{ fontSize:'14px', maxWidth:'70px', fontWeight:'600' }} />
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'4px' }}>
                  <span style={{ fontSize:'11px', color:'var(--muted)' }}>Kvalitet</span>
                  <span style={{ fontSize:'11px', color:'#8b5cf6', fontWeight:'600' }}>{sleepForm.sleep_quality}/10</span>
                </div>
                <input type="range" min="1" max="10" value={sleepForm.sleep_quality} onChange={e => setSleepForm(f => ({...f, sleep_quality:parseInt(e.target.value)}))} style={{ width:'100%', accentColor:'#8b5cf6' }} />
              </Widget>

              {/* SUBSTANSER */}
              <Widget title="Alkohol & Nikotin" icon={<Wine size={14} color="#f59e0b" />} color="#f59e0b"
                action={<SaveBtn onClick={() => saveWidget('substance', { date: substanceForm.date, alcohol_units: substanceForm.alcohol_units ? parseFloat(substanceForm.alcohol_units) : null, nicotine: substanceForm.nicotine.length > 0, marijuana: substanceForm.marijuana || false })} saving={savingWidget.substance} saved={savedWidget.substance} />}>
                <div style={{ display:'flex', gap:'8px', marginBottom:'12px', alignItems:'center' }}>
                  <input type="date" className="input" value={substanceForm.date} onChange={e => setSubstanceForm(f => ({...f, date:e.target.value}))} style={{ fontSize:'12px', flex:1 }} />
                </div>
                <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'12px' }}>
                  <span style={{ fontSize:'12px', color:'var(--muted)', whiteSpace:'nowrap' }}>Alkohol (enheter)</span>
                  <input type="number" step="0.5" placeholder="0" className="input" value={substanceForm.alcohol_units} onChange={e => setSubstanceForm(f => ({...f, alcohol_units:e.target.value}))} style={{ maxWidth:'80px', fontSize:'14px', fontWeight:'600' }} />
                </div>
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  {NICOTINE_TYPES.map(n => {
                    const active = substanceForm.nicotine.includes(n.id)
                    return (
                      <button key={n.id} onClick={() => setSubstanceForm(f => ({ ...f, nicotine: active ? f.nicotine.filter(x=>x!==n.id) : [...f.nicotine,n.id] }))} style={{
                        padding:'5px 10px', borderRadius:'7px', border:'1px solid '+(active?'#f59e0b':'var(--border)'),
                        background: active?'rgba(245,158,11,0.12)':'var(--surface2)', color: active?'#f59e0b':'var(--muted)',
                        fontSize:'12px', cursor:'pointer', fontFamily:'DM Sans, sans-serif',
                      }}>{n.label}</button>
                    )
                  })}
                  <button onClick={() => setSubstanceForm(f => ({...f, marijuana: !f.marijuana}))} style={{
                    padding:'5px 10px', borderRadius:'7px', border:'1px solid '+(substanceForm.marijuana?'#10b981':'var(--border)'),
                    background: substanceForm.marijuana?'rgba(16,185,129,0.12)':'var(--surface2)', color: substanceForm.marijuana?'#10b981':'var(--muted)',
                    fontSize:'12px', cursor:'pointer', fontFamily:'DM Sans, sans-serif',
                  }}> Marijuana</button>
                </div>
              </Widget>

              {/* RETATRUTIDE */}
              <Widget title="Retatrutide " icon={<Syringe size={14} color="#a78bfa" />} color="#a78bfa"
                action={<SaveBtn onClick={() => saveWidget('ret', { date: retForm.date, retatrutide_dose_mg: retForm.retatrutide_injected ? parseFloat(retForm.retatrutide_dose_mg)||2.5 : null })} saving={savingWidget.ret} saved={savedWidget.ret} />}>
                <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                  <input type="date" className="input" value={retForm.date} onChange={e => setRetForm(f => ({...f, date:e.target.value}))} style={{ fontSize:'12px', flex:1 }} />
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom: retForm.retatrutide_injected ? '10px' : '0' }}>
                  <input type="checkbox" id="retinj" checked={retForm.retatrutide_injected} onChange={e => setRetForm(f => ({...f, retatrutide_injected:e.target.checked}))} style={{ accentColor:'#a78bfa', width:'15px', height:'15px', cursor:'pointer' }} />
                  <label htmlFor="retinj" style={{ fontSize:'13px', cursor:'pointer', color:'var(--text)' }}>Injicerade idag</label>
                </div>
                {retForm.retatrutide_injected && (
                  <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                    <span style={{ fontSize:'12px', color:'var(--muted)' }}>Dos (mg)</span>
                    <input type="number" step="0.5" placeholder="2.5" className="input" value={retForm.retatrutide_dose_mg} onChange={e => setRetForm(f => ({...f, retatrutide_dose_mg:e.target.value}))} style={{ maxWidth:'90px', fontSize:'14px' }} />
                  </div>
                )}
              </Widget>

              {/* KOST */}
              <Widget title="Kost" icon={<Utensils size={14} color="#34d399" />} color="#34d399"
                action={<SaveBtn onClick={() => saveNutrition({ date: nutritionForm.date, total_calories: nutritionForm.fasting ? 0 : (nutritionForm.calories ? parseInt(nutritionForm.calories) : null), protein_g: nutritionForm.protein_g ? parseInt(nutritionForm.protein_g) : null, water_liters: nutritionForm.water_liters ? parseFloat(nutritionForm.water_liters) : null })} saving={savingWidget.nutrition} saved={savedWidget.nutrition} />}>
                <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                  <input type="date" className="input" value={nutritionForm.date} onChange={e => setNutritionForm(f => ({...f, date:e.target.value}))} style={{ fontSize:'12px', flex:1 }} />
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px' }}>
                  <input type="checkbox" id="fasting" checked={nutritionForm.fasting} onChange={e => setNutritionForm(f => ({...f, fasting:e.target.checked}))} style={{ accentColor:'#34d399', width:'15px', height:'15px', cursor:'pointer' }} />
                  <label htmlFor="fasting" style={{ fontSize:'13px', cursor:'pointer', color:'var(--text)' }}> Fastedag</label>
                </div>
                {!nutritionForm.fasting && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px' }}>
                    {[['Kalorier', 'calories', 'kcal'], ['Protein (g)', 'protein_g', 'g'], ['Vatten (l)', 'water_liters', 'l']].map(([label, key, unit]) => (
                      <div key={key}>
                        <div style={{ fontSize:'10px', color:'var(--muted)', marginBottom:'4px' }}>{label}</div>
                        <input type="number" placeholder={unit} className="input" value={nutritionForm[key]} onChange={e => setNutritionForm(f => ({...f, [key]:e.target.value}))} style={{ fontSize:'13px' }} />
                      </div>
                    ))}
                  </div>
                )}
              </Widget>

              {/* KOSTTILLSKOTT */}
              <Widget title="Kosttillskott" icon={<Pill size={14} color="#06b6d4" />} color="#06b6d4"
                action={<SaveBtn onClick={() => saveWidget('supps', { date: suppForm.date, supplements_taken: suppForm.supplements_taken })} saving={savingWidget.supps} saved={savedWidget.supps} />}>
                <div style={{ display:'flex', gap:'8px', marginBottom:'12px' }}>
                  <input type="date" className="input" value={suppForm.date} onChange={e => setSuppForm(f => ({...f, date:e.target.value}))} style={{ fontSize:'12px', flex:1 }} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'10px' }}>
                  {supplements.map(supp => {
                    const taken = suppForm.supplements_taken.includes(supp)
                    return (
                      <button key={supp} onClick={() => setSuppForm(f => ({ ...f, supplements_taken: taken ? f.supplements_taken.filter(s=>s!==supp) : [...f.supplements_taken, supp] }))} style={{
                        display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', borderRadius:'8px',
                        border:'1px solid '+(taken?'#06b6d4':'var(--border)'), background: taken?'rgba(6,182,212,0.08)':'var(--surface2)',
                        cursor:'pointer', fontFamily:'DM Sans, sans-serif', transition:'all 0.15s',
                      }}>
                        <div style={{ width:'16px', height:'16px', borderRadius:'50%', border:'2px solid '+(taken?'#06b6d4':'var(--border)'), background: taken?'#06b6d4':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          {taken && <Check size={10} color="white" />}
                        </div>
                        <span style={{ fontSize:'13px', color: taken?'#06b6d4':'var(--text)' }}> {supp}</span>
                      </button>
                    )
                  })}
                </div>
                <div style={{ display:'flex', gap:'6px', borderTop:'1px solid var(--border)', paddingTop:'10px' }}>
                  <input className="input" placeholder="Lägg till..." value={newSupplement} onChange={e => setNewSupplement(e.target.value)} onKeyDown={e => { if (e.key==='Enter' && newSupplement.trim()) { setSupplements(p => [...p, newSupplement.trim()]); setNewSupplement('') } }} style={{ fontSize:'12px' }} />
                  <button onClick={() => { if (newSupplement.trim()) { setSupplements(p => [...p, newSupplement.trim()]); setNewSupplement('') } }} className="btn btn-ghost" style={{ padding:'8px', flexShrink:0 }}><Plus size={13} /></button>
                </div>
              </Widget>
            </div>
          )}

          {/* ── GRAFER TAB ── */}
          {activeTab === 'grafer' && (() => {
            const periodDays = graphPeriod
            const cutoff = format(subDays(new Date(), periodDays), 'yyyy-MM-dd')
            const filteredData = chartData.filter(d => d.date >= cutoff)

            // Retatrutide PK model:
            // - Absorption phase: rises to peak at Tmax = 48h (2 days) using 1-compartment absorption
            // - Elimination: t½ = 6 days → ke = ln2/6
            // - ka chosen so peak occurs at Tmax: ka ≈ ln(ka/ke)/(ka-ke) solved numerically → ka ≈ 0.693/0.5 = 1.386/day (Tmax ~0.5d is too fast)
            // We use the standard formula: C(t) = F*D*ka/(Vd*(ka-ke)) * (e^(-ke*t) - e^(-ka*t))
            // Normalised so C_max = 1 per unit dose, then scale by actual dose.
            // ka: absorption rate constant — set so Tmax ≈ 2 days
            // Tmax = ln(ka/ke)/(ka-ke). With ke=ln2/6≈0.1155, ka≈0.693 gives Tmax≈2.0 days ✓
            const ke = Math.log(2) / 6        // elimination rate constant (per day)
            const ka = Math.log(2) / 1.0      // absorption rate constant → Tmax ≈ 2 days
            // Normalisation factor so peak = dose (scale factor)
            const tmax_norm = Math.log(ka / ke) / (ka - ke)
            const peak_factor = (ka - ke) / (ka * Math.exp(-ke * tmax_norm) - ke * Math.exp(-ka * tmax_norm))

            const retData = (() => {
              const injections = logs.filter(l => l.retatrutide_dose_mg > 0 && l.date >= cutoff).map(l => ({ date: l.date, dose: l.retatrutide_dose_mg }))
              if (!injections.length) return []
              const days = []
              for (let i = periodDays; i >= 0; i--) {
                const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
                const conc = injections.reduce((sum, inj) => {
                  const t = (new Date(d) - new Date(inj.date)) / 86400000 // days since injection
                  if (t < 0) return sum
                  // 1-compartment absorption model: C(t) = D * peak_factor * (e^(-ke*t) - e^(-ka*t))
                  const c = inj.dose * peak_factor * (Math.exp(-ke * t) - Math.exp(-ka * t))
                  return sum + Math.max(0, c)
                }, 0)
                days.push({ date: d, conc: Math.round(conc * 100) / 100 })
              }
              return days
            })()

            const hasRet = retData.some(d => d.conc > 0)

            return (
              <div>
                {/* Period selector */}
                <div style={{ display:'flex', gap:'6px', marginBottom:'14px', justifyContent:'flex-end' }}>
                  {[7, 14, 30, 90].map(d => (
                    <button key={d} onClick={() => setGraphPeriod(d)} style={{
                      padding:'4px 12px', fontSize:'11px', borderRadius:'7px',
                      background: graphPeriod===d ? 'var(--accent-soft)' : 'var(--surface2)',
                      border:'1px solid '+(graphPeriod===d ? 'var(--accent-border)' : 'var(--border)'),
                      color: graphPeriod===d ? 'var(--accent)' : 'var(--muted)',
                      cursor:'pointer', fontWeight: graphPeriod===d ? 600 : 400,
                      transition:'all 0.15s',
                    }}>{d}d</button>
                  ))}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                  {[
                    { key:'weight', label:'Vikt', color:'#10b981', unit:'kg', refLine:targetWeight, refLabel:targetWeight ? `Mål ${targetWeight}kg` : '', data:filteredData },
                    { key:'sleep',  label:'Sömn', color:'#8b5cf6', unit:'h', data:filteredData },
                    { key:'steps',  label:'Steg/dag', color:'#f59e0b', unit:' steg', data:filteredData },
                  ].map(({ key, label, color, unit, refLine, refLabel, data }) => (
                    <div key={key} style={{ background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', border:'1px solid var(--glass-border)', borderRadius:'16px', padding:'16px', boxShadow:'var(--glass-shadow)' }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'var(--text)', marginBottom:'3px' }}>{label}</div>
                      <div style={{ fontSize:'13px', color, fontWeight:'700', marginBottom:'10px' }}>
                        {data.filter(d => d[key] != null).slice(-1)[0]?.[key]}{unit}
                      </div>
                      <ResponsiveContainer width="100%" height={90}>
                        <LineChart data={data}>
                          <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} connectNulls />
                          <XAxis dataKey="date" hide />
                          <YAxis hide domain={['auto','auto']} />
                          {refLine && <ReferenceLine y={refLine} stroke={color} strokeDasharray="4 3" opacity={0.4} label={{ value:refLabel, fontSize:9, fill:color, position:'insideBottomRight' }} />}
                          <Tooltip contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'12px' }} formatter={v => v!=null ? [`${v}${unit}`, label] : null} labelFormatter={l => format(parseISO(l),'d MMM',{locale:sv})} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ))}

                  {/* Retatrutide concentration */}
                  <div style={{ background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', border:'1px solid var(--glass-border)', borderRadius:'16px', padding:'16px', boxShadow:'var(--glass-shadow)' }}>
                    <div style={{ fontSize:'13px', fontWeight:'600', color:'var(--text)', marginBottom:'3px' }}>Retatrutide — plasmakonc.</div>
                    <div style={{ fontSize:'13px', color:'#a78bfa', fontWeight:'700', marginBottom:'2px' }}>
                      {hasRet ? (retData.slice(-1)[0]?.conc.toFixed(2) + ' mg-ekv') : '—'}
                    </div>
                    <div style={{ fontSize:'10px', color:'var(--muted)', marginBottom:'10px' }}>Tmax ≈ 48h · t½ = 6 dagar · 1-kompartment PK-modell</div>
                    {hasRet ? (
                      <ResponsiveContainer width="100%" height={90}>
                        <LineChart data={retData}>
                          <Line type="monotone" dataKey="conc" stroke="#a78bfa" strokeWidth={2} dot={false} />
                          <XAxis dataKey="date" hide />
                          <YAxis hide domain={[0,'auto']} />
                          <Tooltip contentStyle={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'8px', fontSize:'12px' }} formatter={v => [`${v} mg-ekv`, 'Plasmakonc.']} labelFormatter={l => format(parseISO(l),'d MMM',{locale:sv})} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div style={{ height:90, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:'12px', fontStyle:'italic' }}>
                        Ingen retatrutide-data loggad
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── HISTORIK TAB ── */}
          {activeTab === 'historik' && (
            <div style={{ background:'var(--surface)', backdropFilter:'var(--glass-blur)', WebkitBackdropFilter:'var(--glass-blur)', border:'1px solid var(--glass-border)', borderRadius:'16px', padding:'16px', boxShadow:'var(--glass-shadow)' }}>
              <div style={{ fontSize:'12px', color:'var(--muted)', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'12px' }}>
                Senaste 30 dagar
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                {logs.slice(0,30).map(log => (
                  <div key={log.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'10px 12px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:'10px', transition:'border-color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border2)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    <span style={{ fontSize:'12px', color:'var(--muted)', minWidth:'60px' }}>
                      {format(parseISO(log.date), 'EEE d/M', { locale:sv })}
                    </span>
                    <div style={{ display:'flex', gap:'10px', flex:1, flexWrap:'wrap' }}>
                      {log.weight_kg && <span style={{ fontSize:'12px', color:'#10b981' }}>⚖ {log.weight_kg}kg</span>}
                      {log.sleep_hours && <span style={{ fontSize:'12px', color:'#8b5cf6' }}> {log.sleep_hours}h</span>}
                      {log.steps && <span style={{ fontSize:'12px', color:'#f59e0b' }}> {log.steps.toLocaleString('sv-SE')}</span>}
                      {log.alcohol_units > 0 && <span style={{ fontSize:'12px', color:'#ef4444' }}>{log.alcohol_units} enheter alkohol</span>}
                      {log.nicotine && <span style={{ fontSize:'12px', color:'#f59e0b' }}>nikotin</span>}
                      {log.retatrutide_dose_mg && <span style={{ fontSize:'12px', color:'#a78bfa' }}> {log.retatrutide_dose_mg}mg</span>}
                    </div>
                    <button onClick={() => openEditLog(log)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'7px', padding:'4px 8px', cursor:'pointer', color:'var(--muted)', fontSize:'11px', display:'flex', alignItems:'center', gap:'4px', flexShrink:0, transition:'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.color='var(--accent)'; e.currentTarget.style.borderColor='var(--accent-border)' }}
                      onMouseLeave={e => { e.currentTarget.style.color='var(--muted)'; e.currentTarget.style.borderColor='var(--border)' }}>
                      <Edit2 size={11} /> Redigera
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Edit modal */}
      {editingLog && (
        <div onClick={() => setEditingLog(null)} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--surface)', backdropFilter:'blur(32px)', border:'1px solid var(--glass-border)', borderRadius:'18px', padding:'24px', width:'100%', maxWidth:'480px', boxShadow:'var(--glass-shadow)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
              <div style={{ fontSize:'15px', fontWeight:'600', color:'var(--text)' }}>Redigera logg</div>
              <button onClick={() => setEditingLog(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
              <div>
                <label style={{ fontSize:'11px', color:'var(--muted)', display:'block', marginBottom:'4px' }}>Datum</label>
                <input type="date" className="input" value={editingLog.date} onChange={e => setEditingLog(l => ({...l, date:e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize:'11px', color:'var(--muted)', display:'block', marginBottom:'4px' }}>Vikt (kg)</label>
                <input type="number" step="0.1" className="input" value={editingLog.weight_kg} onChange={e => setEditingLog(l => ({...l, weight_kg:e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize:'11px', color:'var(--muted)', display:'block', marginBottom:'4px' }}>Sömn (h)</label>
                <input type="number" step="0.5" className="input" value={editingLog.sleep_hours} onChange={e => setEditingLog(l => ({...l, sleep_hours:e.target.value}))} />
              </div>
              <div>
                <label style={{ fontSize:'11px', color:'var(--muted)', display:'block', marginBottom:'4px' }}>Alkohol (enheter)</label>
                <input type="number" step="0.5" className="input" value={editingLog.alcohol_units} onChange={e => setEditingLog(l => ({...l, alcohol_units:e.target.value}))} />
              </div>
            </div>
            <div style={{ marginBottom:'16px' }}>
              <label style={{ fontSize:'11px', color:'var(--muted)', display:'block', marginBottom:'6px' }}>Nikotin</label>
              <div style={{ display:'flex', gap:'6px' }}>
                {NICOTINE_TYPES.map(n => {
                  const active = editingLog.nicotine?.includes(n.id)
                  return <button key={n.id} onClick={() => setEditingLog(l => ({ ...l, nicotine: active ? l.nicotine.filter(x=>x!==n.id) : [...(l.nicotine||[]),n.id] }))} style={{ padding:'5px 10px', borderRadius:'7px', border:'1px solid '+(active?'#f59e0b':'var(--border)'), background: active?'rgba(245,158,11,0.12)':'var(--surface2)', color: active?'#f59e0b':'var(--muted)', fontSize:'12px', cursor:'pointer', fontFamily:'DM Sans, sans-serif' }}>{n.label}</button>
                })}
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
              <button onClick={() => setEditingLog(null)} className="btn btn-ghost" style={{ fontSize:'12px' }}>Avbryt</button>
              <button onClick={saveEditLog} className="btn btn-primary" style={{ fontSize:'12px' }}><Check size={13} /> Spara</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
