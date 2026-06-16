// Phase 15 verification — run via: esbuild --bundle --platform=node --format=esm | node
// Proves the Career layer is a DERIVED progression model over EXISTING data (no
// tracker, no Maxx coupling): track inference, profile-aware driver weighting,
// readiness + blockers, outcomes, explainability — across Student / Professional /
// Entrepreneur. Also asserts career is NOT part of the Maxx Score.
import {
  buildCareerProfile, buildCareerDrivers, assessCareerReadiness, buildCareerOutcomes,
  inferCareerTrack, getCareerTrack, CAREER_REGISTRY, CAREER_POSITIONS,
  explainCareerStage, careerDriverBreakdown,
} from '../src/lib/career.js'
import { RANKABLE_IDS } from '../src/lib/rankUp.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

// ── Registry + track inference (task 8) ─────────────────────────────────────
console.log('\n=== Registry & track inference ===')
ok('registry covers all required tracks', ['healthcare', 'engineering', 'business', 'entrepreneurship', 'trades', 'academic'].every((t) => CAREER_REGISTRY[t]))
ok('every track weights sum to 1', Object.values(CAREER_REGISTRY).every((t) => Math.abs(Object.values(t.driverWeights).reduce((a, b) => a + b, 0) - 1) < 1e-9))
ok('infer healthcare from study program (no hardcode in logic)', inferCareerTrack({ study_program: 'Läkarprogrammet', study_institution: 'KI' }) === 'healthcare')
ok('infer engineering from occupation', inferCareerTrack({ occupation: 'Software Engineer' }) === 'engineering')
ok('infer entrepreneurship from life_stage', inferCareerTrack({ life_stage: 'entrepreneur' }) === 'entrepreneurship')
ok('unknown → generic (no medicine bias)', inferCareerTrack({ occupation: 'florist' }) === 'generic')

// ── Drivers come from existing data only (task 3) ───────────────────────────
console.log('\n=== Drivers (existing data) ===')
const drv = buildCareerDrivers({ studies: { tier: 4 }, skillTier: 5, projects: { total: 3, completedTasks: 8 }, income: { currentMonthly: 20000, goalMonthly: 40000 }, positionOrdinal: 3, experience: { months: 24 } })
ok('5 drivers: education/skills/projects/experience/incomeGrowth', drv.map((d) => d.id).join(',') === 'education,skills,projects,experience,incomeGrowth')
ok('education driver derived from studies composite', drv.find((d) => d.id === 'education').score === Math.round(4 / 8 * 100))
ok('skills driver derived from skill tier', drv.find((d) => d.id === 'skills').score === Math.round(5 / 6 * 100))
ok('income driver = current/goal', drv.find((d) => d.id === 'incomeGrowth').score === Math.round(20000 / 40000 * 100))
ok('missing driver → hasData false, score 0', buildCareerDrivers({ studies: null, skillTier: null, projects: null, income: null, positionOrdinal: null }).every((d) => !d.hasData && d.score === 0))

// ── Career NOT in Maxx Score (task 7 recommendation enforced) ───────────────
console.log('\n=== Maxx independence ===')
ok('career is NOT a rankable Maxx category', !RANKABLE_IDS.includes('career') && RANKABLE_IDS.length === 6)
ok('career profile flags partOfMaxxScore:false', buildCareerProfile({ profile: { life_stage: 'student' } }).meta.partOfMaxxScore === false)

// ── Personas (task 9) ───────────────────────────────────────────────────────
const PERSONAS = {
  student: {
    profile: { life_stage: 'student', occupation: 'Läkarstudent', study_program: 'Läkarprogrammet', primary_focus: 'education' },
    goals: { future_plan: 'Bli specialistläkare', one_year: 'Klara terminen' },
    studies: { tier: 4 }, skillTier: 3, projects: { total: 1, completedTasks: 2 },
    income: { currentMonthly: 8000, goalMonthly: 15000 }, experience: { months: 0 },
    expectTrack: 'healthcare', expectPos: 'student',
  },
  professional: {
    profile: { life_stage: 'professional', occupation: 'Software Engineer', primary_focus: 'career' },
    goals: { future_plan: 'Senior Engineer', monthly_income_goal: 60000 },
    studies: { tier: 5 }, skillTier: 5, projects: { total: 6, completedTasks: 20 },
    income: { currentMonthly: 45000, goalMonthly: 60000 }, experience: { months: 48 },
    expectTrack: 'engineering', expectPos: 'professional',
  },
  entrepreneur: {
    profile: { life_stage: 'entrepreneur', occupation: 'Founder', primary_focus: 'wealth' },
    goals: { future_plan: 'Skala bolaget', ten_year: 'Exit' },
    studies: { tier: 3 }, skillTier: 4, projects: { total: 9, completedTasks: 30 },
    income: { currentMonthly: 30000, goalMonthly: 80000, trendPct: 20 }, experience: { months: 36 },
    expectTrack: 'entrepreneurship', expectPos: 'entrepreneur',
  },
}

