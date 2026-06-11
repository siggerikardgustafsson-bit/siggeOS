import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { X, TrendingUp, List, Zap, Footprints } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import Modal from './Modal'

const DISTANCES = [
  { label: '1 km',       km: 1 },
  { label: '5 km',       km: 5 },
  { label: '10 km',      km: 10 },
  { label: 'Halvmaraton', km: 21.0975 },
  { label: 'Maraton',    km: 42.195 },
]

function formatPace(secondsPerKm) {
  if (!secondsPerKm || secondsPerKm <= 0) return '—'
  const min = Math.floor(secondsPerKm / 60)
  const sec = Math.round(secondsPerKm % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function formatTime(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
      <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: '600' }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

export default function RunModal({ onClose }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('pr')
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDist, setSelectedDist] = useState(10)

  useEffect(() => {
    if (user) fetchRuns()
  }, [user])

  async function fetchRuns() {
    setLoading(true)
    const { data } = await supabase
      .from('training_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('session_type', 'run')
      .not('distance_km', 'is', null)
      .gt('distance_km', 0)
      .order('date', { ascending: true })
    setRuns(data || [])
    setLoading(false)
  }

  // For a given target distance, find best pace from all runs >= that distance
  // Uses pace_per_km as proxy for split pace
  function getBestForDistance(targetKm) {
    const eligible = runs.filter(r => r.distance_km >= targetKm * 0.95) // allow 5% short
    if (!eligible.length) return null
    // Best = lowest pace_per_km (fastest)
    const best = eligible.reduce((b, r) => {
      if (!r.pace_per_km) return b
      if (!b || r.pace_per_km < b.pace_per_km) return r
      return b
    }, null)
    if (!best) return null
    const estSeconds = Math.round(best.pace_per_km * targetKm)
    return { run: best, pace: best.pace_per_km, estSeconds }
  }

  // Progression for selected distance
  function getProgressionData(targetKm) {
    return runs
      .filter(r => r.distance_km >= targetKm * 0.95 && r.pace_per_km)
      .map(r => ({
        date: format(parseISO(r.date), 'd MMM yy', { locale: sv }),
        tempo: r.pace_per_km,
        tempoLabel: formatPace(r.pace_per_km),
        dist: r.distance_km,
      }))
  }

  const progData = getProgressionData(selectedDist)
  const bestPaceInProg = progData.length ? Math.min(...progData.map(d => d.tempo)) : null

  // All runs sorted descending
  const sortedRuns = [...runs].sort((a, b) => b.date.localeCompare(a.date))

  // Stats
  const totalKm = runs.reduce((sum, r) => sum + (r.distance_km || 0), 0)
  const avgPace = runs.filter(r => r.pace_per_km).length
    ? runs.filter(r => r.pace_per_km).reduce((sum, r) => sum + r.pace_per_km, 0) / runs.filter(r => r.pace_per_km).length
    : null
  const longestRun = runs.length ? Math.max(...runs.map(r => r.distance_km || 0)) : 0

  return (
    <Modal onClose={onClose} maxWidth={700} bare>
        {/* Header */}
        <div className="mx-em-head" style={{ '--em-c': '#10b981' }}>
          <div className="mx-em-top">
            <div className="mx-em-ico"><Footprints size={22} /></div>
            <div style={{ minWidth: 0 }}>
              <div className="mx-em-title">Löphistorik</div>
              <div className="mx-em-sub">Tempo, PR & alla löppass</div>
            </div>
            <button className="mx-em-close" onClick={onClose} aria-label="Stäng"><X size={18} /></button>
          </div>

          <div className="mx-em-stats">
            <span className="mx-em-pill"><b>{runs.length}</b> pass</span>
            <span className="mx-em-pill"><b>{Math.round(totalKm)}</b> km totalt</span>
            {longestRun > 0 && <span className="mx-em-pill"><b>{longestRun.toFixed(1)} km</b> längst</span>}
            {avgPace && <span className="mx-em-pill"><b>{formatPace(avgPace)}</b> snitt-tempo</span>}
          </div>

          <div className="mx-em-tabs">
            <div className="mx-segment" style={{ display: 'flex', width: '100%' }}>
              {[
                { id: 'pr',          label: 'PR per distans', icon: Zap },
                { id: 'progression', label: 'Tempohistorik',  icon: TrendingUp },
                { id: 'logg',        label: 'Alla pass',      icon: List },
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
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Laddar löphistorik...</div>
          ) : runs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Inga löppass importerade ännu</div>
          ) : (
            <>
              {/* ===== PR PER DISTANS ===== */}
              {tab === 'pr' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>
                    Beräknas från ditt snabbaste tempo på pass där du sprang minst den distansen.
                  </div>
                  {DISTANCES.map(({ label, km }) => {
                    const best = getBestForDistance(km)
                    const eligible = runs.filter(r => r.distance_km >= km * 0.95).length
                    return (
                      <div key={km} style={{
                        padding: '16px', borderRadius: '12px',
                        background: best ? 'var(--surface2)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${best ? 'var(--border)' : 'rgba(255,255,255,0.04)'}`,
                        opacity: best ? 1 : 0.5,
                        cursor: best ? 'pointer' : 'default',
                      }} onClick={() => best && (setSelectedDist(km), setTab('progression'))}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '3px' }}>{label}</div>
                            {best ? (
                              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                                {format(parseISO(best.run.date), 'd MMM yyyy', { locale: sv })}
                                {best.run.notes && <span> · {best.run.notes.split(' · ')[0]}</span>}
                                <span style={{ marginLeft: '8px' }}>{eligible} pass kvalificerar</span>
                              </div>
                            ) : (
                              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Ingen tillräckligt lång löpning</div>
                            )}
                          </div>
                          {best && (
                            <div style={{ textAlign: 'right' }}>
                              <div className="mono" style={{ fontSize: '22px', fontWeight: '700', color: '#10b981', lineHeight: 1 }}>
                                {formatTime(best.estSeconds)}
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                                {formatPace(best.pace)}/km
                              </div>
                            </div>
                          )}
                        </div>
                        {best && (
                          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <TrendingUp size={10} /> Se tempohistorik →
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ===== TEMPOHISTORIK ===== */}
              {tab === 'progression' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Distance selector */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>
                      VÄLJ DISTANS — VISA TEMPO ÖVER TID
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {DISTANCES.map(({ label, km }) => {
                        const count = runs.filter(r => r.distance_km >= km * 0.95 && r.pace_per_km).length
                        if (count === 0) return null
                        return (
                          <button key={km} onClick={() => setSelectedDist(km)} style={{
                            padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: selectedDist === km ? 'var(--accent)' : 'var(--surface2)',
                            color: selectedDist === km ? 'white' : 'var(--muted2)',
                            fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif',
                            transition: 'all 0.15s',
                            boxShadow: selectedDist === km ? '0 2px 10px var(--accent-glow)' : 'none',
                          }}>
                            {label}
                            <span style={{ fontSize: '10px', marginLeft: '5px', opacity: 0.7 }}>{count}p</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {progData.length > 0 ? (
                    <>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.06em' }}>
                          SNABBASTE TEMPO PÅ PASS ≥ {DISTANCES.find(d => d.km === selectedDist)?.label} ÖVER TID
                        </div>
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={progData} margin={{ top: 5, right: 5, bottom: 0, left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted)' }} />
                            <YAxis
                              tick={{ fontSize: 10, fill: 'var(--muted)' }}
                              reversed={true}
                              domain={['auto', 'auto']}
                              tickFormatter={v => formatPace(v)}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload?.length) return null
                                return (
                                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
                                    <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                                    <div style={{ color: '#10b981', fontWeight: '600' }}>Tempo: {formatPace(payload[0].value)}/km</div>
                                    <div style={{ color: 'var(--muted)' }}>Distans: {payload[0]?.payload?.dist?.toFixed(1)} km</div>
                                  </div>
                                )
                              }}
                            />
                            <Line type="monotone" dataKey="tempo" stroke="#10b981" strokeWidth={2.5}
                              dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} name="Tempo" connectNulls />
                            {bestPaceInProg && (
                              <ReferenceLine y={bestPaceInProg} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.6}
                                label={{ value: `PR ${formatPace(bestPaceInProg)}`, fontSize: 9, fill: '#f59e0b', position: 'right' }} />
                            )}
                          </LineChart>
                        </ResponsiveContainer>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
                          ↑ Lägre = snabbare. Gul linje = ditt bästa tempo.
                        </div>
                      </div>

                      {/* PR for this distance */}
                      {bestPaceInProg && (
                        <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}>
                          <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600', marginBottom: '6px' }}>
                             BÄSTA TEMPO — {DISTANCES.find(d => d.km === selectedDist)?.label}
                          </div>
                          <div style={{ display: 'flex', gap: '24px' }}>
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Tempo</div>
                              <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>{formatPace(bestPaceInProg)}/km</div>
                            </div>
                            <div>
                              <div style={{ fontSize: '11px', color: 'var(--muted)' }}>Estimerad tid</div>
                              <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>{formatTime(Math.round(bestPaceInProg * selectedDist))}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                      Inga pass tillräckligt långa för {DISTANCES.find(d => d.km === selectedDist)?.label}
                    </div>
                  )}
                </div>
              )}

              {/* ===== ALLA PASS ===== */}
              {tab === 'logg' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {sortedRuns.map(run => {
                    const isLong = run.distance_km >= 15
                    const isFast = run.pace_per_km && run.pace_per_km < 280 // < 4:40/km
                    return (
                      <div key={run.id} style={{
                        padding: '12px 16px', borderRadius: '12px',
                        background: 'var(--surface2)',
                        border: '1px solid var(--border)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                              <div style={{ fontSize: '13px', fontWeight: '600' }}>
                                {format(parseISO(run.date), 'EEEE d MMM yyyy', { locale: sv })}
                              </div>
                              {isLong && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>Lång</span>}
                              {isFast && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>Snabb</span>}
                            </div>
                            {run.notes && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{run.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                            {run.distance_km && (
                              <div style={{ textAlign: 'right' }}>
                                <div className="mono" style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent)' }}>{run.distance_km.toFixed(1)} km</div>
                                {run.duration_minutes && <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{run.duration_minutes} min</div>}
                              </div>
                            )}
                            {run.pace_per_km && (
                              <div style={{ textAlign: 'right' }}>
                                <div className="mono" style={{ fontSize: '15px', fontWeight: '700', color: '#10b981' }}>{formatPace(run.pace_per_km)}</div>
                                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>per km</div>
                              </div>
                            )}
                          </div>
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
