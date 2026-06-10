import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, X, Heart, Dumbbell, DollarSign, TrendingUp, BookOpen, Check, Loader, Trash2, ChevronDown } from 'lucide-react'

const TODAY = () => format(new Date(), 'yyyy-MM-dd')

const EXPENSE_CATS = ['Mat', 'Transport', 'Nöje', 'Kläder', 'Hälsa', 'Prenumerationer', 'Hyra', 'Övrigt']
const INCOME_SOURCES = ['PA-jobb', 'Erik Norling', 'CSN', 'Skatteåterbäring', 'Övrigt']
const FEELING_OPTS = [
  { v: 3, label: 'Trött' },
  { v: 5, label: 'Ok' },
  { v: 7, label: 'Bra' },
  { v: 9, label: 'Grym' },
]
const EXERCISE_LIBRARY = {
  'Bröst': ['Bänkpress', 'Lutande bänkpress', 'Cables korsning', 'Dips', 'Armhävningar'],
  'Rygg': ['Marklyft', 'Latsdrag', 'Rodd', 'Pull-ups', 'Weighted pull-up', 'Hyperextensions'],
  'Ben': ['Knäböj', 'Benpress', 'Utfall', 'Leg curl', 'Leg extension', 'Kalvhävningar'],
  'Axlar': ['Militärpress', 'Sidolyft', 'Framåtlyft', 'Face pulls', 'Shrugs'],
  'Armar': ['Bicepscurl', 'Hammercurl', 'Tryckkpress', 'Skullcrusher', 'Kabeldrag'],
  'Core': ['Plankan', 'Situps', 'Crunches', 'Russian twist', 'Bäckenlyft'],
}

// ── Shared UI helpers ──────────────────────────────────────────────────────

const labelStyle = {
  fontSize: '11px', color: 'var(--muted)', fontWeight: 600,
  letterSpacing: '0.06em', marginBottom: '5px', textTransform: 'uppercase',
}

function chipStyle(active, color) {
  return {
    padding: '4px 10px', borderRadius: '20px', border: '1px solid',
    borderColor: active ? (color || 'var(--accent-border)') : 'var(--border)',
    background: active ? (color ? color + '18' : 'var(--accent-soft)') : 'var(--surface2)',
    color: active ? (color || 'var(--accent)') : 'var(--muted)',
    fontSize: '11px', fontWeight: active ? 600 : 400,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 0.12s',
  }
}

function Field({ label, type = 'text', placeholder, value, onChange, step, autoFocus, multiline, inputMode }) {
  return (
    <div>
      {label && <div style={labelStyle}>{label}</div>}
      {multiline ? (
        <textarea className="input" rows={2} placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)} style={{ resize: 'none' }} />
      ) : (
        <input className="input" type={type} step={step} inputMode={inputMode}
          placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)} autoFocus={autoFocus} />
      )}
    </div>
  )
}

function SaveBtn({ onClick, saving, disabled }) {
  return (
    <button onClick={onClick} disabled={saving || disabled} className="btn btn-primary"
      style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '13px', marginTop: '4px', opacity: disabled ? 0.5 : 1 }}>
      {saving
        ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</>
        : <><Check size={14} /> Spara pass</>}
    </button>
  )
}

// ── Health form ────────────────────────────────────────────────────────────

function HealthForm({ onSave, saving }) {
  const [form, setForm] = useState({ weight_kg: '', sleep_hours: '', energy: '', steps: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="Vikt (kg)" type="number" step="0.1" placeholder="77.0" inputMode="decimal" value={form.weight_kg} onChange={v => f('weight_kg', v)} />
        <Field label="Sömn (h)" type="number" step="0.5" placeholder="7.5" inputMode="decimal" value={form.sleep_hours} onChange={v => f('sleep_hours', v)} />
      </div>
      <div>
        <div style={labelStyle}>Energi</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button key={n} onClick={() => f('energy', n)} style={{
              flex: 1, padding: '7px 0', borderRadius: '6px', border: '1px solid',
              borderColor: form.energy === n ? 'var(--accent)' : 'var(--border)',
              background: form.energy === n ? 'var(--accent-soft)' : 'var(--surface2)',
              color: form.energy === n ? 'var(--accent)' : 'var(--muted)',
              fontSize: '11px', fontWeight: form.energy === n ? 700 : 400,
              cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            }}>{n}</button>
          ))}
        </div>
      </div>
      <Field label="Steg" type="number" inputMode="numeric" placeholder="8000" value={form.steps} onChange={v => f('steps', v)} />
      <button onClick={() => onSave(form)} disabled={saving} className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '13px', marginTop: '2px' }}>
        {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Check size={14} /> Spara</>}
      </button>
    </div>
  )
}

