import React, { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useNavigate } from 'react-router-dom'

const TIER_COLORS = {
  0:'rgba(255,255,255,0.18)',1:'rgba(255,255,255,0.75)',2:'#4f8ef7',3:'#a78bfa',
  4:'#fbbf24',5:'#34d399',6:'#22d3ee',7:'#f472b6',8:'#fbbf24',
}

const CAT_PATHS = {
  kondition:   'M13 10V3L4 14h7v7l9-11h-7z',
  styrka:      'M6 4v16M18 4v16M3 8h4m10 0h4M3 16h4m10 0h4',
  kropp:       'M12 3a4 4 0 100 8 4 4 0 000-8zM6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2',
  somn:        'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  plugg:       'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  ekonomi:     'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  valmående:   'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  fardigheter: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
}

function CatIcon({ id, color, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={CAT_PATHS[id] || CAT_PATHS.kondition} />
    </svg>
  )
}

const TIER_REQUIREMENTS = {
  kondition: [
    { tier:2, label:'Top 50%',  reqs:['5km under 28:00','VO2max ≥ 44 ml/kg/min'] },
    { tier:3, label:'Top 30%',  reqs:['5km under 24:00','10km under 50:00','VO2max ≥ 49'] },
    { tier:4, label:'Top 20%',  reqs:['5km under 22:00','10km under 46:00','VO2max ≥ 53'] },
    { tier:5, label:'Top 10%',  reqs:['5km under 20:00','10km under 42:00','Halvmara under 1:38','VO2max ≥ 57'] },
    { tier:6, label:'Top 5%',   reqs:['5km under 18:30','10km under 39:00','Halvmara under 1:31','VO2max ≥ 61'] },
    { tier:7, label:'Top 2.5%', reqs:['5km under 17:00','10km under 36:00','Halvmara under 1:25','VO2max ≥ 65'] },
    { tier:8, label:'Top 1%',   reqs:['5km under 15:30','10km under 33:00','Halvmara under 1:18','Mara under 2:45','VO2max ≥ 70'] },
  ],
  styrka: [
    { tier:2, label:'Top 50%',  reqs:['Bänk ≥ 0.75x BW (~58kg)','Knäböj ≥ 1.0x BW (~77kg)','Mark ≥ 1.25x BW (~96kg)'] },
    { tier:3, label:'Top 30%',  reqs:['Bänk ≥ 1.0x BW (~77kg)','Knäböj ≥ 1.25x BW (~96kg)','Mark ≥ 1.5x BW (~116kg)'] },
    { tier:4, label:'Top 20%',  reqs:['Bänk ≥ 1.15x BW (~89kg)','Knäböj ≥ 1.4x BW (~108kg)','Mark ≥ 1.7x BW (~131kg)'] },
    { tier:5, label:'Top 10%',  reqs:['Bänk ≥ 1.3x BW (~100kg)','Knäböj ≥ 1.6x BW (~123kg)','Mark ≥ 1.9x BW (~146kg)'] },
    { tier:6, label:'Top 5%',   reqs:['Bänk ≥ 1.5x BW (~116kg)','Knäböj ≥ 1.75x BW (~135kg)','Mark ≥ 2.1x BW (~162kg)','OHP ≥ 1.0x BW'] },
    { tier:7, label:'Top 2.5%', reqs:['Bänk ≥ 1.65x BW (~127kg)','Knäböj ≥ 1.9x BW (~146kg)','Mark ≥ 2.3x BW (~177kg)'] },
    { tier:8, label:'Top 1%',   reqs:['Bänk ≥ 1.8x BW (~139kg)','Knäböj ≥ 2.1x BW (~162kg)','Mark ≥ 2.5x BW (~193kg)','Pull-ups ≥ 28 reps'] },
  ],
  somn: [
    { tier:2, label:'Top 50%',  reqs:['Sov i snitt ≥ 6.5 timmar/natt'] },
    { tier:3, label:'Top 30%',  reqs:['Sov i snitt ≥ 7.0 timmar/natt','Logga sömn ≥ 5 av 7 dagar'] },
    { tier:4, label:'Top 20%',  reqs:['Sov i snitt ≥ 7.5 timmar/natt'] },
    { tier:5, label:'Top 10%',  reqs:['Sov i snitt ≥ 8.0 timmar/natt','Konsekvent läggtid'] },
    { tier:6, label:'Top 5%',   reqs:['Sov i snitt ≥ 8.5 timmar/natt','Variation i läggtid < 15 min'] },
    { tier:7, label:'Top 2.5%', reqs:['≥ 8.5h + perfekt sömnregelbundenhet'] },
    { tier:8, label:'Top 1%',   reqs:['Sov i snitt ≥ 9h/natt','Optimal sömnkonsistens'] },
  ],
  plugg: [
    { tier:1, label:'Nybörjare',     reqs:['Mastery 0–20%'] },
    { tier:2, label:'Grundläggande', reqs:['Mastery ≥ 20%','Börja repetera aktivt'] },
    { tier:3, label:'Medel',         reqs:['Mastery ≥ 40%','Aktiv drilling på svaga områden'] },
    { tier:4, label:'Avancerad',     reqs:['Mastery ≥ 60%','Lösa kliniska fall självständigt'] },
    { tier:5, label:'Expert',        reqs:['Mastery ≥ 80%','Förklara alla mekanismer utan anteckningar'] },
  ],
  ekonomi: [
    { tier:2, label:'Top 50%',  reqs:['Nettoinkomst ≥ 12 000 kr/mån'] },
    { tier:3, label:'Top 30%',  reqs:['Nettoinkomst ≥ 18 000 kr/mån','Sparat ≥ 20 000 kr'] },
    { tier:4, label:'Top 20%',  reqs:['Nettoinkomst ≥ 22 000 kr/mån','Sparat ≥ 50 000 kr'] },
    { tier:5, label:'Top 10%',  reqs:['Nettoinkomst ≥ 28 000 kr/mån','Sparat ≥ 100 000 kr'] },
    { tier:6, label:'Top 5%',   reqs:['Nettoinkomst ≥ 35 000 kr/mån','Sparat ≥ 200 000 kr'] },
    { tier:7, label:'Top 2.5%', reqs:['Nettoinkomst ≥ 45 000 kr/mån','Sparat ≥ 350 000 kr'] },
    { tier:8, label:'Top 1%',   reqs:['Nettoinkomst ≥ 60 000 kr/mån','Sparat ≥ 500 000 kr'] },
  ],
  valmående: [
    { tier:2, label:'Top 50%',  reqs:['Energi ≥ 5/10','Humör ≥ 5/10','≥ 5 000 steg/dag'] },
    { tier:3, label:'Top 30%',  reqs:['Energi ≥ 6/10','Stress ≤ 5/10','≥ 7 500 steg/dag'] },
    { tier:4, label:'Top 20%',  reqs:['Energi ≥ 7/10','Humör ≥ 7/10','Stress ≤ 4/10','≥ 9 000 steg/dag'] },
    { tier:5, label:'Top 10%',  reqs:['Energi ≥ 8/10','Stress ≤ 3/10','≥ 11 000 steg/dag'] },
    { tier:6, label:'Top 5%',   reqs:['Energi ≥ 9/10','Stress ≤ 2/10','≥ 13 000 steg/dag'] },
    { tier:7, label:'Top 2.5%', reqs:['Alla metrics i toppklass konsekvent'] },
    { tier:8, label:'Top 1%',   reqs:['Energi/humör ≥ 9.5/10','Stress ≤ 1.5/10','≥ 15 000 steg/dag'] },
  ],
  fardigheter: [
    { tier:2, label:'Nybörjare',   reqs:['1–30 min/vecka i snitt'] },
    { tier:3, label:'Regelbunden', reqs:['30–60 min/vecka i snitt'] },
    { tier:4, label:'Dedikerad',   reqs:['60–120 min/vecka i snitt'] },
    { tier:5, label:'Seriös',      reqs:['120–240 min/vecka i snitt'] },
    { tier:6, label:'Mästare',     reqs:['240+ min/vecka (4+ timmar)'] },
  ],
  kropp: [],
}

