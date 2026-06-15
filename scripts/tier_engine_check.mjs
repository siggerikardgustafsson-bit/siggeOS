// Phase 6 verification — run: node scripts/tier_engine_check.mjs
import {
  calculateStrengthTier, calculateConditioningTier, calculateEconomyTier,
  calculateHealthTier, calculateStudyTier, inspectTier,
} from '../src/lib/tierEngine.js'
import { getTier, BENCH_THRESHOLDS, INCOME_THRESHOLDS, SLEEP_DURATION_THRESHOLDS } from '../src/components/dashboard/tierUtils.js'

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => { (cond ? pass++ : fail++); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`) }

console.log('\n── Strength (bench multiple 1.30) ──')
const benchM = calculateStrengthTier('bench', { multiple: 1.30 }, { sex: 'male', age: 25 })
const benchF = calculateStrengthTier('bench', { multiple: 1.30 }, { sex: 'female', age: 25 })
const benchOld = calculateStrengthTier('bench', { multiple: 1.30 }, { sex: 'male', age: 55 })
console.log(`  male25 T${benchM.tier} | female25 T${benchF.tier} | male55 T${benchOld.tier}`)
ok('female reaches higher tier than male at same multiple', benchF.tier > benchM.tier)
ok('older male reaches >= tier than young (age-graded)', benchOld.tier >= benchM.tier)

console.log('\n── Strength fallback == base ──')
const benchFb = calculateStrengthTier('bench', { multiple: 1.30 }, null)
const benchBase = getTier(1.30, BENCH_THRESHOLDS, true)
ok('no-context tier equals base getTier', benchFb.tier === benchBase.tier, `engine T${benchFb.tier} vs base T${benchBase.tier}`)
ok('no-context flagged fallback', benchFb.fallback === true)

console.log('\n── Conditioning ──')
const vo2M = calculateConditioningTier('vo2max', 50, { sex: 'male', age: 25 })
const vo2F = calculateConditioningTier('vo2max', 50, { sex: 'female', age: 25 })
ok('female VO2max 50 reaches higher tier than male', vo2F.tier > vo2M.tier, `m T${vo2M.tier} / f T${vo2F.tier}`)
const run5kM = calculateConditioningTier('5k', 1320, { sex: 'male', age: 25 }) // 22:00
const run5kF = calculateConditioningTier('5k', 1320, { sex: 'female', age: 25 })
ok('female 22min 5k reaches >= tier than male (slower norm)', run5kF.tier >= run5kM.tier, `m T${run5kM.tier} / f T${run5kF.tier}`)

console.log('\n── Economy income 20000 ──')
const incStudent = calculateEconomyTier('income', 20000, { lifeStage: 'student', currency: 'SEK', age: 22 })
const incPro = calculateEconomyTier('income', 20000, { lifeStage: 'professional', currency: 'SEK', age: 35 })
ok('student ranks higher than professional at same income', incStudent.tier > incPro.tier, `student T${incStudent.tier} / pro T${incPro.tier}`)
const incFb = calculateEconomyTier('income', 20000, null)
const incBase = getTier(20000, INCOME_THRESHOLDS, true)
ok('economy fallback (no ctx) equals base', incFb.tier === incBase.tier, `engine T${incFb.tier} vs base T${incBase.tier}`)
ok('separate ladders exist (savings/net_worth)', !!calculateEconomyTier('savings', 50000, {lifeStage:'student'}).thresholds && !!calculateEconomyTier('net_worth', 100000, {lifeStage:'professional'}).thresholds)

console.log('\n── Health ──')
const bmi = calculateHealthTier('bmi', null, { height: 180, weight: 78 })
ok('BMI derived from height/weight', bmi.value != null && bmi.tier != null, `BMI ${bmi.value} T${bmi.tier}`)
const sleepFb = calculateHealthTier('sleep', 7.5, null)
const sleepBase = getTier(7.5, SLEEP_DURATION_THRESHOLDS, true)
ok('sleep fallback equals base', sleepFb.tier === sleepBase.tier)
const wg = calculateHealthTier('weight_goal', { current: 80, target: 78 }, null)
ok('weight-goal proximity returns a tier', wg.tier != null, `${(wg.value?.pctOff*100).toFixed(1)}% off → T${wg.tier}`)

console.log('\n── Study + Inspector ──')
const study = calculateStudyTier(72)
ok('study mastery routes through engine', study.tier != null, study.label)
const insp = inspectTier('strength', 'bench', { multiple: 1.30 }, { sex: 'female', age: 40 })
ok('inspector returns thresholds + reason + factors', !!insp.thresholds && !!insp.reason && !!insp.factors)
console.log('  inspector.reason:', insp.reason)

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
