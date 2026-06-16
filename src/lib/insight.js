// ============================================================================
// Explainability & Insight Surface (Phase 12) — UI-facing view-model adapter.
// ----------------------------------------------------------------------------
// Phase 12 EXPOSES the intelligence built in Phases 6–11; it builds NO new
// scoring, benchmark or AI system. This module is a thin, PURE adapter that
// turns the already-built Jarvis context (getJarvisUserContext) + reasoning
// tools (reason.js) + Rank Up plans + the benchmark registry into clean view
// models the Dashboard's DetailModal can render.
//
//   ⚠️ Zero new math. Every number here is READ from an engine output:
//     · tier / percentile / profile factors / reason  → tierEngine via whyThisScore
//     · profile confidence                              → profileCompleteness (Phase 8)
//     · dataset confidence / source / coverage          → benchmark registry (Phase 9)
//     · bottleneck impact / effort / next tier          → Bottleneck Engine v2 + Rank Up (10)
//     · rank-up plan / opportunities                     → Rank Up Engine (Phase 10)
//     · evidence level (overall confidence)              → reason.evidenceLevel (Phase 11)
// ============================================================================
import { getDatasetMeta } from './benchmarks/registry'
import { DASH_BENCHMARK } from './jarvis/context'
import {
  explainTier, explainBottleneck, benchmarkStatement, coachingRoutes,
  whatShouldIImprove, fastestRankUp, opportunityNarrative, evidenceLevel, EVIDENCE,
} from './jarvis/reason'

// ── Confidence presentation ────────────────────────────────────────────────
// Maps the engine's evidence level to a UI band (label + color + 0-1 strength).
// The label text is the SAME vocabulary Jarvis uses, so the surfaces agree.
const EVIDENCE_UI = {
  fact: { label: 'Fakta', tone: 'Uppmätt värde', color: '#34d399', strength: 1 },
  strong: { label: 'Stark', tone: 'Väl underbyggd', color: '#4f8ef7', strength: 0.82 },
  weak: { label: 'Preliminär', tone: 'Tunt underlag', color: '#fbbf24', strength: 0.5 },
  speculation: { label: 'Antagande', tone: 'Ej i datan', color: '#f472b6', strength: 0.25 },
}

export function evidenceUI(level) {
  return EVIDENCE_UI[level?.id || level] || EVIDENCE_UI.weak
}

// Qualitative band for a raw 0-100 profile-confidence number (Phase 8).
export function profileConfidenceBand(pct) {
  if (pct == null) return { label: 'Okänd', color: '#6b7280' }
  if (pct >= 80) return { label: 'Hög', color: '#34d399' }
  if (pct >= 55) return { label: 'Medel', color: '#4f8ef7' }
  return { label: 'Låg', color: '#fbbf24' }
}

// Qualitative band for a raw 0-1 dataset-confidence number (Phase 9).
export function datasetConfidenceBand(v) {
  if (v == null) return { label: 'Intern skala', color: '#6b7280' }
  if (v >= 0.8) return { label: 'Hög', color: '#34d399' }
  if (v >= 0.6) return { label: 'Medel', color: '#4f8ef7' }
  return { label: 'Låg', color: '#fbbf24' }
}

// ── Per-category insight (the category DetailModal) ─────────────────────────
/**
 * One bundle for a single rankable category, assembled by consuming the existing
 * engines via the Jarvis context. Returns null when the category isn't in ctx.
 *
 *   whyTier      — explainTier(ctx, id)            (task 1)
 *   benchmark    — benchmarkStatement + registry   (task 1 + 6)
 *   confidence   — profile + dataset + overall      (task 5)
 *   bottleneck   — explainBottleneck(ctx, id)        (task 2; null if not a bottleneck)
 *   plan         — Rank Up plan for this category    (task 3)
 *   opportunity  — Rank Up opportunity narrative      (task 4 — category view)
 */
