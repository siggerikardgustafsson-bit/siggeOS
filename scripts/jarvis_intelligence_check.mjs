// Phase 11 verification — run: esbuild --bundle --platform=node --format=esm then node.
// Proves the Jarvis Intelligence Layer CONSUMES the scoring system's outputs and
// that every explanation MATCHES the actual engine output (no invented reasoning,
// no recomputed score). Personas: Student / Fitness / Career.
import {
  getJarvisUserContext, describePersona, reconstructFromSnapshot, loadJarvisContext,
  explainTier, explainBottleneck, whatShouldIImprove, fastestRankUp, coachingRoutes,
  benchmarkStatement, opportunityNarrative, personaStatement, evidenceLevel, buildJarvisContextBlock,
  answerAll,
} from '../src/lib/jarvis/index.js'
import { computeMaxxScoreV2, detectBottlenecksV2, buildWhyThisScore, tierToPercentile } from '../src/lib/maxxScore.js'
import { buildRankUpLayer } from '../src/lib/rankUp.js'
import { weightsForProfile } from '../src/lib/tierProfiles.js'
import { datasetConfidence } from '../src/lib/benchmarks/index.js'
import { buildPersonalizationSummary, calculateTierConfidence, isCategoryFallback, DASH_CATEGORY_MAP } from '../src/lib/profileCompleteness.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

// ── Dashboard-shaped category factory with levelUp (so rank-up gaps are concrete) ──
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

// Mirror what the Dashboard does to produce the authoritative maxxProfile.
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
    tier: { tier: score.tier, label: score.label, color: score.color },
    weightedPercentile: score.weightedPercentile, minTier: score.minTier,
    tierProfile: profileId, scoreVersion: 'v2', bottlenecksV2, rankUp,
    whyThisScore: buildWhyThisScore(score, rankCats, personalization), personalization,
  }
  return { categories, maxxProfile, score, bottlenecksV2, rankUp }
}

// ── Personas (profile rows + their dashboard categories) ──────────────────────
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

console.log('\n── 1. Context builder consumes (does not recompute) the score ──')
const S = authoritative(STUDENT_CATS, 'student', STUDENT_PROFILE)
const sctx = getJarvisUserContext({ profile: STUDENT_PROFILE, categories: S.categories, maxxProfile: S.maxxProfile })
ok('context score == authoritative maxxProfile score (consumed verbatim)',
  sctx.score.tier === S.maxxProfile.tier.tier && sctx.score.weightedPercentile === S.maxxProfile.weightedPercentile)
ok('scoreOwner flagged as the scoring system', sctx.meta.scoreOwner === 'scoring-system')
ok('context bundles profile/persona/completeness/categories/bottlenecks/rankUp',
  !!sctx.profile && !!sctx.persona && !!sctx.completeness && sctx.categories.length === 6 && sctx.bottlenecks.length > 0 && !!sctx.rankUp)
ok('per-category percentile == tierToPercentile (consumed from the tier)',
  sctx.byId.styrka.percentile === tierToPercentile(3))

console.log('\n── 2. Bottleneck analysis matches Bottleneck Engine v2 (task 2) ──')
const eb = explainBottleneck(sctx)
const enginePrimary = sctx.bottlenecks[0]
console.log(`  ${eb.evidenceLabel}: ${eb.answer}`)
ok('explanation names the SAME primary bottleneck as the engine', eb.data.id === enginePrimary.id, `${eb.data.id} vs ${enginePrimary.id}`)
ok('explanation quotes the engine impact number verbatim', eb.data.impact === enginePrimary.impact, `${eb.data.impact}`)
ok('primary-bottleneck wording references the largest Maxx Score increase', /största ökningen av din Maxx Score/.test(eb.answer))

console.log('\n── 3. Rank-up coaching: fastest / biggest / easiest (task 3) ──')
const routes = coachingRoutes(sctx)
const opps = sctx.rankUp.opportunities
console.log(`  fastest=${routes.fastest.name} biggest=${routes.biggest.name} easiest=${routes.easiest.name}`)
ok('biggest == max scoreImpact opportunity', routes.biggest.scoreImpact === Math.max(...opps.map((o) => o.scoreImpact)))
ok('fastest == min estimated-months opportunity', routes.fastest.effort.months === Math.min(...opps.filter((o) => o.effort.months != null).map((o) => o.effort.months)))
ok('easiest == highest in-band progress opportunity', routes.easiest.gap.progressPct === Math.max(...opps.map((o) => o.gap.progressPct ?? 0)))

console.log('\n── 4. Benchmark awareness: percentile + dataset + profile confidence (task 4) ──')
const bsStr = benchmarkStatement(sctx, 'styrka')
console.log(`  ${bsStr.evidenceLabel}: ${bsStr.text}`)
ok('benchmark topPercent == 100 − tier percentile', bsStr.data.topPercent === 100 - tierToPercentile(3))
ok('benchmark statement carries datasetConfidence from the registry', bsStr.data.datasetConfidence === datasetConfidence('strength', 'bench'))
ok('economy benchmark is WEAK (dataset confidence 0.55 < 0.6)', benchmarkStatement(sctx, 'ekonomi').evidence === 'weak')
const F = authoritative(FITNESS_CATS, 'fitness', FITNESS_PROFILE)
const fctx = getJarvisUserContext({ profile: FITNESS_PROFILE, categories: F.categories, maxxProfile: F.maxxProfile })
ok('strength benchmark is STRONG when profile complete + dataset solid', benchmarkStatement(fctx, 'styrka').evidence === 'strong', benchmarkStatement(fctx, 'styrka').evidence)

