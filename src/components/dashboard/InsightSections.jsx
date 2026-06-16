// ============================================================================
// Explainability & Insight Surface (Phase 12) — DetailModal sections.
// ----------------------------------------------------------------------------
// Renders the EXISTING intelligence (tier reasoning, bottleneck, rank-up plan,
// opportunities, confidence, benchmark source) inside the existing DetailModal,
// in its existing visual language. No new engine — every value comes from
// insight.js, which consumes the Phase 6–11 engines. If no insight context is
// supplied, the component renders nothing (the modal is unchanged).
// ============================================================================
import { useState } from 'react'
import { Sparkles, Target, Zap, TrendingUp, ShieldCheck, BookOpen, ChevronDown, MessageCircle } from 'lucide-react'
import { buildCategoryInsight, buildScoreInsight, jarvisPrompts } from '../../lib/insight'

function SectionLabel({ children, color, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 11 }}>
      <span style={{ width: 3, height: 13, borderRadius: 2, background: color, boxShadow: `0 0 8px ${color}` }} />
      {icon}
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', color: 'var(--muted)', textTransform: 'uppercase' }}>{children}</span>
    </div>
  )
}

// A small evidence/confidence chip ("Stark", "Preliminär", …) used everywhere.
function EvidenceChip({ ui, small }) {
  if (!ui) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: small ? '2px 7px' : '3px 9px', borderRadius: 999, background: ui.color + '1c', border: '1px solid ' + ui.color + '44', flexShrink: 0 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: ui.color, boxShadow: `0 0 6px ${ui.color}` }} />
      <span style={{ fontSize: small ? 9.5 : 10.5, fontWeight: 800, color: ui.color, letterSpacing: '0.02em' }}>{ui.label}</span>
    </span>
  )
}

function Bar({ value, color, height = 7 }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div style={{ height, borderRadius: 999, background: 'var(--surface2)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', borderRadius: 999, background: color, boxShadow: `0 0 10px ${color}88` }} />
    </div>
  )
}

