import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOOLS = [
  {
    name: 'fetch_workouts',
    description: 'Hämtar träningspass. Använd när han frågar om träning, löpning, gympass, kondition, progress eller statistik. Använd proaktivt om frågan handlar om hälsa/kropp/välmående.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['run', 'gym', 'walk', 'other', 'all'], description: 'Typ av träning. all = alla typer.' },
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal resultat (default 50)' },
      },
      required: ['type'],
    },
  },
  {
    name: 'fetch_health',
    description: 'Hämtar hälsodata: vikt, sömn, steg, energi, alkohol, nikotin. Använd när han frågar om kropp, hälsa, sömnkvalitet, viktutveckling eller välmående.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        fields: { type: 'string', description: 'Kommaseparerade fält: weight_kg,sleep_hours,steps,energy,alcohol_units,nicotine. Tom = allt.' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_journal',
    description: 'Hämtar journalanteckningar med humör, energi, highlights, utmaningar och reflektioner. Använd PROAKTIVT när: han frågar om hur han mått, tankar, en specifik period, vill reflektera, nämner att han känt på ett visst sätt, eller när du behöver bakgrundskontext om hans mående. Kan hämta från hela historiken — ange date_from="2020-01-01" för att söka långt tillbaka.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD. Utelämna för senaste 90 dagarna. Sätt "2020-01-01" för hela historiken.' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal (default 50, max 200)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_economy',
    description: 'Hämtar ekonomidata: inkomster, utgifter per kategori, PA-lön. Använd när han frågar om pengar, budget, sparande, inkomst, utgifter eller ekonomisk situation.',
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
    description: 'Hämtar pluggdata: studietimmar, kurser, examinationer, lärandemål och mastery. Använd när han frågar om plugg, kurser, tentor, studieframgång eller akademisk progress.',
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
    name: 'fetch_pa_shifts',
    description: 'Hämtar PA-pass med lön, timmar och typ (sov/vaken). Använd när han frågar om jobbet, PA-arbete, lön, arbetstimmar eller arbetsschema.',
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
    name: 'fetch_adventures',
    description: 'Hämtar resor, äventyr och upplevelser samt side quests. Använd när han frågar om resor, upplevelser, äventyr, länder han besökt, vad han gjort roligt eller sina quests.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['trips', 'adventures', 'quests', 'all'], description: 'Typ: trips=resor, adventures=äventyr/dagshändelser, quests=side quests, all=allt' },
        status: { type: 'string', description: 'För resor: planerad|avklarad|idé|aktiv. Tom = alla.' },
        limit: { type: 'number', description: 'Max antal (default 30)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_scores',
    description: 'Hämtar dagliga scores för träning, hälsa, plugg, ekonomi och jobb. Använd när han frågar om sin totala progress, dagsscore-trender, hur han presterat historiskt eller vill se mönster.',
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
    description: 'Hämtar Erik-uppdrag/tasks med status, deadline och tagg. Använd när han frågar om jobb-uppdrag, vad som är klart, vad som är pågående, Erik-relaterat arbete eller deadlines.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['ej_påbörjat', 'pågående', 'klart', 'all'], description: 'Status filter. all = alla.' },
        limit: { type: 'number', description: 'Max antal (default 30)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_goals',
    description: 'Hämtar sparmål och personliga mål från inställningar. Använd när han frågar om sina mål, sparmål, vart han är på väg, framtidsplaner eller livsmål.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['savings', 'personal', 'all'], description: 'savings=sparmål, personal=livsmål/inställningar, all=allt' },
      },
      required: [],
    },
  },
]

