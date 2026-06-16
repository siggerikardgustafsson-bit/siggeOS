// ============================================================================
// Tier Engine v2 (Phase 6) — profile-aware, dynamic tier calculations.
// ----------------------------------------------------------------------------
// ADDITIVE intelligence layer. It does NOT modify tierUtils, the Dashboard, or
// the Maxx Score — it wraps the existing base thresholds and adjusts them by the
// user's context (sex / age / bodyweight / life_stage / country / currency).
//
//   * All future tier logic should flow through this layer.
//   * BACKWARDS COMPATIBLE: with no/partial context, every function reproduces
//     the exact current tierUtils thresholds (so adopting it changes nothing for
//     users without a profile). See `fallback` on each result.
//   * Heuristic models now; the threshold-adjustment seam is designed so a real
//     percentile / benchmark dataset can replace the heuristics later without
//     changing call sites.
//
// `context` is the object from personalization.buildUserContext():
//   { age, sex, height, weight, lifeStage, occupation, goals, country, currency }
// ============================================================================
import {
  getTier, getStudyTier,
  VO2MAX_THRESHOLDS,
  RUN_5K_THRESHOLDS, RUN_10K_THRESHOLDS, RUN_HALF_THRESHOLDS, RUN_MARA_THRESHOLDS,
  BENCH_THRESHOLDS, SQUAT_THRESHOLDS, DEADLIFT_THRESHOLDS, OHP_THRESHOLDS, PULLUP_THRESHOLDS,
  SLEEP_DURATION_THRESHOLDS, STEPS_THRESHOLDS,
  INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
} from '../components/dashboard/tierUtils'
import { benchmarkTier, benchmarksEnabled } from './benchmarks'

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

// Phase 9 seam: when benchmarks are enabled AND a dataset resolves a tier, use
// it (value → dataset → percentile → tier); otherwise return null and the caller
// keeps its existing heuristic path. Default OFF → behaviour byte-identical.
const tryBench = (category, metric, value, context) =>
  (benchmarksEnabled() ? benchmarkTier(category, metric, value, context) : null)
const round = (x) => Math.round(x * 1000) / 1000

// Scale a threshold ladder by a multiplicative factor (factor < 1 lowers the bar).
const scale = (arr, f) => arr.map((t) => round(t * f))

// Build the standard enriched result every calculator returns. This object also
// IS the Tier Inspector payload (thresholds used, factors, fallback, reason).
function build({ metric, value, base, used, factors, higherIsBetter = true, fallback, notes }) {
  const tier = value == null ? null : getTier(value, used, higherIsBetter)
  const applied = Object.entries(factors).filter(([, v]) => v != null && v !== 1)
  const reason = value == null
    ? `Ingen ${metric}-data.`
    : `${metric}=${value} → T${tier?.tier ?? '?'} (${tier?.label ?? '—'}). `
      + (applied.length
          ? `Trösklar justerade: ${applied.map(([k, v]) => `${k}×${v}`).join(', ')}.`
          : 'Standardtrösklar (ingen profiljustering).')
    + (fallback ? ' [fallback — profildata saknas]' : '')
  return {
    ...(tier || {}),
    metric, value,
    thresholds: used,
    baseThresholds: base,
    factors,
    higherIsBetter,
    fallback: !!fallback,
    reason,
    notes: notes || null,
  }
}

// ── STRENGTH ────────────────────────────────────────────────────────────────
// Bodyweight-relative already (multiples). Phase 6 adds sex + age grading on top.
const UPPER_LIFTS = ['bench', 'ohp', 'pullup', 'dip']
const STRENGTH_BASE = {
  bench: BENCH_THRESHOLDS, squat: SQUAT_THRESHOLDS, deadlift: DEADLIFT_THRESHOLDS,
  ohp: OHP_THRESHOLDS, pullup: PULLUP_THRESHOLDS,
  dip: PULLUP_THRESHOLDS, // dips use the same added-kg ladder as weighted pull-ups
}
function strengthSexFactor(lift, sex) {
  if (sex !== 'female') return 1 // unknown/male → base calibration
  return UPPER_LIFTS.includes(lift) ? 0.65 : 0.72
}
function strengthAgeFactor(age) {
  if (age == null) return 1
  if (age <= 30) return 1
  return clamp(1 - (age - 30) * 0.006, 0.6, 1) // ~0.6%/yr decline after 30
}

