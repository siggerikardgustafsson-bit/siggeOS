import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
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

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((slice, i) => {
        if (slice.pct === 0) return null
        const startAngle = slice.start * 2 * Math.PI - Math.PI / 2
        const endAngle = (slice.start + slice.pct) * 2 * Math.PI - Math.PI / 2
        const x1 = r + r * Math.cos(startAngle)
        const y1 = r + r * Math.sin(startAngle)
        const x2 = r + r * Math.cos(endAngle)
        const y2 = r + r * Math.sin(endAngle)
        const xi1 = r + inner * Math.cos(startAngle)
        const yi1 = r + inner * Math.sin(startAngle)
        const xi2 = r + inner * Math.cos(endAngle)
        const yi2 = r + inner * Math.sin(endAngle)
        const large = slice.pct > 0.5 ? 1 : 0
        return (
          <path
            key={i}
            d={`M ${xi1} ${yi1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1}`}
            fill={slice.color}
            opacity={0.85}
          />
        )
      })}
      <circle cx={r} cy={r} r={inner * 0.85} fill="var(--surface)" />
    </svg>
  )
}

const ASSET_TYPES = [
  { id: 'stock',   label: 'Aktie',    color: '#3b82f6' },
  { id: 'fund',    label: 'Fond',     color: '#8b5cf6' },
  { id: 'crypto',  label: 'Crypto',   color: '#f59e0b' },
  { id: 'cash',    label: 'Sparkonto',color: '#10b981' },
]

const CRYPTO_IDS = { 'BTC': 'bitcoin', 'ETH': 'ethereum', 'bitcoin': 'bitcoin', 'ethereum': 'ethereum' }

async function fetchLivePrices(assets, usdSek) {
  const results = {}

  // Group by type
  const stocks = assets.filter(a => a.type === 'stock' || a.type === 'fund')
  const cryptos = assets.filter(a => a.type === 'crypto')

  // Fetch stock/fund prices via Yahoo Finance (via allorigins proxy)
  for (const asset of stocks) {
    if (!asset.ticker) continue
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.ticker)}?interval=1d&range=1d`
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
      const res = await fetch(proxy)
      const data = await res.json()
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice
      const currency = data?.chart?.result?.[0]?.meta?.currency
      if (price) {
        // Convert to SEK if needed
        const priceSek = currency === 'SEK' ? price : price * (usdSek || 10.5)
        results[asset.id] = { price: priceSek, currency: 'SEK', source: 'yahoo' }
      }
    } catch(e) {
      console.warn('Yahoo fetch failed for', asset.ticker, e)
    }
  }

  // Fetch crypto prices via CoinGecko (free, no API key)
  if (cryptos.length > 0) {
    try {
      const ids = cryptos.map(a => CRYPTO_IDS[a.ticker] || a.ticker.toLowerCase()).join(',')
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=sek`)
      const data = await res.json()
      for (const asset of cryptos) {
        const geckoId = CRYPTO_IDS[asset.ticker] || asset.ticker.toLowerCase()
        const priceSek = data?.[geckoId]?.sek
        if (priceSek) results[asset.id] = { price: priceSek, currency: 'SEK', source: 'coingecko' }
      }
    } catch(e) {
      console.warn('CoinGecko fetch failed', e)
    }
  }

  return results
}

async function fetchUsdSek() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/USDSEK=X?interval=1d&range=1d'
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
    const res = await fetch(proxy)
    const data = await res.json()
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice || 10.5
  } catch { return 10.5 }
}

