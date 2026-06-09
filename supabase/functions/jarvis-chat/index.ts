import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    description: `Hämtar träningspass och övningsdata från databasen.
ANVÄND NÄR: frågor om specifika pass, PR, styrketrend, löpstatistik, träningshistorik, volym, progression, Strava-data.
ANVÄND INTE NÄR: användaren bara nämner träning i förbifarten eller du redan har tillräcklig data i kontexten.
Tips: för PRs, hämta gärna 90+ dagar. För senaste passet: limit 1.`,
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['löpning', 'gym', 'cykling', 'simning', 'promenad', 'övrigt', 'all'], description: 'Typ av pass. Utelämna för alla.' },
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal pass (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_health',
    description: `Hämtar hälsologgar: vikt, sömn, steg, energi, humör, stress, alkohol, nikotin, koffein, puls.
ANVÄND NÄR: frågor om vikt/kropp, sömnmönster, energinivåer, välmående-trend, hälsostatistik.
ANVÄND INTE NÄR: du redan har hälsodata för perioden i kontexten.
Tips: för trender, hämta 30-90 dagar. För idag: date_from=idag.`,
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal dagar (default 30)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_journal',
    description: `Hämtar journalanteckningar med fullständigt innehåll, AI-sammanfattning och extraherade mönster.
ANVÄND NÄR: reflektion, mående, känslor, relationer, mönster, kvällssummering, morning brief, "hur mår jag", historiska jämförelser, senaste journalen.
ANVÄND INTE NÄR: frågan är rent praktisk (schema, ekonomi, träning) utan emotionellt innehåll.
Tips: för djup analys date_from 2020-01-01. För senaste: limit 1. För vecka: limit 7.`,
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD. Använd 2020-01-01 för hela historiken.' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal entries (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_economy',
    description: `Hämtar ekonomidata: inkomster, utgifter per kategori, fasta kostnader, PA-betalningar, CSN.
ANVÄND NÄR: budget, sparande, pengar, utgifter, inkomst, CSN-koll, specifika kategorier, ekonomisk trend.
ANVÄND INTE NÄR: du redan har ekonomiöversikten i kontexten och frågan är generell.
Tips: för kategoriserad analys, hämta 30-90 dagar och type=both.`,
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        type: { type: 'string', enum: ['income', 'expense', 'both'], description: 'Typ av data (default: both)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_study',
    description: `Hämtar pluggdata: kurser, tentor, studiesessioner, lärandemål med mastery, kursمaterial.
ANVÄND NÄR: plugg, tentor, kurser, KI, studieplan, lärandemål, tentaförberedelse, studietimmar.
ANVÄND INTE NÄR: kommande tentor redan syns i kontexten och frågan inte kräver djupare detaljer.`,
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD' },
        date_to: { type: 'string', description: 'YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal sessioner' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_calendar',
    description: `Hämtar kalender och schema: Google Calendar-events, obligatoriska KI-moment, PA-pass med tider.
ANVÄND NÄR: "vad händer", schema, denna vecka, nästa vecka, specifika datum, obligatoriska moment, PA-pass.
ANVÄND INTE NÄR: frågan inte handlar om tid/schema.`,
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'YYYY-MM-DD (default: idag)' },
        date_to: { type: 'string', description: 'YYYY-MM-DD (default: +14 dagar)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_experiences',
    description: `Hämtar resor (trips), äventyr, side quests och sociala interaktioner. Inkluderar planning_doc och budget.
ANVÄND NÄR: resor, äventyr, upplevelser, side quests, socialt liv, reseplaner, trip-IDs för uppdatering.
Tips: för att hitta trip-ID inför update_trip, fetcha type=trips.`,
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['trips', 'adventures', 'quests', 'social', 'all'], description: 'Kategori' },
        limit: { type: 'number', description: 'Max antal' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_scores',
    description: `Hämtar daily_scores och tier_snapshots (Kondition, Styrka, Plugg, Ekonomi, Sömn, Välmående).
ANVÄND NÄR: "hur går det", trender, tier-nivåer, progress över tid, scores, peak mode, jämförelser.
ANVÄND INTE NÄR: dagens score redan finns i kontexten och frågan inte kräver historik.`,
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
    description: `Hämtar Erik-uppdrag (erik_tasks) OCH projekt-tasks (project_tasks).
ANVÄND NÄR: jobb, uppdrag, projekt, tasks, deadlines, att-göra-lista, projektboard, Jarvis ska skapa task och behöver project_id.
Tips: ange project_id för specifikt projekt. include_projects=true för alla projekt-tasks.`,
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ej_påbörjat', 'pågående', 'klart', 'all'], description: 'Statusfilter' },
        limit: { type: 'number', description: 'Max antal' },
        project_id: { type: 'string', description: 'UUID: hämta tasks för specifikt projekt' },
        include_projects: { type: 'boolean', description: 'true = hämta alla projekt-tasks' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_memory_goals',
    description: `Hämtar Jarvis långtidsminnen, profil, mål, preferenser och vänner/relationer.
ANVÄND NÄR: "vad vet du om mig", mål, drömmar, relationer, vänner, minne, preferenser, personlighet.
Tips: include_friends=true för sociala frågor om specifika personer.`,
    input_schema: {
      type: 'object',
      properties: {
        include_friends: { type: 'boolean', description: 'Inkludera vänner och relationer' },
        limit: { type: 'number', description: 'Max antal minnen (default 100)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_nutrition',
    description: `Hämtar nutrition och måltidsloggar: kalorier, protein, vatten, måltider med AI-analys.
ANVÄND NÄR: mat, kalorier, protein, vatten, kostmönster, måltider, nutrition.`,
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
    description: `Utför en databasoperation: skapa, uppdatera eller radera data i SiggeOS.
ANVÄND NÄR: användaren ber dig logga, skapa, ändra, ta bort, uppdatera något.
Kör DIREKT utan att fråga om bekräftelse — presentera sedan vad du gjort.
För update_trip/update_project_task: hämta ID med fetch_experiences/fetch_tasks först om du inte har det.`,
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
            'create_adventure', 'save_insight',
          ],
          description: 'Operation att utföra',
        },
        data: {
          type: 'object',
          description: `Data för operationen:
- create_project_task: {project_id, title, description?, priority?, deadline?, status?}
- update_project_task: {id, fields: {status?, title?, priority?, deadline?}}
- delete_project_task: {id}
- create_trip: {title, countries[], status?, start_date?, end_date?, planning_doc?, budget_sek?}
- update_trip: {id, fields: {planning_doc?, status?, budget_sek?, start_date?, end_date?, countries?}}
- create_erik_task: {title, description?, deadline?, tag?, priority?}
- update_erik_task: {id, fields: {...}}
- log_training: {date?, session_type, duration_minutes?, distance_km?, feeling?, notes?}
- log_health: {date?, weight_kg?, sleep_hours?, energy?, steps?, mood?, stress_level?, alcohol_units?}
- log_expense: {date?, amount, category, description?}
- log_income: {date?, amount, source, notes?}
- create_adventure: {title, description?, date?, location?, category?, rating?}
- save_insight: {insight, category?, confidence?}`,
        },
        confirm_message: {
          type: 'string',
          description: 'Kort beskrivning av vad som görs',
        },
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

      return `Träning (${sessions.length} pass):\n\n${rows}`
    }

    if (toolName === 'fetch_health') {
      const { data, error } = await supabase.from('health_logs')
        .select('id,date,weight_kg,body_fat_pct,steps,sleep_hours,sleep_quality,sleep_type,sleep_note,resting_hr,screen_time_minutes,alcohol_units,nicotine,caffeine_mg,energy,energy_level,stress_level,mood,source')
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
        if (r.sleep_note) parts.push(`"${r.sleep_note.slice(0,80)}"`)
        parts.push(`[id:${r.id}]`)
        return parts.join(' | ')
      }).join('\n')
      return `Hälsa (${data.length} dagar):\n${rows}`
    }

    if (toolName === 'fetch_journal') {
      const { data, error } = await supabase.from('journal_entries')
        .select('id,date,content,mood,sleep_hours,energy,social_score,is_travel_entry,ai_extracted_people,ai_extracted_activities,ai_extracted_keywords,ai_summary,sleep_type,sleep_note')
        .eq('user_id', userId)
        .gte('date', input.date_from || ninetyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(asLimit(input.limit, 10, 200))
      if (error) throw error
      if (!data?.length) return 'Inga journalanteckningar hittades.'
      const rows = data.map((r: any) => {
        const meta = [`📅 ${r.date}`]
        if (r.mood) meta.push(`humör ${r.mood}/10`)
        if (r.energy) meta.push(`energi ${r.energy}/10`)
        if (r.sleep_hours) meta.push(`sömn ${r.sleep_hours}h`)
        if (r.social_score) meta.push(`socialt ${r.social_score}/10`)
        if (r.is_travel_entry) meta.push('reseentry')
        meta.push(`[id:${r.id}]`)
        const summary = r.ai_summary ? `Sammanfattning: ${r.ai_summary}\n` : ''
        const people = r.ai_extracted_people?.length ? `Personer: ${r.ai_extracted_people.join(', ')}\n` : ''
        const content = r.content ? `Entry:\n"${r.content.slice(0, 1000)}${r.content.length > 1000 ? '…' : ''}"` : ''
        return [meta.join(' | '), summary + people + content].filter(Boolean).join('\n')
      }).join('\n\n')
      return `Journal (${data.length} entries):\n\n${rows}`
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
      if (fixed?.length) results.push(`FASTA KOSTNADER:\n${fixed.map((f: any) => `${f.name} | ${f.amount} kr | ${f.category} [id:${f.id}]`).join('\n')}`)

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
        supabase.from('jarvis_insights').select('id,insight,category,confidence,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(limit),
        input.include_friends ? supabase.from('friends').select('id,name,nickname,relationship,location,notes,last_contact_date').eq('user_id', userId).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      ])
      const s = settingsRes.data || {}
      const goals = s.goals ? JSON.stringify(s.goals, null, 2) : '{}'
      const insights = (insightsRes.data || []).map((i: any) => `[${i.category} ${i.confidence}%] ${i.insight} [id:${i.id}]`).join('\n')
      const friends = (friendsRes.data || []).map((f: any) => `${f.name}${f.nickname ? '/'+f.nickname : ''} | ${f.relationship || ''}${f.location ? ' | '+f.location : ''}${f.last_contact_date ? ' | senast:'+f.last_contact_date : ''}${f.notes ? ' | '+f.notes.slice(0,120) : ''} [id:${f.id}]`).join('\n')
      return `PROFIL:\n${s.about_me || '—'}\n\nMÅL:\n${goals}\n\nMINNEN (${insightsRes.data?.length || 0}):\n${insights || '—'}\n\nVÄNNER:\n${friends || '—'}`
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
          const { error } = await supabase.from('jarvis_insights').insert({ user_id: userId, insight: d.insight, category: d.category || 'mönster', confidence: d.confidence || 80 })
          if (error) throw error
          result = 'Insikt sparad.'
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
function buildSystemPrompt(context: string, settings: any, contentBlock: string): string {
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

  return `Du är Jarvis – Sigges personliga AI-coach och assistent inbyggd i SiggeOS.

IDENTITET:
Du är coach, analytiker, minne och assistent i ett. Var datadriven, konkret och direkt. Aldrig generisk. Välj läge utifrån frågan — coach, analytiker, praktisk assistent eller samtalsperson.
Kommunikationsstil: ${style}${s.jarvis_lang && s.jarvis_lang !== 'auto' ? `\nSpråk: ${s.jarvis_lang}` : ''}

PROFIL & MÅL:
${profileLines || '(ej konfigurerat)'}

FRONTEND-KONTEXT (färsk snapshot, inte komplett):
${context || 'Ingen kontext.'}
${contentBlock ? '\n' + contentBlock : ''}

VERKTYG — BESLUTSSTRATEGI:
Du har tillgång till alla Sigges data via verktyg. Använd dem proaktivt och intelligent:

HÄMTA DATA när:
- Frågan kräver specifik data du inte har (historik, detaljer, IDs)
- Brief/kväll/vecka: hämta alltid journal + health + workouts + scores
- Frågan om mående/känslor: fetch_journal
- Frågor om specifika pass/PR: fetch_workouts
- Schema/vad händer: fetch_calendar
- Ekonomisk analys: fetch_economy
- Resor/upplevelser eller du behöver trip-ID: fetch_experiences
- Projekt-tasks eller du behöver project_id: fetch_tasks
- Mål/relationer/minnen: fetch_memory_goals

HÄMTA INTE när:
- Frontendkontexten redan har tillräcklig data för ett bra svar
- Frågan är praktisk och konversationell utan databehov
- Du just hämtat samma data i detta samtal

KOMBINERA verktyg smart: om frågan berör flera domäner, hämta parallellt i en iteration.

ÅTGÄRDER:
Använd execute_action direkt när användaren ber dig logga/skapa/ändra/ta bort.
- Kör utan att fråga om bekräftelse — berätta sedan vad du gjort.
- För create_project_task: hämta project_id via fetch_tasks om det saknas i kontexten.
- För update_trip: hämta trip-ID via fetch_experiences om det saknas.
- delete-actions: bekräfta alltid vad som raderas i textsvar.

Svara på samma språk som användaren. Kort om inget annat behövs.`
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { messages = [], context = '', examFileId, materialIds } = await req.json()
    const authHeader = req.headers.get('Authorization') || ''

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, serviceKey)
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anonClient.auth.getUser()

    // Fetch settings and optional content in parallel
    const [settingsResult, contentResult] = await Promise.all([
      user ? supabase.from('user_settings').select('about_me,goals,jarvis_style,jarvis_lang,jarvis_personality').eq('user_id', user.id).single() : Promise.resolve({ data: null }),
      (async () => {
        let block = ''
        if (materialIds?.length) {
          const { data: mats } = await supabase.from('course_materials').select('file_name,content').in('id', materialIds)
          if (mats?.length) block += '\nKURSMATERIAL:\n' + mats.map((m: any) => `--- ${m.file_name} ---\n${m.content || ''}`).join('\n\n')
        }
        if (examFileId) {
          const { data: ef } = await supabase.from('exam_old_files').select('file_name,content').eq('id', examFileId).single()
          if (ef?.content) block += `\nVALD TENTA "${ef.file_name}":\n${ef.content}`
        }
        return block
      })(),
    ])

    const system = buildSystemPrompt(context, settingsResult.data, contentResult)

    const formattedMessages = (messages || [])
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
      .slice(-16)
      .map((m: any) => ({ role: m.role, content: String(m.content || '').slice(0, 1500) }))

    let currentMessages = [...formattedMessages]
    let finalText = ''

    for (let iterations = 0; iterations < 5; iterations++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25',
        },
        body: JSON.stringify({
          model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5',
          max_tokens: 1500,
          system,
          tools: TOOLS,
          messages: currentMessages,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || 'Anthropic API error', detail: data }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (data.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: data.content })
        const toolResults = []
        for (const block of data.content || []) {
          if (block.type === 'tool_use') {
            const result = user ? await executeTool(block.name, block.input || {}, supabase, user.id) : 'Ingen användare inloggad.'
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
          }
        }
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

    return new Response(JSON.stringify({ content: cleaned || 'Inget svar.', actions: [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
