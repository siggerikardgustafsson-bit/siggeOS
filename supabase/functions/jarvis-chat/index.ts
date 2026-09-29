import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, getAuthedUser, unauthorized } from '../_shared/auth.ts'
import { newUsage, addUsage, logUsage } from '../_shared/aiUsage.ts'
// @ts-ignore — generated plain-JS bundle (src/lib/pay.js)
import { priceShift } from '../_shared/serverLib.bundle.js'

// Anthropic config — one place, so the stream and non-stream branches can't
// drift apart (AUDIT.md P3-11).
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
// Model routing (2026-09-29): Sonnet 5.5 for chat and anything that needs
// judgment; Haiku 4.5 for mechanical extraction features (JSON / PDF-to-text)
// tagged by the caller in body.feature. ANTHROPIC_MODEL overrides the chat model.
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5-5'
const HAIKU_MODEL = 'claude-haiku-4-5'
const HAIKU_FEATURES = new Set(['journal_analysis', 'insights_observations', 'time_estimate', 'pdf_goals', 'pdf_extract', 'side_quests'])
// Output headroom per feature. PDF-to-text used to be cut off at 2500 tokens
// (~8k chars), so the study tutor only ever saw the start of a document.
const MAX_TOKENS: Record<string, number> = { pdf_extract: 16000, chat: 8000, profile_summary: 6000 }
// Effort per feature (Sonnet 5.5); default low. The profile summary runs
// rarely and everything downstream reads it, so it gets more thought.
const EFFORT: Record<string, string> = { profile_summary: 'medium' }
// For side-by-side quality checks from the app itself (the authenticated user
// only; whitelist so nothing else can be requested).
const MODEL_OVERRIDES = new Set(['claude-sonnet-4-6', 'claude-sonnet-5-5', 'claude-haiku-4-5'])
// Thinking mode for Sonnet 5.5 chat: 'between_tools' = no extended thinking
// (cheapest), 'adaptive' = thinks at effort low. Overridable per request for A/B.
const CHAT_THINKING = Deno.env.get('JARVIS_THINKING') || 'adaptive'

// Per-model request parameters. Sonnet 5.5: adaptive thinking (the default —
// `thinking` omitted) at effort low, the recommended starting point for chat
// and extraction; server-side refusal fallback (Claude API). Haiku 4.5 takes
// neither effort nor adaptive thinking — send nothing extra.
function modelParams(model: string, thinking = CHAT_THINKING, effort = 'low'): { body: Record<string, unknown>; betas: string[] } {
  if (model.startsWith('claude-haiku')) return { body: {}, betas: [] }
  if (model === 'claude-sonnet-5-5') {
    return {
      body: { output_config: { effort }, ...(thinking === 'between_tools' && { thinking: { type: 'between_tools' } }), fallbacks: 'default' },
      betas: ['server-side-fallback-2026-07-01'],
    }
  }
  return { body: { output_config: { effort } }, betas: [] }
}
const REFUSAL_TEXT = 'Det där kan jag tyvärr inte svara på i den formen. Formulera gärna om frågan, så försöker jag igen.'

// Calendar dates in the user's time zone, not UTC: toISOString() is UTC, so
// anything logged 00:00–02:00 Swedish time (night shifts) landed on yesterday.
const STOCKHOLM_DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' })
const todayISO = () => STOCKHOLM_DATE.format(new Date())
const daysAgoISO = (days: number) => STOCKHOLM_DATE.format(new Date(Date.now() - days * 86400000))
const asLimit = (value: any, fallback = 50, max = 200) => Math.min(Math.max(Number(value || fallback), 1), max)
const clean = (value: any) => value == null || value === '' ? null : value

// Hard cap on a single tool result before it goes onto the message tree.
// Tool result strings are re-sent on every subsequent agent-loop iteration, so
// an unbounded fetch_journal/fetch_health payload makes cost grow ~quadratically
// across the loop (prompt-caching only covers tools+system). See AUDIT.md P1-4.
const TOOL_RESULT_CAP = 20000
const capToolResult = (value: any): string => {
  const s = typeof value === 'string' ? value : String(value ?? '')
  if (s.length <= TOOL_RESULT_CAP) return s
  const kept = s.slice(0, TOOL_RESULT_CAP)
  const omittedLines = (s.slice(TOOL_RESULT_CAP).match(/\n/g) || []).length
  return `${kept}\n…(trunkerat, ${omittedLines} rader utelämnade — be om ett smalare datumintervall eller lägre limit)`
}

// training_sessions.session_type uses the canonical English vocabulary
// 'run' | 'gym' | 'walk' | 'other' (written by the app UI and strava-sync).
// Jarvis converses in Swedish, so tool calls can arrive with Swedish names;
// map both vocabularies to canonical so filters match rows and writes never
// pollute the table with values the rest of the app doesn't recognize.
const SESSION_TYPE_MAP: Record<string, string> = {
  run: 'run', 'löpning': 'run', 'löpa': 'run', springa: 'run', jogging: 'run',
  gym: 'gym', styrka: 'gym', styrketräning: 'gym',
  walk: 'walk', promenad: 'walk', 'gång': 'walk', hike: 'walk', vandring: 'walk',
  other: 'other', 'övrigt': 'other', cykling: 'other', cykel: 'other', simning: 'other',
}
const normalizeSessionType = (value: any): string | null => {
  if (!value || typeof value !== 'string') return null
  return SESSION_TYPE_MAP[value.trim().toLowerCase()] ?? null
}

// daily_scores is a per-day 0-100 activity log written piecemeal by the app
// (Träning writes score_training, Journal writes score_journal/score_health).
// Jarvis writes to the same table with the same formulas so a pass or a
// journal entry logged through chat moves the same needles the app would.
// `merge` picks the higher value per key so a later partial write never
// stomps a domain the app already scored that day.
async function upsertDailyScore(supabase: any, userId: string, date: string, patch: Record<string, number>) {
  try {
    const { data: existing } = await supabase.from('daily_scores').select('*').eq('user_id', userId).eq('date', date).maybeSingle()
    if (existing?.id) {
      const merged: Record<string, number> = {}
      for (const [k, v] of Object.entries(patch)) merged[k] = Math.max(Number(existing[k] || 0), Number(v))
      await supabase.from('daily_scores').update(merged).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({ user_id: userId, date, ...patch })
    }
  } catch (_) { /* daily_scores is best-effort — never fail the write over it */ }
}

