// ============================================================================
// Cross-domain findings — deterministic, no AI, no cost.
// ----------------------------------------------------------------------------
// The point of SiggeOS is to surface connections the user wouldn't spot by
// eyeballing charts: sleep ↔ training output, PA-job load ↔ training volume,
// study load ↔ sleep, night shifts ↔ next-day energy, weight trend ↔ frequency.
//
// Every finding carries `n` (sample size) and is SUPPRESSED when the evidence
// is too thin. We never dress up a coincidence as a law — thin findings are
// labelled "preliminär", and a finding needs a real gap between the two groups
// to appear at all.
//
// Input: `days` — one record per calendar day the user logged anything on:
//   { date:'YYYY-MM-DD', sleep, energy, mood, train (count), study (h),
//     steps, weight, paHours, paNight (0|1) }
//   Any field may be missing for a given day.
// Output: [{ id, domain, headline, detail, direction:'positive'|'negative'|'neutral',
//            strength: 0..1, n, tentative:boolean }]  sorted strongest-first.
// ============================================================================

const round1 = (x) => Math.round(x * 10) / 10
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null)

export function pearson(pairs) {
  const n = pairs.length
  if (n < 4) return null
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0
  for (const [x, y] of pairs) { sx += x; sy += y; sxy += x * y; sx2 += x * x; sy2 += y * y }
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy))
  if (den === 0) return null
  return (n * sxy - sx * sy) / den
}

