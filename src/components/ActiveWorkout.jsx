import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { Check, Plus, X, Trash2, ChevronDown, Timer, Search, Flag, Trophy } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { findExerciseMatch } from '../lib/exercises'
import { saveGymWorkout } from '../lib/gymSession'

// Live workout: a template (or an empty session) filled in set by set at the
// gym. The whole state is mirrored to localStorage on every change, so a
// locked phone, a reload or a closed tab never loses a set. Only checked sets
// are saved. "Förra" = the sets from the last time that exercise was logged;
// tapping ✓ on an empty row copies them in (one tap = same as last time).

const KEY = (userId) => `maxxit.activeWorkout.${userId}`

export function loadActiveWorkout(userId) {
  try { return JSON.parse(localStorage.getItem(KEY(userId)) || 'null') } catch { return null }
}
export function clearActiveWorkout(userId) {
  try { localStorage.removeItem(KEY(userId)) } catch { /* private mode */ }
}

const fmtNum = (v) => (v == null || v === '' ? '' : String(v).replace('.', ','))
const lastFor = (last, ex) => last?.[ex.exercise_id] || last?.[String(ex.name || '').toLowerCase().trim()] || null

// Build the starting state from a template (or null for an empty workout).
export function newActiveWorkout({ template = null, last = {} } = {}) {
  return {
    templateId: template?.id || null,
    name: template?.name || 'Fritt pass',
    startedAt: Date.now(),
    lastSetAt: null,
    notes: '',
    exercises: (template?.exercises || []).map(te => {
      const prev = lastFor(last, te)
      const n = Math.max(1, Number(te.sets) || prev?.sets?.length || 3)
      return {
        exercise_id: te.exercise_id || null, name: te.name, target: te.reps || '',
        sets: Array.from({ length: n }, () => ({ weight: '', reps: '', done: false })),
      }
    }),
  }
}

function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s % 60).padStart(2, '0')
}

const numInput = {
  width: '100%', minWidth: 0, textAlign: 'center', padding: '10px 4px', fontSize: 16, // 16px: no iOS zoom on focus
  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontFamily: 'inherit',
}

