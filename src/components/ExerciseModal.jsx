import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { X, TrendingUp, List, BarChart2, Dumbbell } from 'lucide-react'
import Modal from './Modal'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, ReferenceLine, ScatterChart, Scatter, ZAxis
} from 'recharts'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
      <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text)', fontWeight: '600' }}>{p.name}: {p.value}{p.unit || ''}</div>
      ))}
    </div>
  )
}

export default function ExerciseModal({ exerciseName, onClose }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('progression')
  const [allSets, setAllSets] = useState([])
  const [loading, setLoading] = useState(true)

  // For weight-selector (reps over time at fixed weight)
  const [selectedWeight, setSelectedWeight] = useState(null)
  // For reps-selector (weight over time at fixed reps)
  const [selectedReps, setSelectedReps] = useState(null)

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

  const allTimePR = allSets.length ? Math.max(...allSets.map(s => s.weight_kg || 0)) : 0

  // All unique weights used, sorted descending
  const uniqueWeights = [...new Set(allSets.map(s => s.weight_kg).filter(Boolean))].sort((a, b) => b - a)
  // All unique rep counts used, sorted
  const uniqueReps = [...new Set(allSets.map(s => s.reps).filter(Boolean))].sort((a, b) => a - b)

  // Progression data — max weight per session
  const progressionData = sessions.map(({ date, sets }) => ({
    date: format(parseISO(date), 'd MMM', { locale: sv }),
    fullDate: date,
    maxVikt: Math.max(...sets.map(s => s.weight_kg || 0)),
    volym: Math.round(sets.reduce((sum, s) => sum + ((s.weight_kg || 0) * (s.reps || 0)), 0)),
  }))

  // Weight → reps over time: for selectedWeight, max reps per session
  const weightRepsData = selectedWeight
    ? sessions.map(({ date, sets }) => {
        const setsAtWeight = sets.filter(s => s.weight_kg === selectedWeight)
        if (!setsAtWeight.length) return null
        const maxReps = Math.max(...setsAtWeight.map(s => s.reps || 0))
        return { date: format(parseISO(date), 'd MMM', { locale: sv }), reps: maxReps }
      }).filter(Boolean)
    : []

  // Reps → weight over time: for selectedReps, max weight per session
  const repsWeightData = selectedReps
    ? sessions.map(({ date, sets }) => {
        const setsAtReps = sets.filter(s => s.reps === selectedReps)
        if (!setsAtReps.length) return null
        const maxWeight = Math.max(...setsAtReps.map(s => s.weight_kg || 0))
        return { date: format(parseISO(date), 'd MMM', { locale: sv }), vikt: maxWeight }
      }).filter(Boolean)
    : []

  // Per-weight summary: for each unique weight, how many times used and max reps
  const weightSummary = uniqueWeights.map(w => {
    const setsAtW = allSets.filter(s => s.weight_kg === w)
    const maxReps = Math.max(...setsAtW.map(s => s.reps || 0))
    const sessions = new Set(setsAtW.map(s => s.training_sessions?.date)).size
    return { weight: w, maxReps, sessions, totalSets: setsAtW.length }
  })

  // Per-reps summary: for each unique rep count, max weight achieved
  const repsSummary = uniqueReps.map(r => {
    const setsAtR = allSets.filter(s => s.reps === r)
    const maxWeight = Math.max(...setsAtR.map(s => s.weight_kg || 0))
    const sessions = new Set(setsAtR.map(s => s.training_sessions?.date)).size
    return { reps: r, maxWeight, sessions, totalSets: setsAtR.length }
  })

  return (
    <Modal onClose={onClose} maxWidth={700} bare>

        {/* Header */}
        <div className="mx-em-head" style={{ '--em-c': '#3b82f6' }}>
          <div className="mx-em-top">
            <div className="mx-em-ico"><Dumbbell size={22} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="mx-em-title">{exerciseName}</div>
              <div className="mx-em-sub">Styrkehistorik & progression</div>
            </div>
            <button className="mx-em-close" onClick={onClose} aria-label="Stäng"><X size={18} /></button>
          </div>

          <div className="mx-em-stats">
            <span className="mx-em-pill"><b>{sessions.length}</b> pass</span>
            <span className="mx-em-pill"><b>{allSets.length}</b> set</span>
            {allTimePR > 0 && <span className="mx-em-pill pr"><b>{allTimePR}kg</b> PR</span>}
          </div>

          {/* Tabs */}
          <div className="mx-em-tabs">
            <div className="mx-segment" style={{ display: 'flex', width: '100%' }}>
              {[
                { id: 'progression', label: 'Progression', icon: TrendingUp },
                { id: 'vikt',        label: 'Per vikt',    icon: BarChart2 },
                { id: 'reps',        label: 'Per reps',    icon: BarChart2 },
                { id: 'logg',        label: 'Logg',        icon: List },
              ].map(({ id, label, icon: Icon }) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`mx-segment-btn ${tab === id ? 'active' : ''}`}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Icon size={13} className="mx-seg-ico" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Laddar historik...</div>
          ) : sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Inga loggade set för {exerciseName} ännu</div>
          ) : (
            <>
              {/* ===== PROGRESSION ===== */}
              {tab === 'progression' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.06em' }}>MAX VIKT PER PASS</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={progressionData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={['auto', 'auto']} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="maxVikt" stroke="var(--accent)" strokeWidth={2.5}
                          dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 0 }} name="Max vikt" unit="kg" connectNulls />
                        {allTimePR > 0 && <ReferenceLine y={allTimePR} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.5} label={{ value: 'PR', fontSize: 9, fill: '#f59e0b', position: 'right' }} />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '12px', letterSpacing: '0.06em' }}>TOTAL VOLYM PER PASS (kg × reps)</div>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={progressionData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="volym" fill="var(--accent)" opacity={0.4} radius={[3,3,0,0]} name="Volym" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* ===== PER VIKT ===== */}
              {tab === 'vikt' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Weight selector chips */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>VÄLJ VIKT — SE REPS ÖVER TID</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {weightSummary.map(({ weight, maxReps, sessions: s }) => (
                        <button key={weight} onClick={() => setSelectedWeight(selectedWeight === weight ? null : weight)} style={{
                          padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                          background: selectedWeight === weight ? 'var(--accent)' : 'var(--surface2)',
                          color: selectedWeight === weight ? 'white' : 'var(--muted2)',
                          fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                          transition: 'all 0.15s',
                          boxShadow: selectedWeight === weight ? '0 2px 10px var(--accent-glow)' : 'none',
                        }}>
                          <span className="mono" style={{ color: 'inherit' }}>{weight}kg</span>
                          <span style={{ fontSize: '10px', marginLeft: '5px', opacity: 0.7 }}>max {maxReps}r · {s}p</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Graph for selected weight */}
                  {selectedWeight && weightRepsData.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>
                        MAX REPS PÅ {selectedWeight}KG ÖVER TID
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={weightRepsData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} domain={[0, 'auto']} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="monotone" dataKey="reps" stroke="#34d399" strokeWidth={2.5}
                            dot={{ r: 5, fill: '#34d399', strokeWidth: 0 }} name="Reps" connectNulls />
                          <ReferenceLine y={Math.max(...weightRepsData.map(d => d.reps))} stroke="#34d399" strokeDasharray="4 4" opacity={0.4} label={{ value: 'Max', fontSize: 9, fill: '#34d399', position: 'right' }} />
                        </LineChart>
                      </ResponsiveContainer>
                      <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--muted)' }}>
                        <span>Max reps: <span className="mono" style={{ color: '#34d399', fontWeight: '600' }}>{Math.max(...weightRepsData.map(d => d.reps))}</span></span>
                        <span>Pass loggat: <span className="mono" style={{ color: 'var(--text)' }}>{weightRepsData.length}</span></span>
                      </div>
                    </div>
                  )}

                  {/* Full weight summary table */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>ALLA VIKTER — ÖVERSIKT</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {weightSummary.map(({ weight, maxReps, totalSets }) => {
                        const maxRepsEver = Math.max(...weightSummary.map(w => w.maxReps)) || 1
                        const pct = Math.round((maxReps / maxRepsEver) * 100)
                        return (
                          <div key={weight} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                            onClick={() => setSelectedWeight(selectedWeight === weight ? null : weight)}>
                            <div className="mono" style={{ minWidth: '52px', fontWeight: '600', fontSize: '13px', color: weight === allTimePR ? '#f59e0b' : 'var(--text)' }}>
                              {weight}kg{weight === allTimePR ? ' ' : ''}
                            </div>
                            <div style={{ flex: 1, height: '7px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: selectedWeight === weight ? 'var(--accent)' : '#34d399', borderRadius: '4px', transition: 'width 0.5s, background 0.15s' }} />
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', minWidth: '80px', textAlign: 'right' }}>
                              max <span className="mono" style={{ color: '#34d399', fontWeight: '600' }}>{maxReps}</span> reps · {totalSets}st
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== PER REPS ===== */}
              {tab === 'reps' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Reps selector chips */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>VÄLJ REPS — SE VIKT ÖVER TID</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {repsSummary.map(({ reps, maxWeight, sessions: s }) => (
                        <button key={reps} onClick={() => setSelectedReps(selectedReps === reps ? null : reps)} style={{
                          padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                          background: selectedReps === reps ? 'var(--accent)' : 'var(--surface2)',
                          color: selectedReps === reps ? 'white' : 'var(--muted2)',
                          fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                          transition: 'all 0.15s',
                          boxShadow: selectedReps === reps ? '0 2px 10px var(--accent-glow)' : 'none',
                        }}>
                          <span className="mono" style={{ color: 'inherit' }}>{reps} reps</span>
                          <span style={{ fontSize: '10px', marginLeft: '5px', opacity: 0.7 }}>max {maxWeight}kg · {s}p</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Graph for selected reps */}
                  {selectedReps && repsWeightData.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>
                        MAX VIKT PÅ {selectedReps} REPS ÖVER TID
                      </div>
                      <ResponsiveContainer width="100%" height={160}>
                        <LineChart data={repsWeightData} margin={{ top: 5, right: 5, bottom: 0, left: -15 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                          <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} domain={['auto', 'auto']} />
                          <Tooltip content={<CustomTooltip />} />
                          <Line type="monotone" dataKey="vikt" stroke="#a78bfa" strokeWidth={2.5}
                            dot={{ r: 5, fill: '#a78bfa', strokeWidth: 0 }} name="Vikt" unit="kg" connectNulls />
                          <ReferenceLine y={Math.max(...repsWeightData.map(d => d.vikt))} stroke="#a78bfa" strokeDasharray="4 4" opacity={0.4} label={{ value: 'Max', fontSize: 9, fill: '#a78bfa', position: 'right' }} />
                        </LineChart>
                      </ResponsiveContainer>
                      <div style={{ marginTop: '8px', display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--muted)' }}>
                        <span>Bästa vikt: <span className="mono" style={{ color: '#a78bfa', fontWeight: '600' }}>{Math.max(...repsWeightData.map(d => d.vikt))}kg</span></span>
                        <span>Pass loggat: <span className="mono" style={{ color: 'var(--text)' }}>{repsWeightData.length}</span></span>
                      </div>
                    </div>
                  )}

                  {/* Full reps summary */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>ALLA REP-ANTAL — ÖVERSIKT</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {repsSummary.map(({ reps, maxWeight, totalSets }) => {
                        const maxWeightEver = allTimePR || 1
                        const pct = Math.round((maxWeight / maxWeightEver) * 100)
                        return (
                          <div key={reps} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                            onClick={() => setSelectedReps(selectedReps === reps ? null : reps)}>
                            <div className="mono" style={{ minWidth: '52px', fontWeight: '600', fontSize: '13px', color: 'var(--text)' }}>
                              {reps} reps
                            </div>
                            <div style={{ flex: 1, height: '7px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: selectedReps === reps ? 'var(--accent)' : '#a78bfa', borderRadius: '4px', transition: 'width 0.5s, background 0.15s' }} />
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', minWidth: '80px', textAlign: 'right' }}>
                              max <span className="mono" style={{ color: '#a78bfa', fontWeight: '600' }}>{maxWeight}</span>kg · {totalSets}st
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ===== LOGG ===== */}
              {tab === 'logg' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[...sessions].reverse().map(({ date, sets }) => {
                    const maxWeight = Math.max(...sets.map(s => s.weight_kg || 0))
                    const totalVol = Math.round(sets.reduce((sum, s) => sum + ((s.weight_kg || 0) * (s.reps || 0)), 0))
                    const isPR = maxWeight === allTimePR
                    return (
                      <div key={date} style={{
                        padding: '14px 16px', borderRadius: '12px',
                        background: isPR ? 'rgba(245,158,11,0.06)' : 'var(--surface2)',
                        border: `1px solid ${isPR ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600' }}>
                              {format(parseISO(date), 'EEEE d MMM yyyy', { locale: sv })}
                            </div>
                            {isPR && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(245,158,11,0.2)', color: '#f59e0b', fontWeight: '700' }}>PR</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--muted)' }}>
                            <span className="mono" style={{ color: 'var(--accent)', fontWeight: '600' }}>{maxWeight}kg</span>
                            <span>vol {totalVol}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {sets.slice().sort((a, b) => a.set_number - b.set_number).map((s, i) => {
                            const isTop = s.weight_kg === maxWeight
                            return (
                              <span key={i} className="mono" style={{
                                fontSize: '12px', padding: '4px 9px', borderRadius: '6px',
                                background: isTop ? 'var(--accent-soft)' : 'rgba(255,255,255,0.05)',
                                color: isTop ? 'var(--accent)' : 'var(--muted2)',
                                border: `1px solid ${isTop ? 'var(--accent-border)' : 'transparent'}`,
                                fontWeight: isTop ? '600' : '400',
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
    </Modal>
  )
}
