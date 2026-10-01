import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Play, Plus, Pencil, Trash2, ArrowUp, ArrowDown, ClipboardList, Save, X, Timer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { fetchExerciseCatalogue, findExerciseMatch, quickAddExercise } from '../lib/exercises'
import { fetchLastPerformance } from '../lib/gymSession'
import Modal from './Modal'
import ActiveWorkout, { ExercisePicker, loadActiveWorkout, newActiveWorkout } from './ActiveWorkout'

// Träning → Mallar. A template is a named exercise list with planned sets;
// "Starta" opens the live workout (ActiveWorkout) that is filled in at the
// gym. An unfinished workout survives reloads (localStorage) and shows a
// "Fortsätt" banner here.

function TemplateEditor({ initial, catalogue, onSave, onDelete, onClose, saving }) {
  const [name, setName] = useState(initial?.name || '')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [rows, setRows] = useState(() => (initial?.exercises || []).map(e => ({ ...e, sets: e.sets || 3, reps: e.reps || '' })))
  const [picker, setPicker] = useState(false)
  const patch = (i, p) => setRows(r => r.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i, d) => setRows(r => { const n = [...r], j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n })
  const small = { background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4, display: 'flex' }
  return (
    <Modal onClose={onClose} title={initial?.id ? 'Redigera mall' : 'Ny mall'} maxWidth={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input className="input" autoFocus={!initial?.id} placeholder="Namn, t.ex. Push eller Ben A" value={name} onChange={e => setName(e.target.value)} style={{ fontSize: 16 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 10px 10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                <button style={small} onClick={() => move(i, -1)} aria-label="Flytta upp" disabled={i === 0}><ArrowUp size={14} /></button>
                <button style={small} onClick={() => move(i, 1)} aria-label="Flytta ned" disabled={i === rows.length - 1}><ArrowDown size={14} /></button>
                <button style={small} onClick={() => setRows(x => x.filter((_, j) => j !== i))} aria-label={`Ta bort ${r.name}`}><Trash2 size={14} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                <span>Set</span>
                <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => patch(i, { sets: Math.max(1, (r.sets || 1) - 1) })}>−</button>
                <span className="mono" style={{ color: 'var(--text)', minWidth: 14, textAlign: 'center' }}>{r.sets}</span>
                <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => patch(i, { sets: Math.min(12, (r.sets || 1) + 1) })}>+</button>
                <span style={{ marginLeft: 8 }}>Mål</span>
                <input className="input mono" placeholder="8–10" value={r.reps} onChange={e => patch(i, { reps: e.target.value })} style={{ width: 84, padding: '6px 8px', fontSize: 14 }} aria-label={`${r.name} målreps`} />
              </div>
            </div>
          ))}
          <button className="btn btn-ghost" onClick={() => setPicker(true)} style={{ justifyContent: 'center' }}><Plus size={14} /> Lägg till övning</button>
        </div>
        <textarea className="input" rows={2} placeholder="Anteckning (valfritt)" value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" disabled={saving || !name.trim() || !rows.length} onClick={() => onSave({ name: name.trim(), notes: notes.trim() || null, exercises: rows.map(r => ({ exercise_id: r.exercise_id || null, name: r.name, sets: r.sets, reps: r.reps || '' })) })}>
            <Save size={14} /> {saving ? 'Sparar…' : 'Spara mall'}
          </button>
          <button className="btn btn-ghost" onClick={onClose}><X size={14} /> Avbryt</button>
          {onDelete && <button className="btn btn-ghost" style={{ marginLeft: 'auto', color: '#ef4444' }} onClick={onDelete}><Trash2 size={14} /> Ta bort</button>}
        </div>
      </div>
      {picker && <ExercisePicker catalogue={catalogue} onClose={() => setPicker(false)} onPick={e => { setRows(r => [...r, { exercise_id: e.id, name: e.name, sets: 3, reps: '' }]); setPicker(false) }} />}
    </Modal>
  )
}

