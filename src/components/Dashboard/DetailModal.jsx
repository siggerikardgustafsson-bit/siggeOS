import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useNavigate } from 'react-router-dom'

// Tier requirement descriptions — exakta krav för varje kategori
const TIER_REQUIREMENTS = {
  kondition: [
    { tier: 2, label: 'Top 50%', reqs: ['5km under 28:00', 'VO2max ≥ 44 ml/kg/min'] },
    { tier: 3, label: 'Top 30%', reqs: ['5km under 24:00', '10km under 50:00', 'VO2max ≥ 49'] },
    { tier: 4, label: 'Top 20%', reqs: ['5km under 22:00', '10km under 46:00', 'VO2max ≥ 53'] },
    { tier: 5, label: 'Top 10%', reqs: ['5km under 20:00', '10km under 42:00', 'Halvmara under 1:38', 'VO2max ≥ 57'] },
    { tier: 6, label: 'Top 5%', reqs: ['5km under 18:30', '10km under 39:00', 'Halvmara under 1:31', 'VO2max ≥ 61'] },
    { tier: 7, label: 'Top 2.5%', reqs: ['5km under 17:00', '10km under 36:00', 'Halvmara under 1:25', 'VO2max ≥ 65'] },
    { tier: 8, label: 'Top 1%', reqs: ['5km under 15:30', '10km under 33:00', 'Halvmara under 1:18', 'Mara under 2:45', 'VO2max ≥ 70'] },
  ],
  styrka: [
    { tier: 2, label: 'Top 50%', reqs: ['Bänk ≥ 0.75x BW (~58kg)', 'Knäböj ≥ 1.0x BW (~75kg)', 'Mark ≥ 1.25x BW (~94kg)'] },
    { tier: 3, label: 'Top 30%', reqs: ['Bänk ≥ 1.0x BW (~75kg)', 'Knäböj ≥ 1.25x BW (~94kg)', 'Mark ≥ 1.5x BW (~113kg)'] },
    { tier: 4, label: 'Top 20%', reqs: ['Bänk ≥ 1.15x BW (~86kg)', 'Knäböj ≥ 1.4x BW (~105kg)', 'Mark ≥ 1.7x BW (~128kg)'] },
    { tier: 5, label: 'Top 10%', reqs: ['Bänk ≥ 1.3x BW (~98kg)', 'Knäböj ≥ 1.6x BW (~120kg)', 'Mark ≥ 1.9x BW (~143kg)'] },
    { tier: 6, label: 'Top 5%', reqs: ['Bänk ≥ 1.5x BW (~113kg)', 'Knäböj ≥ 1.75x BW (~131kg)', 'Mark ≥ 2.1x BW (~158kg)', 'OHP ≥ 1.0x BW'] },
    { tier: 7, label: 'Top 2.5%', reqs: ['Bänk ≥ 1.65x BW (~124kg)', 'Knäböj ≥ 1.9x BW (~143kg)', 'Mark ≥ 2.3x BW (~173kg)'] },
    { tier: 8, label: 'Top 1%', reqs: ['Bänk ≥ 1.8x BW (~135kg)', 'Knäböj ≥ 2.1x BW (~158kg)', 'Mark ≥ 2.5x BW (~188kg)', 'Pull-ups ≥ 28 reps'] },
  ],
  somn: [
    { tier: 2, label: 'Top 50%', reqs: ['Sov i snitt ≥ 6.5 timmar/natt'] },
    { tier: 3, label: 'Top 30%', reqs: ['Sov i snitt ≥ 7.0 timmar/natt', 'Logga sömn minst 5 av 7 dagar'] },
    { tier: 4, label: 'Top 20%', reqs: ['Sov i snitt ≥ 7.5 timmar/natt'] },
    { tier: 5, label: 'Top 10%', reqs: ['Sov i snitt ≥ 8.0 timmar/natt', 'Konsekvent lägg- och uppstigningstid'] },
    { tier: 6, label: 'Top 5%', reqs: ['Sov i snitt ≥ 8.5 timmar/natt', 'Variation i läggtid under 15 min'] },
    { tier: 7, label: 'Top 2.5%', reqs: ['Sov i snitt ≥ 8.5h + optimal sömnregelbundenhet'] },
    { tier: 8, label: 'Top 1%', reqs: ['Sov i snitt ≥ 9h/natt', 'Perfekt sömnkonsistens'] },
  ],
  plugg: [
    { tier: 1, label: 'Nybörjare', reqs: ['Mastery 0–20%'] },
    { tier: 2, label: 'Grundläggande', reqs: ['Mastery ≥ 20%', 'Börja repetera aktivt'] },
    { tier: 3, label: 'Medel', reqs: ['Mastery ≥ 40%', 'Aktiv drilling på svaga områden'] },
    { tier: 4, label: 'Avancerad', reqs: ['Mastery ≥ 60%', 'Klara av kliniska fall utan hjälp'] },
    { tier: 5, label: 'Expert', reqs: ['Mastery ≥ 80%', 'Kunna förklara alla mekanismer utan anteckningar'] },
  ],
  ekonomi: [
    { tier: 2, label: 'Top 50%', reqs: ['Nettoinkomst ≥ 12 000 kr/månad'] },
    { tier: 3, label: 'Top 30%', reqs: ['Nettoinkomst ≥ 18 000 kr/månad', 'Sparat ≥ 20 000 kr'] },
    { tier: 4, label: 'Top 20%', reqs: ['Nettoinkomst ≥ 22 000 kr/månad', 'Sparat ≥ 50 000 kr'] },
    { tier: 5, label: 'Top 10%', reqs: ['Nettoinkomst ≥ 28 000 kr/månad', 'Sparat ≥ 100 000 kr'] },
    { tier: 6, label: 'Top 5%', reqs: ['Nettoinkomst ≥ 35 000 kr/månad', 'Sparat ≥ 200 000 kr'] },
    { tier: 7, label: 'Top 2.5%', reqs: ['Nettoinkomst ≥ 45 000 kr/månad', 'Sparat ≥ 350 000 kr'] },
    { tier: 8, label: 'Top 1%', reqs: ['Nettoinkomst ≥ 60 000 kr/månad', 'Sparat ≥ 500 000 kr'] },
  ],
  valmående: [
    { tier: 2, label: 'Top 50%', reqs: ['Energisnitt ≥ 5/10', 'Humörsnitt ≥ 5/10', '≥ 5 000 steg/dag'] },
    { tier: 3, label: 'Top 30%', reqs: ['Energisnitt ≥ 6/10', 'Stresssnitt ≤ 5/10', '≥ 7 500 steg/dag'] },
    { tier: 4, label: 'Top 20%', reqs: ['Energisnitt ≥ 7/10', 'Humörsnitt ≥ 7/10', 'Stresssnitt ≤ 4/10', '≥ 9 000 steg/dag'] },
    { tier: 5, label: 'Top 10%', reqs: ['Energisnitt ≥ 8/10', 'Stresssnitt ≤ 3/10', '≥ 11 000 steg/dag'] },
    { tier: 6, label: 'Top 5%', reqs: ['Energisnitt ≥ 9/10', 'Stresssnitt ≤ 2/10', '≥ 13 000 steg/dag'] },
    { tier: 7, label: 'Top 2.5%', reqs: ['Alla metrics i toppklass konsekvent'] },
    { tier: 8, label: 'Top 1%', reqs: ['Energi/humör ≥ 9.5/10 i snitt', 'Stress ≤ 1.5/10', '≥ 15 000 steg/dag'] },
  ],
  fardigheter: [
    { tier: 2, label: 'Nybörjare', reqs: ['1–30 min/vecka i snitt'] },
    { tier: 3, label: 'Regelbunden', reqs: ['30–60 min/vecka i snitt'] },
    { tier: 4, label: 'Dedikerad', reqs: ['60–120 min/vecka i snitt'] },
    { tier: 5, label: 'Seriös', reqs: ['120–240 min/vecka i snitt'] },
    { tier: 6, label: 'Mästare', reqs: ['240+ min/vecka i snitt (4+ timmar)'] },
  ],
}

