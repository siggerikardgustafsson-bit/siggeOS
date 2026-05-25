import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, subDays } from 'date-fns'
import { Send, Zap, Sun, Moon, RefreshCw } from 'lucide-react'

const JARVIS_SYSTEM = `Du är Jarvis – Sigges personliga AI-assistent inbyggd i hans livs-OS kallat Sigge OS.

VEM DU ÄR:
Du är inte en generisk AI. Du är Sigges personliga Jarvis. Du känner honom på djupet.

VEM SIGGE ÄR:
- 21 år, läkarstudent termin 3 på KI, bor i Täby centrum (hyr för 11 000 kr/mån)
- Inkomst: ~25k/mån (CSN 13 500 + PA-jobb 10-13k). Fribelopp 114 500 kr/halvår.
- Jobbar som personlig assistent (nattpass), sidojobb åt Erik Norling (Nils pappa, tygbutiker/fastigheter)
- Karriärsmål: anestesiolog, konsultjobb i Norge, 100k/mån efter skatt
- Bor på lång sikt: Göteborg
- Träning: mål 4-5 ggr/vecka, nu 1-2. PR: bänk 120, knäböj 130, marklyft 170 (peak vintern 2022). Milen sub-45min, halvmaraton 1h50 (peak våren 2025).
- Vikt: nu ~77kg, mål 75kg, sedan muskelbyggande. På retatrutide sedan feb 2026 (2.5mg/vecka).
- Skärmtidsmål: 6h/dag (nu ~11h/dag senaste mätt)
- Peak-period: våren 2025 – strict diet, 4-5x träning/vecka, låg i fas med studierna, sparade pengar
- Historisk peak styrka: vintern 2022

NÄRA VÄNNER:
- Zinedin: bästa vän sedan 13, pluggar sjuksköterska
- Viktoria: närmaste i Stockholm, pluggpartner
- Benjamin, Nils, Leo, William, Teddy, Daris – gänget från Vänersborg
- Erik Norling: Nils pappa, arbetsgivare för sidojobb, betalar kontant
- Sara: ex-flickvän (feb 2024 – höst 2025), Göteborg

PERSONLIGHET & BETEENDEMöNSTER:
- Hedonistisk men strukturkänslig
- Progressionsdriven – mår dåligt utan framåtrörelse
- Socialt beroende – mår bättre med folk runt sig
- Går i faser: intensiv period → passiv period
- Ogillar konflikter, kan undvika dem
- Rationell beslutsfattare, följer sällan andras råd utan att ha tänkt igenom det
- Rädd för att slösa bort livet mer än döden i sig

INTRESSEN: Resor (favoriter: Prag, Belgrad), filosofi, religion, historia, språk (svenska, engelska, serbokroatiska, passiv spanska, lite tyska), gitarr (Håkan Hellström, Cornelis Vreeswijk), podcasts: Tombola, Modern Wisdom, Joe Rogan

DIN PERSONLIGHET SOM JARVIS:
- Läser av läget och anpassar ton – om han mår dåligt är du direkt men omtänksam, om han är på hugget är du energisk
- Konfronterar och utmanar dåliga beslut – du är inte hans nickedocka
- Analytisk: data först, sedan slutsats
- Pratar ALLTID svenska
- Aldrig sycophantisk – du säger sanningen även om det är obekvämt
- Refererar naturligt till hans vänner, historia och mål
- Du känner hans nätverk och hans mönster

SNABBKOMMANDON (parsa och bekräfta):
Om användaren skriver något i stil med:
- "tränade idag: bänk 4x8x80kg" → bekräfta att du loggat träningen
- "åt lunch med Viktoria, pizza 800 kcal" → bekräfta loggning av måltid och socialt
- "drack 4 enheter igår kväll" → logga alkohol
- "väger X kg idag" → logga vikt

Bekräfta alltid vad du loggat och ge en kort kommentar.

KONTEXT (injiceras nedan med aktuell data):
{CONTEXT}

Svara alltid på svenska. Håll svar kortfattade om inte Sigge ber om en lång analys.`

