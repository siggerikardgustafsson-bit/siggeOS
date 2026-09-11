import { Check } from 'lucide-react'
import { TIER_COLORS, CAT_PATHS } from './tierUtils'

const NEXT_TIER_SHORT = {
  kondition: ['—','5km < 28:00','5km < 24:00','5km < 22:00','5km < 20:00','5km < 18:30','5km < 17:00','Top 1% ✓'],
  styrka:    ['—','Bänk ≥ 0.75x BW','Bänk ≥ 1.0x BW','Bänk ≥ 1.15x BW','Bänk ≥ 1.3x BW','Bänk ≥ 1.5x BW','Bänk ≥ 1.65x BW','Top 1% ✓'],
  kropp:     ['—','Logga vikt regelbundet','BMI/fettprocent','Optimal komposition','Elite','Elite','Elite','Elite'],
  plugg:     ['—','Mastery ≥ 20%','Mastery ≥ 40%','Mastery ≥ 60%','Mastery ≥ 80%','Expert ✓','',''],
  ekonomi:   ['—','Netto ≥ 12 000 kr/mån','Netto ≥ 18 000 kr/mån','Netto ≥ 22 000 kr/mån','Netto ≥ 28 000 kr/mån','Netto ≥ 35 000 kr/mån','Netto ≥ 45 000 kr/mån','Top 1% ✓'],
  // Merged Sömn+Hälsa (user call 2026-09-11) — sömn+steg lead the short text;
  // full driver list (+ vikttrend/kosttillskott/alkohol) is in DetailModal.
  halsa:     ['—','Sömn ≥6.5h, steg ≥5000','Sömn ≥7.0h, steg ≥7500','Sömn ≥7.25h, steg ≥9000','Sömn ≥7.5h, steg ≥11000','Sömn ≥8.0h, steg ≥13000','Sömn ≥8.5h, steg ≥15000','Sömn ≥9h, steg ≥18000 ✓'],
  valmående: ['—','Sömn ≥6.5h, steg ≥5000','Sömn ≥7.0h, steg ≥7500','Sömn ≥7.25h, steg ≥9000','Sömn ≥7.5h, steg ≥11000','Sömn ≥8.0h, steg ≥13000','Sömn ≥8.5h, steg ≥15000','Sömn ≥9h, steg ≥18000 ✓'],
  // v2 (user call 2026-09-11): 3 gates for språk (kort+CI+regelbundenhet),
  // 1 for gitarr (regelbundenhet) — tops out at T6 (no T7/T8). Index N =
  // requirement to reach tier N+1 (matches every other row in this object).
  fardigheter:['Börja logga','1000 kort·15h·2/28d','2500 kort·50h·6/28d','4500 kort·150h·10/28d','6500 kort·400h·16/28d','8000 kort·900h·22/28d ✓','',''],
}

function Icon({ id, color, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={CAT_PATHS[id] || CAT_PATHS.kondition} />
    </svg>
  )
}

function Ring({ pct, color, tier, size = 52 }) {
  const r = 22
  const circ = 2 * Math.PI * r
  const offset = circ - (Math.min(pct || 0, 100) / 100) * circ
  const hasData = pct > 0 && tier > 0
  const filterId = 'glow-' + (color || 'none').replace('#', '').replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        {hasData && (
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={color} floodOpacity="0.7" />
            </filter>
          </defs>
        )}
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={circ} strokeDashoffset={hasData ? offset : circ}
          strokeLinecap="round" filter={hasData ? `url(#${filterId})` : undefined}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: hasData ? color : 'var(--muted)', lineHeight: 1 }}>
          {tier > 0 ? 'T' + tier : '—'}
        </span>
      </div>
    </div>
  )
}