// ── Gym form (full exercise logging) ──────────────────────────────────────

function GymForm({ onSave, saving }) {
  const [sessionType, setSessionType] = useState('gym')
  const [duration, setDuration] = useState('')
  const [feeling, setFeeling] = useState(7)
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState([{ name: '', sets: [{ reps: '', weight: '' }] }])
  const [showPicker, setShowPicker] = useState(null) // index of exercise opening picker
  const [customName, setCustomName] = useState('')

  // Run-specific
  const [runDistance, setRunDistance] = useState('')
  const [runMinutes, setRunMinutes] = useState('')
  const [runSeconds, setRunSeconds] = useState('')

  const isGym = sessionType === 'gym'
  const isRun = sessionType === 'run'

  function addExercise(name = '') {
    setExercises(p => [...p, { name, sets: [{ reps: '', weight: '' }] }])
    setShowPicker(null)
    setCustomName('')
  }
  function removeExercise(i) { setExercises(p => p.filter((_, idx) => idx !== i)) }
  function updateName(i, name) { setExercises(p => p.map((ex, idx) => idx === i ? { ...ex, name } : ex)) }
  function addSet(i) { setExercises(p => p.map((ex, idx) => idx === i ? { ...ex, sets: [...ex.sets, { reps: '', weight: '' }] } : ex)) }
  function removeSet(i, si) { setExercises(p => p.map((ex, idx) => idx === i ? { ...ex, sets: ex.sets.filter((_, s) => s !== si) } : ex)) }
  function updateSet(i, si, field, val) { setExercises(p => p.map((ex, idx) => idx === i ? { ...ex, sets: ex.sets.map((s, s2) => s2 === si ? { ...s, [field]: val } : s) } : ex)) }

  function handleSave() {
    onSave({ sessionType, duration, feeling, notes, exercises, runDistance, runMinutes, runSeconds })
  }

  const hasValidExercises = isGym
    ? exercises.some(ex => ex.name && ex.sets.some(s => s.reps || s.weight))
    : true

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Session type */}
      <div>
        <div style={labelStyle}>Typ</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[
            { id: 'gym',  label: 'Gym' },
            { id: 'run',  label: 'Löpning' },
            { id: 'walk', label: 'Promenad' },
            { id: 'other',label: 'Annat' },
          ].map(t => (
            <button key={t.id} onClick={() => setSessionType(t.id)} style={{ ...chipStyle(sessionType === t.id), flex: 1, fontSize: '11px' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Run fields */}
      {isRun && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          <Field label="Distans (km)" type="number" step="0.1" inputMode="decimal" placeholder="5.0" value={runDistance} onChange={setRunDistance} />
          <Field label="Min" type="number" inputMode="numeric" placeholder="28" value={runMinutes} onChange={setRunMinutes} />
          <Field label="Sek" type="number" inputMode="numeric" placeholder="30" value={runSeconds} onChange={setRunSeconds} />
        </div>
      )}

      {/* Duration (all types) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="Tid (min)" type="number" inputMode="numeric" placeholder="60" value={duration} onChange={setDuration} />
        <div>
          <div style={labelStyle}>Känsla</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {FEELING_OPTS.map(o => (
              <button key={o.v} onClick={() => setFeeling(o.v)} style={{ ...chipStyle(feeling === o.v), flex: 1, fontSize: '10px', padding: '5px 2px' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Exercises — only for gym */}
      {isGym && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={labelStyle}>Övningar</div>
          </div>

          {exercises.map((ex, i) => (
            <div key={i} style={{
              background: 'var(--surface2)', borderRadius: '12px',
              border: '1px solid var(--border)', padding: '12px',
            }}>
              {/* Exercise name row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    className="input"
                    placeholder="Övning (t.ex. Bänkpress)"
                    value={ex.name}
                    onChange={e => updateName(i, e.target.value)}
                    onFocus={() => setShowPicker(i)}
                    style={{ fontSize: '13px' }}
                  />
                  {/* Exercise picker dropdown */}
                  {showPicker === i && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      maxHeight: '200px', overflowY: 'auto', marginTop: '4px',
                    }}>
                      {Object.entries(EXERCISE_LIBRARY).map(([group, exs]) => (
                        <div key={group}>
                          <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 700, padding: '6px 12px 2px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{group}</div>
                          {exs.map(name => (
                            <button key={name} onClick={() => { updateName(i, name); setShowPicker(null) }}
                              style={{ width: '100%', textAlign: 'left', padding: '7px 12px', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >{name}</button>
                          ))}
                        </div>
                      ))}
                      <button onClick={() => setShowPicker(null)} style={{ width: '100%', padding: '7px 12px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', borderTop: '1px solid var(--border)' }}>
                        Stäng
                      </button>
                    </div>
                  )}
                </div>
                {exercises.length > 1 && (
                  <button onClick={() => removeExercise(i)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Sets */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 28px', gap: '6px', alignItems: 'center' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>#</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>KG</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, textAlign: 'center' }}>REPS</div>
                  <div />
                </div>
                {ex.sets.map((s, si) => (
                  <div key={si} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 28px', gap: '6px', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'center', fontWeight: 600 }}>{si + 1}</div>
                    <input
                      className="input" type="number" inputMode="decimal" step="0.5"
                      placeholder="—" value={s.weight}
                      onChange={e => updateSet(i, si, 'weight', e.target.value)}
                      style={{ textAlign: 'center', padding: '7px 6px', fontSize: '13px', fontWeight: 600 }}
                    />
                    <input
                      className="input" type="number" inputMode="numeric"
                      placeholder="—" value={s.reps}
                      onChange={e => updateSet(i, si, 'reps', e.target.value)}
                      style={{ textAlign: 'center', padding: '7px 6px', fontSize: '13px', fontWeight: 600 }}
                    />
                    <button onClick={() => ex.sets.length > 1 ? removeSet(i, si) : null}
                      style={{ background: 'transparent', border: 'none', color: ex.sets.length > 1 ? 'var(--muted)' : 'transparent', cursor: ex.sets.length > 1 ? 'pointer' : 'default', padding: '4px', display: 'flex', justifyContent: 'center' }}>
                      <X size={11} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addSet(i)} style={{
                  background: 'transparent', border: '1px dashed var(--border)', borderRadius: '6px',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '11px', padding: '5px',
                  width: '100%', fontFamily: 'Inter, sans-serif',
                }}>+ Set</button>
              </div>
            </div>
          ))}

          <button onClick={() => addExercise()} style={{
            background: 'var(--accent-soft)', border: '1px dashed var(--accent-border)',
            borderRadius: '10px', color: 'var(--accent)', cursor: 'pointer',
            fontSize: '12px', padding: '10px', width: '100%',
            fontFamily: 'Inter, sans-serif', fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}>
            <Plus size={13} /> Lägg till övning
          </button>
        </div>
      )}

      {/* Notes */}
      <Field label="Notering (valfritt)" placeholder="Bra session..." value={notes} onChange={setNotes} multiline />

      <SaveBtn saving={saving} onClick={handleSave} disabled={!hasValidExercises && isGym} />
    </div>
  )
}

// ── Expense form ───────────────────────────────────────────────────────────

function ExpenseForm({ onSave, saving }) {
  const [form, setForm] = useState({ amount: '', category: 'Mat', description: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Field label="Belopp (kr)" type="number" inputMode="numeric" placeholder="150" value={form.amount} onChange={v => f('amount', v)} autoFocus />
      <div>
        <div style={labelStyle}>Kategori</div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {EXPENSE_CATS.map(c => (
            <button key={c} onClick={() => f('category', c)} style={chipStyle(form.category === c)}>{c}</button>
          ))}
        </div>
      </div>
      <Field label="Beskrivning (valfritt)" placeholder="Lunch på Subway..." value={form.description} onChange={v => f('description', v)} />
      <button onClick={() => onSave(form)} disabled={saving || !form.amount} className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '13px', opacity: !form.amount ? 0.5 : 1 }}>
        {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Check size={14} /> Spara</>}
      </button>
    </div>
  )
}

// ── Income form ────────────────────────────────────────────────────────────

function IncomeForm({ onSave, saving }) {
  const [form, setForm] = useState({ amount: '', source: 'PA-jobb', description: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Field label="Belopp (kr)" type="number" inputMode="numeric" placeholder="5000" value={form.amount} onChange={v => f('amount', v)} autoFocus />
      <div>
        <div style={labelStyle}>Källa</div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {INCOME_SOURCES.map(s => (
            <button key={s} onClick={() => f('source', s)} style={chipStyle(form.source === s)}>{s}</button>
          ))}
        </div>
      </div>
      <Field label="Beskrivning (valfritt)" placeholder="Lön mars..." value={form.description} onChange={v => f('description', v)} />
      <button onClick={() => onSave(form)} disabled={saving || !form.amount} className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '13px', opacity: !form.amount ? 0.5 : 1 }}>
        {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Check size={14} /> Spara</>}
      </button>
    </div>
  )
}

// ── Journal form ───────────────────────────────────────────────────────────

function JournalForm({ onSave, saving }) {
  const [form, setForm] = useState({ mood: '', energy: '', highlights: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <div style={labelStyle}>Humör</div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => f('mood', n)} style={{
                width: 26, height: 26, borderRadius: '6px', border: '1px solid',
                borderColor: form.mood === n ? 'var(--accent)' : 'var(--border)',
                background: form.mood === n ? 'var(--accent-soft)' : 'var(--surface2)',
                color: form.mood === n ? 'var(--accent)' : 'var(--muted)',
                fontSize: '11px', fontWeight: form.mood === n ? 700 : 400,
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>{n}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Energi</div>
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} onClick={() => f('energy', n)} style={{
                width: 26, height: 26, borderRadius: '6px', border: '1px solid',
                borderColor: form.energy === n ? 'var(--accent)' : 'var(--border)',
                background: form.energy === n ? 'var(--accent-soft)' : 'var(--surface2)',
                color: form.energy === n ? 'var(--accent)' : 'var(--muted)',
                fontSize: '11px', fontWeight: form.energy === n ? 700 : 400,
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>{n}</button>
            ))}
          </div>
        </div>
      </div>
      <Field label="Highlights" placeholder="Vad var bra idag?" value={form.highlights} onChange={v => f('highlights', v)} />
      <Field label="Notering" placeholder="Tankar, reflektioner..." value={form.notes} onChange={v => f('notes', v)} multiline />
      <button onClick={() => onSave(form)} disabled={saving} className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '13px' }}>
        {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Check size={14} /> Spara</>}
      </button>
    </div>
  )
}

