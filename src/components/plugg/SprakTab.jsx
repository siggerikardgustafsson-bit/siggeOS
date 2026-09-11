import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Globe, Plus, Loader } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  languageBlend, languageLabel, languageTier,
  CARDS_THRESHOLDS, CI_HOURS_THRESHOLDS, CONSISTENCY_DAY_THRESHOLDS,
  LANGUAGE_SKILLS, LANGUAGE_LABELS,
} from '../../lib/languageSkill'

// Plugg > Språk — stats for the language skills (Anki cards + logged CI
// minutes) plus a quick "logga CI direkt efter passet" form. Lower friction
// than digging into Journal's collapsible Färdigheter section for the one
// thing you actually want to log often.
//
// v2 (user call 2026-09-11) — the tier badge is now languageTier()'s 3-gate
// model (cumulative lifetime cards + cumulative lifetime CI hours + recent
// consistency, weakest of the three — see languageSkill.js header for the
// evidence basis). "X kort/v · Y min/v" stays as the honest recent-pace
// number underneath; the gate bars below show the real lifetime progress.
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

// Combined cumulative-cards-over-time series, all 3 languages in one chart —
// running totals by day so growth (and gaps) are visible at a glance.
function cumulativeChartData(rows) {
  const byDate = {} // date -> { spanish, serbian, german }
  for (const r of rows) {
    if (r.cards == null || !LANGUAGE_SKILLS.includes(r.skill)) continue
    byDate[r.date] = byDate[r.date] || {}
    byDate[r.date][r.skill] = (byDate[r.date][r.skill] || 0) + Number(r.cards || 0)
  }
  const dates = Object.keys(byDate).sort()
  const running = { spanish: 0, serbian: 0, german: 0 }
  return dates.map(d => {
    for (const s of LANGUAGE_SKILLS) running[s] += byDate[d][s] || 0
    return { date: d.slice(5), spanish: running.spanish, serbian: running.serbian, german: running.german }
  })
}

function GateBar({ label, value, target, unit, color }) {
  const pct = target ? Math.max(0, Math.min(100, Math.round((value / target) * 100))) : (value > 0 ? 100 : 0)
  const met = target != null && value >= target
  return (
    <div style={{ marginBottom: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--muted)', marginBottom: '2px' }}>
        <span>{label}</span>
        <span style={{ color: met ? color : 'var(--muted)', fontWeight: met ? 700 : 400 }}>
          {value}{unit} {target != null ? `/ ${target}${unit}` : ''}
        </span>
      </div>
      <div style={{ height: '4px', borderRadius: '3px', background: 'var(--surface2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color, transition: 'width .3s' }} />
      </div>
    </div>
  )
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
    // No date floor — languageTier()'s cards/CI totals are LIFETIME cumulative
    // (user call 2026-09-11); languageBlend() self-scopes back to a week regardless.
    const { data } = await supabase.from('skill_logs')
      .select('date,skill,minutes,cards,activity_type')
      .eq('user_id', userId).in('skill', LANGUAGE_SKILLS)
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

  const stats = Object.fromEntries(LANGUAGE_SKILLS.map(s => [s, { blend: languageBlend(rows, s), t: languageTier(rows, s) }]))
  const totalCardsAll = LANGUAGE_SKILLS.reduce((s, k) => s + stats[k].t.cardsTotal, 0)
  const totalCIHoursAll = Math.round(LANGUAGE_SKILLS.reduce((s, k) => s + stats[k].t.ciHoursTotal, 0) * 10) / 10
  const chartData = cumulativeChartData(rows)
  const last30 = new Date(); last30.setDate(last30.getDate() - 30)
  const last30Str = last30.toISOString().slice(0, 10)
  const recent = rows.filter(r => r.date >= last30Str).slice(0, 12)

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

      {/* Totalt sedan start — user call 2026-09-12 ("vill ha ett sätt att se
          totalt antal kort och ci-timmar"): a prominent combined number, not
          just buried in each language's card. */}
      <div className="card" style={{ marginBottom: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Kort totalt</div>
          <div style={{ fontSize: '26px', fontWeight: 900 }}>{totalCardsAll.toLocaleString('sv-SE')}</div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CI-timmar totalt</div>
          <div style={{ fontSize: '26px', fontWeight: 900 }}>{totalCIHoursAll.toLocaleString('sv-SE')}h</div>
        </div>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Kort per språk, sedan start</div>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={chartData} margin={{ top: 2, right: 4, left: -30, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 8, fontSize: 11 }} />
                <Line type="monotone" dataKey="spanish" name="Spanska" stroke={LANG_COLOR.spanish} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="serbian" name="Serbiska" stroke={LANG_COLOR.serbian} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="german" name="Tyska" stroke={LANG_COLOR.german} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Inget att visa än — behöver kort från minst 2 dagar.</div>
          )}
        </div>
      </div>

      {/* Per-language stats — tier + the 3 gates (kort/CI/regelbundenhet) that drive it */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: '12px', marginBottom: '16px' }}>
        {LANGUAGE_SKILLS.map(s => {
          const { blend, t } = stats[s]
          const color = LANG_COLOR[s]
          // Target index for the next numeric milestone — tier0/1 both show
          // tier2's bar (tier1 itself has no numeric target, just "started").
          const idx = Math.max(2, Math.min((t.tier || 0) + 1, 6)) - 2
          const cardsTarget = t.tier < 6 ? CARDS_THRESHOLDS[idx] : null
          const ciTarget = t.tier < 6 ? CI_HOURS_THRESHOLDS[idx] : null
          const consTarget = t.tier < 6 ? CONSISTENCY_DAY_THRESHOLDS[idx] : null
          return (
            <div key={s} className="card" style={{ borderColor: color + '30' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontWeight: 700 }}>{LANGUAGE_LABELS[s]}</div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: t.color, padding: '2px 8px', borderRadius: 20, background: t.color + '18' }}>
                  T{t.tier} {t.label}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted2)', marginBottom: '2px' }}>{languageLabel(blend)}</div>
              <div style={{ fontSize: '10.5px', color: 'var(--muted)', marginBottom: '8px' }}>
                {t.cardsTotal} kort · {t.ciHoursTotal}h CI totalt sedan start
                {t.bottleneck && t.tier < 6 ? ` · flaskhals: ${t.bottleneck}` : ''}
              </div>
              {t.tier < 6 ? (
                <>
                  <GateBar label="Kort (totalt)" value={t.cardsTotal} target={cardsTarget} unit="" color={color} />
                  <GateBar label="CI (h totalt)" value={t.ciHoursTotal} target={ciTarget} unit="h" color={color} />
                  <GateBar label="Regelbundenhet (dagar/28)" value={t.activeDays} target={consTarget} unit="" color={color} />
                </>
              ) : (
                <div style={{ fontSize: '11px', color: t.color, fontWeight: 700 }}>Flytande — alla trösklar nådda ✓</div>
              )}
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