async function executeTool(toolName: string, input: any, supabase: any, userId: string): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

  try {
    // ─── FETCH WORKOUTS ────────────────────────────────────────────────────────
    if (toolName === 'fetch_workouts') {
      let query = supabase
        .from('training_sessions')
        .select('id, date, session_type, duration_minutes, distance_km, pace_per_km, feeling, notes, source')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(input.limit || 50)

      if (input.type && input.type !== 'all') query = query.eq('session_type', input.type)
      if (input.date_from) query = query.gte('date', input.date_from)
      if (input.date_to) query = query.lte('date', input.date_to)

      const { data } = await query
      if (!data?.length) return 'Inga träningspass hittades för angiven period.'

      const summary = data.map((s: any) => {
        const parts = [s.date, s.session_type]
        if (s.distance_km) parts.push(`${s.distance_km}km`)
        if (s.duration_minutes) parts.push(`${s.duration_minutes}min`)
        if (s.pace_per_km) {
          const min = Math.floor(s.pace_per_km / 60)
          const sec = s.pace_per_km % 60
          parts.push(`${min}:${sec.toString().padStart(2, '0')}/km`)
        }
        if (s.feeling) parts.push(`känsla ${s.feeling}/10`)
        if (s.notes) parts.push(s.notes.slice(0, 80))
        parts.push(`[id:${s.id}]`)
        return parts.join(' | ')
      }).join('\n')

      return `${data.length} träningspass:\n${summary}`
    }

    // ─── FETCH HEALTH ──────────────────────────────────────────────────────────
    if (toolName === 'fetch_health') {
      const fields = input.fields
        ? 'id,' + input.fields.split(',').map((f: string) => f.trim()).join(',') + ',date'
        : 'id,date,weight_kg,sleep_hours,steps,energy,alcohol_units,nicotine'

      const { data } = await supabase
        .from('health_logs')
        .select(fields)
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })

      if (!data?.length) return 'Ingen hälsodata hittades.'

      const rows = data.map((r: any) => {
        const parts = [r.date]
        if (r.weight_kg) parts.push(`vikt:${r.weight_kg}kg`)
        if (r.sleep_hours) parts.push(`sömn:${r.sleep_hours}h`)
        if (r.steps) parts.push(`steg:${r.steps}`)
        if (r.energy) parts.push(`energi:${r.energy}/10`)
        if (r.alcohol_units) parts.push(`alkohol:${r.alcohol_units}`)
        if (r.nicotine) parts.push('nikotin:ja')
        parts.push(`[id:${r.id}]`)
        return parts.join(' | ')
      }).join('\n')

      return `Hälsodata (${data.length} dagar):\n${rows}`
    }

    // ─── FETCH JOURNAL ─────────────────────────────────────────────────────────
    if (toolName === 'fetch_journal') {
      const { data } = await supabase
        .from('journal_entries')
        .select('id, date, mood, energy, sleep_hours, highlights, challenges, gratitude, tomorrow_focus, content')
        .eq('user_id', userId)
        .gte('date', input.date_from || ninetyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(Math.min(input.limit || 50, 200))

      if (!data?.length) return 'Inga journalanteckningar hittades för angiven period.'

      const rows = data.map((r: any) => [
        `📅 ${r.date}`,
        r.mood ? `humör:${r.mood}/10` : '',
        r.energy ? `energi:${r.energy}/10` : '',
        r.sleep_hours ? `sömn:${r.sleep_hours}h` : '',
        r.highlights ? `highlights: ${r.highlights}` : '',
        r.challenges ? `utmaningar: ${r.challenges}` : '',
        r.gratitude ? `tacksamhet: ${r.gratitude}` : '',
        r.tomorrow_focus ? `imorgon: ${r.tomorrow_focus}` : '',
        r.content ? `\n${r.content.slice(0, 500)}` : '',
        `[id:${r.id}]`,
      ].filter(Boolean).join(' | ')).join('\n\n')

      return `Journal (${data.length} entries, ${input.date_from || ninetyDaysAgo} → ${input.date_to || today}):\n${rows}`
    }

    // ─── FETCH ECONOMY ─────────────────────────────────────────────────────────
    if (toolName === 'fetch_economy') {
      const results: string[] = []

      if (!input.type || input.type === 'income' || input.type === 'both') {
        const { data } = await supabase
          .from('income_logs')
          .select('id, date, amount, source, description')
          .eq('user_id', userId)
          .gte('date', input.date_from || thirtyDaysAgo)
          .lte('date', input.date_to || today)
          .order('date', { ascending: false })

        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + r.amount, 0)
          results.push(`INKOMSTER (${data.length} poster, totalt ${Math.round(total)} kr):\n` +
            data.map((r: any) => `${r.date} | ${r.amount}kr | ${r.source} ${r.description || ''} [id:${r.id}]`).join('\n'))
        }
      }

      if (!input.type || input.type === 'expense' || input.type === 'both') {
        const { data } = await supabase
          .from('expense_logs')
          .select('id, date, amount, category, description')
          .eq('user_id', userId)
          .gte('date', input.date_from || thirtyDaysAgo)
          .lte('date', input.date_to || today)
          .order('date', { ascending: false })

        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + r.amount, 0)
          const byCat: Record<string, number> = {}
          data.forEach((r: any) => { byCat[r.category] = (byCat[r.category] || 0) + r.amount })
          const catSummary = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${Math.round(v as number)}kr`).join(', ')
          results.push(`UTGIFTER (${data.length} poster, totalt ${Math.round(total)} kr)\nPer kategori: ${catSummary}\n` +
            data.map((r: any) => `${r.date} | ${r.amount}kr | ${r.category} | ${r.description || ''} [id:${r.id}]`).join('\n'))
        }
      }

      return results.length ? results.join('\n\n') : 'Ingen ekonomidata hittades.'
    }

    // ─── FETCH STUDY ───────────────────────────────────────────────────────────
    if (toolName === 'fetch_study') {
      const [sessionsRes, coursesRes, goalsRes] = await Promise.all([
        supabase.from('study_sessions')
          .select('date, hours, course_id, notes')
          .eq('user_id', userId)
          .gte('date', input.date_from || thirtyDaysAgo)
          .lte('date', input.date_to || today)
          .order('date', { ascending: false }),
        supabase.from('courses').select('id, name, active, term').eq('user_id', userId),
        supabase.from('learning_goals')
          .select('description, mastery, last_studied, exam_id')
          .eq('user_id', userId)
          .order('mastery', { ascending: true })
          .limit(20),
      ])

      const courses = (coursesRes.data || []).reduce((acc: any, c: any) => { acc[c.id] = c; return acc }, {})
      const sessions = sessionsRes.data || []
      const totalHours = sessions.reduce((s: number, r: any) => s + (r.hours || 0), 0)

      const sessionRows = sessions.map((r: any) =>
        `${r.date} | ${r.hours}h | ${courses[r.course_id]?.name || 'okänd kurs'}${r.notes ? ' | ' + r.notes : ''}`
      ).join('\n')

      const activeCourses = (coursesRes.data || []).filter((c: any) => c.active)
        .map((c: any) => c.name).join(', ')

      const weakGoals = (goalsRes.data || [])
        .filter((g: any) => g.mastery < 50)
        .slice(0, 10)
        .map((g: any) => `${g.description} (mastery:${g.mastery}%)`)
        .join('\n')

      return `Plugg (${sessions.length} sessioner, ${totalHours.toFixed(1)}h totalt)
