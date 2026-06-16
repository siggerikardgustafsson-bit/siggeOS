// Phase 10 verification — run: esbuild --bundle --platform=node --format=esm then node.
// Demonstrates the Rank Up action layer across a Student, Fitness and Career
// profile: rank gaps, score-impact estimation, opportunity ranking, rank-up
// plans, the three rank-up profiles, bottleneck enrichment and how-to-improve.
import {
  computeRankGap, estimateScoreImpact, buildOpportunities, buildRankUpPlan,
  enrichBottlenecks, buildHowToImprove, buildRankUpLayer, estimateEffort,
  prioritizeOpportunities, RANK_UP_PROFILES,
} from '../src/lib/rankUp.js'
import { computeMaxxScoreV2, detectBottlenecksV2 } from '../src/lib/maxxScore.js'
import { weightsForProfile } from '../src/lib/tierProfiles.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }
const round2 = (x) => Math.round(x * 100) / 100

// ── Dashboard-shaped category factory (mirrors makeReq / makeLevelUp output) ──
const req = (label, current, target, gapLabel, { higherIsBetter = true, missing = false } = {}) => {
  const met = !missing && (higherIsBetter ? current >= target : current <= target)
  const progress = missing ? 0 : met ? 100 : higherIsBetter ? Math.round((current / target) * 100) : Math.round((target / current) * 100)
  return { label, current: missing ? null : current, target, met, missing, progress: Math.max(0, Math.min(100, progress)), gapLabel: met ? 'Klar' : gapLabel, currentLabel: String(current), targetLabel: String(target) }
}
const cat = (id, name, tier, reqs, decayWarning = false) => {
  const blockers = reqs.filter((r) => !r.met)
  const progressPct = Math.min(...reqs.map((r) => r.progress), 100)
  return {
    id, name, hasData: true, decayWarning,
    tier: { tier, label: `T${tier}` },
    levelUp: { currentTier: tier, nextTier: Math.min(tier + 1, 8), maxTier: 8, progressPct, requirements: reqs, blockers },
  }
}

// Shared lift/economy requirements with realistic gaps (the task's examples).
const benchReq = (cur, tgt) => req('Bänkpress', cur, tgt, `+${tgt - cur} kg`)
const econReq = (label, cur, tgt) => req(label, cur, tgt, `+${(tgt - cur).toLocaleString('sv-SE')} kr`)

// ── Three personas ───────────────────────────────────────────────────────────
const STUDENT = [
  cat('styrka', 'Styrka', 3, [benchReq(78, 90), req('Knäböj', 110, 126, '+16 kg'), req('Marklyft', 140, 152, '+12 kg')]),
  cat('kondition', 'Kondition', 2, [req('5 km', 1500, 1320, '3:00 snabbare', { higherIsBetter: false })]),
  cat('somn', 'Sömn', 4, [req('Sömnsnitt 7d', 7.6, 8, '+0.4h')]),
  cat('ekonomi', 'Ekonomi', 2, [econReq('Sparkapital', 25000, 50000), econReq('Månadsnetto', 14000, 18000)]),
  cat('halsa', 'Hälsa', 3, [req('Energi', 7, 8, '+1')]),
  cat('plugg', 'Plugg', 3, [req('Mastery snitt', 52, 60, '+8%')]),
]
const FITNESS = [
  cat('styrka', 'Styrka', 6, [benchReq(120, 132), req('Knäböj', 170, 182, '+12 kg'), req('Marklyft', 210, 224, '+14 kg')]),
  cat('kondition', 'Kondition', 5, [req('5 km', 1170, 1110, '1:00 snabbare', { higherIsBetter: false })]),
  cat('somn', 'Sömn', 5, [req('Sömnsnitt 7d', 8.2, 8.5, '+0.3h')]),
  cat('ekonomi', 'Ekonomi', 2, [econReq('Sparkapital', 22000, 50000)]),
  cat('halsa', 'Hälsa', 5, [req('Energi', 8.4, 9, '+0.6')]),
  cat('plugg', 'Plugg', 2, [req('Mastery snitt', 24, 40, '+16%')]),
]
const CAREER = [
  cat('styrka', 'Styrka', 3, [benchReq(80, 92), req('Knäböj', 112, 128, '+16 kg'), req('Marklyft', 145, 158, '+13 kg')], true),
  cat('kondition', 'Kondition', 3, [req('5 km', 1400, 1320, '1:20 snabbare', { higherIsBetter: false })]),
  cat('somn', 'Sömn', 4, [req('Sömnsnitt 7d', 7.7, 8, '+0.3h')]),
  cat('ekonomi', 'Ekonomi', 6, [econReq('Sparkapital', 250000, 400000), econReq('Månadsnetto', 38000, 45000)]),
  cat('halsa', 'Hälsa', 4, [req('Energi', 7.5, 8, '+0.5')]),
  cat('plugg', 'Plugg', 5, [req('Mastery snitt', 62, 80, '+18%')]),
]