export default function DetailModal({ category, onClose }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  if (!category) return null

  const { name, icon, tier, metrics, details, chartData, chartLines, navTarget, navLabel, id } = category
  const tierColor = tier?.color || '#6b7280'
  const tierNum = tier?.tier || 0
  const requirements = TIER_REQUIREMENTS[id] || []
  const currentTierNum = tierNum
  const nextTierReqs = requirements.find(r => r.tier === currentTierNum + 1)
  const allTierReqs = requirements

  const periods = ['7d', '30d', '90d', '1år']

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0f1724 0%, #0a0f1a 100%)',
          border: '1px solid ' + tierColor + '44',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '580px',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px ' + tierColor + '22',
          scrollbarWidth: 'none',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid #1f2937',
          position: 'sticky', top: 0, zIndex: 10,
          background: 'linear-gradient(180deg, #0f1724 0%, #0f172499 100%)',
          backdropFilter: 'blur(12px)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '12px',
              background: tierColor + '18',
              border: '1px solid ' + tierColor + '33',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '20px',
            }}>
              {icon}
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#f9fafb', letterSpacing: '-0.02em' }}>
                {name}
              </div>
              {tier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: tierColor, boxShadow: '0 0 8px ' + tierColor }} />
                  <span style={{ fontSize: '12px', color: tierColor, fontWeight: 600 }}>{tier.label}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32,
            background: '#1f2937', border: '1px solid #374151',
            borderRadius: '8px', color: '#9ca3af',
            cursor: 'pointer', fontSize: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>

        <div style={{ padding: '24px 28px' }}>

          {/* Current metrics */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
              color: '#4b5563', textTransform: 'uppercase', marginBottom: '12px',
            }}>
              Aktuellt
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(details || metrics || []).map((m, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '11px 14px',
                  background: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: '10px',
                }}>
                  <span style={{ fontSize: '13px', color: '#9ca3af' }}>{m.label}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '14px', fontWeight: 600,
                      color: m.tierInfo?.color || '#f3f4f6',
                    }}>
                      {m.value}
                    </div>
                    {m.tierInfo && (
                      <div style={{ fontSize: '10px', color: m.tierInfo.color, opacity: 0.7, marginTop: '1px' }}>
                        {m.tierInfo.label}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* NÄSTA NIVÅ — konkreta krav */}
          {nextTierReqs && (
            <div style={{
              marginBottom: '24px',
              background: tierColor + '0d',
              border: '1px solid ' + tierColor + '33',
              borderRadius: '14px',
              padding: '18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
                  color: '#4b5563', textTransform: 'uppercase',
                }}>
                  Nästa nivå
                </div>
                <div style={{
                  padding: '3px 10px', borderRadius: '20px',
                  background: tierColor + '22', border: '1px solid ' + tierColor + '44',
                  fontSize: '11px', fontWeight: 700, color: tierColor,
                }}>
                  {nextTierReqs.label}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {nextTierReqs.reqs.map((req, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '5px', flexShrink: 0,
                      background: '#1f2937', border: '1px solid #374151',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginTop: '1px',
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: '2px', background: tierColor + '66' }} />
                    </div>
                    <span style={{ fontSize: '13px', color: '#e5e7eb', lineHeight: 1.5 }}>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ALLA TIER-NIVÅER — komplett referens */}
          {allTierReqs.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                color: '#4b5563', textTransform: 'uppercase', marginBottom: '12px',
              }}>
                Alla nivåer
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {allTierReqs.map((t, i) => {
                  const isCurrent = t.tier === currentTierNum
                  const isPast = t.tier < currentTierNum
                  const tColor = ['','#6b7280','#3b82f6','#8b5cf6','#f59e0b','#10b981','#06b6d4','#ec4899','#f59e0b'][t.tier] || '#6b7280'
                  return (
                    <div key={i} style={{
                      padding: '12px 14px',
                      background: isCurrent ? tColor + '15' : '#0d1117',
                      border: '1px solid ' + (isCurrent ? tColor + '55' : '#1f2937'),
                      borderRadius: '10px',
                      opacity: isPast ? 0.5 : 1,
                      position: 'relative',
                      overflow: 'hidden',
                    }}>
                      {isCurrent && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, bottom: 0, width: '2px',
                          background: tColor,
                        }} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                        {isPast && <span style={{ fontSize: '11px' }}>✓</span>}
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: tColor,
                          boxShadow: isCurrent ? '0 0 8px ' + tColor : 'none',
                        }} />
                        <span style={{
                          fontSize: '12px', fontWeight: 700, color: isCurrent ? tColor : '#6b7280',
                          letterSpacing: '0.05em',
                        }}>
                          {t.label}
                          {isCurrent && <span style={{ marginLeft: 6, fontSize: '10px', color: tColor + 'aa' }}>← du är här</span>}
                        </span>
                      </div>
                      <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {t.reqs.map((r, j) => (
                          <span key={j} style={{ fontSize: '12px', color: isCurrent ? '#d1d5db' : '#6b7280' }}>
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Chart */}
          {chartData && chartData.length > 1 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em',
                  color: '#4b5563', textTransform: 'uppercase',
                }}>
                  Historik
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {periods.map(p => (
                    <button key={p} onClick={() => setPeriod(p)} style={{
                      padding: '3px 9px', fontSize: '10px', borderRadius: '6px',
                      background: period === p ? tierColor + '28' : 'transparent',
                      border: '1px solid ' + (period === p ? tierColor + '66' : '#1f2937'),
                      color: period === p ? tierColor : '#4b5563',
                      cursor: 'pointer', fontWeight: period === p ? 700 : 400,
                    }}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{ background: '#080d14', borderRadius: '12px', padding: '12px', border: '1px solid #1f2937' }}>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#374151' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#374151' }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip contentStyle={{
                      background: '#0f1724', border: '1px solid #1f2937',
                      borderRadius: '8px', fontSize: '12px', color: '#e5e7eb',
                    }} labelStyle={{ color: '#6b7280' }} />
                    {(chartLines || []).map((line, i) => (
                      <Line key={i} type="monotone" dataKey={line.key}
                        stroke={line.color || tierColor} strokeWidth={2}
                        dot={false} name={line.label} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Nav button */}
          {navTarget && (
            <button
              onClick={() => { onClose(); navigate(navTarget) }}
              style={{
                width: '100%', padding: '13px',
                background: 'linear-gradient(135deg, ' + tierColor + '22, ' + tierColor + '11)',
                border: '1px solid ' + tierColor + '44',
                borderRadius: '12px',
                color: tierColor, fontWeight: 700, fontSize: '14px',
                cursor: 'pointer', letterSpacing: '0.02em',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg, ' + tierColor + '33, ' + tierColor + '18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, ' + tierColor + '22, ' + tierColor + '11)'}
            >
              Gå till {navLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