// ── Main FAB ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'training', label: 'Träning',  icon: Dumbbell,    color: '#4f8ef7' },
  { id: 'health',   label: 'Hälsa',    icon: Heart,       color: '#10b981' },
  { id: 'expense',  label: 'Utgift',   icon: DollarSign,  color: '#f97316' },
  { id: 'income',   label: 'Inkomst',  icon: TrendingUp,  color: '#34d399' },
  { id: 'journal',  label: 'Journal',  icon: BookOpen,    color: '#a78bfa' },
]

export default function QuickLog() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('training')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const overlayRef = useRef()

  function handleOverlay(e) {
    if (e.target === overlayRef.current) setOpen(false)
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function handleSave(form) {
    if (!user) return
    setSaving(true)
    try {
      const today = TODAY()

      if (activeTab === 'health') {
        const payload = { user_id: user.id, date: today }
        if (form.weight_kg) payload.weight_kg = parseFloat(form.weight_kg)
        if (form.sleep_hours) payload.sleep_hours = parseFloat(form.sleep_hours)
        if (form.energy) { payload.energy = form.energy; payload.energy_level = form.energy }
        if (form.steps) payload.steps = parseInt(form.steps)
        await supabase.from('health_logs').upsert(payload, { onConflict: 'user_id,date' })

      } else if (activeTab === 'training') {
        const { sessionType, duration, feeling, notes, exercises, runDistance, runMinutes, runSeconds } = form
        const isRun = sessionType === 'run'

        let extraFields = {}
        if (isRun) {
          const totalSeconds = (parseInt(runMinutes || 0) * 60) + parseInt(runSeconds || 0)
          const distKm = parseFloat(runDistance) || null
          const pacePerKm = distKm && totalSeconds ? Math.round(totalSeconds / distKm) : null
          extraFields = {
            distance_km: distKm,
            time_seconds: totalSeconds || null,
            pace_per_km: pacePerKm,
          }
        }

        const { data: session, error } = await supabase
          .from('training_sessions')
          .insert({
            user_id: user.id,
            date: today,
            session_type: sessionType,
            duration_minutes: duration ? parseInt(duration) : null,
            feeling: feeling || null,
            notes: notes || '',
            source: 'quick_log',
            ...extraFields,
          })
          .select()
          .single()

        if (!error && session && sessionType === 'gym') {
          // Insert exercises
          const exerciseRows = exercises.flatMap((ex, _) =>
            ex.sets.map((s, si) => ({
              session_id: session.id,
              exercise_name: ex.name,
              set_number: si + 1,
              reps: s.reps ? parseInt(s.reps) : null,
              weight_kg: s.weight ? parseFloat(s.weight) : null,
              is_dropset: false,
            }))
          ).filter(r => r.exercise_name)

          if (exerciseRows.length > 0) {
            await supabase.from('training_exercises').insert(exerciseRows)
          }

          // Update PRs
          for (const ex of exercises) {
            const maxWeight = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0))
            if (maxWeight > 0 && ex.name) {
              const { data: existingPR } = await supabase
                .from('personal_records')
                .select('weight_kg')
                .eq('user_id', user.id)
                .eq('exercise_name', ex.name)
                .maybeSingle()
              if (!existingPR || maxWeight > existingPR.weight_kg) {
                await supabase.from('personal_records').upsert({
                  user_id: user.id,
                  exercise_name: ex.name,
                  weight_kg: maxWeight,
                  date: today,
                }, { onConflict: 'user_id,exercise_name' })
              }
            }
          }
        }

      } else if (activeTab === 'expense') {
        if (!form.amount) { setSaving(false); return }
        await supabase.from('expense_logs').insert({
          user_id: user.id, date: today,
          amount: parseFloat(form.amount),
          category: form.category || 'Övrigt',
          description: form.description || '',
        })

      } else if (activeTab === 'income') {
        if (!form.amount) { setSaving(false); return }
        await supabase.from('income_logs').insert({
          user_id: user.id, date: today,
          amount: parseFloat(form.amount),
          source: form.source || 'Övrigt',
          description: form.description || '',
        })

      } else if (activeTab === 'journal') {
        const payload = { user_id: user.id, date: today }
        if (form.mood) payload.mood = form.mood
        if (form.energy) payload.energy = form.energy
        if (form.highlights) payload.highlights = form.highlights
        if (form.notes) payload.notes = form.notes
        await supabase.from('journal_entries').upsert(payload, { onConflict: 'user_id,date' })
      }

      setSaved(true)
      setTimeout(() => { setSaved(false); setOpen(false) }, 1000)
    } catch (e) {
      console.error('QuickLog save error:', e)
    }
    setSaving(false)
  }

  const activeColor = TABS.find(t => t.id === activeTab)?.color || 'var(--accent)'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Snabblogg"
        className="quicklog-fab"
        style={{
          position: 'fixed', bottom: '24px', right: '20px', zIndex: 200,
          width: '52px', height: '52px', borderRadius: '50%', border: 'none',
          background: 'var(--accent)',
          boxShadow: '0 4px 20px var(--accent-glow), 0 2px 8px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        <Plus size={22} color="white" strokeWidth={2.5} />
      </button>

      {open && (
        <div ref={overlayRef} onClick={handleOverlay} style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div style={{
            width: '100%', maxWidth: '540px',
            background: 'var(--surface)',
            border: '1px solid var(--glass-border)',
            borderRadius: '22px 22px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            animation: 'slideUp 0.22s cubic-bezier(0.32,0.72,0,1)',
          }}>

            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px 12px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Snabblogg</div>
              <button onClick={() => setOpen(false)} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)',
                borderRadius: '50%', width: 28, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--muted)',
              }}>
                <X size={14} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', padding: '0 16px', gap: '2px', borderBottom: '1px solid var(--border)' }}>
              {TABS.map(t => {
                const active = activeTab === t.id
                return (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '3px', padding: '8px 4px 10px', border: 'none', background: 'transparent',
                    borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
                    color: active ? t.color : 'var(--muted)',
                    cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'Inter, sans-serif',
                  }}>
                    <t.icon size={15} />
                    <span style={{ fontSize: '10px', fontWeight: active ? 600 : 400 }}>{t.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Form */}
            <div style={{ padding: '16px 20px 32px', overflowY: 'auto', maxHeight: '70vh' }}>
              {saved ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '10px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: activeColor + '20', border: '2px solid ' + activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={24} color={activeColor} />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Sparat!</div>
                </div>
              ) : (
                <>
                  {activeTab === 'training' && <GymForm   onSave={handleSave} saving={saving} />}
                  {activeTab === 'health'   && <HealthForm onSave={handleSave} saving={saving} />}
                  {activeTab === 'expense'  && <ExpenseForm onSave={handleSave} saving={saving} />}
                  {activeTab === 'income'   && <IncomeForm  onSave={handleSave} saving={saving} />}
                  {activeTab === 'journal'  && <JournalForm onSave={handleSave} saving={saving} />}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  )
}
