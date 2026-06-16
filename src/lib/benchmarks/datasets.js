// ============================================================================
// Benchmark seed datasets (Phase 9)
// ----------------------------------------------------------------------------
// Each entry is keyed `${category}:${metric}` and carries:
//   higherIsBetter  - direction for percentile interpolation
//   base            - the male / neutral / professional anchor table [{p,v}]
//   segment(ctx)    - returns a scale factor for the requested context
//                     (sex / age / lifeStage). SEED ONLY: real imported datasets
//                     replace this with measured per-segment anchor tables.
//   unit, notes
//
// The `base` tables are anchored to the app's EXISTING tier thresholds at their
// implied percentiles (50/70/80/90/95/97.5/99), so the neutral lookup reproduces
// today's tiers (true backwards-compatibility) while the architecture is ready
// for richer real anchors (add p10/p25 rows, swap segment scalers for real data).
// ============================================================================
import {
  VO2MAX_THRESHOLDS, RUN_5K_THRESHOLDS, RUN_10K_THRESHOLDS, RUN_HALF_THRESHOLDS, RUN_MARA_THRESHOLDS,
  BENCH_THRESHOLDS, SQUAT_THRESHOLDS, DEADLIFT_THRESHOLDS, OHP_THRESHOLDS, PULLUP_THRESHOLDS,
  SLEEP_DURATION_THRESHOLDS, STEPS_THRESHOLDS, INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
} from '../../components/dashboard/tierUtils'
import { anchorsFromThresholds } from './schema'

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))

// Net worth has no legacy threshold array — define real-ish SEK anchors directly.
const NET_WORTH_ANCHORS = [
  { p: 25, v: 25000 }, { p: 50, v: 150000 }, { p: 70, v: 400000 },
  { p: 80, v: 700000 }, { p: 90, v: 1500000 }, { p: 95, v: 3000000 }, { p: 99, v: 8000000 },
]

// ── segment scalers (seed heuristics; replace with measured anchors on import) ─
const UPPER_LIFTS = ['bench', 'ohp', 'pullup', 'dip']
const strengthSeg = (lift) => (ctx) => {
  const sexF = ctx?.sex === 'female' ? (UPPER_LIFTS.includes(lift) ? 0.65 : 0.72) : 1
  const ageF = ctx?.age == null ? 1 : clamp(1 - Math.max(0, ctx.age - 30) * 0.006, 0.6, 1)
  return sexF * ageF
}
const vo2Seg = (ctx) => {
  const sexF = ctx?.sex === 'female' ? 0.85 : 1
  const ageF = ctx?.age == null ? 1 : clamp(1 - Math.max(0, ctx.age - 25) * 0.008, 0.6, 1.05)
  return sexF * ageF
}
const runSeg = (ctx) => {
  const sexF = ctx?.sex === 'female' ? 1.10 : 1
  const ageF = ctx?.age == null ? 1 : clamp(1 + Math.max(0, ctx.age - 30) * 0.006, 1, 1.5)
  return sexF * ageF
}
const ECON_STAGE = {
  income:    { student: 0.35, early_career: 0.70, professional: 1.0, entrepreneur: 1.0, parent: 0.90, retired: 0.50 },
  savings:   { student: 0.30, early_career: 0.60, professional: 1.0, entrepreneur: 1.0, parent: 0.90, retired: 1.30 },
  net_worth: { student: 0.20, early_career: 0.50, professional: 1.0, entrepreneur: 1.1, parent: 1.00, retired: 1.50 },
}
const econSeg = (metric) => (ctx) => {
  const stageF = ECON_STAGE[metric]?.[ctx?.lifeStage] ?? 1
  const ageF = (ctx?.age == null || metric === 'income') ? 1 : clamp(ctx.age / 35, 0.4, 1.4)
  return stageF * ageF
}
const sleepSeg = (ctx) => (ctx?.age == null ? 1 : ctx.age < 18 ? 1.05 : ctx.age >= 65 ? 0.95 : 1)
const stepsSeg = (ctx) => (ctx?.age == null ? 1 : clamp(1 - Math.max(0, ctx.age - 50) * 0.006, 0.7, 1))

