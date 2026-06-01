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

const TOOLS = [
  {
    name: 'fetch_workouts',
    description: 'Hämtar träningspass. Använd vid frågor om löpning, gym, kondition, styrka, träningsprogress, PR eller statistik.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['löpning', 'gym', 'cykling', 'simning', 'promenad', 'övrigt', 'all'], description: 'session_type. all = alla typer.' },
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal resultat' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_health',
    description: 'Hämtar hälsodata: vikt, kroppsfett, sömn, steg, puls, skärmtid, alkohol, nikotin, koffein, energi, stress, humör.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal dagar' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_journal',
    description: 'Hämtar journalanteckningar. Använd proaktivt vid reflektion, mående, känslor, mönster, kvällssummering, historiska jämförelser och frågor om senaste journalen.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD. Använd 2020-01-01 för hela historiken.' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal entries' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_economy',
    description: 'Hämtar ekonomidata: inkomster, utgifter, fasta kostnader, PA-betalningar. Använd vid budget, pengar, sparande, CSN, utgifter, inkomst.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        type: { type: 'string', enum: ['income', 'expense', 'both'], description: 'Typ av data' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_study',
    description: 'Hämtar pluggdata: kurser, tentor, studietimmar, lärandemål, material. Använd vid plugg, tentor, KI, kurser, prestation.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal rader' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_calendar',
    description: 'Hämtar kalender/schema: schedule_events, mandatory_sessions och PA-pass. Använd när han frågar vad som händer, kalender, deadlines, schema.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_experiences',
    description: 'Hämtar resor, äventyr, upplevelser, side quests och sociala händelser.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['trips', 'adventures', 'quests', 'social', 'all'], description: 'Vilken kategori som ska hämtas' },
        limit: { type: 'number', description: 'Max antal' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_scores',
    description: 'Hämtar daily_scores och tier_snapshots. Använd vid progress, dagsform, trender, score, metrics.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_tasks',
    description: 'Hämtar Erik-uppdrag/tasks. Använd vid jobb, Erik, uppdrag, deadlines, att göra.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ej_påbörjat', 'pågående', 'klart', 'all'], description: 'Statusfilter' },
        limit: { type: 'number', description: 'Max antal' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_memory_goals',
    description: 'Hämtar Jarvis-minnen, profil, mål, preferenser och vänner/social kontext. Använd vid "vad vet du om mig", mål, minne, relationer, preferenser.',
    input_schema: {
      type: 'object',
      properties: {
        include_friends: { type: 'boolean', description: 'Om vänner ska inkluderas' },
        limit: { type: 'number', description: 'Max antal minnen' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_nutrition',
    description: 'Hämtar nutrition och måltidsloggar. Använd vid mat, kalorier, protein, vatten, kostmönster.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
      },
      required: [],
    },
  },
]

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
        .limit(asLimit(input.limit, 50, 200))
      if (input.type && input.type !== 'all') q = q.eq('session_type', input.type)
      if (input.date_from) q = q.gte('date', input.date_from)
      if (input.date_to) q = q.lte('date', input.date_to)
      const { data, error } = await q
      if (error) throw error
      if (!data?.length) return 'Inga träningspass hittades.'
      const rows = data.map((s: any) => {
        const parts = [s.date, s.session_type || 'pass']
        if (s.distance_km) parts.push(`${s.distance_km} km`)
        if (s.duration_minutes) parts.push(`${s.duration_minutes} min`)
        if (s.time_seconds) parts.push(`tid ${Math.floor(s.time_seconds / 60)}:${String(s.time_seconds % 60).padStart(2, '0')}`)
        if (s.pace_per_km) parts.push(`pace ${Math.floor(s.pace_per_km / 60)}:${String(s.pace_per_km % 60).padStart(2, '0')}/km`)
        if (s.feeling) parts.push(`känsla ${s.feeling}/10`)
        if (s.notes) parts.push(`notering: ${s.notes.slice(0, 160)}`)
        parts.push(`[id:${s.id}]`)
        return parts.join(' | ')
      }).join('\n')
      return `Träning (${data.length} pass):\n${rows}`
    }

    if (toolName === 'fetch_health') {
      const { data, error } = await supabase.from('health_logs')
        .select('id,date,weight_kg,body_fat_pct,steps,sleep_hours,sleep_quality,sleep_type,sleep_note,resting_hr,screen_time_minutes,alcohol_units,nicotine,caffeine_mg,retatrutide_dose_mg,energy,energy_level,stress_level,mood,sleep_time,source,created_at,updated_at')
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(asLimit(input.limit, 60, 200))
      if (error) throw error
      if (!data?.length) return 'Ingen hälsodata hittades.'
      const rows = data.map((r: any) => {
        const energy = r.energy_level ?? r.energy
        const parts = [r.date]
        if (r.weight_kg) parts.push(`vikt ${r.weight_kg} kg`)
        if (r.body_fat_pct) parts.push(`fett ${r.body_fat_pct}%`)
        if (r.sleep_hours) parts.push(`sömn ${r.sleep_hours}h`)
        if (r.sleep_quality) parts.push(`sömnkvalitet ${r.sleep_quality}/10`)
        if (r.sleep_type) parts.push(`sömntyp ${r.sleep_type}`)
        if (r.steps) parts.push(`steg ${r.steps}`)
        if (r.resting_hr) parts.push(`vilopuls ${r.resting_hr}`)
        if (energy) parts.push(`energi ${energy}/10`)
        if (r.stress_level) parts.push(`stress ${r.stress_level}/10`)
        if (r.mood) parts.push(`humör ${r.mood}/10`)
        if (r.alcohol_units) parts.push(`alkohol ${r.alcohol_units}`)
        if (r.nicotine) parts.push('nikotin ja')
        if (r.caffeine_mg) parts.push(`koffein ${r.caffeine_mg}mg`)
        if (r.sleep_note) parts.push(`notering: ${r.sleep_note.slice(0, 120)}`)
        parts.push(`[id:${r.id}]`)
        return parts.join(' | ')
      }).join('\n')
      return `Hälsa (${data.length} dagar):\n${rows}`
    }

    if (toolName === 'fetch_journal') {
      const { data, error } = await supabase.from('journal_entries')
        .select('id,date,content,mood,sleep_hours,energy,social_score,is_travel_entry,ai_extracted_people,ai_extracted_activities,ai_extracted_keywords,ai_summary,sleep_type,sleep_note,created_at,updated_at')
        .eq('user_id', userId)
        .gte('date', input.date_from || ninetyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(asLimit(input.limit, 50, 200))
      if (error) throw error
      if (!data?.length) return 'Inga journalanteckningar hittades.'
      const rows = data.map((r: any) => {
        const meta = [
          `📅 ${r.date}`,
          r.mood ? `humör ${r.mood}/10` : '',
          r.energy ? `energi ${r.energy}/10` : '',
          r.sleep_hours ? `sömn ${r.sleep_hours}h` : '',
          r.social_score ? `socialt ${r.social_score}/10` : '',
          r.sleep_type ? `sömntyp ${r.sleep_type}` : '',
          r.is_travel_entry ? 'reseentry' : '',
          `[id:${r.id}]`,
        ].filter(Boolean).join(' | ')
        const summary = r.ai_summary ? `AI-sammanfattning: ${r.ai_summary}\n` : ''
        const extracted = [
          r.ai_extracted_people?.length ? `Personer: ${r.ai_extracted_people.join(', ')}` : '',
          r.ai_extracted_activities?.length ? `Aktiviteter: ${r.ai_extracted_activities.join(', ')}` : '',
          r.ai_extracted_keywords?.length ? `Nyckelord: ${r.ai_extracted_keywords.join(', ')}` : '',
        ].filter(Boolean).join('\n')
        const content = r.content ? `Citat/entry:\n"${r.content.slice(0, 1200)}${r.content.length > 1200 ? '…' : ''}"` : ''
        return [meta, summary + extracted, content].filter(Boolean).join('\n')
      }).join('\n\n')
      return `Journal (${data.length} entries, ${input.date_from || ninetyDaysAgo} → ${input.date_to || today}):\n${rows}`
    }

    if (toolName === 'fetch_economy') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const type = input.type || 'both'
      const results: string[] = []
      if (type === 'income' || type === 'both') {
        const { data, error } = await supabase.from('income_logs')
          .select('id,date,amount,source,counts_toward_csn,notes,created_at')
          .eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false })
        if (error) throw error
        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
          results.push(`INKOMSTER (${data.length}, totalt ${Math.round(total)} kr):\n` + data.map((r: any) => `${r.date} | ${r.amount} kr | ${r.source || 'okänd'}${r.notes ? ' | ' + r.notes : ''} [id:${r.id}]`).join('\n'))
        }
      }
      if (type === 'expense' || type === 'both') {
        const { data, error } = await supabase.from('expense_logs')
          .select('id,date,amount,category,description,created_at')
          .eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false })
        if (error) throw error
        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
          const byCat: Record<string, number> = {}
          data.forEach((r: any) => { byCat[r.category || 'Övrigt'] = (byCat[r.category || 'Övrigt'] || 0) + Number(r.amount || 0) })
          const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${Math.round(v)} kr`).join(', ')
          results.push(`UTGIFTER (${data.length}, totalt ${Math.round(total)} kr)\nPer kategori: ${cats}\n` + data.map((r: any) => `${r.date} | ${r.amount} kr | ${r.category || 'Övrigt'} | ${r.description || ''} [id:${r.id}]`).join('\n'))
        }
      }
      const { data: fixed } = await supabase.from('fixed_costs')
        .select('id,name,amount,category,active,created_at')
        .eq('user_id', userId).eq('active', true).order('amount', { ascending: false })
      if (fixed?.length) results.push(`FASTA KOSTNADER AKTIVA:\n${fixed.map((f: any) => `${f.name} | ${f.amount} kr | ${f.category || 'Övrigt'} [id:${f.id}]`).join('\n')}`)
      return results.length ? results.join('\n\n') : 'Ingen ekonomidata hittades.'
    }

    if (toolName === 'fetch_study') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const [sessionsRes, coursesRes, examsRes, goalsRes, materialsRes] = await Promise.all([
        supabase.from('study_sessions').select('id,date,course_id,subject,hours,notes,created_at').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(asLimit(input.limit, 80, 200)),
        supabase.from('courses').select('id,name,term,exam_date,active,grade,goal_hours,ai_time_estimate,ai_time_hours,created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('course_exams').select('id,course_id,name,exam_date,grade,notes,points_earned,points_max,created_at').eq('user_id', userId).order('exam_date', { ascending: true }).limit(40),
        supabase.from('learning_goals').select('id,course_id,exam_id,description,completed,mastery,last_studied,study_count,source,source_file,created_at').eq('user_id', userId).order('mastery', { ascending: true }).limit(60),
        supabase.from('course_materials').select('id,course_id,exam_id,file_name,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
      ])
      for (const res of [sessionsRes, coursesRes, examsRes, goalsRes, materialsRes]) if (res.error) throw res.error
      const courses = (coursesRes.data || []).reduce((acc: any, c: any) => { acc[c.id] = c; return acc }, {})
      const sessions = sessionsRes.data || []
      const totalHours = sessions.reduce((s: number, r: any) => s + Number(r.hours || 0), 0)
      const sessionRows = sessions.map((r: any) => `${r.date} | ${r.hours || 0}h | ${courses[r.course_id]?.name || r.subject || 'okänd kurs'}${r.notes ? ' | ' + r.notes : ''} [id:${r.id}]`).join('\n')
      const activeCourses = (coursesRes.data || []).filter((c: any) => c.active).map((c: any) => `${c.name}${c.exam_date ? ' tenta ' + c.exam_date : ''}`).join(', ')
      const exams = (examsRes.data || []).map((e: any) => `${e.exam_date || '?'} | ${e.name} | ${courses[e.course_id]?.name || 'okänd kurs'}${e.points_max ? ` | ${e.points_earned || 0}/${e.points_max}p` : ''} [id:${e.id}]`).join('\n')
      const weakGoals = (goalsRes.data || []).slice(0, 20).map((g: any) => `${g.mastery || 0}% | ${g.completed ? 'klar' : 'ej klar'} | ${g.description.slice(0, 160)} [id:${g.id}]`).join('\n')
      const materials = (materialsRes.data || []).map((m: any) => `${m.file_name} [id:${m.id}]`).join('\n')
      return `Plugg ${from} → ${to}\nStudietid: ${totalHours.toFixed(1)}h över ${sessions.length} sessioner\nAktiva kurser: ${activeCourses || 'inga'}\n\nSESSIONER:\n${sessionRows || '—'}\n\nTENTOR:\n${exams || '—'}\n\nLÄRANDEMÅL/SVAGAST FÖRST:\n${weakGoals || '—'}\n\nMATERIAL:\n${materials || '—'}`
    }

    if (toolName === 'fetch_calendar') {
      const from = input.date_from || today
      const to = input.date_to || daysAgoISO(-30)
      const [eventsRes, mandatoryRes, shiftsRes] = await Promise.all([
        supabase.from('schedule_events').select('id,title,event_type,course_id,starts_at,ends_at,location,recurring,recurrence_rule,created_at').eq('user_id', userId).gte('starts_at', from).lte('starts_at', to).order('starts_at', { ascending: true }).limit(80),
        supabase.from('mandatory_sessions').select('id,title,date,start_time,end_time,attended,course_hint,google_event_id,created_at').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: true }).limit(80),
        supabase.from('pa_shifts').select('id,date,client_name,start_time,end_time,hours_worked,hourly_rate,total_pay,estimated_pay,is_night_shift,shift_type,notes,google_event_id').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: true }).limit(80),
      ])
      for (const res of [eventsRes, mandatoryRes, shiftsRes]) if (res.error) throw res.error
      const events = (eventsRes.data || []).map((e: any) => `${e.starts_at || '?'} | ${e.title} | ${e.event_type || ''}${e.location ? ' | ' + e.location : ''} [id:${e.id}]`).join('\n')
      const mandatory = (mandatoryRes.data || []).map((m: any) => `${m.date} | ${m.title} | ${m.attended ? 'närvarat' : 'ej markerad'}${m.course_hint ? ' | ' + m.course_hint : ''} [id:${m.id}]`).join('\n')
      const shifts = (shiftsRes.data || []).map((s: any) => `${s.date} | ${s.shift_type || ''} | ${s.hours_worked || '?'}h | ~${s.estimated_pay || s.total_pay || '?'}kr${s.client_name ? ' | ' + s.client_name : ''} [id:${s.id}]`).join('\n')
      return `Kalender/schema ${from} → ${to}\nEVENTS:\n${events || '—'}\n\nOBLIGATORISKT:\n${mandatory || '—'}\n\nPA-PASS:\n${shifts || '—'}`
    }

    if (toolName === 'fetch_experiences') {
      const type = input.type || 'all'
      const limit = asLimit(input.limit, 30, 100)
      const results: string[] = []
      if (type === 'trips' || type === 'all') {
        const { data, error } = await supabase.from('trips').select('id,title,country,city,countries,start_date,end_date,highlights,rating,status,budget_sek,notes,created_at').eq('user_id', userId).order('start_date', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`RESOR:\n${data.map((r: any) => `${r.title} | ${r.status || ''} | ${r.countries?.join(', ') || r.country || ''}${r.city ? ', ' + r.city : ''} | ${r.start_date || '?'}–${r.end_date || '?'}${r.rating ? ' | ' + r.rating + '/5' : ''}${r.highlights ? ' | ' + r.highlights.slice(0, 120) : ''} [id:${r.id}]`).join('\n')}`)
      }
      if (type === 'adventures' || type === 'all') {
        const { data, error } = await supabase.from('adventures').select('id,title,description,date,location,category,rating,created_at').eq('user_id', userId).order('date', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`ÄVENTYR/UPPLEVELSER:\n${data.map((r: any) => `${r.date || '?'} | ${r.title} | ${r.category || ''}${r.location ? ' | ' + r.location : ''}${r.rating ? ' | ' + r.rating + '/5' : ''}${r.description ? ' | ' + r.description.slice(0, 120) : ''} [id:${r.id}]`).join('\n')}`)
      }
      if (type === 'quests' || type === 'all') {
        const { data, error } = await supabase.from('side_quests').select('id,title,description,category,difficulty,status,suggested_by,completed_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`SIDE QUESTS:\n${data.map((r: any) => `${r.title} | ${r.status || ''} | ${r.category || ''}${r.difficulty ? ' | ' + r.difficulty : ''}${r.description ? ' | ' + r.description.slice(0, 120) : ''} [id:${r.id}]`).join('\n')}`)
      }
      if (type === 'social' || type === 'all') {
        const { data, error } = await supabase.from('social_interactions').select('id,date,friend_names,activity,duration_hours,quality,source,notes,created_at').eq('user_id', userId).order('date', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`SOCIALT:\n${data.map((r: any) => `${r.date} | ${r.friend_names?.join(', ') || ''} | ${r.activity || ''}${r.duration_hours ? ' | ' + r.duration_hours + 'h' : ''}${r.quality ? ' | kvalitet ' + r.quality + '/10' : ''}${r.notes ? ' | ' + r.notes.slice(0, 120) : ''} [id:${r.id}]`).join('\n')}`)
      }
      return results.length ? results.join('\n\n') : 'Inga upplevelser/resor/sociala händelser hittades.'
    }

    if (toolName === 'fetch_scores') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const [scoresRes, tiersRes] = await Promise.all([
        supabase.from('daily_scores').select('id,date,score_training,score_health,score_study,score_economy,score_social,score_journal,score_work,total_score,peak_mode,created_at,updated_at').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }),
        supabase.from('tier_snapshots').select('id,date,kondition,styrka,plugg,ekonomi,somn,valmående,created_at').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }),
      ])
      if (scoresRes.error) throw scoresRes.error
      if (tiersRes.error) throw tiersRes.error
      const scores = scoresRes.data || []
      const avg = (key: string) => {
        const vals = scores.map((r: any) => Number(r[key] || 0)).filter(Boolean)
        return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
      }
      const scoreRows = scores.map((r: any) => `${r.date} | total ${r.total_score || 0} | tr ${r.score_training || 0} hä ${r.score_health || 0} pl ${r.score_study || 0} ek ${r.score_economy || 0} soc ${r.score_social || 0} jobb ${r.score_work || 0}${r.peak_mode ? ' | PEAK' : ''}`).join('\n')
      const tierRows = (tiersRes.data || []).map((r: any) => `${r.date} | kondition ${r.kondition ?? '—'} styrka ${r.styrka ?? '—'} plugg ${r.plugg ?? '—'} ekonomi ${r.ekonomi ?? '—'} sömn ${r.somn ?? '—'} välmående ${r.valmående ?? '—'}`).join('\n')
      return `Scores ${from} → ${to}\nSnitt total:${avg('total_score')} träning:${avg('score_training')} hälsa:${avg('score_health')} plugg:${avg('score_study')} ekonomi:${avg('score_economy')}\n\nDAGSSCORES:\n${scoreRows || '—'}\n\nTIER SNAPSHOTS:\n${tierRows || '—'}`
    }

    if (toolName === 'fetch_tasks') {
      let q = supabase.from('erik_tasks').select('id,title,description,deadline,status,priority,tag,notes,created_at,updated_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(asLimit(input.limit, 50, 200))
      if (input.status && input.status !== 'all') q = q.eq('status', input.status)
      const { data, error } = await q
      if (error) throw error
      if (!data?.length) return 'Inga Erik-uppdrag hittades.'
      const rows = data.map((t: any) => `${t.status || 'okänd'} | ${t.title} | ${t.tag || 'Övrigt'}${t.priority ? ' | prio ' + t.priority : ''}${t.deadline ? ' | deadline ' + t.deadline : ''}${t.description ? ' | ' + t.description.slice(0, 100) : ''}${t.notes ? ' | notes: ' + t.notes.slice(0, 100) : ''} [id:${t.id}]`).join('\n')
      return `Erik-uppdrag (${data.length}):\n${rows}`
    }

    if (toolName === 'fetch_memory_goals') {
      const limit = asLimit(input.limit, 150, 300)
      const [settingsRes, insightsRes, friendsRes] = await Promise.all([
        supabase.from('user_settings').select('about_me,goals,jarvis_style,jarvis_lang,jarvis_personality,notif_journal,notif_training,onboarding_done,created_at,updated_at').eq('user_id', userId).single(),
        supabase.from('jarvis_insights').select('id,insight,category,confidence,created_at,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(limit),
        input.include_friends ? supabase.from('friends').select('id,name,nickname,relationship,location,notes,reminder_days,last_contact_date,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      ])
      if (settingsRes.error && settingsRes.error.code !== 'PGRST116') throw settingsRes.error
      if (insightsRes.error) throw insightsRes.error
      if (friendsRes.error) throw friendsRes.error
      const s = settingsRes.data || {}
      const goals = s.goals ? JSON.stringify(s.goals, null, 2) : '{}'
      const insights = (insightsRes.data || []).map((i: any) => `[${i.category || 'mönster'} ${i.confidence || 70}%] ${i.insight} [id:${i.id}]`).join('\n')
      const friends = (friendsRes.data || []).map((f: any) => `${f.name}${f.nickname ? ' / ' + f.nickname : ''} | ${f.relationship || ''}${f.location ? ' | ' + f.location : ''}${f.last_contact_date ? ' | senast ' + f.last_contact_date : ''}${f.notes ? ' | ' + f.notes.slice(0, 160) : ''} [id:${f.id}]`).join('\n')
      return `PROFIL/INSTÄLLNINGAR:\nOm mig: ${s.about_me || '—'}\nMål JSON:\n${goals}\nJarvis-personlighet: ${s.jarvis_personality || '—'}\nSpråk: ${s.jarvis_lang || '—'}\nStil: ${s.jarvis_style ?? '—'}\n\nJARVIS-MINNEN (${insightsRes.data?.length || 0}):\n${insights || '—'}\n\nVÄNNER/RELATIONER:\n${friends || '—'}`
    }

    if (toolName === 'fetch_nutrition') {
      const from = input.date_from || thirtyDaysAgo
      const to = input.date_to || today
      const [nutritionRes, mealsRes] = await Promise.all([
        supabase.from('nutrition_logs').select('id,date,total_calories,protein_g,water_liters,created_at,updated_at').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(80),
        supabase.from('meal_logs').select('id,date,meal_time,description,calories_estimate,protein_estimate_g,ai_analysis,source,created_at').eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false }).limit(120),
      ])
      if (nutritionRes.error) throw nutritionRes.error
      if (mealsRes.error) throw mealsRes.error
      const nutrition = (nutritionRes.data || []).map((n: any) => `${n.date} | ${n.total_calories || '?'} kcal | protein ${n.protein_g || '?'}g | vatten ${n.water_liters || '?'}L [id:${n.id}]`).join('\n')
      const meals = (mealsRes.data || []).map((m: any) => `${m.date} ${m.meal_time || ''} | ${m.description || ''}${m.calories_estimate ? ' | ~' + m.calories_estimate + ' kcal' : ''}${m.protein_estimate_g ? ' | protein ' + m.protein_estimate_g + 'g' : ''}${m.ai_analysis ? ' | AI: ' + m.ai_analysis.slice(0, 120) : ''} [id:${m.id}]`).join('\n')
      return `Nutrition ${from} → ${to}\nDAGAR:\n${nutrition || '—'}\n\nMÅLTIDER:\n${meals || '—'}`
    }

    return `Okänt verktyg: ${toolName}`
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return `Fel vid datahämtning (${toolName}): ${msg}`
  }
}

function extractActionsAndClean(text: string): { content: string, actions: any[] } {
  let actions: any[] = []
  let cleaned = text || ''

  const tagged = cleaned.match(/<jarvis_actions>([\s\S]*?)<\/jarvis_actions>/i)
  if (tagged) {
    try {
      const parsed = JSON.parse(tagged[1].trim())
      if (Array.isArray(parsed)) actions = parsed
      else if (parsed?.action) actions = [parsed]
    } catch (_) {}
    cleaned = cleaned.replace(/<jarvis_actions>[\s\S]*?<\/jarvis_actions>/gi, '').trim()
  }

  // Safety net: hide accidental bare action JSON from visible chat.
  const found: string[] = []
  let depth = 0
  let start = -1
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i
      depth++
    } else if (cleaned[i] === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.slice(start, i + 1)
        if (candidate.includes('"action"')) found.push(candidate)
        start = -1
      }
    }
  }
  for (const raw of found) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed?.action) actions.push(parsed)
      cleaned = cleaned.replace(raw, '').trim()
    } catch (_) {}
  }

  return { content: cleaned || 'Jag har tagit fram en åtgärd. Godkänn den nedan om den stämmer.', actions }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { messages = [], context = '', systemPrompt = '', examFileId, materialIds } = await req.json()
    const authHeader = req.headers.get('Authorization') || ''

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, serviceKey)
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await anonClient.auth.getUser()

    let contentBlock = ''
    if (materialIds?.length) {
      const { data: mats } = await supabase.from('course_materials').select('file_name,content').in('id', materialIds)
      if (mats?.length) contentBlock += '\nKURSMATERIAL:\n' + mats.map((m: any) => `--- ${m.file_name} ---\n${m.content || ''}`).join('\n\n')
    }
    if (examFileId) {
      const { data: ef } = await supabase.from('exam_old_files').select('file_name,content').eq('id', examFileId).single()
      if (ef?.content) contentBlock += `\nVALD TENTA "${ef.file_name}":\n${ef.content}`
    }

    let userSettingsBlock = ''
    if (user) {
      const { data: settings } = await supabase.from('user_settings')
        .select('about_me,goals,jarvis_style,jarvis_lang,jarvis_personality')
        .eq('user_id', user.id).single()
      if (settings) {
        const parts: string[] = []
        if (settings.about_me) parts.push(`OM MIG:\n${settings.about_me}`)
        if (settings.goals) parts.push(`MÅL JSON:\n${JSON.stringify(settings.goals, null, 2)}`)
        if (settings.jarvis_personality) parts.push(`PERSONLIGHET:\n${settings.jarvis_personality}`)
        if (settings.jarvis_style != null) {
          const s = settings.jarvis_style
          const desc = s < 30 ? 'diplomatisk' : s < 60 ? 'balanserad' : s < 85 ? 'direkt' : 'brutalt ärlig'
          parts.push(`KOMMUNIKATIONSSTIL: ${desc}`)
        }
        if (settings.jarvis_lang && settings.jarvis_lang !== 'auto') parts.push(`SVARA PÅ: ${settings.jarvis_lang}`)
        if (parts.length) userSettingsBlock = '\n\n' + parts.join('\n\n')
      }
    }

    const fallbackSystem = 'Du är Jarvis, Sigges personliga coach och AI-assistent. Var konkret, direkt och datadriven.'
    const base = (systemPrompt || fallbackSystem).replace('{CONTEXT}', context || 'Ingen frontend-kontext.')
    const system = `${base}${userSettingsBlock}${contentBlock ? '\n\n' + contentBlock : ''}

