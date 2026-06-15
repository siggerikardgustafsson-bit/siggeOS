import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, getAuthedUser, unauthorized } from '../_shared/auth.ts'

const todayISO = () => new Date().toISOString().slice(0, 10)
const daysAgoISO = (days: number) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
const asLimit = (value: any, fallback = 50, max = 200) => Math.min(Math.max(Number(value || fallback), 1), max)
const clean = (value: any) => value == null || value === '' ? null : value

// ─────────────────────────────────────────────
// TOOLS
// Sharp, unambiguous descriptions so Jarvis
// knows exactly when to fetch vs rely on context.
// ─────────────────────────────────────────────
const TOOLS = [
  {
    name: 'fetch_workouts',
    description: 'Pass, PR, styrka/löptrend, Strava-historik. All-time PR-tavla→include_prs=true. Senaste→limit 1.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['löpning', 'gym', 'cykling', 'simning', 'promenad', 'övrigt', 'all'] },
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'default 20' },
        include_prs: { type: 'boolean', description: 'true = hämta all-time PR-tavla: styrke-PR (personal_records) + löp-PR per distans (run_personal_records)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_health',
    description: 'Vikt, sömn, steg, energi, humör, stress, alkohol, puls, kosttillskott (intag/följsamhet), retatrutide-dos. Trender→30-90d.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'default 30' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_journal',
    description: 'Journalanteckningar, AI-summering, mönster. Mående/känslor/reflektion/brief. Hela historiken→date_from 2020-01-01. Sök specifikt ämne→search_keyword.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'default 10' },
        search_keyword: { type: 'string', description: 'Sök i journaltext efter nyckelord/ämne' },
        summaries_only: { type: 'boolean', description: 'true = bara ai_summary (låg token-kostnad), bra för trendanalys över lång tid' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_economy',
    description: 'Inkomster, utgifter/kategori, fasta kostnader, nettoförmögenhet + 30d-trend, tillgångar, CSN. Budget/sparande/förmögenhet/trend→30-90d, type=both.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        type: { type: 'string', enum: ['income', 'expense', 'both'], description: 'default both' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_study',
    description: 'Kurser, tentor, studiesessioner, lärandemål/mastery. Plugg/tenta/studieplan/KI.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_calendar',
    description: 'Google Calendar, obligatoriska KI-moment, PA-pass. Schema/vad händer/denna vecka.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD, default idag' },
        date_to: { type: 'string', description: 'YYYY-MM-DD, default +14d' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_experiences',
    description: 'Resor (med planning_doc/budget), äventyr, side quests, sociala interaktioner. trip-ID→type=trips.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['trips', 'adventures', 'quests', 'social', 'all'] },
        limit: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_scores',
    description: 'daily_scores + tier_snapshots (Kondition/Styrka/Plugg/Ekonomi/Sömn/Välmående). Trend/progress/peak mode.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_tasks',
    description: 'Erik-uppdrag + projekt-tasks. Jobb/deadlines/projektboard. project_id om specifikt projekt. include_projects=true för alla.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ej_påbörjat', 'pågående', 'klart', 'all'] },
        limit: { type: 'number' },
        project_id: { type: 'string' },
        include_projects: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_memory_goals',
    description: 'Fullständiga mål, alla insikter, djupare vänprofiler. Använd om auto-laddat minne inte räcker, eller sök specifikt minne med search_keyword.',
    input_schema: {
      type: 'object',
      properties: {
        include_friends: { type: 'boolean', description: 'true = vänner med fullständiga notes' },
        limit: { type: 'number', description: 'default 100' },
        search_keyword: { type: 'string', description: 'Sök i insikter/mål efter nyckelord' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_chat_history',
    description: 'Sök i tidigare Jarvis-konversationer. Använd för: "vad sa vi om X?", mönster över tid, fakta Sigge nämnt i gamla chattar, kontinuitet mellan sessioner.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD, default 30 dagar sedan' },
        date_to: { type: 'string', description: 'YYYY-MM-DD, default idag' },
        search_keyword: { type: 'string', description: 'Filtrera meddelanden som innehåller detta ord/fras (ej känsliga)' },
        role: { type: 'string', enum: ['user', 'assistant', 'all'], description: 'default all' },
        limit: { type: 'number', description: 'default 40, max 150' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_nutrition',
    description: 'Kalorier, protein, vatten, måltider med AI-analys.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: [],
    },
  },
  {
    name: 'execute_action',
    description: 'Skriv till DB. Kör direkt, ingen bekräftelse. Saknar ID → hämta det först.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create_project_task', 'update_project_task', 'delete_project_task',
            'create_trip', 'update_trip',
            'create_erik_task', 'update_erik_task', 'delete_erik_task',
            'log_training', 'update_training', 'delete_training',
            'log_health', 'update_health', 'delete_health',
            'log_expense', 'update_expense', 'delete_expense',
            'log_income', 'delete_income',
            'create_adventure', 'save_insight', 'update_insight', 'delete_insight',
            'update_friend', 'save_preference', 'update_memory_context',
          ],
        },
        data: {
          type: 'object',
          description: 'create_project_task:{project_id,title,description?,priority?,deadline?,status?} | update_project_task:{id,fields} | delete_project_task:{id} | create_trip:{title,countries[],status?,start_date?,end_date?,planning_doc?,budget_sek?} | update_trip:{id,fields} | create_erik_task:{title,description?,deadline?,tag?,priority?} | update_erik_task:{id,fields} | log_training:{date?,session_type,duration_minutes?,distance_km?,feeling?,notes?} | log_health:{date?,weight_kg?,sleep_hours?,energy?,steps?,mood?,stress_level?,alcohol_units?} | log_expense:{date?,amount,category,description?} | log_income:{date?,amount,source,notes?} | create_adventure:{title,description?,date?,location?,category?,rating?} | save_insight:{insight_text,category,confidence?} | update_insight:{id,insight_text?,category?,confidence?} | delete_insight:{id} | update_friend:{friend_name,new_info} | save_preference:{preference_text,category} | update_memory_context:{context_area,update_text}',
        },
        confirm_message: { type: 'string' },
      },
      required: ['action', 'data', 'confirm_message'],
    },
  },
]

