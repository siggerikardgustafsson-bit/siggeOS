import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Globe, Plus, Loader } from 'lucide-react'
import { getSkillTier } from '../dashboard/tierUtils'
import { languageBlend, languageLabel, LANGUAGE_SKILLS, LANGUAGE_LABELS } from '../../lib/languageSkill'

// Plugg > Språk — stats for the language skills (Anki cards + logged CI
// minutes) plus a quick "logga CI direkt efter passet" form. Lower friction
// than digging into Journal's collapsible Färdigheter section for the one
// thing you actually want to log often.
const LANG_COLOR = { spanish: '#ef4444', serbian: '#3b82f6', german: '#14b8a6' }

// Graceful degradation until post_deploy_11 (activity_type) is migrated.
async function insertSkillRow(row) {
  let { error } = await supabase.from('skill_logs').insert(row)
  if (error && (/activity_type/i.test(error.message || '') || error.code === 'PGRST204' || error.code === '42703')) {
    const { activity_type, ...rest } = row
    ;({ error } = await supabase.from('skill_logs').insert(rest))
  }
  return error
}

export default function SprakTab({ userId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [skill, setSkill] = useState('spanish')
  const [minutes, setMinutes] = useState(20)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const { data } = await supabase.from('skill_logs')
      .select('date,skill,minutes,cards,activity_type')
      .eq('user_id', userId).in('skill', LANGUAGE_SKILLS).gte('date', since.toISOString().slice(0, 10))
      .order('date', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function logCI() {
    const n = Number(minutes)
    if (!n || n <= 0 || !userId) return
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const error = await insertSkillRow({ user_id: userId, date: today, skill, minutes: n, activity_type: 'ci' })
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
      load()
    }
  }

  const breakdown = Object.fromEntries(LANGUAGE_SKILLS.map(s => [s, languageBlend(rows, s)]))
  const recent = rows.slice(0, 12)

  return (
    <>
      {/* Quick CI log — the thing you actually want to do right after a session */}
      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Globe size={16} /> Logga comprehensible input
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Språk</label>
            <select value={skill} onChange={e => setSkill(e.target.value)} className="input" style={{ minWidth: 140 }}>
              {LANGUAGE_SKILLS.map(s => <option key={s} value={s}>{LANGUAGE_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Minuter</label>
            <input type="number" min="5" max="300" step="5" value={minutes}
              onChange={e => setMinutes(e.target.value)} className="input" style={{ width: 90 }} />
          </div>
          <button onClick={logCI} disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
            {saved ? 'Loggat!' : 'Logga'}
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px' }}>
          Anki-kort synkas automatiskt via din egen synk. Det här formuläret är bara för lyssning/läsning (CI).
        </div>
      </div>

      {/* Per-language stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: '12px', marginBottom: '16px' }}>
        {LANGUAGE_SKILLS.map(s => {
          const b = breakdown[s]
          const tier = getSkillTier(b.effective)
          const color = LANG_COLOR[s]
          return (
            <div key={s} className="card" style={{ borderColor: color + '30' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700 }}>{LANGUAGE_LABELS[s]}</div>
                {tier && (
                  <span style={{ fontSize: '11px', fontWeight: 800, color: tier.color, padding: '2px 8px', borderRadius: 20, background: tier.color + '18' }}>
                    T{tier.tier} {tier.label}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted2)' }}>{languageLabel(b)}</div>
            </div>
          )
        })}
      </div>

      {/* Recent log */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: '10px' }}>Senaste 30 dagarna</div>
        {loading ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Laddar…</div>
        ) : recent.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inget loggat än.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {recent.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', padding: '6px 0', borderBottom: i < recent.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--muted2)' }}>{r.date} · {LANGUAGE_LABELS[r.skill] || r.skill}</span>
                <span style={{ fontWeight: 700, color: LANG_COLOR[r.skill] }}>
                  {r.cards != null ? `${r.cards} kort` : `${r.minutes} min${r.activity_type === 'ci' ? ' CI' : r.activity_type === 'anki' ? ' Anki' : ''}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