/**
 * @param lift 'bench'|'squat'|'deadlift'|'ohp'|'pullup'
 * @param input { weightKg, bodyweightKg, multiple, reps } — pass `multiple`
 *   (e1RM/bodyweight) for barbell lifts, or `reps` for pullups; or weightKg +
 *   bodyweightKg and it derives the multiple.
 */
export function calculateStrengthTier(lift, input = {}, context = null) {
  const base = STRENGTH_BASE[lift] || BENCH_THRESHOLDS
  const sex = context?.sex, age = context?.age
  const fSex = strengthSexFactor(lift, sex)
  const fAge = strengthAgeFactor(age)
  const f = round(fSex * fAge)
  const used = scale(base, f)

  let value = null
  if (lift === 'pullup') {
    value = input.reps ?? input.value ?? null // rep count
  } else if (input.multiple != null) {
    value = input.multiple
  } else if (input.weightKg != null && input.bodyweightKg) {
    value = round(input.weightKg / input.bodyweightKg)
  }
  const bench = tryBench('strength', lift, value, context)
  if (bench) return bench
  const fallback = (sex == null && age == null)
  return build({ metric: lift, value, base, used, higherIsBetter: true, fallback,
    factors: { sex: fSex, age: fAge },
    notes: lift === 'pullup' ? 'reps' : 'bodyweight-multiple' })
}

// ── CONDITIONING ──────────────────────────────────────────────────────────────
const RUN_BASE = {
  '1k': RUN_5K_THRESHOLDS.map((t) => Math.round(t * 0.195)), // matches the Dashboard's 1 km derivation
  '5k': RUN_5K_THRESHOLDS, '10k': RUN_10K_THRESHOLDS, half_marathon: RUN_HALF_THRESHOLDS, marathon: RUN_MARA_THRESHOLDS,
}
function vo2SexFactor(sex) { return sex === 'female' ? 0.85 : 1 }
function vo2AgeFactor(age) { return age == null ? 1 : clamp(1 - Math.max(0, age - 25) * 0.008, 0.6, 1.05) }
function runSexFactor(sex) { return sex === 'female' ? 1.10 : 1 } // norm times ~10% higher
function runAgeFactor(age) { return age == null ? 1 : clamp(1 + Math.max(0, age - 30) * 0.006, 1, 1.5) }

export function calculateConditioningTier(metric, value, context = null) {
  const sex = context?.sex, age = context?.age
  const bench = tryBench('conditioning', metric, value, context)
  if (bench) return bench
  if (metric === 'vo2max') {
    const fSex = vo2SexFactor(sex), fAge = vo2AgeFactor(age)
    const used = scale(VO2MAX_THRESHOLDS, round(fSex * fAge))
    return build({ metric: 'vo2max', value, base: VO2MAX_THRESHOLDS, used, higherIsBetter: true,
      fallback: sex == null && age == null, factors: { sex: fSex, age: fAge } })
  }
  // running distances — time in seconds, lower is better
  const base = RUN_BASE[metric] || RUN_5K_THRESHOLDS
  const fSex = runSexFactor(sex), fAge = runAgeFactor(age)
  const used = scale(base, round(fSex * fAge))
  return build({ metric, value, base, used, higherIsBetter: false,
    fallback: sex == null && age == null, factors: { sex: fSex, age: fAge }, notes: 'seconds (lower is better)' })
}