function Card({ children, style }) {
  return <div style={{ padding: 13, borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', ...style }}>{children}</div>
}

// Jarvis deep-link button — passes a QUESTION only (Phase 11 supplies the data).
function JarvisLink({ label, prompt, onAskJarvis, color = 'var(--accent)' }) {
  if (!onAskJarvis) return null
  return (
    <button onClick={() => onAskJarvis(prompt)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 11,
      background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer',
      fontSize: 12, fontWeight: 700, fontFamily: 'inherit', transition: 'background .15s, border-color .15s, transform .15s',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}>
      <MessageCircle size={13} color={color} />
      {label}
    </button>
  )
}

// ── Per-category insight (Why This Tier · Bottleneck · Rank Up · Confidence · Benchmark)
function CategoryInsight({ insight, color, onAskJarvis }) {
  const [showBench, setShowBench] = useState(false)
  const prompts = jarvisPrompts(insight.name)
  const conf = insight.confidence
  const bm = insight.benchMeta

  return (
    <>
      {/* WHY THIS TIER (task 1) */}
      <div className="dm-section">
        <SectionLabel color={color} icon={<Sparkles size={12} color={color} />}>Varför denna tier?</SectionLabel>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700, lineHeight: 1.5 }}>{insight.whyTier?.answer || `T${insight.tier} — percentil ${insight.percentile}.`}</div>
            <EvidenceChip ui={conf.overall.ui} small />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--muted2)', padding: '4px 9px', borderRadius: 8, background: 'var(--surface3)', fontWeight: 700 }}>Topp {insight.topPercent}%</span>
            <span style={{ fontSize: 11, color: 'var(--muted2)', padding: '4px 9px', borderRadius: 8, background: 'var(--surface3)', fontWeight: 700 }}>Percentil {insight.percentile}</span>
            {insight.usingFallback && <span style={{ fontSize: 11, color: '#fbbf24', padding: '4px 9px', borderRadius: 8, background: '#fbbf2415', fontWeight: 700 }}>Standardtrösklar</span>}
          </div>
          {insight.composite && (
            <div style={{ marginTop: 11 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 7 }}>Sammansättning</div>
              <div style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.5, marginBottom: 9 }}>{insight.composite.summary}</div>
              {insight.composite.weights.formal > 0 && (
                <CompositePart label="Formella studier" tierVal={insight.composite.parts.formal.tier} weight={insight.composite.weights.formal} color={color} />
              )}
              {insight.composite.weights.skills > 0 && (
                <CompositePart label="Färdigheter" tierVal={insight.composite.parts.skills.tier} weight={insight.composite.weights.skills} color="#a78bfa" />
              )}
            </div>
          )}
          {Array.isArray(insight.factors) && insight.factors.length > 0 && (
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Profilfaktorer</div>
              {insight.factors.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--muted2)', display: 'flex', gap: 7 }}>
                  <span style={{ color }}>•</span><span>{typeof f === 'string' ? f : (f.label || f.factor || JSON.stringify(f))}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* CONFIDENCE SURFACE (task 5) */}
      <div className="dm-section">
        <SectionLabel color={color} icon={<ShieldCheck size={12} color={color} />}>Hur säker är rankingen?</SectionLabel>
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--muted2)', fontWeight: 700 }}>Profilkonfidens <span style={{ color: 'var(--muted)' }}>(dina inputs)</span></span>
                <span style={{ fontSize: 12, fontWeight: 800, color: conf.profile.band.color }}>{conf.profile.value != null ? conf.profile.value + '%' : '—'} · {conf.profile.band.label}</span>
              </div>
              <Bar value={conf.profile.value ?? 0} color={conf.profile.band.color} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: 'var(--muted2)', fontWeight: 700 }}>Datakonfidens <span style={{ color: 'var(--muted)' }}>(benchmark)</span></span>
                <span style={{ fontSize: 12, fontWeight: 800, color: conf.dataset.band.color }}>{conf.dataset.value != null ? Math.round(conf.dataset.value * 100) + '%' : 'Intern'} · {conf.dataset.band.label}</span>
              </div>
              <Bar value={conf.dataset.value != null ? conf.dataset.value * 100 : 0} color={conf.dataset.band.color} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: 12, color: 'var(--muted2)', fontWeight: 700 }}>Sammanvägd evidens</span>
              <EvidenceChip ui={conf.overall.ui} />
            </div>
          </div>
        </Card>
      </div>

      {/* BOTTLENECK (task 2) — only when this category is a bottleneck */}
      {insight.bottleneck && (
        <div className="dm-section">
          <SectionLabel color="#fbbf24" icon={<Target size={12} color="#fbbf24" />}>Flaskhals</SectionLabel>
          <Card style={{ background: '#fbbf2410', border: '1px solid #fbbf2433' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.5 }}>{insight.bottleneck.answer}</div>
              <EvidenceChip ui={conf.overall.ui} small />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
              {insight.bottleneck.data?.impact != null && <Stat label="Poänglyft" value={`+${insight.bottleneck.data.impact}`} color="#fbbf24" />}
              {insight.bottleneck.data?.nextTier != null && <Stat label="Nästa tier" value={`T${insight.bottleneck.data.nextTier}`} color="#fbbf24" />}
              {insight.bottleneck.data?.effortMonths != null && <Stat label="Insats" value={`~${Math.round(insight.bottleneck.data.effortMonths)} mån`} color="#fbbf24" />}
            </div>
          </Card>
        </div>
      )}

      {/* RANK UP (task 3) */}
      {insight.plan && !insight.plan.atMax && (
        <div className="dm-section">
          <SectionLabel color={insight.plan.color} icon={<TrendingUp size={12} color={insight.plan.color} />}>Rank up-plan</SectionLabel>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--muted2)' }}>T{insight.plan.currentTier}</span>
              <span style={{ flex: 1, height: 2, background: `linear-gradient(90deg, var(--border), ${insight.plan.color})` }} />
              <span style={{ fontSize: 13, fontWeight: 900, color: insight.plan.color }}>T{insight.plan.targetTier}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: insight.plan.required?.length ? 12 : 0 }}>
              <Stat label="Gap" value={insight.plan.headlineGap} color={insight.plan.color} />
              {insight.plan.scoreImpact != null && <Stat label="Poänglyft" value={`+${insight.plan.scoreImpact}`} color={insight.plan.color} />}
              <Stat label="Tid" value={insight.plan.estimateLabel} color={insight.plan.color} />
            </div>
            {insight.plan.required?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {insight.plan.required.map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '8px 11px', borderRadius: 10, background: 'var(--surface3)' }}>
                    <span style={{ color: 'var(--muted2)', fontWeight: 600 }}>{r.step}</span>
                    {r.targetLabel && <span style={{ color: insight.plan.color, fontWeight: 800, whiteSpace: 'nowrap' }}>{r.targetLabel}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* BENCHMARK TRANSPARENCY (task 6) */}
      {bm && (
        <div className="dm-section">
          <button onClick={() => setShowBench((v) => !v)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: 13, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <BookOpen size={13} color="var(--muted)" />
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Benchmark-källa</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <EvidenceChip ui={insight.confidence.dataset.band.color ? { label: insight.confidence.dataset.band.label, color: insight.confidence.dataset.band.color } : null} small />
              <ChevronDown size={16} color="var(--muted)" style={{ transform: showBench ? 'rotate(180deg)' : 'none', transition: 'transform .25s' }} />
            </span>
          </button>
          {showBench && (
            <Card style={{ marginTop: 9 }}>
              <Row label="Källa" value={bm.source} />
              {bm.publishedDate && <Row label="Publicerad" value={bm.publishedDate} />}
              <Row label="Datakonfidens" value={`${Math.round((bm.datasetConfidence ?? 0) * 100)}%`} valueColor={insight.confidence.dataset.band.color} />
              <Row label="Härkomst" value={PROVENANCE[bm.provenance] || bm.provenance} />
              {bm.coverage && <Row label="Täckning" value={coverageText(bm.coverage)} />}
              {bm.notes && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 9, lineHeight: 1.5, fontStyle: 'italic' }}>{bm.notes}</div>}
            </Card>
          )}
        </div>
      )}

      {/* JARVIS DEEP LINKS (task 8) */}
      {onAskJarvis && (
        <div className="dm-section">
          <SectionLabel color="var(--accent)" icon={<MessageCircle size={12} color="var(--accent)" />}>Fråga Jarvis</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <JarvisLink label="Förklara denna tier" prompt={prompts.explainTier} onAskJarvis={onAskJarvis} />
            {insight.bottleneck && <JarvisLink label="Förklara flaskhalsen" prompt={prompts.explainBottleneck} onAskJarvis={onAskJarvis} />}
            {insight.plan && !insight.plan.atMax && <JarvisLink label="Snabbaste rank-up" prompt={prompts.explainRankUp} onAskJarvis={onAskJarvis} />}
          </div>
        </div>
      )}
    </>
  )
}