for (const [name, P] of Object.entries(PERSONAS)) {
  console.log(`\n=== Persona: ${name} ===`)
  const cp = buildCareerProfile(P)
  ok(`${name}: track inferred (${P.expectTrack})`, cp.track === P.expectTrack)
  ok(`${name}: position from life_stage (${P.expectPos})`, cp.framework.currentPosition === P.expectPos)
  ok(`${name}: framework carries current role + target role`, !!cp.framework.currentRole && !!cp.framework.targetRole)
  ok(`${name}: roleLadder from registry (not medicine-default)`, Array.isArray(cp.framework.roleLadder) && cp.framework.roleLadder.length >= 5)
  ok(`${name}: readiness score in 0..100`, cp.readiness.score >= 0 && cp.readiness.score <= 100, `score=${cp.readiness.score} completeness=${cp.readiness.completeness}`)
  ok(`${name}: outcomes are outcomes (role/income/responsibility/project)`, cp.outcomes.roleProgression && cp.outcomes.incomeProgression && cp.outcomes.responsibilityProgression && cp.outcomes.projectProgression)
  ok(`${name}: strongestDrivers + biggestGaps present`, cp.readiness.strongestDrivers.length > 0 && cp.readiness.biggestGaps.length > 0)
  // Blocker contract: every blocker is a genuinely weak (score<50) or missing driver
  // that matters to the track (weight≥0.12); nothing healthy is wrongly flagged.
  const blockerContract = cp.readiness.blockers.every((b) => (!b.hasData || b.score < 50) && b.weight >= 0.12)
  ok(`${name}: blockers are only weak/missing weighted drivers`, blockerContract, `blockers=${cp.readiness.blockers.map((b) => `${b.driver}:${b.score}`).join(',')}`)
  // "What's holding me back" is answered by biggestGaps even for a strong profile
  // with zero hard blockers (the model never invents a problem that isn't there).
  ok(`${name}: relative weakest area always identified (biggestGaps)`, cp.readiness.biggestGaps.length > 0 && cp.readiness.biggestGaps[0].id != null)
  // Explainability is grounded + confidence-tagged.
  const ex = explainCareerStage(cp)
  ok(`${name}: explainCareerStage names the stage + readiness`, ex.answer.includes(cp.framework.currentPositionLabel) && ex.data.readiness === cp.readiness.score)
  ok(`${name}: explanation carries an evidence label`, !!ex.evidenceLabel)
  const bd = careerDriverBreakdown(cp)
  ok(`${name}: driver breakdown (strongest/gaps/blockers)`, !!bd.strongest && !!bd.biggestGaps && !!bd.blockers)
}

// ── Track weighting actually differs (engineering favours skills; entrepreneurship favours projects/income)
console.log('\n=== Profile-aware weighting differs by track ===')
const sameDrivers = { studies: { tier: 3 }, skillTier: 6, projects: { total: 1, completedTasks: 1 }, income: { currentMonthly: 10000, goalMonthly: 50000 }, positionOrdinal: 3, experience: { months: 12 } }
const dvr = buildCareerDrivers(sameDrivers)
const engR = assessCareerReadiness(dvr, 'engineering').score
const entR = assessCareerReadiness(dvr, 'entrepreneurship').score
ok('high skills + low income → engineering scores higher than entrepreneurship', engR > entR, `eng=${engR} ent=${entR}`)

// ── Off-ladder life stages don't crash ──────────────────────────────────────
console.log('\n=== Edge / null-safety ===')
ok('parent (off-ladder) builds without crash', !!buildCareerProfile({ profile: { life_stage: 'parent' } }))
ok('empty input → generic track, readiness 0', (() => { const c = buildCareerProfile({}); return c.track === 'generic' && c.readiness.score === 0 })())
ok('CAREER_POSITIONS has all 6 life stages', ['student', 'early_career', 'professional', 'entrepreneur', 'parent', 'retired'].every((s) => CAREER_POSITIONS[s]))

console.log(`\n${'='.repeat(40)}\n  ${pass}/${pass + fail} checks passed${fail ? ` — ${fail} FAILED` : ''}\n${'='.repeat(40)}`)
process.exit(fail ? 1 : 0)