const PERSONAS = { student: STUDENT, fitness: FITNESS, career: CAREER }

console.log('\n── 1. Rank Gap Engine (task 1) ──')
const benchGap = computeRankGap(STUDENT[0])
console.log(`  Styrka  current ${benchGap.currentLabel}  next ${benchGap.nextLabel}  gap ${benchGap.headlineGap}`)
ok('rank gap exposes current → next tier', benchGap.currentTier === 3 && benchGap.nextTier === 4)
ok('rank gap binding metric = hardest unmet (bench, lowest progress)', benchGap.bindingMetric === 'Bänkpress', benchGap.bindingMetric)
ok('rank gap headline is the concrete +kg gap', benchGap.headlineGap === '+12 kg', benchGap.headlineGap)
const econGap = computeRankGap(STUDENT[3])
ok('economy gap is the +kr amount', /kr$/.test(econGap.headlineGap), econGap.headlineGap)
const fastGap = computeRankGap(STUDENT[1])
ok('lower-is-better (running) gap has a positive numeric distance', fastGap.gaps[0].gapValue === 180, String(fastGap.gaps[0].gapValue))

console.log('\n── 2. Score Impact model (task 5) ──')
const w = weightsForProfile('student')
const impEcon = estimateScoreImpact(STUDENT, w, 'ekonomi', 1)
const impSomn = estimateScoreImpact(STUDENT, w, 'somn', 1)
console.log(`  +1 tier ekonomi → weighted +${impEcon.weightedDelta}, headline ${impEcon.headlineBefore}→${impEcon.headlineAfter}`)
ok('raising a category never lowers the score', impEcon.weightedDelta >= 0 && impSomn.weightedDelta >= 0)
ok('lifting the weakest link moves the score more than a strong one',
  impEcon.weightedDelta >= impSomn.weightedDelta, `econ ${impEcon.weightedDelta} vs somn ${impSomn.weightedDelta}`)
ok('score impact uses the real weighting (computeMaxxScoreV2 baseline matches)',
  impEcon.headlineBefore === computeMaxxScoreV2(STUDENT, w).tier)
ok('percentileDelta reflects the category tier jump', impEcon.percentileDelta > 0)

console.log('\n── 3. Opportunity Engine — ranked by impact (task 2) ──')
const opps = buildOpportunities(STUDENT, w, { profile: 'balanced' })
opps.slice(0, 3).forEach((o) => console.log(`  #${o.priority} ${o.name}  +${o.scoreImpact} poäng  ${o.gap.headlineGap}  (${o.effort.label}, ~${o.effort.months}mån)`))
ok('every non-maxed category gets an opportunity', opps.length === STUDENT.filter((c) => c.tier.tier < 8).length)
ok('opportunities carry priority + score impact + effort', opps[0].priority === 1 && opps[0].scoreImpact != null && !!opps[0].effort)
ok('opportunities are sorted (priority 1 has the highest priorityScore)',
  opps[0].priorityScore >= opps[opps.length - 1].priorityScore)

