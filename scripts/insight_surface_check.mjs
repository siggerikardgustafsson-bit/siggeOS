// Phase 12 verification — run via: esbuild --bundle --platform=node --format=esm | node
// Proves the Explainability & Insight Surface EXPOSES existing intelligence and
// invents nothing: every value buildCategoryInsight/buildScoreInsight surfaces is
// traced back to an engine output (tier, percentile, confidence, bottleneck impact,
// rank-up plan, opportunity, benchmark registry). Personas: Student / Fitness / Career.
import { getJarvisUserContext } from '../src/lib/jarvis/index.js'
import {
  buildCategoryInsight, buildScoreInsight, jarvisPrompts, evidenceUI,
  profileConfidenceBand, datasetConfidenceBand,
} from '../src/lib/insight.js'
import {
  explainTier, explainBottleneck, benchmarkStatement, coachingRoutes, whatShouldIImprove,
} from '../src/lib/jarvis/reason.js'
import { computeMaxxScoreV2, detectBottlenecksV2, buildWhyThisScore, tierToPercentile } from '../src/lib/maxxScore.js'
import { buildRankUpLayer } from '../src/lib/rankUp.js'
import { weightsForProfile } from '../src/lib/tierProfiles.js'
import { datasetConfidence, getDatasetMeta } from '../src/lib/benchmarks/registry.js'
import { DASH_BENCHMARK } from '../src/lib/jarvis/context.js'
import { buildPersonalizationSummary, calculateTierConfidence, isCategoryFallback, DASH_CATEGORY_MAP } from '../src/lib/profileCompleteness.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

const req = (label, current, target, gapLabel, { higherIsBetter = true, missing = false } = {}) => {
  const met = !missing && (higherIsBetter ? current >= target : current <= target)
  const progress = missing ? 0 : met ? 100 : higherIsBetter ? Math.round((current / target) * 100) : Math.round((target / current) * 100)
  return { label, current: missing ? null : current, target, met, missing, progress: Math.max(0, Math.min(100, progress)), gapLabel: met ? 'Klar' : gapLabel, currentLabel: String(current), targetLabel: String(target) }
}
const cat = (id, name, tier, reqs, decayWarning = false) => ({
  id, name, hasData: true, decayWarning,
  tier: { tier, label: `T${tier}` },
  levelUp: { currentTier: tier, nextTier: Math.min(tier + 1, 8), maxTier: 8, progressPct: Math.min(...reqs.map((r) => r.progress), 100), requirements: reqs, blockers: reqs.filter((r) => !r.met) },
})

function authoritative(categories, profileId, profile) {
  const hasDataMap = {}
  for (const c of categories) {
    const k = DASH_CATEGORY_MAP[c.id]; if (!k) continue
    hasDataMap[k] = true
    c.confidence = calculateTierConfidence(k, profile, true)
    c.usingFallback = isCategoryFallback(k, profile)
    c.percentile = tierToPercentile(c.tier.tier)
  }
  const personalization = buildPersonalizationSummary(profile, hasDataMap)
  const rankCats = categories.filter((c) => !['kropp', 'fardigheter'].includes(c.id))
  const weights = weightsForProfile(profileId)
  const score = computeMaxxScoreV2(rankCats, weights)
  const bottlenecksV2 = detectBottlenecksV2(rankCats, score.tier, weights)
  const rankUp = buildRankUpLayer(rankCats, { profileId, score, bottlenecksV2 })
  const maxxProfile = {
    id: 'maxx', name: 'Maxx Score',
    tier: { tier: score.tier, label: score.label, color: score.color },
    weightedPercentile: score.weightedPercentile, minTier: score.minTier,
    tierProfile: profileId, scoreVersion: 'v2', bottlenecksV2, rankUp,
    whyThisScore: buildWhyThisScore(score, rankCats, personalization), personalization,
  }
  return { categories, maxxProfile, score, bottlenecksV2, rankUp, personalization }
}

const STUDENT_PROFILE = { life_stage: 'student', primary_focus: 'education', sex: 'male', birth_date: '2003-01-01', weight_kg: 75, height_cm: 180, occupation: 'student', country: 'SE' }
const FITNESS_PROFILE = { life_stage: 'professional', primary_focus: 'fitness', sex: 'male', birth_date: '1996-01-01', weight_kg: 82, height_cm: 183, occupation: 'ingenjör', country: 'SE' }
const CAREER_PROFILE = { life_stage: 'professional', primary_focus: 'career', sex: 'male', birth_date: '1992-01-01', weight_kg: 80, height_cm: 181, occupation: 'konsult', country: 'SE' }