// ─────────────────────────────────────────────
// TOOL EXECUTION
// ─────────────────────────────────────────────
async function executeTool(toolName: string, input: any, supabase: any, userId: string): Promise<string> {
  const today = todayISO()
  const thirtyDaysAgo = daysAgoISO(30)
  const ninetyDaysAgo = daysAgoISO(90)

  try {
    if (toolName === 'fetch_workouts') {
      let q = supabase.from('training_sessions')
        .select('id,date,session_type,duration_minutes,feeling,notes,distance_km,time_seconds,pace_per_km,source,strava_id,created_at')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(asLimit(input.limit, 20, 80))
      if (input.type && input.type !== 'all') q = q.eq('session_type', input.type)
      if (input.date_from) q = q.gte('date', input.date_from)
      if (input.date_to) q = q.lte('date', input.date_to)

      const { data: sessions, error } = await q
      if (error) throw error
      if (!sessions?.length) return 'Inga träningspass hittades.'

      const sessionIds = sessions.map((s: any) => s.id)
      const { data: exercises } = await supabase
        .from('training_exercises')
        .select('id,session_id,exercise_name,set_number,reps,weight_kg,is_dropset')
        .in('session_id', sessionIds)
        .order('exercise_name').order('set_number')

      const bySession: Record<string, any[]> = {}
      for (const ex of exercises || []) {
        if (!bySession[ex.session_id]) bySession[ex.session_id] = []
        bySession[ex.session_id].push(ex)
      }

      const rows = sessions.map((sess: any) => {
        const parts = [sess.date, sess.session_type || 'pass']
        if (sess.distance_km) parts.push(`${sess.distance_km}km`)
        if (sess.duration_minutes) parts.push(`${sess.duration_minutes}min`)
        if (sess.pace_per_km) parts.push(`${Math.floor(sess.pace_per_km/60)}:${String(sess.pace_per_km%60).padStart(2,'0')}/km`)
        if (sess.feeling) parts.push(`känsla:${sess.feeling}/10`)
        if (sess.notes) parts.push(`"${sess.notes.slice(0,80)}"`)
        parts.push(`[id:${sess.id}]`)

        const exs = bySession[sess.id] || []
        if (!exs.length) return parts.join(' | ')

        const grouped: Record<string, any[]> = {}
        for (const ex of exs) {
          if (!grouped[ex.exercise_name]) grouped[ex.exercise_name] = []
          grouped[ex.exercise_name].push(ex)
        }
        const exerciseText = Object.entries(grouped).map(([name, sets]) => {
          const setText = sets.map((ex: any) => [ex.reps && `${ex.reps}r`, ex.weight_kg != null && `${ex.weight_kg}kg`, ex.is_dropset && '↓'].filter(Boolean).join('')).join(' | ')
          return `  ${name}: ${setText}`
        }).join('\n')

        return parts.join(' | ') + '\n' + exerciseText
      }).join('\n\n')

      let prSection = ''
      if (input.include_prs) {
        // Authoritative all-time PR boards (not just this fetch window).
        const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
        const [strengthRes, runRes] = await Promise.all([
          supabase.from('personal_records')
            .select('exercise_name,weight_kg,reps,date,distance_km,pace_per_km,time_seconds')
            .eq('user_id', userId).order('weight_kg', { ascending: false }).limit(60),
          supabase.from('run_personal_records')
            .select('label,distance_key,time_seconds,pace_per_km,date')
            .eq('user_id', userId).order('time_seconds', { ascending: true }),
        ])
        // Strength PBs only — exclude legacy run-style records stored in personal_records.
        const strengthLines = (strengthRes.data || [])
          .filter((p: any) => p.weight_kg != null && p.distance_km == null && p.pace_per_km == null)
          .sort((a: any, b: any) => String(a.exercise_name).localeCompare(String(b.exercise_name)))
          .map((p: any) => `${p.exercise_name}: ${p.weight_kg}kg × ${p.reps || '?'}r (${p.date || '?'})`).join('\n')
        // Best run effort per distance.
        const runBest: Record<string, any> = {}
        for (const r of runRes.data || []) {
          if (!r.time_seconds) continue
          if (!runBest[r.distance_key] || r.time_seconds < runBest[r.distance_key].time_seconds) runBest[r.distance_key] = r
        }
        const runLines = Object.values(runBest)
          .map((r: any) => `${r.label || r.distance_key}: ${fmtTime(r.time_seconds)}${r.pace_per_km ? ' (' + fmtTime(r.pace_per_km) + '/km)' : ''} (${r.date || '?'})`).join('\n')
        prSection = `\n\nSTYRKE-PR (all-time):\n${strengthLines || '—'}\n\nLÖP-PR (all-time):\n${runLines || '—'}`
      }
      return `Träning (${sessions.length} pass):\n\n${rows}${prSection}`
    }

    if (toolName === 'fetch_health') {
      const { data, error } = await supabase.from('health_logs')
        .select('id,date,weight_kg,body_fat_pct,steps,sleep_hours,sleep_quality,sleep_type,sleep_note,resting_hr,screen_time_minutes,alcohol_units,nicotine,caffeine_mg,energy,energy_level,stress_level,mood,retatrutide_dose_mg,source')
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(asLimit(input.limit, 30, 200))
      if (error) throw error
      if (!data?.length) return 'Ingen hälsodata hittades.'
      const rows = data.map((r: any) => {
        const energy = r.energy_level ?? r.energy
        const parts = [r.date]
        if (r.weight_kg) parts.push(`vikt ${r.weight_kg}kg`)
        if (r.sleep_hours) parts.push(`sömn ${r.sleep_hours}h`)
        if (r.sleep_quality) parts.push(`sömnkvalitet ${r.sleep_quality}/10`)
        if (r.steps) parts.push(`steg ${r.steps}`)
        if (energy) parts.push(`energi ${energy}/10`)
        if (r.mood) parts.push(`humör ${r.mood}/10`)
        if (r.stress_level) parts.push(`stress ${r.stress_level}/10`)
        if (r.alcohol_units) parts.push(`alkohol ${r.alcohol_units}`)
        if (r.nicotine) parts.push('nikotin')
        if (r.caffeine_mg) parts.push(`koffein ${r.caffeine_mg}mg`)
        if (r.body_fat_pct) parts.push(`fett ${r.body_fat_pct}%`)
        if (r.resting_hr) parts.push(`vilopuls ${r.resting_hr}`)
        if (r.retatrutide_dose_mg) parts.push(`retatrutide ${r.retatrutide_dose_mg}mg`)
        if (r.sleep_note) parts.push(`"${r.sleep_note.slice(0,80)}"`)
        parts.push(`[id:${r.id}]`)
        return parts.join(' | ')
      }).join('\n')

      // Supplement adherence over the same window (taken vs logged days per supplement).
      const { data: supps } = await supabase.from('supplement_logs')
        .select('date,supplement_name,taken')
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(400)
      let suppSection = ''
      if (supps?.length) {
        const byName: Record<string, { taken: number; total: number }> = {}
        for (const s of supps) {
          const n = s.supplement_name || '?'
          if (!byName[n]) byName[n] = { taken: 0, total: 0 }
          byName[n].total++
          if (s.taken) byName[n].taken++
        }
        const line = Object.entries(byName).sort((a, b) => b[1].taken - a[1].taken)
          .map(([n, v]) => `${n}: ${v.taken}/${v.total} dgr`).join(', ')
        suppSection = `\n\nKOSTTILLSKOTT (intag i perioden): ${line}`
      }
      return `Hälsa (${data.length} dagar):\n${rows}${suppSection}`
    }

    if (toolName === 'fetch_journal') {
      const selectFields = input.summaries_only
        ? 'id,date,mood,energy,sleep_hours,social_score,ai_summary,ai_extracted_keywords'
        : 'id,date,content,mood,sleep_hours,energy,social_score,is_travel_entry,ai_extracted_people,ai_extracted_activities,ai_extracted_keywords,ai_summary,sleep_type,sleep_note'
      let q = supabase.from('journal_entries')
        .select(selectFields)
        .eq('user_id', userId)
        .gte('date', input.date_from || ninetyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(asLimit(input.limit, input.summaries_only ? 60 : 10, 200))
      if (input.search_keyword) q = q.or(`content.ilike.%${input.search_keyword}%,ai_summary.ilike.%${input.search_keyword}%`)
      const { data, error } = await q
      if (error) throw error
      if (!data?.length) return `Inga journalanteckningar hittades${input.search_keyword ? ` med "${input.search_keyword}"` : ''}.`
      const rows = data.map((r: any) => {
        const meta = [`📅 ${r.date}`]
        if (r.mood) meta.push(`humör ${r.mood}/10`)
        if (r.energy) meta.push(`energi ${r.energy}/10`)
        if (r.sleep_hours) meta.push(`sömn ${r.sleep_hours}h`)
        if (r.social_score) meta.push(`socialt ${r.social_score}/10`)
        if (r.is_travel_entry) meta.push('reseentry')
        meta.push(`[id:${r.id}]`)
        if (input.summaries_only) {
          const summary = r.ai_summary ? `${r.ai_summary}` : '(ingen sammanfattning)'
          const kw = r.ai_extracted_keywords?.length ? ` [${r.ai_extracted_keywords.slice(0,5).join(',')}]` : ''
          return `${meta.join(' | ')}\n${summary}${kw}`
        }
        const summary = r.ai_summary ? `Sammanfattning: ${r.ai_summary}\n` : ''
        const people = r.ai_extracted_people?.length ? `Personer: ${r.ai_extracted_people.join(', ')}\n` : ''
        const content = r.content ? `Entry:\n"${r.content.slice(0, 1000)}${r.content.length > 1000 ? '…' : ''}"` : ''
        return [meta.join(' | '), summary + people + content].filter(Boolean).join('\n')
      }).join('\n\n')
      return `Journal (${data.length} entries${input.search_keyword ? `, sök:"${input.search_keyword}"` : ''}):\n\n${rows}`
    }

    if (toolName === 'fetch_economy') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const type = input.type || 'both'
      const results: string[] = []

      if (type === 'income' || type === 'both') {
        const { data, error } = await supabase.from('income_logs')
          .select('id,date,amount,source,counts_toward_csn,notes')
          .eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false })
        if (error) throw error
        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
          results.push(`INKOMSTER (${data.length}, totalt ${Math.round(total).toLocaleString('sv-SE')} kr):\n` + data.map((r: any) => `${r.date} | ${r.amount} kr | ${r.source}${r.notes ? ' | ' + r.notes : ''} [id:${r.id}]`).join('\n'))
        }
      }

      if (type === 'expense' || type === 'both') {
        const { data, error } = await supabase.from('expense_logs')
          .select('id,date,amount,category,description')
          .eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false })
        if (error) throw error
        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
          const byCat: Record<string, number> = {}
          data.forEach((r: any) => { byCat[r.category || 'Övrigt'] = (byCat[r.category || 'Övrigt'] || 0) + Number(r.amount || 0) })
          const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${Math.round(v)} kr`).join(', ')
          results.push(`UTGIFTER (${data.length}, totalt ${Math.round(total).toLocaleString('sv-SE')} kr)\nPer kategori: ${cats}\n` + data.map((r: any) => `${r.date} | ${r.amount} kr | ${r.category} | ${r.description || ''} [id:${r.id}]`).join('\n'))
        }
      }

      const { data: fixed } = await supabase.from('fixed_costs')
        .select('id,name,amount,category,active').eq('user_id', userId).eq('active', true).order('amount', { ascending: false })
      if (fixed?.length) {
        const fixedTotal = fixed.reduce((s: number, f: any) => s + Number(f.amount || 0), 0)
        results.push(`FASTA KOSTNADER (${Math.round(fixedTotal).toLocaleString('sv-SE')} kr/mån):\n${fixed.map((f: any) => `${f.name} | ${f.amount} kr | ${f.category} [id:${f.id}]`).join('\n')}`)
      }

      // Net worth: precomputed daily total + 30d trend, plus current asset breakdown.
      const { data: nw } = await supabase.from('net_worth_history')
        .select('date,total_sek').eq('user_id', userId).order('date', { ascending: false }).limit(120)
      if (nw?.length) {
        const latest = nw[0]
        const ref = nw.find((r: any) => r.date <= daysAgoISO(30)) || nw[nw.length - 1]
        const delta = Number(latest.total_sek || 0) - Number(ref.total_sek || 0)
        const pct = ref.total_sek ? ((delta / Number(ref.total_sek)) * 100).toFixed(1) : '—'
        results.unshift(`NETTOFÖRMÖGENHET: ${Math.round(latest.total_sek).toLocaleString('sv-SE')} kr (${latest.date}) | Δ30d: ${delta >= 0 ? '+' : ''}${Math.round(delta).toLocaleString('sv-SE')} kr (${pct}%)`)
      }
      const { data: assets } = await supabase.from('assets')
        .select('name,type,quantity,manual_price_sek').eq('user_id', userId).order('created_at')
      if (assets?.length) {
        results.push(`TILLGÅNGAR:\n${assets.map((a: any) => `${a.name} | ${a.type}${a.quantity ? ' | ' + a.quantity + ' st' : ''}${a.manual_price_sek != null ? ' | ' + Math.round(a.manual_price_sek).toLocaleString('sv-SE') + ' kr' : ''}`).join('\n')}`)
      }

      return results.length ? results.join('\n\n') : 'Ingen ekonomidata hittades.'
    }

    if (toolName === 'fetch_study') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const [sessionsRes, coursesRes, examsRes, goalsRes] = await Promise.all([
        supabase.from('study_sessions').select('id,date,course_id,subject,hours,notes').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(asLimit(input.limit, 50, 200)),
        supabase.from('courses').select('id,name,term,exam_date,active,grade,goal_hours').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('course_exams').select('id,course_id,name,exam_date,grade,points_earned,points_max').eq('user_id', userId).order('exam_date', { ascending: true }).limit(20),
        supabase.from('learning_goals').select('id,course_id,description,completed,mastery,last_studied').eq('user_id', userId).order('mastery', { ascending: true }).limit(40),
      ])
      const courses = (coursesRes.data || []).reduce((acc: any, c: any) => { acc[c.id] = c; return acc }, {})
      const sessions = sessionsRes.data || []
      const totalH = sessions.reduce((s: number, r: any) => s + Number(r.hours || 0), 0)
      const sessionRows = sessions.map((r: any) => `${r.date} | ${r.hours}h | ${courses[r.course_id]?.name || r.subject || '?'}${r.notes ? ' | ' + r.notes : ''} [id:${r.id}]`).join('\n')
      const activeCourses = (coursesRes.data || []).filter((c: any) => c.active).map((c: any) => `${c.name} [id:${c.id}]${c.exam_date ? ' tenta:' + c.exam_date : ''}`).join(', ')
      const exams = (examsRes.data || []).map((e: any) => `${e.exam_date || '?'} | ${e.name} | ${courses[e.course_id]?.name || '?'}${e.points_max ? ` | ${e.points_earned || 0}/${e.points_max}p` : ''} [id:${e.id}]`).join('\n')
      const weakGoals = (goalsRes.data || []).slice(0, 15).map((g: any) => `${g.mastery || 0}% | ${g.completed ? 'klar' : 'ej klar'} | ${g.description.slice(0, 120)} [id:${g.id}]`).join('\n')
      return `Plugg ${from}→${to} | Studietid: ${totalH.toFixed(1)}h (${sessions.length} sessioner) | Aktiva kurser: ${activeCourses || 'inga'}\n\nSESSIONER:\n${sessionRows || '—'}\n\nTENTOR:\n${exams || '—'}\n\nSVAGASTE LÄRANDEMÅL:\n${weakGoals || '—'}`
    }

    if (toolName === 'fetch_calendar') {
      const from = input.date_from || today
      const to = input.date_to || daysAgoISO(-14)
      const [eventsRes, mandatoryRes, shiftsRes] = await Promise.all([
        supabase.from('schedule_events').select('id,title,event_type,starts_at,ends_at,location').eq('user_id', userId).gte('starts_at', from).lte('starts_at', to).order('starts_at').limit(50),
        supabase.from('mandatory_sessions').select('id,title,date,start_time,end_time,attended,course_hint').eq('user_id', userId).gte('date', from).lte('date', to).order('date').limit(50),
        supabase.from('pa_shifts').select('id,date,client_name,start_time,end_time,hours_worked,estimated_pay,shift_type,notes').eq('user_id', userId).gte('date', from).lte('date', to).order('date').limit(50),
      ])
      const events = (eventsRes.data || []).map((e: any) => `${e.starts_at} | ${e.title} | ${e.event_type || ''}${e.location ? ' @ ' + e.location : ''} [id:${e.id}]`).join('\n')
      const mandatory = (mandatoryRes.data || []).map((m: any) => `${m.date} ${m.start_time || ''} | ${m.title} | ${m.attended ? '✓ närvaro' : 'ej markerad'}${m.course_hint ? ' | ' + m.course_hint : ''} [id:${m.id}]`).join('\n')
      const shifts = (shiftsRes.data || []).map((s: any) => `${s.date} | PA-pass ${s.shift_type || ''} | ${s.hours_worked || '?'}h | ~${s.estimated_pay || '?'}kr${s.client_name ? ' | ' + s.client_name : ''} [id:${s.id}]`).join('\n')
      return `Kalender ${from}→${to}\nEVENTS:\n${events || '—'}\n\nOBLIGATORISKT:\n${mandatory || '—'}\n\nPA-PASS:\n${shifts || '—'}`
    }

    if (toolName === 'fetch_experiences') {
      const type = input.type || 'all'
      const limit = asLimit(input.limit, 20, 100)
      const results: string[] = []

      if (type === 'trips' || type === 'all') {
        const { data, error } = await supabase.from('trips').select('id,title,country,city,countries,start_date,end_date,highlights,rating,status,budget_sek,planning_doc,notes').eq('user_id', userId).order('start_date', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`RESOR:\n${data.map((r: any) => `${r.title} | ${r.status} | ${r.countries?.join(', ') || r.country || ''}${r.city ? ', ' + r.city : ''} | ${r.start_date || '?'}→${r.end_date || '?'}${r.rating ? ' | ★' + r.rating : ''}${r.budget_sek ? ' | budget:' + r.budget_sek + 'kr' : ''}${r.planning_doc ? '\n  Plan: ' + r.planning_doc.slice(0, 200) : ''} [id:${r.id}]`).join('\n')}`)
      }
      if (type === 'adventures' || type === 'all') {
        const { data, error } = await supabase.from('adventures').select('id,title,description,date,location,category,rating').eq('user_id', userId).order('date', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`ÄVENTYR:\n${data.map((r: any) => `${r.date} | ${r.title} | ${r.category}${r.location ? ' @ ' + r.location : ''}${r.rating ? ' ★' + r.rating : ''}${r.description ? ' | ' + r.description.slice(0, 80) : ''} [id:${r.id}]`).join('\n')}`)
      }
      if (type === 'quests' || type === 'all') {
        const { data, error } = await supabase.from('side_quests').select('id,title,description,category,difficulty,status').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`SIDE QUESTS:\n${data.map((r: any) => `${r.title} | ${r.status} | ${r.category} | ${r.difficulty}${r.description ? ' | ' + r.description.slice(0, 80) : ''} [id:${r.id}]`).join('\n')}`)
      }
      if (type === 'social' || type === 'all') {
        const { data, error } = await supabase.from('social_interactions').select('id,date,friend_names,activity,duration_hours,quality,notes').eq('user_id', userId).order('date', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`SOCIALT:\n${data.map((r: any) => `${r.date} | ${r.friend_names?.join(', ')} | ${r.activity}${r.duration_hours ? ' ' + r.duration_hours + 'h' : ''}${r.quality ? ' kvalitet:' + r.quality + '/10' : ''} [id:${r.id}]`).join('\n')}`)
      }
      return results.length ? results.join('\n\n') : 'Inga upplevelser hittades.'
    }

    if (toolName === 'fetch_scores') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const [scoresRes, tiersRes] = await Promise.all([
        supabase.from('daily_scores').select('date,score_training,score_health,score_study,score_economy,score_social,score_work,total_score,peak_mode').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }),
        supabase.from('tier_snapshots').select('date,kondition,styrka,plugg,ekonomi,somn,valmående').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(10),
      ])
      const scores = scoresRes.data || []
      const avg = (key: string) => { const vals = scores.map((r: any) => Number(r[key] || 0)).filter(Boolean); return vals.length ? (vals.reduce((a: number, b: number) => a + b) / vals.length).toFixed(1) : '—' }
      const rows = scores.map((r: any) => `${r.date} | tot:${r.total_score} tr:${r.score_training} hä:${r.score_health} pl:${r.score_study} ek:${r.score_economy} soc:${r.score_social}${r.peak_mode ? ' PEAK' : ''}`).join('\n')
      const tierRows = (tiersRes.data || []).map((r: any) => `${r.date} | kond:${r.kondition} styrka:${r.styrka} plugg:${r.plugg} ek:${r.ekonomi} sömn:${r.somn} välm:${r.valmående}`).join('\n')
      return `Scores ${from}→${to}\nSnitt: total:${avg('total_score')} träning:${avg('score_training')} hälsa:${avg('score_health')} plugg:${avg('score_study')} ekonomi:${avg('score_economy')}\n\nDAGSSCORES:\n${rows || '—'}\n\nTIERS:\n${tierRows || '—'}`
    }

    if (toolName === 'fetch_tasks') {
      const results: string[] = []
      if (input.project_id || input.include_projects) {
        let pq = supabase.from('project_tasks').select('id,project_id,title,description,deadline,status,priority,notes').eq('user_id', userId).order('created_at', { ascending: false }).limit(asLimit(input.limit, 50, 200))
        if (input.project_id) pq = pq.eq('project_id', input.project_id)
        if (input.status && input.status !== 'all') pq = pq.eq('status', input.status)
        const { data, error } = await pq
        if (error) throw error
        if (data?.length) results.push(`PROJEKT-TASKS (${data.length}):\n${data.map((t: any) => `${t.status} | ${t.title}${t.priority ? ' | prio:' + t.priority : ''}${t.deadline ? ' | deadline:' + t.deadline : ''} [id:${t.id}] [project_id:${t.project_id}]`).join('\n')}`)
        else results.push('Inga projekt-tasks hittades.')
      }
      if (!input.project_id) {
        let q = supabase.from('erik_tasks').select('id,title,description,deadline,status,priority,tag,notes').eq('user_id', userId).order('created_at', { ascending: false }).limit(asLimit(input.limit, 50, 200))
        if (input.status && input.status !== 'all') q = q.eq('status', input.status)
        const { data, error } = await q
        if (error) throw error
        if (data?.length) results.push(`ERIK-UPPDRAG (${data.length}):\n${data.map((t: any) => `${t.status} | ${t.title} | ${t.tag || 'Övrigt'}${t.priority ? ' | prio:' + t.priority : ''}${t.deadline ? ' | deadline:' + t.deadline : ''} [id:${t.id}]`).join('\n')}`)
      }
      return results.length ? results.join('\n\n') : 'Inga tasks hittades.'
    }

    if (toolName === 'fetch_memory_goals') {
      const limit = asLimit(input.limit, 100, 300)
      const [settingsRes, insightsRes, friendsRes] = await Promise.all([
        supabase.from('user_settings').select('about_me,goals,jarvis_style,jarvis_lang,jarvis_personality').eq('user_id', userId).single(),
        (() => {
          let q = supabase.from('jarvis_insights').select('id,insight,category,confidence,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(limit)
          if (input.search_keyword) q = q.ilike('insight', `%${input.search_keyword}%`)
          return q
        })(),
        input.include_friends ? supabase.from('friends').select('id,name,nickname,relationship,location,notes,last_contact_date').eq('user_id', userId).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      ])
      const s = settingsRes.data || {}
      const goals = s.goals ? JSON.stringify(s.goals, null, 2) : '{}'
      const insights = (insightsRes.data || []).map((i: any) => `[${i.category} ${i.confidence}%] ${i.insight} [id:${i.id}]`).join('\n')
      const friends = (friendsRes.data || []).map((f: any) => `${f.name}${f.nickname ? '/'+f.nickname : ''} | ${f.relationship || ''}${f.location ? ' | '+f.location : ''}${f.last_contact_date ? ' | senast:'+f.last_contact_date : ''}${f.notes ? ' | '+f.notes.slice(0,120) : ''} [id:${f.id}]`).join('\n')
      return `PROFIL:\n${s.about_me || '—'}\n\nMÅL:\n${goals}\n\nMINNEN (${insightsRes.data?.length || 0}${input.search_keyword ? `, sök:"${input.search_keyword}"` : ''}):\n${insights || '—'}\n\nVÄNNER:\n${friends || '—'}`
    }

    if (toolName === 'fetch_chat_history') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const limit = asLimit(input.limit, 40, 150)
      let q = supabase.from('jarvis_conversations')
        .select('role,content,created_at')
        .eq('user_id', userId)
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (input.role && input.role !== 'all') q = q.eq('role', input.role)
      if (input.search_keyword) q = q.ilike('content', `%${input.search_keyword}%`)
      const { data, error } = await q
      if (error) throw error
      if (!data?.length) return `Inga tidigare konversationer hittades${input.search_keyword ? ` med "${input.search_keyword}"` : ''}.`
      // Return in chronological order with date markers
      const reversed = [...data].reverse()
      const rows = reversed.map((r: any) => {
        const date = r.created_at.slice(0, 10)
        const time = r.created_at.slice(11, 16)
        const label = r.role === 'user' ? 'Sigge' : 'Jarvis'
        const text = String(r.content || '').slice(0, 400)
        return `[${date} ${time}] ${label}: ${text}${r.content?.length > 400 ? '…' : ''}`
      }).join('\n')
      return `Chatthistorik ${from}→${to} (${data.length} meddelanden${input.search_keyword ? `, sök:"${input.search_keyword}"` : ''}):\n\n${rows}`
    }

    if (toolName === 'fetch_nutrition') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const [nutritionRes, mealsRes] = await Promise.all([
        supabase.from('nutrition_logs').select('id,date,total_calories,protein_g,water_liters').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(60),
        supabase.from('meal_logs').select('id,date,meal_time,description,calories_estimate,protein_estimate_g,ai_analysis').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(80),
      ])
      const nutrition = (nutritionRes.data || []).map((n: any) => `${n.date} | ${n.total_calories || '?'}kcal | protein:${n.protein_g || '?'}g | vatten:${n.water_liters || '?'}L [id:${n.id}]`).join('\n')
      const meals = (mealsRes.data || []).map((m: any) => `${m.date} ${m.meal_time || ''} | ${m.description || ''}${m.calories_estimate ? ' | ~'+m.calories_estimate+'kcal' : ''}${m.ai_analysis ? ' | '+m.ai_analysis.slice(0,80) : ''} [id:${m.id}]`).join('\n')
      return `Nutrition ${from}→${to}\nDAGAR:\n${nutrition || '—'}\nMÅLTIDER:\n${meals || '—'}`
    }

    if (toolName === 'execute_action') {
      const { action, data: d = {} } = input
      let result = ''
      switch (action) {
        case 'create_project_task': {
          const { error } = await supabase.from('project_tasks').insert({ user_id: userId, project_id: d.project_id, title: d.title, description: d.description || null, deadline: clean(d.deadline), priority: d.priority || 'medium', notes: d.notes || null, status: d.status || 'ej_påbörjat' })
          if (error) throw error
          result = `Task "${d.title}" skapad.`
          break
        }
        case 'update_project_task': {
          const { error } = await supabase.from('project_tasks').update(d.fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Task uppdaterad.'
          break
        }
        case 'delete_project_task': {
          const { error } = await supabase.from('project_tasks').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Task raderad.'
          break
        }
        case 'create_trip': {
          const { error } = await supabase.from('trips').insert({ user_id: userId, title: d.title, countries: d.countries || [], country: d.countries?.[0] || '', city: d.city || '', start_date: clean(d.start_date), end_date: clean(d.end_date), status: d.status || 'idea', planning_doc: d.planning_doc || null, budget_items: d.budget_items || null, budget_sek: clean(d.budget_sek), notes: d.planning_doc || d.notes || null, highlights: d.highlights || null })
          if (error) throw error
          result = `Resa "${d.title}" skapad.`
          break
        }
        case 'update_trip': {
          const fields = { ...d.fields }
          if (fields.planning_doc) fields.notes = fields.planning_doc
          const { error } = await supabase.from('trips').update(fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Resa uppdaterad.'
          break
        }
        case 'create_erik_task': {
          const { error } = await supabase.from('erik_tasks').insert({ user_id: userId, title: d.title, description: d.description || '', deadline: clean(d.deadline), tag: d.tag || 'Övrig verksamhet', status: d.status || 'ej_påbörjat', priority: d.priority || 'medium' })
          if (error) throw error
          result = `Erik-uppdrag "${d.title}" skapat.`
          break
        }
        case 'update_erik_task': {
          const { error } = await supabase.from('erik_tasks').update(d.fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Erik-uppdrag uppdaterat.'
          break
        }
        case 'delete_erik_task': {
          const { error } = await supabase.from('erik_tasks').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Erik-uppdrag raderat.'
          break
        }
        case 'log_training': {
          const { error } = await supabase.from('training_sessions').insert({ user_id: userId, date: d.date || todayISO(), session_type: d.session_type || 'övrigt', duration_minutes: clean(d.duration_minutes), distance_km: clean(d.distance_km), time_seconds: clean(d.time_seconds), pace_per_km: clean(d.pace_per_km), feeling: clean(d.feeling), notes: d.notes || '', source: 'jarvis' })
          if (error) throw error
          result = 'Träningspass loggat.'
          break
        }
        case 'log_health': {
          const date = d.date || todayISO()
          const hf: any = {}
          for (const k of ['weight_kg','sleep_hours','energy','energy_level','steps','alcohol_units','nicotine','mood','stress_level','sleep_quality','caffeine_mg']) if (d[k] != null) hf[k] = d[k]
          if (hf.energy != null && hf.energy_level == null) hf.energy_level = hf.energy
          if (hf.energy_level != null && hf.energy == null) hf.energy = hf.energy_level
          const { data: existing } = await supabase.from('health_logs').select('id').eq('user_id', userId).eq('date', date).limit(1).maybeSingle()
          const { error } = existing?.id ? await supabase.from('health_logs').update({ ...hf, source: 'jarvis' }).eq('id', existing.id) : await supabase.from('health_logs').insert({ user_id: userId, date, ...hf, source: 'jarvis' })
          if (error) throw error
          result = `Hälsodata loggad för ${date}.`
          break
        }
        case 'log_expense': {
          const { error } = await supabase.from('expense_logs').insert({ user_id: userId, date: d.date || todayISO(), amount: Number(d.amount || 0), category: d.category || 'Övrigt', description: d.description || '' })
          if (error) throw error
          result = `Utgift ${d.amount} kr loggad.`
          break
        }
        case 'log_income': {
          const { error } = await supabase.from('income_logs').insert({ user_id: userId, date: d.date || todayISO(), amount: Number(d.amount || 0), source: d.source || 'Övrigt', notes: d.notes || '' })
          if (error) throw error
          result = `Inkomst ${d.amount} kr loggad.`
          break
        }
        case 'create_adventure': {
          const { error } = await supabase.from('adventures').insert({ user_id: userId, title: d.title, description: d.description || '', date: d.date || todayISO(), location: d.location || '', category: d.category || 'övrigt', rating: clean(d.rating) })
          if (error) throw error
          result = `Upplevelse "${d.title}" skapad.`
          break
        }
        case 'save_insight': {
          const insightText = d.insight_text || d.insight
          if (!insightText) throw new Error('Saknar insight_text')
          // Check for near-duplicate (exact text match) before inserting
          const { data: existing } = await supabase.from('jarvis_insights').select('id').eq('user_id', userId).ilike('insight', insightText).limit(1)
          if (existing?.length) { result = 'Insikt finns redan (dubblett undviken).'; break }
          const { error } = await supabase.from('jarvis_insights').insert({ user_id: userId, insight: insightText, category: d.category || 'pattern', confidence: d.confidence || 80 })
          if (error) throw error
          result = 'Insikt sparad.'
          break
        }
        case 'update_insight': {
          if (!d.id) throw new Error('Saknar id')
          const fields: any = {}
          if (d.insight_text) fields.insight = d.insight_text
          if (d.category) fields.category = d.category
          if (d.confidence != null) fields.confidence = d.confidence
          const { error } = await supabase.from('jarvis_insights').update(fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Insikt uppdaterad.'
          break
        }
        case 'delete_insight': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('jarvis_insights').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Insikt raderad.'
          break
        }
        case 'update_friend': {
          if (!d.friend_name || !d.new_info) throw new Error('Saknar friend_name/new_info')
          const { data: existing, error: fetchErr } = await supabase.from('friends').select('id,notes').eq('user_id', userId).ilike('name', d.friend_name).maybeSingle()
          if (fetchErr) throw fetchErr
          if (existing) {
            const updatedNotes = existing.notes ? `${existing.notes}\n${d.new_info}` : d.new_info
            const { error } = await supabase.from('friends').update({ notes: updatedNotes, last_contact_date: todayISO() }).eq('id', existing.id)
            if (error) throw error
            result = `Vän "${d.friend_name}" uppdaterad.`
          } else {
            const { error } = await supabase.from('friends').insert({ user_id: userId, name: d.friend_name, notes: d.new_info })
            if (error) throw error
            result = `Vän "${d.friend_name}" skapad med info.`
          }
          break
        }
        case 'save_preference': {
          if (!d.preference_text) throw new Error('Saknar preference_text')
          const { error } = await supabase.from('jarvis_insights').insert({ user_id: userId, insight: d.preference_text, category: `preferens${d.category ? ':' + d.category : ''}`, confidence: 90 })
          if (error) throw error
          result = 'Preferens sparad.'
          break
        }
        case 'update_memory_context': {
          if (!d.context_area || !d.update_text) throw new Error('Saknar context_area/update_text')
          // Find existing insight in same context area and overwrite it
          const { data: existing } = await supabase.from('jarvis_insights').select('id').eq('user_id', userId).ilike('category', `kontext:${d.context_area}`).limit(1).maybeSingle()
          if (existing?.id) {
            const { error } = await supabase.from('jarvis_insights').update({ insight: d.update_text, confidence: 95, updated_at: new Date().toISOString() }).eq('id', existing.id)
            if (error) throw error
            result = `Kontext för "${d.context_area}" uppdaterad (ersatte gammal).`
          } else {
            const { error } = await supabase.from('jarvis_insights').insert({ user_id: userId, insight: d.update_text, category: `kontext:${d.context_area}`, confidence: 95 })
            if (error) throw error
            result = `Kontext för "${d.context_area}" sparad (ny).`
          }
          break
        }
        case 'update_training': {
          if (!d.id || !d.fields) throw new Error('Saknar id/fields')
          const { error } = await supabase.from('training_sessions').update(d.fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Träningspass uppdaterat.'
          break
        }
        case 'update_health': {
          if (!d.id || !d.fields) throw new Error('Saknar id/fields')
          const { error } = await supabase.from('health_logs').update(d.fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Hälsodata uppdaterad.'
          break
        }
        case 'update_expense': {
          if (!d.id || !d.fields) throw new Error('Saknar id/fields')
          const { error } = await supabase.from('expense_logs').update(d.fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Utgift uppdaterad.'
          break
        }
        case 'delete_training': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('training_sessions').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Träningspass raderat.'
          break
        }
        case 'delete_health': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('health_logs').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Hälsologg raderad.'
          break
        }
        case 'delete_expense': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('expense_logs').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Utgift raderad.'
          break
        }
        case 'delete_income': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('income_logs').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Inkomst raderad.'
          break
        }
        default:
          throw new Error(`Okänd action: ${action}`)
      }
      return result || 'Klart.'
    }

    return `Okänt verktyg: ${toolName}`
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Fel (${toolName}): ${msg}`
  }
}

