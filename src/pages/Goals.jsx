import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, parseISO, differenceInDays } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Plus, X, Save, Loader, Check, Edit2, Target, TrendingUp, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

const CATEGORIES = [
  { id: 'hälsa',    label: 'Hälsa',    color: '#10b981' },
  { id: 'träning',  label: 'Träning',  color: '#4f8ef7' },
  { id: 'ekonomi',  label: 'Ekonomi',  color: '#f59e0b' },
  { id: 'plugg',    label: 'Plugg',    color: '#a78bfa' },
  { id: 'livsstil', label: 'Livsstil', color: '#f472b6' },
  { id: 'övrigt',   label: 'Övrigt',   color: '#6b7280' },
]

const UNITS = ['kg', 'kr', 'km', 'h', 'st', '%', 'min', 'ggr/vecka', 'poäng', 'custom']

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'hälsa',
  target_value: '',
  current_value: '',
  unit: 'kg',
  deadline: '',
  status: 'active',
}

function catColor(catId) {
  return CATEGORIES.find(c => c.id === catId)?.color || '#6b7280'
}

function ProgressRing({ pct, color, size = 52 }) {
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct, 100) / 100) * circ
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={5}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x={size / 2} y={size / 2 + 4} textAnchor="middle"
        fontSize={size > 50 ? 11 : 9} fontWeight="700" fill={color} fontFamily="Inter, sans-serif">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

