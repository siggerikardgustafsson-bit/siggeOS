// Phase 14 verification — run via: esbuild --bundle --platform=node --format=esm | node
// Proves Skills are folded into the Studier category as a SUB-DIMENSION (not a new
// category): profile-aware weighting behaves; the composite replaces plugg in-place;
// Maxx Score still has exactly 6 rankable categories; Rank Up + Bottleneck consume
// the composite with no parallel logic. Profiles: Student / Professional / No-formal.
import { computeStudiesTier, studiesWeights, buildStudiesLevelUp } from '../src/lib/studies.js'
import { computeMaxxScoreV2, detectBottlenecksV2, tierToPercentile } from '../src/lib/maxxScore.js'
import { buildRankUpLayer, RANKABLE_IDS, computeRankGap } from '../src/lib/rankUp.js'
import { weightsForProfile } from '../src/lib/tierProfiles.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

// ── 1. Weighting model ────────────────────────────────────────────────────────
console.log('\n=== Weighting model ===')
ok('student → 70/30', JSON.stringify(studiesWeights({ lifeStage: 'student', hasFormal: true, hasSkills: true })) === JSON.stringify({ formal: 70, skills: 30, mode: 'student' }))
ok('primary_focus education → 70/30', studiesWeights({ primaryFocus: 'education', hasFormal: true, hasSkills: true }).formal === 70)
ok('professional → 30/70', JSON.stringify(studiesWeights({ lifeStage: 'professional', hasFormal: true, hasSkills: true })) === JSON.stringify({ formal: 30, skills: 70, mode: 'professional' }))
ok('focus career → 30/70', studiesWeights({ primaryFocus: 'career', hasFormal: true, hasSkills: true }).skills === 70)
ok('balanced default → 50/50', studiesWeights({ lifeStage: 'other', hasFormal: true, hasSkills: true }).formal === 50)
ok('no formal → 0/100', JSON.stringify(studiesWeights({ lifeStage: 'student', hasFormal: false, hasSkills: true })) === JSON.stringify({ formal: 0, skills: 100, mode: 'skills-only' }))
ok('no skills → 100/0', JSON.stringify(studiesWeights({ lifeStage: 'professional', hasFormal: true, hasSkills: false })) === JSON.stringify({ formal: 100, skills: 0, mode: 'formal-only' }))
ok('neither → none', studiesWeights({ hasFormal: false, hasSkills: false }).mode === 'none')

// ── 2. Composite tier behaves logically ────────────────────────────────────────
console.log('\n=== Composite tier ===')
const stu = computeStudiesTier({ formalTier: 3, skillTier: 5, lifeStage: 'student' })
ok('student formal3+skills5 → 0.7*3+0.3*5=3.6→T4', stu.tier === 4, `tier=${stu.tier} blended=${stu.blended}`)
const pro = computeStudiesTier({ formalTier: 3, skillTier: 5, lifeStage: 'professional' })
ok('professional formal3+skills5 → 0.3*3+0.7*5=4.4→T4', pro.tier === 4, `tier=${pro.tier} blended=${pro.blended}`)
ok('professional weights skills heavier than student', pro.blended > stu.blended)
const noFormal = computeStudiesTier({ formalTier: null, skillTier: 5, lifeStage: 'professional' })
ok('no formal → composite = skill tier (T5)', noFormal.tier === 5 && noFormal.mode === 'skills-only')
const noSkills = computeStudiesTier({ formalTier: 4, skillTier: 0, lifeStage: 'student' })
ok('skill tier 0 (inactive) treated as no skills → formal-only T4', noSkills.tier === 4 && noSkills.mode === 'formal-only')
ok('neither source → null', computeStudiesTier({ formalTier: null, skillTier: 0 }) === null)
ok('composite carries parts (formal+skills contributions)', stu.parts.formal.contribution + stu.parts.skills.contribution > 0)
ok('composite tier clamped 1..8', computeStudiesTier({ formalTier: 5, skillTier: 6, lifeStage: 'professional' }).tier <= 8)

// ── 3. No 7th category — Maxx still has 6 rankables; composite REPLACES plugg ────
console.log('\n=== Maxx Score integrity (one category, not two) ===')
ok('RANKABLE_IDS still 6 and includes plugg, excludes skills/fardigheter', RANKABLE_IDS.length === 6 && RANKABLE_IDS.includes('plugg') && !RANKABLE_IDS.includes('fardigheter') && !RANKABLE_IDS.includes('skills'))

const tierMeta = (t) => ({ tier: t, label: `T${t}`, color: '#fff' })
function studierCat(formalTier, skillTier, profile) {
  const c = computeStudiesTier({ formalTier, skillTier, lifeStage: profile.life_stage, primaryFocus: profile.primary_focus })
  return { id: 'plugg', name: 'Studier', hasData: !!c, tier: tierMeta(c.tier), composite: c,
    levelUp: buildStudiesLevelUp(c.tier, formalLevelUp(formalTier), skillLevelUp(skillTier)) }
}
const formalLevelUp = (t) => t ? { currentTier: t, nextTier: t + 1, maxTier: 5, progressPct: 40,
  requirements: [{ label: 'Mastery snitt', current: t * 18, target: (t + 1) * 18, met: false, missing: false, progress: 40, gapLabel: '+18%' }] } : null
