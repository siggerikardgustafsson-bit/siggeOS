import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOOLS = [
  {
    name: 'fetch_workouts',
    description: 'Hämtar träningspass för Sigge. Använd när han frågar om träning, löpning, gympass, kondition, progress, statistik eller vill analysera sin träningshistorik.',
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
    description: 'Hämtar hälsodata: vikt, sömn, steg, energi, alkohol, nikotin. Använd när han frågar om sin kropp, hälsa, sömnkvalitet, viktutveckling, stegantal eller välmående.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        fields: { type: 'string', description: 'Kommaseparerade fält: weight_kg,sleep_hours,steps,energy,alcohol_units. Tom = allt.' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_journal',
    description: 'Hämtar journalanteckningar. Använd när han frågar om hur han mått, tankar, humör, specifika perioder eller vill reflektera.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Startdatum YYYY-MM-DD' },
        date_to: { type: 'string', description: 'Slutdatum YYYY-MM-DD' },
        limit: { type: 'number', description: 'Max antal (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'fetch_economy',
    description: 'Hämtar ekonomidata: inkomster, utgifter, PA-lön. Använd när han frågar om pengar, budget, sparande, inkomst eller utgifter.',
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
    description: 'Hämtar pluggdata: studietimmar, kurser, examinationer, lärandemål. Använd när han frågar om plugg, kurser, tentor eller studieframgång.',
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
    description: 'Hämtar PA-pass med lön, timmar och typ (sov/vaken). Använd när han frågar om jobbet, PA-arbete, lön eller arbetstimmar.',
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
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

  try {
    if (toolName === 'fetch_workouts') {
      let query = supabase
        .from('training_sessions')
        .select('date, session_type, duration_minutes, distance_km, pace_per_km, feeling, notes')
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
        if (s.notes) parts.push(s.notes.slice(0, 60))
        return parts.join(' | ')
      }).join('\n')

      return `${data.length} träningspass:\n${summary}`
    }

    if (toolName === 'fetch_health') {
      const fields = input.fields
        ? input.fields.split(',').map((f: string) => f.trim()).join(',')
        : 'date,weight_kg,sleep_hours,steps,energy,alcohol_units,nicotine'

      const { data } = await supabase
        .from('health_logs')
        .select(fields)
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })

      if (!data?.length) return 'Ingen hälsodata hittades.'

      const rows = data.map((r: any) => Object.entries(r).filter(([, v]) => v != null && v !== 0).map(([k, v]) => `${k}:${v}`).join(' ')).join('\n')
      return `Hälsodata (${data.length} dagar):\n${rows}`
    }

    if (toolName === 'fetch_journal') {
      const { data } = await supabase
        .from('journal_entries')
        .select('date, mood, energy, sleep_hours, highlights, challenges, gratitude, tomorrow_focus')
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })
        .limit(input.limit || 20)

      if (!data?.length) return 'Inga journalanteckningar hittades.'

      const rows = data.map((r: any) => [
        `📅 ${r.date}`,
        r.mood ? `humör:${r.mood}/10` : '',
        r.energy ? `energi:${r.energy}/10` : '',
        r.highlights ? `highlights: ${r.highlights}` : '',
        r.challenges ? `utmaningar: ${r.challenges}` : '',
      ].filter(Boolean).join(' | ')).join('\n')

      return `Journal (${data.length} entries):\n${rows}`
    }

    if (toolName === 'fetch_economy') {
      const results: string[] = []

      if (!input.type || input.type === 'income' || input.type === 'both') {
        const { data } = await supabase
          .from('income_logs')
          .select('date, amount, source, description')
          .eq('user_id', userId)
          .gte('date', input.date_from || thirtyDaysAgo)
          .lte('date', input.date_to || today)
          .order('date', { ascending: false })

        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + r.amount, 0)
          results.push(`INKOMSTER (${data.length} poster, totalt ${Math.round(total)} kr):\n` +
            data.map((r: any) => `${r.date} | ${r.amount}kr | ${r.source} ${r.description || ''}`).join('\n'))
        }
      }

      if (!input.type || input.type === 'expense' || input.type === 'both') {
        const { data } = await supabase
          .from('expense_logs')
          .select('date, amount, category, description')
          .eq('user_id', userId)
          .gte('date', input.date_from || thirtyDaysAgo)
          .lte('date', input.date_to || today)
          .order('date', { ascending: false })

        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + r.amount, 0)
          results.push(`UTGIFTER (${data.length} poster, totalt ${Math.round(total)} kr):\n` +
            data.map((r: any) => `${r.date} | ${r.amount}kr | ${r.category} ${r.description || ''}`).join('\n'))
        }
      }

      return results.length ? results.join('\n\n') : 'Ingen ekonomidata hittades.'
    }

    if (toolName === 'fetch_study') {
      const [sessionsRes, coursesRes] = await Promise.all([
        supabase.from('study_sessions').select('date, hours, course_id').eq('user_id', userId)
          .gte('date', input.date_from || thirtyDaysAgo)
          .lte('date', input.date_to || today)
          .order('date', { ascending: false }),
        supabase.from('courses').select('id, name, active, exam_date').eq('user_id', userId),
      ])

      const courses = (coursesRes.data || []).reduce((acc: any, c: any) => { acc[c.id] = c; return acc }, {})
      const sessions = sessionsRes.data || []
      const totalHours = sessions.reduce((s: number, r: any) => s + (r.hours || 0), 0)

      const rows = sessions.map((r: any) =>
        `${r.date} | ${r.hours}h | ${courses[r.course_id]?.name || 'okänd kurs'}`
      ).join('\n')

      const activeCourses = (coursesRes.data || []).filter((c: any) => c.active)
        .map((c: any) => `${c.name}${c.exam_date ? ` (tenta ${c.exam_date})` : ''}`)
        .join(', ')

      return `Plugg: ${sessions.length} studiesessioner, ${totalHours.toFixed(1)}h totalt\nAktiva kurser: ${activeCourses}\n${rows}`
    }

    if (toolName === 'fetch_pa_shifts') {
      const { data } = await supabase
        .from('pa_shifts')
        .select('date, hours_worked, shift_type, estimated_pay, start_time, end_time')
        .eq('user_id', userId)
        .gte('date', input.date_from || thirtyDaysAgo)
        .lte('date', input.date_to || today)
        .order('date', { ascending: false })

      if (!data?.length) return 'Inga PA-pass hittades.'

      const totalHours = data.reduce((s: number, r: any) => s + (r.hours_worked || 0), 0)
      const totalPay = data.reduce((s: number, r: any) => s + (r.estimated_pay || 0), 0)
      const rows = data.map((r: any) =>
        `${r.date} | ${r.shift_type || 'okänd'} | ${r.hours_worked?.toFixed(1)}h${r.estimated_pay ? ` | ~${Math.round(r.estimated_pay)}kr` : ''}`
      ).join('\n')

      return `PA-pass (${data.length} pass, ${totalHours.toFixed(1)}h, ~${Math.round(totalPay)}kr brutto):\n${rows}`
    }

    return 'Okänt verktyg.'
  } catch (err) {
    return `Fel vid datahämtning: ${err}`
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

    // Fetch exam file and course materials server-side to avoid large payloads
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

    const enrichedSystemPrompt = systemPrompt + (contentBlock ? '\n\n' + contentBlock : '')

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
          const attachments = g.attachments || {}
          const attachmentLines = Object.entries(attachments).flatMap(([section, files]: [string, any]) => (files || []).map((file: any) => `${section}: ${file.name}`))
          if (attachmentLines.length) gp.push(`Bifogade profil-PDF:er: ${attachmentLines.join('; ')}`)
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

    const systemBase = enrichedSystemPrompt
      ? enrichedSystemPrompt.replace('{CONTEXT}', context || 'Ingen kontextdata.')
      : 'Du är en hjälpsam assistent.'

    const system = systemBase + userSettingsBlock + `

VERKTYG & DATAHÄMTNING:
Du har tillgång till verktyg för att hämta Sigges data från databasen. Använd dem proaktivt när han frågar om specifika perioder, statistik eller vill analysera något. Du behöver INTE be om lov — hämta bara datan direkt och svara sedan. Om han frågar "hur har min löpning sett ut?" — fetch_workouts direkt.`

    const formattedMessages = messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }))

    // Agentic loop — allow up to 5 tool calls
    let currentMessages = [...formattedMessages]
    let finalText = ''
    let iterations = 0

    while (iterations < 5) {
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

      // Check stop reason
      if (data.stop_reason === 'end_turn') {
        const textBlock = data.content?.find((b: any) => b.type === 'text')
        finalText = textBlock?.text || ''
        break
      }

      if (data.stop_reason === 'tool_use') {
        // Add assistant message with tool use blocks
        currentMessages.push({ role: 'assistant', content: data.content })

        // Execute all tool calls
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

        // Add tool results as user message
        currentMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // Fallback
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
