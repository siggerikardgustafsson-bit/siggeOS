import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, X, Heart, Dumbbell, DollarSign, TrendingUp, BookOpen, Check, Loader } from 'lucide-react'

const TODAY = () => format(new Date(), 'yyyy-MM-dd')

const EXPENSE_CATS = ['Mat', 'Transport', 'Nöje', 'Kläder', 'Hälsa', 'Prenumerationer', 'Hyra', 'Övrigt']
const INCOME_SOURCES = ['PA-jobb', 'Erik Norling', 'CSN', 'Skatteåterbäring', 'Övrigt']
const TRAINING_TYPES = ['Gym', 'Löpning', 'Cykling', 'Simning', 'Övrigt']
const FEELING_OPTS = [
  { v: 3, label: '😴 Trött' },
  { v: 5, label: '😐 Ok' },
  { v: 7, label: '💪 Bra' },
  { v: 9, label: '🔥 Grym' },
]

// ── Sub-forms ──────────────────────────────────────────────────────────────

function HealthForm({ onSave, saving }) {
  const [form, setForm] = useState({ weight_kg: '', sleep_hours: '', energy: '', steps: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="Vikt (kg)" type="number" step="0.1" placeholder="77.0" value={form.weight_kg} onChange={v => f('weight_kg', v)} />
        <Field label="Sömn (h)" type="number" step="0.5" placeholder="7.5" value={form.sleep_hours} onChange={v => f('sleep_hours', v)} />
      </div>
      <div>
        <div style={labelStyle}>Energi</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <button key={n} onClick={() => f('energy', n)} style={{
              flex: 1, padding: '6px 0', borderRadius: '6px', border: '1px solid',
              borderColor: form.energy === n ? 'var(--accent)' : 'var(--border)',
              background: form.energy === n ? 'var(--accent-soft)' : 'var(--surface2)',
              color: form.energy === n ? 'var(--accent)' : 'var(--muted)',
              fontSize: '11px', fontWeight: form.energy === n ? 700 : 400, cursor: 'pointer',
              fontFamily: 'Inter, sans-serif', transition: 'all 0.12s',
            }}>{n}</button>
          ))}
        </div>
      </div>
      <Field label="Steg" type="number" placeholder="8000" value={form.steps} onChange={v => f('steps', v)} />
      <SaveBtn saving={saving} onClick={() => onSave(form)} />
    </div>
  )
}