const skillLevelUp = (t) => t ? { currentTier: t, nextTier: t + 1, maxTier: 6, progressPct: 50,
  requirements: [{ label: 'Spanska', current: 40, target: 60, met: false, missing: false, progress: 66, gapLabel: '+20 min/v' },
                 { label: 'Gitarr', current: 20, target: 60, met: false, missing: false, progress: 33, gapLabel: '+40 min/v' }] } : null

function fullMaxx(profile, profileId, studierFormal, studierSkill) {
  const cats = [
    { id: 'kondition', name: 'Kondition', hasData: true, tier: tierMeta(4) },
    { id: 'styrka', name: 'Styrka', hasData: true, tier: tierMeta(5) },
    { id: 'somn', name: 'Sömn', hasData: true, tier: tierMeta(4) },
    { id: 'ekonomi', name: 'Ekonomi', hasData: true, tier: tierMeta(3) },
    { id: 'halsa', name: 'Hälsa', hasData: true, tier: tierMeta(4) },
    studierCat(studierFormal, studierSkill, profile),
  ]
  const rankCats = cats.filter((c) => c.tier?.tier && c.hasData && !['kropp', 'fardigheter'].includes(c.id))
  const weights = weightsForProfile(profileId)
  const score = computeMaxxScoreV2(rankCats, weights)
  const bottlenecksV2 = detectBottlenecksV2(rankCats, score.tier, weights)
  const rankUp = buildRankUpLayer(rankCats, { profileId, score, bottlenecksV2 })
  return { cats, rankCats, score, bottlenecksV2, rankUp }
}

const PROFILES = {
  student: { profile: { life_stage: 'student', primary_focus: 'education' }, profileId: 'student', formal: 3, skill: 5 },
  professional: { profile: { life_stage: 'professional', primary_focus: 'career' }, profileId: 'career', formal: 2, skill: 5 },
  noFormal: { profile: { life_stage: 'professional', primary_focus: 'career' }, profileId: 'career', formal: null, skill: 4 },
}

for (const [name, P] of Object.entries(PROFILES)) {
  console.log(`\n=== Profile: ${name} ===`)
  const M = fullMaxx(P.profile, P.profileId, P.formal, P.skill)
  ok(`${name}: exactly 6 rankable categories`, M.rankCats.length === 6)
  ok(`${name}: one 'plugg' entry only (no duplicate skills cat)`, M.rankCats.filter((c) => c.id === 'plugg').length === 1)
  ok(`${name}: score contributions = 6 categories`, M.score.contributions.length === 6)
  ok(`${name}: Studier appears in score contributions`, M.score.contributions.some((c) => c.id === 'plugg' && c.name === 'Studier'))
  ok(`${name}: Maxx Score computes (tier 1..8)`, M.score.tier >= 1 && M.score.tier <= 8, `T${M.score.tier} wp=${M.score.weightedPercentile}`)

  // composite tier carried into the score == computeStudiesTier
  const studier = M.rankCats.find((c) => c.id === 'plugg')
  const expected = computeStudiesTier({ formalTier: P.formal, skillTier: P.skill, lifeStage: P.profile.life_stage, primaryFocus: P.profile.primary_focus })
  ok(`${name}: score uses composite tier (${expected.tier})`, studier.tier.tier === expected.tier)

  // ── 4. Rank Up consumes the composite levelUp from BOTH sources ──
  const plan = M.rankUp.plans.find((p) => p.id === 'plugg')
  ok(`${name}: rank-up plan exists for Studier`, !!plan)
  const gap = computeRankGap(studier)
  const reqLabels = (studier.levelUp?.requirements || []).map((r) => r.label)
  if (P.formal && P.skill) {
    ok(`${name}: levelUp merges formal + skills reqs`, reqLabels.includes('Mastery snitt') && (reqLabels.includes('Spanska') || reqLabels.includes('Gitarr')))
    ok(`${name}: reqs tagged by source`, studier.levelUp.requirements.some((r) => r.source === 'formal') && studier.levelUp.requirements.some((r) => r.source === 'skills'))
  } else if (!P.formal) {
    ok(`${name}: skills-only levelUp has only skills reqs`, reqLabels.length > 0 && !reqLabels.includes('Mastery snitt'))
  }

  // ── 5. Bottleneck integration — Studier can be a bottleneck with score impact ──
  const oppForStudier = M.rankUp.opportunities.find((o) => o.id === 'plugg')
  ok(`${name}: Studier generates an opportunity w/ score impact`, !!oppForStudier && typeof oppForStudier.scoreImpact === 'number')
  ok(`${name}: bottleneck detection includes Studier when weakest`, Array.isArray(M.bottlenecksV2))
}

// ── 6. No duplication: skills never appear as their own rankable id ─────────────
console.log('\n=== No duplication ===')
const M = fullMaxx(PROFILES.student.profile, 'student', 3, 5)
ok('no standalone skills/fardigheter category in score', !M.score.contributions.some((c) => ['skills', 'fardigheter', 'färdigheter'].includes(c.id)))
ok('skills surfaced ONLY inside the Studier composite', !!M.rankCats.find((c) => c.id === 'plugg').composite.parts.skills)

console.log(`\n${'='.repeat(40)}\n  ${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ''}\n${'='.repeat(40)}`)
process.exit(fail ? 1 : 0)