const strengthEntry = (lift, thr) => ({
  higherIsBetter: true, unit: 'bodyweight-multiple', base: anchorsFromThresholds(thr),
  segment: strengthSeg(lift), notes: 'e1RM / bodyweight',
})
const runEntry = (thr) => ({
  higherIsBetter: false, unit: 'seconds', base: anchorsFromThresholds(thr), segment: runSeg,
  notes: 'finish time (lower is better)',
})
const econEntry = (metric, thr, anchors) => ({
  higherIsBetter: true, unit: 'SEK', base: anchors || anchorsFromThresholds(thr), segment: econSeg(metric),
  notes: 'base ladder in SEK; segment by life stage',
})

export const BENCHMARK_DATASETS = {
  // ── strength (real basis: published strength standards) ──
  'strength:bench':    strengthEntry('bench', BENCH_THRESHOLDS),
  'strength:squat':    strengthEntry('squat', SQUAT_THRESHOLDS),
  'strength:deadlift': strengthEntry('deadlift', DEADLIFT_THRESHOLDS),
  'strength:ohp':      strengthEntry('ohp', OHP_THRESHOLDS),
  'strength:pullup':   { higherIsBetter: true, unit: 'reps', base: anchorsFromThresholds(PULLUP_THRESHOLDS), segment: strengthSeg('pullup'), notes: 'rep count' },
  'strength:dip':      { higherIsBetter: true, unit: 'added-kg', base: anchorsFromThresholds(PULLUP_THRESHOLDS), segment: strengthSeg('dip'), notes: 'weighted dip (added kg)' },

  // ── conditioning (real basis: VO2max norms, running standards) ──
  'conditioning:vo2max':         { higherIsBetter: true, unit: 'ml/kg/min', base: anchorsFromThresholds(VO2MAX_THRESHOLDS), segment: vo2Seg, notes: 'maximal oxygen uptake' },
  'conditioning:5k':             runEntry(RUN_5K_THRESHOLDS),
  'conditioning:10k':            runEntry(RUN_10K_THRESHOLDS),
  'conditioning:half_marathon':  runEntry(RUN_HALF_THRESHOLDS),
  'conditioning:marathon':       runEntry(RUN_MARA_THRESHOLDS),
  'conditioning:1k':             { higherIsBetter: false, unit: 'seconds', base: anchorsFromThresholds(RUN_5K_THRESHOLDS.map((t) => Math.round(t * 0.195))), segment: runSeg, notes: '1 km derived from 5 km standards' },

  // ── economy (basis: income/savings/wealth distributions — coarse) ──
  'economy:income':    econEntry('income', INCOME_THRESHOLDS),
  'economy:savings':   econEntry('savings', SAVINGS_THRESHOLDS),
  'economy:net_worth': econEntry('net_worth', null, NET_WORTH_ANCHORS),

  // ── health (basis: BMI risk bands, sleep duration norms) ──
  'health:sleep': { higherIsBetter: true, unit: 'hours', base: anchorsFromThresholds(SLEEP_DURATION_THRESHOLDS), segment: sleepSeg, notes: 'duration; over-sleep not penalized here' },
  'health:steps': { higherIsBetter: true, unit: 'steps/day', base: anchorsFromThresholds(STEPS_THRESHOLDS), segment: stepsSeg, notes: 'daily step count' },
  // BMI is distance-from-optimal (lower is better); adapter passes |bmi-21.7|.
  'health:bmi': {
    higherIsBetter: false, unit: 'bmi-distance', segment: () => 1, notes: '|BMI − 21.7|; smaller is healthier (ignores muscle mass)',
    base: [{ p: 10, v: 7 }, { p: 25, v: 5 }, { p: 50, v: 3 }, { p: 70, v: 2 }, { p: 80, v: 1.5 }, { p: 90, v: 1.0 }, { p: 95, v: 0.6 }, { p: 99, v: 0.2 }],
  },
}

export const BMI_OPTIMAL = 21.7

export function getDataset(category, metric) {
  return BENCHMARK_DATASETS[`${category}:${metric}`] || null
}
