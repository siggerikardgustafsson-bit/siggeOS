import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import CountUp from '../components/CountUp'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Plus, X, Save, Loader, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Map, Target, RefreshCw, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

const EXPENSE_CATEGORIES = [
  { id: 'mat',             label: 'Mat',             color: '#f97316', emoji: '' },
  { id: 'nöje',            label: 'Nöje',            color: '#ec4899', emoji: '' },
  { id: 'transport',       label: 'Transport',       color: '#3b82f6', emoji: '' },
  { id: 'kläder',          label: 'Kläder',          color: '#8b5cf6', emoji: '' },
  { id: 'hälsa',           label: 'Hälsa',           color: '#10b981', emoji: '' },
  { id: 'prenumerationer', label: 'Prenumerationer', color: '#06b6d4', emoji: '' },
  { id: 'hyra',            label: 'Hyra',            color: '#f59e0b', emoji: '' },
  { id: 'övrigt',          label: 'Övrigt',          color: '#6b7280', emoji: '' },
]

const INCOME_SOURCES = ['PA-jobb', 'Erik Norling', 'CSN', 'Skatteåterbäring', 'Övrigt']

function DonutChart({ data, size = 140 }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--surface3)' }} />

  let cumulative = 0
  const slices = data.map(d => {
    const pct = d.value / total
    const start = cumulative
    cumulative += pct
    return { ...d, start, pct }
  })

  const r = size / 2
  const inner = r * 0.6
  const gap = slices.filter(s => s.pct > 0).length > 1 ? 0.012 : 0  // angular gap between slices

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id="ek-donut-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="ek-donut-hole" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="color-mix(in srgb, var(--surface) 88%, #fff 12%)" />
          <stop offset="100%" stopColor="var(--surface)" />
        </radialGradient>
        {slices.map((slice, i) => slice.pct > 0 && (
          <linearGradient key={i} id={`ek-slice-${i}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={`color-mix(in srgb, ${slice.color} 65%, #fff 8%)`} />
            <stop offset="100%" stopColor={slice.color} />
          </linearGradient>
        ))}
      </defs>
      <g filter="url(#ek-donut-glow)">
        {slices.map((slice, i) => {
          if (slice.pct === 0) return null
          const s0 = slice.start + gap / 2
          const s1 = slice.start + slice.pct - gap / 2
          const startAngle = s0 * 2 * Math.PI - Math.PI / 2
          const endAngle = s1 * 2 * Math.PI - Math.PI / 2
          const x1 = r + r * Math.cos(startAngle)
          const y1 = r + r * Math.sin(startAngle)
          const x2 = r + r * Math.cos(endAngle)
          const y2 = r + r * Math.sin(endAngle)
          const xi1 = r + inner * Math.cos(startAngle)
          const yi1 = r + inner * Math.sin(startAngle)
          const xi2 = r + inner * Math.cos(endAngle)
          const yi2 = r + inner * Math.sin(endAngle)
          const large = (s1 - s0) > 0.5 ? 1 : 0
          return (
            <path
              key={i}
              d={`M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1}`}
              fill={`url(#ek-slice-${i})`}
            />
          )
        })}
      </g>
      <circle cx={r} cy={r} r={inner * 0.86} fill="url(#ek-donut-hole)" />
    </svg>
  )
}

const ASSET_TYPES = [
  { id: 'stock',   label: 'Aktie',    color: '#3b82f6' },
  { id: 'fund',    label: 'Fond',     color: '#8b5cf6' },
  { id: 'crypto',  label: 'Crypto',   color: '#f59e0b' },
  { id: 'cash',    label: 'Sparkonto',color: '#10b981' },
]


async function fetchPricesViaEdge(assets) {
  try {
    const res = await supabase.functions.invoke('price-fetch', {
      body: { assets: assets.map(a => ({ id: a.id, ticker: a.ticker, type: a.type })) }
    })
    if (res.error || !res.data) {
      console.warn('price-fetch edge function returned no data', res.error)
      return { prices: {}, usdSek: null, ok: false }
    }
    return { ...res.data, ok: true }
  } catch(e) {
    console.warn('price-fetch edge function failed', e)
    return { prices: {}, usdSek: null, ok: false }
  }
}

function NetWorthTab({ user }) {
  const { toast } = useToast()
  const [assets, setAssets] = useState([])
  const [prices, setPrices] = useState({})
  const [usdSek, setUsdSek] = useState(10.5)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingAsset, setEditingAsset] = useState(null)
  const [saving, setSaving] = useState(false)
  const [goal, setGoal] = useState({ target: '', deadline: '' })
  const [savingGoal, setSavingGoal] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [history, setHistory] = useState([])
  const [form, setForm] = useState({ name: '', ticker: '', type: 'stock', quantity: '', manual_price_sek: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (user) init() }, [user])

  async function init() {
    setLoading(true)
    const [{ data: assetData }, { data: goalData }, { data: histData }] = await Promise.all([
      supabase.from('assets').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('user_settings').select('goals').eq('user_id', user.id).maybeSingle(),
      supabase.from('net_worth_history').select('date,total_sek').eq('user_id', user.id).order('date', { ascending: true }).limit(90),
    ])
    const loadedAssets = assetData || []
    setAssets(loadedAssets)
    setHistory(histData || [])
    const nwGoal = goalData?.goals?.net_worth_goal || {}
    setGoal({ target: nwGoal.target || '', deadline: nwGoal.deadline || '' })

    if (loadedAssets.filter(a => a.type !== 'cash').length > 0) {
      const { prices: livePrices, usdSek: fx, ok } = await fetchPricesViaEdge(loadedAssets)
      setPrices(livePrices)
      if (fx) setUsdSek(fx)
      if (!ok) {
        toast({ message: 'Kunde inte hämta aktuella priser – visar senast kända värden. Ingen ny snapshot sparas.', type: 'error' })
        setLoading(false)
        return
      }
      // Save daily snapshot (endast när prishämtning lyckades)
      const total = loadedAssets.reduce((sum, a) => {
        if (a.type === 'cash') return sum + (a.manual_price_sek || 0)
        return sum + (livePrices[a.id]?.price || 0) * a.quantity
      }, 0)
      if (total > 0) {
        const today = format(new Date(), 'yyyy-MM-dd')
        await supabase.from('net_worth_history').upsert(
          { user_id: user.id, date: today, total_sek: Math.round(total) },
          { onConflict: 'user_id,date' }
        )
        setHistory(prev => {
          const filtered = prev.filter(h => h.date !== today)
          return [...filtered, { date: today, total_sek: Math.round(total) }].sort((a, b) => a.date.localeCompare(b.date))
        })
      }
    } else {
      // Cash-only: still snapshot
      const total = loadedAssets.reduce((sum, a) => sum + (a.manual_price_sek || 0), 0)
      if (total > 0) {
        const today = format(new Date(), 'yyyy-MM-dd')
        await supabase.from('net_worth_history').upsert(
          { user_id: user.id, date: today, total_sek: Math.round(total) },
          { onConflict: 'user_id,date' }
        )
      }
    }
    setLoading(false)
  }

  async function refreshPrices() {
    setRefreshing(true)
    const { prices: livePrices, usdSek: fx, ok } = await fetchPricesViaEdge(assets)
    if (ok) {
      setPrices(livePrices)
      if (fx) setUsdSek(fx)
    } else {
      toast({ message: 'Kunde inte uppdatera priser just nu. Försök igen senare.', type: 'error' })
    }
    setRefreshing(false)
  }

  async function saveAsset() {
    setSaving(true)
    const payload = {
      user_id: user.id,
      name: form.name,
      ticker: form.ticker.toUpperCase() || null,
      type: form.type,
      quantity: parseFloat(form.quantity) || 0,
      manual_price_sek: form.type === 'cash' ? parseFloat(form.manual_price_sek) || 0 : null,
    }
    if (editingAsset) {
      await supabase.from('assets').update(payload).eq('id', editingAsset.id)
    } else {
      await supabase.from('assets').insert(payload)
    }
    await init()
    setShowForm(false)
    setEditingAsset(null)
    setForm({ name: '', ticker: '', type: 'stock', quantity: '', manual_price_sek: '' })
    setSaving(false)
  }

  async function deleteAsset(id) {
    const removed = assets.find(a => a.id === id)
    setAssets(prev => prev.filter(a => a.id !== id))
    let undone = false
    toast({
      message: 'Tillgång borttagen.',
      action: { label: 'Ångra', onClick: () => { undone = true; if (removed) setAssets(prev => [...prev, removed]) } },
      duration: 5000,
    })
    setTimeout(async () => {
      if (undone) return
      await supabase.from('assets').delete().eq('id', id)
      setPrices(prev => { const n = {...prev}; delete n[id]; return n })
    }, 5000)
  }

  async function saveGoal() {
    setSavingGoal(true)
    const { data } = await supabase.from('user_settings').select('goals').eq('user_id', user.id).maybeSingle()
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      goals: { ...(data?.goals || {}), net_worth_goal: { target: parseFloat(goal.target), deadline: goal.deadline } }
    }, { onConflict: 'user_id' })
    setShowGoalForm(false)
    setSavingGoal(false)
  }

  function getAssetValue(asset) {
    if (asset.type === 'cash') return asset.manual_price_sek || 0
    const livePrice = prices[asset.id]?.price
    if (livePrice) return livePrice * asset.quantity
    return 0
  }

  const totalValue = assets.reduce((sum, a) => sum + getAssetValue(a), 0)
  const goalTarget = parseFloat(goal.target) || 0
  const goalPct = goalTarget > 0 ? Math.min(100, Math.round((totalValue / goalTarget) * 100)) : 0
  const goalDaysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / 86400000) : null

  const byType = ASSET_TYPES.map(t => ({
    ...t,
    value: assets.filter(a => a.type === t.id).reduce((s, a) => s + getAssetValue(a), 0)
  })).filter(t => t.value > 0)

  const fmt = (n) => Math.round(n).toLocaleString('sv-SE') + ' kr'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Net Worth header card */}
      <div className="card" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(59,130,246,0.06))', borderColor: 'rgba(16,185,129,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Totalt net worth</div>
            {loading
              ? <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--muted)' }}>Laddar...</div>
              : <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981', letterSpacing: '-1px' }}>{fmt(totalValue)}</div>
            }
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>USD/SEK: {usdSek.toFixed(2)}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={refreshPrices} disabled={refreshing} className="btn btn-ghost" style={{ fontSize: 12 }}>
              <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              {refreshing ? 'Uppdaterar...' : 'Uppdatera priser'}
            </button>
            <button onClick={() => setShowGoalForm(v => !v)} className="btn btn-ghost" style={{ fontSize: 12 }}>
              <Target size={13} /> Sätt mål
            </button>
          </div>
        </div>

        {/* Goal progress */}
        {goalTarget > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Mål: {fmt(goalTarget)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{goalPct}%</span>
              {goalDaysLeft !== null && (
                <span style={{ fontSize: 11, color: goalDaysLeft < 0 ? '#ef4444' : 'var(--muted)' }}>
                  {goalDaysLeft < 0 ? 'Försenad' : `${goalDaysLeft}d kvar`}
                </span>
              )}
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ height: '100%', width: goalPct + '%', borderRadius: 999, background: 'linear-gradient(90deg, #10b981, #3b82f6)', transition: 'width 0.6s ease' }} />
            </div>
          </div>
        )}

        {/* Goal form */}
        {showGoalForm && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>MÅLBELOPP (kr)</label>
              <input className="input" type="number" placeholder="500 000" value={goal.target} onChange={e => setGoal(g => ({...g, target: e.target.value}))} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>DEADLINE</label>
              <input className="input" type="date" value={goal.deadline} onChange={e => setGoal(g => ({...g, deadline: e.target.value}))} />
            </div>
            <button onClick={saveGoal} disabled={savingGoal} className="btn btn-primary" style={{ padding: '8px 14px', fontSize: 12 }}>
              {savingGoal ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Spara
            </button>
          </div>
        )}
      </div>

      {/* Breakdown by type */}
      {byType.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {byType.map(t => (
            <div key={t.id} className="card" style={{ padding: '12px 14px', borderColor: t.color + '30' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.color, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{t.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{fmt(t.value)}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {totalValue > 0 ? Math.round((t.value / totalValue) * 100) : 0}% av total
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Net worth history chart */}
      {history.length > 1 && (
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Historik (senaste 90 dagarna)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={history.map(h => ({ date: h.date.slice(5), value: h.total_sek }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} tickLine={false} axisLine={false} tickFormatter={v => Math.round(v/1000) + 'k'} width={36} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--muted)' }}
                formatter={v => [Math.round(v).toLocaleString('sv-SE') + ' kr', 'Net Worth']}
              />
              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#10b981' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Assets list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Tillgångar</div>
          <button onClick={() => { setShowForm(true); setEditingAsset(null); setForm({ name: '', ticker: '', type: 'stock', quantity: '', manual_price_sek: '' }) }}
            className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }}>
            <Plus size={12} /> Lägg till
          </button>
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>NAMN</label>
                <input className="input" placeholder="t.ex. Investor B" value={form.name} onChange={e => f('name', e.target.value)} autoFocus />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>TYP</label>
                <select className="input" value={form.type} onChange={e => f('type', e.target.value)}>
                  {ASSET_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              {form.type !== 'cash' ? (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
                    {form.type === 'crypto' ? 'SYMBOL (BTC/ETH)' : 'TICKER (t.ex. INVE-B.ST)'}
                  </label>
                  <input className="input" placeholder={form.type === 'crypto' ? 'BTC' : 'INVE-B.ST'} value={form.ticker} onChange={e => f('ticker', e.target.value)} />
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>BELOPP (kr)</label>
                  <input className="input" type="number" placeholder="50 000" value={form.manual_price_sek} onChange={e => f('manual_price_sek', e.target.value)} />
                </div>
              )}
              {form.type !== 'cash' && (
                <div>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>ANTAL</label>
                  <input className="input" type="number" step="0.001" placeholder="10" value={form.quantity} onChange={e => f('quantity', e.target.value)} />
                </div>
              )}
            </div>
            {form.type === 'stock' && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '6px 10px', background: 'rgba(59,130,246,0.08)', borderRadius: 6 }}>
                💡 Svenska aktier: lägg till .ST (t.ex. ERIC-B.ST). Amerikanska: utan suffix (t.ex. AAPL). Fonder: sök tickern på Yahoo Finance.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowForm(false); setEditingAsset(null) }} className="btn btn-ghost">Avbryt</button>
              <button onClick={saveAsset} disabled={saving || !form.name} className="btn btn-primary">
                {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Spara
              </button>
            </div>
          </div>
        )}

        {/* Asset rows */}
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Laddar tillgångar...</div>
        ) : assets.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Inga tillgångar ännu — lägg till din första ovan
          </div>
        ) : (
          assets.map(asset => {
            const typeInfo = ASSET_TYPES.find(t => t.id === asset.type)
            const liveData = prices[asset.id]
            const value = getAssetValue(asset)
            const hasLive = !!liveData
            const isEditing = editingAsset?.id === asset.id

            return (
              <div key={asset.id}>
                {isEditing && (
                  <div style={{ padding: '14px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>NAMN</label>
                        <input className="input" value={form.name} onChange={e => f('name', e.target.value)} autoFocus />
                      </div>
                      {form.type !== 'cash' ? (
                        <>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>TICKER</label>
                            <input className="input" value={form.ticker} onChange={e => f('ticker', e.target.value)} />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>ANTAL</label>
                            <input className="input" type="number" step="0.001" value={form.quantity} onChange={e => f('quantity', e.target.value)} />
                          </div>
                        </>
                      ) : (
                        <div>
                          <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>BELOPP (kr)</label>
                          <input className="input" type="number" value={form.manual_price_sek} onChange={e => f('manual_price_sek', e.target.value)} />
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setEditingAsset(null); setShowForm(false) }} className="btn btn-ghost">Avbryt</button>
                      <button onClick={saveAsset} disabled={saving} className="btn btn-primary">
                        {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Spara
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: (typeInfo?.color || '#6b7280') + '18', border: '1px solid ' + (typeInfo?.color || '#6b7280') + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: typeInfo?.color }}>{asset.type === 'cash' ? '₩' : asset.ticker?.slice(0,3) || '?'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                      {asset.type === 'cash'
                        ? 'Sparkonto'
                        : `${asset.quantity} ${asset.ticker || ''} · ${hasLive ? Math.round(liveData.price).toLocaleString('sv-SE') + ' kr/st' : 'Hämtar pris...'}`
                      }
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: value > 0 ? 'var(--text)' : 'var(--muted)' }}>
                      {value > 0 ? fmt(value) : '—'}
                    </div>
                    {hasLive && <div style={{ fontSize: 10, color: '#10b981', marginTop: 1 }}>● Live</div>}
                    {asset.type === 'cash' && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>Manuellt</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button onClick={() => { setEditingAsset(asset); setForm({ name: asset.name, ticker: asset.ticker || '', type: asset.type, quantity: String(asset.quantity || ''), manual_price_sek: String(asset.manual_price_sek || '') }); setShowForm(false) }}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => deleteAsset(asset.id)}
                      style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.5)', cursor: 'pointer', padding: 4 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function EkonomiPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('overview')
  const [logType, setLogType] = useState('expense')
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [salaryDay, setSalaryDay] = useState(25) // day of month salary arrives

  const [incomes, setIncomes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [fixedCosts, setFixedCosts] = useState([])
  const [trips, setTrips] = useState([])
  const [csnUsage, setCsnUsage] = useState(0)
  const [csnLimit, setCsnLimit] = useState(114500)
  const [saving, setSaving] = useState(false)

  // Compute salary period correctly:
  // The "current" period for a given reference date is:
  //   start = salaryDay of the PREVIOUS month (if today < salaryDay) OR salaryDay of this month
  //   end = salaryDay - 1 of the NEXT month after start
  function getSalaryPeriod(referenceDate, day) {
    const ref = new Date(referenceDate)
    const year = ref.getFullYear()
    const month = ref.getMonth() // 0-indexed
    const dayOfMonth = ref.getDate()

    // If we're before the salary day this month, the current period started last month
    const startMonth = dayOfMonth < day ? month - 1 : month
    const periodStart = new Date(year, startMonth, day)
    const periodEnd = new Date(year, startMonth + 1, day - 1)

    return {
      start: format(periodStart, 'yyyy-MM-dd'),
      end: format(periodEnd, 'yyyy-MM-dd'),
      label: `${format(periodStart, 'd MMM', { locale: sv })} – ${format(periodEnd, 'd MMM yyyy', { locale: sv })}`,
    }
  }

  // For navigation: offset in number of salary periods from today
  // selectedMonth holds a representative date within the target period
  const period = getSalaryPeriod(selectedMonth, salaryDay)

  function goToPrevPeriod() {
    // Move selectedMonth back by one salary period (30 days is safe)
    const { start } = getSalaryPeriod(selectedMonth, salaryDay)
    const prevPeriodDate = new Date(start)
    prevPeriodDate.setDate(prevPeriodDate.getDate() - 1) // day before start = inside previous period
    setSelectedMonth(prevPeriodDate)
  }

  function goToNextPeriod() {
    const { end } = getSalaryPeriod(selectedMonth, salaryDay)
    const nextPeriodDate = new Date(end)
    nextPeriodDate.setDate(nextPeriodDate.getDate() + 1) // day after end = inside next period
    setSelectedMonth(nextPeriodDate)
  }

  // Forms
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'mat', description: '', date: format(new Date(), 'yyyy-MM-dd') })
  const [incomeForm, setIncomeForm] = useState({ amount: '', source: 'PA-jobb', counts_toward_csn: true, notes: '', date: format(new Date(), 'yyyy-MM-dd') })

  useEffect(() => {
    if (user) fetchAll()
  }, [user, selectedMonth, salaryDay])

  async function fetchAll() {
    const { start, end } = getSalaryPeriod(selectedMonth, salaryDay)

    // Half-year start for CSN
    const now = new Date()
    const halfStart = now.getMonth() < 6
      ? `${now.getFullYear()}-01-01`
      : `${now.getFullYear()}-07-01`
    const halfEnd = format(now, 'yyyy-MM-dd')

    const [incomesRes, expensesRes, fixedRes, tripsRes, csnRes, settingsRes] = await Promise.all([
      supabase.from('income_logs').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('expense_logs').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('fixed_costs').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('trips').select('*').eq('user_id', user.id).in('status', ['planerad', 'pågående']).order('start_date'),
      supabase.from('income_logs').select('amount').eq('user_id', user.id).eq('counts_toward_csn', true).gte('date', halfStart).lte('date', halfEnd),
      supabase.from('user_settings').select('goals').eq('user_id', user.id).maybeSingle(),
    ])

    const totalCsn = (csnRes.data || []).reduce((sum, r) => sum + (r.amount || 0), 0)
    const limit = settingsRes.data?.goals?.csn_fribelopp || 114500
    const savedSalaryDay = settingsRes.data?.goals?.salary_day
    if (savedSalaryDay) setSalaryDay(savedSalaryDay)

    setIncomes(incomesRes.data || [])
    setExpenses(expensesRes.data || [])
    setFixedCosts(fixedRes.data || [])
    setTrips(tripsRes.data || [])
    setCsnUsage(totalCsn)
    setCsnLimit(limit)
  }

  async function saveExpense() {
    const amount = parseFloat(expenseForm.amount)
    if (!isFinite(amount) || amount <= 0) {
      toast({ message: 'Ange ett giltigt belopp större än 0.', type: 'error' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('expense_logs').insert({
      user_id: user.id,
      amount,
      category: expenseForm.category,
      description: expenseForm.description,
      date: expenseForm.date,
    })
    if (error) { toast({ message: 'Kunde inte spara utgiften.', type: 'error' }); setSaving(false); return }
    await fetchAll()
    setExpenseForm({ amount: '', category: 'mat', description: '', date: format(new Date(), 'yyyy-MM-dd') })
    setSaving(false)
  }

  async function saveIncome() {
    const amount = parseFloat(incomeForm.amount)
    if (!isFinite(amount) || amount <= 0) {
      toast({ message: 'Ange ett giltigt belopp större än 0.', type: 'error' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('income_logs').insert({
      user_id: user.id,
      amount,
      source: incomeForm.source,
      counts_toward_csn: incomeForm.counts_toward_csn,
      notes: incomeForm.notes,
      date: incomeForm.date,
    })
    if (error) { toast({ message: 'Kunde inte spara inkomsten.', type: 'error' }); setSaving(false); return }
    await fetchAll()
    setIncomeForm({ amount: '', source: 'PA-jobb', counts_toward_csn: true, notes: '', date: format(new Date(), 'yyyy-MM-dd') })
    setSaving(false)
  }

  async function deleteEntry(table, id) {
    await supabase.from(table).delete().eq('id', id)
    await fetchAll()
  }

  // Calculations
  // Sources that are taxed 30% — gross logged, net received
  const TAXED_SOURCES = ['PA-jobb']
  const TAX_RATE = 0.30

  // Net income = what actually lands in your account
  const totalIncomeNet = incomes.reduce((sum, i) => {
    const isGross = TAXED_SOURCES.includes(i.source)
    return sum + (isGross ? i.amount * (1 - TAX_RATE) : i.amount)
  }, 0)

  // Gross income = what counts toward CSN (already stored as gross in DB)
  const totalIncomeGross = incomes.reduce((sum, i) => sum + i.amount, 0)

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const fixedTotal = fixedCosts.reduce((sum, f) => sum + f.amount, 0)
  const balance = totalIncomeNet - totalExpenses - fixedTotal
  const csnPct = (csnUsage / csnLimit) * 100
  const csnWarn = csnPct >= 80

  // Group expenses by category for donut
  const expensesByCategory = EXPENSE_CATEGORIES.map(cat => ({
    ...cat,
    value: expenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + e.amount, 0),
  })).filter(c => c.value > 0)

  const tabs = [
    { id: 'overview', label: 'Översikt' },
    { id: 'log',      label: 'Logga' },
    { id: 'savings',  label: 'Sparande' },
  ]

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Ekonomi</div>
          <div className="page-header-sub">{period.label}</div>
        </div>
        <div className="page-header-actions">
          <button onClick={goToPrevPeriod} className="btn btn-ghost btn-icon">←</button>
          <button onClick={() => setSelectedMonth(new Date())} className="btn btn-ghost">Nu</button>
          <button onClick={goToNextPeriod} className="btn btn-ghost btn-icon">→</button>
        </div>
      </div>
      <div className="page-content-scroll">
        <div className="mx-content-edge" style={{ padding: "16px 16px 0", width: "100%", maxWidth: "none", margin: "0" }}>

      {/* Tabs */}
      <div className="mx-segment" style={{ marginBottom: '20px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`mx-segment-btn ${activeTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          {/* Balance stat strip — hero balans + inline inkomst/utgifter/CSN */}
          {(() => {
            const balCol = balance >= 0 ? '#10b981' : '#ef4444'
            const csnLeft = Math.max(0, Math.round(csnLimit - csnUsage))
            return (
              <div className="hl-strip" style={{ marginBottom: '16px' }}>
                <div className="hl-shero">
                  <div className="hl-shero-main">
                    <span className="hl-shero-cap">Balans denna period</span>
                    <span className="hl-shero-num" style={{ color: balCol }}>
                      <CountUp value={Math.round(balance)} /><span className="u" style={{ color: 'var(--muted2)' }}>kr</span>
                    </span>
                    <span className="hl-shero-sub" style={{ color: balCol }}>
                      {balance >= 0 ? 'överskott' : 'underskott'} · netto − utgifter
                    </span>
                  </div>
                </div>
                <div className="hl-sstats">
                  <div className="hl-sstat" style={{ '--hl-c': '#10b981' }}>
                    <span className="hl-sstat-cap"><span className="dot" />Inkomst netto</span>
                    <span className="hl-sstat-num"><CountUp value={Math.round(totalIncomeNet)} /><span className="u">kr</span></span>
                  </div>
                  <div className="hl-sstat" style={{ '--hl-c': '#ef4444' }}>
                    <span className="hl-sstat-cap"><span className="dot" />Utgifter</span>
                    <span className="hl-sstat-num"><CountUp value={Math.round(totalExpenses + fixedTotal)} /><span className="u">kr</span></span>
                  </div>
                  <div className="hl-sstat" style={{ '--hl-c': '#f59e0b' }}>
                    <span className="hl-sstat-cap"><span className="dot" />CSN kvar</span>
                    <span className="hl-sstat-num"><CountUp value={csnLeft} /><span className="u">kr</span></span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* CSN */}
          <div className="ek-card" style={{ marginBottom: '16px', borderColor: csnWarn ? 'rgba(245,158,11,0.4)' : 'var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="ek-card-cap" style={{ marginBottom: 0 }}>CSN Fribelopp</span>
              {csnWarn && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontSize: '12px', fontWeight: 700 }}><AlertTriangle size={12} /> Varning</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#fff', letterSpacing: '-.02em' }}>{Math.round(csnUsage).toLocaleString('sv-SE')} <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--muted2)' }}>kr</span></span>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600 }}>{Math.round(csnLimit - csnUsage).toLocaleString('sv-SE')} kr kvar</span>
            </div>
            <div className="ek-csn-track" style={{ '--ek-csn': csnWarn ? '#f59e0b' : '#10b981' }}>
              <div className="ek-csn-fill" style={{ width: `${Math.min(csnPct, 100)}%` }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '7px' }}>{csnPct.toFixed(1)}% av 114 500 kr förbrukat detta halvår</div>
          </div>

          {/* Donut + categories */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="ek-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
              <div className="ek-donut-wrap">
                <DonutChart data={expensesByCategory} size={150} />
                <div className="ek-donut-center">
                  <div className="ek-donut-total">{Math.round(totalExpenses / 1000)}k</div>
                  <div className="ek-donut-lab">Utgifter</div>
                </div>
              </div>
            </div>
            <div className="ek-card">
              <div className="ek-card-cap">Kategorier</div>
              {expensesByCategory.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga utgifter loggade</div>
              ) : (
                <div className="ek-cat">
                  {expensesByCategory.slice().sort((a, b) => b.value - a.value).map(cat => {
                    const pct = (cat.value / (totalExpenses || 1)) * 100
                    return (
                      <div key={cat.id} className="ek-cat-row" style={{ '--ek-c': cat.color }}>
                        <div className="ek-cat-dot" />
                        <div className="ek-cat-mid">
                          <div className="ek-cat-top">
                            <span className="ek-cat-name">{cat.label}</span>
                            <span className="ek-cat-val">{cat.value.toLocaleString('sv-SE')} kr</span>
                          </div>
                          <div className="ek-cat-track">
                            <div className="ek-cat-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <div className="ek-cat-pct">{pct.toFixed(0)}%</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Fixed costs */}
          <div className="ek-card" style={{ marginBottom: '16px' }}>
            <div className="ek-card-cap">Fasta kostnader</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {fixedCosts.map(fc => (
                <div key={fc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text)' }}>{fc.name}</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{fc.amount.toLocaleString('sv-SE')} kr</span>
                </div>
              ))}
              <div style={{ paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>Totalt</span>
                <span style={{ fontSize: '15px', fontWeight: 900, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fixedTotal.toLocaleString('sv-SE')} kr</span>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="ek-card">
            <div className="ek-card-cap">Senaste transaktioner</div>
            <div>
              {[...incomes.map(i => ({ ...i, type: 'income' })), ...expenses.map(e => ({ ...e, type: 'expense' }))]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 15)
                .map(tx => {
                  const cat = EXPENSE_CATEGORIES.find(c => c.id === tx.category)
                  const isInc = tx.type === 'income'
                  const ekc = isInc ? '#10b981' : (cat?.color || '#ef4444')
                  return (
                    <div key={tx.id} className="ek-tx" style={{ '--ek-c': ekc }}>
                      <div className="ek-tx-ico" style={{ fontSize: '15px' }}>{isInc ? '＋' : (cat?.emoji || '−')}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="ek-tx-name">{tx.description || tx.source || cat?.label || 'Utgift'}</div>
                        <div className="ek-tx-date">{format(new Date(tx.date), 'd MMM', { locale: sv })}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="ek-tx-amt" style={{ color: isInc ? '#10b981' : '#ef4444' }}>
                          {isInc ? '+' : '-'}
                          {isInc && TAXED_SOURCES.includes(tx.source)
                            ? Math.round(tx.amount * (1 - TAX_RATE)).toLocaleString('sv-SE')
                            : tx.amount.toLocaleString('sv-SE')} kr
                        </div>
                        {isInc && TAXED_SOURCES.includes(tx.source) && (
                          <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                            brutto {tx.amount.toLocaleString('sv-SE')} kr
                          </div>
                        )}
                      </div>
                      <button onClick={() => deleteEntry(isInc ? 'income_logs' : 'expense_logs', tx.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4, padding: '2px' }}>
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
            </div>
          </div>
        </>
      )}

      {/* LOG TAB */}
      {activeTab === 'log' && (
        <div className="ek-log" style={{ '--ek-lc': logType === 'income' ? '#10b981' : '#ef4444' }}>
          {/* Toggle */}
          <div className="ek-log-seg">
            {[{ id: 'expense', label: '− Utgift', cls: 'exp' }, { id: 'income', label: '+ Inkomst', cls: 'inc' }].map(t => (
              <button key={t.id} onClick={() => setLogType(t.id)}
                className={`ek-log-seg-btn ${t.cls} ${logType === t.id ? 'active' : ''}`}>{t.label}</button>
            ))}
          </div>

          {logType === 'expense' && (
            <>
              <div className="ek-amount">
                <label className="ek-log-label">Belopp</label>
                <input type="number" placeholder="0" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
                <span className="ek-amount-suf">kr</span>
              </div>
              <div className="ek-field">
                <label className="ek-log-label">Kategori</label>
                <div className="ek-pick">
                  {EXPENSE_CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setExpenseForm(f => ({ ...f, category: cat.id }))}
                      className={`ek-pick-btn ${expenseForm.category === cat.id ? 'active' : ''}`}
                      style={{ '--ek-c': cat.color }}>
                      <span className="em">{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ek-field">
                <label className="ek-log-label">Beskrivning (valfritt)</label>
                <input className="input" placeholder="t.ex. ICA, Systembolaget..." value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="ek-field">
                <label className="ek-log-label">Datum</label>
                <input className="input" type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <button onClick={saveExpense} className="ek-submit" disabled={saving || !expenseForm.amount}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={15} /> Logga utgift</>}
              </button>
            </>
          )}

          {logType === 'income' && (
            <>
              <div className="ek-amount">
                <label className="ek-log-label">
                  Belopp
                  {incomeForm.source === 'PA-jobb' && (
                    <span style={{ color: '#f59e0b', marginLeft: '6px', textTransform: 'none', letterSpacing: 0, fontWeight: 700 }}>— bruttolön (före skatt)</span>
                  )}
                </label>
                <input type="number" placeholder="0" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} />
                <span className="ek-amount-suf">kr</span>
                {incomeForm.source === 'PA-jobb' && incomeForm.amount && (
                  <div style={{ fontSize: '12px', color: '#10b981', marginTop: '8px', fontWeight: 700 }}>
                    Netto (70%): {Math.round(parseFloat(incomeForm.amount) * 0.7).toLocaleString('sv-SE')} kr
                  </div>
                )}
              </div>
              <div className="ek-field">
                <label className="ek-log-label">Källa</label>
                <div className="ek-chips">
                  {INCOME_SOURCES.map(src => (
                    <button key={src} onClick={() => setIncomeForm(f => ({
                      ...f, source: src,
                      counts_toward_csn: src !== 'Erik Norling',
                    }))} className={`ek-chip-btn ${incomeForm.source === src ? 'active' : ''}`}>{src}</button>
                  ))}
                </div>
              </div>
              <div className="ek-field" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="csn-check" checked={incomeForm.counts_toward_csn}
                  onChange={e => setIncomeForm(f => ({ ...f, counts_toward_csn: e.target.checked }))}
                  style={{ accentColor: '#10b981', width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="csn-check" style={{ fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' }}>
                  Räknas mot CSN-fribelopp
                  {incomeForm.source === 'Erik Norling' && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>(Erik = kontant, räknas ej)</span>}
                </label>
              </div>
              <div className="ek-field">
                <label className="ek-log-label">Datum</label>
                <input className="input" type="date" value={incomeForm.date} onChange={e => setIncomeForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="ek-field">
                <input className="input" placeholder="Anteckningar (valfritt)" value={incomeForm.notes} onChange={e => setIncomeForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <button onClick={saveIncome} className="ek-submit" disabled={saving || !incomeForm.amount}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={15} /> Logga inkomst</>}
              </button>
            </>
          )}
        </div>
      )}

      {/* TRIPS TAB */}
      {activeTab === 'trips' && (
        <div>
          {trips.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <Map size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga planerade resor</div>
              <div style={{ fontSize: '12px', marginTop: '6px' }}>Lägg till resor i Resor-modulen</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {trips.map(trip => {
                const spent = trip.spent_sek || 0
                const budget = trip.budget_sek || 0
                const pct = budget > 0 ? (spent / budget) * 100 : 0
                const daysLeft = trip.start_date ? Math.ceil((new Date(trip.start_date) - new Date()) / 86400000) : null
                return (
                  <div key={trip.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600' }}>{trip.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {trip.destination}
                          {daysLeft !== null && daysLeft > 0 && <span style={{ color: '#10b981', marginLeft: '8px' }}>om {daysLeft} dagar</span>}
                        </div>
                      </div>
                      {budget > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono" style={{ fontSize: '15px', fontWeight: '600' }}>{spent.toLocaleString('sv-SE')} kr</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>av {budget.toLocaleString('sv-SE')} kr</div>
                        </div>
                      )}
                    </div>
                    {budget > 0 && (
                      <>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                          <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct > 90 ? '#ef4444' : '#10b981', borderRadius: '3px' }} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {pct.toFixed(0)}% spenderat · {(budget - spent).toLocaleString('sv-SE')} kr kvar
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* SAVINGS TAB */}
      {activeTab === 'savings' && (
        <NetWorthTab user={user} />
      )}
    </div>
        </div>
      </div>
  )
}