// ── Score-level insight (Opportunity View + overall confidence on the Maxx node)
function ScoreInsight({ insight, color, onAskJarvis }) {
  const prompts = jarvisPrompts(null)
  const r = insight.routes
  const conf = insight.confidence

  const OppCard = ({ tag, tagColor, opp, icon }) => {
    if (!opp) return null
    return (
      <Card style={{ background: tagColor + '0e', border: '1px solid ' + tagColor + '2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
          {icon}
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: tagColor }}>{tag}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: 'var(--text)' }}>{opp.name}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted2)', lineHeight: 1.5 }}>{opp.narrative || opp.summary}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
          <Stat label="Poänglyft" value={`+${opp.scoreImpact}`} color={tagColor} />
          {opp.effort?.label && <Stat label="Insats" value={opp.effort.label} color={tagColor} />}
          <Stat label="Gap" value={opp.gap?.headlineGap} color={tagColor} />
        </div>
      </Card>
    )
  }

  return (
    <>
      {/* OPPORTUNITY VIEW (task 4) */}
      {(r.fastest || r.biggest || r.easiest) && (
        <div className="dm-section">
          <SectionLabel color={color} icon={<TrendingUp size={12} color={color} />}>Möjligheter — så höjer du Maxx Score</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <OppCard tag="Snabbast" tagColor="#34d399" opp={r.fastest} icon={<Zap size={13} color="#34d399" />} />
            <OppCard tag="Störst lyft" tagColor="#4f8ef7" opp={r.biggest} icon={<TrendingUp size={13} color="#4f8ef7" />} />
            <OppCard tag="Närmast" tagColor="#a78bfa" opp={r.easiest} icon={<Target size={13} color="#a78bfa" />} />
          </div>
        </div>
      )}

      {/* CONFIDENCE SURFACE (task 5) — overall trust for the headline score */}
      {conf.completeness != null && (
        <div className="dm-section">
          <SectionLabel color={color} icon={<ShieldCheck size={12} color={color} />}>Hur tillförlitlig är poängen?</SectionLabel>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--muted2)', fontWeight: 700 }}>Profilkomplett: <b style={{ color: 'var(--text)' }}>{conf.completeness}%</b></span>
              <EvidenceChip ui={conf.overall.ui} />
            </div>
            <Bar value={conf.completeness} color={conf.overall.ui.color} />
            {conf.fallbackCategories?.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                Standardtrösklar (profildata saknas): <b style={{ color: '#fbbf24' }}>{conf.fallbackCategories.join(', ')}</b>
              </div>
            )}
            {conf.missingCritical?.length > 0 && (
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                Saknas för full säkerhet: {conf.missingCritical.join(', ')}.
              </div>
            )}
          </Card>
        </div>
      )}

      {/* JARVIS DEEP LINKS (task 8) */}
      {onAskJarvis && (
        <div className="dm-section">
          <SectionLabel color="var(--accent)" icon={<MessageCircle size={12} color="var(--accent)" />}>Fråga Jarvis</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <JarvisLink label="Förklara min Maxx Score" prompt={prompts.explainTier} onAskJarvis={onAskJarvis} />
            <JarvisLink label="Förklara min flaskhals" prompt={prompts.explainBottleneck} onAskJarvis={onAskJarvis} />
            <JarvisLink label="Min snabbaste rank-up" prompt={prompts.explainRankUp} onAskJarvis={onAskJarvis} />
          </div>
        </div>
      )}
    </>
  )
}