const STUDENT_CATS = [
  cat('styrka', 'Styrka', 3, [req('Bänkpress', 78, 90, '+12 kg'), req('Knäböj', 110, 126, '+16 kg'), req('Marklyft', 140, 152, '+12 kg')]),
  cat('kondition', 'Kondition', 2, [req('5 km', 1500, 1320, '3:00 snabbare', { higherIsBetter: false })]),
  cat('somn', 'Sömn', 4, [req('Sömnsnitt 7d', 7.6, 8, '+0.4h')]),
  cat('ekonomi', 'Ekonomi', 2, [req('Sparkapital', 25000, 50000, '+25 000 kr')]),
  cat('halsa', 'Hälsa', 3, [req('Energi', 7, 8, '+1')]),
  cat('plugg', 'Plugg', 3, [req('Mastery snitt', 52, 60, '+8%')]),
]
const FITNESS_CATS = [
  cat('styrka', 'Styrka', 6, [req('Bänkpress', 120, 132, '+12 kg'), req('Knäböj', 170, 182, '+12 kg'), req('Marklyft', 210, 224, '+14 kg')]),
  cat('kondition', 'Kondition', 5, [req('5 km', 1170, 1110, '1:00 snabbare', { higherIsBetter: false })]),
  cat('somn', 'Sömn', 5, [req('Sömnsnitt 7d', 8.2, 8.5, '+0.3h')]),
  cat('ekonomi', 'Ekonomi', 2, [req('Sparkapital', 22000, 50000, '+28 000 kr')]),
  cat('halsa', 'Hälsa', 5, [req('Energi', 8.4, 9, '+0.6')]),
  cat('plugg', 'Plugg', 2, [req('Mastery snitt', 24, 40, '+16%')]),
]
const CAREER_CATS = [
  cat('styrka', 'Styrka', 3, [req('Bänkpress', 80, 92, '+12 kg')], true),
  cat('kondition', 'Kondition', 3, [req('5 km', 1400, 1320, '1:20 snabbare', { higherIsBetter: false })]),
  cat('somn', 'Sömn', 4, [req('Sömnsnitt 7d', 7.7, 8, '+0.3h')]),
  cat('ekonomi', 'Ekonomi', 6, [req('Sparkapital', 250000, 400000, '+150 000 kr')]),
  cat('halsa', 'Hälsa', 4, [req('Energi', 7.5, 8, '+0.5')]),
  cat('plugg', 'Plugg', 5, [req('Mastery snitt', 62, 80, '+18%')]),
]

const PERSONAS = {
  student: { profile: STUDENT_PROFILE, profileId: 'student', cats: STUDENT_CATS },
  fitness: { profile: FITNESS_PROFILE, profileId: 'fitness', cats: FITNESS_CATS },
  career: { profile: CAREER_PROFILE, profileId: 'career', cats: CAREER_CATS },
}

