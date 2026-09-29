// Experiments verification — run: npx esbuild scripts/experiments_check.mjs --bundle --platform=node --format=esm --outfile=/tmp/x.mjs && node /tmp/x.mjs
import { evaluateExperiment, buildDailySeries, addDaysISO, experimentsToPrompt } from '../src/lib/experiments.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }
const T = new Date('2026-09-29T12:00:00')
const series = (from, n, fn) => Array.from({ length: n }, (_, i) => ({ date: addDaysISO(from, i), ...fn(i) }))

// A: energy clearly higher during (6 vs 8), done
{
  const health = [...series('2026-08-18', 14, (i) => ({ energy: 6 + (i % 2) * 0.5 })), ...series('2026-09-01', 14, (i) => ({ energy: 8 + (i % 2) * 0.5, sleep_hours: 7.5 }))]
  const days = buildDailySeries({ health })
  const r = evaluateExperiment({ title: 'a', outcome_metric: 'energy', direction: 'up', lever_metric: 'sleep', lever_op: '>=', lever_target: 7, start_date: '2026-09-01', duration_days: 14, baseline_days: 14, status: 'active' }, days, T)
  ok('A done phase', r.phase === 'done', r.phase)
  ok('A improved', r.verdict === 'improved', `${r.verdict} ${r.summary}`)
  ok('A adherence 100%', r.adherence?.rate === 1)
}
// B: noise, no effect
{
  const vals = [6, 7, 5, 8, 6, 7, 6, 5, 7, 8, 6, 7, 5, 6]
  const health = [...series('2026-08-18', 14, (i) => ({ mood: vals[i] })), ...series('2026-09-01', 14, (i) => ({ mood: vals[13 - i] }))]
  const r = evaluateExperiment({ outcome_metric: 'mood', direction: 'up', start_date: '2026-09-01', duration_days: 14, baseline_days: 14, status: 'active' }, buildDailySeries({ health }), T)
  ok('B no_effect', r.verdict === 'no_effect', `${r.verdict} p=${r.p}`)
}
// C: too few logged days
{
  const health = series('2026-09-01', 3, () => ({ sleep_hours: 7 }))
  const r = evaluateExperiment({ outcome_metric: 'sleep', direction: 'up', start_date: '2026-09-01', duration_days: 14, status: 'active' }, buildDailySeries({ health }), T)
  ok('C insufficient', r.verdict === 'insufficient', r.verdict)
}
// D: running, interim, zeroFill study (missing days = 0)
{
  const study = series('2026-09-22', 8, (i) => (i % 2 ? { hours: 2 } : { hours: 0 })).filter((s) => s.hours > 0)
  const r = evaluateExperiment({ outcome_metric: 'study', direction: 'up', start_date: '2026-09-25', duration_days: 14, baseline_days: 14, status: 'active' }, buildDailySeries({ study }), T)
  ok('D running', r.phase === 'running' && r.dayIndex === 5, `${r.phase} day ${r.dayIndex}`)
  ok('D zeroFill counts 14 baseline days', r.baseline.n === 14, String(r.baseline.n))
  ok('D interim', r.verdict === 'interim')
}
// E: direction down (weight), clear drop → improved; low adherence flagged
{
  const health = [...series('2026-08-18', 14, (i) => ({ weight_kg: 72.4 + (i % 3) * 0.1 })), ...series('2026-09-01', 14, (i) => ({ weight_kg: 71.2 + (i % 3) * 0.1, alcohol_units: i < 10 ? 3 : 0 }))]
  const r = evaluateExperiment({ outcome_metric: 'weight', direction: 'down', lever_metric: 'alcohol', lever_op: '<=', lever_target: 0, start_date: '2026-09-01', duration_days: 14, status: 'done', ended_at: '2026-09-15T10:00:00Z' }, buildDailySeries({ health }), T)
  ok('E improved (down)', r.verdict === 'improved', r.verdict)
  ok('E low adherence flagged', r.lowAdherence === true, String(r.adherence?.rate))
}
// F: upcoming + prompt
{
  const r = evaluateExperiment({ outcome_metric: 'energy', start_date: '2026-10-05', status: 'active' }, {}, T)
  ok('F upcoming', r.phase === 'upcoming' && r.verdict === 'upcoming')
  const txt = experimentsToPrompt([{ title: 'x', outcome_metric: 'energy', start_date: '2026-09-25', duration_days: 14, status: 'active' }], {}, T)
  ok('F prompt line', txt.includes('"x"') && txt.includes('dag 5/14'), txt.split('\n')[1])
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
