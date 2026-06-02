import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, subMonths, addMonths, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Save, Loader, BookOpen, X, Edit2, Calendar, Music, Languages, ChevronDown, ChevronUp } from 'lucide-react'

const JARVIS_JOURNAL_SYSTEM = `Du är Jarvis, Sigges personliga AI. Analysera denna journal-entry djupgående och returnera ENBART ett JSON-objekt utan markdown eller backticks.

Extrahera och analysera:
- people: array med namn på personer nämnda
- activities: array med aktiviteter
- locations: array med platser nämnda
- keywords: array med 5-8 nyckelord som fångar essensen
- mood_analysis: kort analys av stämningen (1-2 meningar)
- energy_analysis: kort analys av energinivån
- patterns: eventuella mönster eller kopplingar till Sigges kända beteendemönster
- social_quality: 1-10 baserat på social interaktion beskriven
- productivity_score: 1-10 baserat på hur produktiv dagen verkar ha varit
- health_signals: eventuella hälsosignaler
- jarvis_comment: en ärlig, personlig kommentar från Jarvis (2-3 meningar, inte sycophantisk, pratar svenska)

Returnera ENDAST JSON, inget annat.`

const SKILLS = [
  { id: 'guitar',   label: 'Gitarr',   icon: 'Music',      color: '#f59e0b' },
  { id: 'spanish',  label: 'Spanska',  icon: 'Globe',      color: '#ef4444' },
  { id: 'serbian',  label: 'Serbiska', icon: 'Globe',      color: '#3b82f6' },
  { id: 'reading',  label: 'Läsning',  icon: 'BookMarked', color: '#8b5cf6' },
  { id: 'piano',    label: 'Piano',    icon: 'Music',      color: '#06b6d4' },
  { id: 'other',    label: 'Annat',    icon: 'Sparkles',   color: '#10b981' },
]

const EMPTY_FORM = {
  content: '', mood: 7, energy: 7, sleep_hours: 7.5,
  sleep_type: 'normal', sleep_note: '', social_score: 7, is_travel_entry: false,
  skills: [], // [{ id, minutes }]
}

