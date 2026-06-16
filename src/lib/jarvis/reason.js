// ============================================================================
// Jarvis Intelligence Layer v2 (Phase 11) — Reasoning & Explanation tools.
// ----------------------------------------------------------------------------
// Pure functions that turn the Jarvis context (context.js) into GROUNDED,
// confidence-labeled natural language. Every statement is tagged with an
// evidence level so Jarvis distinguishes facts from speculation, and every
// number is traced to an engine output — Jarvis does NOT invent reasoning and
// does NOT calculate scores.
//
// Output language is Swedish (Jarvis + the app speak Swedish); each helper also
// returns the raw `data` it used, so callers/tests can assert against engine
// outputs independently of the prose.
// ============================================================================

// ── Confidence system (task 6) ────────────────────────────────────────────────
// Four levels. FAKTA = a measured value or a tier the user objectively holds.
// STARK/SVAG EVIDENS = engine-derived, graded by profile + dataset confidence.
// SPEKULATION = an inference about behaviour/intent that is NOT in the data.
export const EVIDENCE = {
  fact: { id: 'fact', label: 'FAKTA', rank: 4 },
  strong: { id: 'strong', label: 'STARK EVIDENS', rank: 3 },
  weak: { id: 'weak', label: 'SVAG EVIDENS', rank: 2 },
  speculation: { id: 'speculation', label: 'SPEKULATION', rank: 1 },
}
const TH = { profileStrong: 75, profileWeak: 55, datasetStrong: 0.8, datasetWeak: 0.6 }

/**
 * Grade a derived statement. `measured` short-circuits to FAKTA; `inferred`
 * (a behavioural guess) short-circuits to SPEKULATION. Otherwise profile +
 * dataset confidence (and fallback usage) decide STARK vs SVAG.
 */
export function evidenceLevel({ measured = false, inferred = false, profileConfidence = null, datasetConfidence = null, usingFallback = false } = {}) {
  if (inferred) return EVIDENCE.speculation
  if (measured) return EVIDENCE.fact
  if (usingFallback) return EVIDENCE.weak
  const pBad = profileConfidence != null && profileConfidence < TH.profileWeak
  const dBad = datasetConfidence != null && datasetConfidence < TH.datasetWeak
  if (pBad || dBad) return EVIDENCE.weak
  const pOk = profileConfidence == null || profileConfidence >= TH.profileStrong
  const dOk = datasetConfidence == null || datasetConfidence >= TH.datasetStrong
  return pOk && dOk ? EVIDENCE.strong : EVIDENCE.weak
}

const stmt = (level, text, data = {}) => ({ evidence: level.id, evidenceLabel: level.label, text, data })

// ── Benchmark awareness (task 4) ──────────────────────────────────────────────
/**
 * "Du ligger i topp X% för styrka …" with the right confidence qualifier.
 * Percentile is the population band the tier maps to; dataset + profile
 * confidence decide how strongly Jarvis may phrase the "bland liknande" framing.
 */
export function benchmarkStatement(ctx, categoryId) {
  const c = ctx?.byId?.[categoryId]
  if (!c) return null
  const level = evidenceLevel({ profileConfidence: c.profileConfidence, datasetConfidence: c.datasetConfidence, usingFallback: c.usingFallback })
  const hasBench = c.datasetConfidence != null
  const qualifier = hasBench
    ? level.id === 'strong'
      ? 'bland användare med liknande profil'
      : 'preliminärt (tunt dataunderlag)'
    : 'på den interna skalan'
  return stmt(level, `Du ligger i topp ${c.topPercent}% för ${c.name.toLowerCase()} ${qualifier} (T${c.tier}, percentil ${c.percentile}).`, {
    categoryId,
    tier: c.tier,
    percentile: c.percentile,
    topPercent: c.topPercent,
    datasetConfidence: c.datasetConfidence,
    profileConfidence: c.profileConfidence,
  })
}

// ── Explanation tools (task 8) ────────────────────────────────────────────────
// "Why am I this tier?" — the tier itself is FAKTA; the personalised reasoning
// is STARK/SVAG by confidence (SVAG when running on fallback thresholds).
export function explainTier(ctx, categoryId) {
  const c = ctx?.byId?.[categoryId]
  if (!c) return null
  const level = evidenceLevel({ profileConfidence: c.profileConfidence, usingFallback: c.usingFallback })
  const base = `Din ${c.name.toLowerCase()} är T${c.tier} (${c.tierLabel}) — percentil ${c.percentile}.`
  const detail = c.reason
    ? ` ${c.reason}`
    : c.usingFallback
      ? ' Beräknad på standardtrösklar (profildata saknas för full personalisering).'
      : ''
  return {
    question: 'Varför är jag denna tier?',
    answer: base + detail,
    evidence: level.id,
    evidenceLabel: level.label,
    data: { categoryId, tier: c.tier, percentile: c.percentile, usingFallback: c.usingFallback, profileConfidence: c.profileConfidence, factors: c.factors },
  }
}

