import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, subMonths, addMonths } from 'date-fns'
import { sv } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Save, Loader, BookOpen, X } from 'lucide-react'

const JARVIS_JOURNAL_SYSTEM = `Du är Jarvis, Sigges personliga AI. Analysera denna journal-entry djupgående och returnera ENBART ett JSON-objekt utan markdown eller backticks.

Extrahera och analysera:
- people: array med namn på personer nämnda (Zinedin, Viktoria, Benjamin, Nils, Leo, William, Teddy, Daris, Erik, Sara, mamma, pappa, etc.)
- activities: array med aktiviteter (tränade, pluggade, jobbade, åt lunch, etc.)
- locations: array med platser nämnda
- keywords: array med 5-8 nyckelord som fångar essensen
- mood_analysis: kort analys av stämningen (1-2 meningar)
- energy_analysis: kort analys av energinivån
- patterns: eventuella mönster eller kopplingar till Sigges kända beteendemönster
- social_quality: 1-10 baserat på social interaktion beskriven
- productivity_score: 1-10 baserat på hur produktiv dagen verkar ha varit
- health_signals: eventuella hälsosignaler (alkohol, sömn, stress, etc.)
- jarvis_comment: en ärlig, personlig kommentar från Jarvis (2-3 meningar, inte sycophantisk, pratar svenska, refererar till Sigges mål och historia om relevant)

Returnera ENDAST JSON, inget annat.`

function Slider({ label, value, onChange, color = '#3b82f6' }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{label}</span>
        <span className="mono" style={{ fontSize: '13px', color, fontWeight: '600' }}>{value ?? '—'}</span>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        value={value ?? 5}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{
          width: '100%',
          accentColor: color,
          height: '4px',
          cursor: 'pointer',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
        <span>1</span><span>10</span>
      </div>
    </div>
  )
}

function CalendarDay({ date, hasEntry, isSelected, onClick }) {
  const today = isToday(date)
  return (
    <button
      onClick={() => onClick(date)}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '13px',
        fontFamily: 'DM Sans, sans-serif',
        fontWeight: isSelected || today ? '600' : '400',
        background: isSelected ? 'var(--blue)' : today ? 'rgba(59,130,246,0.15)' : 'transparent',
        color: isSelected ? 'white' : today ? 'var(--blue)' : 'var(--text)',
        position: 'relative',
        transition: 'all 0.15s',
      }}
    >
      {format(date, 'd')}
      {hasEntry && !isSelected && (
        <div style={{
          position: 'absolute',
          bottom: '3px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          background: '#10b981',
        }} />
      )}
    </button>
  )
}

