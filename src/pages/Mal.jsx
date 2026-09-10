import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { Target } from 'lucide-react'
import GoalsSection from '../components/GoalsSection'
import { listGoals, goalProgress, goalDaysLeft, GOAL_DOMAINS, GOAL_DOMAIN_LABEL } from '../lib/goals'
import { resolveGoalsProgress } from '../lib/goalMetrics'

const DOMAIN_COLOR = {
  traning: '#3b82f6', halsa: '#10b981', ekonomi: '#f59e0b', plugg: '#a78bfa',
  resor: '#e879f9', jobb: '#f97316', livet: '#22d3ee',
}

// One place to see every goal, across every domain, with live progress.
// The per-domain <GoalsSection> already exists on /traning, /ekonomi, /profil —
// this page is the aggregate view + the only place "pin" and cross-domain
// comparison make sense.
export default function MalPage() {
  const { user } = useAuth()
  const [filter, setFilter] = useState('alla')
  const [summary, setSummary] = useState(null)
  const [unavailable, setUnavailable] = useState(false)

  const loadSummary = useCallback(async () => {
    if (!user) return
    try {
      const all = await listGoals(user.id, { status: 'all' })
      const active = all.filter((g) => g.status === 'active')
      const live = await resolveGoalsProgress(user.id, active)
      const withPct = active.map((g) => {
        const current = g.metric ? live[g.id]?.value : g.current_value
        return { ...g, _pct: goalProgress({ ...g, current_value: current }), _days: goalDaysLeft(g) }
      })
      const done = all.filter((g) => g.status === 'done').length
      const onTrack = withPct.filter((g) => g._pct != null && g._pct >= 0.5).length
      const nextDeadline = withPct
        .filter((g) => g._days != null && g._days >= 0)
        .sort((a, b) => a._days - b._days)[0]
      const byDomain = GOAL_DOMAINS.map((d) => ({ d, n: active.filter((g) => (g.category || g.domain) === d).length }))
        .filter((x) => x.n > 0)
      setSummary({ activeCount: active.length, done, onTrack, nextDeadline, byDomain })
      setUnavailable(false)
    } catch {
      setUnavailable(true)
    }
  }, [user])

  useEffect(() => { loadSummary() }, [loadSummary])

  const chips = [{ key: 'alla', label: 'Alla' }, ...GOAL_DOMAINS.map((d) => ({ key: d, label: GOAL_DOMAIN_LABEL[d] }))]

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Mål</div>
          <div className="page-header-sub">
            {unavailable
              ? 'Mål-tabellen är inte redo än'
              : summary
                ? `${summary.activeCount} aktiva · ${summary.done} uppnådda`
                : 'Laddar…'}
          </div>
        </div>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding: '16px 16px 0', maxWidth: '820px', margin: '0 auto' }}>

          {!unavailable && summary && summary.activeCount > 0 && (
            <div className="card" style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
              <Stat label="På god väg" value={`${summary.onTrack}/${summary.activeCount}`} />
              {summary.nextDeadline && (
                <Stat
                  label="Närmaste deadline"
                  value={summary.nextDeadline._days === 0 ? 'idag' : summary.nextDeadline._days === 1 ? 'imorgon' : `${summary.nextDeadline._days}d`}
                  sub={summary.nextDeadline.title}
                />
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
                {summary.byDomain.map(({ d, n }) => (
                  <span key={d} style={{
                    fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
                    color: DOMAIN_COLOR[d], border: `1px solid ${DOMAIN_COLOR[d]}44`,
                  }}>
                    {GOAL_DOMAIN_LABEL[d]} {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Domain filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {chips.map((c) => {
              const active = filter === c.key
              const col = c.key === 'alla' ? 'var(--accent)' : DOMAIN_COLOR[c.key]
              return (
                <button key={c.key} onClick={() => setFilter(c.key)} style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${active ? col : 'var(--border)'}`,
                  background: active ? col + '18' : 'transparent',
                  color: active ? col : 'var(--muted)', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
                }}>
                  {c.label}
                </button>
              )
            })}
          </div>

          {/* The section reloads itself whenever `domain` changes; a key forces a
              clean remount so its internal form/edit state resets on filter switch. */}
          <GoalsSection
            key={filter}
            domain={filter === 'alla' ? null : filter}
            title={filter === 'alla' ? 'Alla mål' : `${GOAL_DOMAIN_LABEL[filter]}`}
          />

          {!unavailable && summary && summary.activeCount === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Target size={26} style={{ opacity: 0.4 }} />
              Inga mål satta ännu. Lägg till ett ovan, eller be Jarvis: "sätt ett mål att…".
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}