Aktiva kurser: ${activeCourses || 'inga'}
${sessionRows}
${weakGoals ? `\nSVAGA LÄRANDEMÅL (under 50%):\n${weakGoals}` : ''}`
    }

    // ─── FETCH PA SHIFTS ───────────────────────────────────────────────────────
    if (toolName === 'fetch_pa_shifts') {
      const { data } = await supabase
        .from('pa_shifts')
        .select('id, date, hours_worked, shift_type, estimated_pay, start_time, end_time, is_night_shift')
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })

      if (!data?.length) return 'Inga PA-pass hittades.'

      const totalHours = data.reduce((s: number, r: any) => s + (r.hours_worked || 0), 0)
      const totalPay = data.reduce((s: number, r: any) => s + (r.estimated_pay || 0), 0)
      const rows = data.map((r: any) =>
        `${r.date} | ${r.shift_type || r.is_night_shift ? 'natt' : 'dag'} | ${r.hours_worked?.toFixed(1)}h${r.estimated_pay ? ` | ~${Math.round(r.estimated_pay)}kr` : ''} [id:${r.id}]`
      ).join('\n')

      return `PA-pass (${data.length} pass, ${totalHours.toFixed(1)}h totalt, ~${Math.round(totalPay)}kr brutto):\n${rows}`
    }

    // ─── FETCH ADVENTURES ──────────────────────────────────────────────────────
    if (toolName === 'fetch_adventures') {
      const type = input.type || 'all'
      const results: string[] = []

      if (type === 'trips' || type === 'all') {
        let q = supabase.from('trips').select('id, title, status, countries, start_date, end_date, duration_days, rating, notes')
          .eq('user_id', userId).order('start_date', { ascending: false }).limit(input.limit || 30)
        if (input.status) q = q.eq('status', input.status)
        const { data } = await q
        if (data?.length) {
          results.push(`RESOR (${data.length}):\n` + data.map((r: any) =>
            `${r.title} | ${r.status} | ${r.countries?.join(', ') || ''} | ${r.start_date || '?'} | ${r.duration_days || '?'}d${r.rating ? ` | ⭐${r.rating}` : ''} [id:${r.id}]`
          ).join('\n'))
        }
      }

      if (type === 'adventures' || type === 'all') {
        const { data } = await supabase.from('adventures')
          .select('id, title, description, date, category, rating, location')
          .eq('user_id', userId).order('date', { ascending: false }).limit(input.limit || 30)
        if (data?.length) {
          results.push(`ÄVENTYR/UPPLEVELSER (${data.length}):\n` + data.map((r: any) =>
            `${r.date} | ${r.title} | ${r.category}${r.location ? ' | ' + r.location : ''}${r.rating ? ' | ⭐' + r.rating : ''} [id:${r.id}]`
          ).join('\n'))
        }
      }

      if (type === 'quests' || type === 'all') {
        const { data } = await supabase.from('side_quests')
          .select('id, title, description, status, category, deadline, progress')
          .eq('user_id', userId).order('created_at', { ascending: false }).limit(input.limit || 20)
        if (data?.length) {
          results.push(`SIDE QUESTS (${data.length}):\n` + data.map((r: any) =>
            `${r.title} | ${r.status} | ${r.category}${r.deadline ? ' | deadline:' + r.deadline : ''}${r.progress ? ' | ' + r.progress + '%' : ''} [id:${r.id}]`
          ).join('\n'))
        }
      }

      return results.length ? results.join('\n\n') : 'Inga upplevelser/resor hittades.'
    }

    // ─── FETCH SCORES ──────────────────────────────────────────────────────────
    if (toolName === 'fetch_scores') {
      const { data } = await supabase
        .from('daily_scores')
        .select('date, score_training, score_health, score_study, score_economy, score_work, score_journal, total_score')
        .eq('user_id', userId)
        .gte('date', input.date_from || ninetyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })

      if (!data?.length) return 'Inga dagliga scores hittades.'

      const rows = data.map((r: any) => {
        const parts = [r.date]
        if (r.total_score) parts.push(`total:${r.total_score}`)
        if (r.score_training) parts.push(`träning:${r.score_training}`)
        if (r.score_health) parts.push(`hälsa:${r.score_health}`)
        if (r.score_study) parts.push(`plugg:${r.score_study}`)
        if (r.score_economy) parts.push(`ekonomi:${r.score_economy}`)
        if (r.score_work) parts.push(`jobb:${r.score_work}`)
        if (r.score_journal) parts.push(`journal:${r.score_journal}`)
        return parts.join(' | ')
      }).join('\n')

      // Compute averages
      const avg = (key: string) => {
        const vals = data.filter((r: any) => r[key]).map((r: any) => r[key])
        return vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(1) : '—'
      }
      const avgs = `Snitt: träning:${avg('score_training')} hälsa:${avg('score_health')} plugg:${avg('score_study')} ekonomi:${avg('score_economy')} jobb:${avg('score_work')}`

      return `Dagliga scores (${data.length} dagar):\n${avgs}\n\n${rows}`
    }

    // ─── FETCH TASKS ───────────────────────────────────────────────────────────
    if (toolName === 'fetch_tasks') {
      let q = supabase.from('erik_tasks')
        .select('id, title, description, status, tag, deadline, priority, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(input.limit || 30)

      if (input.status && input.status !== 'all') q = q.eq('status', input.status)

      const { data } = await q
      if (!data?.length) return 'Inga Erik-uppdrag hittades.'

      const byStatus: Record<string, any[]> = { 'ej_påbörjat': [], 'pågående': [], 'klart': [] }
      data.forEach((t: any) => { if (byStatus[t.status]) byStatus[t.status].push(t) })

      const rows = data.map((t: any) =>
        `${t.status} | ${t.title} | ${t.tag}${t.deadline ? ' | deadline:' + t.deadline : ''}${t.description ? ' | ' + t.description.slice(0, 60) : ''} [id:${t.id}]`
      ).join('\n')

      return `Erik-uppdrag (${data.length} totalt — ej påbörjat:${byStatus['ej_påbörjat'].length} pågående:${byStatus['pågående'].length} klart:${byStatus['klart'].length}):\n${rows}`
    }

    // ─── FETCH GOALS ───────────────────────────────────────────────────────────
    if (toolName === 'fetch_goals') {
      const type = input.type || 'all'
      const results: string[] = []

      if (type === 'savings' || type === 'all') {
        const { data } = await supabase.from('savings_goals')
          .select('id, name, target_amount, current_amount, deadline, category, notes')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })

        if (data?.length) {
          results.push(`SPARMÅL (${data.length}):\n` + data.map((g: any) => {
            const pct = g.target_amount ? Math.round((g.current_amount || 0) / g.target_amount * 100) : 0
            return `${g.name} | ${g.current_amount || 0}/${g.target_amount}kr (${pct}%)${g.deadline ? ' | deadline:' + g.deadline : ''}${g.notes ? ' | ' + g.notes : ''} [id:${g.id}]`
          }).join('\n'))
        } else {
          results.push('Inga sparmål registrerade.')
        }
      }

      if (type === 'personal' || type === 'all') {
        const { data } = await supabase.from('user_settings')
          .select('about_me, goals, jarvis_personality')
          .eq('user_id', userId).single()

        if (data) {
          const g = data.goals || {}
          const parts = []
          if (data.about_me) parts.push(`Om mig: ${data.about_me}`)
          if (g.one_year) parts.push(`1 år: ${g.one_year}`)
          if (g.three_year) parts.push(`3 år: ${g.three_year}`)
          if (g.ten_year) parts.push(`10 år: ${g.ten_year}`)
          if (g.future_plan) parts.push(`Framtidsplan: ${g.future_plan}`)
          if (g.body_weight_goal) parts.push(`Viktmål: ${g.body_weight_goal}kg${g.body_weight_deadline ? ' till ' + g.body_weight_deadline : ''}`)
          if (g.monthly_income_goal) parts.push(`Inkomstmål: ${g.monthly_income_goal}kr/mån`)
          if (parts.length) results.push(`PERSONLIGA MÅL:\n${parts.join('\n')}`)
        }
      }

      return results.length ? results.join('\n\n') : 'Inga mål hittades.'
    }

    return `Okänt verktyg: ${toolName}`
  } catch (err) {
    return `Fel vid datahämtning (${toolName}): ${err}`
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, context, systemPrompt, examFileId, materialIds } = await req.json()

    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? '',
    )
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await anonClient.auth.getUser()

    // Fetch exam file and course materials server-side
    let contentBlock = ''
    if (materialIds && materialIds.length > 0) {
      const { data: mats } = await supabase.from('course_materials').select('file_name, content').in('id', materialIds)
      if (mats && mats.length > 0) {
        contentBlock += '\nKURSMATERIAL (ABSOLUT SANNING — basera allt på detta):\n' +
          mats.map((m: any) => '--- ' + m.file_name + ' ---\n' + (m.content || '')).join('\n\n')
      }
    }
    if (examFileId) {
      const { data: ef } = await supabase.from('exam_old_files').select('file_name, content').eq('id', examFileId).single()
      if (ef && ef.content) {
        contentBlock += '\nVALD TENTA "' + ef.file_name + '" — kör exakt dessa frågor:\n' + ef.content
      }
    }

    // Fetch user settings
    let userSettingsBlock = ''
    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('about_me, goals, jarvis_style, jarvis_lang, jarvis_personality')
        .eq('user_id', user.id)
        .single()

      if (settings) {
        const parts = []
        if (settings.about_me) parts.push(`OM SIGGE (skrivet av honom):\n${settings.about_me}`)
        if (settings.goals) {
          const g = settings.goals
          const gp = []
          if (g.one_year) gp.push(`1 år: ${g.one_year}`)
          if (g.three_year) gp.push(`3 år: ${g.three_year}`)
          if (g.ten_year) gp.push(`10 år: ${g.ten_year}`)
          if (g.future_plan) gp.push(`Framtidsplan: ${g.future_plan}`)
          const targetWeight = g.target_weight || g.body_weight_goal
          if (targetWeight) gp.push(`Kroppsviktsmål: ${targetWeight} kg${g.body_weight_deadline ? ' till ' + g.body_weight_deadline : ''}`)
          if (g.monthly_income_goal) gp.push(`Inkomstmål: ${g.monthly_income_goal} kr/mån`)
          if (gp.length) parts.push(`MÅL:\n${gp.join('\n')}`)
        }
        if (settings.jarvis_personality) parts.push(`PERSONLIGHET:\n${settings.jarvis_personality}`)
        if (settings.jarvis_style != null) {
          const s = settings.jarvis_style
          const desc = s < 30 ? 'diplomatisk' : s < 60 ? 'balanserad' : s < 85 ? 'direkt' : 'brutalt ärlig'
          parts.push(`KOMMUNIKATIONSSTIL: ${desc}`)
        }
        if (settings.jarvis_lang && settings.jarvis_lang !== 'auto') parts.push(`SVAR PÅ: ${settings.jarvis_lang}`)
        if (parts.length) userSettingsBlock = '\n\n' + parts.join('\n\n')
      }
    }

    const enrichedSystemPrompt = systemPrompt + (contentBlock ? '\n\n' + contentBlock : '')

    const systemBase = enrichedSystemPrompt
      ? enrichedSystemPrompt.replace('{CONTEXT}', context || 'Ingen kontextdata.')
      : 'Du är en hjälpsam assistent.'

    const system = systemBase + userSettingsBlock + `