export default function JournalPage() {
  const { user } = useAuth()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [entries, setEntries] = useState([]) // all entries for current month
  const [selectedEntries, setSelectedEntries] = useState([]) // entries for selected date
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [viewEntry, setViewEntry] = useState(null)

  // Form state
  const [form, setForm] = useState({
    content: '',
    mood: 7,
    energy: 7,
    sleep_hours: 7.5,
    sleep_type: 'normal',
    sleep_note: '',
    social_score: 7,
    is_travel_entry: false,
  })

  useEffect(() => {
    if (user) fetchMonthEntries()
  }, [user, currentMonth])

  useEffect(() => {
    if (user) fetchSelectedEntries()
  }, [user, selectedDate])

  async function fetchMonthEntries() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('journal_entries')
      .select('date')
      .eq('user_id', user.id)
      .gte('date', start)
      .lte('date', end)
    setEntries(data || [])
  }

  async function fetchSelectedEntries() {
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', dateStr)
      .order('created_at')
    setSelectedEntries(data || [])
  }

  async function saveEntry() {
    setSaving(true)
    const dateStr = format(selectedDate, 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('journal_entries')
      .insert({
        user_id: user.id,
        date: dateStr,
        content: form.content,
        mood: form.mood,
        energy: form.energy,
        sleep_hours: form.sleep_hours,
        sleep_type: form.sleep_type,
        sleep_note: form.sleep_note,
        social_score: form.social_score,
        is_travel_entry: form.is_travel_entry,
      })
      .select()
      .single()

    if (!error && data) {
      // Journal is master for sleep — always write to health_logs
      await supabase.from('health_logs').upsert({
        user_id: user.id,
        date: dateStr,
        sleep_hours: form.sleep_hours,
        sleep_quality: form.sleep_type === 'normal' ? 8 : form.sleep_type === 'uppdelad' ? 5 : 6,
        sleep_type: form.sleep_type,
        sleep_note: form.sleep_note,
        energy: form.energy,
        source: 'journal',
      }, { onConflict: 'user_id,date' })

      await updateJournalScore(dateStr, form)
      runAIAnalysis(data.id, form.content)
      await fetchSelectedEntries()
      await fetchMonthEntries()
      setShowForm(false)
      setForm({ content: '', mood: 7, energy: 7, sleep_hours: 7.5, sleep_type: 'normal', sleep_note: '', social_score: 7, is_travel_entry: false })
    }

    setSaving(false)
  }

  async function updateJournalScore(dateStr, formData) {
    // Journal score: based on having an entry (50) + content length (25) + sliders filled (25)
    const contentScore = Math.min(formData.content.length / 5, 25)
    const sliderScore = 25
    const journalScore = Math.min(50 + contentScore + sliderScore, 100)

    // Also update health scores from sliders
    const { data: existing } = await supabase
      .from('daily_scores')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', dateStr)
      .single()

    if (existing) {
      await supabase.from('daily_scores').update({
        score_journal: journalScore,
        score_health: Math.max(existing.score_health, (formData.energy / 10) * 100),
      }).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({
        user_id: user.id,
        date: dateStr,
        score_journal: journalScore,
        score_health: (formData.energy / 10) * 100,
      })
    }
  }

  async function runAIAnalysis(entryId, content) {
    if (!content || content.length < 20) return
    setAnalyzing(true)

    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: `Analysera denna journal-entry från Sigge:\n\n"${content}"` }],
          context: '',
          systemPrompt: JARVIS_JOURNAL_SYSTEM,
        },
      })

      if (data?.content) {
        let analysis
        try {
          // Clean response and parse JSON
          const cleaned = data.content.replace(/```json|```/g, '').trim()
          analysis = JSON.parse(cleaned)
        } catch {
          console.error('Could not parse AI analysis')
          setAnalyzing(false)
          return
        }

        // Save analysis back to entry
        await supabase.from('journal_entries').update({
          ai_extracted_people: analysis.people || [],
          ai_extracted_activities: analysis.activities || [],
          ai_extracted_keywords: analysis.keywords || [],
          ai_summary: analysis.jarvis_comment || '',
        }).eq('id', entryId)

        // Update social interactions if people were mentioned
        if (analysis.people && analysis.people.length > 0) {
          const dateStr = format(selectedDate, 'yyyy-MM-dd')
          await supabase.from('social_interactions').insert({
            user_id: user.id,
            date: dateStr,
            friend_names: analysis.people,
            activity: analysis.activities?.join(', ') || '',
            quality: analysis.social_quality || 7,
            source: 'journal_ai',
            notes: analysis.mood_analysis || '',
          })

          // Update social score
          const socialScore = (analysis.social_quality / 10) * 100
          await supabase.from('daily_scores')
            .update({ score_social: socialScore })
            .eq('user_id', user.id)
            .eq('date', dateStr)
        }

        // Refresh entries to show analysis
        await fetchSelectedEntries()
      }
    } catch (err) {
      console.error('AI analysis failed:', err)
    }

    setAnalyzing(false)
  }

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  })

  const firstDayOfWeek = startOfMonth(currentMonth).getDay()
  const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

  const entryDates = new Set(entries.map(e => e.date))
  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd')

  return (
    <div className="page-wrap">

      {/* Floating sticky header */}
      <div className="page-header">
        <div>
          <div className="page-header-title">Journal</div>
          <div className="page-header-sub">Dagliga reflektioner</div>
        </div>
        <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
          <button onClick={() => { setSelectedDate(new Date()); setShowForm(true) }} className="btn btn-primary" style={{ fontSize: '12px' }}><Plus size={14} /> Ny entry</button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="page-content-scroll">
      <div style={{ padding: '16px 16px 0', maxWidth: '900px', margin: '0 auto' }}>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px' }}>

        {/* Calendar */}
        <div className="card" style={{ padding: '16px', alignSelf: 'start' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn btn-ghost" style={{ padding: '6px 8px' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '14px', fontWeight: '600', textTransform: 'capitalize' }}>
              {format(currentMonth, 'MMMM yyyy', { locale: sv })}
            </span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn btn-ghost" style={{ padding: '6px 8px' }}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
            {['M','T','O','T','F','L','S'].map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '11px', color: 'var(--muted)', padding: '4px 0' }}>{d}</div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {Array.from({ length: adjustedFirstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {daysInMonth.map(day => (
              <div key={day.toISOString()} style={{ display: 'flex', justifyContent: 'center' }}>
                <CalendarDay
                  date={day}
                  hasEntry={entryDates.has(format(day, 'yyyy-MM-dd'))}
                  isSelected={isSameDay(day, selectedDate)}
                  onClick={setSelectedDate}
                />
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
            Entry loggad
          </div>
        </div>

        {/* Right panel */}
        <div>
          {/* Selected date header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: '600', textTransform: 'capitalize' }}>
              {format(selectedDate, "EEEE d MMMM", { locale: sv })}
            </div>
            <button onClick={() => setShowForm(true)} className="btn btn-ghost" style={{ fontSize: '13px' }}>
              <Plus size={14} /> Lägg till
            </button>
          </div>

          {/* New entry form */}
          {showForm && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>Ny entry — {format(selectedDate, 'd MMM', { locale: sv })}</div>
                <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>

              <textarea
                className="input"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Hur var dagen? Vad hände? Vem träffade du? Hur mår du?"
                rows={5}
                style={{ resize: 'vertical', marginBottom: '20px', lineHeight: '1.6' }}
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                <Slider label="Humör" value={form.mood} onChange={v => setForm(f => ({ ...f, mood: v }))} color="#ec4899" />
                <Slider label="Energi" value={form.energy} onChange={v => setForm(f => ({ ...f, energy: v }))} color="#f59e0b" />
                <Slider label="Socialt umgänge" value={form.social_score} onChange={v => setForm(f => ({ ...f, social_score: v }))} color="#10b981" />
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Sömn (timmar)</span>
                    <span className="mono" style={{ fontSize: '13px', color: '#06b6d4', fontWeight: '600' }}>{form.sleep_hours}h</span>
                  </div>
                  <input
                    type="range"
                    min="3"
                    max="12"
                    step="0.5"
                    value={form.sleep_hours}
                    onChange={e => setForm(f => ({ ...f, sleep_hours: parseFloat(e.target.value) }))}
                    style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                    <span>3h</span><span>12h</span>
                  </div>
                </div>
              </div>

              {/* Sleep type */}
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '8px' }}>Sömntyp</div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  {[
                    { id: 'normal',   label: '😴 Normal',   desc: 'Ett sammanhängande pass' },
                    { id: 'uppdelad', label: '✂️ Uppdelad', desc: 'Flera korta pass' },
                    { id: 'nattjobb', label: '🌙 Nattjobb', desc: 'Sov under/efter pass' },
                  ].map(t => (
                    <button key={t.id} onClick={() => setForm(f => ({ ...f, sleep_type: t.id }))} style={{
                      flex: 1, padding: '7px 6px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                      background: form.sleep_type === t.id ? 'rgba(6,182,212,0.15)' : 'var(--surface2)',
                      color: form.sleep_type === t.id ? '#06b6d4' : 'var(--muted)',
                      fontSize: '12px', fontFamily: 'DM Sans, sans-serif', fontWeight: '500',
                      outline: form.sleep_type === t.id ? '1px solid rgba(6,182,212,0.4)' : '1px solid transparent',
                      transition: 'all 0.15s',
                    }}>{t.label}</button>
                  ))}
                </div>
                {form.sleep_type !== 'normal' && (
                  <input
                    className="input"
                    placeholder={form.sleep_type === 'uppdelad' ? 'T.ex. 3h hemma + 3h på tåget' : 'T.ex. somnade 05:00 efter nattpass, sov till 11:00'}
                    value={form.sleep_note}
                    onChange={e => setForm(f => ({ ...f, sleep_note: e.target.value }))}
                    style={{ fontSize: '13px' }}
                  />
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="checkbox"
                  id="travel"
                  checked={form.is_travel_entry}
                  onChange={e => setForm(f => ({ ...f, is_travel_entry: e.target.checked }))}
                  style={{ accentColor: 'var(--blue)', width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="travel" style={{ fontSize: '13px', color: 'var(--muted)', cursor: 'pointer' }}>Reseentry ✈️</label>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowForm(false)} className="btn btn-ghost">Avbryt</button>
                <button
                  onClick={saveEntry}
                  className="btn btn-primary"
                  disabled={saving || !form.content.trim()}
                  style={{ opacity: saving || !form.content.trim() ? 0.6 : 1 }}
                >
                  {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={14} /> Spara</>}
                </button>
              </div>
            </div>
          )}

          {/* Entries for selected date */}
          {selectedEntries.length === 0 && !showForm ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <BookOpen size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div style={{ fontSize: '14px' }}>Ingen entry för detta datum</div>
              <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ marginTop: '16px' }}>
                <Plus size={14} /> Skriv entry
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {selectedEntries.map(entry => (
                <div key={entry.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setViewEntry(viewEntry?.id === entry.id ? null : entry)}>
                  {/* Entry header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {format(new Date(entry.created_at), 'HH:mm')}
                      {entry.is_travel_entry && ' ✈️'}
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      {entry.mood && <span style={{ fontSize: '12px', color: '#ec4899' }}>😊 {entry.mood}/10</span>}
                      {entry.energy && <span style={{ fontSize: '12px', color: '#f59e0b' }}>⚡ {entry.energy}/10</span>}
                      {entry.sleep_hours && <span style={{ fontSize: '12px', color: '#06b6d4' }}>💤 {entry.sleep_hours}h</span>}
                    </div>
                  </div>

                  {/* Content preview */}
                  <div style={{ fontSize: '14px', lineHeight: '1.6', color: 'var(--text)', marginBottom: entry.ai_summary ? '12px' : '0' }}>
                    {viewEntry?.id === entry.id ? entry.content : (entry.content?.slice(0, 150) + (entry.content?.length > 150 ? '...' : ''))}
                  </div>

                  {/* AI analysis */}
                  {viewEntry?.id === entry.id && entry.ai_summary && (
                    <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(59,130,246,0.06)', borderRadius: '8px', borderLeft: '3px solid var(--blue)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--blue)', fontWeight: '600', marginBottom: '6px' }}>JARVIS ANALYS</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.6', marginBottom: '10px' }}>{entry.ai_summary}</div>
                      {entry.ai_extracted_people?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '6px' }}>
                          {entry.ai_extracted_people.map(p => (
                            <span key={p} style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '11px' }}>👤 {p}</span>
                          ))}
                        </div>
                      )}
                      {entry.ai_extracted_keywords?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {entry.ai_extracted_keywords.map(k => (
                            <span key={k} style={{ padding: '3px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', fontSize: '11px' }}>{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Analyzing indicator */}
                  {analyzing && !entry.ai_summary && (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                      <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      Jarvis analyserar...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
      </div>
      </div>
  )
}