for (const [name, P] of Object.entries(PERSONAS)) {
  console.log(`\n=== Persona: ${name} ===`)
  const A = authoritative(P.cats, P.profileId, P.profile)
  const ctx = getJarvisUserContext({ profile: P.profile, categories: A.categories, maxxProfile: A.maxxProfile })

  // ── Per-category insight is grounded ──
  for (const c of A.categories) {
    const ins = buildCategoryInsight(ctx, c.id)
    const cc = ctx.byId[c.id]
    ok(`${name}/${c.id}: tier consumed (not recomputed)`, ins.tier === c.tier.tier && ins.tier === cc.tier, `ins=${ins.tier} cat=${c.tier.tier}`)
    ok(`${name}/${c.id}: percentile = tierToPercentile`, ins.percentile === tierToPercentile(c.tier.tier))
    ok(`${name}/${c.id}: topPercent = 100 − percentile`, ins.topPercent === Math.max(0, Math.round(100 - ins.percentile)))
    // Why-this-tier text is the engine's, verbatim.
    ok(`${name}/${c.id}: whyTier matches explainTier`, ins.whyTier?.answer === explainTier(ctx, c.id)?.answer)
    // Benchmark statement is the engine's; topPercent agrees.
    const bs = benchmarkStatement(ctx, c.id)
    ok(`${name}/${c.id}: benchmark statement matches`, (ins.benchmark?.text ?? null) === (bs?.text ?? null))
    // Profile confidence READ straight from the projected context (Phase 8).
    // (ctx normalizes undefined→null, so compare against the projection, not the raw cat.)
    ok(`${name}/${c.id}: profile confidence = engine`, ins.confidence.profile.value === cc.profileConfidence)
    // Dataset confidence READ from the registry (Phase 9).
    const metric = DASH_BENCHMARK[c.id]?.metric || null
    const dc = c.id in DASH_BENCHMARK ? datasetConfidence(DASH_BENCHMARK[c.id].category, metric) : null
    ok(`${name}/${c.id}: dataset confidence = registry`, ins.confidence.dataset.value === dc)
    // Benchmark meta resolves to the registry record when a benchmark exists.
    if (c.id in DASH_BENCHMARK) {
      const meta = getDatasetMeta(DASH_BENCHMARK[c.id].category, metric)
      ok(`${name}/${c.id}: benchMeta source = registry`, ins.benchMeta?.source === meta?.source)
    } else {
      ok(`${name}/${c.id}: no benchMeta for non-benchmark cat`, ins.benchMeta == null)
    }
  }

  // ── Bottleneck section appears only for actual bottlenecks, with engine impact ──
  const primary = A.bottlenecksV2[0]
  if (primary) {
    const ins = buildCategoryInsight(ctx, primary.id)
    const eng = explainBottleneck(ctx, primary.id)
    ok(`${name}: primary bottleneck section present`, !!ins.bottleneck)
    ok(`${name}: bottleneck answer matches engine`, ins.bottleneck?.answer === eng?.answer)
    ok(`${name}: bottleneck impact = engine impact`, ins.bottleneck?.data?.impact === eng?.data?.impact)
    // A non-bottleneck category exposes NO bottleneck section.
    const nonB = A.categories.find((c) => !A.bottlenecksV2.some((b) => b.id === c.id))
    if (nonB) ok(`${name}: non-bottleneck (${nonB.id}) has no bottleneck section`, buildCategoryInsight(ctx, nonB.id).bottleneck == null)
  }

  // ── Rank-up plan in the insight equals the rank-up engine's plan ──
  for (const c of A.categories) {
    if (c.tier.tier >= 8) continue
    const ins = buildCategoryInsight(ctx, c.id)
    const plan = A.rankUp.plans.find((p) => p.id === c.id)
    ok(`${name}/${c.id}: plan target = engine`, ins.plan?.targetTier === plan?.targetTier)
    ok(`${name}/${c.id}: plan scoreImpact = engine`, ins.plan?.scoreImpact === plan?.scoreImpact)
    ok(`${name}/${c.id}: plan headlineGap = engine`, ins.plan?.headlineGap === plan?.headlineGap)
  }

  // ── Score-level insight (Opportunity View + confidence) ──
  const si = buildScoreInsight(ctx)
  ok(`${name}: score consumed verbatim`, si.score.tier === A.score.tier && si.score.weightedPercentile === A.score.weightedPercentile)
  const routes = coachingRoutes(ctx)
  ok(`${name}: fastest route = coachingRoutes.fastest`, si.routes.fastest?.id === routes.fastest?.id)
  ok(`${name}: biggest route = coachingRoutes.biggest`, si.routes.biggest?.id === routes.biggest?.id)
  ok(`${name}: easiest route = coachingRoutes.easiest`, si.routes.easiest?.id === routes.easiest?.id)
  // biggest really is the max score-impact opportunity.
  const maxImpact = [...si.opportunities].sort((a, b) => b.scoreImpact - a.scoreImpact)[0]
  ok(`${name}: biggest = max scoreImpact`, si.routes.biggest?.id === maxImpact?.id)
  ok(`${name}: completeness = personalization`, si.confidence.completeness === A.personalization.completeness)
  ok(`${name}: whatToImprove matches engine`, si.whatToImprove?.answer === whatShouldIImprove(ctx)?.answer)

  // ── Jarvis deep-link prompts carry a QUESTION only (no numbers leak) ──
  const cName = A.categories[0].name
  const ps = jarvisPrompts(cName)
  const noDigits = Object.values(ps).every((p) => typeof p === 'string' && !/\d/.test(p))
  ok(`${name}: deep-link prompts are question-only (no numbers)`, noDigits, JSON.stringify(ps.explainBottleneck))
}

// ── Confidence band helpers behave ──
console.log('\n=== Confidence bands ===')
ok('profile band: 90 → Hög', profileConfidenceBand(90).label === 'Hög')
ok('profile band: 60 → Medel', profileConfidenceBand(60).label === 'Medel')
ok('profile band: 30 → Låg', profileConfidenceBand(30).label === 'Låg')
ok('dataset band: 0.9 → Hög', datasetConfidenceBand(0.9).label === 'Hög')
ok('dataset band: null → Intern skala', datasetConfidenceBand(null).label === 'Intern skala')
ok('evidenceUI maps fact → Fakta', evidenceUI({ id: 'fact' }).label === 'Fakta')

// ── Null-safety: no context → no crash, returns null ──
console.log('\n=== Null-safety ===')
ok('buildCategoryInsight(null) → null', buildCategoryInsight(null, 'styrka') === null)
ok('buildScoreInsight(null) → null', buildScoreInsight(null) === null)
ok('buildScoreInsight({}) → null', buildScoreInsight({}) === null)

console.log(`\n${'='.repeat(40)}\n  ${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ''}\n${'='.repeat(40)}`)
process.exit(fail ? 1 : 0)
