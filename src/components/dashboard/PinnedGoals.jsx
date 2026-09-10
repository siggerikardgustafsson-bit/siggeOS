import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, ChevronRight } from 'lucide-react'
import { listGoals, goalProgress, goalDaysLeft, GOAL_DOMAIN_LABEL } from '../../lib/goals'
import { resolveGoalsProgress, formatMetricValue } from '../../lib/goalMetrics'

const DOMAIN_COLOR = {
  traning: '#4f8ef7', halsa: '#34d399', ekonomi: '#fbbf24', plugg: '#a78bfa',
  resor: '#e879f9', jobb: '#f97316', livet: '#22d3ee',
}

// Pinned goals, surfaced on the dashboard so the things you're actually
// tracking sit next to the score. Renders nothing when nothing is pinned.
export default function PinnedGoals({ userId }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    ;(async () => {
      try {
        const all = await listGoals(userId, { status: 'active' })
        const pinned = all.filter((g) => g.pinned)
        if (!pinned.length) { if (!cancelled) setRows([]); return }
        const live = await resolveGoalsProgress(userId, pinned)
        if (cancelled) return
        setRows(pinned.map((g) => {
          const current = g.metric ? live[g.id]?.value : g.current_value
          return {
            g,
            current,
            asOf: live[g.id]?.asOf,
            pct: goalProgress({ ...g, current_value: current }),
            days: goalDaysLeft(g),
          }
        }))
      } catch { if (!cancelled) setRows([]) }
    })()
    return () => { cancelled = true }
  }, [userId])

  if (!rows || rows.length === 0) return null

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <button onClick={() => navigate('/mal')} style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none',
        cursor: 'pointer', padding: 0, marginBottom: 12, color: 'var(--muted2)', fontFamily: 'inherit',
      }}>
        <Pin size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Fästa mål</span>
        <ChevronRight size={13} style={{ marginLeft: 'auto', opacity: 0.5 }} />
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map(({ g, current, asOf, pct, days }) => {
          const col = DOMAIN_COLOR[g.category || g.domain] || 'var(--accent)'
          return (
            <div key={g.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.title}
                </span>
                {days != null && (
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: days < 0 ? 'var(--red)' : days <= 14 ? 'var(--amber)' : 'var(--muted)', flexShrink: 0 }}>
                    {days < 0 ? `+${-days}d` : `${days}d`}
                  </span>
                )}
                {pct != null && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: col, flexShrink: 0 }}>{Math.round(pct * 100)}%</span>
                )}
              </div>
              {g.target_value != null && (
                <>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', marginBottom: 3 }}>
                    {g.start_value != null && <span style={{ opacity: 0.6 }}>{formatMetricValue(g.start_value, g.unit)} → </span>}
                    <span style={{ color: 'var(--muted2)' }}>{current != null ? formatMetricValue(current, g.unit) : '—'}</span>
                    {' / '}{formatMetricValue(g.target_value, g.unit)}
                    {g.category && <span style={{ marginLeft: 6, opacity: 0.6 }}>{GOAL_DOMAIN_LABEL[g.category] || g.category}</span>}
                  </div>
                  <div style={{ height: 4, borderRadius: 3, background: 'var(--surface2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((pct ?? 0) * 100)}%`, background: col, borderRadius: 3, transition: 'width 0.5s ease' }} />
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