function Slider({ label, value, onChange, color = '#3b82f6' }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{label}</span>
        <span style={{ fontSize: '12px', color, fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>{value ?? '—'}</span>
      </div>
      <input type="range" min="1" max="10" value={value ?? 5}
        onChange={e => onChange(parseInt(e.target.value))}
        style={{ width: '100%', accentColor: color, height: '3px', cursor: 'pointer' }} />
    </div>
  )
}

function CalendarDay({ date, hasEntry, isSelected, onClick }) {
  const today = isToday(date)
  return (
    <button onClick={() => onClick(date)} style={{
      width: '34px', height: '34px', borderRadius: '8px', border: 'none',
      cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
      fontWeight: isSelected || today ? '600' : '400',
      background: isSelected ? 'var(--accent)' : today ? 'var(--accent-soft)' : 'transparent',
      color: isSelected ? 'white' : today ? 'var(--accent)' : 'var(--text)',
      position: 'relative', transition: 'all 0.15s',
    }}>
      {format(date, 'd')}
      {hasEntry && !isSelected && (
        <div style={{
          position: 'absolute', bottom: '3px', left: '50%',
          transform: 'translateX(-50%)', width: '4px', height: '4px',
          borderRadius: '50%', background: '#10b981',
        }} />
      )}
    </button>
  )
}

export default function JournalPage() {
  const { user } = useAuth()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [entries, setEntries] = useState([])
  const [selectedEntries, setSelectedEntries] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [viewEntry, setViewEntry] = useState(null)
  const [recentEntries, setRecentEntries] = useState([])
  const [editingEntry, setEditingEntry] = useState(null) // entry being edited
  const [form, setForm] = useState(EMPTY_FORM)
  const [editDate, setEditDate] = useState('') // for date change on existing entry

  useEffect(() => { if (user) fetchMonthEntries() }, [user, currentMonth])
  useEffect(() => { if (user) fetchRecentEntries() }, [user])
  useEffect(() => { if (user) fetchSelectedEntries() }, [user, selectedDate])

  async function fetchRecentEntries() {
    const { data } = await supabase.from('journal_entries').select('id,date,content,mood,energy,sleep_hours')
      .eq('user_id', user.id).order('date', { ascending: false }).limit(5)
    setRecentEntries(data || [])
  }

  async function fetchMonthEntries() {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd')
    const { data } = await supabase.from('journal_entries').select('date')
      .eq('user_id', user.id).gte('date', start).lte('date', end)
    setEntries(data || [])
  }

  async function fetchSelectedEntries() {
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const { data } = await supabase.from('journal_entries').select('*')
      .eq('user_id', user.id).eq('date', dateStr).order('created_at')
    setSelectedEntries(data || [])
  }

  function openNewForm() {
    setEditingEntry(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEditForm(entry) {
    setEditingEntry(entry)
    setEditDate(entry.date)
    setForm({
      content: entry.content || '',
      mood: entry.mood || 7,
      energy: entry.energy || 7,
      sleep_hours: entry.sleep_hours || 7.5,
      sleep_type: entry.sleep_type || 'normal',
      sleep_note: entry.sleep_note || '',
      social_score: entry.social_score || 7,
      is_travel_entry: entry.is_travel_entry || false,
    })
    setShowForm(true)
    setViewEntry(null)
  }

  async function saveEntry() {
    setSaving(true)

    if (editingEntry) {
      // UPDATE existing entry
      const { error } = await supabase.from('journal_entries').update({
        content: form.content,
        mood: form.mood,
        energy: form.energy,
        sleep_hours: form.sleep_hours,
        sleep_type: form.sleep_type,
        sleep_note: form.sleep_note,
        social_score: form.social_score,
        is_travel_entry: form.is_travel_entry,
        date: editDate, // allow date change
      }).eq('id', editingEntry.id)

      if (!error) {
        // If date changed, navigate to new date
        if (editDate !== editingEntry.date) {
          setSelectedDate(parseISO(editDate))
          if (!isSameMonth(parseISO(editDate), currentMonth)) {
            setCurrentMonth(parseISO(editDate))
          }
        }
        await fetchSelectedEntries()
        await fetchMonthEntries()
        setShowForm(false)
        setEditingEntry(null)
        setForm(EMPTY_FORM)
      }
    } else {
      // INSERT new entry
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const { data, error } = await supabase.from('journal_entries').insert({
        user_id: user.id, date: dateStr,
        content: form.content, mood: form.mood, energy: form.energy,
        sleep_hours: form.sleep_hours, sleep_type: form.sleep_type,
        sleep_note: form.sleep_note, social_score: form.social_score,
        is_travel_entry: form.is_travel_entry,
      }).select().single()

      if (!error && data) {
        await supabase.from('health_logs').upsert({
          user_id: user.id, date: dateStr, sleep_hours: form.sleep_hours,
          sleep_quality: form.sleep_type === 'normal' ? 8 : form.sleep_type === 'uppdelad' ? 5 : 6,
          sleep_type: form.sleep_type, sleep_note: form.sleep_note,
          energy: form.energy, energy_level: form.energy, source: 'journal',
        }, { onConflict: 'user_id,date' })
        if (form.skills?.length) {
          await supabase.from('skill_logs').delete().eq('user_id', user.id).eq('date', dateStr)
          const rows = form.skills.filter(s => s.minutes > 0).map(s => ({ user_id: user.id, date: dateStr, skill: s.id, minutes: s.minutes }))
          if (rows.length) await supabase.from('skill_logs').insert(rows)
        }
        await updateJournalScore(dateStr, form)
        runAIAnalysis(data.id, form.content)
        await fetchSelectedEntries()
        await fetchMonthEntries()
        await fetchRecentEntries()
        setShowForm(false)
        setForm(EMPTY_FORM)
      }
    }
    setSaving(false)
  }

  async function deleteEntry(entryId) {
    if (!confirm('Ta bort denna entry?')) return
    await supabase.from('journal_entries').delete().eq('id', entryId)
    await fetchSelectedEntries()
    await fetchMonthEntries()
    setViewEntry(null)
  }

  async function updateJournalScore(dateStr, formData) {
    const contentScore = Math.min(formData.content.length / 5, 25)
    const journalScore = Math.min(75 + contentScore, 100)
    const { data: existing } = await supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', dateStr).single()
    if (existing) {
      await supabase.from('daily_scores').update({ score_journal: journalScore, score_health: Math.max(existing.score_health, (formData.energy / 10) * 100) }).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({ user_id: user.id, date: dateStr, score_journal: journalScore, score_health: (formData.energy / 10) * 100 })
    }
  }

  async function runAIAnalysis(entryId, content) {
    if (!content || content.length < 20) return
    setAnalyzing(true)
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: [{ role: 'user', content: `Analysera denna journal-entry från Sigge:\n\n"${content}"` }], context: '', systemPrompt: JARVIS_JOURNAL_SYSTEM },
      })
      if (data?.content) {
        let analysis
        try { analysis = JSON.parse(data.content.replace(/```json|```/g, '').trim()) }
        catch { setAnalyzing(false); return }
        await supabase.from('journal_entries').update({
          ai_extracted_people: analysis.people || [], ai_extracted_activities: analysis.activities || [],
          ai_extracted_keywords: analysis.keywords || [], ai_summary: analysis.jarvis_comment || '',
        }).eq('id', entryId)
        if (analysis.people?.length > 0) {
          const dateStr = format(selectedDate, 'yyyy-MM-dd')
          await supabase.from('social_interactions').insert({
            user_id: user.id, date: dateStr, friend_names: analysis.people,
            activity: analysis.activities?.join(', ') || '', quality: analysis.social_quality || 7,
            source: 'journal_ai', notes: analysis.mood_analysis || '',
          })
        }
        await fetchSelectedEntries()
      }
    } catch (err) { console.error('AI analysis failed:', err) }
    setAnalyzing(false)
  }

  function isSameMonth(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth()
  }

  const daysInMonth = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const adjustedFirstDay = (() => { const d = startOfMonth(currentMonth).getDay(); return d === 0 ? 6 : d - 1 })()
  const entryDates = new Set(entries.map(e => e.date))

  // Calculate streak - consecutive days with entries ending today
  const streak = (() => {
    let count = 0
    let d = new Date()
    while (true) {
      const ds = format(d, 'yyyy-MM-dd')
      if (entryDates.has(ds)) { count++; d = new Date(d.getTime() - 86400000) }
      else break
    }
    return count
  })()

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Journal</div>
          <div className="page-header-sub">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} i {format(currentMonth, 'MMMM', { locale: sv })}
          </div>
        </div>
        <button onClick={openNewForm} className="btn btn-primary">
          <Plus size={14} /> Ny entry
        </button>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding: '12px 12px 0', maxWidth: '1000px', margin: '0 auto' }}>
          <div className="journal-layout" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '12px', alignItems: 'stretch' }}>

            {/* ── LEFT: Calendar + stats ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Calendar widget */}
              <div style={{
                background: 'var(--surface)', backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--glass-border)', borderRadius: '16px',
                padding: '16px', boxShadow: 'var(--glass-shadow)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="btn btn-ghost" style={{ padding: '5px 8px' }}>
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: '600', textTransform: 'capitalize', color: 'var(--text)' }}>
                    {format(currentMonth, 'MMMM yyyy', { locale: sv })}
                  </span>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="btn btn-ghost" style={{ padding: '5px 8px' }}>
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '4px' }}>
                  {['M','T','O','T','F','L','S'].map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: '10px', color: 'var(--muted)', padding: '3px 0', fontWeight: '500' }}>{d}</div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
                  {Array.from({ length: adjustedFirstDay }).map((_, i) => <div key={'e'+i} />)}
                  {daysInMonth.map(day => (
                    <div key={day.toISOString()} style={{ display: 'flex', justifyContent: 'center' }}>
                      <CalendarDay date={day} hasEntry={entryDates.has(format(day, 'yyyy-MM-dd'))} isSelected={isSameDay(day, selectedDate)} onClick={setSelectedDate} />
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />
                  Entry loggad
                </div>
              </div>

              {/* Stats + recent entries */}
              <div style={{
                background: 'var(--surface)', backdropFilter: 'var(--glass-blur)',
                WebkitBackdropFilter: 'var(--glass-blur)',
                border: '1px solid var(--glass-border)', borderRadius: '16px',
                padding: '16px', boxShadow: 'var(--glass-shadow)',
              }}>
                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  {[
                    { label: 'Entries i månaden', value: entries.length, color: 'var(--accent)' },
                    { label: 'Streak', value: streak > 0 ? streak + 'd ' : '0d', color: streak > 0 ? '#f59e0b' : 'var(--muted)' },
                  ].map(s => (
                    <div key={s.label} style={{
                      background: 'var(--surface2)', borderRadius: '10px',
                      padding: '10px 12px', border: '1px solid var(--border)',
                    }}>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: s.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
                      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '4px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

              </div>
            </div>

            {/* ── RIGHT: single glass panel ── */}
            <div style={{
              background: 'var(--surface)', backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--glass-border)', borderRadius: '16px',
              padding: '16px', boxShadow: 'var(--glass-shadow)',
              display: 'flex', flexDirection: 'column', gap: '12px',
            }}>

              {/* Date header inside the panel */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text)', textTransform: 'capitalize' }}>
                  {format(selectedDate, "EEEE d MMMM", { locale: sv })}
                </div>
                <button onClick={openNewForm} className="btn btn-ghost">
                  <Plus size={13} /> Lägg till
                </button>
              </div>

              {/* FORM — new or edit */}
              {showForm && (
                <div style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>
                      {editingEntry ? 'Redigera entry' : 'Ny entry'}
                    </div>
                    <button onClick={() => { setShowForm(false); setEditingEntry(null); setForm(EMPTY_FORM) }}
                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                      <X size={16} />
                    </button>
                  </div>

                  {/* Date picker for edit */}
                  {editingEntry && (
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Calendar size={12} /> Datum
                      </div>
                      <input type="date" className="input" value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        style={{ fontSize: '13px', maxWidth: '200px' }} />
                    </div>
                  )}

                  <textarea className="input" value={form.content}
                    onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                    placeholder="Hur var dagen? Vad hände? Vem träffade du?"
                    rows={5} style={{ resize: 'vertical', marginBottom: '18px', lineHeight: '1.7', fontSize: '14px' }} />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
                    <Slider label="Humör" value={form.mood} onChange={v => setForm(f => ({ ...f, mood: v }))} color="#ec4899" />
                    <Slider label="Energi" value={form.energy} onChange={v => setForm(f => ({ ...f, energy: v }))} color="#f59e0b" />
                    <Slider label="Socialt umgänge" value={form.social_score} onChange={v => setForm(f => ({ ...f, social_score: v }))} color="#10b981" />
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Sömn</span>
                        <span style={{ fontSize: '12px', color: '#06b6d4', fontWeight: '600' }}>{form.sleep_hours}h</span>
                      </div>
                      <input type="range" min="3" max="12" step="0.5" value={form.sleep_hours}
                        onChange={e => setForm(f => ({ ...f, sleep_hours: parseFloat(e.target.value) }))}
                        style={{ width: '100%', accentColor: '#06b6d4', cursor: 'pointer' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                    {[{ id: 'normal', label: 'Normal' }, { id: 'uppdelad', label: 'Uppdelad' }, { id: 'nattjobb', label: 'Nattjobb' }].map(t => (
                      <button key={t.id} onClick={() => setForm(f => ({ ...f, sleep_type: t.id }))} style={{
                        flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid ' + (form.sleep_type === t.id ? 'rgba(6,182,212,0.4)' : 'var(--border)'),
                        cursor: 'pointer', background: form.sleep_type === t.id ? 'rgba(6,182,212,0.1)' : 'var(--surface2)',
                        color: form.sleep_type === t.id ? '#06b6d4' : 'var(--muted)', fontSize: '12px',
                        fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
                      }}>{t.label}</button>
                    ))}
                  </div>

                  {form.sleep_type !== 'normal' && (
                    <input className="input" placeholder="Beskriv..." value={form.sleep_note}
                      onChange={e => setForm(f => ({ ...f, sleep_note: e.target.value }))}
                      style={{ fontSize: '13px', marginBottom: '14px' }} />
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <input type="checkbox" id="travel" checked={form.is_travel_entry}
                      onChange={e => setForm(f => ({ ...f, is_travel_entry: e.target.checked }))}
                      style={{ accentColor: 'var(--accent)', width: '15px', height: '15px', cursor: 'pointer' }} />
                    <label htmlFor="travel" style={{ fontSize: '12px', color: 'var(--muted)', cursor: 'pointer' }}>Reseentry ️</label>
                  </div>

                  {/* Skills — collapsible */}
                  {(() => {
                    const hasSkills = form.skills?.length > 0
                    return (
                      <div style={{ marginBottom: '16px' }}>
                        <button
                          onClick={() => setForm(f => ({
                            ...f,
                            skills: hasSkills ? [] : [{ id: 'guitar', minutes: 30 }]
                          }))}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: hasSkills ? 'rgba(139,92,246,0.08)' : 'var(--surface2)',
                            border: '1px solid ' + (hasSkills ? 'rgba(139,92,246,0.25)' : 'var(--border)'),
                            borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
                            color: hasSkills ? '#a78bfa' : 'var(--muted)',
                            fontSize: '12px', fontFamily: 'Inter, sans-serif', fontWeight: '500',
                            transition: 'all 0.15s',
                          }}
                        >
                          <Music size={12} />
                          Färdigheter övade idag
                          {hasSkills ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                        </button>

                        {hasSkills && (
                          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {form.skills.map((s, i) => {
                              const skill = SKILLS.find(sk => sk.id === s.id) || SKILLS[0]
                              return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <select
                                    value={s.id}
                                    onChange={e => setForm(f => ({ ...f, skills: f.skills.map((sk, si) => si === i ? { ...sk, id: e.target.value } : sk) }))}
                                    style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 10px', color: 'var(--text)', fontSize: '13px', fontFamily: 'Inter, sans-serif', cursor: 'pointer', outline: 'none' }}
                                  >
                                    {SKILLS.map(sk => <option key={sk.id} value={sk.id}>{sk.label}</option>)}
                                  </select>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                                    <input
                                      type="number" min="5" max="240" step="5"
                                      value={s.minutes}
                                      onChange={e => setForm(f => ({ ...f, skills: f.skills.map((sk, si) => si === i ? { ...sk, minutes: parseInt(e.target.value) || 0 } : sk) }))}
                                      style={{ width: '56px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 8px', color: 'var(--text)', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none', textAlign: 'center' }}
                                    />
                                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>min</span>
                                  </div>
                                  <button onClick={() => setForm(f => ({ ...f, skills: f.skills.filter((_, si) => si !== i) }))} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                                    <X size={13} />
                                  </button>
                                </div>
                              )
                            })}
                            <button
                              onClick={() => setForm(f => ({ ...f, skills: [...f.skills, { id: 'guitar', minutes: 30 }] }))}
                              style={{ alignSelf: 'flex-start', background: 'none', border: '1px dashed var(--border)', borderRadius: '7px', color: 'var(--muted)', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}
                            >
                              + Lägg till
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => { setShowForm(false); setEditingEntry(null); setForm(EMPTY_FORM) }} className="btn btn-ghost">Avbryt</button>
                    <button onClick={saveEntry} className="btn btn-primary" disabled={saving || !form.content.trim()} style={{ fontSize: '12px', opacity: saving || !form.content.trim() ? 0.6 : 1 }}>
                      {saving ? <><Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> : <><Save size={13} /> {editingEntry ? 'Spara ändringar' : 'Spara'}</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {selectedEntries.length === 0 && !showForm && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  textAlign: 'center', gap: '10px', padding: '40px 0',
                }}>
                  <div style={{ fontSize: '28px', opacity: 0.12 }}>️</div>
                  <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6' }}>
                    Ingen entry loggad. Hur var dagen?
                  </div>
                  <button onClick={openNewForm} className="btn btn-primary" style={{ fontSize: '12px', marginTop: '4px' }}>
                    <Plus size={13} /> Skriv entry
                  </button>
                </div>
              )}

              {/* Entries */}
              {selectedEntries.map(entry => (
                <div key={entry.id} style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '14px',
                  transition: 'border-color 0.15s',
                }}>
                  {/* Entry header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {format(new Date(entry.created_at), 'HH:mm')}
                        {entry.is_travel_entry && ' ️'}
                      </span>
                      {entry.mood && <span style={{ fontSize: '11px', color: '#ec4899', fontWeight: '500' }}> {entry.mood}/10</span>}
                      {entry.energy && <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '500' }}> {entry.energy}/10</span>}
                      {entry.sleep_hours && <span style={{ fontSize: '11px', color: '#06b6d4', fontWeight: '500' }}> {entry.sleep_hours}h</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button onClick={() => openEditForm(entry)} style={{
                        background: 'var(--surface2)', border: '1px solid var(--border)',
                        borderRadius: '7px', padding: '4px 8px', cursor: 'pointer',
                        color: 'var(--muted)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent-border)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                        <Edit2 size={11} /> Redigera
                      </button>
                      <button onClick={() => deleteEntry(entry.id)} style={{
                        background: 'transparent', border: 'none',
                        borderRadius: '7px', padding: '4px 7px', cursor: 'pointer',
                        color: 'var(--muted)', fontSize: '11px', transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Content */}
                  <div
                    onClick={() => setViewEntry(viewEntry?.id === entry.id ? null : entry)}
                    style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--text)', cursor: 'pointer', marginBottom: entry.ai_summary ? '12px' : '0' }}>
                    {viewEntry?.id === entry.id ? entry.content : (entry.content?.slice(0, 200) + (entry.content?.length > 200 ? '…' : ''))}
                  </div>

                  {/* AI analysis */}
                  {viewEntry?.id === entry.id && entry.ai_summary && (
                    <div style={{ marginTop: '14px', padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: '10px', borderLeft: '2px solid var(--accent)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '6px', textTransform: 'uppercase' }}>Jarvis analys</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: '1.6', marginBottom: entry.ai_extracted_people?.length > 0 ? '10px' : '0' }}>{entry.ai_summary}</div>
                      {entry.ai_extracted_people?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: entry.ai_extracted_keywords?.length > 0 ? '6px' : '0' }}>
                          {entry.ai_extracted_people.map(p => (
                            <span key={p} style={{ padding: '2px 7px', borderRadius: '5px', background: 'rgba(16,185,129,0.1)', color: '#10b981', fontSize: '11px' }}> {p}</span>
                          ))}
                        </div>
                      )}
                      {entry.ai_extracted_keywords?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {entry.ai_extracted_keywords.map(k => (
                            <span key={k} style={{ padding: '2px 7px', borderRadius: '5px', background: 'var(--surface2)', color: 'var(--muted)', fontSize: '11px' }}>{k}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {analyzing && !entry.ai_summary && (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                      <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                      Jarvis analyserar...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
