import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { messages, context, systemPrompt } = await req.json()

    // Hämta user_id från JWT
    const authHeader = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()

    // Hämta user_settings om vi har en användare
    let userSettingsBlock = ''
    if (user) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('about_me, goals, jarvis_style, jarvis_lang, jarvis_personality')
        .eq('user_id', user.id)
        .single()

      if (settings) {
        const parts = []
        if (settings.about_me) parts.push(`OM SIGGE (skrivet av honom själv):\n${settings.about_me}`)
        if (settings.goals) {
          const g = settings.goals
          const goalParts = []
          if (g.one_year) goalParts.push(`1 år: ${g.one_year}`)
          if (g.three_year) goalParts.push(`3 år: ${g.three_year}`)
          if (g.ten_year) goalParts.push(`10 år: ${g.ten_year}`)
          if (g.monthly_income_goal) goalParts.push(`Inkomstmål: ${g.monthly_income_goal} kr/mån netto`)
          if (goalParts.length) parts.push(`SIGGES MÅL:\n${goalParts.join('\n')}`)
        }
        if (settings.jarvis_personality) parts.push(`JARVIS PERSONLIGHET (användarens instruktion):\n${settings.jarvis_personality}`)
        if (settings.jarvis_style !== null) {
          const style = settings.jarvis_style
          const styleDesc = style < 30 ? 'diplomatisk och försiktig' : style < 60 ? 'balanserad' : style < 85 ? 'direkt och ärlig' : 'brutalt ärlig, inga krusiduller'
          parts.push(`KOMMUNIKATIONSSTIL: ${styleDesc} (${style}/100)`)
        }
        if (settings.jarvis_lang && settings.jarvis_lang !== 'auto') parts.push(`SVARSSPRÅK: ${settings.jarvis_lang}`)
        if (parts.length) userSettingsBlock = '\n\n' + parts.join('\n\n')
      }
    }

    const system = systemPrompt
      ? systemPrompt.replace('{CONTEXT}', context || 'Ingen kontextdata tillgänglig.') + userSettingsBlock
      : 'Du är en hjälpsam assistent.' + userSettingsBlock

    const formattedMessages = messages.map((m: { role: string; content: unknown }) => ({
      role: m.role,
      content: m.content,
    }))

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
        messages: formattedMessages,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: data.error?.message || 'Anthropic API error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const textBlock = data.content?.find((b: { type: string }) => b.type === 'text')
    const content = textBlock?.text || ''

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