const CustomTooltip = ({ active, payload, label, tierColor }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(10,12,20,0.92)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px',
      padding: '10px 14px',
      fontSize: '12px',
    }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.stroke, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  )
}

export default function DetailModal({ category, onClose }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  if (!category) return null

  const { name, icon, tier, metrics, details, chartData, chartLines, navTarget, navLabel, id, perExercise } = category
  const tierNum = tier?.tier || 0
  const tierColor = TIER_COLORS[tierNum]
  const requirements = TIER_REQUIREMENTS[id] || []
  const nextTierReqs = requirements.find(r => r.tier === tierNum + 1)

  const periods = ['7d', '30d', '90d', '1år']

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'rgba(12,15,26,0.92)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.08) inset',
          scrollbarWidth: 'none',
          position: 'relative',
        }}
      >
        {/* Shimmer top */}
        <div style={{
          position: 'absolute', top: 0, left: '25%', right: '25%', height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
        }} />

        {/* Tier glow orb */}
        {tierNum > 0 && (
          <div style={{
            position: 'absolute', top: -40, right: -40,
            width: 160, height: 160, borderRadius: '50%',
            background: tierColor + '18',
            filter: 'blur(40px)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Sticky header */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(12,15,26,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderRadius: '20px 20px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '12px',
              background: tierNum > 0 ? tierColor + '18' : 'rgba(255,255,255,0.06)',
              border: '1px solid ' + (tierNum > 0 ? tierColor + '33' : 'rgba(255,255,255,0.08)'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CatIcon id={id} color={tierNum > 0 ? tierColor : 'rgba(255,255,255,0.3)'} size={20} />
            </div>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 600, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.02em' }}>
                {name}
              </div>
              {tier && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: tierColor,
                    boxShadow: '0 0 6px ' + tierColor,
                  }} />
                  <span style={{ fontSize: '12px', color: tierColor, fontWeight: 600 }}>{tier.label}</span>
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: 'rgba(255,255,255,0.4)',
            cursor: 'pointer', fontSize: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>×</button>
        </div>

        <div style={{ padding: '20px 24px' }}>

          {/* Current metrics */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: '10px' }}>
              Aktuellt
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {(details || metrics || []).map((m, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '10px',
                }}>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)' }}>{m.label}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: m.tierInfo?.color || 'rgba(255,255,255,0.85)' }}>
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

          {/* Nästa nivå */}
          {nextTierReqs && (
            <div style={{
              marginBottom: '20px',
              background: tierColor + '0e',
              border: '1px solid ' + tierColor + '2a',
              borderRadius: '14px',
              padding: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Nästa nivå
                </span>
                <div style={{
                  padding: '2px 9px', borderRadius: '20px',
                  background: tierColor + '20',
                  border: '1px solid ' + tierColor + '40',
                  fontSize: '11px', fontWeight: 700, color: tierColor,
                }}>
                  {nextTierReqs.label}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {nextTierReqs.reqs.map((req, i) => {
                  // For styrka: check if this requirement is already met via perExercise
                  let isMet = false
                  if (id === 'styrka' && category.perExercise?.length) {
                    const reqLower = req.toLowerCase()
                    const ex = category.perExercise.find(e =>
                      reqLower.includes(e.label.toLowerCase()) ||
                      (reqLower.includes('bänk') && e.label === 'Bänk') ||
                      (reqLower.includes('knäböj') && e.label === 'Knäböj') ||
                      (reqLower.includes('mark') && e.label === 'Mark') ||
                      (reqLower.includes('ohp') && e.label === 'OHP') ||
                      (reqLower.includes('pull') && e.label === 'Pull-up')
                    )
                    if (ex) isMet = ex.tier.tier > tierNum
                  }
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: '5px', flexShrink: 0, marginTop: '1px',
                        background: isMet ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid ' + (isMet ? 'rgba(16,185,129,0.4)' : tierColor + '40'),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isMet
                          ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          : <div style={{ width: 5, height: 5, borderRadius: '2px', background: tierColor + '70' }} />
                        }
                      </div>
                      <span style={{ fontSize: '13px', color: isMet ? 'rgba(16,185,129,0.7)' : 'rgba(255,255,255,0.78)', lineHeight: 1.5, textDecoration: isMet ? 'line-through' : 'none' }}>{req}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Alla tier-nivåer */}
          {requirements.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: '10px' }}>
                Alla nivåer
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {requirements.map((t, i) => {
                  const isCurrent = t.tier === tierNum
                  const isPast = t.tier < tierNum
                  const isNext = t.tier === tierNum + 1
                  const tColor = TIER_COLORS[t.tier] || '#6b7280'
                  return (
                    <div key={i} style={{
                      padding: '11px 14px',
                      background: isCurrent ? tColor + '14' : isPast ? 'rgba(16,185,129,0.05)' : isNext ? tColor + '08' : 'rgba(255,255,255,0.02)',
                      border: '1px solid ' + (isCurrent ? tColor + '50' : isPast ? 'rgba(16,185,129,0.18)' : isNext ? tColor + '25' : 'rgba(255,255,255,0.04)'),
                      borderRadius: '10px',
                      position: 'relative', overflow: 'hidden',
                      transition: 'all 0.15s',
                    }}>
                      {isCurrent && (
                        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: '3px', background: tColor, borderRadius: '10px 0 0 10px' }} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: t.reqs.length ? '7px' : 0 }}>
                        {/* Status icon */}
                        <div style={{
                          width: 18, height: 18, borderRadius: '5px', flexShrink: 0,
                          background: isPast ? 'rgba(16,185,129,0.2)' : isCurrent ? tColor + '22' : 'rgba(255,255,255,0.05)',
                          border: '1px solid ' + (isPast ? 'rgba(16,185,129,0.4)' : isCurrent ? tColor + '50' : 'rgba(255,255,255,0.08)'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isPast
                            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                            : isCurrent
                              ? <div style={{ width: 6, height: 6, borderRadius: '50%', background: tColor }} />
                              : <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                          }
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: isPast ? '#10b981' : isCurrent ? tColor : 'rgba(255,255,255,0.3)' }}>
                            T{t.tier}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: isPast ? 'rgba(16,185,129,0.7)' : isCurrent ? tColor : 'rgba(255,255,255,0.25)' }}>
                            {t.label}
                          </span>
                          {isCurrent && (
                            <span style={{ fontSize: '10px', color: tColor + '99', marginLeft: 'auto', fontStyle: 'italic' }}>← nu</span>
                          )}
                          {isPast && (
                            <span style={{ fontSize: '10px', color: 'rgba(16,185,129,0.5)', marginLeft: 'auto' }}>klar</span>
                          )}
                        </div>
                      </div>
                      {t.reqs.length > 0 && (
                        <div style={{ paddingLeft: '26px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {t.reqs.map((r, j) => {
                            // Check if met for styrka
                            let isMet = isPast
                            if (!isPast && id === 'styrka' && category.perExercise?.length) {
                              const reqLower = r.toLowerCase()
                              const ex = category.perExercise.find(e =>
                                (reqLower.includes('bänk') && e.label === 'Bänk') ||
                                (reqLower.includes('knäböj') && e.label === 'Knäböj') ||
                                (reqLower.includes('mark') && e.label === 'Mark') ||
                                (reqLower.includes('ohp') || reqLower.includes('militär')) && e.label === 'OHP' ||
                                (reqLower.includes('pull') && e.label === 'Pull-up')
                              )
                              if (ex) isMet = ex.tier.tier >= t.tier
                            }
                            return (
                              <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: 4, height: 4, borderRadius: '50%', flexShrink: 0, background: isMet ? '#10b981' : isPast ? 'rgba(16,185,129,0.4)' : isNext ? tColor + '60' : 'rgba(255,255,255,0.12)' }} />
                                <span style={{ fontSize: '12px', lineHeight: 1.4, color: isMet ? 'rgba(16,185,129,0.65)' : isPast ? 'rgba(16,185,129,0.5)' : isCurrent || isNext ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)', textDecoration: isMet || isPast ? 'line-through' : 'none' }}>
                                  {r}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Chart */}
          {chartData && chartData.length > 1 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
                  Historik
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {periods.map(p => (
                    <button key={p} onClick={() => setPeriod(p)} style={{
                      padding: '3px 9px', fontSize: '10px', borderRadius: '6px',
                      background: period === p ? tierColor + '20' : 'transparent',
                      border: '1px solid ' + (period === p ? tierColor + '55' : 'rgba(255,255,255,0.08)'),
                      color: period === p ? tierColor : 'rgba(255,255,255,0.3)',
                      cursor: 'pointer', fontWeight: period === p ? 700 : 400,
                      transition: 'all 0.15s',
                    }}>{p}</button>
                  ))}
                </div>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '12px', padding: '12px',
              }}>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.25)' }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip content={<CustomTooltip tierColor={tierColor} />} />
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
                width: '100%', padding: '12px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                color: 'rgba(255,255,255,0.7)', fontWeight: 500, fontSize: '13px',
                cursor: 'pointer', letterSpacing: '0.02em',
                transition: 'all 0.15s',
                backdropFilter: 'blur(10px)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = tierColor + '18'
                e.currentTarget.style.borderColor = tierColor + '44'
                e.currentTarget.style.color = tierColor
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }}
            >
              Gå till {navLabel} →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