console.log('\n── 5. Personalization awareness (task 5) ──')
ok('student persona detected', describePersona(STUDENT_PROFILE).id === 'student')
ok('career persona detected', describePersona(CAREER_PROFILE).id === 'career')
ok('fitness persona detected', describePersona(FITNESS_PROFILE).id === 'fitness')
ok('persona does NOT alter the score (weightProfile is advisory only)',
  personaStatement(sctx).data.weightProfile === 'student' && sctx.score.tier === S.maxxProfile.tier.tier)

console.log('\n── 6. Confidence-aware reasoning: fact / strong / weak / speculation (task 6) ──')
ok('measured value → FAKTA', evidenceLevel({ measured: true }).id === 'fact')
ok('behavioural inference → SPEKULATION', evidenceLevel({ inferred: true }).id === 'speculation')
ok('high profile + high dataset → STARK', evidenceLevel({ profileConfidence: 90, datasetConfidence: 0.9 }).id === 'strong')
ok('low dataset confidence → SVAG', evidenceLevel({ profileConfidence: 90, datasetConfidence: 0.5 }).id === 'weak')
ok('fallback usage → SVAG', evidenceLevel({ profileConfidence: 90, datasetConfidence: 0.9, usingFallback: true }).id === 'weak')
ok('persona is SPEKULATION when the profile states nothing', personaStatement(getJarvisUserContext({ profile: null, categories: S.categories, maxxProfile: S.maxxProfile })).evidence === 'speculation')
ok('persona is FAKTA when the profile states life stage / focus', personaStatement(sctx).evidence === 'fact')

console.log('\n── 7. Opportunity narratives (task 7) ──')
const narr = opportunityNarrative(routes.fastest)
console.log(`  ${narr.text}`)
ok('narrative cites the engine gap + tier move + score impact', /T\d+ → T\d+/.test(narr.text) && narr.text.includes(routes.fastest.gap.headlineGap) && narr.text.includes(`+${routes.fastest.scoreImpact}`))
ok('narrative numbers match the opportunity object', narr.data.scoreImpact === routes.fastest.scoreImpact && narr.data.id === routes.fastest.id)

console.log('\n── 8. Explanation tools (task 8) ──')
const et = explainTier(sctx, 'kondition')
const ws = whatShouldIImprove(sctx)
const fr = fastestRankUp(sctx)
ok('"Why am I this tier?" reports the actual tier', et.data.tier === sctx.byId.kondition.tier && /T2/.test(et.answer))
ok('"What should I improve?" == the prioritized top opportunity', ws.data.id === sctx.rankUp.topOpportunity.id)
ok('"What is my fastest rank-up?" == the fastest coaching route', fr.data.id === routes.fastest.id)
const all = answerAll(sctx)
ok('answerAll bundles every tool', all.whyThisTier.length === 6 && !!all.whyBottleneck && !!all.whatToImprove && !!all.fastestRankUp && !!all.persona)

console.log('\n── 9. Per-persona: explanations match engine outputs (task 9) ──')
for (const [name, { profile, profileId, cats }] of Object.entries(PERSONAS)) {
  const A = authoritative(cats, profileId, profile)
  const ctx = getJarvisUserContext({ profile, categories: A.categories, maxxProfile: A.maxxProfile })
  const b = explainBottleneck(ctx)
  const top = whatShouldIImprove(ctx)
  console.log(`  ${name.padEnd(8)} score T${ctx.score.tier} · flaskhals ${b.data.id} (≈+${b.data.impact}) · förbättra ${top.data.id}`)
  ok(`${name}: bottleneck explanation == engine bottleneck[0]`, b.data.id === A.bottlenecksV2[0].id && b.data.impact === A.bottlenecksV2[0].impact)
  ok(`${name}: improve target == rankUp.topOpportunity`, top.data.id === A.rankUp.topOpportunity.id)
  ok(`${name}: context score == authoritative (consumed, not recomputed)`, ctx.score.tier === A.score.tier)
  const block = buildJarvisContextBlock(ctx)
  ok(`${name}: context block is self-labeling and quotes the consumed score`,
    block.includes('[FAKTA]') && block.includes(`T${A.score.tier}`) && /MAXX INTELLIGENS/.test(block))
}

console.log('\n── 10. Snapshot loader: reads persisted tiers, does not recompute them ──')
const snapshot = { date: '2026-06-16', kondition: 2, styrka: 3, plugg: 3, ekonomi: 2, somn: 4, valmående: 3 }
const built = reconstructFromSnapshot(snapshot, STUDENT_PROFILE)
ok('reconstructed category tiers EQUAL the snapshot (read, not recomputed)',
  built.categories.find((c) => c.id === 'styrka').tier.tier === 3 && built.categories.find((c) => c.id === 'halsa').tier.tier === 3)
ok('reconstruct routes through the authoritative score fn', built.maxxProfile.tier.tier === computeMaxxScoreV2(built.categories.filter((c) => !['kropp', 'fardigheter'].includes(c.id)), weightsForProfile('student')).tier)
ok('reconstruct flags itself (analysis object, not the live Dashboard score)', built.maxxProfile.reconstructed === true)
// loadJarvisContext with a mocked supabase + getProfile.
const mockSupabase = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: snapshot }) }) }) }) }) }) }
const loaded = await loadJarvisContext({ supabase: mockSupabase, userId: 'u1', getProfile: async () => STUDENT_PROFILE })
ok('loadJarvisContext returns a full Jarvis context from persisted data', !!loaded && loaded.score.tier === built.maxxProfile.tier.tier && loaded.categories.length === 6)
ok('loadJarvisContext degrades to null on bad input (Jarvis keeps lean context)', (await loadJarvisContext({ supabase: null, userId: null })) === null)

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