export default function Jarvis() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!user) return
    loadHistory()
    buildContext()
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadHistory() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('jarvis_conversations')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .gte('created_at', today + 'T00:00:00')
      .order('created_at')
      .limit(50)

    if (data && data.length > 0) {
      setMessages(data.map(d => ({ role: d.role, content: d.content })))
    }
  }

  async function buildContext() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

    const [scoresRes, healthRes, journalRes, tasksRes, csnRes] = await Promise.all([
      supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', today).single(),
      supabase.from('health_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(3),
      supabase.from('journal_entries').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(3),
      supabase.from('erik_tasks').select('*').eq('user_id', user.id).neq('status', 'klart').limit(5),
      supabase.rpc('get_csn_usage', { p_user_id: user.id }),
    ])

    const ctx = `
DAGENS SCORE (${today}):
${scoresRes.data ? JSON.stringify(scoresRes.data, null, 2) : 'Inga scores loggade ännu idag'}

SENASTE HÄLSODATA:
${JSON.stringify(healthRes.data, null, 2)}

SENASTE JOURNAL:
${JSON.stringify(journalRes.data, null, 2)}

AKTIVA ERIK-UPPDRAG:
${JSON.stringify(tasksRes.data, null, 2)}

CSN-FRIBELOPP:
Förbrukat: ${Math.round(csnRes.data || 0)} kr av 114 500 kr (${((csnRes.data || 0) / 114500 * 100).toFixed(1)}%)
`
    setContext(ctx)
  }

  async function sendMessage() {
    if (!input.trim() || loading) return

    const userMsg = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Save to DB
    await supabase.from('jarvis_conversations').insert({
      user_id: user.id,
      role: 'user',
      content: userMsg.content,
    })

    try {
      // Call Supabase Edge Function (which calls Anthropic)
      const { data, error } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: newMessages,
          context,
          systemPrompt: JARVIS_SYSTEM,
        },
      })

      if (error) throw error

      const assistantMsg = { role: 'assistant', content: data.content }
      setMessages(prev => [...prev, assistantMsg])

      // Save assistant response
      await supabase.from('jarvis_conversations').insert({
        user_id: user.id,
        role: 'assistant',
        content: data.content,
      })

    } catch (err) {
      console.error(err)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Något gick fel. Kolla att Edge Function är deployad och att ANTHROPIC_API_KEY är satt i Supabase.'
      }])
    }

    setLoading(false)
    inputRef.current?.focus()
  }

  async function generateBrief(type) {
    setLoading(true)
    const prompt = type === 'morning'
      ? 'Ge mig en morning brief för idag. Analysera mina senaste data och ge mig de 3 viktigaste sakerna jag bör fokusera på idag, vad jag bör vara uppmärksam på, och ett konkret mål för dagen.'
      : 'Ge mig en kvällssammanfattning. Summera vad som hände idag baserat på min data, lyft fram något bra och något att ta med sig till imorgon.'

    setInput('')
    const fakeMsg = { role: 'user', content: prompt }
    setMessages(prev => [...prev, fakeMsg])

    await supabase.from('jarvis_conversations').insert({
      user_id: user.id,
      role: 'user',
      content: prompt,
    })

    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: [...messages, fakeMsg], context, systemPrompt: JARVIS_SYSTEM },
      })

      const assistantMsg = { role: 'assistant', content: data.content }
      setMessages(prev => [...prev, assistantMsg])

      await supabase.from('jarvis_conversations').insert({
        user_id: user.id,
        role: 'assistant',
        content: data.content,
      })

      // Save brief
      await supabase.from('jarvis_briefs').upsert({
        user_id: user.id,
        date: format(new Date(), 'yyyy-MM-dd'),
        brief_type: type,
        content: data.content,
      })
    } catch (err) {
      console.error(err)
    }

    setLoading(false)
  }

  async function clearToday() {
    const today = format(new Date(), 'yyyy-MM-dd')
    await supabase.from('jarvis_conversations')
      .delete()
      .eq('user_id', user.id)
      .gte('created_at', today + 'T00:00:00')
    setMessages([])
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', maxWidth: '800px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: '600' }}>
            Jarvis<span style={{ color: 'var(--blue)' }}>_</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Din personliga AI-assistent</div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => generateBrief('morning')} className="btn btn-ghost" style={{ fontSize: '12px', padding: '7px 12px' }}>
            <Sun size={13} /> Morning brief
          </button>
          <button onClick={() => generateBrief('evening')} className="btn btn-ghost" style={{ fontSize: '12px', padding: '7px 12px' }}>
            <Moon size={13} /> Kvällssummering
          </button>
          <button onClick={clearToday} className="btn btn-ghost" style={{ fontSize: '12px', padding: '7px 10px' }} title="Rensa dagens konversation">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* Quick commands hint */}
      {messages.length === 0 && (
        <div style={{ padding: '16px 24px' }}>
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px', fontWeight: '500' }}>SNABBKOMMANDON</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {[
                'tränade idag: bänk 4x8x80kg',
                'väger 76.5 kg idag',
                'åt lunch med Viktoria, pizza 800 kcal',
                'drack 3 enheter igår',
                'pluggade 2h fysiologi idag',
                'förhör mig på RAAS-systemet',
              ].map(cmd => (
                <button
                  key={cmd}
                  onClick={() => setInput(cmd)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(59,130,246,0.08)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    color: '#93c5fd',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: 'DM Sans, sans-serif',
                  }}
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user' ? 'var(--blue)' : 'var(--surface)',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
              fontSize: '14px',
              lineHeight: '1.6',
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '12px 16px',
              borderRadius: '16px 16px 16px 4px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              gap: '5px',
              alignItems: 'center',
            }}>
              {[0,1,2].map(i => (
                <div key={i} style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: 'var(--muted)',
                  animation: 'pulse 1.2s infinite',
                  animationDelay: `${i * 0.2}s`,
                }} />
              ))}
              <style>{`
                @keyframes pulse {
                  0%, 100% { opacity: 0.3; transform: scale(0.8); }
                  50% { opacity: 1; transform: scale(1); }
                }
              `}</style>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '12px 24px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Skriv till Jarvis... (Enter för att skicka)"
            rows={1}
            style={{
              resize: 'none',
              overflowY: 'auto',
              maxHeight: '120px',
              lineHeight: '1.5',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="btn btn-primary"
            style={{ padding: '10px 14px', flexShrink: 0, opacity: loading || !input.trim() ? 0.5 : 1 }}
          >
            <Send size={16} />
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>
          Shift+Enter för ny rad
        </div>
      </div>
    </div>
  )
}