// ── ECONOMY ───────────────────────────────────────────────────────────────────
// Three SEPARATE ladders. Life-stage + age + currency adjust them so a student
// and a professional are not held to the same bar. Base ladders are in SEK.
export const NET_WORTH_THRESHOLDS_SEK = [10000, 50000, 150000, 400000, 1000000, 2500000, 5000000]
const ECON_BASE = { income: INCOME_THRESHOLDS, savings: SAVINGS_THRESHOLDS, net_worth: NET_WORTH_THRESHOLDS_SEK }
const ECON_LIFE_STAGE = {
  income:    { student: 0.35, early_career: 0.70, professional: 1.0, entrepreneur: 1.0, parent: 0.90, retired: 0.50 },
  savings:   { student: 0.30, early_career: 0.60, professional: 1.0, entrepreneur: 1.0, parent: 0.90, retired: 1.30 },
  net_worth: { student: 0.20, early_career: 0.50, professional: 1.0, entrepreneur: 1.1, parent: 1.00, retired: 1.50 },
}
// Rough SEK-per-unit; replace with real FX / cost-of-living data later.
export const CURRENCY_TO_SEK = { SEK: 1, EUR: 11.3, USD: 10.5, GBP: 13.5, NOK: 0.95, DKK: 1.52 }
function econLifeStageFactor(metric, lifeStage) { return ECON_LIFE_STAGE[metric]?.[lifeStage] ?? 1 }
function econAgeFactor(metric, age) {
  if (age == null || metric === 'income') return 1
  return clamp(age / 35, 0.4, 1.4) // savings / net worth scale with age
}
function currencyFactor(currency) { const r = CURRENCY_TO_SEK[currency]; return r ? round(1 / r) : 1 }

export function calculateEconomyTier(metric, value, context = null) {
  const bench = tryBench('economy', metric, value, context)
  if (bench) return bench
  const base = ECON_BASE[metric] || INCOME_THRESHOLDS
  const lifeStage = context?.lifeStage, age = context?.age, currency = context?.currency
  const fStage = econLifeStageFactor(metric, lifeStage)
  const fAge = econAgeFactor(metric, age)
  const fCur = currencyFactor(currency)
  const used = scale(base, round(fStage * fAge * fCur))
  const fallback = lifeStage == null && age == null && (currency == null || currency === 'SEK')
  return build({ metric, value, base, used, higherIsBetter: true, fallback,
    factors: { lifeStage: fStage, age: fAge, currency: fCur } })
}

// ── HEALTH ──────────────────────────────────────────────────────────────────
// Tier-calc redesign only (metrics unchanged). metric: 'bmi'|'sleep'|'steps'|'weight_goal'
function sleepAgeFactor(age) {
  if (age == null) return 1
  if (age < 18) return 1.05 // teens need a bit more
  if (age >= 65) return 0.95
  return 1
}
function stepsAgeFactor(age) { return age == null ? 1 : clamp(1 - Math.max(0, age - 50) * 0.006, 0.7, 1) }