export default function WorkoutTemplates({ userId, refreshKey = 0, onSessionSaved }) {
  const { toast } = useToast()
  const [templates, setTemplates] = useState([])
  const [catalogue, setCatalogue] = useState([])
  const [aliasMap, setAliasMap] = useState({})
  const [last, setLast] = useState({})
  const [editing, setEditing] = useState(null) // template | {} (new) | null
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState(null)   // workout shown full screen
  const [paused, setPaused] = useState(() => loadActiveWorkout(userId)) // unfinished workout in storage
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('workout_templates').select('*').eq('user_id', userId).order('sort_order').order('created_at')
    setTemplates(data || [])
  }, [userId])
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { fetchExerciseCatalogue(supabase).then(({ exercises, aliasMap: am }) => { setCatalogue(exercises); setAliasMap(am) }) }, [])

  async function open(workoutOrTemplate, { resume = false } = {}) {
    if (!resume && paused && !window.confirm(`Du har ett pågående pass (${paused.name}). Starta ett nytt och släng det?`)) return
    setStarting(true)
    // A template made by Jarvis (or from an old session) can name an exercise
    // the library does not have: add it now, so saving never fails at the end
    // of a workout. Known names get their library id.
    let cat = catalogue, am = aliasMap, template = workoutOrTemplate
    if (!resume && template?.exercises?.length) {
      const missing = template.exercises.filter(e => !findExerciseMatch(e.name, cat, am))
      if (missing.length) {
        for (const e of missing) await quickAddExercise({ supabase, userId, name: e.name })
        const fresh = await fetchExerciseCatalogue(supabase)
        cat = fresh.exercises; am = fresh.aliasMap
        setCatalogue(cat); setAliasMap(am)
        toast({ message: `Tillagt i övningsbiblioteket: ${missing.map(e => e.name).join(', ')}`, type: 'success' })
      }
      template = { ...template, exercises: template.exercises.map(e => ({ ...e, exercise_id: findExerciseMatch(e.name, cat, am)?.id || e.exercise_id || null })) }
    }
    const lastPerf = await fetchLastPerformance(supabase, userId).catch(() => ({}))
    setLast(lastPerf)
    setActive(resume ? workoutOrTemplate : newActiveWorkout({ template, last: lastPerf }))
    setStarting(false)
  }

  async function saveTemplate(values) {
    setSaving(true)
    const res = editing?.id
      ? await supabase.from('workout_templates').update({ ...values, updated_at: new Date().toISOString() }).eq('id', editing.id).eq('user_id', userId)
      : await supabase.from('workout_templates').insert({ ...values, user_id: userId, sort_order: templates.length })
    setSaving(false)
    if (res.error) { toast({ message: 'Kunde inte spara mallen: ' + res.error.message, type: 'error' }); return }
    setEditing(null); load()
  }

  async function deleteTemplate() {
    if (!window.confirm(`Ta bort mallen "${editing.name}"? Loggade pass påverkas inte.`)) return
    await supabase.from('workout_templates').delete().eq('id', editing.id).eq('user_id', userId)
    setEditing(null); load()
  }

  const closeActive = () => { setActive(null); setPaused(loadActiveWorkout(userId)) }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: templates.length || paused ? 12 : 4 }}>
        <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><ClipboardList size={15} /> Passmallar</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={() => open(null)} disabled={starting} title="Starta ett pass utan mall"><Timer size={13} /> Fritt pass</button>
          <button className="btn btn-ghost" onClick={() => setEditing({})}><Plus size={13} /> Ny mall</button>
        </div>
      </div>

      {paused && !active && (
        <button onClick={() => open(paused, { resume: true })} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '11px 12px', marginBottom: 10, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-soft)' }}>
          <Play size={16} color="var(--accent)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Fortsätt: {paused.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Startat {format(new Date(paused.startedAt), 'HH:mm')} · {paused.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)} set klara</div>
          </div>
        </button>
      )}

      {!templates.length && !paused && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Skapa en mall med dina övningar, eller spara ett loggat pass som mall. Starta sedan mallen på gymmet och bocka av set för set – förra passets vikter står förifyllda.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {templates.map(t => (
          <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
              <button onClick={() => setEditing(t)} aria-label={`Redigera ${t.name}`} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, display: 'flex' }}><Pencil size={13} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, flex: 1 }}>
              {(t.exercises || []).slice(0, 5).map(e => `${e.name} ${e.sets}×${e.reps || '?'}`).join(' · ')}{(t.exercises || []).length > 5 ? ` · +${t.exercises.length - 5}` : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.last_used_at ? `Senast ${format(parseISO(t.last_used_at), 'd MMM', { locale: sv })}` : 'Inte körd än'}</span>
              <button className="btn btn-primary" onClick={() => open(t)} disabled={starting} style={{ padding: '7px 14px' }}><Play size={13} /> Starta</button>
            </div>
          </div>
        ))}
      </div>

      {editing && <TemplateEditor initial={editing} catalogue={catalogue} saving={saving} onSave={saveTemplate} onClose={() => setEditing(null)} onDelete={editing.id ? deleteTemplate : null} />}
      {active && (
        <ActiveWorkout userId={userId} initial={active} catalogue={catalogue} aliasMap={aliasMap} last={last}
          onMinimize={closeActive} onClose={closeActive}
          onSaved={() => { closeActive(); load(); onSessionSaved?.() }} />
      )}
    </div>
  )
}
