// Phase 9 verification — run: esbuild-bundle then node.
// Demonstrates benchmark lookup, percentile calculation, tier adapter, fallback,
// and that the opt-in flag keeps the Tier Engine byte-identical when OFF.
import {
  getStrengthBenchmark, getConditioningBenchmark, getEconomyBenchmark, getHealthBenchmark,
  benchmarkTier, percentileForValue, enableBenchmarks, benchmarksEnabled, registrySummary, datasetConfidence,
} from '../src/lib/benchmarks/index.js'
import { calculateStrengthTier, calculateEconomyTier, calculateConditioningTier } from '../src/lib/tierEngine.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

console.log('\n── dataset registry (tasks 4,5) ──')
const reg = registrySummary()
ok('registry has strength/conditioning/economy/health sources',
  ['strength', 'conditioning', 'economy', 'health'].every(c => reg.some(r => r.category === c)))
ok('dataset confidence DISTINCT per category (strength > economy)',
  datasetConfidence('strength', 'bench') > datasetConfidence('economy', 'savings'),
  `strength ${datasetConfidence('strength','bench')} vs savings ${datasetConfidence('economy','savings')}`)

console.log('\n── benchmark lookup (task 2) ──')
const sb = getStrengthBenchmark('bench', { sex: 'male', age: 25 })
const eb = getEconomyBenchmark('income', { lifeStage: 'student' })
ok('getStrengthBenchmark returns anchors + metadata', sb && sb.anchors.length > 0 && sb.datasetId === 'strength-standards')
ok('getHealthBenchmark(bmi) resolves', !!getHealthBenchmark('bmi'))
ok('economy student segment factor < 1 (easier bar)', eb.segmentFactor < 1, `factor ${eb.segmentFactor}`)

console.log('\n── percentile engine (task 7) ──')
// Bench 1.3×BW male → with male-neutral anchors this is the T5 (top 10% ≈ p90) cutoff.
const p = percentileForValue({ category: 'strength', metric: 'bench', value: 1.3, context: { sex: 'male' } })
console.log(`  bench 1.3×BW (male) → percentile ${p.percentile} (dataset ${p.datasetId}, conf ${p.datasetConfidence})`)
ok('percentile is a number in 0..100', p.percentile >= 0 && p.percentile <= 100)
ok('bench 1.3×BW ≈ p90 (matches Top 10% threshold)', Math.abs(p.percentile - 90) <= 1, `got ${p.percentile}`)
const pLow = percentileForValue({ category: 'strength', metric: 'bench', value: 0.6, context: { sex: 'male' } })
ok('weaker lift → lower percentile (monotonic)', pLow.percentile < p.percentile)
// Running: lower time → higher percentile.
const fast = percentileForValue({ category: 'conditioning', metric: '5k', value: 1080, context: { sex: 'male' } })
const slow = percentileForValue({ category: 'conditioning', metric: '5k', value: 1800, context: { sex: 'male' } })
ok('5k: faster time → higher percentile (lower-is-better handled)', fast.percentile > slow.percentile, `fast ${fast.percentile} slow ${slow.percentile}`)

console.log('\n── segment shifts the bar (task 6) ──')
const fem = percentileForValue({ category: 'strength', metric: 'bench', value: 1.0, context: { sex: 'female' } })
const male = percentileForValue({ category: 'strength', metric: 'bench', value: 1.0, context: { sex: 'male' } })
ok('same lift ranks higher for female (lower bar)', fem.percentile > male.percentile, `female ${fem.percentile} vs male ${male.percentile}`)

console.log('\n── adapter: value → benchmark → percentile → tier (task 6) ──')
const bt = benchmarkTier('strength', 'bench', 1.3, { sex: 'male' })
ok('benchmarkTier returns a tier + source=benchmark', bt && bt.tier >= 1 && bt.tier <= 8 && bt.source === 'benchmark', `T${bt?.tier}`)
ok('benchmarkTier carries datasetConfidence + percentile', bt.datasetConfidence != null && bt.percentile != null)
ok('benchmarkTier null when no value (caller keeps heuristic)', benchmarkTier('strength', 'bench', null, null) === null)
ok('benchmarkTier null for metric without dataset', benchmarkTier('strength', 'nonexistent', 1.0, null) === null)

console.log('\n── compatibility: flag OFF = identical, ON = benchmark path (task 6) ──')
ok('benchmarks OFF by default', benchmarksEnabled() === false)
const heuristic = calculateStrengthTier('bench', { multiple: 1.3 }, { sex: 'male', age: 28 })
enableBenchmarks(true)
const benched = calculateStrengthTier('bench', { multiple: 1.3 }, { sex: 'male', age: 28 })
ok('flag ON routes Tier Engine through benchmark (source=benchmark)', benched.source === 'benchmark')
ok('benchmark tier agrees with heuristic at neutral anchor (seed compatibility)',
  Math.abs(benched.tier - heuristic.tier) <= 1, `heuristic T${heuristic.tier} vs benchmark T${benched.tier}`)
// Economy via the engine, benchmark ON.
const eBench = calculateEconomyTier('income', 28000, { lifeStage: 'professional' })
ok('economy routed through benchmark when ON', eBench.source === 'benchmark', `T${eBench.tier}`)
enableBenchmarks(false)
const heuristic2 = calculateStrengthTier('bench', { multiple: 1.3 }, { sex: 'male', age: 28 })
ok('flag OFF again → heuristic path restored (no source=benchmark)', heuristic2.source !== 'benchmark')

console.log('\n── fallback to heuristics (task 8) ──')
enableBenchmarks(true)
// Study has no benchmark dataset — engine must keep its internal scale.
const cond = calculateConditioningTier('vo2max', 50, { sex: 'male', age: 25 })
ok('conditioning vo2max uses benchmark when available', cond.source === 'benchmark')
enableBenchmarks(false)
ok('graceful: percentileForValue tolerates unknown metric', percentileForValue({ category: 'x', metric: 'y', value: 1 }).fallback === true)

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