export function ExercisePicker({ catalogue, onPick, onClose }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (catalogue || []).filter(e => e.is_active !== false && (!t || e.name.toLowerCase().includes(t))).slice(0, 60)
  }, [q, catalogue])
  // Portal: also opened from inside a Modal, whose transformed panel would
  // otherwise capture position:fixed.
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      // React events bubble through portals: without stopPropagation a tap
      // here reaches the Modal underneath and can close it too.
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '75vh', background: 'var(--bg, #0b1020)', borderRadius: '18px 18px 0 0', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 14, borderBottom: '1px solid var(--border)' }}>
          <Search size={15} color="var(--muted)" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Sök övning i biblioteket" style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 16, fontFamily: 'inherit' }} />
          <button onClick={onClose} aria-label="Stäng" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 8px 20px' }}>
          {list.map(e => (
            <button key={e.id} onClick={() => onPick(e)} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', padding: '12px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit' }}>
              <span>{e.name}</span><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{e.category || ''}</span>
            </button>
          ))}
          {!list.length && <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Ingen träff. Lägg till övningen i Övningsbiblioteket först.</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default function ActiveWorkout({ userId, initial, catalogue, aliasMap, last, onClose, onSaved, onMinimize }) {
  const { toast } = useToast()
  const [w, setW] = useState(initial)
  const [now, setNow] = useState(Date.now())
  const [picker, setPicker] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [feeling, setFeeling] = useState(7)
  const [duration, setDuration] = useState('')
  const [updateTemplate, setUpdateTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const savedRef = useRef(false)

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  // Mirror every change to localStorage (until the workout is saved/discarded).
  useEffect(() => {
    if (savedRef.current) return
    try { localStorage.setItem(KEY(userId), JSON.stringify(w)) } catch { /* quota / private mode */ }
  }, [w, userId])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const doneSets = w.exercises.reduce((n, ex) => n + ex.sets.filter(s => s.done).length, 0)
  const totalSets = w.exercises.reduce((n, ex) => n + ex.sets.length, 0)
  const volume = w.exercises.reduce((v, ex) => v + ex.sets.filter(s => s.done).reduce((a, s) => a + (parseFloat(String(s.weight).replace(',', '.')) || 0) * (parseInt(s.reps) || 0), 0), 0)

  const patchEx = (i, fn) => setW(p => ({ ...p, exercises: p.exercises.map((ex, j) => (j === i ? fn(ex) : ex)) }))
  const patchSet = (i, k, patch) => patchEx(i, ex => ({ ...ex, sets: ex.sets.map((s, j) => (j === k ? { ...s, ...patch } : s)) }))

  // Placeholder for a set: last time's same set, else last time's final set,
  // else the previous row in this workout.
  function hintFor(ex, k) {
    const prev = lastFor(last, ex)?.sets || []
    const p = prev[k] || prev[prev.length - 1]
    const above = k > 0 ? ex.sets[k - 1] : null
    return {
      weight: above?.done && above.weight !== '' ? above.weight : (p?.weight != null ? fmtNum(p.weight) : ''),
      reps: p?.reps != null ? String(p.reps) : (above?.done ? above.reps : ''),
    }
  }

  function toggleDone(i, k) {
    const ex = w.exercises[i], s = ex.sets[k]
    if (s.done) { patchSet(i, k, { done: false }); return }
    const h = hintFor(ex, k)
    const weight = s.weight !== '' ? s.weight : h.weight, reps = s.reps !== '' ? s.reps : h.reps
    if (reps === '' || reps == null) { toast({ message: 'Fyll i reps först.', type: 'error' }); return }
    patchSet(i, k, { weight, reps, done: true })
    setW(p => ({ ...p, lastSetAt: Date.now() }))
  }

  function addExercise(e) {
    const prev = lastFor(last, { exercise_id: e.id, name: e.name })
    setW(p => ({ ...p, exercises: [...p.exercises, { exercise_id: e.id, name: e.name, target: '', sets: Array.from({ length: prev?.sets?.length || 3 }, () => ({ weight: '', reps: '', done: false })) }] }))
    setPicker(false)
  }

  function discard() {
    if (doneSets && !window.confirm(`Avbryta passet? ${doneSets} klara set sparas inte.`)) return
    savedRef.current = true
    clearActiveWorkout(userId)
    onClose()
  }

  function openFinish() {
    if (!doneSets) { toast({ message: 'Bocka av minst ett set innan du avslutar.', type: 'error' }); return }
    setDuration(String(Math.max(1, Math.round((Date.now() - w.startedAt) / 60000))))
    setFinishing(true)
  }

  async function finish() {
    setSaving(true)
    try {
      const exercises = w.exercises.map(ex => ({ name: ex.name, sets: ex.sets.filter(s => s.done).map(s => ({ reps: s.reps, weight: s.weight })) })).filter(ex => ex.sets.length)
      const { prs } = await saveGymWorkout({
        supabase, userId, date: format(new Date(w.startedAt), 'yyyy-MM-dd'),
        durationMinutes: parseInt(duration) || null, feeling,
        notes: [w.templateId || w.name !== 'Fritt pass' ? w.name : null, w.notes].filter(Boolean).join(' – ') || null,
        exercises, catalogue, aliasMap,
      })
      if (w.templateId) {
        const patch = { last_used_at: new Date().toISOString() }
        if (updateTemplate) {
          patch.exercises = w.exercises.filter(ex => ex.sets.some(s => s.done)).map(ex => ({
            exercise_id: ex.exercise_id || findExerciseMatch(ex.name, catalogue, aliasMap)?.id || null,
            name: ex.name, sets: ex.sets.filter(s => s.done).length, reps: ex.target || '',
          }))
          patch.updated_at = patch.last_used_at
        }
        await supabase.from('workout_templates').update(patch).eq('id', w.templateId).eq('user_id', userId)
      }
      savedRef.current = true
      clearActiveWorkout(userId)
      toast({ message: prs.length ? `Pass sparat. Nytt PR: ${prs.join(', ')} 🏆` : 'Pass sparat.', type: 'success' })
      onSaved?.()
    } catch (e) {
      toast({ message: e.message || 'Kunde inte spara passet. Det ligger kvar – försök igen.', type: 'error' })
    }
    setSaving(false)
  }

  const rest = w.lastSetAt ? now - w.lastSetAt : null

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'var(--bg, #0b1020)', display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onMinimize} aria-label="Minimera" title="Minimera – passet fortsätter" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}><ChevronDown size={22} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={w.name} onChange={e => setW(p => ({ ...p, name: e.target.value }))} aria-label="Passets namn"
            style={{ width: '100%', background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 17, fontWeight: 700, fontFamily: 'inherit', padding: 0 }} />
          <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Timer size={11} />{clock(now - w.startedAt)}</span>
            <span style={{ whiteSpace: 'nowrap' }}>{doneSets}/{totalSets} set</span>
            {volume > 0 && <span>{Math.round(volume).toLocaleString('sv-SE')} kg</span>}
            {rest != null && rest < 15 * 60000 && <span style={{ color: 'var(--accent)' }}>vila {clock(rest)}</span>}
          </div>
        </div>
        <button onClick={openFinish} className="btn btn-primary" style={{ flexShrink: 0 }}><Flag size={14} /> Avsluta</button>
      </div>

      {/* Exercises */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 120px', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {w.exercises.map((ex, i) => {
            const prev = lastFor(last, ex)
            const allDone = ex.sets.length > 0 && ex.sets.every(s => s.done)
            const isCollapsed = collapsed[i] ?? false
            return (
              <div key={i} className="card" style={{ padding: 14, opacity: allDone && isCollapsed ? 0.75 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <button onClick={() => setCollapsed(c => ({ ...c, [i]: !isCollapsed }))} style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 650, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {allDone && <Check size={15} color="#10b981" />}{ex.name}
                      {ex.target && <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 400 }}>mål {ex.target}</span>}
                    </div>
                    <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                      {prev ? `Förra (${prev.date.slice(5)}): ${prev.sets.map(s => `${fmtNum(s.weight) || 'kv'}×${s.reps ?? '?'}`).join('  ')}` : 'Inte loggad tidigare'}
                    </div>
                  </button>
                  <button onClick={() => { if (!ex.sets.some(s => s.done) || window.confirm(`Ta bort ${ex.name} ur passet?`)) setW(p => ({ ...p, exercises: p.exercises.filter((_, j) => j !== i) })) }}
                    aria-label={`Ta bort ${ex.name}`} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.6, padding: 4 }}><Trash2 size={15} /></button>
                </div>

                {!isCollapsed && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 46px', gap: 8, fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>
                      <span>Set</span><span>Kg</span><span>Reps</span><span />
                    </div>
                    {ex.sets.map((s, k) => {
                      const h = hintFor(ex, k)
                      return (
                        <div key={k} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 46px', gap: 8, alignItems: 'center' }}>
                          <button onClick={() => { if (!s.done && ex.sets.length > 1) patchEx(i, e2 => ({ ...e2, sets: e2.sets.filter((_, j) => j !== k) })) }}
                            title={s.done ? '' : 'Ta bort set'} className="mono" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, cursor: s.done ? 'default' : 'pointer', padding: 0 }}>{k + 1}</button>
                          <input inputMode="decimal" value={s.weight} placeholder={h.weight || '–'} disabled={s.done} onChange={e => patchSet(i, k, { weight: e.target.value })}
                            aria-label={`${ex.name} set ${k + 1} vikt`} style={{ ...numInput, opacity: s.done ? 0.7 : 1 }} />
                          <input inputMode="numeric" value={s.reps} placeholder={h.reps || '–'} disabled={s.done} onChange={e => patchSet(i, k, { reps: e.target.value.replace(/[^\d]/g, '') })}
                            aria-label={`${ex.name} set ${k + 1} reps`} style={{ ...numInput, opacity: s.done ? 0.7 : 1 }} />
                          <button onClick={() => toggleDone(i, k)} aria-label={s.done ? 'Ångra set' : 'Klart set'} aria-pressed={s.done} style={{
                            height: 42, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            border: '1px solid ' + (s.done ? '#10b981' : 'var(--border)'), background: s.done ? 'rgba(16,185,129,0.18)' : 'var(--surface2)', color: s.done ? '#10b981' : 'var(--muted)',
                          }}><Check size={18} strokeWidth={s.done ? 3 : 2} /></button>
                        </div>
                      )
                    })}
                    <button onClick={() => patchEx(i, e2 => ({ ...e2, sets: [...e2.sets, { weight: '', reps: '', done: false }] }))} className="btn btn-ghost" style={{ alignSelf: 'flex-start', marginTop: 2, fontSize: 12.5 }}>
                      <Plus size={13} /> Set
                    </button>
                  </div>
                )}
              </div>
            )
          })}

          <button onClick={() => setPicker(true)} className="btn btn-ghost" style={{ justifyContent: 'center', padding: 13 }}><Plus size={15} /> Lägg till övning</button>
          <textarea className="input" rows={2} placeholder="Anteckning om passet (valfritt)" value={w.notes} onChange={e => setW(p => ({ ...p, notes: e.target.value }))} style={{ resize: 'vertical', fontSize: 16 }} />
          <button onClick={discard} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: 13, cursor: 'pointer', padding: 8, fontFamily: 'inherit' }}>Avbryt passet utan att spara</button>
        </div>
      </div>

      {picker && <ExercisePicker catalogue={catalogue} onPick={addExercise} onClose={() => setPicker(false)} />}

      {finishing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget && !saving) setFinishing(false) }}>
          <div style={{ width: '100%', maxWidth: 560, background: 'var(--bg, #0b1020)', border: '1px solid var(--border)', borderRadius: '18px 18px 0 0', padding: '18px 18px calc(22px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}><Trophy size={16} color="#f59e0b" /> Avsluta passet</div>
            <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {doneSets} set · {w.exercises.filter(ex => ex.sets.some(s => s.done)).length} övningar{volume > 0 ? ` · ${Math.round(volume).toLocaleString('sv-SE')} kg` : ''}
              {totalSets > doneSets && ` · ${totalSets - doneSets} ej avbockade set sparas inte`}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Känsla</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <button key={n} onClick={() => setFeeling(n)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                    border: '1px solid ' + (feeling === n ? 'var(--accent)' : 'var(--border)'), background: feeling === n ? 'var(--accent-soft)' : 'var(--surface2)', color: feeling === n ? 'var(--accent)' : 'var(--muted)', fontWeight: feeling === n ? 700 : 400 }}>{n}</button>
                ))}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
              Längd (min)
              <input inputMode="numeric" value={duration} onChange={e => setDuration(e.target.value.replace(/[^\d]/g, ''))} style={{ ...numInput, width: 90 }} />
            </label>
            {w.templateId && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                <input type="checkbox" checked={updateTemplate} onChange={e => setUpdateTemplate(e.target.checked)} /> Uppdatera mallen med dagens övningar och antal set
              </label>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setFinishing(false)} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>Fortsätt passet</button>
              <button className="btn btn-primary" onClick={finish} disabled={saving} style={{ flex: 1, justifyContent: 'center', padding: 12 }}>{saving ? 'Sparar…' : 'Spara pass'}</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
