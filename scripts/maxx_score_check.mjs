// Phase 7 verification — run: esbuild-bundle then node. Covers the 4 required scenarios.
import { calculateStrengthTier, calculateConditioningTier, calculateEconomyTier, calculateHealthTier, calculateStudyTier } from '../src/lib/tierEngine.js'
import { computeMaxxScoreV2, detectBottlenecksV2, buildWhyThisScore, tierToPercentile, percentileToTier } from '../src/lib/maxxScore.js'
import { weightsForProfile, suggestTierProfile } from '../src/lib/tierProfiles.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

// Build the ranking categories the Dashboard would produce, via the Tier Engine.
function buildRankCats(ctx) {
  const bench = calculateStrengthTier('bench', { multiple: 1.30 }, ctx)
  const squat = calculateStrengthTier('squat', { multiple: 1.60 }, ctx)
  const dead  = calculateStrengthTier('deadlift', { multiple: 1.90 }, ctx)
  const styrka = [bench, squat, dead].reduce((m, t) => t.tier < m.tier ? t : m, bench) // weak-link
  const kondition = calculateConditioningTier('5k', 1320, ctx) // 22:00
  const ekonomi = calculateEconomyTier('income', 20000, ctx)
  const somn = calculateHealthTier('sleep', 7.5, ctx)
  const plugg = calculateStudyTier(60, ctx)
  return [
    { id: 'kondition', name: 'Kondition', tier: kondition },
    { id: 'styrka', name: 'Styrka', tier: styrka },
    { id: 'somn', name: 'Sömn', tier: somn },
    { id: 'plugg', name: 'Plugg', tier: plugg },
    { id: 'ekonomi', name: 'Ekonomi', tier: ekonomi },
  ]
}

console.log('\n── percentile round-trip ──')
ok('tier↔percentile monotonic', tierToPercentile(8) > tierToPercentile(5) && percentileToTier(99) === 8 && percentileToTier(25) === 1)

const scenarios = [
  { name: 'profile-less (fallback)', ctx: null, profile: 'balanced' },
  { name: 'student', ctx: { sex: 'male', age: 22, lifeStage: 'student', currency: 'SEK' }, profile: null },
  { name: 'professional', ctx: { sex: 'male', age: 35, lifeStage: 'professional', currency: 'SEK' }, profile: null },
  { name: 'fitness-focused', ctx: { sex: 'female', age: 28, lifeStage: 'professional', currency: 'SEK', goals: { primary: 'fitness' } }, profile: null },
]

console.log('\n── Maxx Score v2 across profiles ──')
const results = {}
for (const s of scenarios) {
  const cats = buildRankCats(s.ctx)
  const profileId = s.profile || suggestTierProfile(s.ctx)
  const weights = weightsForProfile(profileId)
  const score = computeMaxxScoreV2(cats, weights)
  results[s.name] = { score, cats, profileId }
  const tiers = cats.map(c => `${c.id[0]}${c.tier.tier}`).join(' ')
  console.log(`  ${s.name.padEnd(24)} profile=${profileId.padEnd(8)} → Maxx T${score.tier} (wPct ${score.weightedPercentile}, min T${score.minTier})  [${tiers}]`)
  ok(`${s.name}: headline tier in [minTier, 8]`, score.tier >= 1 && score.tier <= 8 && score.tier >= score.minTier - 0)
  ok(`${s.name}: contributions sum ~100%`, Math.abs(score.contributions.reduce((a, c) => a + c.contribution, 0) - 100) <= 3)
}

console.log('\n── logical relationships ──')
ok('student economy tier > professional (same 20k income)',
  results.student.cats.find(c => c.id === 'ekonomi').tier.tier > results.professional.cats.find(c => c.id === 'ekonomi').tier.tier)
ok('fitness profile weights kondition/styrka higher than balanced',
  weightsForProfile('fitness').kondition > weightsForProfile('balanced').kondition)
ok('profile-less Maxx is a sensible blend (>= minTier, <= maxTier)',
  (() => { const r = results['profile-less (fallback)']; const ts = r.cats.map(c => c.tier.tier); return r.score.tier >= Math.min(...ts) && r.score.tier <= Math.max(...ts) })())

console.log('\n── bottleneck v2 + why-this-score ──')
const r = results.student
const bn = detectBottlenecksV2(r.cats, r.score.tier, weightsForProfile(r.profileId))
ok('bottlenecks detected & sorted worst-first', bn.length > 0 && bn[0].tier <= bn[bn.length - 1].tier, `worst: ${bn[0]?.name} T${bn[0]?.tier} impact ${bn[0]?.impact}`)
ok('bottleneck has impact + opportunity', bn[0].impact != null && !!bn[0].opportunity)
const why = buildWhyThisScore(r.score, r.cats)
ok('why-this-score has version + per-category factors', why.version === 'v2' && why.categories.length === r.cats.length && why.categories.some(c => c.profileFactors))
console.log('  why.headline:', JSON.stringify(why.headline))
console.log('  why.categories[styrka].profileFactors:', JSON.stringify(why.categories.find(c => c.id === 'styrka')?.profileFactors))

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