console.log('\n── 4. Rank Up Plan generator (task 3) ──')
const plan = buildRankUpPlan(STUDENT[3], { rankCats: STUDENT, weights: w })
console.log(`  Ekonomi  ${plan.currentLabel} → ${plan.targetLabel}  est ${plan.estimateLabel}`)
plan.required.forEach((r) => console.log(`     • ${r.step}`))
ok('plan exposes current/target tier', plan.currentTier === 2 && plan.targetTier === 3)
ok('plan lists required steps from the gaps', plan.required.length === 2 && /kr/.test(plan.required[0].step))
ok('plan carries an estimated time + score impact', plan.estimatedMonths != null && plan.scoreImpact != null)

console.log('\n── 5. Effort model (task 4 effort) ──')
const eKg = estimateEffort('styrka', { gapValue: 12, currentTier: 3, progress: 60 })
const eMissing = estimateEffort('styrka', { missing: true })
const eCurve = estimateEffort('kondition', { progress: 40, currentTier: 5 })
console.log(`  +12kg strength → ~${eKg.months}mån (${eKg.bucket}); kondition curve → ~${eCurve.months}mån`)
ok('effort from a unit rate returns months + bucket + basis', eKg.months > 0 && !!eKg.bucket && /kg\/mån/.test(eKg.basis))
ok('missing data → no estimate (needs-data)', eMissing.months === null && eMissing.basis === 'needs-data')
ok('no clean unit → progress-curve fallback', /progress-kurva/.test(eCurve.basis) && eCurve.months > 0)
ok('higher tiers cost more effort', estimateEffort('styrka', { gapValue: 12, currentTier: 7 }).months > eKg.months)

console.log('\n── 6. Bottleneck integration v2 (task 4) ──')
const score = computeMaxxScoreV2(STUDENT, w)
const bn = detectBottlenecksV2(STUDENT, score.tier, w)
const enriched = enrichBottlenecks(bn, STUDENT, w)
ok('enriched bottlenecks expose impact + next tier + effort', enriched.length > 0 && enriched.every((b) => b.impact != null && b.nextTier && b.effort))
ok('each bottleneck carries its rank-up plan', enriched.every((b) => b.plan && b.plan.required))

console.log('\n── 7. Rank Up Profiles reorder (task 6) ──')
// Purpose-built so the three strategies genuinely diverge:
//   • ekonomi  — sole weakest link + heaviest weight → biggest score impact, but
//                a huge +kr gap → many months (expensive). Not decaying.
//   • styrka   — modest impact, tiny +2kg gap (cheap & fast), AND actively decaying.
const DIVERGE = [
  cat('ekonomi', 'Ekonomi', 2, [econReq('Sparkapital', 5000, 200000)]),           // huge +kr gap → many months
  cat('styrka', 'Styrka', 4, [benchReq(88, 90)], true),                            // tiny +2kg gap, decayWarning
  cat('somn', 'Sömn', 6, [req('Sömnsnitt 7d', 8.3, 8.5, '+0.2h')]),
  cat('halsa', 'Hälsa', 6, [req('Energi', 8.6, 9, '+0.4')]),
]
const dw = weightsForProfile('career') // ekonomi heaviest → unambiguously highest impact
for (const id of Object.keys(RANK_UP_PROFILES)) {
  const ordered = prioritizeOpportunities(buildOpportunities(DIVERGE, dw, { profile: id }), id)
  console.log(`  ${RANK_UP_PROFILES[id].label.padEnd(12)} top → ${ordered[0].name} (impact ${ordered[0].scoreImpact}, ~${ordered[0].effort.months}mån, ${ordered[0].effort.label})`)
}
const dOpps = buildOpportunities(DIVERGE, dw)
const aggOrder = prioritizeOpportunities(dOpps, 'aggressive')
const balOrder = prioritizeOpportunities(dOpps, 'balanced')
const maint = prioritizeOpportunities(dOpps, 'maintenance')[0]
const score4 = (order, id) => order.find((o) => o.id === id).priorityScore
ok('aggressive top = biggest raw score impact (effort ignored)',
  aggOrder[0].scoreImpact === Math.max(...dOpps.map((o) => o.scoreImpact)) && aggOrder[0].id === 'ekonomi', `${aggOrder[0].name} ${aggOrder[0].scoreImpact}`)
