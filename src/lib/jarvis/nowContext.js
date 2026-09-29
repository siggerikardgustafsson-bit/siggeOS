// ============================================================================
// Jarvis "NU" context — the per-user snapshot every Jarvis chat turn gets.
// ----------------------------------------------------------------------------
// Moved out of Jarvis.jsx (2026-09-29) so the SAME context can be built in the
// browser (Jarvis page) and on the server (scheduled Jarvis jobs, via the
// bundle made by scripts/bundle-tier-compute.mjs). Takes the supabase client
// as a parameter — never import ./supabase here.
//
// Blocks: SCORE/HÄLSA IDAG, AKTIVA MÅL, TENTOR, PROJEKT, RESOR, then the
// grounded MAXX INTELLIGENS (tiers from tier_snapshots), MÖNSTER (90d
// cross-domain findings) and SIGNALER (this week's risks). Each enrichment is
// best-effort: a failure degrades to the lean context, never throws.
// ============================================================================
import { format, subDays } from 'date-fns'
import { goalLine } from '../goals'
import { TRIP_STATUSES_UPCOMING } from '../constants'
import { loadJarvisContext } from './index'
import { buildJarvisContextBlock } from './reason'
import { crossDomainFindings, findingsToPrompt } from '../correlate'
import { detectSignals, signalsToPrompt } from '../signals'
import { resolveTargetWeight } from '../personalization'

const getProfileWith = (supabase) => async (uid) => {
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    return error ? null : data
  } catch { return null }
}