// All date maths here is UTC-anchored so parsing a 'YYYY-MM-DD' and formatting
// it back is a no-op regardless of the runtime timezone (a local parse +
// toISOString() shifts the day for anyone east/west of UTC).
const parseUTC = (dateStr) => new Date(dateStr + 'T00:00:00Z')
const fmtUTC = (d) => d.toISOString().slice(0, 10)
function addDaysUTC(dateStr, n) {
  const d = parseUTC(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return fmtUTC(d)
}

// ISO week key (Mon-anchored) from a 'YYYY-MM-DD' string, no date-fns dep.
function weekKey(dateStr) {
  const d = parseUTC(dateStr)
  const day = (d.getUTCDay() + 6) % 7 // Mon=0
  d.setUTCDate(d.getUTCDate() - day)
  return fmtUTC(d)
}

// Group `days` into weeks with summed / averaged fields.
function toWeeks(days) {
  const wk = {}
  for (const r of days) {
    if (!r.date) continue
    const k = weekKey(r.date)
    if (!wk[k]) wk[k] = { week: k, _sleep: [], _energy: [], _mood: [], train: 0, study: 0, _steps: [], _weight: [], paHours: 0 }
    const w = wk[k]
    if (r.sleep > 0) w._sleep.push(r.sleep)
    if (r.energy > 0) w._energy.push(r.energy)
    if (r.mood > 0) w._mood.push(r.mood)
    if (r.train > 0) w.train += r.train
    if (r.study > 0) w.study += r.study
    if (r.steps > 0) w._steps.push(r.steps)
    if (r.weight > 0) w._weight.push(r.weight)
    if (r.paHours > 0) w.paHours += r.paHours
  }
  return Object.values(wk).sort((a, b) => a.week.localeCompare(b.week)).map((w) => ({
    week: w.week,
    sleep: mean(w._sleep),
    energy: mean(w._energy),
    mood: mean(w._mood),
    train: w.train,
    study: round1(w.study),
    steps: w._steps.length ? Math.round(mean(w._steps)) : null,
    weight: mean(w._weight),
    paHours: round1(w.paHours),
  }))
}

// Split a list of {value, metric} into low/high thirds by `value`, compare `metric`.
function tercileContrast(rows, valueKey, metricKey, { minPerGroup = 4 } = {}) {
  const clean = rows.filter((r) => r[valueKey] != null && r[metricKey] != null)
                    .sort((a, b) => a[valueKey] - b[valueKey])
  if (clean.length < minPerGroup * 2 + 1) return null
  const cut = Math.max(minPerGroup, Math.floor(clean.length / 3))
  const low = clean.slice(0, cut)
  const high = clean.slice(-cut)
  const lm = mean(low.map((r) => r[metricKey]))
  const hm = mean(high.map((r) => r[metricKey]))
  return {
    lowVal: round1(mean(low.map((r) => r[valueKey]))),
    highVal: round1(mean(high.map((r) => r[valueKey]))),
    lowMetric: round1(lm),
    highMetric: round1(hm),
    delta: round1(hm - lm),
    n: clean.length,
  }
}

// Contrast a metric between days that match a predicate and days that don't.
function boolContrast(days, matchFn, metricKey, { minPerGroup = 4 } = {}) {
  const on = [], off = []
  for (const d of days) {
    if (d[metricKey] == null) continue
    ;(matchFn(d) ? on : off).push(d[metricKey])
  }
  if (on.length < minPerGroup || off.length < minPerGroup) return null
  const om = mean(on), fm = mean(off)
  return { onMetric: round1(om), offMetric: round1(fm), delta: round1(om - fm), nOn: on.length, nOff: off.length }
}

// Strength 0..1 from a delta relative to a sensible scale for that metric.
function strengthFromDelta(delta, scale) {
  return Math.max(0, Math.min(1, Math.abs(delta) / scale))
}

export function crossDomainFindings(days) {
  if (!Array.isArray(days) || days.length < 10) return []
  const weeks = toWeeks(days)
  const out = []

  // 1 · Nights <6h vs 7h+  →  next-day energy  (lag-1)
  {
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]))
    const pairs = []
    for (const d of days) {
      if (!(d.sleep > 0)) continue
      const nd = byDate[addDaysUTC(d.date, 1)]
      if (nd && nd.energy > 0) pairs.push({ sleep: d.sleep, energy: nd.energy })
    }
    const lowE = mean(pairs.filter((p) => p.sleep < 6).map((p) => p.energy))
    const hiE = mean(pairs.filter((p) => p.sleep >= 7).map((p) => p.energy))
    const nLow = pairs.filter((p) => p.sleep < 6).length
    const nHi = pairs.filter((p) => p.sleep >= 7).length
    if (lowE != null && hiE != null && nLow >= 3 && nHi >= 3 && Math.abs(hiE - lowE) >= 0.6) {
      out.push({
        id: 'sleep-next-energy', domain: 'somn',
        headline: `Kort sömn kostar dig energi dagen efter`,
        detail: `Efter nätter under 6h: energi ${round1(lowE)}/10. Efter 7h+: ${round1(hiE)}/10 (n=${nLow}+${nHi}).`,
        direction: 'negative', strength: strengthFromDelta(hiE - lowE, 3), n: nLow + nHi,
        tentative: nLow < 6 || nHi < 6,
      })
    }
  }

  // 2 · Weekly sleep  →  training volume that week
  {
    const c = tercileContrast(weeks.map((w) => ({ sleep: w.sleep, train: w.train })), 'sleep', 'train')
    if (c && Math.abs(c.delta) >= 0.7) {
      out.push({
        id: 'sleep-train-week', domain: 'traning',
        headline: c.delta > 0 ? 'Dina bäst sovna veckor är också dina mest tränade' : 'Du tränar mer under veckor med mindre sömn',
        detail: `Veckor med ~${c.highVal}h snittsömn: ${c.highMetric} pass. Veckor med ~${c.lowVal}h: ${c.lowMetric} pass (${c.n} veckor).`,
        direction: c.delta > 0 ? 'positive' : 'negative', strength: strengthFromDelta(c.delta, 2.5), n: c.n,
        tentative: c.n < 12,
      })
    }
  }

  // 3 · Weekly PA-job hours  →  training volume that week
  {
    const rows = weeks.filter((w) => w.paHours > 0 || w.train > 0).map((w) => ({ pa: w.paHours, train: w.train }))
    const c = tercileContrast(rows, 'pa', 'train')
    if (c && Math.abs(c.delta) >= 0.7) {
      out.push({
        id: 'pa-train-week', domain: 'jobb',
        headline: c.delta < 0 ? 'Tunga PA-veckor äter din träning' : 'Mer PA-jobb, mer träning — du håller rytmen',
        detail: `Veckor med ~${c.highVal}h PA-jobb: ${c.highMetric} pass. Veckor med ~${c.lowVal}h: ${c.lowMetric} pass (${c.n} veckor).`,
        direction: c.delta < 0 ? 'negative' : 'positive', strength: strengthFromDelta(c.delta, 2.5), n: c.n,
        tentative: c.n < 12,
      })
    }
  }

  // 4 · Weekly study hours  →  sleep that week
  {
    const rows = weeks.filter((w) => w.study > 0 && w.sleep != null).map((w) => ({ study: w.study, sleep: w.sleep }))
    const c = tercileContrast(rows, 'study', 'sleep')
    if (c && Math.abs(c.delta) >= 0.25) {
      out.push({
        id: 'study-sleep-week', domain: 'plugg',
        headline: c.delta < 0 ? 'Pluggtunga veckor syns i sömnen' : 'Din sömn håller även när du pluggar hårt',
        detail: `Veckor med ~${c.highVal}h plugg: ${c.highMetric}h snittsömn. Veckor med ~${c.lowVal}h: ${c.lowMetric}h (${c.n} veckor).`,
        direction: c.delta < 0 ? 'negative' : 'positive', strength: strengthFromDelta(c.delta, 1), n: c.n,
        tentative: c.n < 12,
      })
    }
  }

  // 5 · Training days  →  mood
  {
    const c = boolContrast(days, (d) => d.train > 0, 'mood')
    if (c && Math.abs(c.delta) >= 0.4) {
      out.push({
        id: 'train-mood', domain: 'traning',
        headline: c.delta > 0 ? 'Du mår bättre på dagar du tränar' : 'Träningsdagar drar ner humöret — vila kanske behövs',
        detail: `Träningsdagar: humör ${c.onMetric}/10. Övriga dagar: ${c.offMetric}/10 (n=${c.nOn}+${c.nOff}).`,
        direction: c.delta > 0 ? 'positive' : 'negative', strength: strengthFromDelta(c.delta, 2), n: c.nOn + c.nOff,
        tentative: c.nOn < 6,
      })
    }
  }

  // 6 · Day after a night shift  →  energy
  {
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]))
    const afterNight = [], baseline = []
    for (const d of days) {
      if (d.energy == null) continue
      const pd = byDate[addDaysUTC(d.date, -1)]
      ;(pd && pd.paNight ? afterNight : baseline).push(d.energy)
    }
    if (afterNight.length >= 3 && baseline.length >= 6) {
      const am = mean(afterNight), bm = mean(baseline)
      if (Math.abs(am - bm) >= 0.6) {
        out.push({
          id: 'nightshift-energy', domain: 'jobb',
          headline: 'Nattpass sätter sig i energin dagen efter',
          detail: `Dagen efter ett nattpass: energi ${round1(am)}/10. Vanlig dag: ${round1(bm)}/10 (n=${afterNight.length}).`,
          direction: am < bm ? 'negative' : 'positive', strength: strengthFromDelta(am - bm, 3), n: afterNight.length + baseline.length,
          tentative: afterNight.length < 6,
        })
      }
    }
  }

  // 7 · Weekly training frequency  →  weight change that week
  {
    const wr = weeks.filter((w) => w.weight != null)
    const deltas = []
    for (let i = 1; i < wr.length; i++) {
      if (wr[i].weight != null && wr[i - 1].weight != null) {
        deltas.push({ train: wr[i].train, dw: wr[i].weight - wr[i - 1].weight })
      }
    }
    const heavy = deltas.filter((d) => d.train >= 3).map((d) => d.dw)
    const light = deltas.filter((d) => d.train < 3).map((d) => d.dw)
    if (heavy.length >= 4 && light.length >= 4) {
      const hm = mean(heavy), lm = mean(light)
      if (Math.abs(hm - lm) >= 0.2) {
        out.push({
          id: 'train-weight', domain: 'halsa',
          headline: hm < lm ? 'Vikten rör sig mest i dina tränade veckor' : 'Fler pass, men vikten står still — kolla intaget',
          detail: `Veckor med 3+ pass: ${hm > 0 ? '+' : ''}${round1(hm)} kg. Veckor med färre: ${lm > 0 ? '+' : ''}${round1(lm)} kg (${deltas.length} veckor).`,
          direction: hm < lm ? 'positive' : 'neutral', strength: strengthFromDelta(hm - lm, 0.8), n: deltas.length,
          tentative: deltas.length < 10,
        })
      }
    }
  }

  // 8 · Best training weeks  →  what did their sleep look like
  {
    const wr = weeks.filter((w) => w.train > 0 && w.sleep != null)
    if (wr.length >= 8) {
      const sorted = [...wr].sort((a, b) => b.train - a.train)
      const top = sorted.slice(0, 3)
      const rest = sorted.slice(3)
      const ts = mean(top.map((w) => w.sleep)), rs = mean(rest.map((w) => w.sleep))
      if (ts != null && rs != null && Math.abs(ts - rs) >= 0.3) {
        out.push({
          id: 'bestweeks-sleep', domain: 'somn',
          headline: ts > rs ? 'Dina bästa träningsveckor byggde på bra sömn' : 'Dina bästa träningsveckor kom trots kort sömn',
          detail: `Topp 3 träningsveckor (${top.map((w) => w.train).join('/')} pass): ${round1(ts)}h snittsömn vs ${round1(rs)}h övriga.`,
          direction: ts > rs ? 'positive' : 'neutral', strength: strengthFromDelta(ts - rs, 1), n: wr.length,
          tentative: wr.length < 12,
        })
      }
    }
  }

  // 9 · Steps  →  sleep (same night)
  {
    const c = tercileContrast(days.filter((d) => d.steps > 0 && d.sleep > 0).map((d) => ({ steps: d.steps, sleep: d.sleep })), 'steps', 'sleep', { minPerGroup: 6 })
    if (c && Math.abs(c.delta) >= 0.3) {
      out.push({
        id: 'steps-sleep', domain: 'halsa',
        headline: c.delta > 0 ? 'Aktiva dagar ger dig bättre sömn' : 'Fler steg, men sömnen blir inte längre',
        detail: `Dagar runt ${Math.round(c.highVal / 1000)}k steg: ${c.highMetric}h sömn. Runt ${Math.round(c.lowVal / 1000)}k steg: ${c.lowMetric}h (${c.n} dagar).`,
        direction: c.delta > 0 ? 'positive' : 'neutral', strength: strengthFromDelta(c.delta, 1), n: c.n,
        tentative: c.n < 20,
      })
    }
  }

  return out
    .filter((f) => f.strength > 0.08)
    .sort((a, b) => b.strength - a.strength)
}

// Compact plain-text version for feeding a language model (no numbers dressed
// as certainty; the model gets the same caveats the UI shows).
export function findingsToPrompt(findings) {
  if (!findings.length) return ''
  return 'KOPPLINGAR (uträknade ur användarens egen historik):\n' +
    findings.map((f) => `- ${f.headline}. ${f.detail}${f.tentative ? ' [tunt underlag]' : ''}`).join('\n')
}