function TrainingForm({ onSave, saving }) {
  const [form, setForm] = useState({ session_type: 'Gym', duration_minutes: '', distance_km: '', feeling: 7, notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <div style={labelStyle}>Typ</div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {TRAINING_TYPES.map(t => (
            <button key={t} onClick={() => f('session_type', t)} style={chipStyle(form.session_type === t)}>{t}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <Field label="Tid (min)" type="number" placeholder="60" value={form.duration_minutes} onChange={v => f('duration_minutes', v)} />
        <Field label="Distans (km)" type="number" step="0.1" placeholder="5.0" value={form.distance_km} onChange={v => f('distance_km', v)} />
      </div>
      <div>
        <div style={labelStyle}>Känsla</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {FEELING_OPTS.map(o => (
            <button key={o.v} onClick={() => f('feeling', o.v)} style={{ ...chipStyle(form.feeling === o.v), flex: 1, fontSize: '11px' }}>{o.label}</button>
          ))}
        </div>
      </div>
      <Field label="Notering (valfritt)" placeholder="Bra session, slog PR på bänk..." value={form.notes} onChange={v => f('notes', v)} />
      <SaveBtn saving={saving} onClick={() => onSave(form)} />
    </div>
  )
}

function ExpenseForm({ onSave, saving }) {
  const [form, setForm] = useState({ amount: '', category: 'Mat', description: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Field label="Belopp (kr)" type="number" placeholder="150" value={form.amount} onChange={v => f('amount', v)} autoFocus />
      <div>
        <div style={labelStyle}>Kategori</div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {EXPENSE_CATS.map(c => (
            <button key={c} onClick={() => f('category', c)} style={chipStyle(form.category === c)}>{c}</button>
          ))}
        </div>
      </div>
      <Field label="Beskrivning (valfritt)" placeholder="Lunch på Subway..." value={form.description} onChange={v => f('description', v)} />
      <SaveBtn saving={saving} onClick={() => onSave(form)} />
    </div>
  )
}

function IncomeForm({ onSave, saving }) {
  const [form, setForm] = useState({ amount: '', source: 'PA-jobb', description: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <Field label="Belopp (kr)" type="number" placeholder="5000" value={form.amount} onChange={v => f('amount', v)} autoFocus />
      <div>
        <div style={labelStyle}>Källa</div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {INCOME_SOURCES.map(s => (
            <button key={s} onClick={() => f('source', s)} style={chipStyle(form.source === s)}>{s}</button>
          ))}
        </div>
      </div>
      <Field label="Beskrivning (valfritt)" placeholder="Lön mars..." value={form.description} onChange={v => f('description', v)} />
      <SaveBtn saving={saving} onClick={() => onSave(form)} />
    </div>
  )
}

function JournalForm({ onSave, saving }) {
  const [form, setForm] = useState({ mood: '', energy: '', highlights: '', notes: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <div style={labelStyle}>Humör</div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
      <SaveBtn saving={saving} onClick={() => onSave(form)} />
    </div>
  )
}

// ── Shared UI helpers ──────────────────────────────────────────────────────

const labelStyle = { fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: '5px', textTransform: 'uppercase' }

function chipStyle(active) {
  return {
    padding: '4px 10px', borderRadius: '20px', border: '1px solid',
    borderColor: active ? 'var(--accent-border)' : 'var(--border)',
    background: active ? 'var(--accent-soft)' : 'var(--surface2)',
    color: active ? 'var(--accent)' : 'var(--muted)',
    fontSize: '11px', fontWeight: active ? 600 : 400,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif', transition: 'all 0.12s',
  }
}

function Field({ label, type = 'text', placeholder, value, onChange, step, autoFocus, multiline }) {
  return (
    <div>
      {label && <div style={labelStyle}>{label}</div>}
      {multiline ? (
        <textarea
          className="input" rows={3}
          placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)}
          style={{ resize: 'none', fontFamily: 'Inter, sans-serif' }}
        />
      ) : (
        <input
          className="input" type={type} step={step}
          placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
          style={{ fontFamily: 'Inter, sans-serif' }}
        />
      )}
    </div>
  )
}

function SaveBtn({ onClick, saving }) {
  return (
    <button onClick={onClick} disabled={saving} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '11px', fontSize: '13px', marginTop: '2px' }}>
      {saving
        ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</>
        : <><Check size={14} /> Spara</>
      }
    </button>
  )
}

// ── Main FAB component ─────────────────────────────────────────────────────

const TABS = [
  { id: 'health',   label: 'Hälsa',    icon: Heart,       color: '#10b981' },
  { id: 'training', label: 'Träning',  icon: Dumbbell,    color: '#4f8ef7' },
  { id: 'expense',  label: 'Utgift',   icon: DollarSign,  color: '#f97316' },
  { id: 'income',   label: 'Inkomst',  icon: TrendingUp,  color: '#34d399' },
  { id: 'journal',  label: 'Journal',  icon: BookOpen,    color: '#a78bfa' },
]

export default function QuickLog() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('health')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const overlayRef = useRef()

  // Close on overlay click
  function handleOverlay(e) {
    if (e.target === overlayRef.current) setOpen(false)
  }

  // Close on Escape
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
        if (form.energy) payload.energy = form.energy
        if (form.steps) payload.steps = parseInt(form.steps)
        await supabase.from('health_logs').upsert(payload, { onConflict: 'user_id,date' })
      } else if (activeTab === 'training') {
        await supabase.from('training_sessions').insert({
          user_id: user.id,
          date: today,
          session_type: (form.session_type || 'Gym').toLowerCase(),
          duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
          distance_km: form.distance_km ? parseFloat(form.distance_km) : null,
          feeling: form.feeling || null,
          notes: form.notes || '',
          source: 'quick_log',
        })
      } else if (activeTab === 'expense') {
        if (!form.amount) { setSaving(false); return }
        await supabase.from('expense_logs').insert({
          user_id: user.id,
          date: today,
          amount: parseFloat(form.amount),
          category: form.category || 'Övrigt',
          description: form.description || '',
        })
      } else if (activeTab === 'income') {
        if (!form.amount) { setSaving(false); return }
        await supabase.from('income_logs').insert({
          user_id: user.id,
          date: today,
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
      setTimeout(() => {
        setSaved(false)
        setOpen(false)
      }, 900)
    } catch (e) {
      console.error('QuickLog save error:', e)
    }
    setSaving(false)
  }

  const activeColor = TABS.find(t => t.id === activeTab)?.color || 'var(--accent)'

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setOpen(true)}
        title="Snabblogg"
        style={{
          position: 'fixed',
          bottom: '80px',    // above bottom nav on mobile
          right: '18px',
          zIndex: 200,
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          border: 'none',
          background: 'var(--accent)',
          boxShadow: '0 4px 20px var(--accent-glow), 0 2px 8px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 26px var(--accent-glow), 0 3px 10px rgba(0,0,0,0.45)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px var(--accent-glow), 0 2px 8px rgba(0,0,0,0.4)' }}
      >
        <Plus size={22} color="white" strokeWidth={2.5} />
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          ref={overlayRef}
          onClick={handleOverlay}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 0 0 0',
          }}
        >
          <div style={{
            width: '100%',
            maxWidth: '520px',
            background: 'var(--surface)',
            border: '1px solid var(--glass-border)',
            borderRadius: '22px 22px 0 0',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
            padding: '0 0 env(safe-area-inset-bottom)',
            overflow: 'hidden',
            animation: 'slideUp 0.22s cubic-bezier(0.32,0.72,0,1)',
          }}>

            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border2)' }} />
            </div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px 14px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Snabblogg</div>
              <button onClick={() => setOpen(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--muted)' }}>
                <X size={14} />
              </button>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', padding: '0 16px', gap: '4px', borderBottom: '1px solid var(--border)', marginBottom: '2px' }}>
              {TABS.map(t => {
                const active = activeTab === t.id
                return (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '3px', padding: '8px 4px 10px',
                    border: 'none', background: 'transparent',
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

            {/* Form content */}
            <div style={{ padding: '16px 20px 24px', overflowY: 'auto', maxHeight: '65vh' }}>
              {saved ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '10px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: activeColor + '20', border: '2px solid ' + activeColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Check size={24} color={activeColor} />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>Sparat!</div>
                </div>
              ) : (
                <>
                  {activeTab === 'health'   && <HealthForm   onSave={handleSave} saving={saving} />}
                  {activeTab === 'training' && <TrainingForm onSave={handleSave} saving={saving} />}
                  {activeTab === 'expense'  && <ExpenseForm  onSave={handleSave} saving={saving} />}
                  {activeTab === 'income'   && <IncomeForm   onSave={handleSave} saving={saving} />}
                  {activeTab === 'journal'  && <JournalForm  onSave={handleSave} saving={saving} />}
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