/**
 * "Why is this a bottleneck?" (task 2) — grounded in the Bottleneck Engine v2
 * output. Names the engine's primary bottleneck and its impact; never invents
 * a different reason. Pass a categoryId to explain a specific one.
 */
export function explainBottleneck(ctx, categoryId = null) {
  const list = ctx?.bottlenecks || []
  if (!list.length) return null
  const b = categoryId ? list.find((x) => x.id === categoryId) : list[0]
  if (!b) return null
  const isPrimary = list[0]?.id === b.id
  const c = ctx?.byId?.[b.id]
  const level = evidenceLevel({ profileConfidence: c?.profileConfidence, usingFallback: c?.usingFallback })
  const effort = b.effort?.label ? `, uppskattad insats: ${b.effort.label.toLowerCase()}${b.effort.months ? ` (~${Math.round(b.effort.months)} mån)` : ''}` : ''
  const why = isPrimary
    ? `${b.name} är din främsta flaskhals eftersom en höjning med en tier skulle ge den största ökningen av din Maxx Score (≈ +${b.impact} poäng)${effort}.`
    : `${b.name} håller tillbaka din Maxx Score: en tier upp ger ≈ +${b.impact} poäng (${b.opportunity})${effort}.`
  return {
    question: 'Varför är detta en flaskhals?',
    answer: why,
    evidence: level.id,
    evidenceLabel: level.label,
    data: { id: b.id, impact: b.impact, opportunity: b.opportunity, nextTier: b.nextTier, isPrimary, effortMonths: b.effort?.months ?? null },
  }
}

// "What should I improve?" — the top prioritized opportunity (already ranked by
// the rank-up profile). Grounded; no arbitrary advice.
export function whatShouldIImprove(ctx) {
  const top = ctx?.rankUp?.topOpportunity
  if (!top) return null
  const c = ctx?.byId?.[top.id]
  const level = evidenceLevel({ profileConfidence: c?.profileConfidence, usingFallback: c?.usingFallback })
  return {
    question: 'Vad borde jag förbättra?',
    answer: `Fokusera på ${top.name.toLowerCase()}: ${top.gap.headlineGap} tar dig från T${top.currentTier} till T${top.nextTier} och ger ≈ +${top.scoreImpact} poäng (${top.effort.label.toLowerCase()}, ${estimateText(top.effort)}).`,
    evidence: level.id,
    evidenceLabel: level.label,
    data: { id: top.id, scoreImpact: top.scoreImpact, headlineGap: top.gap.headlineGap, effortMonths: top.effort?.months ?? null },
  }
}

// "What is my fastest rank-up?" — from buildHowToImprove's headline.
export function fastestRankUp(ctx) {
  const how = ctx?.rankUp?.howToImprove
  const opps = ctx?.rankUp?.opportunities || []
  if (!opps.length) return null
  const fastest = coachingRoutes(ctx).fastest
  const c = ctx?.byId?.[fastest.id]
  const level = evidenceLevel({ profileConfidence: c?.profileConfidence, usingFallback: c?.usingFallback })
  return {
    question: 'Vad är min snabbaste rank-up?',
    answer: opportunityNarrative(fastest).text,
    evidence: level.id,
    evidenceLabel: level.label,
    data: { id: fastest.id, fastestPath: how?.headline?.fastestPath ?? null, effortMonths: fastest.effort?.months ?? null, scoreImpact: fastest.scoreImpact },
  }
}

// ── Rank-up coaching (task 3) — fastest / biggest / easiest ────────────────────
// All three are derived from the SAME Rank Up opportunities; no new advice.
export function coachingRoutes(ctx) {
  const opps = (ctx?.rankUp?.opportunities || []).filter((o) => o && o.effort)
  if (!opps.length) return { fastest: null, biggest: null, easiest: null }
  const withMonths = opps.filter((o) => o.effort.months != null)
  const fastest = (withMonths.length ? withMonths : opps).reduce((a, b) => ((b.effort.months ?? Infinity) < (a.effort.months ?? Infinity) ? b : a))
  const biggest = opps.reduce((a, b) => (b.scoreImpact > a.scoreImpact ? b : a))
  // easiest = closest to crossing the next-tier line (highest progress in the band).
  const easiest = opps.reduce((a, b) => ((b.gap?.progressPct ?? 0) > (a.gap?.progressPct ?? 0) ? b : a))
  return { fastest, biggest, easiest }
}

