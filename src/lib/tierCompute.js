// ============================================================================
// Tier computation — the Dashboard's category/tier engine as a pure module.
// ----------------------------------------------------------------------------
// Extracted verbatim from Dashboard.jsx (2026-09-29) so the SAME code computes
// tiers in the browser (Dashboard) and on the server (tier-snapshot edge
// function, nightly). Do not import ./supabase or anything React here — the
// server bundle (scripts/bundle-tier-compute.mjs) must stay runtime-agnostic.
//
//   fetchTierInputs(supabase, userId, todayDate) -> raw rows
//   computeTierCategories(inputs, todayDate)     -> { cats, ... }
//   tierSnapshotRow(cats, userId, dateStr)       -> tier_snapshots row
//
// Category `details` carry `sourceEvidence` where the Dashboard renders a
// clickable source link; the Dashboard turns that into JSX.
//
// NB: date keys use date-fns format() → the RUNTIME's local timezone. The
// server job is scheduled so that UTC and Stockholm share the calendar date.
// ============================================================================
import { subDays, format } from 'date-fns'
import {
  getTier, getSkillTier, getDecayedValue,
  formatRunTime,
  RUN_5K_THRESHOLDS, RUN_10K_THRESHOLDS, RUN_HALF_THRESHOLDS,
  BENCH_THRESHOLDS, SQUAT_THRESHOLDS, DEADLIFT_THRESHOLDS, OHP_THRESHOLDS, PULLUP_THRESHOLDS,
  SLEEP_DURATION_THRESHOLDS, STEPS_THRESHOLDS, INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
  ENERGY_THRESHOLDS, MOOD_THRESHOLDS,
  TIER_COLORS, TIER_NAMES,
} from '../components/dashboard/tierUtils'
import { buildUserContext, resolveTargetWeight } from './personalization'
import {
  calculateStrengthTier, calculateConditioningTier, calculateEconomyTier,
  calculateHealthTier, calculateStudyTier,
} from './tierEngine'
import { suggestTierProfile } from './tierProfiles'
import { tierToPercentile, SCORE_VERSION } from './maxxScore'
import { getSalaryPeriod } from './salaryPeriod'
import { DEFAULT_SUPPLEMENTS } from './constants'
import {
  languageBlend, languageLabel, languageTier,
  CARDS_THRESHOLDS, CI_HOURS_THRESHOLDS, CONSISTENCY_DAY_THRESHOLDS,
} from './languageSkill'

export async function fetchTierInputs(supabase, userId, todayDate = new Date()) {
  const since90 = format(subDays(todayDate, 90), 'yyyy-MM-dd')

  // Fetch salary_day first to build correct period — shared with Ekonomi
  // via src/lib/salaryPeriod.js so the two views never disagree (P2-5).
  const { data: settingsQuick } = await supabase.from('user_settings').select('goals').eq('user_id',userId).maybeSingle()
  const salaryDay = settingsQuick?.goals?.salary_day || 25
  const { start: periodStart, end: periodEnd } = getSalaryPeriod(todayDate, salaryDay)
  // The income tier uses the last COMPLETE salary period — a few days after
  // payday the current period is near-empty and always read as T1. Fetch both.
  const { start: prevStart, end: prevEnd } = getSalaryPeriod(subDays(new Date(periodStart + 'T00:00:00'), 1), salaryDay)

  const [
    { data: runData }, { data: runPrData }, { data: prData }, { data: healthData },
    { data: studyData }, { data: paData }, { data: skillData }, { data: userSettings },
    { data: exData }, { data: supplementLogs }, { data: snapshots }, { data: incomeData },
    activeGoals,
  ] = await Promise.all([
    supabase.from('training_sessions').select('id,date,distance_km,time_seconds,pace_per_km,session_type').eq('user_id',userId).gte('date',since90).not('distance_km','is',null).order('date',{ascending:false}),
    supabase.from('run_personal_records').select('id,distance_key,label,distance_km,time_seconds,pace_per_km,date,strava_activity_id,strava_effort_name,source').eq('user_id',userId).gte('date',since90).order('date',{ascending:false}).then(r => r).catch(() => ({ data: [] })),
    supabase.from('personal_records').select('id,exercise_name,weight_kg,reps,date,exercise_id').eq('user_id',userId).order('weight_kg',{ascending:false}),
    supabase.from('health_logs').select('date,weight_kg,sleep_hours,energy,energy_level,stress_level,mood,steps,alcohol_units').eq('user_id',userId).gte('date',since90).order('date',{ascending:false}),
    supabase.from('learning_goals').select('id,mastery,course_id,courses(name,active)').eq('user_id',userId),
    supabase.from('pa_shifts').select('date,estimated_pay').eq('user_id',userId).gte('date',prevStart).lte('date',periodEnd),
    // Graceful until post_deploy_11/12 (activity_type/cards columns) are
    // migrated — a SELECT naming an unknown column fails the whole query.
    // No date floor (user call 2026-09-11): languageTier()'s cards/CI
    // totals are LIFETIME cumulative, not a windowed snapshot — am() and
    // languageBlend() self-scope to their own shorter windows so this
    // doesn't change guitar's or the weekly figures.
    (async () => {
      const withCards = await supabase.from('skill_logs').select('date,skill,minutes,cards,activity_type').eq('user_id',userId)
      if (!withCards.error) return withCards
      const withCardsOnly = await supabase.from('skill_logs').select('date,skill,minutes,cards').eq('user_id',userId)
      if (!withCardsOnly.error) return withCardsOnly
      return supabase.from('skill_logs').select('date,skill,minutes').eq('user_id',userId)
    })(),
    Promise.resolve({ data: settingsQuick }),
    supabase.from('training_exercises')
      .select('id,session_id,set_number,exercise_name,reps,weight_kg,training_sessions!inner(id,date,user_id)')
      .eq('training_sessions.user_id', userId)
      .gte('training_sessions.date', format(subDays(todayDate, 60), 'yyyy-MM-dd'))
      .not('weight_kg','is',null).not('reps','is',null),
    supabase.from('supplement_logs')
      .select('date,supplement_name,taken')
      .eq('user_id', userId)
      .gte('date', since90)
      .then(r => r)
      .catch(() => ({ data: [] })),
    supabase.from('tier_snapshots')
      .select('date,kondition,styrka,plugg,ekonomi,somn,valmående')
      .eq('user_id', userId)
      .gte('date', format(subDays(todayDate, 180), 'yyyy-MM-dd'))
      .order('date', { ascending: true })
      .then(r => r)
      .catch(() => ({ data: [] })),
    supabase.from('income_logs')
      .select('date,amount,source')
      .eq('user_id', userId)
      .gte('date', prevStart)
      .lte('date', periodEnd)
      .then(r => r)
      .catch(() => ({ data: [] })),
    // For resolveTargetWeight — an active Mål-page goal (metric:'body_weight')
    // is the top-priority weight-goal source (user call 2026-09-12).
    supabase.from('goals').select('metric,target_value,status').eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: true })
      .then(r => r.data || [], () => []),
  ])

  // Profile: same read as personalization.getUserProfile, inlined so this
  // module never imports the browser supabase client. null on any failure.
  let profile = null
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (!error) profile = data
  } catch { /* degrade to no profile */ }

  const [{ data: assetsData }, { data: nwhData }] = await Promise.all([
    supabase.from('assets').select('type,quantity,manual_price_sek').eq('user_id', userId),
    supabase.from('net_worth_history').select('total_sek').eq('user_id', userId).order('date', { ascending: false }).limit(1),
  ])

  return {
    since90, runData, runPrData, prData, healthData, studyData, paData, skillData,
    userSettings, exData, supplementLogs, snapshots, incomeData, activeGoals,
    profile, assetsData, nwhData,
    periodStart, prevStart, prevEnd,
  }
}