function NetWorthTab({ user }) {
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
  const [form, setForm] = useState({ name: '', ticker: '', type: 'stock', quantity: '', manual_price_sek: '' })
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { if (user) init() }, [user])

  async function init() {
    setLoading(true)
    const [{ data: assetData }, { data: goalData }] = await Promise.all([
      supabase.from('assets').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('user_settings').select('goals').eq('user_id', user.id).single(),
    ])
    const loadedAssets = assetData || []
    setAssets(loadedAssets)
    const nwGoal = goalData?.goals?.net_worth_goal || {}
    setGoal({ target: nwGoal.target || '', deadline: nwGoal.deadline || '' })

    const fx = await fetchUsdSek()
    setUsdSek(fx)
    if (loadedAssets.length) {
      const livePrices = await fetchLivePrices(loadedAssets, fx)
      setPrices(livePrices)
    }
    setLoading(false)
  }

  async function refreshPrices() {
    setRefreshing(true)
    const fx = await fetchUsdSek()
    setUsdSek(fx)
    const livePrices = await fetchLivePrices(assets, fx)
    setPrices(livePrices)
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
    if (!window.confirm('Ta bort denna tillgång?')) return
    await supabase.from('assets').delete().eq('id', id)
    setAssets(prev => prev.filter(a => a.id !== id))
    setPrices(prev => { const n = {...prev}; delete n[id]; return n })
  }

  async function saveGoal() {
    setSavingGoal(true)
    const { data } = await supabase.from('user_settings').select('goals').eq('user_id', user.id).single()
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
      supabase.from('user_settings').select('goals').eq('user_id', user.id).single(),
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
    setSaving(true)
    await supabase.from('expense_logs').insert({
      user_id: user.id,
      amount: parseFloat(expenseForm.amount),
      category: expenseForm.category,
      description: expenseForm.description,
      date: expenseForm.date,
    })
    await fetchAll()
    setExpenseForm({ amount: '', category: 'mat', description: '', date: format(new Date(), 'yyyy-MM-dd') })
    setSaving(false)
  }

  async function saveIncome() {
    setSaving(true)
    await supabase.from('income_logs').insert({
      user_id: user.id,
      amount: parseFloat(incomeForm.amount),
      source: incomeForm.source,
      counts_toward_csn: incomeForm.counts_toward_csn,
      notes: incomeForm.notes,
      date: incomeForm.date,
    })
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
    { id: 'trips',    label: 'Resebudget' },
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
        <div style={{ padding: "16px 16px 0", maxWidth: "900px", margin: "0 auto" }}>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', borderRadius: '10px', padding: '4px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--surface3)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
            transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          {/* Balance cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', WebkitFlex: '1', gap: '12px', marginBottom: '16px' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Inkomst (netto)</span>
                <TrendingUp size={14} color="#10b981" />
              </div>
              <div className="mono" style={{ fontSize: '22px', fontWeight: '600', color: '#10b981' }}>
                {Math.round(totalIncomeNet).toLocaleString('sv-SE')}
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '400' }}> kr</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                Brutto: {Math.round(totalIncomeGross).toLocaleString('sv-SE')} kr
              </div>
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Utgifter</span>
                <TrendingDown size={14} color="#ef4444" />
              </div>
              <div className="mono" style={{ fontSize: '22px', fontWeight: '600', color: '#ef4444' }}>
                {Math.round(totalExpenses + fixedTotal).toLocaleString('sv-SE')}
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '400' }}> kr</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                Fasta: {fixedTotal.toLocaleString('sv-SE')} kr
              </div>
            </div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Balans</span>
                <DollarSign size={14} color={balance >= 0 ? '#10b981' : '#ef4444'} />
              </div>
              <div className="mono" style={{ fontSize: '22px', fontWeight: '600', color: balance >= 0 ? '#10b981' : '#ef4444' }}>
                {Math.round(balance).toLocaleString('sv-SE')}
                <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '400' }}> kr</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>
                Netto − utgifter
              </div>
            </div>
          </div>

          {/* CSN */}
          <div className={`card ${csnWarn ? '' : ''}`} style={{ marginBottom: '16px', borderColor: csnWarn ? 'rgba(245,158,11,0.4)' : 'var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500' }}>CSN FRIBELOPP</span>
              {csnWarn && <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontSize: '12px' }}><AlertTriangle size={12} /> Varning</div>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="mono" style={{ fontSize: '15px', fontWeight: '600' }}>{Math.round(csnUsage).toLocaleString('sv-SE')} kr</span>
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{Math.round(csnLimit - csnUsage).toLocaleString('sv-SE')} kr kvar</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(csnPct, 100)}%`, background: csnWarn ? '#f59e0b' : '#10b981', borderRadius: '3px', transition: 'width 0.6s' }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '5px' }}>{csnPct.toFixed(1)}% av 114 500 kr förbrukat detta halvår</div>
          </div>

          {/* Donut + categories */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '16px', marginBottom: '16px' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <DonutChart data={expensesByCategory} />
              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Utgifter</div>
            </div>
            <div className="card">
              <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '10px' }}>KATEGORIER</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {expensesByCategory.length === 0 ? (
                  <div style={{ color: 'var(--muted)', fontSize: '13px' }}>Inga utgifter loggade</div>
                ) : expensesByCategory.sort((a, b) => b.value - a.value).map(cat => (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: '13px' }}>{cat.label}</div>
                    <div className="mono" style={{ fontSize: '13px', fontWeight: '500' }}>{cat.value.toLocaleString('sv-SE')} kr</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', width: '35px', textAlign: 'right' }}>
                      {((cat.value / (totalExpenses || 1)) * 100).toFixed(0)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Fixed costs */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '10px' }}>FASTA KOSTNADER</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {fixedCosts.map(fc => (
                <div key={fc.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{fc.name}</span>
                  <span className="mono" style={{ fontSize: '13px', color: 'var(--muted)' }}>{fc.amount.toLocaleString('sv-SE')} kr</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: '500' }}>Totalt</span>
                <span className="mono" style={{ fontSize: '13px', fontWeight: '600' }}>{fixedTotal.toLocaleString('sv-SE')} kr</span>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="card">
            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '500', marginBottom: '10px' }}>SENASTE TRANSAKTIONER</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[...incomes.map(i => ({ ...i, type: 'income' })), ...expenses.map(e => ({ ...e, type: 'expense' }))]
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .slice(0, 15)
                .map(tx => {
                  const cat = EXPENSE_CATEGORIES.find(c => c.id === tx.category)
                  return (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px' }}>{tx.type === 'income' ? '' : cat?.emoji || ''}</span>
                        <div>
                          <div>{tx.description || tx.source || cat?.label || 'Utgift'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{format(new Date(tx.date), 'd MMM', { locale: sv })}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono" style={{ fontSize: '13px', fontWeight: '500', color: tx.type === 'income' ? '#10b981' : '#ef4444' }}>
                            {tx.type === 'income' ? '+' : '-'}
                            {tx.type === 'income' && TAXED_SOURCES.includes(tx.source)
                              ? Math.round(tx.amount * (1 - TAX_RATE)).toLocaleString('sv-SE')
                              : tx.amount.toLocaleString('sv-SE')} kr
                          </div>
                          {tx.type === 'income' && TAXED_SOURCES.includes(tx.source) && (
                            <div style={{ fontSize: '10px', color: 'var(--muted)' }}>
                              brutto {tx.amount.toLocaleString('sv-SE')} kr
                            </div>
                          )}
                        </div>
                        <button onClick={() => deleteEntry(tx.type === 'income' ? 'income_logs' : 'expense_logs', tx.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4, padding: '2px' }}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </>
      )}

      {/* LOG TAB */}
      {activeTab === 'log' && (
        <div className="card">
          {/* Toggle */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface2)', borderRadius: '8px', padding: '4px' }}>
            {[{ id: 'expense', label: '− Utgift' }, { id: 'income', label: '+ Inkomst' }].map(t => (
              <button key={t.id} onClick={() => setLogType(t.id)} style={{
                flex: 1, padding: '8px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                background: logType === t.id ? (t.id === 'income' ? '#10b981' : '#ef4444') : 'transparent',
                color: logType === t.id ? 'white' : 'var(--muted)',
                fontSize: '14px', fontWeight: '600', fontFamily: 'Inter, sans-serif',
                transition: 'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>

          {logType === 'expense' && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Belopp (kr)</label>
                <input className="input" type="number" placeholder="0" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: '20px', padding: '12px 14px' }} />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '8px' }}>Kategori</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setExpenseForm(f => ({ ...f, category: cat.id }))} style={{
                      padding: '8px 4px', borderRadius: '8px', border: `1px solid ${expenseForm.category === cat.id ? cat.color : 'var(--border)'}`,
                      background: expenseForm.category === cat.id ? cat.color + '20' : 'transparent',
                      color: expenseForm.category === cat.id ? cat.color : 'var(--muted)',
                      cursor: 'pointer', fontSize: '11px', fontFamily: 'Inter, sans-serif',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                    }}>
                      <span style={{ fontSize: '16px' }}>{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Beskrivning (valfritt)</label>
                <input className="input" placeholder="t.ex. ICA, Systembolaget..." value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                <input className="input" type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <button onClick={saveExpense} className="btn btn-primary" disabled={saving || !expenseForm.amount} style={{ width: '100%', justifyContent: 'center', background: '#ef4444' }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Logga utgift</>}
              </button>
            </>
          )}

          {logType === 'income' && (
            <>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>
                  Belopp (kr)
                  {incomeForm.source === 'PA-jobb' && (
                    <span style={{ color: '#f59e0b', marginLeft: '6px' }}>— logga bruttolön (före skatt)</span>
                  )}
                </label>
                <input className="input" type="number" placeholder="0" value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: '20px', padding: '12px 14px' }} />
                {incomeForm.source === 'PA-jobb' && incomeForm.amount && (
                  <div style={{ fontSize: '12px', color: '#10b981', marginTop: '6px' }}>
                    Netto (70%): {Math.round(parseFloat(incomeForm.amount) * 0.7).toLocaleString('sv-SE')} kr
                  </div>
                )}
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Källa</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {INCOME_SOURCES.map(src => (
                    <button key={src} onClick={() => setIncomeForm(f => ({
                      ...f, source: src,
                      counts_toward_csn: src !== 'Erik Norling',
                    }))} style={{
                      padding: '7px 14px', borderRadius: '8px',
                      border: `1px solid ${incomeForm.source === src ? '#10b981' : 'var(--border)'}`,
                      background: incomeForm.source === src ? 'rgba(16,185,129,0.15)' : 'transparent',
                      color: incomeForm.source === src ? '#10b981' : 'var(--muted)',
                      cursor: 'pointer', fontSize: '13px', fontFamily: 'Inter, sans-serif',
                    }}>{src}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="csn-check" checked={incomeForm.counts_toward_csn}
                  onChange={e => setIncomeForm(f => ({ ...f, counts_toward_csn: e.target.checked }))}
                  style={{ accentColor: '#10b981', width: '16px', height: '16px', cursor: 'pointer' }} />
                <label htmlFor="csn-check" style={{ fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' }}>
                  Räknas mot CSN-fribelopp
                  {incomeForm.source === 'Erik Norling' && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>(Erik = kontant, räknas ej)</span>}
                </label>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                <input className="input" type="date" value={incomeForm.date} onChange={e => setIncomeForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <input className="input" placeholder="Anteckningar (valfritt)" value={incomeForm.notes} onChange={e => setIncomeForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: '20px' }} />
              <button onClick={saveIncome} className="btn btn-primary" disabled={saving || !incomeForm.amount} style={{ width: '100%', justifyContent: 'center' }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Logga inkomst</>}
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