export default function CategoryCard({ category, onClick, onMetricClick }) {
  const { id, name, tier, metrics = [], hasData, decayWarning, trend, pct, perExercise } = category
  const tierNum = tier?.tier || 0
  const color = TIER_COLORS[tierNum] || 'var(--accent)'
  const ringPct = pct != null ? pct : 0
  // Prefer the profile-aware target the tier engine already computed
  // (levelUp.blockers / primaryBottleneck) over the static table, which is only
  // correct for the default profile (AUDIT.md P2-11).
  const lu = category.levelUp
  const luReq = lu && lu.currentTier < lu.maxTier
    ? (lu.blockers?.[0]?.targetLabel
        ? `${lu.blockers[0].label} → ${lu.blockers[0].targetLabel}`
        : (lu.primaryBottleneck && !/Inget blockerar/.test(lu.primaryBottleneck) ? lu.primaryBottleneck : null))
    : null
  const nextReq = hasData && tierNum > 0 && tierNum < 8
    ? (luReq || NEXT_TIER_SHORT[id]?.[tierNum] || null)
    : null
  const nextColor = TIER_COLORS[tierNum + 1] || color
  const weakLinks = id === 'styrka' && perExercise?.length
    ? perExercise.filter(e => e.tier.tier <= tierNum)
    : []

  function openCard() { onClick?.(category) }

  function handleMetricClick(e, metric) {
    if (!metric?.evidence) return
    e.preventDefault()
    e.stopPropagation()
    onMetricClick?.({ ...metric.evidence, categoryId: id, categoryName: name, metricLabel: metric.label, metricValue: metric.value })
  }

  return (
    <div onClick={openCard} className="widget cat-card fade-up"
      style={{ padding: 'var(--sp-3)', minHeight: '140px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {hasData && tierNum > 0 && (
        <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: color + '12', filter: 'blur(18px)', pointerEvents: 'none' }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '6px', background: hasData && tierNum > 0 ? color + '18' : 'var(--surface2)', border: '1px solid ' + (hasData && tierNum > 0 ? color + '30' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon id={id} color={hasData && tierNum > 0 ? color : 'var(--muted)'} />
          </div>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{name}</span>
        </div>
        {trend !== 'neutral' && hasData && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: trend === 'up' ? 'var(--green)' : 'var(--red)' }}>{trend === 'up' ? '↑' : '↓'}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
        <Ring pct={ringPct} color={hasData && tierNum > 0 ? color : 'var(--border)'} tier={tierNum} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {/* 4, not 3 (user call 2026-09-12: "syns inte i trädvyn på
                  telefonen" — Färdigheter's 4th skill, Gitarr, was getting cut.
                  Matches the desktop constellation's Satellites cap of 4. */}
              {metrics.slice(0, 4).map((m, i) => {
                const clickable = !!m.evidence && !!onMetricClick
                const RowTag = clickable ? 'button' : 'div'
                return (
                  <RowTag key={i}
                    onClick={clickable ? (e) => handleMetricClick(e, m) : undefined}
                    title={clickable ? 'Öppna pass/källa' : undefined}
                    className={clickable ? 'metric-source-row' : 'metric-plain-row'}>
                    <span className="metric-row-label">
                      {m.label}
                    </span>
                    <span className={clickable ? 'metric-source-value' : undefined} style={{ fontSize: i === 0 ? '12px' : '11px', fontWeight: i === 0 ? 800 : 650, color: m.highlight ? color : 'var(--text)' }}>
                      {m.value}
                    </span>
                  </RowTag>
                )
              })}
            </div>
          ) : (
            <span style={{ fontSize: '11px', color: 'var(--muted)', fontStyle: 'italic' }}>Ingen data</span>
          )}
        </div>
      </div>

      <div style={{ marginTop: '8px', paddingTop: '7px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {tier && hasData ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '20px', background: color + '12', border: '1px solid ' + color + '28' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: '9px', fontWeight: 700, color: color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tier.label}</span>
            </div>
          ) : <span style={{ fontSize: '9px', color: 'var(--muted)' }}>—</span>}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {decayWarning && <span style={{ fontSize: '9px', color: 'var(--amber)' }}>!</span>}
            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>→</span>
          </div>
        </div>

        {id === 'styrka' && weakLinks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {weakLinks.slice(0, 2).map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 7px', borderRadius: '7px', background: nextColor + '08', border: '1px solid ' + nextColor + '20' }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={nextColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                <span style={{ fontSize: '9px', color: nextColor, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.label}: {e.isBW ? `+${Math.round(e.value || 0)}kg` : e.mult ? `${e.mult}x BW` : '—'} (T{e.tier.tier})
                </span>
              </div>
            ))}
          </div>
        ) : nextReq ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 7px', borderRadius: '7px', background: nextColor + '08', border: '1px solid ' + nextColor + '20' }}>
            <Check size={9} color={nextColor} />
            <span style={{ fontSize: '9px', color: nextColor, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nextReq}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
