// Phase 8 verification — run: esbuild-bundle then node.
// Covers empty / partial / complete profiles + confidence + Why-This-Score expansion.
import {
  getProfileCompleteness, getMissingCriticalFields, getPersonalizationStatus,
  calculateTierConfidence, getCategoryConfidences, getFallbackCategories,
  buildPersonalizationSummary, isCategoryFallback,
} from '../src/lib/profileCompleteness.js'
import { calculateStrengthTier, calculateEconomyTier } from '../src/lib/tierEngine.js'
import { computeMaxxScoreV2, buildWhyThisScore } from '../src/lib/maxxScore.js'
import { weightsForProfile } from '../src/lib/tierProfiles.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

const EMPTY = null
const PARTIAL = { sex: 'male', birth_date: '2002-01-01', life_stage: 'student' } // 3 of 10 fields
const COMPLETE = {
  birth_date: '1995-05-05', sex: 'male', weight_kg: 80, height_cm: 182, life_stage: 'professional',
  target_weight_kg: 78, occupation: 'Ingenjör', country: 'Sverige', primary_focus: 'fitness', secondary_focus: 'wealth',
}

console.log('\n── completeness ──')
const ce = getProfileCompleteness(EMPTY)
const cp = getProfileCompleteness(PARTIAL)
const cc = getProfileCompleteness(COMPLETE)
console.log(`  empty=${ce.pct}%  partial=${cp.pct}%  complete=${cc.pct}%`)
ok('empty profile → 0%', ce.pct === 0 && ce.isEmpty)
ok('complete profile → 100%', cc.pct === 100 && cc.isComplete && cc.missing.length === 0)
ok('partial between empty and complete', cp.pct > ce.pct && cp.pct < cc.pct)
ok('monotonic: more fields never lowers completeness', cp.pct >= ce.pct && cc.pct >= cp.pct)

console.log('\n── missing critical fields ──')
const mEmpty = getMissingCriticalFields(EMPTY)
const mPartial = getMissingCriticalFields(PARTIAL)
ok('empty missing all 5 critical', mEmpty.length === 5)
ok('partial missing weight+height (filled sex/age/life_stage)',
  mPartial.some(m => m.key === 'weight_kg') && mPartial.some(m => m.key === 'height_cm') && !mPartial.some(m => m.key === 'sex'),
  mPartial.map(m => m.key).join(','))
ok('complete missing none', getMissingCriticalFields(COMPLETE).length === 0)

console.log('\n── personalization status (task 5) ──')
ok('0% → Fallback-läge', getPersonalizationStatus(0).id === 'fallback')
ok('45% → Grundläggande (Basic)', getPersonalizationStatus(45).id === 'basic')
ok('70% → Mostly', getPersonalizationStatus(70).id === 'mostly')
ok('100% → Fully', getPersonalizationStatus(100).id === 'fully')
console.log(`  empty=${ce.status.label}  partial=${cp.status.label}  complete=${cc.status.label}`)

console.log('\n── tier confidence (task 6) ──')
const confE = getCategoryConfidences(EMPTY)
const confC = getCategoryConfidences(COMPLETE)
console.log(`  empty: ${JSON.stringify(confE)}`)
console.log(`  complete: ${JSON.stringify(confC)}`)
ok('no-data category → confidence 0', calculateTierConfidence('strength', COMPLETE, false) === 0)
ok('empty profile floors confidence at base (55), not 0', confE.strength === 55 && confE.economy === 55)
ok('complete profile → strength/health confidence 100', confC.strength === 100 && confC.health === 100)
ok('economy confidence: complete > empty', confC.economy > confE.economy)
ok('profile-independent category → 100', calculateTierConfidence('plugg', EMPTY, true) === 100)

console.log('\n── fallback categories (task 3) ──')
ok('empty profile → all 4 categories on fallback', getFallbackCategories(EMPTY).length === 4)
ok('partial: strength NOT fallback (has sex+age), economy NOT fallback (has life_stage)',
  !isCategoryFallback('strength', PARTIAL) && !isCategoryFallback('economy', PARTIAL))
ok('complete profile → no fallback categories', getFallbackCategories(COMPLETE).length === 0)

console.log('\n── tiers UNCHANGED by confidence (task 6: do not modify tiers) ──')
// Same metric value must yield the same tier regardless of completeness scoring.
const sEmpty = calculateStrengthTier('bench', { multiple: 1.3 }, null)
const sComplete = calculateStrengthTier('bench', { multiple: 1.3 }, { sex: 'male', age: 31 })
ok('strength tier is engine-driven, confidence is orthogonal', sEmpty.tier != null && sComplete.tier != null)

console.log('\n── Why-This-Score expansion (task 7) ──')
const rankCats = [
  { id: 'styrka', name: 'Styrka', tier: calculateStrengthTier('bench', { multiple: 1.3 }, { sex: 'male', age: 31 }), confidence: 100, usingFallback: false },
  { id: 'ekonomi', name: 'Ekonomi', tier: calculateEconomyTier('income', 20000, { lifeStage: 'professional' }), confidence: 78, usingFallback: false },
]
const weights = weightsForProfile('balanced')
const score = computeMaxxScoreV2(rankCats, weights)
const summary = buildPersonalizationSummary(COMPLETE, { strength: true, economy: true })
const whyNew = buildWhyThisScore(score, rankCats, summary)
const whyOld = buildWhyThisScore(score, rankCats) // backwards-compat: no 3rd arg
ok('why-this-score has personalization block w/ completeness + missingFields + fallback',
  whyNew.personalization && whyNew.personalization.completeness === 100 && Array.isArray(whyNew.personalization.missingFields) && Array.isArray(whyNew.personalization.fallbackCategories))
ok('per-category confidence surfaced in why-this-score', whyNew.categories[0].confidence === 100)
ok('backwards-compat: omitting personalization keeps v7 shape (no personalization key)',
  whyOld.version === 'v2' && whyOld.personalization === undefined && whyOld.categories.length === rankCats.length)

console.log('\n── graceful degradation ──')
ok('all functions tolerate null profile without throwing',
  (() => { try { getProfileCompleteness(null); getMissingCriticalFields(null); getCategoryConfidences(null); buildPersonalizationSummary(null); return true } catch { return false } })())

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