VERKTYG & DATAHÄMTNING:
Du har tillgång till 10 verktyg för att hämta Sigges data. Använd dem PROAKTIVT — hämta data direkt utan att fråga. Regler:
- Frågar han om träning/löpning/gym → fetch_workouts direkt
- Frågar han om hälsa/vikt/sömn → fetch_health direkt
- Frågar han om pengar/ekonomi/sparande → fetch_economy direkt
- Frågar han om plugg/kurser/tentor → fetch_study direkt
- Frågar han om resor/upplevelser/äventyr → fetch_adventures direkt
- Frågar han om jobb/erik-uppdrag → fetch_tasks direkt
- Frågar han om mål/sparmål/framtid → fetch_goals direkt
- Frågar han om sitt score/progress/trend → fetch_scores direkt
- Morning/evening brief → hämta fetch_health + fetch_workouts + fetch_scores parallellt
- Analysera en period → hämta relevant data för perioden

JOURNAL — KRITISKT:
- Nämner han att han känt på ett visst sätt HISTORISKT → fetch_journal med date_from bakåt i tid
- Frågar om en specifik period (t.ex. "hur mådde jag i januari") → fetch_journal med exakta datum
- Vill reflektera eller jämföra perioder → fetch_journal för båda perioderna
- Vill titta på hela historiken → fetch_journal med date_from="2020-01-01" och limit=200
- Sätt aldrig en godtycklig 30-dagarsgräns — hämta så långt tillbaka som frågan kräver