export async function buildJarvisNowContext(supabase, userId, now = new Date()) {
  if (!supabase || !userId) return ''
  const today = format(now, 'yyyy-MM-dd')

  // Lean context — only immediate snapshot. Everything else fetched via tools on demand.
  const [scoreRes, examsRes, projectsRes, tripsRes, todayHealthRes, goalsRes, reportRes] = await Promise.all([
    supabase.from('daily_scores').select('total_score,score_training,score_health,score_study,score_economy,score_social,score_journal,peak_mode').eq('user_id', userId).eq('date', today).maybeSingle(),
    supabase.from('course_exams').select('exam_date,name').eq('user_id', userId).gte('exam_date', today).order('exam_date', { ascending: true }).limit(3),
    supabase.from('projects').select('id,name,type,client').eq('user_id', userId).order('created_at'),
    supabase.from('trips').select('id,title,countries,start_date,end_date,status,budget_sek').eq('user_id', userId).in('status', TRIP_STATUSES_UPCOMING).order('start_date', { ascending: true }).limit(5),
    supabase.from('health_logs').select('weight_kg,sleep_hours,energy,energy_level,mood,steps').eq('user_id', userId).eq('date', today).maybeSingle(),
    // Same ordering as goals.listGoals (created_at, then pinned/sort_order).
    supabase.from('goals').select('*').eq('user_id', userId).eq('status', 'active')
      .order('created_at', { ascending: true }).order('pinned', { ascending: false }).order('sort_order', { ascending: true }),
    // Latest weekly report's focus (jarvis-weekly) — the one priority Jarvis
    // set, carried every day so the chat can follow up on it.
    supabase.from('jarvis_reports').select('period_start,focus').eq('user_id', userId).eq('kind', 'weekly')
      .order('period_start', { ascending: false }).limit(1).maybeSingle(),
  ])
  const goalsList = goalsRes.error ? [] : (goalsRes.data || [])

  const score = scoreRes.data
  // daily_scores.total_score is never populated (only per-domain scores are
  // written, from Journal/Träning). Derive it live from the domains that have
  // a value today so the context line isn't a permanent "total:0".
  const scoreDomains = score
    ? [score.score_training, score.score_health, score.score_study, score.score_economy, score.score_social, score.score_journal].filter((v) => v != null && v > 0)
    : []
  const scoreTotal = scoreDomains.length ? Math.round(scoreDomains.reduce((s, v) => s + v, 0) / scoreDomains.length) : null
  const todayHealth = todayHealthRes.data
  const energy = todayHealth?.energy_level ?? todayHealth?.energy

  const upcomingExams = (examsRes.data || []).map(e => {
    const d = Math.ceil((new Date(e.exam_date) - now) / 86400000)
    return `${e.exam_date} (${d}d): ${e.name}`
  }).join(', ') || 'Inga'

  const projectsBlock = (projectsRes.data || []).map(p =>
    `${p.name} [id:${p.id}] (${p.type}${p.client ? ', ' + p.client : ''})`
  ).join(' | ') || 'Inga projekt'

  const tripsBlock = (tripsRes.data || []).map(t =>
    `[id:${t.id}] ${t.title} (${t.status}) ${t.countries?.join(',') || ''} ${t.start_date || '?'}→${t.end_date || '?'}${t.budget_sek ? ' ' + t.budget_sek + 'kr' : ''}`
  ).join(' | ') || 'Inga planerade resor'

  const healthLine = todayHealth
    ? [todayHealth.weight_kg && 'vikt ' + todayHealth.weight_kg + 'kg', todayHealth.sleep_hours && 'sömn ' + todayHealth.sleep_hours + 'h', energy && 'energi ' + energy + '/10', todayHealth.mood && 'humör ' + todayHealth.mood + '/10', todayHealth.steps && 'steg ' + todayHealth.steps].filter(Boolean).join(' | ')
    : 'ej loggat idag'

  // NB: no 'TID:' line here — callers prepend it fresh at send time so a cached
  // context never carries a stale timestamp (AUDIT.md P1-6).
  const goalsBlock = goalsList.length
    ? goalsList.slice(0, 8).map(g => '· ' + goalLine(g)).join('\n')
    : 'Inga aktiva mål satta'

  const ctx = [
    score ? 'SCORE IDAG (0-100, dagsaktivitet):' + (scoreTotal != null ? ' snitt:' + scoreTotal : '') + ' tr:' + (score.score_training || 0) + ' hä:' + (score.score_health || 0) + ' pl:' + (score.score_study || 0) + ' ek:' + (score.score_economy || 0) + ' soc:' + (score.score_social || 0) + (score.peak_mode ? ' PEAK' : '') : 'SCORE: saknas idag',
    'HÄLSA IDAG: ' + healthLine,
    'AKTIVA MÅL:\n' + goalsBlock,
    ...(reportRes?.data?.focus ? [`VECKANS FOKUS (satt i veckorapporten ${reportRes.data.period_start}, följ upp): ${reportRes.data.focus}`] : []),
    'NÄSTA TENTOR: ' + upcomingExams,
    'PROJEKT: ' + projectsBlock,
    'PLANERADE RESOR: ' + tripsBlock,
  ].join('\n')

  // Phase 11 — Jarvis Intelligence Layer v2. Append a grounded, self-labeling
  // MAXX INTELLIGENS block (tiers/bottlenecks/rank-up/benchmark/confidence) built
  // by CONSUMING the scoring system's persisted output. Best-effort: if it can't
  // load, Jarvis keeps the lean context above. Jarvis never calculates the score.
  let fullCtx = ctx
  try {
    const jc = await loadJarvisContext({ supabase, userId, getProfile: getProfileWith(supabase) })
    const block = jc ? buildJarvisContextBlock(jc) : ''
    if (block) fullCtx = ctx + '\n\n' + block
  } catch { /* best-effort — degrade to lean context */ }

  // Best-effort MÖNSTER + SIGNALER blocks — the same deterministic findings
  // and weekly signals Insights shows, so Jarvis coaches from real patterns
  // and this-week risks, not just today's snapshot.
  try {
    const since = format(subDays(now, 90), 'yyyy-MM-dd')
    const [h, j, st, tr, pa, ex, co, us, prof] = await Promise.all([
      supabase.from('health_logs').select('date,weight_kg,steps,sleep_hours,energy,energy_level,nicotine').eq('user_id', userId).gte('date', since),
      supabase.from('journal_entries').select('date,energy,mood,sleep_hours').eq('user_id', userId).gte('date', since),
      supabase.from('study_sessions').select('date,hours,course_id').eq('user_id', userId).gte('date', since),
      supabase.from('training_sessions').select('date').eq('user_id', userId).gte('date', since),
      supabase.from('pa_shifts').select('date,hours_worked,is_night_shift').eq('user_id', userId).gte('date', since),
      supabase.from('course_exams').select('exam_date,name,course_id').eq('user_id', userId).gte('exam_date', today),
      supabase.from('courses').select('id,name').eq('user_id', userId),
      supabase.from('user_settings').select('goals').eq('user_id', userId).maybeSingle(),
      getProfileWith(supabase)(userId),
    ])
    const daily = {}
    const touch = (d) => (daily[d] || (daily[d] = {}))
    for (const e of j.data || []) { const r = touch(e.date); if (e.sleep_hours > 0) r.sleep = e.sleep_hours; if (e.energy) r.energy = e.energy; if (e.mood) r.mood = e.mood }
    for (const l of h.data || []) { const r = touch(l.date); const en = l.energy_level ?? l.energy; if (l.sleep_hours > 0 && r.sleep == null) r.sleep = l.sleep_hours; if (en && r.energy == null) r.energy = en; if (l.steps > 0) r.steps = l.steps; if (l.weight_kg > 0) r.weight = l.weight_kg }
    for (const s of st.data || []) { const r = touch(s.date); r.study = (r.study || 0) + (s.hours || 0) }
    for (const t of tr.data || []) { const r = touch(t.date); r.train = (r.train || 0) + 1 }
    for (const p of pa.data || []) { const r = touch(p.date); r.paHours = (r.paHours || 0) + (p.hours_worked || 0); if (p.is_night_shift) r.paNight = 1 }
    const findings = crossDomainFindings(Object.entries(daily).map(([date, r]) => ({ date, ...r })))
    const mblock = findingsToPrompt(findings.slice(0, 5))
    if (mblock) fullCtx += '\n\nMÖNSTER (90d):\n' + mblock.replace(/^KOPPLINGAR[^\n]*\n/, '')

    const signals = detectSignals({
      health: h.data || [], training: tr.data || [], exams: ex.data || [],
      courses: co.data || [], studySessions: st.data || [], goals: us.data?.goals || {},
      // Same målvikt as Dashboard/Insights (Mål-page goal > profile > settings).
      targetWeight: resolveTargetWeight(prof, us.data, goalsList),
      targetWeightDeadline: goalsList.find(g => g.metric === 'body_weight' && g.target_value != null)?.deadline || null,
      today: now,
    })
    const sblock = signalsToPrompt(signals)
    if (sblock) fullCtx += '\n\n' + sblock
  } catch { /* best-effort */ }

  return fullCtx
}