// Phase 14 — one row of the Studier composition (formal vs skills, weight + tier).
function CompositePart({ label, tierVal, weight, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      <span style={{ fontSize: 12, color: 'var(--muted2)', fontWeight: 700, minWidth: 118 }}>{label}</span>
      <div style={{ flex: 1 }}><Bar value={weight} color={color} height={6} /></div>
      <span style={{ fontSize: 11, fontWeight: 800, color, whiteSpace: 'nowrap' }}>{weight}% · {tierVal != null ? `T${tierVal}` : '—'}</span>
    </div>
  )
}

function Stat({ label, value, color }) {
  if (value == null) return null
  return (
    <div style={{ padding: '6px 10px', borderRadius: 9, background: 'var(--surface3)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 9.5, color: 'var(--muted)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, color, fontWeight: 900, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function Row({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--muted2)', fontSize: 12 }}>{label}</span>
      <span style={{ color: valueColor || 'var(--text)', fontSize: 12, fontWeight: 700, textAlign: 'right', overflowWrap: 'anywhere' }}>{value || '—'}</span>
    </div>
  )
}

const PROVENANCE = {
  reference: 'Publicerade referensvärden',
  'seed-from-thresholds': 'Härlett från appens trösklar',
  imported: 'Importerad dataset',
}
function coverageText(cov) {
  const parts = []
  if (cov.country) parts.push(cov.country.join('/'))
  if (cov.sex) parts.push(cov.sex.join(', '))
  if (cov.age) parts.push(cov.age.join(', '))
  return parts.join(' · ')
}

/**
 * The Phase 12 insight block for the DetailModal. Renders nothing unless an
 * insight context (the Jarvis projection) is supplied — so the modal degrades
 * gracefully to its pre-Phase-12 form.
 */
export default function InsightSections({ category, ctx, onAskJarvis }) {
  if (!category || !ctx) return null
  const color = category.tier?.color || 'var(--accent)'

  if (category.id === 'maxx') {
    const insight = buildScoreInsight(ctx)
    if (!insight) return null
    return <ScoreInsight insight={insight} color={color} onAskJarvis={onAskJarvis} />
  }

  const insight = buildCategoryInsight(ctx, category.id)
  if (!insight) return null
  return <CategoryInsight insight={insight} color={color} onAskJarvis={onAskJarvis} />
}
