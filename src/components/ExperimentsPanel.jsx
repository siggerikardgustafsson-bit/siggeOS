import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { FlaskConical, Plus, X, Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import {
  EXPERIMENT_METRICS, EXPERIMENT_TEMPLATES, evaluateExperiment,
  fetchExperimentDays, experimentsFetchStart,
} from '../lib/experiments'

// Insights → Experiment: personal n-of-1 tests. Change one thing for a fixed
// period and see — against your own data from just before — whether it moved
// what you care about. Evaluation lives in src/lib/experiments.js.

const VERDICT_COLOR = {
  improved: 'var(--green)', worsened: '#ef4444', no_effect: '#f59e0b',
  insufficient: 'var(--muted)', interim: '#60a5fa', upcoming: 'var(--muted)',
}

const EMPTY_FORM = {
  title: '', hypothesis: '', outcome_metric: 'energy', direction: 'up',
  lever_metric: '', lever_op: '>=', lever_target: '',
  duration_days: 14, start_date: format(new Date(), 'yyyy-MM-dd'),
}

const metricOptions = Object.entries(EXPERIMENT_METRICS).map(([id, m]) => ({ id, label: `${m.label} (${m.unit})` }))

function Bar({ pct, color }) {
  return (
    <div style={{ height: '5px', borderRadius: '3px', background: 'var(--surface2)', overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: '3px' }} />
    </div>
  )
}

function ExperimentCard({ exp, days, onEnd, onDelete }) {
  const r = evaluateExperiment(exp, days)
  const col = VERDICT_COLOR[r.verdict] || 'var(--muted)'
  const lever = exp.lever_metric ? EXPERIMENT_METRICS[exp.lever_metric] : null
  return (
    <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)' }}>{exp.title}</div>
          {exp.hypothesis && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.45 }}>{exp.hypothesis}</div>}
        </div>
        <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: col, border: `1px solid ${col}`, borderRadius: '6px', padding: '2px 7px', whiteSpace: 'nowrap', opacity: 0.9 }}>
          {r.verdictLabel}
        </span>
      </div>

      {r.phase !== 'upcoming' && (
        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '10px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.05em' }}>FÖRE ({r.baseline.n} d)</div>
            <div className="mono" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{r.fmt(r.baseline.mean)}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.05em' }}>UNDER ({r.during.n} d)</div>
            <div className="mono" style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>{r.fmt(r.during.mean)}</div>
          </div>
          {r.delta != null && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.05em' }}>SKILLNAD</div>
              <div className="mono" style={{ fontSize: '15px', fontWeight: 800, color: col }}>
                {r.delta > 0 ? '+' : ''}{r.fmt(r.delta)}{r.pct != null ? ` (${r.delta > 0 ? '+' : ''}${Math.round(r.pct)}%)` : ''}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '3px' }}>
            <span>{r.phase === 'upcoming' ? `Startar ${exp.start_date}` : `Dag ${r.dayIndex} av ${r.duration}`}</span>
            <span>{r.windows.during[0]} – {r.windows.during[1]}</span>
          </div>
          <Bar pct={(r.dayIndex / r.duration) * 100} color="#60a5fa" />
        </div>
        {lever && r.adherence?.rate != null && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '3px' }}>
              <span>Följsamhet: {lever.label} {exp.lever_op} {Number(exp.lever_target).toLocaleString('sv-SE')} {lever.unit}</span>
              <span style={{ color: r.lowAdherence ? '#f59e0b' : 'var(--muted)' }}>{Math.round(r.adherence.rate * 100)}% av {r.adherence.n} loggade dagar</span>
            </div>
            <Bar pct={r.adherence.rate * 100} color={r.lowAdherence ? '#f59e0b' : 'var(--green)'} />
          </div>
        )}
      </div>

      {r.phase !== 'upcoming' && (
        <div style={{ fontSize: '11.5px', color: 'var(--muted2)', marginTop: '8px', lineHeight: 1.5 }}>
          {r.verdict === 'improved' && 'Förändringen syns tydligt i datan jämfört med perioden innan. '}
          {r.verdict === 'worsened' && 'Utfallet blev tydligt sämre än perioden innan. '}
          {r.verdict === 'no_effect' && 'Skillnaden är inte större än vad vanlig variation förklarar. '}
          {r.lowAdherence && 'Hävstången hölls sällan – förläng eller gör om innan du drar slutsatser. '}
          <span className="mono" style={{ color: 'var(--muted)' }}>{r.summary}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px', justifyContent: 'flex-end' }}>
        {exp.status === 'active' && r.phase !== 'upcoming' && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '11.5px', padding: '5px 10px' }} onClick={() => onEnd(exp)}>
            <Check size={12} /> {r.phase === 'done' ? 'Markera klart' : 'Avsluta nu'}
          </button>
        )}
        <button type="button" className="btn btn-ghost" style={{ fontSize: '11.5px', padding: '5px 10px', color: 'var(--muted)' }} onClick={() => onDelete(exp)}>
          <Trash2 size={12} /> Ta bort
        </button>
      </div>
    </div>
  )
}

