import { useState, useEffect } from 'react'
import { Coins } from 'lucide-react'
import { supabase } from '../lib/supabase'
import SectionHeader from './ui/SectionHeader'
import { CURRENCY_TO_SEK } from '../lib/tierEngine'

// Settings → Jarvis AI: what the AI features cost, from public.ai_usage
// (one row per jarvis-chat request / weekly report, written server-side).
// cost_usd is an estimate from list prices — the Anthropic Console is the bill.

const GROUPS = [
  { id: 'chat', label: 'Chatt', match: (f) => f === 'chat' },
  { id: 'brief', label: 'Daglig brief', match: (f) => f === 'brief' },
  { id: 'weekly', label: 'Veckorapport', match: (f) => f.startsWith('weekly') },
  { id: 'extract', label: 'Analyser (journal, plugg, insights…)', match: (f) => f.startsWith('extract') },
]
const kr = (usd) => `${(usd * CURRENCY_TO_SEK.USD).toLocaleString('sv-SE', { maximumFractionDigits: usd * CURRENCY_TO_SEK.USD < 10 ? 2 : 0 })} kr`

export default function AiUsageCard({ userId }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!userId) return
    const since = new Date(Date.now() - 30 * 86400000).toISOString()
    supabase.from('ai_usage').select('feature,cost_usd,input_tokens,cache_write_tokens,cache_read_tokens,output_tokens,iterations')
      .eq('user_id', userId).gte('created_at', since).limit(5000)
      .then(({ data, error }) => setRows(error ? [] : (data || [])))
  }, [userId])

  if (rows == null) return null
  const total = rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0)
  const inTok = rows.reduce((s, r) => s + r.input_tokens + r.cache_write_tokens + r.cache_read_tokens, 0)
  const readTok = rows.reduce((s, r) => s + r.cache_read_tokens, 0)
  const groups = GROUPS.map((g) => {
    const rs = rows.filter((r) => g.match(r.feature || ''))
    const cost = rs.reduce((s, r) => s + Number(r.cost_usd || 0), 0)
    return { ...g, n: rs.length, cost }
  }).filter((g) => g.n)

  return (
    <div className="card">
      <SectionHeader icon={Coins} title="AI-kostnad" subtitle="Senaste 30 dagarna · uppskattat från listpris" />
      {!rows.length ? (
        <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Ingen AI-användning loggad än.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>TOTALT</div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>{kr(total)}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>${total.toFixed(2)} · {rows.length} anrop</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>CACHETRÄFF</div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>{inTok ? Math.round((readTok / inTok) * 100) : 0}%</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>av input läst från cache (10% av priset)</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {groups.map((g) => (
              <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--muted2)' }}>
                <span>{g.label} <span style={{ color: 'var(--muted)' }}>· {g.n} st · ~{kr(g.cost / g.n)}/st</span></span>
                <span className="mono" style={{ color: 'var(--text)' }}>{kr(g.cost)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
