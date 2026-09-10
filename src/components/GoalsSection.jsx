import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Target, Plus, Check, Edit2, Trash2, X, Save, RotateCcw, Pin } from 'lucide-react'
import {
  listGoals, createGoal, updateGoal, deleteGoal,
  goalProgress, goalDaysLeft, GOAL_DOMAIN_LABEL,
} from '../lib/goals'
import { metricsForDomain, GOAL_METRICS, resolveGoalsProgress, formatMetricValue } from '../lib/goalMetrics'

const DOMAIN_COLOR = {
  traning: '#3b82f6', halsa: '#10b981', ekonomi: '#f59e0b', plugg: '#a78bfa',
  resor: '#e879f9', jobb: '#f97316', livet: '#22d3ee',
}

const EMPTY_FORM = { title: '', metric: '', target_value: '', current_value: '', unit: '', deadline: '', direction: 'up' }

// `domain` null → show every goal (Profil). Otherwise only that domain's goals.
export default function GoalsSection({ domain = null, title = 'Mål' }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [goals, setGoals] = useState([])
  const [progress, setProgress] = useState({})
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const all = await listGoals(user.id, { status: 'all' })
      const shown = domain ? all.filter((g) => (g.category || g.domain) === domain) : all
      setGoals(shown)
      setProgress(await resolveGoalsProgress(user.id, shown.filter((g) => g.status === 'active')))
      setUnavailable(false)
    } catch {
      setUnavailable(true) // `goals` table not migrated yet (post_deploy_05)
      setGoals([])
    }
    setLoading(false)
  }, [user, domain])

  useEffect(() => { load() }, [load])

  const metricOptions = metricsForDomain(domain)

  function openNew() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setShowForm(true)
  }

  function openEdit(g) {
    setEditingId(g.id)
    setForm({
      title: g.title || '',
      metric: g.metric || '',
      target_value: g.target_value ?? '',
      current_value: g.current_value ?? '',
      unit: g.unit || '',
      deadline: g.deadline || '',
      direction: g.direction || 'up',
    })
    setShowForm(true)
  }

  function pickMetric(key) {
    const m = GOAL_METRICS[key]
    setForm((f) => ({
      ...f,
      metric: key,
      unit: m ? m.unit : f.unit,
      direction: m ? m.direction : f.direction,
    }))
  }

  async function save() {
    if (!form.title.trim()) { toast({ message: 'Målet behöver en titel', type: 'error' }); return }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        category: domain || null,
        metric: form.metric || null,
        unit: form.unit || null,
        target_value: form.target_value === '' ? null : Number(form.target_value),
        current_value: form.metric ? null : (form.current_value === '' ? null : Number(form.current_value)),
        direction: form.direction,
        deadline: form.deadline || null,
      }
      if (editingId) await updateGoal(editingId, payload)
      else await createGoal(user.id, payload)
      setShowForm(false)
      setForm({ ...EMPTY_FORM })
      await load()
    } catch (e) {
      toast({ message: 'Kunde inte spara målet' + (String(e?.message || '').includes('column') ? ' — kör db-migrationen först' : ''), type: 'error' })
    }
    setSaving(false)
  }

  async function toggleDone(g) {
    try {
      await updateGoal(g.id, { status: g.status === 'done' ? 'active' : 'done' })
      await load()
    } catch { toast({ message: 'Kunde inte uppdatera', type: 'error' }) }
  }

  async function togglePin(g) {
    try {
      await updateGoal(g.id, { pinned: !g.pinned })
      await load()
    } catch { toast({ message: 'Kunde inte fästa målet', type: 'error' }) }
  }

  async function remove(g) {
    if (!window.confirm(`Ta bort målet "${g.title}"?`)) return
    try { await deleteGoal(g.id); await load() }
    catch { toast({ message: 'Kunde inte ta bort', type: 'error' }) }
  }

  if (unavailable) return null
  if (loading && goals.length === 0) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <SectionCap title={title} />
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '4px 0' }}>Laddar mål…</div>
      </div>
    )
  }

  const active = goals
    .filter((g) => g.status === 'active')
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
  const done = goals.filter((g) => g.status === 'done')

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionCap title={title} />
        {!showForm && (
          <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={openNew}>
            <Plus size={13} /> Nytt mål
          </button>
        )}
      </div>

      {showForm && (
        <GoalForm
          form={form} setForm={setForm} pickMetric={pickMetric}
          metricOptions={metricOptions} domain={domain}
          saving={saving} onSave={save} onCancel={() => { setShowForm(false); setForm({ ...EMPTY_FORM }) }}
          editing={!!editingId}
        />
      )}

      {active.length === 0 && !showForm && (
        <div style={{ fontSize: 13, color: 'var(--muted)', padding: '6px 0' }}>
          Inga aktiva mål{domain ? ` för ${GOAL_DOMAIN_LABEL[domain]?.toLowerCase() || domain}` : ''} ännu.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {active.map((g) => (
          <GoalRow key={g.id} g={g} live={progress[g.id]} onEdit={() => openEdit(g)} onDone={() => toggleDone(g)} onRemove={() => remove(g)} onPin={() => togglePin(g)} showDomain={!domain} />
        ))}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Uppnådda ({done.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {done.map((g) => (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <Check size={13} color="var(--green)" style={{ flexShrink: 0 }} />
                <span style={{ color: 'var(--muted2)', textDecoration: 'line-through', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                <button onClick={() => toggleDone(g)} title="Återöppna" style={iconBtn}><RotateCcw size={12} /></button>
                <button onClick={() => remove(g)} title="Ta bort" style={iconBtn}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 3, display: 'flex', flexShrink: 0 }

function SectionCap({ title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Target size={14} color="var(--accent)" />
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted2)' }}>{title}</span>
    </div>
  )
}

function GoalRow({ g, live, onEdit, onDone, onRemove, onPin, showDomain }) {
  const dom = g.category || g.domain
  const col = DOMAIN_COLOR[dom] || 'var(--accent)'
  // Metric-linked goals get their current value live; manual goals use the stored one.
  const current = g.metric ? live?.value : g.current_value
  const pct = g.target_value != null && current != null
    ? goalProgress({ ...g, current_value: current })
    : null
  const dl = goalDaysLeft(g)

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: col, flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{g.title}</span>
          {showDomain && dom && (
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: col, border: `1px solid ${col}44`, borderRadius: 4, padding: '1px 5px' }}>
              {GOAL_DOMAIN_LABEL[dom] || dom}
            </span>
          )}
          {dl != null && (
            <span style={{ fontSize: 11, fontWeight: 600, color: dl < 0 ? 'var(--red)' : dl <= 14 ? 'var(--amber)' : 'var(--muted)' }}>
              {dl < 0 ? `försenat ${-dl}d` : `${dl}d kvar`}
            </span>
          )}
        </div>

        {g.target_value != null && (
          <div style={{ marginTop: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--muted)', marginBottom: 3 }}>
              <span>
                {current != null ? formatMetricValue(current, g.unit) : '—'} / {formatMetricValue(g.target_value, g.unit)}
                {g.metric && <span style={{ marginLeft: 5, opacity: 0.7 }}>· auto{live?.asOf ? ` (${live.asOf})` : ''}</span>}
              </span>
              {pct != null && <span style={{ fontWeight: 700, color: col }}>{Math.round(pct * 100)}%</span>}
            </div>
            <div style={{ height: 5, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((pct ?? 0) * 100)}%`, background: col, borderRadius: 3, transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}
        {g.target_value == null && g.description && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{g.description}</div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
        {onPin && (
          <button onClick={onPin} title={g.pinned ? 'Lossa från översikten' : 'Fäst i översikten'}
            style={{ ...iconBtn, color: g.pinned ? col : 'var(--muted)' }}>
            <Pin size={13} fill={g.pinned ? col : 'none'} />
          </button>
        )}
        <button onClick={onDone} title="Markera som uppnått" style={iconBtn}><Check size={14} /></button>
        <button onClick={onEdit} title="Redigera" style={iconBtn}><Edit2 size={13} /></button>
        <button onClick={onRemove} title="Ta bort" style={iconBtn}><Trash2 size={13} /></button>
      </div>
    </div>
  )
}

function GoalForm({ form, setForm, pickMetric, metricOptions, domain, saving, onSave, onCancel, editing }) {
  const f = (k, v) => setForm((s) => ({ ...s, [k]: v }))
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input className="input" placeholder="Vad vill du uppnå?" value={form.title} autoFocus onChange={(e) => f('title', e.target.value)} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="input" value={form.metric} onChange={(e) => (e.target.value ? pickMetric(e.target.value) : f('metric', ''))} style={{ flex: '1 1 180px' }}>
          <option value="">Manuellt värde (jag uppdaterar själv)</option>
          {metricOptions.map((m) => (
            <option key={m.key} value={m.key}>Koppla till: {m.label}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="input" type="number" placeholder="Målvärde" value={form.target_value} onChange={(e) => f('target_value', e.target.value)} style={{ flex: '1 1 110px' }} />
        <input className="input" placeholder="Enhet" value={form.unit} disabled={!!form.metric} onChange={(e) => f('unit', e.target.value)} style={{ flex: '0 1 90px' }} />
        {!form.metric && (
          <input className="input" type="number" placeholder="Nuläge" value={form.current_value} onChange={(e) => f('current_value', e.target.value)} style={{ flex: '1 1 110px' }} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11.5, color: 'var(--muted)' }}>Deadline (valfritt)</label>
        <input className="input" type="date" value={form.deadline} onChange={(e) => f('deadline', e.target.value)} style={{ flex: '0 1 160px' }} />
        {!form.metric && (
          <select className="input" value={form.direction} onChange={(e) => f('direction', e.target.value)} style={{ flex: '0 1 150px' }}>
            <option value="up">Högre är bättre</option>
            <option value="down">Lägre är bättre</option>
          </select>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button className="btn btn-primary" style={{ fontSize: 12, gap: 5 }} disabled={saving} onClick={onSave}>
          <Save size={13} /> {editing ? 'Spara' : 'Skapa mål'}
        </button>
        <button className="btn btn-ghost" style={{ fontSize: 12, gap: 5 }} onClick={onCancel}><X size={13} /> Avbryt</button>
      </div>
    </div>
  )
}