MINNE — KRITISKT:
- Alla insikter i kontexten (LONG-TERM INSIKTER) är permanent minne du byggt upp — använd dem aktivt
- När du lär dig något nytt om Sigge, säg det explicit i svaret så extraktionen kan spara det
- Tänk på dig själv som en läkare som bygger en patientjournal — ju mer du vet, desto bättre hjälp

IDs finns i varje rad som [id:UUID] — använd dessa vid update/delete-actions.`

    const formattedMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }))

    // Agentic loop — allow up to 8 tool calls for complex queries
    let currentMessages = [...formattedMessages]
    let finalText = ''
    let iterations = 0

    while (iterations < 8) {
      iterations++

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 4096,
          system,
          tools: TOOLS,
          messages: currentMessages,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: data.error?.message || 'API error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (data.stop_reason === 'end_turn') {
        const textBlock = data.content?.find((b: any) => b.type === 'text')
        finalText = textBlock?.text || ''
        break
      }

      if (data.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: data.content })

        const toolResults = []
        for (const block of data.content) {
          if (block.type === 'tool_use') {
            const result = user
              ? await executeTool(block.name, block.input, supabase, user.id)
              : 'Ingen användare inloggad.'

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            })
          }
        }

        currentMessages.push({ role: 'user', content: toolResults })
        continue
      }

      const textBlock = data.content?.find((b: any) => b.type === 'text')
      finalText = textBlock?.text || ''
      break
    }

    return new Response(
      JSON.stringify({ content: finalText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
