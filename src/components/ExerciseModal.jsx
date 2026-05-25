import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { X, TrendingUp, List, BarChart2, Trophy } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, ReferenceLine
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
      <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: '600' }}>{p.name}: {p.value}{p.unit || ''}</div>
      ))}
    </div>
  )
}

const REP_RANGES = [
  { label: '1–3 reps', min: 1, max: 3, color: '#ef4444' },
  { label: '4–6 reps', min: 4, max: 6, color: '#f59e0b' },
  { label: '7–10 reps', min: 7, max: 10, color: '#10b981' },
  { label: '11–15 reps', min: 11, max: 15, color: '#3b82f6' },
  { label: '15+ reps', min: 16, max: 999, color: '#a78bfa' },
]

export default function ExerciseModal({ exerciseName, onClose }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('progression')
  const [allSets, setAllSets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && exerciseName) fetchHistory()
  }, [user, exerciseName])

  async function fetchHistory() {
    setLoading(true)
    const { data } = await supabase
      .from('training_exercises')
      .select('*, training_sessions(date, feeling)')
      .eq('exercise_name', exerciseName)
      .order('training_sessions(date)', { ascending: true })
    setAllSets(data || [])
    setLoading(false)
  }

  // Group sets by session date
  const sessionMap = {}
  for (const set of allSets) {
    const date = set.training_sessions?.date || 'unknown'
    if (!sessionMap[date]) sessionMap[date] = []
    sessionMap[date].push(set)
  }
  const sessions = Object.entries(sessionMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sets]) => ({ date, sets }))

  // Progression data — max weight per session
  const progressionData = sessions.map(({ date, sets }) => {
    const maxWeight = Math.max(...sets.map(s => s.weight_kg || 0))
    const maxReps = Math.max(...sets.map(s => s.reps || 0))
    const volume = sets.reduce((sum, s) => sum + ((s.weight_kg || 0) * (s.reps || 0) * (s.set_number ? 1 : 1)), 0)
    const totalVol = sets.reduce((sum, s) => sum + ((s.weight_kg || 0) * (s.reps || 0)), 0)
    return {
      date: format(parseISO(date), 'd MMM', { locale: sv }),
      fullDate: date,
      maxVikt: maxWeight,
      volym: Math.round(totalVol),
      reps: maxReps,
    }
  })

  // PR
  const allTimePR = allSets.length ? Math.max(...allSets.map(s => s.weight_kg || 0)) : 0

  // Rep range data
  const repRangeData = REP_RANGES.map(range => {
    const setsInRange = allSets.filter(s => s.reps >= range.min && s.reps <= range.max && s.weight_kg > 0)
    const maxWeight = setsInRange.length ? Math.max(...setsInRange.map(s => s.weight_kg)) : 0
    const count = setsInRange.length
    return { label: range.label, maxVikt: maxWeight, antal: count, color: range.color }
  }).filter(r => r.antal > 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(20px)',
        border: '1px solid var(--border)',
        borderRadius: '20px',
        width: '100%', maxWidth: '680px',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.3px' }}>{exerciseName}</div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '13px', color: 'var(--muted)' }}>
              <span>{sessions.length} pass</span>
              <span>{allSets.length} set totalt</span>
              {allTimePR > 0 && <span style={{ color: '#f59e0b' }}>🏆 PR: {allTimePR}kg</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', padding: '16px 24px 0', flexShrink: 0 }}>
          {[
            { id: 'progression', label: 'Progression', icon: TrendingUp },
            { id: 'repranges', label: 'Rep-historik', icon: BarChart2 },
            { id: 'logg', label: 'Logg', icon: List },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: tab === id ? 'var(--accent-soft)' : 'transparent',
              color: tab === id ? 'var(--accent)' : 'var(--muted)',
              fontSize: '13px', fontWeight: tab === id ? '600' : '400',
              fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: '0',
            }}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '0 24px', flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Laddar historik...</div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Inga loggade set för {exerciseName} ännu</div>
          ) : (

            <>
              {/* PROGRESSION */}
              {tab === 'progression' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Max vikt */}
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.05em' }}>MAX VIKT PER PASS (kg)</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={progressionData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={['auto', 'auto']} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="maxVikt" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }} name="Max vikt" unit="kg" />
                        {allTimePR > 0 && <ReferenceLine y={allTimePR} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.6} />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Volym */}
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.05em' }}>TOTAL VOLYM PER PASS (kg × reps)</div>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={progressionData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="volym" fill="rgba(79,142,247,0.4)" radius={[3, 3, 0, 0]} name="Volym" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* REP RANGES */}
              {tab === 'repranges' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Max vikt per rep-range */}
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.05em' }}>MAX VIKT PER REP-RANGE</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {REP_RANGES.map(range => {
                        const setsInRange = allSets.filter(s => s.reps >= range.min && s.reps <= range.max && s.weight_kg > 0)
                        if (setsInRange.length === 0) return null
                        const maxWeight = Math.max(...setsInRange.map(s => s.weight_kg))
                        const globalMax = allTimePR || 1
                        const pct = Math.round((maxWeight / globalMax) * 100)
                        const bestSet = setsInRange.find(s => s.weight_kg === maxWeight)
                        const bestDate = bestSet?.training_sessions?.date ? format(parseISO(bestSet.training_sessions.date), 'd MMM yyyy', { locale: sv }) : ''
                        return (
                          <div key={range.label}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                              <div>
                                <span style={{ fontSize: '13px', fontWeight: '500' }}>{range.label}</span>
                                {bestDate && <span style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>senast {bestDate}</span>}
                              </div>
                              <div className="mono" style={{ fontSize: '15px', fontWeight: '700', color: range.color }}>{maxWeight}kg</div>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: range.color, borderRadius: '3px', transition: 'width 0.6s' }} />
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px' }}>{setsInRange.length} set totalt</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Vikt-distribution — vilka vikter används mest */}
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.05em' }}>VIKTDISTRIBUTION</div>
                    {(() => {
                      const weightCounts = {}
                      for (const s of allSets) {
                        if (!s.weight_kg) continue
                        const key = `${s.weight_kg}kg`
                        if (!weightCounts[key]) weightCounts[key] = { vikt: s.weight_kg, sets: 0, reps: 0 }
                        weightCounts[key].sets++
                        weightCounts[key].reps += s.reps || 0
                      }
                      const sorted = Object.values(weightCounts).sort((a, b) => b.vikt - a.vikt)
                      const maxSets = Math.max(...sorted.map(w => w.sets))
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {sorted.map(w => (
                            <div key={w.vikt} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div className="mono" style={{ fontSize: '13px', fontWeight: '600', minWidth: '52px', color: w.vikt === allTimePR ? '#f59e0b' : 'var(--text)' }}>
                                {w.vikt}kg {w.vikt === allTimePR ? '🏆' : ''}
                              </div>
                              <div style={{ flex: 1, height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${(w.sets / maxSets) * 100}%`, background: 'var(--accent)', borderRadius: '4px', opacity: 0.7 }} />
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--muted)', minWidth: '60px', textAlign: 'right' }}>{w.sets} set · {w.reps} reps</div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* LOGG */}
              {tab === 'logg' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[...sessions].reverse().map(({ date, sets }) => {
                    const maxWeight = Math.max(...sets.map(s => s.weight_kg || 0))
                    const totalVol = sets.reduce((sum, s) => sum + ((s.weight_kg || 0) * (s.reps || 0)), 0)
                    const feeling = sets[0]?.training_sessions?.feeling
                    const isPR = maxWeight === allTimePR
                    return (
                      <div key={date} style={{
                        padding: '14px 16px', borderRadius: '12px',
                        background: isPR ? 'rgba(245,158,11,0.06)' : 'var(--surface2)',
                        border: `1px solid ${isPR ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontSize: '14px', fontWeight: '600' }}>
                              {format(parseISO(date), 'EEEE d MMM yyyy', { locale: sv })}
                            </div>
                            {isPR && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: '700' }}>PR</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                            <span className="mono" style={{ color: 'var(--accent)', fontWeight: '600' }}>{maxWeight}kg max</span>
                            <span>vol {Math.round(totalVol)}kg</span>
                            {feeling && <span>{feeling}/10</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {sets
                            .slice()
                            .sort((a, b) => a.set_number - b.set_number)
                            .map((s, i) => {
                              const isTopSet = s.weight_kg === maxWeight
                              return (
                                <span key={i} className="mono" style={{
                                  fontSize: '12px', padding: '4px 9px',
                                  borderRadius: '6px',
                                  background: isTopSet ? 'rgba(79,142,247,0.15)' : 'rgba(255,255,255,0.05)',
                                  color: isTopSet ? 'var(--accent)' : 'var(--muted2)',
                                  border: `1px solid ${isTopSet ? 'rgba(79,142,247,0.2)' : 'transparent'}`,
                                  fontWeight: isTopSet ? '600' : '400',
                                }}>
                                  {s.reps}×{s.weight_kg}kg
                                </span>
                              )
                            })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