export default function ExperimentsPanel({ userId }) {
  const { toast } = useToast()
  const [experiments, setExperiments] = useState([])
  const [days, setDays] = useState({})
  const [loaded, setLoaded] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('experiments').select('*').eq('user_id', userId)
      .order('start_date', { ascending: false }).limit(20)
    if (error) { setLoaded(true); return } // table not migrated yet → panel stays in its empty state
    const rows = data || []
    setExperiments(rows)
    const from = experimentsFetchStart(rows)
    if (from) setDays(await fetchExperimentDays(supabase, userId, from, format(new Date(), 'yyyy-MM-dd')))
    setLoaded(true)
  }, [userId])

  useEffect(() => { load() }, [load])

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }))
  function applyTemplate(t) {
    setForm({ ...EMPTY_FORM, ...t, lever_target: t.lever_target ?? '', start_date: format(new Date(), 'yyyy-MM-dd') })
    setShowForm(true)
  }

  async function save() {
    if (!form.title.trim()) { toast({ message: 'Ge experimentet ett namn.', type: 'error' }); return }
    const hasLever = !!form.lever_metric
    const target = hasLever ? Number(form.lever_target) : null
    if (hasLever && !Number.isFinite(target)) { toast({ message: 'Ange ett målvärde för hävstången.', type: 'error' }); return }
    setSaving(true)
    const { error } = await supabase.from('experiments').insert({
      user_id: userId,
      title: form.title.trim(),
      hypothesis: form.hypothesis.trim() || null,
      outcome_metric: form.outcome_metric,
      direction: form.direction,
      lever_metric: hasLever ? form.lever_metric : null,
      lever_op: hasLever ? form.lever_op : null,
      lever_target: target,
      duration_days: Number(form.duration_days) || 14,
      start_date: form.start_date,
    })
    setSaving(false)
    if (error) { toast({ message: 'Kunde inte spara experimentet.', type: 'error' }); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    toast({ message: 'Experiment startat — logga som vanligt, resten räknas ut.', type: 'success' })
    load()
  }

  async function endExperiment(exp) {
    const { error } = await supabase.from('experiments').update({ status: 'done', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', exp.id).eq('user_id', userId)
    if (error) { toast({ message: 'Kunde inte avsluta.', type: 'error' }); return }
    load()
  }

  async function deleteExperiment(exp) {
    if (!window.confirm(`Ta bort experimentet "${exp.title}"? Loggarna påverkas inte.`)) return
    const { error } = await supabase.from('experiments').delete().eq('id', exp.id).eq('user_id', userId)
    if (error) { toast({ message: 'Kunde inte ta bort.', type: 'error' }); return }
    load()
  }

  if (!loaded) return null
  const active = experiments.filter((e) => e.status === 'active')
  const done = experiments.filter((e) => e.status !== 'active').slice(0, 4)
  const label = { fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '4px', display: 'block' }

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <FlaskConical size={14} color="#60a5fa" />
        <span style={{ fontSize: '12px', color: 'var(--muted)', flex: 1, minWidth: '180px' }}>EXPERIMENT · ändra en sak, mät effekten mot perioden innan</span>
        {!showForm && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '12px', padding: '5px 10px' }} onClick={() => { setForm(EMPTY_FORM); setShowForm(true) }}>
            <Plus size={13} /> Nytt experiment
          </button>
        )}
      </div>

      {!experiments.length && !showForm && (
        <div style={{ fontSize: '12.5px', color: 'var(--muted2)', lineHeight: 1.55, marginBottom: '10px' }}>
          Samband visar vad som brukar hänga ihop – ett experiment visar vad som händer när <em>du</em> ändrar något.
          Välj en mall, fortsätt logga som vanligt, så jämförs utfallet med dina egna {14} dagar innan.
        </div>
      )}

      {(showForm || !experiments.length) && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: showForm ? '12px' : 0 }}>
          {EXPERIMENT_TEMPLATES.map((t) => (
            <button key={t.title} type="button" onClick={() => applyTemplate(t)}
              style={{ fontSize: '11.5px', padding: '5px 10px', borderRadius: '999px', border: '1px solid var(--border)', background: form.title === t.title ? 'rgba(96,165,250,0.12)' : 'var(--surface2)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {t.title}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Namn</span>
              <input className="input" value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="t.ex. Sov minst 7 timmar" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Hypotes (valfri)</span>
              <input className="input" value={form.hypothesis} onChange={(e) => set('hypothesis')(e.target.value)} placeholder="Vad tror du händer?" />
            </div>
            <div>
              <span style={label}>Utfall att mäta</span>
              <select className="input" value={form.outcome_metric} onChange={(e) => set('outcome_metric')(e.target.value)}>
                {metricOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Önskad riktning</span>
              <select className="input" value={form.direction} onChange={(e) => set('direction')(e.target.value)}>
                <option value="up">Upp</option>
                <option value="down">Ner</option>
              </select>
            </div>
            <div>
              <span style={label}>Hävstång – det du ändrar (valfri)</span>
              <select className="input" value={form.lever_metric} onChange={(e) => set('lever_metric')(e.target.value)}>
                <option value="">Ingen (mät bara utfallet)</option>
                {metricOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
            {form.lever_metric && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                <div style={{ width: '80px' }}>
                  <span style={label}>Villkor</span>
                  <select className="input" value={form.lever_op} onChange={(e) => set('lever_op')(e.target.value)}>
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={label}>Mål per dag ({EXPERIMENT_METRICS[form.lever_metric]?.unit})</span>
                  <input className="input" type="number" step="any" value={form.lever_target} onChange={(e) => set('lever_target')(e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <span style={label}>Längd</span>
              <select className="input" value={form.duration_days} onChange={(e) => set('duration_days')(Number(e.target.value))}>
                {[7, 14, 21, 28].map((d) => <option key={d} value={d}>{d} dagar</option>)}
              </select>
            </div>
            <div>
              <span style={label}>Start</span>
              <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date')(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => setShowForm(false)}><X size={13} /> Avbryt</button>
            <button type="button" className="btn btn-primary" style={{ fontSize: '12px' }} onClick={save} disabled={saving}>{saving ? 'Sparar…' : 'Starta experiment'}</button>
          </div>
        </div>
      )}

      {(active.length > 0 || done.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[...active, ...done].map((e) => (
            <ExperimentCard key={e.id} exp={e} days={days} onEnd={endExperiment} onDelete={deleteExperiment} />
          ))}
        </div>
      )}
    </div>
  )
}