// ── Opportunity narratives (task 7) ────────────────────────────────────────────
// "Din snabbaste väg … är att förbättra kondition en tier. Utifrån din nuvarande
//  lucka kräver det ungefär tre minuter på 5 km."
export function opportunityNarrative(opp) {
  if (!opp) return null
  const c = opp // opportunity carries gap + effort + impact
  const time = estimateText(c.effort)
  return {
    text: `Din snabbaste väg till högre Maxx Score är att höja ${c.name.toLowerCase()} en tier (T${c.currentTier} → T${c.nextTier}). Utifrån din nuvarande lucka (${c.gap.headlineGap}) tar det ${time} och ger ≈ +${c.scoreImpact} poäng.`,
    data: { id: c.id, currentTier: c.currentTier, nextTier: c.nextTier, headlineGap: c.gap.headlineGap, scoreImpact: c.scoreImpact, effortMonths: c.effort?.months ?? null },
  }
}

function estimateText(effort) {
  if (!effort || effort.months == null) return 'tid okänd (logga data först)'
  const m = effort.months
  if (m < 1) return 'ungefär några veckor'
  if (m < 1.5) return 'ungefär en månad'
  return `ungefär ${Math.round(m)} månader`
}

// ── Personalization awareness (task 5) ─────────────────────────────────────────
export function personaStatement(ctx) {
  const p = ctx?.persona
  if (!p) return null
  // A persona is a FAKTA framing only when the profile actually states it; else it's inferred.
  const stated = !!(p.lifeStage || p.primaryFocus)
  const level = stated ? EVIDENCE.fact : EVIDENCE.speculation
  return stmt(level, `Profil: ${p.label}${p.lifeStage ? ` (${p.lifeStage})` : ''}. Viktningen följer "${p.weightProfile}" — påverkar prioritering, inte poängberäkningen.`, {
    persona: p.id,
    weightProfile: p.weightProfile,
    stated,
  })
}

// ── Grounded context block for the LLM ────────────────────────────────────────
// A compact, SELF-LABELING text block appended to Jarvis's context string. It
// flows through the existing `context` param (no edge-function change needed);
// the [FAKTA]/[STARK]/[SVAG]/[SPEKULATION] tags teach the model how strongly to
// phrase each line.
const TAG = { fact: '[FAKTA]', strong: '[STARK]', weak: '[SVAG]', speculation: '[SPEKULATION]' }
export function buildJarvisContextBlock(ctx) {
  if (!ctx?.score) return ''
  const lines = []
  lines.push('— MAXX INTELLIGENS (objektiva system äger poängen; analysera, beräkna ej) —')
  lines.push(`${TAG.fact} Maxx Score: T${ctx.score.tier} (${ctx.score.label}), viktad percentil ${ctx.score.weightedPercentile}, svagaste länk T${ctx.score.minTier}.`)
  const persona = personaStatement(ctx)
  if (persona) lines.push(`${TAG[persona.evidence]} ${persona.text}`)
  if (ctx.completeness) {
    lines.push(`${TAG.fact} Profilkomplett: ${ctx.completeness.pct}% (${ctx.completeness.status}), konfidens ${ctx.completeness.overallConfidence}.` +
      (ctx.completeness.missingCritical.length ? ` Saknas: ${ctx.completeness.missingCritical.join(', ')}.` : ''))
  }
  lines.push('TIERS:')
  for (const c of ctx.categories) {
    const bs = benchmarkStatement(ctx, c.id)
    lines.push(`  ${bs ? TAG[bs.evidence] : TAG.fact} ${c.name}: T${c.tier} (${c.tierLabel}), topp ${c.topPercent}%` +
      (c.usingFallback ? ' [fallback]' : '') + (c.profileConfidence != null ? `, profilkonf ${c.profileConfidence}` : ''))
  }
  const bn = explainBottleneck(ctx)
  if (bn) lines.push(`${TAG[bn.evidence]} FLASKHALS: ${bn.answer}`)
  const fast = fastestRankUp(ctx)
  if (fast) lines.push(`${TAG[fast.evidence]} SNABBASTE RANK-UP: ${fast.answer}`)
  const routes = coachingRoutes(ctx)
  if (routes.biggest) lines.push(`${TAG.strong} STÖRSTA POÄNGLYFT: ${routes.biggest.name} (≈ +${routes.biggest.scoreImpact} poäng).`)
  return lines.join('\n')
}

// ── One-call bundle: every explanation tool answered at once ───────────────────
export function answerAll(ctx) {
  return {
    whyThisTier: ctx.categories.map((c) => explainTier(ctx, c.id)),
    whyBottleneck: explainBottleneck(ctx),
    whatToImprove: whatShouldIImprove(ctx),
    fastestRankUp: fastestRankUp(ctx),
    coaching: coachingRoutes(ctx),
    persona: personaStatement(ctx),
  }
}