// ─────────────────────────────────────────────
// TOOLS
// Sharp, unambiguous descriptions so Jarvis
// knows exactly when to fetch vs rely on context.
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// GENERIC RECORD ACCESS (2026-09-29)
// Jarvis must be able to read/add/edit/delete data anywhere in the app, not
// only through the ~45 hand-written actions above (which stay preferred where
// they exist — they carry side effects like PR tracking). Whitelisted,
// user-owned tables only; user_id is always forced/filtered, id/user_id/
// timestamps can never be written, unknown columns are rejected with the
// valid list, and the per-request RLS client is the last line of defence.
// Excluded on purpose: OAuth/bank token tables, profiles/user_settings (own
// actions), computed tables (tier_snapshots, daily_scores), chat history.
// Schema snapshot from information_schema (post_deploy_22) — keep in sync.
// ─────────────────────────────────────────────
const RECORD_SCHEMA = `adventures(id:uuid,title:text,description:text,date:date,location:text,category:text,rating:int)
assets(id:uuid,name:text,ticker:text,type:text,quantity:num,manual_price_sek:num)
course_exams(id:uuid,course_id:uuid,name:text,exam_date:date,grade:text,notes:text,learning_goals_pdf:text,old_exam_pdf:text,old_exam_content:text,old_exam_filename:text,points_earned:num,points_max:num)
course_materials(id:uuid,exam_id:uuid,course_id:uuid,file_name:text,content:text)
courses(id:uuid,name:text,term:text,exam_date:date,active:bool,grade:text,goal_hours:num,ai_time_estimate:text,ai_time_hours:num)
erik_contact_log(id:uuid,date:date,channel:text,summary:text)
erik_payments(id:uuid,date:date,amount:num,description:text,task_id:uuid)
employments(id:uuid,name:text,employer:text,kind:text,hourly_rate:num,monthly_salary:num,ob_rules:json,ob_mode:text,jour_rate:num,jour_from:text,jour_to:text,jour_ob:bool,holiday_pay_pct:num,tax_rate:num,match_keywords:arr,is_default:bool,active:bool,notes:text)
erik_tasks(id:uuid,title:text,description:text,deadline:date,status:text,priority:text,tag:text,notes:text)
experiments(id:uuid,title:text,hypothesis:text,outcome_metric:text,direction:text,lever_metric:text,lever_op:text,lever_target:num,start_date:date,duration_days:int,baseline_days:int,status:text,ended_at:ts)
expense_logs(id:uuid,date:date,amount:num,category:text,description:text,source:text,external_id:text,sync_origin:text)
fixed_costs(id:uuid,name:text,amount:num,category:text,active:bool)
friends(id:uuid,name:text,nickname:text,relationship:text,location:text,notes:text,reminder_days:int,last_contact_date:date)
goals(id:uuid,title:text,description:text,category:text,target_value:num,current_value:num,unit:text,deadline:date,status:text,metric:text,direction:text,pinned:bool,linked_trip_id:uuid,sort_order:int,completed_at:ts,start_value:num,baseline_date:date)
health_logs(id:uuid,date:date,weight_kg:num,body_fat_pct:num,steps:int,sleep_hours:num,sleep_quality:int,resting_hr:int,screen_time_minutes:int,alcohol_units:num,nicotine:bool,caffeine_mg:int,retatrutide_dose_mg:num,energy:int,source:text,sleep_type:text,sleep_note:text,energy_level:int,stress_level:int,mood:int,sleep_time:text,nicotine_type:text,marijuana:bool)
income_logs(id:uuid,date:date,amount:num,source:text,counts_toward_csn:bool,notes:text,description:text,external_id:text,sync_origin:text)
jarvis_insights(id:uuid,insight:text,category:text,confidence:int)
journal_entries(id:uuid,date:date,content:text,mood:int,sleep_hours:num,energy:int,social_score:int,is_travel_entry:bool,ai_extracted_people:arr,ai_extracted_activities:arr,ai_extracted_keywords:arr,ai_summary:text,sleep_type:text,sleep_note:text)
learning_goals(id:uuid,course_id:uuid,description:text,completed:bool,completed_at:ts,source:text,source_file:text,exam_id:uuid,mastery:int,last_studied:ts,study_count:int)
mandatory_sessions(id:uuid,course_id:uuid,google_event_id:text,title:text,date:date,start_time:ts,end_time:ts,attended:bool,course_hint:text,custom_title:text)
meal_logs(id:uuid,date:date,meal_time:text,description:text,calories_estimate:int,protein_estimate_g:int,photo_url:text,ai_analysis:text,source:text)
net_worth_history(id:uuid,date:date,total_sek:num)
nutrition_logs(id:uuid,date:date,total_calories:int,protein_g:int,water_liters:num)
pa_shifts(id:uuid,date:date,client_name:text,start_time:ts,end_time:ts,hours_worked:num,hourly_rate:num,total_pay:num,is_night_shift:bool,notes:text,google_event_id:text,synced_from_google:bool,shift_type:text,estimated_pay:num,employment_id:uuid)
personal_records(id:uuid,exercise_name:text,weight_kg:num,reps:int,date:date,time_seconds:int,distance_km:num,pace_per_km:int,exercise_id:uuid)
project_tasks(id:uuid,project_id:uuid,title:text,description:text,deadline:date,priority:text,status:text,notes:text)
projects(id:uuid,name:text,type:text,client:text,color:text,description:text,status:text,notes:text)
run_personal_records(id:uuid,distance_key:text,label:text,distance_km:num,time_seconds:int,pace_per_km:int,date:date,strava_activity_id:text,strava_effort_name:text,source:text)
schedule_events(id:uuid,title:text,event_type:text,course_id:uuid,starts_at:ts,ends_at:ts,location:text,recurring:bool,recurrence_rule:text)
side_quests(id:uuid,title:text,description:text,category:text,difficulty:text,status:text,suggested_by:text,completed_at:ts)
skill_logs(id:uuid,date:date,skill:text,minutes:int,notes:text,activity_type:text,cards:int,source:text)
social_interactions(id:uuid,date:date,friend_ids:arr,friend_names:arr,activity:text,duration_hours:num,quality:int,source:text,notes:text)
study_sessions(id:uuid,date:date,course_id:uuid,subject:text,hours:num,notes:text)
study_task_deadlines(id:uuid,task_id:uuid,name:text,due_date:date,completed:bool,completed_at:ts,sort_order:int)
study_tasks(id:uuid,course_id:uuid,title:text,task_type:text,status:text,priority:text,estimated_minutes:int,notes:text)
supplement_logs(id:uuid,date:date,supplement_name:text,taken:bool,dose:num,unit:text,notes:text)
tenta_sessions(id:uuid,exam_id:uuid,old_exam_file_id:uuid,file_name:text,completed_at:ts,score_summary:text)
training_exercises(id:uuid,session_id:uuid,exercise_name:text,set_number:int,reps:int,weight_kg:num,is_dropset:bool,exercise_id:uuid)
training_sessions(id:uuid,date:date,session_type:text,duration_minutes:int,feeling:int,notes:text,distance_km:num,time_seconds:int,pace_per_km:int,source:text,strava_id:text)
trips(id:uuid,title:text,country:text,city:text,start_date:date,end_date:date,highlights:text,rating:int,status:text,budget_sek:int,notes:text,countries:arr,planning_doc:text,budget_items:json,saved_sek:num,cities:json)`
const RECORD_TABLES: Record<string, Set<string>> = Object.fromEntries(
  RECORD_SCHEMA.split('\n').map((line) => {
    const m = /^(\w+)\((.*)\)$/.exec(line.trim())
    return m ? [m[1], new Set(m[2].split(',').map((c) => c.split(':')[0]))] : null
  }).filter(Boolean) as [string, Set<string>][],
)
const PROTECTED_COLUMNS = new Set(['id', 'user_id', 'created_at', 'updated_at'])
const RECORD_JSON_COLS = new Set(
  RECORD_SCHEMA.split('\n').flatMap((line) => {
    const m = /^(\w+)\((.*)\)$/.exec(line.trim())
    return m ? m[2].split(',').filter((c) => c.endsWith(':json')).map((c) => `${m[1]}.${c.split(':')[0]}`) : []
  }),
)

function recordTable(table: any): Set<string> {
  const cols = RECORD_TABLES[String(table || '')]
  if (!cols) throw new Error(`Okänd eller otillåten tabell "${table}". Tillåtna: ${Object.keys(RECORD_TABLES).join(', ')}`)
  return cols
}
// After Jarvis edits a job's pay rules: re-price its shifts (estimated_pay is
// the Export cache; everything else prices live) and return a worked example
// so the model can sanity-check the rules against the document it read.
async function repriceEmployment(supabase: any, userId: string, id: string): Promise<string> {
  const { data: emp } = await supabase.from('employments').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!emp) return ''
  if (emp.is_default) await supabase.from('employments').update({ is_default: false }).eq('user_id', userId).neq('id', id)
  const { data: shifts } = await supabase.from('pa_shifts').select('id,start_time,end_time,shift_type').eq('user_id', userId).eq('employment_id', id)
  await Promise.all((shifts || []).map((sh: any) => supabase.from('pa_shifts').update({ estimated_pay: priceShift(sh, emp)?.gross ?? null }).eq('id', sh.id).eq('user_id', userId)))
  const ex = (type: string) => priceShift({ start_time: '2026-09-29T20:00:00Z', end_time: '2026-09-30T05:00:00Z', shift_type: type }, emp)
  const v = ex('vaken'), sv = ex('sov')
  return ` ${shifts?.length || 0} pass omräknade.${v ? ` Kontroll – vardagsnatt 22–07: vaken ${v.gross} kr brutto (bas ${v.breakdown.base}, OB ${v.breakdown.ob}, sem ${v.breakdown.holiday}), netto ${v.net} kr` : ''}${sv ? `; sovpass ${sv.gross} kr (jour ${sv.breakdown.jour})` : ''}.`
}

function recordValues(table: string, values: any): Record<string, unknown> {
  const cols = recordTable(table)
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('values/fields måste vara ett objekt.')
  const out: Record<string, unknown> = {}
  const unknown: string[] = []
  for (const [k, v] of Object.entries(values)) {
    if (PROTECTED_COLUMNS.has(k)) continue
    if (!cols.has(k)) { unknown.push(k); continue }
    // A json column sent as a JSON string would be stored as a jsonb string.
    if (typeof v === 'string' && RECORD_JSON_COLS.has(`${table}.${k}`)) {
      try { out[k] = JSON.parse(v); continue } catch { throw new Error(`${k} måste vara giltig JSON.`) }
    }
    out[k] = v === '' ? null : v
  }
  if (unknown.length) throw new Error(`Okända kolumner i ${table}: ${unknown.join(', ')}. Giltiga: ${[...cols].filter((c) => !PROTECTED_COLUMNS.has(c)).join(', ')}`)
  if (!Object.keys(out).length) throw new Error('Inga fält att skriva.')
  return out
}

