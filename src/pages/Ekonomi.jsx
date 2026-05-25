import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { sv } from 'date-fns/locale'
import { Plus, X, Save, Loader, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Map } from 'lucide-react'

const EXPENSE_CATEGORIES = [
  { id: 'mat',             label: 'Mat',             color: '#f97316', emoji: '🍔' },
  { id: 'nöje',            label: 'Nöje',            color: '#ec4899', emoji: '🎉' },
  { id: 'transport',       label: 'Transport',       color: '#3b82f6', emoji: '🚇' },
  { id: 'kläder',          label: 'Kläder',          color: '#8b5cf6', emoji: '👕' },
  { id: 'hälsa',           label: 'Hälsa',           color: '#10b981', emoji: '💊' },
  { id: 'prenumerationer', label: 'Prenumerationer', color: '#06b6d4', emoji: '📱' },
  { id: 'hyra',            label: 'Hyra',            color: '#f59e0b', emoji: '🏠' },
  { id: 'övrigt',          label: 'Övrigt',          color: '#6b7280', emoji: '📦' },
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

export default function EkonomiPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('overview') // overview | log | trips | savings
  const [logType, setLogType] = useState('expense') // expense | income
  const [selectedMonth, setSelectedMonth] = useState(new Date())

  const [incomes, setIncomes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [fixedCosts, setFixedCosts] = useState([])
  const [trips, setTrips] = useState([])
  const [csnUsage, setCsnUsage] = useState(0)
  const [saving, setSaving] = useState(false)

  // Forms
  const [expenseForm, setExpenseForm] = useState({ amount: '', category: 'mat', description: '', date: format(new Date(), 'yyyy-MM-dd') })
  const [incomeForm, setIncomeForm] = useState({ amount: '', source: 'PA-jobb', counts_toward_csn: true, notes: '', date: format(new Date(), 'yyyy-MM-dd') })

  useEffect(() => {
    if (user) fetchAll()
  }, [user, selectedMonth])

  async function fetchAll() {
    const start = format(startOfMonth(selectedMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(selectedMonth), 'yyyy-MM-dd')

    const [incomesRes, expensesRes, fixedRes, tripsRes, csnRes] = await Promise.all([
      supabase.from('income_logs').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('expense_logs').select('*').eq('user_id', user.id).gte('date', start).lte('date', end).order('date', { ascending: false }),
      supabase.from('fixed_costs').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('trips').select('*').eq('user_id', user.id).in('status', ['planerad', 'pågående']).order('start_date'),
      supabase.rpc('get_csn_usage', { p_user_id: user.id }),
    ])

    setIncomes(incomesRes.data || [])
    setExpenses(expensesRes.data || [])
    setFixedCosts(fixedRes.data || [])
    setTrips(tripsRes.data || [])
    setCsnUsage(csnRes.data || 0)
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
  const csnPct = (csnUsage / 114500) * 100
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
    { id: 'savings',  label: 'Sparmål' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '600' }}>Ekonomi</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', textTransform: 'capitalize' }}>
            {format(selectedMonth, 'MMMM yyyy', { locale: sv })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))} className="btn btn-ghost" style={{ padding: '7px 10px' }}>←</button>
          <button onClick={() => setSelectedMonth(new Date())} className="btn btn-ghost" style={{ fontSize: '12px' }}>Idag</button>
          <button onClick={() => setSelectedMonth(subMonths(selectedMonth, -1))} className="btn btn-ghost" style={{ padding: '7px 10px' }}>→</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', borderRadius: '10px', padding: '4px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--surface3)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontWeight: '500', fontFamily: 'DM Sans, sans-serif',
            transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <>
          {/* Balance cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
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
              <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{Math.round(114500 - csnUsage).toLocaleString('sv-SE')} kr kvar</span>
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
                    <div style={{ flex: 1, fontSize: '13px' }}>{cat.emoji} {cat.label}</div>
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
                  <span style={{ fontSize: '13px' }}>{fc.name}</span>
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
                        <span style={{ fontSize: '16px' }}>{tx.type === 'income' ? '💰' : cat?.emoji || '📦'}</span>
                        <div>
                          <div style={{ fontSize: '13px' }}>{tx.description || tx.source || cat?.label || 'Utgift'}</div>
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
                fontSize: '14px', fontWeight: '600', fontFamily: 'DM Sans, sans-serif',
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
                      cursor: 'pointer', fontSize: '11px', fontFamily: 'DM Sans, sans-serif',
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
                      cursor: 'pointer', fontSize: '13px', fontFamily: 'DM Sans, sans-serif',
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
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏦</div>
          <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>Sparmål</div>
          <div style={{ color: 'var(--muted)', fontSize: '13px', lineHeight: '1.6' }}>
            Du har inga aktiva sparmål just nu.<br />
            Aktivera när du är redo att börja spara.
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
