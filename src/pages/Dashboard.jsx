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
  SLEEP_DURATION_THRESHOLDS, SLEEP_REGULARITY_THRESHOLDS,
  INCOME_THRESHOLDS, SAVINGS_THRESHOLDS,
  ENERGY_THRESHOLDS, MOOD_THRESHOLDS, STRESS_THRESHOLDS, STEPS_THRESHOLDS,
  TIER_COLORS, TIER_NAMES,
} from '../components/Dashboard/tierUtils'

const USER_ID = 'c051041c-83e4-4b3d-8e9f-e531e3dde025'
const BW = 77 // bodyweight kg, uppdateras dynamiskt från senaste health_log

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [categories, setCategories] = useState([])
  const [overallTier, setOverallTier] = useState(null)
  const [bodyWeight, setBodyWeight] = useState(BW)
  const [refreshKey, setRefreshKey] = useState(0)

  const today = format(new Date(), 'yyyy-MM-dd')
  const todayDate = new Date()

  // ─── DATA FETCH ──────────────────────────────────────────────────────────────
  const fetchAllData = useCallback(async () => {
    setLoading(true)
    try {
      const since90 = format(subDays(todayDate, 90), 'yyyy-MM-dd')
      const since30 = format(subDays(todayDate, 30), 'yyyy-MM-dd')
      const since14 = format(subDays(todayDate, 14), 'yyyy-MM-dd')
      const since7 = format(subDays(todayDate, 7), 'yyyy-MM-dd')

      const [
        { data: prData },
        { data: healthData },
        { data: studyData },
        { data: coursesData },
        { data: paData },
        { data: skillData },
        { data: userSettings },
        { data: exerciseSets },
      ] = await Promise.all([
        supabase.from('pr_logs').select('*').eq('user_id', USER_ID).gte('date', since90).order('date', { ascending: false }),
        supabase.from('health_logs').select('*').eq('user_id', USER_ID).gte('date', since90).order('date', { ascending: false }),
        supabase.from('learning_goals').select('*, courses(name,active)').eq('user_id', USER_ID),
        supabase.from('courses').select('*').eq('user_id', USER_ID).eq('active', true),
        supabase.from('pa_shifts').select('*').eq('user_id', USER_ID).gte('date', since30),
        supabase.from('skill_logs').select('*').eq('user_id', USER_ID).gte('date', since30),
        supabase.from('user_settings').select('*').eq('user_id', USER_ID).single(),
        supabase.from('exercise_sets').select('*').eq('user_id', USER_ID).gte('created_at', since90 + 'T00:00:00').order('created_at', { ascending: false }),
      ])

      // ── Helpers ──
      function latestPR(type) {
        return prData?.find(p => p.type === type) || null
      }

      // ── KROPP / bodyweight ──
      const latestWeight = healthData?.[0]
      const currentBW = latestWeight?.weight_kg || BW
      setBodyWeight(currentBW)

      // ── KONDITION ──────────────────────────────────────────────────────────
      const pr5k = latestPR('run_5k')
      const pr10k = latestPR('run_10k')
      const prHalf = latestPR('run_half')
      const prMara = latestPR('run_full')
      const pr1k = latestPR('run_1k')

      const pr5kDecay = pr5k ? getDecayedValue(pr5k.value, pr5k.date, 90) : null
      const pr10kDecay = pr10k ? getDecayedValue(pr10k.value, pr10k.date, 90) : null
      const prHalfDecay = prHalf ? getDecayedValue(prHalf.value, prHalf.date, 90) : null
      const prMaraDecay = prMara ? getDecayedValue(prMara.value, prMara.date, 90) : null

      const vo2max = pr5kDecay ? estimateVO2max(pr5kDecay.value) : null
      const vo2Tier = vo2max ? getTier(vo2max, VO2MAX_THRESHOLDS, true) : null
      const run5kTier = pr5kDecay ? getTier(pr5kDecay.value, RUN_5K_THRESHOLDS, false) : null
      const run10kTier = pr10kDecay ? getTier(pr10kDecay.value, RUN_10K_THRESHOLDS, false) : null
      const runHalfTier = prHalfDecay ? getTier(prHalfDecay.value, RUN_HALF_THRESHOLDS, false) : null
      const runMaraTier = prMaraDecay ? getTier(prMaraDecay.value, RUN_MARA_THRESHOLDS, false) : null

      const konditionTiers = [vo2Tier, run5kTier, run10kTier, runHalfTier, runMaraTier].filter(Boolean)
      const konditionTopTier = konditionTiers.length
        ? konditionTiers.reduce((best, t) => (t.tier > best.tier ? t : best), konditionTiers[0])
        : null

      const konditionHasData = konditionTiers.length > 0
      const konditionDecayWarning = [pr5kDecay, pr10kDecay, prHalfDecay, prMaraDecay].some(d => d?.stale)

      // Build kondition chart data from pr_logs
      const konditionChartData = (prData || [])
        .filter(p => ['run_5k', 'run_10k'].includes(p.type))
        .reduce((acc, p) => {
          const existing = acc.find(a => a.date === p.date)
          const label = p.type === 'run_5k' ? '5km' : '10km'
          if (existing) { existing[label] = Math.round(p.value / 60) }
          else acc.push({ date: p.date.slice(5), [label]: Math.round(p.value / 60) })
          return acc
        }, []).reverse()

      // ── STYRKA ───────────────────────────────────────────────────────────────
      function getBestSet(exerciseName) {
        const sets = (exerciseSets || []).filter(s =>
          s.exercise_name?.toLowerCase().includes(exerciseName.toLowerCase())
        )
        if (!sets.length) return null
        const best = sets.reduce((b, s) => {
          const rm = calc1RM(s.weight_kg, s.reps) || 0
          const bRm = calc1RM(b.weight_kg, b.reps) || 0
          return rm > bRm ? s : b
        }, sets[0])
        return { value: calc1RM(best.weight_kg, best.reps), date: best.created_at?.slice(0, 10) }
      }

      // Combine pr_logs (explicit) + exercise_sets (calculated)
      function getStrength(prType, exerciseName) {
        const fromPR = latestPR(prType)
        if (fromPR) return getDecayedValue(fromPR.value, fromPR.date, 60)
        const fromSets = getBestSet(exerciseName)
        if (fromSets) return getDecayedValue(fromSets.value, fromSets.date, 60)
        return null
      }

      const benchDecay = getStrength('bench', 'bänkpress')
      const squatDecay = getStrength('squat', 'knäböj')
      const deadliftDecay = getStrength('deadlift', 'marklyft')
      const ohpDecay = getStrength('ohp', 'militärpress')
      const pullupDecay = getStrength('pullup_max', 'pull-up')

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
      const weightProgress = weightLogs.length
        ? Math.round(((weightLogs[weightLogs.length - 1].weight_kg - (weightLogs[0]?.weight_kg || currentBW)) * 10) / 10)
        : 0
      const weightKvar = Math.max(0, Math.round((currentBW - weightGoal) * 10) / 10)
      const kroppenHasData = !!latestWeight?.weight_kg
      const weightChartData = [...weightLogs].reverse().map(h => ({
        date: h.date.slice(5),
        Vikt: h.weight_kg,
      }))

      // ── SÖMN ─────────────────────────────────────────────────────────────────
      const sleepLogs7 = (healthData || []).filter(h => h.sleep_hours && h.date >= format(subDays(todayDate, 7), 'yyyy-MM-dd'))
      const avgSleep = sleepLogs7.length ? sleepLogs7.reduce((s, h) => s + h.sleep_hours, 0) / sleepLogs7.length : null
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

      // Group by course
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
      const ekonomiTopTier = [incomeTier, savingsTier].filter(Boolean).reduce(
        (b, t) => (t && t.tier > (b?.tier || 0) ? t : b), null
      )
      const ekonomiHasData = !!(totalPAPay || savingsRaw != null)

      // ── VÄLMÅENDE ─────────────────────────────────────────────────────────────
      const wellLogs7 = (healthData || []).filter(h => h.date >= format(subDays(todayDate, 7), 'yyyy-MM-dd'))
      function avg7(field) {
        const vals = wellLogs7.filter(h => h[field] != null).map(h => h[field])
        return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null
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
        const totalMins = logs.reduce((s, l) => s + l.minutes, 0)
        return Math.round(totalMins / 4)
      }
      const spanishMin = avgMinPerWeek('spanish')
      const serbianMin = avgMinPerWeek('serbian')
      const guitarMin = avgMinPerWeek('guitar')
      const skillsHasData = !!(skillData?.length)
      const spanishTier = getSkillTier(spanishMin)
      const serbianTier = getSkillTier(serbianMin)
      const guitarTier = getSkillTier(guitarMin)
      const skillTopTier = [spanishTier, serbianTier, guitarTier].reduce(
        (b, t) => (t.tier > b.tier ? t : b), spanishTier
      )

      // ── ASSEMBLE CATEGORIES ───────────────────────────────────────────────────
      const builtCategories = [
        {
          id: 'kondition',
          name: 'Kondition',
          icon: '🏃',
          tier: konditionTopTier,
          hasData: konditionHasData,
          decayWarning: konditionDecayWarning,
          trend: pr5kDecay ? (pr5kDecay.daysSince < 7 ? 'up' : 'neutral') : 'neutral',
          metrics: [
            { label: '5km PR', value: pr5kDecay ? formatRunTime(Math.round(pr5kDecay.value)) : '—', highlight: true },
            { label: '10km PR', value: pr10kDecay ? formatRunTime(Math.round(pr10kDecay.value)) : '—' },
            { label: 'Est. VO2max', value: vo2max ? vo2max + ' ml/kg/min' : '—' },
          ],
          details: [
            { label: '1km PR', value: pr1k ? formatRunTime(Math.round(pr1k.value)) : '—' },
            { label: '5km PR', value: pr5kDecay ? formatRunTime(Math.round(pr5kDecay.value)) : '—', tierInfo: run5kTier },
            { label: '10km PR', value: pr10kDecay ? formatRunTime(Math.round(pr10kDecay.value)) : '—', tierInfo: run10kTier },
            { label: 'Halvmara PR', value: prHalfDecay ? formatRunTime(Math.round(prHalfDecay.value)) : '—', tierInfo: runHalfTier },
            { label: 'Mara PR', value: prMaraDecay ? formatRunTime(Math.round(prMaraDecay.value)) : '—', tierInfo: runMaraTier },
            { label: 'Estimerat VO2max', value: vo2max ? vo2max + ' ml/kg/min' : '—', tierInfo: vo2Tier },
          ],
          chartData: konditionChartData,
          chartLines: [
            { key: '5km', label: '5km (min)', color: '#3b82f6' },
            { key: '10km', label: '10km (min)', color: '#8b5cf6' },
          ],
          navTarget: '/traning',
          navLabel: 'Träning',
          nextTierText: konditionTopTier?.nextThreshold
            ? 'Kräver bättre löptider eller VO2max'
            : null,
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
            { label: 'Bänkpress 1RM', value: benchDecay ? benchDecay.value + ' kg' : '—', highlight: true },
            { label: 'Marklyft 1RM', value: deadliftDecay ? deadliftDecay.value + ' kg' : '—' },
            { label: 'Knäböj 1RM', value: squatDecay ? squatDecay.value + ' kg' : '—' },
          ],
          details: [
            { label: 'Bänkpress 1RM', value: benchDecay ? benchDecay.value + ' kg (' + Math.round(benchDecay.value / currentBW * 100) / 100 + 'x BW)' : '—', tierInfo: benchTier },
            { label: 'Knäböj 1RM', value: squatDecay ? squatDecay.value + ' kg (' + Math.round(squatDecay.value / currentBW * 100) / 100 + 'x BW)' : '—', tierInfo: squatTier },
            { label: 'Marklyft 1RM', value: deadliftDecay ? deadliftDecay.value + ' kg (' + Math.round(deadliftDecay.value / currentBW * 100) / 100 + 'x BW)' : '—', tierInfo: deadliftTier },
            { label: 'Militärpress 1RM', value: ohpDecay ? ohpDecay.value + ' kg' : '—', tierInfo: ohpTier },
            { label: 'Pull-ups max reps', value: pullupDecay ? pullupDecay.value + ' reps' : '—', tierInfo: pullupTier },
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
            { label: 'Kvar till mål (' + weightGoal + 'kg)', value: weightKvar + ' kg' },
            { label: 'Trend 14 dagar', value: weightProgress > 0 ? '+' + weightProgress + ' kg' : weightProgress + ' kg' },
          ],
          details: [
            { label: 'Aktuell vikt', value: currentBW + ' kg' },
            { label: 'Målvikt', value: weightGoal + ' kg' },
            { label: 'Kvar', value: weightKvar + ' kg (' + Math.round((1 - weightKvar / (currentBW - weightGoal + weightKvar)) * 100) + '% klart)' },
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
            { label: 'Snitt 7 dagar', value: avgSleep ? avgSleep.toFixed(1) + ' h' : '—', highlight: true },
            { label: 'Loggar', value: sleepLogs7.length + ' av 7 dagar' },
          ],
          details: [
            { label: 'Sömnsnitt 7d', value: avgSleep ? avgSleep.toFixed(1) + ' timmar' : '—', tierInfo: sleepDurationTier },
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
            { label: 'Månadsnettoink. (PA)', value: totalPAPay ? Math.round(totalPAPay).toLocaleString('sv-SE') + ' kr' : '—', tierInfo: incomeTier },
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
            { label: '🇪🇸 Spanska', value: spanishMin + ' min/v', highlight: spanishTier.tier >= 4 },
            { label: '🇷🇸 Serbiska', value: serbianMin + ' min/v' },
            { label: '🎸 Gitarr', value: guitarMin + ' min/v' },
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

      // Overall tier — genomsnitt av alla kategorier med tier
      const allTiers = builtCategories
        .filter(c => c.tier && c.hasData)
        .map(c => ({ tier: c.tier.tier }))
      setOverallTier(calcOverallTier(allTiers))

    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [refreshKey])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  const overallColor = overallTier ? TIER_COLORS[overallTier] : '#6b7280'
  const overallLabel = overallTier ? TIER_NAMES[overallTier] : null

  return (
    <div style={{ padding: '0 0 40px 0', maxWidth: '900px', margin: '0 auto' }}>

      {/* ─ Profile Header ─ */}
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

      {/* ─ Main layout: cards + quicklog ─ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 300px',
        gap: '28px',
        padding: '0 24px',
        alignItems: 'start',
      }}>

        {/* Left: Category grid */}
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

        {/* Right: QuickLog */}
        <div style={{ position: 'sticky', top: '20px' }}>
          <QuickLog onSaved={() => setRefreshKey(k => k + 1)} />
        </div>
      </div>

      {/* ─ Detail Modal ─ */}
      {selectedCategory && (
        <DetailModal
          category={selectedCategory}
          onClose={() => setSelectedCategory(null)}
        />
      )}
    </div>
  )
}