VERKTYG:
Du har server-side tools som kan läsa Sigges data. Använd dem proaktivt när frågan beror på data. Anta inte att frontend-kontexten är komplett.
- Brief/kväll/vecka: hämta journal + health + workouts + scores, och vid behov ekonomi/tasks/study.
- Senaste journal: använd fetch_journal limit 1.
- Vad vet du om mig/minne/mål/relationer: använd fetch_memory_goals.
- Historiska mönster: hämta bredare period, gärna date_from 2020-01-01 när användaren ber om helhetsbild.

ÅTGÄRDER:
Du kan föreslå databas-actions, men de körs ALDRIG automatiskt. Lägg actions sist i exakt detta dolda format om något bör loggas/sparas/ändras:
<jarvis_actions>[{"action":"log_training","date":"YYYY-MM-DD","session_type":"löpning","duration_minutes":30,"distance_km":5,"feeling":7,"notes":"..."}]</jarvis_actions>
Tillåtna actions: create_erik_task, create_adventure, save_insight, log_training, log_health, log_expense, log_income, update_training, update_health, update_erik_task, update_expense, delete_training, delete_health, delete_erik_task, delete_expense, delete_income.
VIKTIGT: Skriv aldrig actions/JSON synligt i svaret. Beskriv bara kort vad du föreslår och låt UI visa godkänn-knappen.
Vid delete/update: hämta ID först och var extra tydlig i texten om vad som kommer ändras.`

    const formattedMessages = (messages || [])
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m: any) => ({ role: m.role, content: String(m.content || '') }))

    let currentMessages = [...formattedMessages]
    let finalText = ''

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
          model: Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5',
          max_tokens: 4096,
          system,
          tools: TOOLS,
          messages: currentMessages,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        return new Response(JSON.stringify({ error: data.error?.message || 'Anthropic API error', detail: data }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

    const { content, actions } = extractActionsAndClean(finalText)
    return new Response(JSON.stringify({ content, actions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