function GoalCard({ goal, onEdit, onDelete, onUpdateValue }) {
  const [expanded, setExpanded] = useState(false)
  const [editingVal, setEditingVal] = useState(false)
  const [newVal, setNewVal] = useState('')
  const [saving, setSaving] = useState(false)

  const color = catColor(goal.category)
  const current = parseFloat(goal.current_value) || 0
  const target = parseFloat(goal.target_value) || 1
  const pct = Math.min((current / target) * 100, 100)
  const done = pct >= 100

  const daysLeft = goal.deadline
    ? differenceInDays(parseISO(goal.deadline), new Date())
    : null

  async function saveValue() {
    if (newVal === '') return
    setSaving(true)
    await onUpdateValue(goal.id, parseFloat(newVal))
    setEditingVal(false)
    setNewVal('')
    setSaving(false)
  }

  return (
    <div className="card" style={{
      borderColor: done ? color + '40' : 'var(--border)',
      background: done ? color + '08' : undefined,
    }}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
        <ProgressRing pct={pct} color={color} size={54} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {goal.title}
            </div>
            {done && (
              <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: 4, background: color + '20', color, fontWeight: 700, flexShrink: 0 }}>
                KLART
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: 20, background: color + '15', color, fontWeight: 600 }}>
              {CATEGORIES.find(c => c.id === goal.category)?.label || goal.category}
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>
              {current} / {goal.target_value} {goal.unit}
            </span>
            {daysLeft !== null && (
              <span style={{ fontSize: '11px', color: daysLeft < 0 ? '#ef4444' : daysLeft < 14 ? '#f59e0b' : 'var(--muted)' }}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}d försenad` : daysLeft === 0 ? 'idag' : `${daysLeft}d kvar`}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => setEditingVal(v => !v)} title="Uppdatera värde" style={{
            background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
            borderRadius: 8, padding: '5px 10px', color: 'var(--accent)',
            cursor: 'pointer', fontSize: '11px', fontFamily: 'Inter, sans-serif', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <TrendingUp size={11} /> Logga
          </button>
          <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ marginTop: 10, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 2,
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          transition: 'width 0.6s ease',
          maxWidth: '100%',
        }} />
      </div>

      {/* Inline value logger */}
      {editingVal && (
        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            type="number"
            step="0.1"
            autoFocus
            placeholder={`Nuvarande ${goal.unit}...`}
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveValue(); if (e.key === 'Escape') setEditingVal(false) }}
            style={{ flex: 1, fontSize: '13px', padding: '7px 10px' }}
          />
          <button onClick={saveValue} disabled={saving || !newVal} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12px' }}>
            {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
          </button>
          <button onClick={() => setEditingVal(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          {goal.description && (
            <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6, marginBottom: 10 }}>{goal.description}</div>
          )}
          {goal.deadline && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: 8 }}>
              Deadline: <span style={{ color: 'var(--text)' }}>{format(parseISO(goal.deadline), 'd MMMM yyyy', { locale: sv })}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => onEdit(goal)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)',
              color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
            }}>
              <Edit2 size={11} /> Redigera
            </button>
            <button onClick={() => onDelete(goal.id)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
              borderRadius: 7, border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.06)',
              color: '#f87171', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
            }}>
              <Trash2 size={11} /> Ta bort
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function GoalForm({ initial, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const color = catColor(form.category)

  return (
    <div className="card" style={{ borderColor: color + '30', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>{initial.id ? 'Redigera mål' : 'Nytt mål'}</div>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>TITEL</label>
          <input className="input" placeholder="t.ex. Nå 80 kg" value={form.title} onChange={e => f('title', e.target.value)} autoFocus />
        </div>

        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>KATEGORI</label>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => f('category', c.id)} style={{
                padding: '5px 12px', borderRadius: 20, border: '1px solid',
                borderColor: form.category === c.id ? c.color : 'var(--border)',
                background: form.category === c.id ? c.color + '18' : 'var(--surface2)',
                color: form.category === c.id ? c.color : 'var(--muted)',
                fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                fontWeight: form.category === c.id ? 600 : 400,
              }}>{c.label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>NUVARANDE</label>
            <input className="input" type="number" step="0.1" placeholder="0" value={form.current_value} onChange={e => f('current_value', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>MÅL</label>
            <input className="input" type="number" step="0.1" placeholder="100" value={form.target_value} onChange={e => f('target_value', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>ENHET</label>
            <select className="input" value={form.unit} onChange={e => f('unit', e.target.value)} style={{ fontSize: '13px' }}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>DEADLINE (valfritt)</label>
          <input className="input" type="date" value={form.deadline} onChange={e => f('deadline', e.target.value)} />
        </div>

        <div>
          <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>BESKRIVNING (valfritt)</label>
          <textarea className="input" rows={2} placeholder="Varför är detta mål viktigt?" value={form.description} onChange={e => f('description', e.target.value)} style={{ resize: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={onCancel} className="btn btn-ghost">Avbryt</button>
          <button onClick={() => onSave(form)} disabled={saving || !form.title || !form.target_value} className="btn btn-primary">
            {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Spara
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GoalsPage() {
  const { user } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [filterCat, setFilterCat] = useState('all')
  const [filterStatus, setFilterStatus] = useState('active')

  useEffect(() => { if (user) fetchGoals() }, [user])

  async function fetchGoals() {
    setLoading(true)
    const { data } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setGoals(data || [])
    setLoading(false)
  }

  async function saveGoal(form) {
    setSaving(true)
    const payload = {
      user_id: user.id,
      title: form.title,
      description: form.description || null,
      category: form.category,
      target_value: parseFloat(form.target_value),
      current_value: parseFloat(form.current_value) || 0,
      unit: form.unit,
      deadline: form.deadline || null,
      status: parseFloat(form.current_value) >= parseFloat(form.target_value) ? 'completed' : 'active',
    }
    if (form.id) {
      await supabase.from('goals').update(payload).eq('id', form.id)
    } else {
      await supabase.from('goals').insert(payload)
    }
    await fetchGoals()
    setShowForm(false)
    setEditingGoal(null)
    setSaving(false)
  }

  async function updateValue(id, val) {
    const goal = goals.find(g => g.id === id)
    if (!goal) return
    const newStatus = val >= parseFloat(goal.target_value) ? 'completed' : 'active'
    await supabase.from('goals').update({
      current_value: val,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setGoals(prev => prev.map(g => g.id === id ? { ...g, current_value: val, status: newStatus } : g))
  }

  async function deleteGoal(id) {
    if (!window.confirm('Ta bort detta mål?')) return
    await supabase.from('goals').delete().eq('id', id)
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  const allCats = [...new Set(goals.map(g => g.category))]
  const filtered = goals.filter(g => {
    const catOk = filterCat === 'all' || g.category === filterCat
    const statOk = filterStatus === 'all' || g.status === filterStatus
    return catOk && statOk
  })

  const activeGoals = goals.filter(g => g.status === 'active')
  const completedGoals = goals.filter(g => g.status === 'completed')
  const avgProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((sum, g) => {
        const cur = parseFloat(g.current_value) || 0
        const tar = parseFloat(g.target_value) || 1
        return sum + Math.min((cur / tar) * 100, 100)
      }, 0) / activeGoals.length)
    : 0

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Mål</div>
          <div className="page-header-sub">
            {activeGoals.length} aktiva · {completedGoals.length} avklarade · snitt {avgProgress}%
          </div>
        </div>
        <div className="page-header-actions">
          <button onClick={() => { setShowForm(true); setEditingGoal(null) }} className="btn btn-primary">
            <Plus size={13} /> Nytt mål
          </button>
        </div>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding: '16px 16px 0', maxWidth: '760px', margin: '0 auto' }}>

          {/* Summary row */}
          {goals.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              {[
                { label: 'Aktiva mål', value: activeGoals.length, color: '#4f8ef7' },
                { label: 'Avklarade', value: completedGoals.length, color: '#10b981' },
                { label: 'Snitt progress', value: avgProgress + '%', color: '#a78bfa' },
              ].map(s => (
                <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 4 }}>{s.label.toUpperCase()}</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          {goals.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {['active', 'completed', 'all'].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} style={{
                    padding: '5px 11px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: filterStatus === s ? 'var(--accent)' : 'var(--surface2)',
                    color: filterStatus === s ? 'white' : 'var(--muted)',
                    fontSize: '12px', fontFamily: 'Inter, sans-serif', fontWeight: 500,
                  }}>
                    {s === 'active' ? 'Aktiva' : s === 'completed' ? 'Klara' : 'Alla'}
                  </button>
                ))}
              </div>
              {allCats.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={() => setFilterCat('all')} style={{
                    padding: '5px 11px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                    background: filterCat === 'all' ? 'var(--surface3)' : 'transparent',
                    color: filterCat === 'all' ? 'var(--text)' : 'var(--muted)',
                    fontSize: '12px', fontFamily: 'Inter, sans-serif',
                  }}>Alla kategorier</button>
                  {allCats.map(cat => {
                    const c = CATEGORIES.find(x => x.id === cat)
                    return (
                      <button key={cat} onClick={() => setFilterCat(cat)} style={{
                        padding: '5px 11px', borderRadius: 6, border: '1px solid',
                        borderColor: filterCat === cat ? (c?.color || '#6b7280') : 'var(--border)',
                        background: filterCat === cat ? (c?.color || '#6b7280') + '18' : 'transparent',
                        color: filterCat === cat ? (c?.color || 'var(--text)') : 'var(--muted)',
                        fontSize: '12px', fontFamily: 'Inter, sans-serif', cursor: 'pointer',
                      }}>{c?.label || cat}</button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Form */}
          {(showForm && !editingGoal) && (
            <GoalForm initial={EMPTY_FORM} onSave={saveGoal} onCancel={() => setShowForm(false)} saving={saving} />
          )}

          {/* Loading */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '40px 0', color: 'var(--muted)' }}>
              <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> Laddar mål...
            </div>
          )}

          {/* Empty state */}
          {!loading && goals.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <Target size={36} style={{ margin: '0 auto 14px', opacity: 0.25, display: 'block' }} />
              <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: 6 }}>Inga mål än</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: 20 }}>
                Sätt konkreta, mätbara mål och tracka din progress här
              </div>
              <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ margin: '0 auto' }}>
                <Plus size={13} /> Skapa ditt första mål
              </button>
            </div>
          )}

          {/* Goals list */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(goal => {
                if (editingGoal === goal.id) {
                  return (
                    <GoalForm
                      key={goal.id}
                      initial={{ ...goal, deadline: goal.deadline || '', description: goal.description || '' }}
                      onSave={saveGoal}
                      onCancel={() => setEditingGoal(null)}
                      saving={saving}
                    />
                  )
                }
                return (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onEdit={g => setEditingGoal(g.id)}
                    onDelete={deleteGoal}
                    onUpdateValue={updateValue}
                  />
                )
              })}
            </div>
          )}

          {!loading && filtered.length === 0 && goals.length > 0 && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: '13px' }}>
              Inga mål matchar filtret
            </div>
          )}

        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
