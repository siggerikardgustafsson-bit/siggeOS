import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { subDays, format, differenceInDays, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import CategoryCard from '../components/Dashboard/CategoryCard'
import DetailModal from '../components/Dashboard/DetailModal'
import QuickLog from '../components/Dashboard/QuickLog'
import {
  getTier, getStudyTier, getSkillTier, getDecayedValue, calcOverallTier,
  estimateVO2max, calc1RM, formatRunTime,
  VO2MAX_THRESHOLDS, RUN_5K_THRESHOLDS, RUN_10K_THRESHOLDS, RUN_HALF_THRESHOLDS, RUN_MARA_THRESHOLDS,
  BENCH_THRESHOLDS, SQUAT_THRESHOLDS, DEADLIFT_THRESHOLDS, OHP_THRESHOLDS, PULLUP_THRESHOLDS,
  SLEEP_DURATION_THRESHOLDS,
  INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
  ENERGY_THRESHOLDS, MOOD_THRESHOLDS, STRESS_THRESHOLDS, STEPS_THRESHOLDS,
  TIER_COLORS, TIER_NAMES,
} from '../components/Dashboard/tierUtils'

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])
  const [overallTier, setOverallTier] = useState(null)
  const [bodyWeight, setBodyWeight] = useState(77)
  const [refreshKey, setRefreshKey] = useState(0)
  const [userId, setUserId] = useState(null)

  const todayDate = new Date()

  // Get user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id)
    })
  }, [])

  const fetchAllData = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const since90 = format(subDays(todayDate, 90), 'yyyy-MM-dd')
      const since30 = format(subDays(todayDate, 30), 'yyyy-MM-dd')

      const [
        { data: runData },
        { data: prData },
        { data: healthData },
        { data: studyData },
        { data: paData },
        { data: skillData },
        { data: userSettings },
      ] = await Promise.all([
        // Löpning — training_sessions med distance
        supabase.from('training_sessions')
          .select('id, date, distance_km, time_seconds, pace_per_km, duration_minutes')
          .eq('user_id', userId)
          .gte('date', since90)
          .not('distance_km', 'is', null)
          .order('date', { ascending: false }),
        // Styrka — personal_records
        supabase.from('personal_records')
          .select('exercise_name, weight_kg, reps, date, updated_at')
          .eq('user_id', userId)
          .order('weight_kg', { ascending: false }),
        // Hälsa
        supabase.from('health_logs')
          .select('date, weight_kg, sleep_hours, energy_level, stress_level, mood, steps')
          .eq('user_id', userId)
          .gte('date', since90)
          .order('date', { ascending: false }),
        // Plugg
        supabase.from('learning_goals')
          .select('id, description, mastery, course_id, courses(name, active)')
          .eq('user_id', userId),
        // PA-pass
        supabase.from('pa_shifts')
          .select('date, estimated_pay, hours_worked')
          .eq('user_id', userId)
          .gte('date', since30),
        // Färdigheter
        supabase.from('skill_logs')
          .select('date, skill, minutes')
          .eq('user_id', userId)
          .gte('date', since30),
        // User settings
        supabase.from('user_settings')
          .select('goals')
          .eq('user_id', userId)
          .single(),
      ])

      // ── KROPP / bodyweight ──────────────────────────────────────────────────
      const latestWeight = (healthData || []).find(h => h.weight_kg)
      const currentBW = latestWeight?.weight_kg || 77
      setBodyWeight(currentBW)

      // ── KONDITION ──────────────────────────────────────────────────────────
      // Hitta bästa tid per distans från training_sessions
      function bestRunForDistance(targetKm, tolerancePct = 0.05) {
        const eligible = (runData || []).filter(r =>
          r.distance_km >= targetKm * (1 - tolerancePct) &&
          r.distance_km <= targetKm * (1 + tolerancePct) &&
          (r.time_seconds || r.pace_per_km)
        )
        if (!eligible.length) return null
        return eligible.reduce((best, r) => {
          const tBest = best.time_seconds || (best.pace_per_km * targetKm)
          const tThis = r.time_seconds || (r.pace_per_km * targetKm)
          return tThis < tBest ? r : best
        }, eligible[0])
      }

      // Estimera tid för en distans från alla runs via pace
      function estimatedTimeForDist(targetKm) {
        const allWithPace = (runData || []).filter(r => r.pace_per_km && r.distance_km >= targetKm * 0.5)
        if (!allWithPace.length) return null
        // Ta den snabbaste genomsnittspacen från runs >= 50% av distansen
        const best = allWithPace.reduce((b, r) => r.pace_per_km < b.pace_per_km ? r : b, allWithPace[0])
        return { time_seconds: Math.round(best.pace_per_km * targetKm), date: best.date, estimated: true }
      }

      const run1k = bestRunForDistance(1) || estimatedTimeForDist(1)
      const run5k = bestRunForDistance(5) || estimatedTimeForDist(5)
      const run10k = bestRunForDistance(10) || estimatedTimeForDist(10)
      const runHalf = bestRunForDistance(21.1, 0.03)
      const runMara = bestRunForDistance(42.2, 0.02)

      function runDecay(runObj, decayDays) {
        if (!runObj) return null
        return getDecayedValue(runObj.time_seconds, runObj.date, decayDays)
      }

      const run5kDecay = runDecay(run5k, 90)
      const run10kDecay = runDecay(run10k, 90)
      const runHalfDecay = runDecay(runHalf, 90)
      const runMaraDecay = runDecay(runMara, 90)
      const run1kDecay = runDecay(run1k, 90)

      const vo2max = run5kDecay ? estimateVO2max(run5kDecay.value) : null
      const vo2Tier = vo2max ? getTier(vo2max, VO2MAX_THRESHOLDS, true) : null
      const run5kTier = run5kDecay ? getTier(run5kDecay.value, RUN_5K_THRESHOLDS, false) : null
      const run10kTier = run10kDecay ? getTier(run10kDecay.value, RUN_10K_THRESHOLDS, false) : null
      const runHalfTier = runHalfDecay ? getTier(runHalfDecay.value, RUN_HALF_THRESHOLDS, false) : null
      const runMaraTier = runMaraDecay ? getTier(runMaraDecay.value, RUN_MARA_THRESHOLDS, false) : null

      const konditionTiers = [vo2Tier, run5kTier, run10kTier, runHalfTier, runMaraTier].filter(Boolean)
      const konditionTopTier = konditionTiers.length
        ? konditionTiers.reduce((best, t) => (t.tier > best.tier ? t : best), konditionTiers[0])
        : null
      const konditionHasData = konditionTiers.length > 0
      const konditionDecayWarning = [run5kDecay, run10kDecay, runHalfDecay, runMaraDecay].some(d => d?.stale)

      const konditionChartData = (runData || [])
        .filter(r => r.distance_km >= 4.5 && r.distance_km <= 11)
        .slice(0, 20).reverse()
        .map(r => ({
          date: r.date.slice(5),
          'Pace (min/km)': r.pace_per_km ? Math.round(r.pace_per_km / 60 * 10) / 10 : null,
        }))

      // ── STYRKA ───────────────────────────────────────────────────────────────
      // personal_records: exercise_name, weight_kg (already 1RM or max weight)
      function getPR(keywords) {
        const found = (prData || []).find(p =>
          keywords.some(k => p.exercise_name?.toLowerCase().includes(k.toLowerCase()))
        )
        if (!found) return null
        const dateStr = found.updated_at?.slice(0, 10) || found.date || format(subDays(todayDate, 1), 'yyyy-MM-dd')
        return getDecayedValue(found.weight_kg, dateStr, 60)
      }

      const benchDecay = getPR(['bänkpress', 'bench'])
      const squatDecay = getPR(['knäböj', 'squat'])
      const deadliftDecay = getPR(['marklyft', 'deadlift'])
      const ohpDecay = getPR(['militärpress', 'ohp', 'overhead'])
      const pullupDecay = getPR(['pull-up', 'pullup', 'chins'])

      const benchTier = benchDecay ? getTier(benchDecay.value / currentBW, BENCH_THRESHOLDS, true) : null
      const squatTier = squatDecay ? getTier(squatDecay.value / currentBW, SQUAT_THRESHOLDS, true) : null
      const deadliftTier = deadliftDecay ? getTier(deadliftDecay.value / currentBW, DEADLIFT_THRESHOLDS, true) : null
      const ohpTier = ohpDecay ? getTier(ohpDecay.value / currentBW, OHP_THRESHOLDS, true) : null
      const pullupTier = pullupDecay ? getTier(pullupDecay.value, PULLUP_THRESHOLDS, true) : null

      const styrkaAllTiers = [benchTier, squatTier, deadliftTier, ohpTier, pullupTier].filter(Boolean)
      const styrkaTopTier = styrkaAllTiers.length
        ? styrkaAllTiers.reduce((b, t) => (t.tier > b.tier ? t : b), styrkaAllTiers[0])
        : null
      const styrkaHasData = styrkaAllTiers.length > 0
      const styrkaDecayWarning = [benchDecay, squatDecay, deadliftDecay, ohpDecay, pullupDecay].some(d => d?.stale)

      // ── KROPP ─────────────────────────────────────────────────────────────────
      const weightLogs = (healthData || []).filter(h => h.weight_kg).slice(0, 14)
      const weightGoal = userSettings?.goals?.target_weight || 75
      const oldestRecent = weightLogs[weightLogs.length - 1]?.weight_kg || currentBW
      const newestRecent = weightLogs[0]?.weight_kg || currentBW
      const weightProgress = Math.round((newestRecent - oldestRecent) * 10) / 10
      const weightKvar = Math.max(0, Math.round((currentBW - weightGoal) * 10) / 10)
      const kroppenHasData = !!latestWeight?.weight_kg
      const weightChartData = [...weightLogs].reverse().map(h => ({
        date: h.date.slice(5),
        Vikt: h.weight_kg,
      }))

      // ── SÖMN ─────────────────────────────────────────────────────────────────
      const since7str = format(subDays(todayDate, 7), 'yyyy-MM-dd')
      const sleepLogs7 = (healthData || []).filter(h => h.sleep_hours && h.date >= since7str)
      const avgSleep = sleepLogs7.length
        ? Math.round(sleepLogs7.reduce((s, h) => s + h.sleep_hours, 0) / sleepLogs7.length * 10) / 10
        : null
      const sleepDurationTier = avgSleep ? getTier(avgSleep, SLEEP_DURATION_THRESHOLDS, true) : null
      const somnHasData = !!avgSleep
      const sleepChartData = (healthData || []).filter(h => h.sleep_hours).slice(0, 14).reverse().map(h => ({
        date: h.date.slice(5),
        Sömn: h.sleep_hours,
      }))

      // ── PLUGG ─────────────────────────────────────────────────────────────────
      const activeGoals = (studyData || []).filter(g => g.courses?.active)
      const avgMastery = activeGoals.length
        ? Math.round(activeGoals.reduce((s, g) => s + (g.mastery || 0), 0) / activeGoals.length)
        : null
      const pluggTier = avgMastery != null ? getStudyTier(avgMastery) : null
      const pluggHasData = avgMastery != null

      const byCourse = {}
      activeGoals.forEach(g => {
        const cn = g.courses?.name || 'Okänd'
        if (!byCourse[cn]) byCourse[cn] = []
        byCourse[cn].push(g.mastery || 0)
      })

      // ── EKONOMI ───────────────────────────────────────────────────────────────
      const totalPAPay = (paData || []).reduce((s, shift) => s + (shift.estimated_pay || 0), 0)
      const savingsRaw = userSettings?.goals?.savings || null
      const incomeTier = totalPAPay ? getTier(totalPAPay, INCOME_THRESHOLDS, true) : null
      const savingsTier = savingsRaw != null ? getTier(savingsRaw, SAVINGS_THRESHOLDS, true) : null
      const ekonomiTopTier = [incomeTier, savingsTier].filter(Boolean)
        .reduce((b, t) => (t && t.tier > (b?.tier || 0) ? t : b), null)
      const ekonomiHasData = !!(totalPAPay || savingsRaw != null)

      // ── VÄLMÅENDE ─────────────────────────────────────────────────────────────
      const wellLogs7 = (healthData || []).filter(h => h.date >= since7str)
      function avg7(field) {
        const vals = wellLogs7.filter(h => h[field] != null).map(h => h[field])
        return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : null
      }
      const avgEnergy = avg7('energy_level')
      const avgStress = avg7('stress_level')
      const avgMood = avg7('mood')
      const avgSteps = avg7('steps')

      const energyTier = avgEnergy != null ? getTier(avgEnergy, ENERGY_THRESHOLDS, true) : null
      const stressTier = avgStress != null ? getTier(avgStress, STRESS_THRESHOLDS, false) : null
      const moodTier = avgMood != null ? getTier(avgMood, MOOD_THRESHOLDS, true) : null
      const stepsTier = avgSteps != null ? getTier(avgSteps, STEPS_THRESHOLDS, true) : null

      const wellTiers = [energyTier, stressTier, moodTier, stepsTier].filter(Boolean)
      const wellTopTier = wellTiers.length
        ? wellTiers.reduce((b, t) => (t.tier > b.tier ? t : b), wellTiers[0])
        : null
      const wellHasData = wellTiers.length > 0
      const wellChartData = (healthData || []).filter(h => h.energy_level || h.mood).slice(0, 14).reverse().map(h => ({
        date: h.date.slice(5),
        Energi: h.energy_level,
        Humör: h.mood,
        Stress: h.stress_level,
      }))

      // ── FÄRDIGHETER ───────────────────────────────────────────────────────────
      function avgMinPerWeek(skillName) {
        const logs = (skillData || []).filter(s => s.skill === skillName)
        if (!logs.length) return 0
        return Math.round(logs.reduce((s, l) => s + l.minutes, 0) / 4)
      }
      const spanishMin = avgMinPerWeek('spanish')
      const serbianMin = avgMinPerWeek('serbian')
      const guitarMin = avgMinPerWeek('guitar')
      const skillsHasData = !!(skillData?.length)
      const spanishTier = getSkillTier(spanishMin)
      const serbianTier = getSkillTier(serbianMin)
      const guitarTier = getSkillTier(guitarMin)
      const skillTopTier = [spanishTier, serbianTier, guitarTier]
        .reduce((b, t) => (t.tier > b.tier ? t : b), spanishTier)

      // ── ASSEMBLE ───────────────────────────────────────────────────────────────
      const builtCategories = [
        {
          id: 'kondition',
          name: 'Kondition',
          icon: '🏃',
          tier: konditionTopTier,
          hasData: konditionHasData,
          decayWarning: konditionDecayWarning,
          trend: run5kDecay ? (run5kDecay.daysSince < 14 ? 'up' : 'neutral') : 'neutral',
          metrics: [
            { label: '5km PR', value: run5kDecay ? formatRunTime(Math.round(run5kDecay.value)) : '—', highlight: true },
            { label: '10km PR', value: run10kDecay ? formatRunTime(Math.round(run10kDecay.value)) : '—' },
            { label: 'Est. VO2max', value: vo2max ? vo2max + ' ml/kg/min' : '—' },
          ],
          details: [
            { label: '1km PR', value: run1kDecay ? formatRunTime(Math.round(run1kDecay.value)) : '—' },
            { label: '5km PR', value: run5kDecay ? formatRunTime(Math.round(run5kDecay.value)) : '—', tierInfo: run5kTier },
            { label: '10km PR', value: run10kDecay ? formatRunTime(Math.round(run10kDecay.value)) : '—', tierInfo: run10kTier },
            { label: 'Halvmara PR', value: runHalfDecay ? formatRunTime(Math.round(runHalfDecay.value)) : '—', tierInfo: runHalfTier },
            { label: 'Mara PR', value: runMaraDecay ? formatRunTime(Math.round(runMaraDecay.value)) : '—', tierInfo: runMaraTier },
            { label: 'Estimerat VO2max', value: vo2max ? vo2max + ' ml/kg/min' : '—', tierInfo: vo2Tier },
          ],
          chartData: konditionChartData,
          chartLines: [{ key: 'Pace (min/km)', label: 'Pace (min/km)', color: '#3b82f6' }],
          navTarget: '/traning',
          navLabel: 'Träning',
        },
        {
          id: 'styrka',
          name: 'Styrka',
          icon: '🏋️',
          tier: styrkaTopTier,
          hasData: styrkaHasData,
          decayWarning: styrkaDecayWarning,
          trend: 'neutral',
          metrics: [
            { label: 'Bänkpress', value: benchDecay ? benchDecay.value + ' kg' : '—', highlight: true },
            { label: 'Marklyft', value: deadliftDecay ? deadliftDecay.value + ' kg' : '—' },
            { label: 'Knäböj', value: squatDecay ? squatDecay.value + ' kg' : '—' },
          ],
          details: [
            { label: 'Bänkpress', value: benchDecay ? benchDecay.value + ' kg (' + Math.round(benchDecay.value / currentBW * 100) / 100 + 'x BW)' : '—', tierInfo: benchTier },
            { label: 'Knäböj', value: squatDecay ? squatDecay.value + ' kg (' + Math.round(squatDecay.value / currentBW * 100) / 100 + 'x BW)' : '—', tierInfo: squatTier },
            { label: 'Marklyft', value: deadliftDecay ? deadliftDecay.value + ' kg (' + Math.round(deadliftDecay.value / currentBW * 100) / 100 + 'x BW)' : '—', tierInfo: deadliftTier },
            { label: 'Militärpress', value: ohpDecay ? ohpDecay.value + ' kg' : '—', tierInfo: ohpTier },
            { label: 'Pull-ups max', value: pullupDecay ? pullupDecay.value + ' reps' : '—', tierInfo: pullupTier },
          ],
          chartData: [],
          navTarget: '/traning',
          navLabel: 'Träning',
        },
        {
          id: 'kropp',
          name: 'Kropp',
          icon: '⚖️',
          tier: null,
          hasData: kroppenHasData,
          decayWarning: false,
          trend: weightProgress < 0 ? 'up' : weightProgress > 0 ? 'down' : 'neutral',
          metrics: [
            { label: 'Aktuell vikt', value: currentBW + ' kg', highlight: true },
            { label: 'Kvar till mål (' + weightGoal + ' kg)', value: weightKvar + ' kg' },
            { label: 'Trend 14 dagar', value: (weightProgress > 0 ? '+' : '') + weightProgress + ' kg' },
          ],
          details: [
            { label: 'Aktuell vikt', value: currentBW + ' kg' },
            { label: 'Målvikt', value: weightGoal + ' kg' },
            { label: 'Kvar till mål', value: weightKvar + ' kg' },
            { label: 'Trend 14d', value: weightProgress <= 0 ? Math.abs(weightProgress) + ' kg ned' : weightProgress + ' kg upp' },
          ],
          chartData: weightChartData,
          chartLines: [{ key: 'Vikt', label: 'Vikt (kg)', color: '#f59e0b' }],
          navTarget: '/halsa',
          navLabel: 'Hälsa',
        },
        {
          id: 'somn',
          name: 'Sömn',
          icon: '🌙',
          tier: sleepDurationTier,
          hasData: somnHasData,
          decayWarning: false,
          trend: 'neutral',
          metrics: [
            { label: 'Snitt 7 dagar', value: avgSleep ? avgSleep + ' h' : '—', highlight: true },
            { label: 'Loggar', value: sleepLogs7.length + ' av 7 dagar' },
          ],
          details: [
            { label: 'Sömnsnitt 7d', value: avgSleep ? avgSleep + ' timmar' : '—', tierInfo: sleepDurationTier },
          ],
          chartData: sleepChartData,
          chartLines: [{ key: 'Sömn', label: 'Timmar', color: '#8b5cf6' }],
          navTarget: '/halsa',
          navLabel: 'Hälsa',
        },
        {
          id: 'plugg',
          name: 'Plugg',
          icon: '📚',
          tier: pluggTier,
          hasData: pluggHasData,
          decayWarning: false,
          trend: 'neutral',
          metrics: [
            { label: 'Genomsnittlig mastery', value: avgMastery != null ? avgMastery + '%' : '—', highlight: true },
            { label: 'Aktiva lärandemål', value: activeGoals.length },
          ],
          details: [
            { label: 'Genomsnittlig mastery', value: avgMastery != null ? avgMastery + '%' : '—', tierInfo: pluggTier },
            ...Object.entries(byCourse).map(([course, vals]) => ({
              label: course,
              value: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) + '% mastery',
            })),
          ],
          chartData: [],
          navTarget: '/plugg',
          navLabel: 'Plugg',
        },
        {
          id: 'ekonomi',
          name: 'Ekonomi',
          icon: '💰',
          tier: ekonomiTopTier,
          hasData: ekonomiHasData,
          decayWarning: false,
          trend: 'neutral',
          metrics: [
            { label: 'Inkomst denna månad', value: totalPAPay ? Math.round(totalPAPay).toLocaleString('sv-SE') + ' kr' : '—', highlight: true },
            { label: 'Sparkapital', value: savingsRaw != null ? savingsRaw.toLocaleString('sv-SE') + ' kr' : '—' },
          ],
          details: [
            { label: 'Månadsnettoink.', value: totalPAPay ? Math.round(totalPAPay).toLocaleString('sv-SE') + ' kr' : '—', tierInfo: incomeTier },
            { label: 'Sparkapital', value: savingsRaw != null ? savingsRaw.toLocaleString('sv-SE') + ' kr' : '—', tierInfo: savingsTier },
          ],
          chartData: [],
          navTarget: '/ekonomi',
          navLabel: 'Ekonomi',
        },
        {
          id: 'valmående',
          name: 'Välmående',
          icon: '🌱',
          tier: wellTopTier,
          hasData: wellHasData,
          decayWarning: false,
          trend: avgEnergy ? (avgEnergy >= 7 ? 'up' : avgEnergy <= 4 ? 'down' : 'neutral') : 'neutral',
          metrics: [
            { label: 'Energi snitt', value: avgEnergy != null ? avgEnergy + '/10' : '—', highlight: true },
            { label: 'Humör snitt', value: avgMood != null ? avgMood + '/10' : '—' },
            { label: 'Stress snitt', value: avgStress != null ? avgStress + '/10' : '—' },
          ],
          details: [
            { label: 'Energi (7d snitt)', value: avgEnergy != null ? avgEnergy + '/10' : '—', tierInfo: energyTier },
            { label: 'Stress (7d snitt)', value: avgStress != null ? avgStress + '/10' : '—', tierInfo: stressTier },
            { label: 'Humör (7d snitt)', value: avgMood != null ? avgMood + '/10' : '—', tierInfo: moodTier },
            { label: 'Steg/dag (7d snitt)', value: avgSteps != null ? Math.round(avgSteps).toLocaleString('sv-SE') : '—', tierInfo: stepsTier },
          ],
          chartData: wellChartData,
          chartLines: [
            { key: 'Energi', label: 'Energi', color: '#f59e0b' },
            { key: 'Humör', label: 'Humör', color: '#10b981' },
            { key: 'Stress', label: 'Stress', color: '#ef4444' },
          ],
          navTarget: '/halsa',
          navLabel: 'Hälsa',
        },
        {
          id: 'fardigheter',
          name: 'Färdigheter',
          icon: '🎸',
          tier: skillsHasData ? skillTopTier : null,
          hasData: skillsHasData,
          decayWarning: false,
          trend: 'neutral',
          metrics: [
            { label: '🇪🇸 Spanska', value: spanishMin ? spanishMin + ' min/v' : '—', highlight: spanishTier.tier >= 4 },
            { label: '🇷🇸 Serbiska', value: serbianMin ? serbianMin + ' min/v' : '—' },
            { label: '🎸 Gitarr', value: guitarMin ? guitarMin + ' min/v' : '—' },
          ],
          details: [
            { label: '🇪🇸 Spanska', value: spanishMin + ' min/v', tierInfo: spanishTier },
            { label: '🇷🇸 Serbiska', value: serbianMin + ' min/v', tierInfo: serbianTier },
            { label: '🎸 Gitarr', value: guitarMin + ' min/v', tierInfo: guitarTier },
          ],
          chartData: [],
          navTarget: null,
          navLabel: null,
        },
      ]

      setCategories(builtCategories)

      const allTiers = builtCategories
        .filter(c => c.tier && c.hasData)
        .map(c => ({ tier: c.tier.tier }))
      setOverallTier(calcOverallTier(allTiers))

    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [userId, refreshKey])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  const overallColor = overallTier ? TIER_COLORS[overallTier] : '#6b7280'
  const overallLabel = overallTier ? TIER_NAMES[overallTier] : null

  return (
    <div style={{ padding: '0 0 40px 0', maxWidth: '900px', margin: '0 auto' }}>

      <div style={{
        padding: '28px 24px 24px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
              Sigge Gustafsson
            </div>
            <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {format(todayDate, 'EEEE d MMMM yyyy').charAt(0).toUpperCase() + format(todayDate, 'EEEE d MMMM yyyy').slice(1)}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
              Medicinsk student · Termin 3 · {bodyWeight} kg
            </div>
          </div>
          {overallTier && (
            <div style={{
              textAlign: 'center',
              background: overallColor + '15',
              border: '1px solid ' + overallColor + '44',
              borderRadius: '12px',
              padding: '12px 20px',
            }}>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Övergripande
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: overallColor }}>
                {overallLabel}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                Tier {overallTier} / 8
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 300px',
        gap: '28px',
        padding: '0 24px',
        alignItems: 'start',
      }}>
        <div>
          {loading ? (
            <div style={{ color: 'var(--muted)', fontSize: '14px', padding: '40px 0', textAlign: 'center' }}>
              Laddar data...
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '14px',
            }}>
              {categories.map(cat => (
                <CategoryCard
                  key={cat.id}
                  category={cat}
                  onClick={setSelectedCategory}
                />
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'sticky', top: '20px' }}>
          <QuickLog userId={userId} onSaved={() => setRefreshKey(k => k + 1)} />
        </div>
      </div>

      {selectedCategory && (
        <DetailModal
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
        />
      )}
    </div>
  )
}