const TOOLS = [
  {
    name: 'fetch_workouts',
    description: 'Pass, PR, styrka/löptrend, Strava-historik. All-time PR-tavla→include_prs=true. Senaste→limit 1.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['run', 'gym', 'walk', 'other', 'all'], description: 'run=löpning, gym=styrka, walk=promenad, other=cykling/simning/övrigt' },
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
    description: 'Livsmål (fritext) + strukturerade mål (mål-tabellen med delmål/progress/deadline), alla insikter, djupare vänprofiler. Använd om auto-laddat minne inte räcker, eller sök specifikt minne med search_keyword.',
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
    description: 'Sök i tidigare Jarvis-konversationer. Använd för: "vad sa vi om X?", mönster över tid, fakta användaren nämnt i gamla chattar, kontinuitet mellan sessioner.',
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
    name: 'fetch_records',
    description: 'Generisk läsning ur valfri tabell i appen (se execute_action → create_record för tabell/kolumn-listan). Använd när de specifika fetch_-verktygen inte täcker det (t.ex. skill_logs, fixed_costs, pa_shifts, study_tasks, erik_payments, learning_goals, training_exercises) eller när du behöver ett id för att redigera/ta bort.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string' },
        id: { type: 'string', description: 'hämta en rad' },
        filters: { type: 'object', description: 'kolumn → exakt värde, t.ex. {"course_id":"…"}' },
        date_from: { type: 'string', description: 'YYYY-MM-DD, på tabellens datumkolumn (date, annars created_at)' },
        date_to: { type: 'string' },
        search: { type: 'object', description: '{column, text} — ilike-sökning' },
        columns: { type: 'string', description: 'kommaseparerat, default *' },
        order_by: { type: 'string' },
        ascending: { type: 'boolean' },
        limit: { type: 'number', description: 'default 50, max 200' },
      },
      required: ['table'],
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
            'create_trip', 'update_trip', 'delete_trip',
            'create_erik_task', 'update_erik_task', 'delete_erik_task',
            'log_training', 'update_training', 'delete_training',
            'log_health', 'update_health', 'delete_health',
            'log_expense', 'update_expense', 'delete_expense',
            'log_income', 'update_income', 'delete_income',
            'log_nutrition', 'log_supplement',
            'create_goal', 'update_goal', 'complete_goal', 'delete_goal', 'update_life_goal',
            'log_study', 'create_course', 'add_exam',
            'log_social', 'create_side_quest', 'update_side_quest',
            'create_adventure', 'update_adventure', 'delete_adventure',
            'add_journal_entry',
            'save_insight', 'update_insight', 'delete_insight',
            'update_friend', 'save_preference', 'update_memory_context',
            'create_record', 'update_record', 'delete_record',
          ],
        },
        data: {
          type: 'object',
          description: 'create_project_task:{project_id,title,description?,priority?,deadline?,status?} | update_project_task:{id,fields} | delete_project_task:{id} | create_trip:{title,countries[],status?,start_date?,end_date?,planning_doc?,budget_sek?} | update_trip:{id,fields} (fields kan innehålla saved_sek = avsatt hittills) | delete_trip:{id} | create_erik_task:{title,description?,deadline?,tag?,priority?} | update_erik_task:{id,fields} | log_training:{date?,session_type(run|gym|walk|other),duration_minutes?,distance_km?,feeling?,steps?,notes?,exercises?:[{name,sets:[{reps,weight_kg}]}] för gympass — ger PR-koll} | log_health:{date?,weight_kg?,sleep_hours?,energy?,steps?,mood?,stress_level?,alcohol_units?} | log_expense:{date?,amount,category,description?} | log_income:{date?,amount,source,description?} | update_income:{id,fields} | log_nutrition:{date?,total_calories?,protein_g?,water_liters?} | log_supplement:{date?,supplement_name,taken?(default true)} | create_goal:{title,category(traning|halsa|ekonomi|plugg|resor|jobb|livet),description?,target_value?,unit?,current_value?,start_value?(nuläget när målet sätts — progress mäts härifrån, ej från 0),direction?(up|down),deadline?,metric?,pinned?} | update_goal:{id,fields} | complete_goal:{id} | delete_goal:{id} | update_life_goal:{key(one_year|three_year|ten_year|monthly_income_goal),value} — fritext-livsmålen i profilen (målvikt = update_goal på body_weight-målet) | log_study:{date?,hours,subject?,course_id?,notes?} | create_course:{name,term?,exam_date?} | add_exam:{course_id,name,exam_date?,notes?} | log_social:{date?,friend_names[],activity?,quality?,notes?} | create_side_quest:{title,description?,category?,difficulty?,status?} | update_side_quest:{id,fields} | create_adventure:{title,description?,date?,location?,category?,rating?} | update_adventure:{id,fields} | delete_adventure:{id} | add_journal_entry:{date?,content,mood?,energy?,sleep_hours?} | save_insight:{insight_text,category,confidence?} | update_insight:{id,insight_text?,category?,confidence?} | delete_insight:{id} | update_friend:{friend_name,new_info} | save_preference:{preference_text,category} | update_memory_context:{context_area,update_text} | GENERISKT (för allt utan egen action): create_record:{table,values} | update_record:{table,id,fields} | delete_record:{table,id} — tabeller(kolumner:typ):\n' + RECORD_SCHEMA,
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
      if (input.type && input.type !== 'all') {
        const t = normalizeSessionType(input.type)
        if (t) q = q.eq('session_type', t)
      }
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
        .select('id,date,weight_kg,body_fat_pct,steps,sleep_hours,sleep_quality,sleep_type,sleep_note,resting_hr,screen_time_minutes,alcohol_units,nicotine,marijuana,caffeine_mg,energy,energy_level,stress_level,mood,retatrutide_dose_mg,source')
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
        if (r.marijuana) parts.push('marijuana')
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
          .select('id,date,amount,source,counts_toward_csn,description')
          .eq('user_id', userId).gte('date', from).lte('date', to).order('date', { ascending: false })
        if (error) throw error
        if (data?.length) {
          const total = data.reduce((s: number, r: any) => s + Number(r.amount || 0), 0)
          results.push(`INKOMSTER (${data.length}, totalt ${Math.round(total).toLocaleString('sv-SE')} kr):\n` + data.map((r: any) => `${r.date} | ${r.amount} kr | ${r.source}${r.description ? ' | ' + r.description : ''} [id:${r.id}]`).join('\n'))
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
        // starts_at is timestamptz — compare against end-of-day or every event
        // ON the last day of the window is excluded (AUDIT.md P2-13).
        supabase.from('schedule_events').select('id,title,event_type,starts_at,ends_at,location').eq('user_id', userId).gte('starts_at', from).lte('starts_at', to + 'T23:59:59').order('starts_at').limit(50),
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
        const { data, error } = await supabase.from('trips').select('id,title,country,city,countries,start_date,end_date,highlights,rating,status,budget_sek,saved_sek,planning_doc,notes').eq('user_id', userId).order('start_date', { ascending: false }).limit(limit)
        if (error) throw error
        if (data?.length) results.push(`RESOR:\n${data.map((r: any) => {
          let savings = ''
          if ((r.status === 'planned' || r.status === 'idea') && r.budget_sek > 0) {
            const saved = Number(r.saved_sek || 0)
            const remaining = Math.max(0, Number(r.budget_sek) - saved)
            savings = ` | sparat:${saved}/${r.budget_sek}kr`
            if (remaining > 0 && r.start_date) {
              const months = (new Date(r.start_date).getTime() - Date.now()) / (30.44 * 86400000)
              if (months >= 0.5) savings += ` (≈${Math.ceil(remaining / months / 100) * 100}kr/mån för att hinna)`
            }
          }
          return `${r.title} | ${r.status} | ${r.countries?.join(', ') || r.country || ''}${r.city ? ', ' + r.city : ''} | ${r.start_date || '?'}→${r.end_date || '?'}${r.rating ? ' | ★' + r.rating : ''}${r.budget_sek ? ' | budget:' + r.budget_sek + 'kr' : ''}${savings}${r.planning_doc ? '\n  Plan: ' + r.planning_doc.slice(0, 200) : ''} [id:${r.id}]`
        }).join('\n')}`)
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
      const [settingsRes, insightsRes, friendsRes, structuredGoalsRes] = await Promise.all([
        supabase.from('user_settings').select('about_me,goals,jarvis_style,jarvis_lang,jarvis_personality').eq('user_id', userId).maybeSingle(),
        (() => {
          let q = supabase.from('jarvis_insights').select('id,insight,category,confidence,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(limit)
          if (input.search_keyword) q = q.ilike('insight', `%${input.search_keyword}%`)
          return q
        })(),
        input.include_friends ? supabase.from('friends').select('id,name,nickname,relationship,location,notes,last_contact_date').eq('user_id', userId).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
        // Resilient: the `goals` table gains columns in post-deploy 05 — until
        // that migration runs this query 400s, and it must not fail the tool.
        supabase.from('goals').select('id,title,category,description,metric,unit,target_value,current_value,direction,deadline,status,pinned').eq('user_id', userId).order('pinned', { ascending: false }).order('sort_order', { ascending: true }).limit(50).then((r: any) => r, () => ({ data: [], error: null })),
      ])
      const s = settingsRes.data || {}
      const goals = s.goals ? JSON.stringify(s.goals, null, 2) : '{}'
      const insights = (insightsRes.data || []).map((i: any) => `[${i.category} ${i.confidence}%] ${i.insight} [id:${i.id}]`).join('\n')
      const friends = (friendsRes.data || []).map((f: any) => `${f.name}${f.nickname ? '/'+f.nickname : ''} | ${f.relationship || ''}${f.location ? ' | '+f.location : ''}${f.last_contact_date ? ' | senast:'+f.last_contact_date : ''}${f.notes ? ' | '+f.notes.slice(0,120) : ''} [id:${f.id}]`).join('\n')
      const gRows = (structuredGoalsRes.data || [])
      const structuredGoals = gRows.length
        ? gRows.map((g: any) => {
            const cur = g.target_value != null ? ` ${g.current_value ?? '?'}/${g.target_value}${g.unit ? ' ' + g.unit : ''}` : ''
            return `[${g.status}${g.pinned ? ' ★' : ''}] ${g.title}${g.category ? ' (' + g.category + ')' : ''}${cur}${g.deadline ? ' → ' + g.deadline : ''}${g.description ? ' — ' + g.description : ''} [id:${g.id}]`
          }).join('\n')
        : '—'
      return `PROFIL:\n${s.about_me || '—'}\n\nLIVSMÅL (fritext):\n${goals}\n\nSTRUKTURERADE MÅL (${gRows.length}):\n${structuredGoals}\n\nMINNEN (${insightsRes.data?.length || 0}${input.search_keyword ? `, sök:"${input.search_keyword}"` : ''}):\n${insights || '—'}\n\nVÄNNER:\n${friends || '—'}`
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
        const label = r.role === 'user' ? 'Användare' : 'Jarvis'
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

    if (toolName === 'fetch_records') {
      const table = String(input.table || '')
      const cols = recordTable(table)
      const dateCol = cols.has('date') ? 'date' : 'created_at'
      let q = supabase.from(table).select(input.columns || '*').eq('user_id', userId)
      if (input.id) q = q.eq('id', input.id)
      for (const [k, v] of Object.entries(input.filters || {})) {
        if (!cols.has(k) && k !== 'created_at') throw new Error(`Okänd kolumn ${table}.${k}`)
        q = q.eq(k, v)
      }
      if (input.date_from) q = q.gte(dateCol, input.date_from)
      if (input.date_to) q = q.lte(dateCol, dateCol === 'date' ? input.date_to : input.date_to + 'T23:59:59')
      if (input.search?.column && input.search?.text) {
        if (!cols.has(input.search.column)) throw new Error(`Okänd kolumn ${table}.${input.search.column}`)
        q = q.ilike(input.search.column, `%${input.search.text}%`)
      }
      const orderCol = input.order_by && (cols.has(input.order_by) || input.order_by === 'created_at') ? input.order_by : dateCol
      q = q.order(orderCol, { ascending: !!input.ascending }).limit(asLimit(input.limit, 50, 200))
      const { data, error } = await q
      if (error) throw error
      return capToolResult({ table, count: data?.length || 0, rows: data || [] })
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
          const { data: sess, error } = await supabase.from('training_sessions')
            .insert({ user_id: userId, date: d.date || todayISO(), session_type: normalizeSessionType(d.session_type) || 'other', duration_minutes: clean(d.duration_minutes), distance_km: clean(d.distance_km), time_seconds: clean(d.time_seconds), pace_per_km: clean(d.pace_per_km), feeling: clean(d.feeling), notes: d.notes || '', source: 'jarvis' })
            .select('id').single()
          if (error) throw error
          const prs: string[] = []
          // Optional per-exercise detail: [{name, sets:[{reps,weight_kg}]}].
          // Insert training_exercises so the session shows its lifts in the app,
          // and bump personal_records for weighted lifts (heaviest weight wins —
          // the same rule src/lib/exercises.js uses for non-bodyweight moves).
          if (Array.isArray(d.exercises) && d.exercises.length && sess?.id) {
            const rows: any[] = []
            for (const ex of d.exercises) {
              const name = String(ex?.name || '').trim()
              if (!name || !Array.isArray(ex.sets)) continue
              ex.sets.forEach((s: any, i: number) => {
                rows.push({ user_id: userId, session_id: sess.id, exercise_name: name, set_number: i + 1, reps: clean(s?.reps) != null ? Number(s.reps) : null, weight_kg: clean(s?.weight_kg) != null ? Number(s.weight_kg) : null, is_dropset: !!s?.is_dropset })
              })
              const weighted = ex.sets.filter((s: any) => Number(s?.weight_kg) > 0)
              if (weighted.length) {
                const bestW = Math.max(...weighted.map((s: any) => Number(s.weight_kg)))
                const bestSet = weighted.find((s: any) => Number(s.weight_kg) === bestW)
                const { data: existing } = await supabase.from('personal_records').select('id,weight_kg').eq('user_id', userId).eq('exercise_name', name).limit(1)
                const prev = existing?.[0]
                if (!prev || bestW > Number(prev.weight_kg || 0)) {
                  const payload = { user_id: userId, exercise_name: name, weight_kg: bestW, reps: clean(bestSet?.reps) != null ? Number(bestSet.reps) : null, date: d.date || todayISO() }
                  if (prev?.id) await supabase.from('personal_records').update(payload).eq('id', prev.id)
                  else await supabase.from('personal_records').insert(payload)
                  prs.push(`${name} ${bestW}kg`)
                }
              }
            }
            if (rows.length) {
              const { error: exErr } = await supabase.from('training_exercises').insert(rows)
              if (exErr) throw exErr
            }
          }
          const sessDate = d.date || todayISO()
          // Mirror steps into health_logs the way the Träning "annat pass" form does.
          if (clean(d.steps) != null) {
            await supabase.from('health_logs').upsert({ user_id: userId, date: sessDate, steps: Number(d.steps) }, { onConflict: 'user_id,date' })
          }
          // Same score_training formula as src/pages/Traning.jsx updateTrainingScore.
          if (clean(d.feeling) != null) {
            await upsertDailyScore(supabase, userId, sessDate, { score_training: Math.min(50 + (Number(d.feeling) / 10) * 50, 100) })
          }
          result = `Träningspass loggat.${prs.length ? ` Nytt PR: ${prs.join(', ')}.` : ''}`
          break
        }
        case 'log_health': {
          const date = d.date || todayISO()
          const hf: any = {}
          for (const k of ['weight_kg','sleep_hours','energy','energy_level','steps','alcohol_units','nicotine','marijuana','mood','stress_level','sleep_quality','caffeine_mg']) if (d[k] != null) hf[k] = d[k]
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
          const { error } = await supabase.from('income_logs').insert({ user_id: userId, date: d.date || todayISO(), amount: Number(d.amount || 0), source: d.source || 'Övrigt', description: d.description ?? d.notes ?? '' })
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
          const fields = { ...d.fields }
          if (fields.session_type) fields.session_type = normalizeSessionType(fields.session_type) || 'other'
          const { error } = await supabase.from('training_sessions').update(fields).eq('id', d.id).eq('user_id', userId)
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
        case 'update_income': {
          if (!d.id || !d.fields) throw new Error('Saknar id/fields')
          const { error } = await supabase.from('income_logs').update(d.fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Inkomst uppdaterad.'
          break
        }
        case 'delete_trip': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('trips').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Resa raderad.'
          break
        }
        case 'log_nutrition': {
          const date = d.date || todayISO()
          const nf: any = {}
          for (const k of ['total_calories', 'protein_g', 'water_liters']) if (d[k] != null) nf[k] = Number(d[k])
          if (!Object.keys(nf).length) throw new Error('Inget att logga (kalorier/protein/vatten)')
          const { error } = await supabase.from('nutrition_logs').upsert({ user_id: userId, date, ...nf }, { onConflict: 'user_id,date' })
          if (error) throw error
          result = `Näring loggad för ${date}.`
          break
        }
        case 'log_supplement': {
          if (!d.supplement_name) throw new Error('Saknar supplement_name')
          const date = d.date || todayISO()
          const { error } = await supabase.from('supplement_logs').upsert(
            { user_id: userId, date, supplement_name: d.supplement_name, taken: d.taken !== false, updated_at: new Date().toISOString() },
            { onConflict: 'user_id,date,supplement_name' },
          )
          if (error) throw error
          result = `${d.supplement_name} markerad som ${d.taken !== false ? 'tagen' : 'ej tagen'} (${date}).`
          break
        }
        case 'create_goal': {
          if (!d.title) throw new Error('Saknar title')
          const cats = ['traning', 'halsa', 'ekonomi', 'plugg', 'resor', 'jobb', 'livet']
          const category = cats.includes(d.category) ? d.category : 'livet'
          // Baseline: progress is measured from start_value, not zero. Prefer an
          // explicit start_value, else the current value the user gave. Metric
          // goals with neither get backfilled client-side on next load.
          const startVal = clean(d.start_value) != null ? Number(d.start_value)
            : clean(d.current_value) != null ? Number(d.current_value) : null
          const { error } = await supabase.from('goals').insert({
            user_id: userId, title: String(d.title).trim(), category,
            description: d.description || null, metric: d.metric || null, unit: d.unit || null,
            target_value: clean(d.target_value) != null ? Number(d.target_value) : null,
            current_value: clean(d.current_value) != null ? Number(d.current_value) : null,
            start_value: startVal, baseline_date: startVal != null ? todayISO() : null,
            direction: d.direction === 'down' ? 'down' : 'up',
            deadline: clean(d.deadline), status: 'active', pinned: !!d.pinned,
          })
          if (error) throw error
          result = `Mål "${d.title}" skapat (${category}).`
          break
        }
        case 'update_goal': {
          if (!d.id || !d.fields) throw new Error('Saknar id/fields')
          const fields = { ...d.fields }
          if (fields.status === 'done' && !('completed_at' in fields)) fields.completed_at = new Date().toISOString()
          if (fields.status && fields.status !== 'done') fields.completed_at = null
          const { error } = await supabase.from('goals').update(fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Mål uppdaterat.'
          break
        }
        case 'complete_goal': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('goals').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Mål markerat som uppnått. 🎯'
          break
        }
        case 'delete_goal': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('goals').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Mål raderat.'
          break
        }
        case 'update_life_goal': {
          const ALLOWED = ['one_year', 'three_year', 'ten_year', 'monthly_income_goal']
          if (!ALLOWED.includes(d.key)) throw new Error('Okänd livsmåls-nyckel — använd one_year/three_year/ten_year/monthly_income_goal (målvikt ändras med update_goal på body_weight-målet)')
          if (d.value == null || d.value === '') throw new Error('Saknar value')
          // user_settings.goals is a shared JSONB blob — merge onto a fresh read
          // so this doesn't wipe another screen's keys (AUDIT P0-5).
          const { data: row } = await supabase.from('user_settings').select('goals').eq('user_id', userId).maybeSingle()
          const goals = { ...(row?.goals || {}), [d.key]: d.value }
          const { error } = await supabase.from('user_settings')
            .upsert({ user_id: userId, goals, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          if (error) throw error
          result = `Livsmål (${d.key}) uppdaterat.`
          break
        }
        case 'log_study': {
          if (d.hours == null) throw new Error('Saknar hours')
          const { error } = await supabase.from('study_sessions').insert({
            user_id: userId, date: d.date || todayISO(), hours: Number(d.hours),
            subject: d.subject || null, course_id: clean(d.course_id), notes: d.notes || null,
          })
          if (error) throw error
          result = `${d.hours}h plugg loggat${d.subject ? ' (' + d.subject + ')' : ''}.`
          break
        }
        case 'create_course': {
          if (!d.name) throw new Error('Saknar name')
          const { error } = await supabase.from('courses').insert({ user_id: userId, name: d.name, term: d.term || null, exam_date: clean(d.exam_date), active: true })
          if (error) throw error
          result = `Kurs "${d.name}" skapad.`
          break
        }
        case 'add_exam': {
          if (!d.course_id || !d.name) throw new Error('Saknar course_id/name')
          const { error } = await supabase.from('course_exams').insert({ user_id: userId, course_id: d.course_id, name: d.name, exam_date: clean(d.exam_date), notes: d.notes || null })
          if (error) throw error
          result = `Examination "${d.name}" tillagd.`
          break
        }
        case 'log_social': {
          const { error } = await supabase.from('social_interactions').insert({
            user_id: userId, date: d.date || todayISO(),
            friend_names: Array.isArray(d.friend_names) ? d.friend_names : (d.friend_names ? [d.friend_names] : []),
            activity: d.activity || '', quality: clean(d.quality), notes: d.notes || '', source: 'jarvis',
          })
          if (error) throw error
          result = 'Social interaktion loggad.'
          break
        }
        case 'create_side_quest': {
          if (!d.title) throw new Error('Saknar title')
          const row: any = { user_id: userId, title: d.title, description: d.description || '', category: d.category || 'övrigt', difficulty: d.difficulty || null, suggested_by: 'jarvis' }
          if (d.status) row.status = d.status
          const { error } = await supabase.from('side_quests').insert(row)
          if (error) throw error
          result = `Side quest "${d.title}" skapad.`
          break
        }
        case 'update_side_quest': {
          if (!d.id || !d.fields) throw new Error('Saknar id/fields')
          const fields = { ...d.fields }
          if (fields.status === 'done' && !('completed_at' in fields)) fields.completed_at = new Date().toISOString()
          const { error } = await supabase.from('side_quests').update(fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Side quest uppdaterad.'
          break
        }
        case 'update_adventure': {
          if (!d.id || !d.fields) throw new Error('Saknar id/fields')
          const { error } = await supabase.from('adventures').update(d.fields).eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Upplevelse uppdaterad.'
          break
        }
        case 'delete_adventure': {
          if (!d.id) throw new Error('Saknar id')
          const { error } = await supabase.from('adventures').delete().eq('id', d.id).eq('user_id', userId)
          if (error) throw error
          result = 'Upplevelse raderad.'
          break
        }
        case 'add_journal_entry': {
          if (!d.content) throw new Error('Saknar content')
          const date = d.date || todayISO()
          const { data: existing } = await supabase.from('journal_entries').select('id').eq('user_id', userId).eq('date', date).limit(1).maybeSingle()
          if (existing?.id) { result = `Journalanteckning finns redan för ${date} — redigera den i appen istället.`; break }
          const { error } = await supabase.from('journal_entries').insert({
            user_id: userId, date, content: d.content,
            mood: clean(d.mood), energy: clean(d.energy), sleep_hours: clean(d.sleep_hours),
          })
          if (error) throw error
          // Mirror sleep/energy to health_logs the same way the Journal page does,
          // so the two surfaces don't drift.
          if (d.sleep_hours != null || d.energy != null) {
            const hf: any = { user_id: userId, date, source: 'journal' }
            if (d.sleep_hours != null) hf.sleep_hours = Number(d.sleep_hours)
            if (d.energy != null) { hf.energy = Number(d.energy); hf.energy_level = Number(d.energy) }
            await supabase.from('health_logs').upsert(hf, { onConflict: 'user_id,date' })
          }
          // Same score formulas as src/pages/Journal.jsx updateJournalScore.
          const scorePatch: Record<string, number> = { score_journal: Math.min(75 + Math.min(String(d.content).length / 5, 25), 100) }
          if (d.energy != null) scorePatch.score_health = (Number(d.energy) / 10) * 100
          await upsertDailyScore(supabase, userId, date, scorePatch)
          result = `Journalanteckning sparad för ${date}.`
          break
        }
        case 'create_record': {
          const values = recordValues(d.table, d.values)
          const { data: row, error } = await supabase.from(d.table).insert({ ...values, user_id: userId }).select('id').single()
          if (error) throw error
          result = `Skapade rad i ${d.table} (id ${row?.id}).`
          if (d.table === 'employments' && row?.id) result += await repriceEmployment(supabase, userId, row.id)
          break
        }
        case 'update_record': {
          if (!d.id) throw new Error('update_record kräver id — hämta det först med fetch_records.')
          const fields = recordValues(d.table, d.fields)
          const { data: rows, error } = await supabase.from(d.table).update(fields).eq('id', d.id).eq('user_id', userId).select('id')
          if (error) throw error
          if (!rows?.length) throw new Error(`Ingen rad med id ${d.id} i ${d.table}.`)
          result = `Uppdaterade ${d.table} (id ${d.id}): ${Object.keys(fields).join(', ')}.`
          if (d.table === 'employments') result += await repriceEmployment(supabase, userId, d.id)
          break
        }
        case 'delete_record': {
          recordTable(d.table)
          if (!d.id) throw new Error('delete_record kräver id — hämta det först med fetch_records.')
          const { data: rows, error } = await supabase.from(d.table).delete().eq('id', d.id).eq('user_id', userId).select('id')
          if (error) throw error
          if (!rows?.length) throw new Error(`Ingen rad med id ${d.id} i ${d.table}.`)
          result = `Raderade rad i ${d.table} (id ${d.id}).`
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
//
// 2026-09-15 — split into two parts (`instructions` + `dynamic`) instead of
// one combined string, specifically so the caller can put each in its OWN
// prompt-cache breakpoint. Previously this was one string with one
// cache_control marker, which meant the ENTIRE prompt — including the
// persona/coaching/tool-routing instructions below, which never change —
// was billed at full price every time ANY per-user value changed (a new
// insight, a refreshed NU context, even the display name). Splitting lets
// `instructions` (fully static per user — userName/style/lang are stable
// across a user's own messages) cache essentially indefinitely, while only
// `dynamic` (profile/memory/friends/NU) is re-billed when it actually
// changes. See the call site for the even more important fix this pairs
// with: pulling the ever-changing "TID:" timestamp OUT of both cached
// blocks entirely (it used to be embedded inside `context`/NU, which busted
// the cache on literally every single message).
// ─────────────────────────────────────────────
function buildSystemPrompt(context: string, settings: any, contentBlock: string, insights: any[] = [], friends: any[] = []): { instructions: string; dynamic: string } {
  const s = settings || {}
  const g = s.goals || {}
  // Phase 16: address the actual user, never a hardcoded "Sigge". Falls back to
  // a neutral noun when no display_name is set yet.
  const userName = (typeof s.display_name === 'string' && s.display_name.trim()) ? s.display_name.trim() : 'användaren'

  // PROFIL (incl. about_me, which can be ~40k chars) is stable for weeks, so
  // it lives in the 1h-cached `instructions` block — not in `dynamic`, which is
  // rewritten every time MINNE/NU changes (2026-09-29 cost pass: it made every
  // context refresh re-bill ~14k tokens at the cache-write rate).
  const profileLines = [
    s.display_name && `Namn: ${s.display_name}`,
    // Condensed profile when one exists (post_deploy_26) — the full text is
    // one fetch_memory_goals call away.
    s.about_me_summary
      ? `Profil (komprimerad ur användarens egen ${String(s.about_me || '').length} tecken långa text – hela texten via fetch_memory_goals när du behöver nyans eller ett exakt citat):\n${s.about_me_summary}`
      : (s.about_me && `Profil: ${s.about_me}`),
    g.one_year && `1år: ${g.one_year}`,
    g.three_year && `3år: ${g.three_year}`,
    g.ten_year && `10år: ${g.ten_year}`,
    g.monthly_income_goal && `Inkomstmål: ${g.monthly_income_goal} kr/mån`,
    // No weight goal from settings here: the Mål-page goal (AKTIVA MÅL in NU)
    // is the only målvikt (user call 2026-09-29).
    s.jarvis_personality && `Instruktion: ${s.jarvis_personality}`,
  ].filter(Boolean).join('\n')

  const style = s.jarvis_style != null
    ? (s.jarvis_style < 30 ? 'diplomatisk' : s.jarvis_style < 60 ? 'balanserad' : s.jarvis_style < 85 ? 'direkt' : 'brutalt ärlig')
    : 'direkt'

  const insightLines = insights.map((i: any) => `${i.category}: ${i.insight.slice(0, 80)}`).join('\n')
  const friendLines = friends.map((f: any) => `${f.name}${f.relationship ? ' ('+f.relationship+')' : ''}`).join(', ')

  const instructions = `Du är Jarvis – ${userName}s personliga AI-coach/assistent i MaxxIt. Stil: ${style}. Datadriven, konkret, aldrig generisk. Anta inget om användarens yrke, studier eller livssituation som inte framgår av PROFIL/MINNE/NU nedan.${s.jarvis_lang && s.jarvis_lang !== 'auto' ? ' Språk: '+s.jarvis_lang+'.' : ''}

VEM DU ÄR – din självbild:
- Roll: ${userName} driver sitt liv som ett företag; du är hens stabschef och coach. Inte ett uppslagsverk, inte en ja-sägare – en långsiktig partner som känner hen, minns och följer upp.
- Uppdrag: hjälpa ${userName} bli en bättre version av sig själv över alla domäner – hälsa, sömn, träning, studier, jobb, ekonomi, relationer, resor, mål och sidoprojekt – genom att se mönster hen inte ser själv och göra nästa steg konkret.
- Dina mål (så mäter du dig själv): att tiers och mål faktiskt rör sig, att loggningen blir komplett nog att lita på, att experiment slutförs, att veckans FOKUS blir gjort. Råd som inte leder till handling räknas inte.
- Förmågor: du läser all data i appen (fetch_*-verktygen, fetch_records) och kan lägga till, ändra och ta bort data överallt (execute_action). Du har ett långtidsminne (insikter) som du själv underhåller. Du ser tier-systemet (MAXX INTELLIGENS), förräknade mönster, veckans signaler, pågående experiment och veckans fokus i NU. Du kan starta och avsluta n-of-1-experiment och skapa mål med automatisk progress. Du skriver en veckorapport varje söndag och en kort brief när hen öppnar appen första gången för dagen.
- Gränser: du ser bara det som loggats – saknas data, säg det istället för att gissa. Ingen internetåtkomst, du kan inte skicka meddelanden eller notiser, och du räknar aldrig själv om score/tiers. Du är inte läkare eller licensierad rådgivare: ge ärlig information och flagga risker (mediciner, substanser, sömnbrist), men hänvisa till vården när något är akut eller kräver en medicinsk bedömning.
- Bilagor: användaren kan bifoga PDF eller bild i chatten (avtal, lönespec, kvitto, schema, provsvar, kursmaterial, skärmdump). Bilagan finns bara i meddelandet den skickas med – nästa tur ser du bara texten – så läs ut allt relevant och spara det med rätt verktyg i samma svar. Redovisa sedan kort vad du sparade/ändrade (gammalt → nytt) och vad som var otydligt i dokumentet. Gissa aldrig belopp eller datum som inte står där.
- Sanningskällor: AKTIVA MÅL (Mål-sidan) är användarens aktuella mål – målvikt, deadlines och målvärden därifrån gäller alltid före siffror i profiltexten, som kan vara inaktuella. Ändra ett mål med update_goal, inte i profilen.
- Skyldigheter: sanning före bekvämlighet; siffror före åsikter; fakta, hypotes och gissning hålls isär. Följ upp det ni kommit överens om (FOKUS, experiment, mål med deadline) utan att tjata. Påpeka loggningsluckor som gör analysen osäker, kort. Bekräfta innan du raderar. Hitta aldrig på siffror. Håll ${userName}s data privat. Rätta dig själv när du haft fel.

COACHNING – tänk som en vass personlig coach som känner ${userName}, inte en generisk life-tracker:
- Utgå från hens egna siffror och trender och citera dem. Inga generella råd som gäller vem som helst.
- Koppla ihop domäner: sömn↔tier/prestanda, ekonomi↔resmål, pluggbelastning↔träning↔sömn, jobbtimmar↔energi. Leta ledande indikatorer, inte bara nuläge. MÖNSTER-blocket i NU (om det finns) är förräknade kopplingar ur hens historik – bygg vidare på dem.
- SIGNALER-blocket i NU (om det finns) är förräknade risker/möjligheter för veckan. Ta upp de viktigaste oombedd i brief/veckosvar, men tjata inte om samma sak varje gång.
- MAXX INTELLIGENS i NU är det objektiva tier/score-systemet: använd tier, flaskhals och rank-up-plan när hen frågar om nivå eller hur hen tar sig vidare. Du räknar aldrig själv om score.
- Skilj tydligt på vad datan visar (fakta), vad den antyder (hypotes) och vad du gissar.
- Avsluta coachning med EN konkret, mätbar nästa åtgärd för idag eller denna vecka.
- Lyft framsteg, inte bara brister – resan ska vara värd att gå, inte bara mätas.

LÖN & TJÄNSTER: Varje jobb är en rad i employments (Jobb → Tjänster); PA-pass (pa_shifts) kopplas via employment_id och lönen räknas automatiskt ur tjänstens regler – ändra reglerna, aldrig estimated_pay. Fält: hourly_rate (kr/h), ob_rules = hela listan [{label, kr, days:[0-6] där 0=sön, from:"HH:MM", to:"HH:MM" (to ≤ from = över midnatt, "00:00"–"24:00" = hela dygnet), holiday:true för storhelg, exclusive:true om regeln ersätter alla andra OB när den gäller}], ob_mode "sum" (tilläggen läggs ihop) eller "highest" (bara det högsta), jour_rate/jour_from/jour_to (ersätter timlönen på sovpass), jour_ob (OB även under jour), holiday_pay_pct (semesterersättning i %), tax_rate (decimal, t.ex. 0.27), match_keywords (ord i kalendertiteln som gör ett event till ett pass). Avtal/lönespec bifogat → hämta tjänsten med fetch_records(employments), skicka sedan update_record med hela nya ob_rules-listan (eller create_record om jobbet saknas). Ur en lönespec: tax_rate = dragen skatt / bruttolön; jämför postrader (timlön, OB-typer, jour, semesterersättning) med reglerna och rätta skillnader.

DATUM: Ett "TID:"-block sist i denna systemprompt (efter NU) är exakt nu. Meddelanden i historiken som börjar med [ÅÅÅÅ-MM-DD] skrevs det datumet, inte idag – räkna "imorgon", "nästa vecka", "om 3 dagar" osv från när meddelandet skrevs, inte från idag, om inget annat sägs. Utan datumtagg = idag.

VERKTYG – hämta NÄR data saknas, INTE om svaret ryms ovan. Hämta parallellt vid flera domäner. Ej samma data 2x.
Brief/kväll/vecka → journal+health+workouts+scores. Mående → fetch_journal(summaries_only=true för trend, full för djup). Pass/styrka/löp → fetch_workouts. PR/rekord → fetch_workouts(include_prs=true). Kosttillskott/medicin/retatrutide → fetch_health. Schema → fetch_calendar. Ekonomi/sparande/nettoförmögenhet/tillgångar → fetch_economy. Resor → fetch_experiences. Tasks → fetch_tasks. Djupare minne/sök minne → fetch_memory_goals(search_keyword). Gammal chatt/"vad sa vi om X" → fetch_chat_history(search_keyword). Journal-sök → fetch_journal(search_keyword).

SPARA TYST (execute_action, nämn ej): faktum om användaren → save_insight | uppdatera fel insikt → update_insight(id,insight_text) | ta bort inaktuell insikt → delete_insight(id) | väninfo → update_friend | korrigering/ny sanning → update_memory_context(context_area,update_text) | preferens → save_preference. Spara 1-2 insikter/konversation om något viktigt framkommit. Kolla MINNE nedan innan du sparar – spara inte om det redan framgår. Rätta aktivt felaktiga minnen när användaren korrigerar dig.
PR/rekord (styrka+löp) → fetch_workouts(include_prs=true) ger all-time PR-tavla.

ÅTGÄRDER: execute_action direkt utan bekräftelse. Saknas ID → hämta först. delete → bekräfta vad raderas.
Du kan läsa, lägga till, ändra och ta bort data i HELA appen när användaren ber om det. Använd den specifika actionen när den finns (log_training ger PR-koll, create_goal kopplar metric osv.); för allt annat create_record/update_record/delete_record + fetch_records (t.ex. journal, pluggpass, kurser/tentor, lärandemål & mastery, PA-pass, kalender, färdighetsloggar/kort, fasta kostnader, tillgångar, Erik-betalningar, studieuppgifter, gymset). Redigera/radera: hämta id först, ändra bara de fält som efterfrågats. EXPERIMENT (n-of-1): när användaren vill testa om en förändring hjälper, skapa en rad i experiments via create_record — outcome_metric/lever_metric ∈ sleep|energy|mood|steps|weight|alcohol|study|train|skill|paHours, direction up|down, lever_op >=|<=, duration_days (default 14). Appen jämför automatiskt mot de 14 dagarna innan; EXPERIMENT-blocket i NU visar läget. Avsluta = update_record status:'done', ended_at:nu. Logga på det datum användaren säger (default idag). När du skapar ett mål: sätt category till rätt domän och koppla metric om ett sådant passar (t.ex. body_weight, bench_pr, net_worth, study_hours_7d) så progressen uppdateras automatiskt. Efter en skrivning: bekräfta kort vad som sparades och var det syns.

LÄNKAR: När du hänvisar till en sida, länka med markdown så användaren kan klicka dit direkt: [Träning](/traning), [Hälsa](/halsa), [Ekonomi](/ekonomi), [Plugg](/plugg), [Jobb](/jobb), [Kalender](/kalender), [Insights](/insights), [Upplevelser](/upplevelser), [Journal](/journal), [Mål](/mal), [Dashboard](/). Max 1–2 länkar/svar, bara när det tillför.

Svar på användarens språk. Kort.

PROFIL: ${profileLines || '–'}`

  const dynamic = `MINNE (senaste 20): ${insightLines || '–'}

VÄNNER: ${friendLines || '–'}

NU: ${context || '–'}${contentBlock ? '\n'+contentBlock : ''}`

  return { instructions, dynamic }
}

// Cache breakpoint on the LAST message block (2026-09-29, cost pass). Inside
// the tool loop every iteration resends the whole conversation plus all tool
// results so far; with this marker iteration N reads iterations 1..N-1 from
// cache (0.1x) instead of re-billing them. Returns a copy — the stored message
// array never carries markers, so exactly one message breakpoint exists per
// request (tools + instructions + dynamic + this = the 4-breakpoint max).
function withMessageBreakpoint(msgs: any[]): any[] {
  if (!msgs.length) return msgs
  const out = msgs.slice(0, -1)
  const last = msgs[msgs.length - 1]
  const blocks = typeof last.content === 'string'
    ? [{ type: 'text', text: last.content || ' ' }]
    : [...last.content]
  const i = blocks.length - 1
  blocks[i] = { ...blocks[i], cache_control: { type: 'ephemeral' } }
  out.push({ ...last, content: blocks })
  return out
}

// ─────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────
serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { messages = [], context = '', examFileId, materialIds, stream = false, systemPrompt, brief = false, feature = null, model_override = null, thinking_override = null } = await req.json()
    // A caller-supplied systemPrompt marks a one-shot STRUCTURED-EXTRACTION call
    // (journal analysis, weekly report, side-quests, trip budget) rather than a
    // chat turn. In that mode we use the caller's prompt verbatim and disable the
    // agentic tools/persona so the model returns exactly what was asked for (e.g.
    // raw JSON) instead of conversational coaching. Fixes journal analyses never
    // saving because the JSON-only instruction was previously dropped.
    const overrideSystem = (typeof systemPrompt === 'string' && systemPrompt.trim()) ? systemPrompt.trim() : null

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

    // Fetch settings, insights, friends, and optional content in parallel.
    // display_name is canonical on `profiles` (Phase 16) — not user_settings.
    const [settingsResult, profileResult, insightsResult, friendsResult, contentResult] = await Promise.all([
      user ? supabase.from('user_settings').select('about_me,about_me_summary,goals,jarvis_style,jarvis_lang,jarvis_personality').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('jarvis_insights').select('insight,category').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
      user ? supabase.from('friends').select('name,relationship').eq('user_id', user.id).order('created_at', { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
      (async () => {
        let block = ''
        // SECURITY: `supabase` here is the per-request RLS client (getAuthedUser
        // above), so RLS already scopes these reads to the caller. The explicit
        // `.eq('user_id', user.id)` is defense-in-depth — it keeps the query
        // correct even if an RLS policy is ever loosened. Gated on `user` so
        // nothing runs when unauthenticated.
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

    const mergedSettings = { ...(settingsResult.data || {}), display_name: profileResult.data?.display_name || null }
    // The frontend prepends a "TID: <now>\n" line to `context` on every send
    // (Jarvis.jsx) so the model always knows the exact current time even
    // when the rest of the context is up to 5 minutes stale (client-side
    // cache). Pull it back out here — it must NOT end up inside a cached
    // system block, or it busts prompt caching on every single message (see
    // buildSystemPrompt's header comment and the cachedSystem construction
    // below).
    const tidMatch = /^(TID:[^\n]*)\n?/.exec(context || '')
    const tidLine = tidMatch ? tidMatch[1] : null
    const contextWithoutTid = tidMatch ? context.slice(tidMatch[0].length) : context

    // Tiered history for CHAT: recent 6 messages at 2000 chars, older 8 at
    // 600. Extraction calls (overrideSystem) pass their messages through
    // untouched — they carry whole documents: this used to cut a 40k-char
    // profile / long journal entry at 2000 chars, and String() turned PDF
    // content arrays into "[object Object]", so every PDF extraction since
    // 2026-06-09 returned nothing (2026-09-29 fix). Block arrays are never
    // stringified, in either mode.
    const allMsgs = (messages || []).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
    const cap = (m: any, n: number) => ({ role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, n) : (m.content || '') })
    const formattedMessages = overrideSystem
      ? allMsgs.map((m: any) => ({ role: m.role, content: m.content }))
      : [
          ...allMsgs.slice(-14, -6).map((m: any) => cap(m, 600)),
          ...allMsgs.slice(-6).map((m: any) => cap(m, 2000)),
        ]

    let currentMessages = [...formattedMessages]
    let finalText = ''
    let savedMemory = false
    let executedAction = false
    const calledTools = new Set<string>()

    // Prompt caching: the static TOOLS array and the per-request system prompt are
    // identical across all iterations of the agentic loop below. Marking a cache
    // breakpoint on the last tool definition caches the whole tools block, and
    // wrapping the system prompt in a cache-marked text block caches it too.
    // Render order is tools -> system -> messages, so iterations 2-8 (and repeat
    // requests within the 5-min TTL) read this prefix from cache (~0.1x cost)
    // instead of re-billing the full system+tools tokens every time.
    // 1-hour TTL on the static prefix (tools + instructions, ~8k tokens):
    // chat turns are minutes apart while the user reads/types, so the default
    // 5-min entry kept expiring and the whole prefix was re-written at 1.25x.
    // A 1h write costs 2x once and every return within the hour reads at 0.1x.
    // (Longer TTLs must precede shorter ones — dynamic/messages stay 5 min.)
    const cachedTools = TOOLS.map((t: any, i: number) =>
      i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral', ttl: '1h' } } : t
    )
    // Two cache breakpoints for normal chat instead of one (2026-09-15):
    //   1. `instructions` — persona/coaching/tool-routing rules. Identical
    //      for a given user's own style/lang settings across ALL their
    //      messages, so this now stays cached basically indefinitely
    //      instead of being re-billed whenever PROFIL/MINNE/NU changes.
    //   2. `dynamic` — PROFIL/MINNE/VÄNNER/NU. Genuinely changes (new
    //      insight, refreshed context) but far less often than every
    //      message — this is its own cache-eligible block now instead of
    //      being fused with the static instructions.
    // The extracted `tidLine` goes in a THIRD, uncached block at the end —
    // it changes every message by design, but since it's now its own tiny
    // block, it no longer busts the two cached blocks before it (blocks
    // after the last cache_control marker don't affect earlier breakpoints).
    // In extraction/structured-output mode (overrideSystem) none of this
    // applies — that's a one-shot call, not iterative chat, so one plain
    // cached block is fine as before.
    // Extraction mode: course material / old exam (StudyModal) goes FIRST as
    // its own cached block — it is large and identical for a whole study
    // session, while the caller's prompt after it changes (mastery updates).
    // Before 2026-09-29 contentResult was fetched but never sent in this mode,
    // so the study tutor never actually saw the uploaded material.
    const cachedSystem = overrideSystem
      ? [
          ...(contentResult ? [{ type: 'text', text: contentResult.trim(), cache_control: { type: 'ephemeral' } }] : []),
          { type: 'text', text: overrideSystem, cache_control: { type: 'ephemeral' } },
        ]
      : (() => {
          const { instructions, dynamic } = buildSystemPrompt(contextWithoutTid, mergedSettings, contentResult, insightsResult.data || [], friendsResult.data || [])
          return [
            { type: 'text', text: instructions, cache_control: { type: 'ephemeral', ttl: '1h' } },
            { type: 'text', text: dynamic, cache_control: { type: 'ephemeral' } },
            ...(tidLine ? [{ type: 'text', text: tidLine }] : []),
          ]
        })()
    // In extraction mode, omit tools entirely so the model can't enter the tool
    // loop and just answers (JSON). Normal chat keeps the full tool set.
    const effectiveTools = overrideSystem ? undefined : cachedTools
    // Proactive daily brief: answer from the NU context (MÖNSTER, SIGNALER,
    // MAXX INTELLIGENS, goals are already in it) instead of a 3-5 iteration
    // fetch loop every morning. Done as an uncached tail instruction, NOT
    // tool_choice none (with Sonnet 4.6 that returned an empty content array),
    // and tools stay in the prefix so the brief warms the 1h cache for the chat.
    const briefLine = brief && !overrideSystem
      ? 'BRIEF-LÄGE: svara direkt utifrån NU-kontexten ovan i ett enda svar – anropa inga verktyg.'
      : null
    if (briefLine) cachedSystem.push({ type: 'text', text: briefLine })
    const usage = newUsage()
    const usageFeature = brief ? 'brief' : overrideSystem ? `extract:${String(feature || overrideSystem.slice(0, 40))}` : 'chat'

    const ANTHROPIC_KEY = ANTHROPIC_API_KEY
    const featureKey = overrideSystem ? String(feature || '') : 'chat'
    const MODEL = (model_override && MODEL_OVERRIDES.has(model_override)) ? model_override
      : (overrideSystem && HAIKU_FEATURES.has(featureKey)) ? HAIKU_MODEL
      : ANTHROPIC_MODEL
    const { body: extraBody, betas } = modelParams(MODEL, thinking_override === 'between_tools' || thinking_override === 'adaptive' ? thinking_override : CHAT_THINKING, EFFORT[featureKey] || 'low')
    const maxTokens = MAX_TOKENS[featureKey] || 4000
    const apiHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      ...(betas.length && { 'anthropic-beta': betas.join(',') }),
    }
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
          let executedAction = false
          const called = new Set<string>()
          try {
            for (let it = 0; it < 8; it++) {
              const resp = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: apiHeaders,
                body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, ...extraBody, system: cachedSystem, tools: effectiveTools, messages: withMessageBreakpoint(streamMessages), stream: true }),
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
                  if (ev.type === 'message_start') {
                    // input + cache meters arrive here; output comes in message_delta
                    addUsage(usage, { ...(ev.message?.usage || {}), output_tokens: 0 })
                  } else if (ev.type === 'content_block_start') {
                    // Keep EVERY block type (thinking + signature, redacted_thinking,
                    // fallback, …) as the API sent it: the tool loop must pass the
                    // assistant turn back unchanged (Sonnet 5.5 thinking blocks).
                    cur = { ...(ev.content_block || {}) }
                    if (cur.type === 'tool_use') cur._json = ''
                    if (cur.type === 'text') cur.text = cur.text || ''
                  } else if (ev.type === 'content_block_delta' && cur) {
                    const d = ev.delta || {}
                    if (d.type === 'text_delta') { cur.text = (cur.text || '') + d.text; send({ type: 'text', text: d.text }) }
                    else if (d.type === 'input_json_delta') { cur._json += d.partial_json || '' }
                    else if (d.type === 'thinking_delta') { cur.thinking = (cur.thinking || '') + (d.thinking || '') }
                    else if (d.type === 'signature_delta') { cur.signature = (cur.signature || '') + (d.signature || '') }
                  } else if (ev.type === 'content_block_stop') {
                    if (cur?.type === 'tool_use') {
                      let inp: any = {}; try { inp = cur._json ? JSON.parse(cur._json) : {} } catch { /* keep {} */ }
                      delete cur._json
                      blocks.push({ ...cur, input: inp })
                    } else if (cur && !(cur.type === 'text' && !cur.text)) {
                      blocks.push(cur) // empty text blocks are rejected if sent back
                    }
                    cur = null
                  } else if (ev.type === 'message_delta') {
                    if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason
                    usage.output += Number(ev.usage?.output_tokens) || 0
                  }
                }
              }
              if (stopReason === 'refusal' && !blocks.some((b) => b.type === 'text' && b.text)) {
                send({ type: 'text', text: REFUSAL_TEXT })
                break
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
                  if (block.name === 'execute_action') {
                    executedAction = true
                    if (MEMORY_ACTIONS.includes(block.input?.action)) savedMemory = true
                  }
                  return { type: 'tool_result', tool_use_id: block.id, content: capToolResult(result) }
                }))
                streamMessages.push({ role: 'user', content: toolResults })
                send({ type: 'tool', names: toolBlocks.map((b: any) => b.name) })
                continue
              }
              break
            }
            send({ type: 'done', savedMemory, executedAction })
          } catch (err) {
            send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
          } finally {
            await logUsage(supabase, user.id, usageFeature, MODEL, usage)
            try { controller.close() } catch (_) { /* already closed */ }
          }
        },
      })
      return new Response(sseBody, { headers: { ...cors, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' } })
    }

    for (let iterations = 0; iterations < 8; iterations++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          ...extraBody,
          system: cachedSystem,
          tools: effectiveTools,
          messages: withMessageBreakpoint(currentMessages),
        }),
      })

      const data = await response.json()
      addUsage(usage, data.usage)
      if (!response.ok) {
        await logUsage(supabase, user.id, usageFeature, MODEL, usage)
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
          if (block.name === 'execute_action') {
            executedAction = true
            if (['save_insight','update_insight','delete_insight','save_preference','update_memory_context','update_friend'].includes(block.input?.action)) savedMemory = true
          }
          return { type: 'tool_result', tool_use_id: block.id, content: capToolResult(result) }
        }))
        currentMessages.push({ role: 'user', content: toolResults })
        continue
      }

      // Read by block type — a Sonnet 5.5 response can start with thinking
      // blocks, and with a fallback there can be several text blocks.
      finalText = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim()
      if (!finalText && data.stop_reason === 'refusal') finalText = REFUSAL_TEXT
      break
    }

    await logUsage(supabase, user.id, usageFeature, MODEL, usage)

    // Strip any accidental jarvis_actions tags (legacy safety net)
    const cleaned = finalText
      .replace(/<jarvis_actions>[\s\S]*?<\/jarvis_actions>/gi, '')
      .trim()

    return new Response(JSON.stringify({ content: cleaned || 'Inget svar.', actions: [], savedMemory, executedAction }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