// Balanced rewards feasibility: the cheap move (styrka, ~1mån) is valued RELATIVELY
// more vs the slow heavy-hitter (ekonomi, ~49mån) than under aggressive.
const aggRatio = score4(aggOrder, 'styrka') / score4(aggOrder, 'ekonomi')
const balRatio = score4(balOrder, 'styrka') / score4(balOrder, 'ekonomi')
ok('balanced trades impact for feasibility (cheap move gains ground vs aggressive)',
  balRatio > aggRatio, `ratio agg ${round2(aggRatio)} → bal ${round2(balRatio)}`)
ok('maintenance prioritizes the actively-decaying category', maint.decayWarning === true && maint.id === 'styrka', maint.name)
ok('the three profiles do not all pick the same #1',
  new Set([aggOrder[0].id, balOrder[0].id, maint.id]).size >= 2)

console.log('\n── 8. buildHowToImprove — sibling of buildWhyThisScore (task 8) ──')
const how = buildHowToImprove(score, STUDENT, w, { profile: 'balanced' })
console.log(`  fastest path: ${how.headline.fastestPath} · biggest impact: ${how.headline.biggestImpact}`)
ok('how-to-improve mirrors the why-this-score shape (version/headline/categories)',
  how.version && how.headline && Array.isArray(how.opportunities) && Array.isArray(how.plans))
ok('exposes top 3 opportunities + a fastest path', how.topOpportunities.length <= 3 && !!how.headline.fastestPath)

console.log('\n── 9. Verification across personas (task 9) ──')
for (const [name, persona] of Object.entries(PERSONAS)) {
  const profileId = name // student/fitness/career map to tier-profile weight presets
  const layer = buildRankUpLayer(persona, { profileId, score: computeMaxxScoreV2(persona, weightsForProfile(profileId)), bottlenecksV2: detectBottlenecksV2(persona, computeMaxxScoreV2(persona, weightsForProfile(profileId)).tier, weightsForProfile(profileId)) })
  const top = layer.topOpportunity
  console.log(`  ${name.padEnd(8)} top opportunity → ${top.name} (${top.gap.headlineGap}, +${top.scoreImpact} poäng, ${top.effort.label})`)
  ok(`${name}: layer has gaps + opportunities + plans + howToImprove`,
    layer.gaps.length > 0 && layer.opportunities.length > 0 && layer.plans.length > 0 && !!layer.howToImprove)
  ok(`${name}: top opportunity is a real rankable category with a concrete gap`,
    !!top && !!top.gap.headlineGap && top.scoreImpact != null)
}

console.log('\n── edge cases ──')
ok('empty rankCats → null layer', buildRankUpLayer([], { profileId: 'balanced' }) === null)
ok('maxed (T8) category → no opportunity, plan.atMax', (() => {
  const maxed = [cat('styrka', 'Styrka', 8, [{ label: 'Bänk', met: true, progress: 100, gapLabel: 'Klar' }]), cat('somn', 'Sömn', 4, [req('Sömnsnitt 7d', 7.7, 8, '+0.3h')])]
  const o = buildOpportunities(maxed, weightsForProfile('balanced'))
  const p = buildRankUpPlan(maxed[0])
  return o.every((x) => x.id !== 'styrka') && p.atMax === true
})())
ok('computeRankGap null when no tier', computeRankGap({ id: 'x', name: 'X' }) === null)

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