// BMI → tier (1..8). Optimal band ~21.7; tiers fall off symmetrically. Heuristic;
// BMI ignores muscle mass, so this is a coarse health signal, not body composition.
function bmiTier(bmi) {
  if (bmi == null) return null
  const dist = Math.abs(bmi - 21.7)
  const tier = dist <= 1 ? 8 : dist <= 2 ? 7 : dist <= 3 ? 6 : dist <= 4.5 ? 5 : dist <= 6 ? 4 : dist <= 8 ? 3 : 2
  const LABELS = ['', 'Botten 50%', 'Top 50%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 2.5%', 'Top 1%']
  const COLORS = ['', '#6b7280', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#06b6d4', '#ec4899', '#f59e0b']
  return { tier, label: LABELS[tier], color: COLORS[tier] }
}

export function calculateHealthTier(metric, value, context = null) {
  const sex = context?.sex, age = context?.age, height = context?.height, weight = context?.weight

  if (metric === 'bmi') {
    // value may be a precomputed BMI, else derive from context height/weight.
    let bmi = value
    if (bmi == null && height && weight) bmi = round(weight / Math.pow(height / 100, 2))
    const bench = tryBench('health', 'bmi', bmi, context)
    if (bench) return bench
    const t = bmiTier(bmi)
    return {
      ...(t || {}), metric: 'bmi', value: bmi, thresholds: null, baseThresholds: null,
      factors: { sex: 1, age: 1 }, higherIsBetter: null,
      fallback: !(height && weight) && value == null,
      reason: bmi == null ? 'Saknar längd/vikt för BMI.' : `BMI ${bmi} → T${t?.tier} (optimal ~21.7).`,
      notes: 'band-based (BMI ignores muscle mass)',
    }
  }

  if (metric === 'weight_goal') {
    // proximity to target weight (needs a baseline for true progress — future).
    const target = context?.goals?.targetWeight ?? value?.target
    const current = value?.current ?? weight
    if (!target || current == null) {
      return { tier: null, metric: 'weight_goal', value: null, fallback: true,
        reason: 'Saknar målvikt/aktuell vikt.', factors: {}, thresholds: null, baseThresholds: null }
    }
    const pctOff = Math.abs(current - target) / target
    const tier = pctOff <= 0.01 ? 8 : pctOff <= 0.03 ? 7 : pctOff <= 0.05 ? 6 : pctOff <= 0.08 ? 5 : pctOff <= 0.12 ? 4 : pctOff <= 0.18 ? 3 : 2
    const LABELS = ['', 'Botten 50%', 'Top 50%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 2.5%', 'Top 1%']
    return { tier, label: LABELS[tier], metric: 'weight_goal', value: { current, target, pctOff: round(pctOff) },
      factors: {}, thresholds: null, baseThresholds: null, higherIsBetter: null, fallback: false,
      reason: `${round(pctOff * 100)}% från målvikt → T${tier}.`, notes: 'proximity to target (true progress needs a baseline)' }
  }

  if (metric === 'sleep') {
    const bench = tryBench('health', 'sleep', value, context)
    if (bench) return bench
    const f = sleepAgeFactor(age)
    const used = scale(SLEEP_DURATION_THRESHOLDS, f)
    return build({ metric: 'sleep', value, base: SLEEP_DURATION_THRESHOLDS, used, higherIsBetter: true,
      fallback: age == null, factors: { age: f } })
  }

  if (metric === 'steps') {
    const bench = tryBench('health', 'steps', value, context)
    if (bench) return bench
    const f = stepsAgeFactor(age)
    const used = scale(STEPS_THRESHOLDS, f)
    return build({ metric: 'steps', value, base: STEPS_THRESHOLDS, used, higherIsBetter: true,
      fallback: age == null, factors: { age: f } })
  }

  return { tier: null, metric, value, fallback: true, reason: `Okänd hälsometrik: ${metric}`, factors: {}, thresholds: null, baseThresholds: null }
}

// ── STUDY ───────────────────────────────────────────────────────────────────
// Internal mastery scale (no external norm) — routed through the engine for
// consistency. Profile does not adjust it today (hook left for the future).
export function calculateStudyTier(mastery, context = null) {
  const t = getStudyTier(mastery)
  return {
    ...(t || {}), metric: 'study', value: mastery,
    thresholds: 'mastery 0-100 (internal)', baseThresholds: 'mastery', factors: {},
    higherIsBetter: true, fallback: false,
    reason: mastery == null ? 'Ingen mastery-data.' : `Mastery ${mastery}% → ${t?.label ?? '—'}.`,
    notes: 'internal scale — no profile adjustment yet',
  }
}

// ── TIER INSPECTOR ────────────────────────────────────────────────────────────
// Returns the full explanation for one metric (powers a future "Why this score?").
// category: 'strength'|'conditioning'|'economy'|'health'|'study'
export function inspectTier(category, metric, value, context = null) {
  switch (category) {
    case 'strength':     return calculateStrengthTier(metric, value, context)
    case 'conditioning': return calculateConditioningTier(metric, value, context)
    case 'economy':      return calculateEconomyTier(metric, value, context)
    case 'health':       return calculateHealthTier(metric, value, context)
    case 'study':        return calculateStudyTier(value, context)
    default:             return { error: `Unknown category: ${category}` }
  }
}