export function buildCategoryInsight(ctx, categoryId) {
  const c = ctx?.byId?.[categoryId]
  if (!c) return null

  const overall = evidenceLevel({
    profileConfidence: c.profileConfidence,
    datasetConfidence: c.datasetConfidence,
    usingFallback: c.usingFallback,
  })

  const benchMetric = DASH_BENCHMARK[categoryId]?.metric || null
  const benchMeta = c.benchmarkCategory && benchMetric
    ? getDatasetMeta(c.benchmarkCategory, benchMetric)
    : null

  const plan = (ctx?.rankUp?.plans || []).find((p) => p.id === categoryId) || null
  const opp = (ctx?.rankUp?.opportunities || []).find((o) => o.id === categoryId) || null
  // Only surface a bottleneck section when this category actually IS one.
  const isBottleneck = (ctx?.bottlenecks || []).some((b) => b.id === categoryId)

  return {
    id: c.id,
    name: c.name,
    tier: c.tier,
    tierLabel: c.tierLabel,
    percentile: c.percentile,
    topPercent: c.topPercent,
    usingFallback: !!c.usingFallback,
    reason: c.reason,
    factors: c.factors,
    profileConfidence: c.profileConfidence,
    datasetConfidence: c.datasetConfidence,
    composite: c.composite || null, // Phase 14 — Studier formal/skills breakdown (null otherwise)
    whyTier: explainTier(ctx, categoryId),
    benchmark: benchmarkStatement(ctx, categoryId),
    benchMeta, // { source, sourceUrl, coverage, datasetConfidence, provenance, status, notes }
    confidence: {
      overall: { id: overall.id, label: overall.label, ui: evidenceUI(overall) },
      profile: { value: c.profileConfidence, band: profileConfidenceBand(c.profileConfidence) },
      dataset: { value: c.datasetConfidence, band: datasetConfidenceBand(c.datasetConfidence) },
    },
    bottleneck: isBottleneck ? explainBottleneck(ctx, categoryId) : null,
    plan, // { currentTier, targetTier, headlineGap, required[], estimatedMonths, estimateLabel, scoreImpact, ... }
    opportunity: opp ? { ...opp, narrative: opportunityNarrative(opp)?.text || null } : null,
  }
}

// ── Score-level insight (the Maxx Score DetailModal) ────────────────────────
/**
 * The Opportunity View (task 4) + overall confidence (task 5) for the Maxx Score
 * node. fastest / biggest / easiest all come from the SAME Rank Up opportunities
 * (coachingRoutes); the score + completeness are consumed verbatim.
 */
export function buildScoreInsight(ctx) {
  if (!ctx?.score) return null
  const routes = coachingRoutes(ctx)
  const decorate = (o) => (o ? { ...o, narrative: opportunityNarrative(o)?.text || null } : null)
  const completeness = ctx.completeness || null
  // Overall trust for the headline score: the personalization bundle's own
  // overallConfidence (Phase 8) graded into an evidence band.
  const oc = completeness?.overallConfidence
  const overall = evidenceLevel({ profileConfidence: oc != null ? oc * 100 : null })

  return {
    score: ctx.score,
    persona: ctx.persona,
    completeness,
    confidence: {
      overall: { id: overall.id, label: overall.label, ui: evidenceUI(overall) },
      completeness: completeness?.pct ?? null,
      overallConfidence: oc ?? null,
      fallbackCategories: completeness?.fallbackCategories || [],
      missingCritical: completeness?.missingCritical || [],
    },
    routes: {
      fastest: decorate(routes.fastest), // shortest effort path
      biggest: decorate(routes.biggest), // largest Maxx Score gain
      easiest: decorate(routes.easiest), // closest to crossing the next tier
    },
    whatToImprove: whatShouldIImprove(ctx),
    fastestRankUp: fastestRankUp(ctx),
    opportunities: ctx?.rankUp?.opportunities || [],
    gaps: ctx?.rankUp?.gaps || [],
  }
}

// ── Jarvis deep-link prompts (task 8) ───────────────────────────────────────
// Pre-baked questions the explanation surfaces hand to Jarvis. Jarvis already
// holds the grounded MAXX INTELLIGENS context (Phase 11), so we pass the QUESTION
// only — never numbers — and Jarvis answers from the objective systems.
export function jarvisPrompts(categoryName) {
  const n = (categoryName || '').toLowerCase()
  return {
    explainTier: n ? `Förklara varför min ${n} ligger på sin nuvarande tier.` : 'Förklara min Maxx Score.',
    explainBottleneck: n ? `Varför är ${n} en flaskhals för min Maxx Score?` : 'Förklara min främsta flaskhals.',
    explainRankUp: n ? `Vad är snabbaste vägen att ranka upp ${n}?` : 'Vad är min snabbaste rank-up?',
    explainStrength: n ? `Förklara min styrkeranking i ${n}.` : 'Förklara min starkaste kategori.',
  }
}

export { EVIDENCE }