// ─────────────────────────────────────────────
// SYSTEM PROMPT — built entirely server-side
// ─────────────────────────────────────────────
function buildSystemPrompt(context: string, settings: any, contentBlock: string, insights: any[] = [], friends: any[] = []): string {
  const s = settings || {}
  const g = s.goals || {}

  const profileLines = [
    s.about_me && `Profil: ${s.about_me}`,
    g.one_year && `1år: ${g.one_year}`,
    g.three_year && `3år: ${g.three_year}`,
    g.ten_year && `10år: ${g.ten_year}`,
    g.monthly_income_goal && `Inkomstmål: ${g.monthly_income_goal} kr/mån`,
    (g.target_weight || g.body_weight_goal) && `Viktmål: ${g.target_weight || g.body_weight_goal}kg`,
    s.jarvis_personality && `Instruktion: ${s.jarvis_personality}`,
  ].filter(Boolean).join('\n')

  const style = s.jarvis_style != null
    ? (s.jarvis_style < 30 ? 'diplomatisk' : s.jarvis_style < 60 ? 'balanserad' : s.jarvis_style < 85 ? 'direkt' : 'brutalt ärlig')
    : 'direkt'

  const insightLines = insights.map((i: any) => `${i.category}: ${i.insight.slice(0, 80)}`).join('\n')
  const friendLines = friends.map((f: any) => `${f.name}${f.relationship ? ' ('+f.relationship+')' : ''}`).join(', ')

  return `Du är Jarvis – Sigges AI-coach/assistent i SiggeOS. Stil: ${style}. Datadriven, konkret, aldrig generisk.${s.jarvis_lang && s.jarvis_lang !== 'auto' ? ' Språk: '+s.jarvis_lang+'.' : ''}

PROFIL: ${profileLines || '–'}

MINNE (senaste 20): ${insightLines || '–'}

VÄNNER: ${friendLines || '–'}

NU: ${context || '–'}${contentBlock ? '\n'+contentBlock : ''}

VERKTYG – hämta NÄR data saknas, INTE om svaret ryms ovan. Hämta parallellt vid flera domäner. Ej samma data 2x.
Brief/kväll/vecka → journal+health+workouts+scores. Mående → fetch_journal(summaries_only=true för trend, full för djup). Pass/styrka/löp → fetch_workouts. PR/rekord → fetch_workouts(include_prs=true). Kosttillskott/medicin/retatrutide → fetch_health. Schema → fetch_calendar. Ekonomi/sparande/nettoförmögenhet/tillgångar → fetch_economy. Resor → fetch_experiences. Tasks → fetch_tasks. Djupare minne/sök minne → fetch_memory_goals(search_keyword). Gammal chatt/"vad sa vi om X" → fetch_chat_history(search_keyword). Journal-sök → fetch_journal(search_keyword).

SPARA TYST (execute_action, nämn ej): faktum om Sigge → save_insight | uppdatera fel insikt → update_insight(id,insight_text) | ta bort inaktuell insikt → delete_insight(id) | väninfo → update_friend | korrigering/ny sanning → update_memory_context(context_area,update_text) | preferens → save_preference. Spara 1-2 insikter/konversation om något viktigt framkommit. Kolla MINNE ovan innan du sparar – spara inte om det redan framgår. Rätta aktivt felaktiga minnen när Sigge korrigerar dig.
PR/rekord (styrka+löp) → fetch_workouts(include_prs=true) ger all-time PR-tavla.

ÅTGÄRDER: execute_action direkt utan bekräftelse. Saknas ID → hämta först. delete → bekräfta vad raderas.

LÄNKAR: När du hänvisar till en sida, länka med markdown så Sigge kan klicka dit direkt: [Träning](/traning), [Hälsa](/halsa), [Ekonomi](/ekonomi), [Plugg](/plugg), [Jobb](/jobb), [Kalender](/kalender), [Insights](/insights), [Upplevelser](/upplevelser), [Journal](/journal), [Dashboard](/). Max 1–2 länkar/svar, bara när det tillför.

Svar på användarens språk. Kort.`
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { messages = [], context = '', examFileId, materialIds, stream = false } = await req.json()

    // Per-request JWT/RLS client: every read/write runs AS the authenticated user,
    // so Postgres RLS enforces ownership (defense-in-depth on top of the explicit
    // .eq('user_id', …) filters in executeTool). No service-role client is created
    // here — every table Jarvis touches is user-owned data covered by owner RLS,
    // so the RLS-bypassing service role is not required.
    const { user, userClient: supabase } = await getAuthedUser(req)
    // Reject unauthenticated callers outright — prevents anonymous use of the
    // Anthropic-backed chat (cost abuse) and keeps behaviour uniform with the
    // other functions. Authenticated callers (the only real callers) are unaffected.
    if (!user) return unauthorized(req)

    // Fetch settings, insights, friends, and optional content in parallel
    const [settingsResult, insightsResult, friendsResult, contentResult] = await Promise.all([
      user ? supabase.from('user_settings').select('about_me,goals,jarvis_style,jarvis_lang,jarvis_personality').eq('user_id', user.id).single() : Promise.resolve({ data: null }),
      user ? supabase.from('jarvis_insights').select('insight,category').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      user ? supabase.from('friends').select('name,relationship').eq('user_id', user.id).order('created_at', { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
      (async () => {
        let block = ''
        // SECURITY: this runs on the SERVICE-ROLE client, which bypasses RLS, so the
        // user scope MUST be applied explicitly here. Without `.eq('user_id', user.id)`
        // a client could pass arbitrary ids and read another user's uploaded course
        // materials / old exams. Also gated on `user` so nothing leaks when unauthenticated.
        if (user && materialIds?.length) {
          const { data: mats } = await supabase.from('course_materials').select('file_name,content').in('id', materialIds).eq('user_id', user.id)
          if (mats?.length) block += '\nKURSMATERIAL:\n' + mats.map((m: any) => `--- ${m.file_name} ---\n${m.content || ''}`).join('\n\n')
        }
        if (user && examFileId) {
          const { data: ef } = await supabase.from('exam_old_files').select('file_name,content').eq('id', examFileId).eq('user_id', user.id).single()
          if (ef?.content) block += `\nVALD TENTA "${ef.file_name}":\n${ef.content}`
        }
        return block
      })(),
    ])

    const system = buildSystemPrompt(context, settingsResult.data, contentResult, insightsResult.data || [], friendsResult.data || [])

    // Tiered history: recent 6 messages at 2000 chars, older 8 at 600 chars
    const allMsgs = (messages || []).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
    const recent = allMsgs.slice(-6)
    const older = allMsgs.slice(-14, -6)
    const formattedMessages = [
      ...older.map((m: any) => ({ role: m.role, content: String(m.content || '').slice(0, 600) })),
      ...recent.map((m: any) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) })),
    ]

    let currentMessages = [...formattedMessages]
    let finalText = ''
    let savedMemory = false
    const calledTools = new Set<string>()

    // Prompt caching: the static TOOLS array and the per-request system prompt are
    // identical across all iterations of the agentic loop below. Marking a cache
    // breakpoint on the last tool definition caches the whole tools block, and
    // wrapping the system prompt in a cache-marked text block caches it too.
    // Render order is tools -> system -> messages, so iterations 2-8 (and repeat
    // requests within the 5-min TTL) read this prefix from cache (~0.1x cost)
    // instead of re-billing the full system+tools tokens every time.
    const cachedTools = TOOLS.map((t: any, i: number) =>
      i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
    )
    const cachedSystem = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]

    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6'
    const MEMORY_ACTIONS = ['save_insight', 'update_insight', 'delete_insight', 'save_preference', 'update_memory_context', 'update_friend']

    // ── STREAMING PATH (opt-in via body.stream) ──────────────────────────────
    // Additive: the non-stream JSON loop below is untouched, so any client that
    // doesn't request streaming (or any failure here) keeps the exact old behaviour.
    if (stream) {
      const encoder = new TextEncoder()
      const sseBody = new ReadableStream({
        async start(controller) {
          const send = (obj: any) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch (_) { /* closed */ } }
          const streamMessages: any[] = [...formattedMessages]
          let savedMemory = false
          const called = new Set<string>()
          try {
            for (let it = 0; it < 8; it++) {
              const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-api-key': ANTHROPIC_KEY,
                  'anthropic-version': '2023-06-01',
                  'anthropic-beta': 'pdfs-2024-09-25',
                },
                body: JSON.stringify({ model: MODEL, max_tokens: 2500, system: cachedSystem, tools: cachedTools, messages: streamMessages, stream: true }),
              })
              if (!resp.ok || !resp.body) {
                const errJson = await resp.json().catch(() => ({}))
                send({ type: 'error', error: errJson?.error?.message || `Anthropic API error (${resp.status})` })
                break
              }
              const reader = resp.body.getReader()
              const decoder = new TextDecoder()
              let buf = ''
              const blocks: any[] = []
              let cur: any = null
              let stopReason: string | null = null
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += decoder.decode(value, { stream: true })
                let nl: number
                while ((nl = buf.indexOf('\n')) >= 0) {
                  const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
                  if (!line.startsWith('data:')) continue
                  const payload = line.slice(5).trim()
                  if (!payload) continue
                  let ev: any
                  try { ev = JSON.parse(payload) } catch { continue }
                  if (ev.type === 'content_block_start') {
                    cur = ev.content_block?.type === 'tool_use'
                      ? { type: 'tool_use', id: ev.content_block.id, name: ev.content_block.name, input: '' }
                      : { type: 'text', text: '' }
                  } else if (ev.type === 'content_block_delta') {
                    if (ev.delta?.type === 'text_delta' && cur?.type === 'text') { cur.text += ev.delta.text; send({ type: 'text', text: ev.delta.text }) }
                    else if (ev.delta?.type === 'input_json_delta' && cur?.type === 'tool_use') { cur.input += ev.delta.partial_json || '' }
                  } else if (ev.type === 'content_block_stop') {
                    if (cur?.type === 'tool_use') { let inp: any = {}; try { inp = cur.input ? JSON.parse(cur.input) : {} } catch { /* keep {} */ } blocks.push({ type: 'tool_use', id: cur.id, name: cur.name, input: inp }) }
                    else if (cur?.type === 'text') { blocks.push({ type: 'text', text: cur.text }) }
                    cur = null
                  } else if (ev.type === 'message_delta') {
                    if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason
                  }
                }
              }
              if (stopReason === 'tool_use') {
                streamMessages.push({ role: 'assistant', content: blocks })
                const toolBlocks = blocks.filter((b) => b.type === 'tool_use')
                const toolResults = await Promise.all(toolBlocks.map(async (block: any) => {
                  const isFetch = block.name !== 'execute_action'
                  const key = isFetch ? `${block.name}:${JSON.stringify(block.input || {})}` : null
                  if (key && called.has(key)) return { type: 'tool_result', tool_use_id: block.id, content: '(redan hämtat denna session, se tidigare svar)' }
                  if (key) called.add(key)
                  const result = user ? await executeTool(block.name, block.input || {}, supabase, user.id) : 'Ingen användare inloggad.'
                  if (block.name === 'execute_action' && MEMORY_ACTIONS.includes(block.input?.action)) savedMemory = true
                  return { type: 'tool_result', tool_use_id: block.id, content: result }
                }))
                streamMessages.push({ role: 'user', content: toolResults })
                send({ type: 'tool', names: toolBlocks.map((b: any) => b.name) })
                continue
              }
              break
            }
            send({ type: 'done', savedMemory })
          } catch (err) {
            send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
          } finally {
            try { controller.close() } catch (_) { /* already closed */ }
          }
        },
      })
      return new Response(sseBody, { headers: { ...cors, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } })
    }

    for (let iterations = 0; iterations < 8; iterations++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25',
        },
        body: JSON.stringify({
          model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
          max_tokens: 2500,
          system: cachedSystem,
          tools: cachedTools,
          messages: currentMessages,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || 'Anthropic API error', detail: data }), {
          status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
        })
      }

      if (data.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: data.content })
        const toolBlocks = (data.content || []).filter((b: any) => b.type === 'tool_use')
        const toolResults = await Promise.all(toolBlocks.map(async (block: any) => {
          // Deduplicate fetch tools: same tool+same inputs shouldn't run twice per session
          const isFetch = block.name !== 'execute_action'
          const dedupeKey = isFetch ? `${block.name}:${JSON.stringify(block.input || {})}` : null
          if (dedupeKey && calledTools.has(dedupeKey)) {
            return { type: 'tool_result', tool_use_id: block.id, content: '(redan hämtat denna session, se tidigare svar)' }
          }
          if (dedupeKey) calledTools.add(dedupeKey)
          const result = user ? await executeTool(block.name, block.input || {}, supabase, user.id) : 'Ingen användare inloggad.'
          if (block.name === 'execute_action' && ['save_insight','update_insight','delete_insight','save_preference','update_memory_context','update_friend'].includes(block.input?.action)) savedMemory = true
          return { type: 'tool_result', tool_use_id: block.id, content: result }
        }))
        currentMessages.push({ role: 'user', content: toolResults })
        continue
      }

      const textBlock = data.content?.find((b: any) => b.type === 'text')
      finalText = textBlock?.text || ''
      break
    }

    // Strip any accidental jarvis_actions tags (legacy safety net)
    const cleaned = finalText
      .replace(/<jarvis_actions>[\s\S]*?<\/jarvis_actions>/gi, '')
      .trim()

    return new Response(JSON.stringify({ content: cleaned || 'Inget svar.', actions: [], savedMemory }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