export function computeTierCategories(inputs, todayDate = new Date()) {
  const {
    since90, runData, runPrData, prData, healthData, studyData, paData, skillData,
    userSettings, exData, supplementLogs, incomeData, activeGoals,
    profile, assetsData, nwhData,
    periodStart, prevStart, prevEnd,
  } = inputs
  const latestW = (healthData||[]).find(h=>h.weight_kg)
  const bw = latestW?.weight_kg || null

  // Phase 7 — profile-aware tier context. Null-safe: if the profile/columns
  // aren't there (or no profile yet), ctx is null and every Tier Engine call
  // falls back to the exact current thresholds (no behaviour change).
  // Phase 8 — fetch the raw profile once so we can derive both the tier
  // context AND the completeness/confidence signals from a single read.
  const ctx = buildUserContext(profile)
  const tierProfileId = suggestTierProfile(ctx)

  // Strava best efforts per activity.
  // run_personal_records only holds what Strava's own best-effort detection
  // finds per activity — it does not always report every shorter distance
  // inside a longer run (a clean 5km run can easily be missing a "1k" entry).
  // So "covers this distance" means: a real Strava segment, OR — when that's
  // missing — the fastest logged AVERAGE pace among runs that cover at least
  // that distance (last 90d). That's a genuine, already-achieved floor, not a
  // guess: over any run of distance D at average pace P, at least one
  // contiguous km-sized segment was run at pace ≤ P (otherwise the run's own
  // average couldn't be P) — so it can only raise a tier a missing segment
  // would otherwise hard-cap at T1, never overstate one beyond what was
  // actually run. (User call, 2026-09-11 — was previously kept out of tier
  // maths entirely; the "never rank down" property is what makes it safe.)
  function bestActual(distanceKey) {
    const efforts = (runPrData || []).filter(r =>
      r.distance_key === distanceKey &&
      r.time_seconds &&
      r.date >= since90
    )
    if (!efforts.length) return null

    return efforts.reduce((best, r) => {
      const t = Number(r.time_seconds)
      const bt = Number(best.time_seconds)
      return t < bt ? r : best
    }, efforts[0])
  }

  const DISTANCE_KM = { '1k': 1, '5k': 5, '10k': 10, half_marathon: 21.097 }
  function estimateFromPace(distanceKey) {
    const km = DISTANCE_KM[distanceKey]
    // session_type must be 'run' — runData otherwise holds every session
    // with a logged distance (walks, bike rides synced as 'other', etc.),
    // any of which can have a much faster (or slower) pace_per_km than an
    // actual run and would silently corrupt the estimate.
    const candidates = (runData || []).filter(r => r.session_type === 'run' && Number(r.distance_km) >= km && Number(r.pace_per_km) > 0)
    if (!candidates.length) return null
    const best = candidates.reduce((b, r) => (Number(r.pace_per_km) < Number(b.pace_per_km) ? r : b), candidates[0])
    return {
      time_seconds: Math.round(Number(best.pace_per_km) * km),
      pace_per_km: Number(best.pace_per_km),
      date: best.date,
      distance_km: km,
      estimated: true,
      sourcePace: best.pace_per_km,
      sourceDistanceKm: best.distance_km,
    }
  }
  const bestOrEstimate = (distanceKey) => bestActual(distanceKey) || estimateFromPace(distanceKey)

  function toDecayed(run) {
    if (!run) return null
    return getDecayedValue(Number(run.time_seconds), run.date, 90)
  }

  const r1Actual = bestActual('1k')
  const r5Actual = bestActual('5k')
  const r10Actual = bestActual('10k')
  const rHActual = bestActual('half_marathon')

  // Real-or-estimated — the authoritative value for BOTH tier and display now.
  const r1Show  = bestOrEstimate('1k')
  const r5Show  = bestOrEstimate('5k')
  const r10Show = bestOrEstimate('10k')
  const rHShow  = bestOrEstimate('half_marathon')

  function runEvidence(row, label) {
    if (!row) return null
    return {
      type: 'run_best_effort',
      title: label,
      subtitle: row.estimated
        ? `Uppskattat från snabbaste snittfart (${row.sourceDistanceKm} km-pass) — inget verifierat Strava-segment för denna distans`
        : 'Strava best effort från enskilt löppass',
      value: (row.estimated ? '~' : '') + formatRunTime(Number(row.time_seconds)),
      date: row.date,
      navTarget: row.strava_activity_id ? `/traning?stravaActivity=${row.strava_activity_id}` : '/traning',
      navLabel: 'Träning',
      rows: row.estimated ? [
        { label: 'Källa', value: 'uppskattat — snittfart från längre pass' },
        { label: 'Uppskattad tid', value: '~' + formatRunTime(Number(row.time_seconds)) },
        { label: 'Baserat på', value: `${row.sourceDistanceKm} km-pass i snittfart ${formatRunTime(Number(row.sourcePace))}/km` },
        { label: 'Datum', value: row.date || '—' },
      ] : [
        { label: 'Källa', value: 'run_personal_records' },
        { label: 'Best effort', value: row.strava_effort_name || row.label || label },
        { label: 'Tid', value: formatRunTime(Number(row.time_seconds)) },
        { label: 'Pace', value: row.pace_per_km ? formatRunTime(Number(row.pace_per_km)) + '/km' : '—' },
        { label: 'Distans', value: row.distance_km ? Number(row.distance_km).toFixed(row.distance_km >= 10 ? 1 : 2).replace('.00','') + ' km' : '—' },
        { label: 'Strava activity', value: row.strava_activity_id || '—' },
        { label: 'Rad-ID', value: row.id || '—' },
      ],
    }
  }

  // Strict decayed values — kept only for the staleness/trend signal further
  // down (decayWarning/trend want "do I have a fresh VERIFIED segment", not
  // whether the pace-floor estimate is fresh).
  const r1D  = toDecayed(r1Actual)
  const r5D  = toDecayed(r5Actual)
  const r10D = toDecayed(r10Actual)
  const rHD  = toDecayed(rHActual)
  const rMD  = null

  // Real-or-estimated decayed values — these drive the tier now.
  const r1ShowD  = toDecayed(r1Show)
  const r5ShowD  = toDecayed(r5Show)
  const r10ShowD = toDecayed(r10Show)
  const rHShowD  = toDecayed(rHShow)
  function fmtPR(showD, row) {
    if (!showD) return '—'
    return (row?.estimated ? '~' : '') + formatRunTime(Math.round(showD.value))
  }

  const r1T  = r1ShowD  ? calculateConditioningTier('1k', r1ShowD.value, ctx) : null
  const r5T  = r5ShowD  ? calculateConditioningTier('5k', r5ShowD.value, ctx) : null
  const r10T = r10ShowD ? calculateConditioningTier('10k', r10ShowD.value, ctx) : null
  const rHT  = rHShowD  ? calculateConditioningTier('half_marathon', rHShowD.value, ctx) : null
  const rMT  = rMD  ? calculateConditioningTier('marathon', rMD.value, ctx) : null

  const hasRunData = !!(runPrData?.length || runData?.length)

  // Coverage accepts the pace-derived floor too, not just a verified segment.
  const covered1  = !!r1ShowD
  const covered5  = !!r5ShowD
  const covered10 = !!r10ShowD
  const coveredH  = !!rHShowD

  const allFourCovered = covered1 && covered5 && covered10 && coveredH

  // Tier = weak link of distances with data (real segment or pace floor)
  const kTs = [r1T, r5T, r10T, rHT].filter(Boolean)
  const kTop = allFourCovered && kTs.length > 0
    ? kTs.reduce((min, t) => t.tier < min.tier ? t : min, kTs[0])
    : hasRunData ? { tier: 1, label: 'Botten 50%', color: '#6b7280' } : null

  // Epley formula: e1RM = weight * (1 + reps/30)
  // Brzyckis formula for low reps (≤10): e1RM = weight / (1.0278 - 0.0278*reps)
  function epley(weight, reps) {
    if (!weight || !reps || reps < 1) return null
    if (reps === 1) return weight
    if (reps <= 10) return Math.round(weight / (1.0278 - 0.0278 * reps))
    return Math.round(weight * (1 + reps / 30))
  }

  // For bodyweight exercises (pull-ups, dips, push-ups):
  // weight_kg in DB may be 0 or null → use BW + added weight
  // PULLUP_THRESHOLDS are in "added kg above BW" (0 = can do pull-ups, 20 = +20kg etc)
  function epleyBW(addedWeight, reps, bodyweight) {
    const totalWeight = bodyweight + (addedWeight || 0)
    const e1RM_total = epley(totalWeight, reps)
    return e1RM_total != null ? e1RM_total - bodyweight : null // return added kg equivalent
  }

  function getE1RM(keywords, isBW = false) {
    const since60 = format(subDays(todayDate, 60), 'yyyy-MM-dd')
    let best = 0

    // From personal_records
    const pr = (prData || []).find(p => keywords.some(k => p.exercise_name?.toLowerCase().includes(k)))
    if (pr) {
      const d = pr.updated_at?.slice(0, 10) || pr.date || format(subDays(todayDate, 1), 'yyyy-MM-dd')
      const decayed = getDecayedValue(pr.weight_kg, d, 60)
      if (decayed) {
        const e = isBW
          ? epleyBW(decayed.value, pr.reps || 1, bw)
          : epley(decayed.value, pr.reps || 1)
        if (e != null && e > best) best = e
      }
    }

    // From recent training_exercises (last 60 days)
    const sets = (exData || []).filter(e =>
      keywords.some(k => e.exercise_name?.toLowerCase().includes(k)) &&
      e.training_sessions?.date >= since60
    )
    for (const s of sets) {
      const e = isBW
        ? epleyBW(s.weight_kg || 0, s.reps, bw)  // weight_kg=0 means unweighted
        : epley(s.weight_kg, s.reps)
      if (e != null && e > best) best = e
    }

    return best > 0 ? best : null
  }

  function strengthEvidence(label, keywords, isBW = false) {
    let best = null
    const consider = (candidate) => {
      if (!candidate || candidate.e1rm == null) return
      if (!best || candidate.e1rm > best.e1rm) best = candidate
    }

    for (const p of (prData || [])) {
      if (!keywords.some(k => p.exercise_name?.toLowerCase().includes(k))) continue
      const e = isBW ? epleyBW(p.weight_kg || 0, p.reps || 1, bw) : epley(p.weight_kg, p.reps || 1)
      consider({
        e1rm: e,
        date: p.date,
        source: 'personal_records',
        exerciseName: p.exercise_name,
        rows: [
          { label: 'Källa', value: 'personal_records' },
          { label: 'Övning', value: p.exercise_name },
          { label: 'Set/PR', value: `${p.weight_kg ?? '—'} kg × ${p.reps || 1}` },
          { label: 'Formel', value: (p.reps || 1) <= 10 ? 'Brzycki' : 'Epley' },
          { label: 'Rad-ID', value: p.id || '—' },
        ],
      })
    }

    for (const s of (exData || [])) {
      if (!keywords.some(k => s.exercise_name?.toLowerCase().includes(k))) continue
      const e = isBW ? epleyBW(s.weight_kg || 0, s.reps, bw) : epley(s.weight_kg, s.reps)
      consider({
        e1rm: e,
        date: s.training_sessions?.date,
        source: 'training_exercises',
        sessionId: s.session_id || s.training_sessions?.id,
        exerciseName: s.exercise_name,
        rows: [
          { label: 'Källa', value: 'training_exercises' },
          { label: 'Passdatum', value: s.training_sessions?.date || '—' },
          { label: 'Övning', value: s.exercise_name },
          { label: 'Set', value: `${s.weight_kg ?? '—'} kg × ${s.reps ?? '—'}` },
          { label: 'Setnummer', value: s.set_number != null ? String(s.set_number) : '—' },
          { label: 'Formel', value: Number(s.reps || 0) <= 10 ? 'Brzycki' : 'Epley' },
          { label: 'Pass-ID', value: s.session_id || s.training_sessions?.id || '—' },
          { label: 'Set-ID', value: s.id || '—' },
        ],
      })
    }

    if (!best) return null
    return {
      type: 'strength_e1rm',
      title: label,
      subtitle: 'Bästa e1RM-källa senaste 60 dagar eller PR-rad',
      value: Math.round(best.e1rm) + ' kg',
      date: best.date,
      navTarget: best.exerciseName
        ? `/traning?exercise=${encodeURIComponent(best.exerciseName)}`
        : (best.sessionId ? `/traning?session=${best.sessionId}` : '/traning'),
      navLabel: 'Träning',
      rows: [
        { label: 'e1RM', value: Math.round(best.e1rm) + ' kg' },
        ...best.rows,
      ],
    }
  }

  const bE1RM = getE1RM(['bänkpress','bench'])
  const sE1RM = getE1RM(['knäböj','squat'])
  const dlE1RM = getE1RM(['marklyft','deadlift'])
  const oE1RM = getE1RM(['militärpress','ohp','overhead'])
  const puE1RM = getE1RM(['pull-up','pullup','chins','weighted pull'], true)
  const dipE1RM = getE1RM(['dips','dip'], true)

  const bT = bE1RM != null ? calculateStrengthTier('bench', { multiple: bE1RM/bw }, ctx) : null
  const sT = sE1RM != null ? calculateStrengthTier('squat', { multiple: sE1RM/bw }, ctx) : null
  const dlT = dlE1RM != null ? calculateStrengthTier('deadlift', { multiple: dlE1RM/bw }, ctx) : null
  const oT = oE1RM != null ? calculateStrengthTier('ohp', { multiple: oE1RM/bw }, ctx) : null
  const puT = puE1RM != null ? calculateStrengthTier('pullup', { value: puE1RM }, ctx) : null
  const dipT = dipE1RM != null ? calculateStrengthTier('dip', { value: dipE1RM }, ctx) : null

  // Tier = weak link across ALL required exercises
  // Missing an exercise entirely = T1 (can't be above T1 if core lifts aren't logged)
  // Required for T2+: Bench + Squat + Deadlift. OHP/Pullup/Dips optional (only lower if logged)
  const REQUIRED_LIFTS = [bT, sT, dlT] // bench, squat, deadlift — all required
  const OPTIONAL_LIFTS = [oT, puT, dipT].filter(Boolean) // only count if logged
  const hasStrengthData = [bT, sT, dlT, ...OPTIONAL_LIFTS].some(Boolean)
  const missingRequired = [bT, sT, dlT].some(t => t === null)

  let stTop
  if (!hasStrengthData) {
    stTop = null
  } else if (missingRequired) {
    // Missing one core lift means max T1. Important: label/color must also match T1.
    stTop = { tier: 1, label: TIER_NAMES[1], color: TIER_COLORS[1] }
  } else {
    // All three required lifts logged — weak link wins, optionals can only lower if logged.
    const allLogged = [...REQUIRED_LIFTS, ...OPTIONAL_LIFTS].filter(Boolean)
    stTop = allLogged.reduce((min, t) => t.tier < min.tier ? t : min, allLogged[0])
  }

  const wLogs=(healthData||[]).filter(h=>h.weight_kg).slice(0,14)
  // Single source of truth (user call 2026-09-11) — profiles.target_weight_kg
  // wins over user_settings.goals.* so Dashboard/Halsa never disagree again.
  const wGoal = resolveTargetWeight(profile, userSettings, activeGoals) || 75
  const wNew=wLogs[0]?.weight_kg||bw,wOld=wLogs[wLogs.length-1]?.weight_kg||bw
  const wD=Math.round((wNew-wOld)*10)/10,wK=Math.max(0,Math.round((bw-wGoal)*10)/10)
  const wP=wK<=0?100:Math.max(0,Math.round((1-wK/Math.max(0.1,bw-wGoal+wK))*100))

  const s7=format(subDays(todayDate,7),'yyyy-MM-dd')
  const sl7=(healthData||[]).filter(h=>h.sleep_hours&&h.date>=s7)
  const avgSl=sl7.length?Math.round(sl7.reduce((s,h)=>s+h.sleep_hours,0)/sl7.length*10)/10:null
  const slT=avgSl?calculateHealthTier('sleep',avgSl,ctx):null

  const aG=(studyData||[]).filter(g=>g.courses?.active)
  const avgM=aG.length?Math.round(aG.reduce((s,g)=>s+(g.mastery||0),0)/aG.length):null
  const pT=avgM!=null?calculateStudyTier(avgM,ctx):null
  const byCourse={}
  aG.forEach(g=>{const cn=g.courses?.name||'Okänd';if(!byCourse[cn])byCourse[cn]=[];byCourse[cn].push(g.mastery||0)})

  // Net income for [from, to], per source: PA = logged PA-jobb income (×0.7
  // net) or, when none is logged, the shift estimate; Erik Norling is added
  // on top. (Previously ANY logged income — e.g. one Erik payment — replaced
  // the whole PA estimate, so the PA salary silently vanished.)
  function periodNet(from, to) {
    const inRange = (d) => d >= from && (!to || d <= to)
    const sumSource = (src) => (incomeData||[])
      .filter(i => i.source === src && inRange(i.date))
      .reduce((s,i) => s + (Number(i.amount) || 0), 0)
    const paLogged = sumSource('PA-jobb') * 0.7
    const paEst = (paData||[]).filter(sh => inRange(sh.date)).reduce((s,sh) => s + (sh.estimated_pay||0), 0) * 0.7
    return (paLogged > 0 ? paLogged : paEst) + sumSource('Erik Norling')
  }
  const totCurrent = periodNet(periodStart, null)
  const totPrev = (prevStart && prevEnd) ? periodNet(prevStart, prevEnd) : 0
  // Tier on the last complete period; fall back to the current one only when
  // there is no previous data at all (new user).
  const totPA = totPrev > 0 ? totPrev : totCurrent

  // Savings: latest net_worth_history snapshot if available, otherwise sum cash assets
  const sav = nwhData?.[0]?.total_sek || (assetsData||[]).reduce((s,a) => s + (a.type === 'cash' ? (a.manual_price_sek||0) : 0), 0) || null
  const incT=totPA?calculateEconomyTier('income',totPA,ctx):null
  const savT=sav!=null?calculateEconomyTier('savings',sav,ctx):null
  // Ekonomi: min of logged metrics — weak link (high income doesn't offset zero savings)
  const eTs=[incT,savT].filter(Boolean)
  const eTop=eTs.length?eTs.reduce((min,t)=>t.tier<min.tier?t:min,eTs[0]):null

  function a7(field, fallbackField){
    const v=(healthData||[]).filter(h=>h.date>=s7).map(h=>h[field] ?? (fallbackField ? h[fallbackField] : null)).filter(x=>x!=null)
    return v.length?Math.round(v.reduce((s,x)=>s+Number(x),0)/v.length*10)/10:null
  }
  const aE=a7('energy_level','energy'), aMo=a7('mood'), aSteps=a7('steps')
  const alcohol7=(healthData||[]).filter(h=>h.date>=s7&&h.alcohol_units!=null).reduce((sum,h)=>sum+Number(h.alcohol_units||0),0)
  const alcoholLogged=(healthData||[]).some(h=>h.date>=s7&&h.alcohol_units!=null)
  const activeSupplements = Array.isArray(userSettings?.goals?.active_supplements) && userSettings.goals.active_supplements.length
    ? userSettings.goals.active_supplements.filter(Boolean)
    : DEFAULT_SUPPLEMENTS
  const supp7 = (supplementLogs || []).filter(l => l.date >= s7)
  const supplementTaken7 = supp7.filter(l => l.taken).length
  const supplementExpected7 = activeSupplements.length * 7
  const supplementCompliance = supp7.length && supplementExpected7 ? Math.round((supplementTaken7 / supplementExpected7) * 100) : null
  // Energi/Humör are DISPLAY only (eT/moT below) — user call 2026-09-11: the
  // merged Sömn+Hälsa category's tier is driven by sleep/vikttrend/steg/
  // kosttillskott/alkohol instead, not energy/mood.
  const eT=aE!=null?getTier(aE,ENERGY_THRESHOLDS,true):null
  const moT=aMo!=null?getTier(aMo,MOOD_THRESHOLDS,true):null
  const alcoholT=alcoholLogged?getTier(alcohol7,[14,10,7,5,3,1,0.1],false):null
  const supplementT=supplementCompliance!=null?getTier(supplementCompliance,[50,60,70,80,90,95,99],true):null
  const stepsT=aSteps!=null?calculateHealthTier('steps',aSteps,ctx):null
  const wgT=bw?calculateHealthTier('weight_goal',{current:bw,target:wGoal},ctx):null
  // Sömn+Hälsa merge (user call 2026-09-11) — weakest-link across the 5
  // signals named above. slT (sleep) computed earlier, above wLogs/wGoal.
  const wTs=[slT,wgT,stepsT,alcoholT,supplementT].filter(Boolean)
  const wTop=wTs.length?wTs.reduce((min,t)=>t.tier<min.tier?t:min,wTs[0]):null

  // Self-scoped to the trailing 28d regardless of how wide skillData was fetched.
  function am(sn){
    const cutoff=format(subDays(todayDate,28),'yyyy-MM-dd')
    const l=(skillData||[]).filter(s=>s.skill===sn && s.date>=cutoff)
    return l.length?Math.round(l.reduce((s,x)=>s+x.minutes,0)/4):0
  }

  // Languages: tier comes from languageTier() (v2, three-gate: cumulative
  // cards + cumulative CI hours + recent consistency — see languageSkill.js
  // header). languageBlend() stays a display-only weekly figure.
  const spB=languageBlend(skillData,'spanish'), srB=languageBlend(skillData,'serbian'), gnB=languageBlend(skillData,'german')
  const spT=languageTier(skillData,'spanish'), srT=languageTier(skillData,'serbian'), gnT=languageTier(skillData,'german')
  // Gitarr (user call 2026-09-12: "total veckovolym är bättre med
  // gitarren") — reverted from the 2026-09-11 consistency-days experiment
  // back to weekly-average minutes (getSkillTier).
  const gtM=am('guitar')
  const gtT=getSkillTier(gtM)
  const skH=!!(skillData?.length)
  // Each of the 4 is its own bottleneck (weakest link, not best-of) — but
  // (user call 2026-09-12) if there's ANY data at all across the 4, the
  // category floors at T1 "Har börjat" rather than falling to T0 and
  // being silently excluded from Maxx Score (rankCats requires a truthy
  // tier) just because one specific untouched skill drags the min to 0.
  const skWeakest=[spT,srT,gtT,gnT].reduce((b,t)=>t.tier<b.tier?t:b,spT)
  const skTop=(skH && skWeakest.tier===0) ? { tier:1, label:'Har börjat', color:'#4b5563' } : skWeakest

  // ── Tier ladders: ONE source for bottleneck, "Lås upp" and "Alla tiers" ──
  // Each category lists its components with the SAME value and the SAME
  // (profile-adjusted) thresholds the tier engine used above, plus the
  // category's weakest-link rule. levelUp (next tier) and tierGuide (every
  // tier) are both derived from that list, so what the modal says blocks you
  // is exactly what the tier math is gated on. (Before 2026-09-29 the modal
  // used a hand-written requirement table and separate static targets that
  // had drifted: e.g. Hälsa named "vikt mot mål" as the blocker while its
  // real blockers were sömn + kosttillskott; gitarr was one tier off.)
  //
  // Component: { label, value, tier, thresholds (index i → tier i+2),
  //   higherIsBetter, fmt, gapFmt?, mode: 'required' | 'ifLogged', hint?, reqScale? }
  //   required → missing value = "Saknas" blocker, caps the category at T1
  //   ifLogged → only counts once logged (matches the engine's filter(Boolean))
  const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n || 0)))
  const fmtKr = (n) => `${Math.round(n).toLocaleString('sv-SE')} kr`
  const thr = (tierObj, fallback) => Array.isArray(tierObj?.thresholds) ? tierObj.thresholds : fallback

  function ladder(components, currentTier, maxTier, { notes = [] } = {}) {
    const comps = components.filter(c => c.mode === 'required' || c.value != null)
    if (!comps.length) return { levelUp: null, tierGuide: null }
    const cur = currentTier || 1
    const next = Math.min(cur + 1, maxTier)
    const reqFor = (c, t) => {
      const target = c.thresholds[t - 2]
      const missing = c.value == null
      if (target === Infinity) {
        // No bar at this tier (e.g. målvikt: any distance is at least T2).
        return { label: c.label, current: c.value, target: null, met: !missing, missing, progress: missing ? 0 : 100,
          gapLabel: missing ? 'Saknas' : 'Klar', currentLabel: missing ? (c.hint || '—') : c.fmt(c.value), targetLabel: 'inget krav' }
      }
      const met = !missing && (c.tier ?? 0) >= t
      let progress = 0
      if (!missing) {
        progress = met ? 100 : c.higherIsBetter
          ? (target > 0 ? (c.value / target) * 100 : 0)
          : (c.value > 0 ? (target / c.value) * 100 : 0)
      }
      const gapLabel = missing ? 'Saknas' : met ? 'Klar'
        : c.gapFmt ? c.gapFmt(c.value, target)
        : c.higherIsBetter ? `+${c.fmt(target - c.value)}` : `−${c.fmt(c.value - target)}`
      // current/target are exposed in the unit rankUp's effort rates expect
      // (kg for lifts) — `reqScale` converts from the tier unit (x BW).
      const k = c.reqScale || 1
      return {
        label: c.label, current: missing ? null : c.value * k, target: target * k, met, missing,
        progress: clampPct(progress), gapLabel,
        currentLabel: missing ? (c.hint || '—') : c.fmt(c.value),
        targetLabel: `${c.higherIsBetter ? '≥' : '≤'} ${c.fmt(target)}`,
      }
    }
    const atMax = cur >= maxTier
    const requirements = comps.map(c => reqFor(c, next))
    const blockers = atMax ? [] : requirements.filter(r => !r.met)
    // Weakest link: EVERY blocker must clear for the next tier. Missing data
    // first (cheapest fix: just log it), then closest-to-done.
    const ordered = [...blockers].sort((x, y) => (y.missing - x.missing) || (y.progress - x.progress))
    const levelUp = {
      currentTier: cur, nextTier: next, maxTier,
      title: atMax ? 'Maxxad nivå' : `T${cur} → T${next}`,
      progressPct: atMax ? 100 : clampPct(requirements.reduce((m, r) => Math.min(m, r.progress), 100)),
      primaryBottleneck: atMax ? 'Maxxad nivå'
        : ordered.length ? ordered.map(r => `${r.label}: ${r.gapLabel}`).join(' · ')
        : 'Inget blockerar nästa nivå',
      requirements: atMax ? requirements : [...ordered, ...requirements.filter(r => r.met)],
      blockers: ordered,
    }
    const tierGuide = []
    for (let t = 2; t <= maxTier; t++) {
      tierGuide.push({
        tier: t, label: TIER_NAMES[t] || `T${t}`,
        reqs: [
          ...comps.map(c => {
            const r = reqFor(c, t)
            return `${r.met ? '✓ ' : ''}${c.label}: ${r.targetLabel}`
          }),
          ...(t === 2 ? notes : []),
        ],
      })
    }
    return { levelUp, tierGuide }
  }

  // Kondition — all four distances required (a missing one caps at T1).
  const RUN_BASE_FALLBACK = { '1k': RUN_5K_THRESHOLDS.map(t => Math.round(t * 0.195)), '5k': RUN_5K_THRESHOLDS, '10k': RUN_10K_THRESHOLDS, half_marathon: RUN_HALF_THRESHOLDS }
  const runComp = (label, key, showD, tierObj, km) => ({
    label, value: showD?.value ?? null, tier: tierObj?.tier ?? null,
    thresholds: thr(tierObj, thr(calculateConditioningTier(key, null, ctx), RUN_BASE_FALLBACK[key])),
    higherIsBetter: false, mode: 'required',
    fmt: (v) => formatRunTime(Math.round(v)),
    gapFmt: (v, t) => `${formatRunTime(Math.round(v - t))} snabbare`,
    hint: `Saknas – spring ≥ ${km} km i ett pass`,
  })
  const kondLadder = hasRunData ? ladder([
    runComp('1 km', '1k', r1ShowD, r1T, 1),
    runComp('5 km', '5k', r5ShowD, r5T, 5),
    runComp('10 km', '10k', r10ShowD, r10T, 10),
    runComp('Halvmara', 'half_marathon', rHShowD, rHT, 21.1),
  ], kTop?.tier || 1, 8, { notes: ['Alla fyra distanser måste finnas (Strava-segment eller snittfart från ett längre pass, senaste 90 dagarna) – annars max T1'] }) : { levelUp: null, tierGuide: null }

  // Styrka — bänk/knäböj/marklyft required; OHP/pull-up/dips lower it only if logged.
  const multFmt = (m) => `${Math.round(m * 100) / 100}x BW${bw ? ` (${Math.round(m * bw)} kg)` : ''}`
  const LIFT_BASE_FALLBACK = { bench: BENCH_THRESHOLDS, squat: SQUAT_THRESHOLDS, deadlift: DEADLIFT_THRESHOLDS, ohp: OHP_THRESHOLDS }
  const liftComp = (label, lift, e1rm, tierObj, mode) => ({
    label, value: e1rm != null && bw ? Math.round((e1rm / bw) * 100) / 100 : null, tier: tierObj?.tier ?? null,
    thresholds: thr(tierObj, thr(calculateStrengthTier(lift, { multiple: null }, ctx), LIFT_BASE_FALLBACK[lift])),
    higherIsBetter: true, mode, fmt: multFmt, reqScale: bw || 1,
    gapFmt: (v, t) => bw ? `+${Math.ceil((t - v) * bw)} kg` : `+${Math.round((t - v) * 100) / 100}x BW`,
    hint: 'Saknas – logga ett tungt set (senaste 60 dagarna)',
  })
  const addedFmt = (v) => `+${Math.round(v)} kg`
  const bwComp = (label, lift, e1rm, tierObj) => ({
    label, value: e1rm ?? null, tier: tierObj?.tier ?? null,
    thresholds: thr(tierObj, thr(calculateStrengthTier(lift, { value: null }, ctx), PULLUP_THRESHOLDS)),
    higherIsBetter: true, mode: 'ifLogged', fmt: addedFmt, gapFmt: (v, t) => `+${Math.ceil(t - v)} kg`,
  })
  const strengthLadder = hasStrengthData && bw ? ladder([
    liftComp('Bänkpress', 'bench', bE1RM, bT, 'required'),
    liftComp('Knäböj', 'squat', sE1RM, sT, 'required'),
    liftComp('Marklyft', 'deadlift', dlE1RM, dlT, 'required'),
    liftComp('Militärpress', 'ohp', oE1RM, oT, 'ifLogged'),
    bwComp('Pull-up (extravikt)', 'pullup', puE1RM, puT),
    bwComp('Dips (extravikt)', 'dip', dipE1RM, dipT),
  ], stTop?.tier || 1, 8, { notes: ['Bänk, knäböj och marklyft krävs alla (e1RM, senaste 60 dagarna) – saknas en är max T1. Övriga övningar kan bara sänka, och bara om de loggats.'] }) : { levelUp: null, tierGuide: null }

  // Studier — mastery snitt över aktiva kursers lärandemål.
  const studyLadder = avgM != null ? ladder([
    { label: 'Mastery snitt', value: avgM, tier: pT?.tier ?? null, thresholds: [20, 40, 60, 80],
      higherIsBetter: true, mode: 'required', fmt: (v) => `${Math.round(v)}%` },
  ], pT?.tier || 1, 5) : { levelUp: null, tierGuide: null }

  // Ekonomi — weakest of the metrics that have data.
  const econLadder = (totPA || sav != null) ? ladder([
    { label: totPrev > 0 ? 'Månadsnetto (förra perioden)' : 'Månadsnetto', value: totPA || null, tier: incT?.tier ?? null,
      thresholds: thr(incT, thr(calculateEconomyTier('income', null, ctx), INCOME_THRESHOLDS)), higherIsBetter: true, mode: 'ifLogged', fmt: fmtKr },
    { label: 'Sparkapital', value: sav, tier: savT?.tier ?? null,
      thresholds: thr(savT, thr(calculateEconomyTier('savings', null, ctx), SAVINGS_THRESHOLDS)), higherIsBetter: true, mode: 'ifLogged', fmt: fmtKr },
  ], eTop?.tier || 1, 8) : { levelUp: null, tierGuide: null }

  // Hälsa — weakest of the five signals that have data (sleep = snitt av
  // LOGGADE nätter senaste 7d). Weight tier = % from målvikt (≤18/12/8/5/3/1%).
  const weightGap = bw && wGoal ? Math.round(Math.abs(bw - wGoal) * 10) / 10 : null
  const wellLadder = wTs.length ? ladder([
    { label: 'Sömnsnitt 7d', value: avgSl, tier: slT?.tier ?? null,
      thresholds: thr(slT, SLEEP_DURATION_THRESHOLDS), higherIsBetter: true, mode: 'ifLogged', fmt: (v) => `${Math.round(v * 100) / 100} h` },
    { label: 'Steg/dag 7d', value: aSteps, tier: stepsT?.tier ?? null,
      thresholds: thr(stepsT, STEPS_THRESHOLDS), higherIsBetter: true, mode: 'ifLogged', fmt: (v) => `${Math.round(v).toLocaleString('sv-SE')} steg` },
    { label: 'Avstånd till målvikt', value: weightGap, tier: wgT?.tier ?? null,
      thresholds: wGoal ? [Infinity, ...[0.18, 0.12, 0.08, 0.05, 0.03, 0.01].map(p => Math.round(wGoal * p * 10) / 10)] : [],
      higherIsBetter: false, mode: 'ifLogged', fmt: (v) => `${Math.round(v * 10) / 10} kg`,
      gapFmt: (v, t) => `${Math.round((v - t) * 10) / 10} kg kvar` },
    { label: 'Alkohol 7d', value: alcoholLogged ? Math.round(alcohol7 * 10) / 10 : null, tier: alcoholT?.tier ?? null,
      thresholds: [14, 10, 7, 5, 3, 1, 0.1], higherIsBetter: false, mode: 'ifLogged', fmt: (v) => `${v} enheter` },
    { label: 'Kosttillskott 7d', value: supplementCompliance, tier: supplementT?.tier ?? null,
      thresholds: [50, 60, 70, 80, 90, 95, 99], higherIsBetter: true, mode: 'ifLogged', fmt: (v) => `${Math.round(v)}%` },
  ], wTop?.tier || 1, 8, { notes: [`Sömn räknas som snitt av loggade nätter (${sl7.length} av 7 senaste). Mått utan data räknas inte.`] }) : { levelUp: null, tierGuide: null }

  // Färdigheter — each language is the weakest of 3 gates, gitarr is weekly
  // minutes; the category is the weakest of all (floored at T1 once anything
  // is logged). Thresholds come straight from languageSkill / getSkillTier.
  const langComps = (name, t) => [
    { label: `${name} · kort`, value: t.cardsTotal, tier: t.tier === 0 ? 0 : t.cardsTier, thresholds: CARDS_THRESHOLDS,
      higherIsBetter: true, mode: 'required', fmt: (v) => `${Math.round(v).toLocaleString('sv-SE')} kort` },
    { label: `${name} · CI`, value: t.ciHoursTotal, tier: t.tier === 0 ? 0 : t.ciTier, thresholds: CI_HOURS_THRESHOLDS,
      higherIsBetter: true, mode: 'required', fmt: (v) => `${Math.round(v * 10) / 10} h` },
    { label: `${name} · aktiva dagar/28`, value: t.activeDays, tier: t.tier === 0 ? 0 : t.consistencyTier, thresholds: CONSISTENCY_DAY_THRESHOLDS,
      higherIsBetter: true, mode: 'required', fmt: (v) => `${Math.round(v)} dagar` },
  ]
  const skillLadder = skH ? ladder([
    ...langComps('Spanska', spT), ...langComps('Serbiska', srT), ...langComps('Tyska', gnT),
    { label: 'Gitarr', value: gtM, tier: gtT?.tier ?? 0, thresholds: [1, 30, 60, 120, 240],
      higherIsBetter: true, mode: 'required', fmt: (v) => `${Math.round(v)} min/v` },
  ], skTop?.tier || 1, 6, { notes: ['Varje språk = svagaste av kort, CI-timmar och aktiva dagar. Kategorin = svagaste av alla fyra färdigheterna.'] }) : { levelUp: null, tierGuide: null }

  const r1Evidence = runEvidence(r1Show, '1 km PR')
  const r5Evidence = runEvidence(r5Show, '5 km PR')
  const r10Evidence = runEvidence(r10Show, '10 km PR')
  const rHEvidence = runEvidence(rHShow, 'Halvmara')
  const bEvidence = strengthEvidence('Bänk e1RM', ['bänkpress','bench'])
  const sEvidence = strengthEvidence('Knäböj e1RM', ['knäböj','squat'])
  const dlEvidence = strengthEvidence('Marklyft e1RM', ['marklyft','deadlift'])

  const cats = [
    {id:'kondition',name:'Kondition',icon:'kondition',tier:kTop,hasData:hasRunData,pct:kTop?Math.round((kTop.tier/8)*100):0,decayWarning:[r5D,r10D,rHD,rMD].some(d=>d?.stale),trend:r5D?.daysSince<14?'up':'neutral',
      metrics:[
        {label:'1km PR',value:fmtPR(r1ShowD, r1Show),highlight:true,evidence:r1Evidence},
        {label:'5km PR',value:fmtPR(r5ShowD, r5Show),evidence:r5Evidence},
        {label:'10km PR',value:fmtPR(r10ShowD, r10Show),evidence:r10Evidence}
      ],
      details:[{label:'1km PR',value:fmtPR(r1ShowD, r1Show),sourceEvidence:r1Evidence,tierInfo:r1T},{label:'5km PR',value:fmtPR(r5ShowD, r5Show),sourceEvidence:r5Evidence,tierInfo:r5T},{label:'10km PR',value:fmtPR(r10ShowD, r10Show),sourceEvidence:r10Evidence,tierInfo:r10T},{label:'Halvmara',value:fmtPR(rHShowD, rHShow),sourceEvidence:rHEvidence,tierInfo:rHT},{label:'Mara',value:rMD?formatRunTime(Math.round(rMD.value)):'—',tierInfo:rMT}],
      chartData:(runData||[]).filter(r=>r.distance_km>=4.5&&r.distance_km<=11).slice(0,20).reverse().map(r=>({date:r.date.slice(5),Pace:r.pace_per_km?Math.round(r.pace_per_km/60*10)/10:null})),
      chartLines:[{key:'Pace',label:'Pace (min/km)',color:'#4f8ef7'}],levelUp:kondLadder.levelUp,tierGuide:kondLadder.tierGuide,navTarget:'/traning',navLabel:'Träning'},
    {id:'styrka',name:'Styrka',icon:'styrka',tier:stTop,hasData:hasStrengthData,pct:strengthLadder.levelUp?.progressPct ?? (stTop?Math.round((stTop.tier/8)*100):0),decayWarning:false,trend:'neutral',
      perExercise: [
        bT && { label:'Bänk',  tier: bT, value: bE1RM, mult: bE1RM ? Math.round(bE1RM/bw*100)/100 : null },
        sT && { label:'Knäböj', tier: sT, value: sE1RM, mult: sE1RM ? Math.round(sE1RM/bw*100)/100 : null },
        dlT && { label:'Mark',  tier: dlT, value: dlE1RM, mult: dlE1RM ? Math.round(dlE1RM/bw*100)/100 : null },
        oT && { label:'OHP',   tier: oT, value: oE1RM, mult: oE1RM ? Math.round(oE1RM/bw*100)/100 : null },
        puT && { label:'Pull-up', tier: puT, value: puE1RM, isBW: true },
        dipT && { label:'Dips', tier: dipT, value: dipE1RM, isBW: true },
      ].filter(Boolean),
      metrics:[
        {label:'Bänk e1RM',value:bE1RM?Math.round(bE1RM)+' kg':'—',highlight:true,evidence:bEvidence},
        {label:'Marklyft e1RM',value:dlE1RM?Math.round(dlE1RM)+' kg':'—',evidence:dlEvidence},
        {label:'Knäböj e1RM',value:sE1RM?Math.round(sE1RM)+' kg':'—',evidence:sEvidence}
      ],
      details:[{label:'Bänkpress e1RM',value:bE1RM?Math.round(bE1RM)+' kg ('+Math.round(bE1RM/bw*100)/100+'x BW)':'—',sourceEvidence:bEvidence,tierInfo:bT},{label:'Knäböj e1RM',value:sE1RM?Math.round(sE1RM)+' kg ('+Math.round(sE1RM/bw*100)/100+'x BW)':'—',sourceEvidence:sEvidence,tierInfo:sT},{label:'Marklyft e1RM',value:dlE1RM?Math.round(dlE1RM)+' kg ('+Math.round(dlE1RM/bw*100)/100+'x BW)':'—',sourceEvidence:dlEvidence,tierInfo:dlT},{label:'Militärpress e1RM',value:oE1RM?Math.round(oE1RM)+' kg':'—',tierInfo:oT},{label:'Weighted pull-up e1RM',value:puE1RM?'+'+Math.round(puE1RM)+' kg':'—',tierInfo:puT}],
      chartData:[],chartLines:[],levelUp:strengthLadder.levelUp,tierGuide:strengthLadder.tierGuide,navTarget:'/traning',navLabel:'Träning'},
    {id:'plugg',name:'Studier',icon:'plugg',tier:pT,hasData:avgM!=null,pct:avgM!=null?avgM:0,decayWarning:false,trend:'neutral',
      metrics:[
        {label:'Mastery snitt',value:avgM!=null?avgM+'%':'—',highlight:true},
        {label:'Aktiva mål',value:aG.length},
      ],
      details:[
        {label:'Mastery snitt',value:avgM!=null?avgM+'%':'—',tierInfo:pT},
        ...Object.entries(byCourse).map(([c,v])=>({label:c,value:Math.round(v.reduce((s,x)=>s+x,0)/v.length)+'%'})),
      ],
      chartData:[],chartLines:[],levelUp:studyLadder.levelUp,tierGuide:studyLadder.tierGuide,navTarget:'/plugg',navLabel:'Studier'},
    {id:'fardigheter',name:'Färdigheter',icon:'fardigheter',tier:skTop,hasData:skH,pct:skTop?.tier?Math.round((skTop.tier/6)*100):0,decayWarning:false,trend:'neutral',
      // User call 2026-09-11: the small satellite bubbles ARE the 4 skills
      // (not a rolled-up "level"/"best language") — each highlighted when
      // it's the one currently binding skTop (the weakest-link bottleneck).
      metrics:[
        {label:'Spanska',value:spT?.tier?`T${spT.tier}`:'—',highlight:(spT?.tier??0)===skTop?.tier},
        {label:'Tyska',value:gnT?.tier?`T${gnT.tier}`:'—',highlight:(gnT?.tier??0)===skTop?.tier},
        {label:'Serbiska',value:srT?.tier?`T${srT.tier}`:'—',highlight:(srT?.tier??0)===skTop?.tier},
        {label:'Gitarr',value:gtT?.tier?`T${gtT.tier}`:'—',highlight:(gtT?.tier??0)===skTop?.tier},
      ],
      details:[
        {label:'Spanska',value:`${languageLabel(spB)} · ${spT.cardsTotal} kort · ${spT.ciHoursTotal}h CI totalt`,tierInfo:spT?.tier?spT:null},
        {label:'Serbiska',value:`${languageLabel(srB)} · ${srT.cardsTotal} kort · ${srT.ciHoursTotal}h CI totalt`,tierInfo:srT?.tier?srT:null},
        {label:'Tyska',value:`${languageLabel(gnB)} · ${gnT.cardsTotal} kort · ${gnT.ciHoursTotal}h CI totalt`,tierInfo:gnT?.tier?gnT:null},
        {label:'Gitarr',value:gtM?`${gtM} min/v`:'—',tierInfo:gtT?.tier?gtT:null},
      ],
      chartData:[],chartLines:[],levelUp:skillLadder.levelUp,tierGuide:skillLadder.tierGuide,navTarget:'/plugg',navLabel:'Plugg'},
    {id:'ekonomi',name:'Ekonomi',icon:'ekonomi',tier:eTop,hasData:!!(totPA||sav!=null),pct:eTop?Math.round((eTop.tier/8)*100):0,decayWarning:false,trend:'neutral',
      metrics:[{label:totPrev>0?'Netto förra perioden':'Netto denna period',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',highlight:true},{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—'}],
      details:[{label:totPrev>0?'Netto förra perioden':'Netto denna period',value:totPA?Math.round(totPA).toLocaleString('sv-SE')+' kr':'—',tierInfo:incT},...(totPrev>0?[{label:'Netto denna period (hittills)',value:Math.round(totCurrent).toLocaleString('sv-SE')+' kr'}]:[]),{label:'Sparkapital',value:sav!=null?sav.toLocaleString('sv-SE')+' kr':'—',tierInfo:savT}],
      chartData:[],chartLines:[],levelUp:econLadder.levelUp,tierGuide:econLadder.tierGuide,navTarget:'/ekonomi',navLabel:'Ekonomi'},
    {id:'halsa',name:'Hälsa',icon:'halsa',tier:wTop,hasData:wTs.length>0 || !!latestW?.weight_kg,pct:wTop?Math.round((wTop.tier/8)*100):(latestW?.weight_kg?wP:0),decayWarning:false,trend:'neutral',
      // Sömn+Hälsa merge (user call 2026-09-11): tier now driven by sömn/
      // vikttrend/steg/kosttillskott/alkohol (wTs above) — Energi/Humör are
      // shown below for context but no longer feed the tier (no tierInfo).
      metrics:[
        {label:'Sömn 7d',value:avgSl?avgSl+'h':'—',highlight:true},
        {label:'Steg 7d',value:aSteps!=null?Math.round(aSteps).toLocaleString('sv-SE'):'—'},
        {label:'Vikttrend',value:wLogs.length?(wD>0?'+':'')+wD+' kg':'—'},
        {label:'Kosttillskott',value:supplementCompliance!=null?supplementCompliance+'%':'—'},
        {label:'Alkohol 7d',value:alcoholLogged?Math.round(alcohol7*10)/10+' enh':'—'},
      ],
      details:[
        {label:'Sömnsnitt 7d',value:avgSl?avgSl+' timmar':'—',tierInfo:slT},
        {label:'Loggfrekvens sömn',value:sl7.length+' av 7 dagar'},
        {label:'Steg/dag (7d)',value:aSteps!=null?Math.round(aSteps).toLocaleString('sv-SE'):'—',tierInfo:stepsT},
        {label:'Vikt',value:bw?bw+' kg':'—'},
        {label:'Målvikt',value:wGoal? wGoal+' kg':'—'},
        {label:'Kvar till målvikt',value:bw&&wGoal? wK+' kg':'—',tierInfo:wgT},
        {label:'Vikttrend 14d',value:wLogs.length?(wD>0?'+':'')+wD+' kg':'—'},
        {label:'Kosttillskott',value:supplementCompliance!=null?supplementCompliance+'%':'Ej loggat',tierInfo:supplementT},
        {label:'Alkohol 7d',value:alcoholLogged?Math.round(alcohol7*10)/10+' enheter':'Ej loggat',tierInfo:alcoholT},
        {label:'Energi (7d)',value:aE!=null?aE+'/10':'—'},
        {label:'Humör (7d)',value:aMo!=null?aMo+'/10':'—'},
      ],
      chartData:(healthData||[]).filter(h=>h.sleep_hours||h.steps!=null||h.alcohol_units!=null).slice(0,14).reverse().map(h=>({date:h.date.slice(5),Sömn:h.sleep_hours,Steg:h.steps,Alkohol:h.alcohol_units})),
      chartLines:[{key:'Sömn',label:'Sömn (h)',color:'#8b5cf6'},{key:'Steg',label:'Steg',color:'#10b981'},{key:'Alkohol',label:'Alkohol',color:'#f87171'}],
      levelUp:wellLadder.levelUp,tierGuide:wellLadder.tierGuide,
      navTarget:'/halsa',navLabel:'Hälsa'},
  ]
  // Attach profile-aware percentile to each category (data for cards/DetailModal).
  for (const c of cats) { if (c.tier?.tier) c.percentile = tierToPercentile(c.tier.tier) }

  return { cats, bodyWeight: bw, profile, ctx, tierProfileId }
}

export function tierSnapshotRow(cats, userId, dateStr) {
  const t = (id) => cats.find(c => c.id === id)?.tier?.tier ?? null
  return {
    user_id: userId,
    date: dateStr,
    kondition: t('kondition'),
    styrka:    t('styrka'),
    plugg:     t('plugg'),
    ekonomi:   t('ekonomi'),
    valmående: t('halsa'), // merged Sömn+Hälsa — column predates the merge
    fardigheter: t('fardigheter'),
    score_version: SCORE_VERSION,
  }
}
