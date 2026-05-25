import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, differenceInDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Plus, X, Save, Loader, BookOpen, GraduationCap,
  Upload, ExternalLink, Copy, Check, ChevronDown,
  ChevronUp, Trophy, Clock, Target, Archive, Zap
} from 'lucide-react'

const GRADES = ['—', 'U', 'G', 'VG']
const TERMS = ['Termin 1', 'Termin 2', 'Termin 3', 'Termin 4', 'Termin 5', 'Termin 6', 'Termin 7', 'Termin 8', 'Termin 9', 'Termin 10', 'Termin 11']

function CountdownBadge({ examDate }) {
  if (!examDate) return null
  const days = differenceInDays(parseISO(examDate), new Date())
  const color = days <= 7 ? '#ef4444' : days <= 14 ? '#f59e0b' : days <= 30 ? '#3b82f6' : '#10b981'
  return (
    <div className="mono" style={{ fontSize: '12px', color, fontWeight: '600', padding: '3px 8px', borderRadius: '6px', background: color + '15' }}>
      {days < 0 ? 'Passerad' : days === 0 ? 'IDAG' : `${days}d`}
    </div>
  )
}

function HoursPerDayCalc({ examDate, goalHours }) {
  if (!examDate || !goalHours) return null
  const days = differenceInDays(parseISO(examDate), new Date())
  if (days <= 0) return null
  const hpd = (goalHours / days).toFixed(1)
  return (
    <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <Clock size={11} />
      {hpd}h/dag för att hinna
    </div>
  )
}

export default function PluggPage() {
  const { user } = useAuth()
  const pdfRef = useRef()
  const [activeTab, setActiveTab] = useState('aktiva')
  const [courses, setCourses] = useState([])
  const [archivedCourses, setArchivedCourses] = useState([])
  const [studySessions, setStudySessions] = useState([])
  const [exams, setExams] = useState({}) // courseId -> exams[]
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [expandedExam, setExpandedExam] = useState(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [showNewArchive, setShowNewArchive] = useState(false)
  const [addingExamTo, setAddingExamTo] = useState(null)
  const [examForm, setExamForm] = useState({ name: '', exam_date: '', notes: '' })

  // Course form
  const [courseForm, setCourseForm] = useState({
    name: '', term: 'Termin 3', exam_date: '', goal_hours: '', notes: ''
  })

  // Archive form
  const [archiveForm, setArchiveForm] = useState({
    name: '', term: 'Termin 1', exam_date: '', grade: 'G', notes: ''
  })

  // Session form
  const [sessionForm, setSessionForm] = useState({
    course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd'),
    progress_notes: '', mastered_goals: []
  })

  // Learning goal form
  const [newGoal, setNewGoal] = useState('')
  const [addingGoalTo, setAddingGoalTo] = useState(null)
  const [goals, setGoals] = useState({}) // courseId -> goals[]

  useEffect(() => {
    if (user) { fetchCourses(); fetchStudySessions() }
  }, [user])

  async function fetchCourses() {
    const { data: active } = await supabase
      .from('courses')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('exam_date')

    const { data: archived } = await supabase
      .from('courses')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', false)
      .order('term')

    setCourses(active || [])
    setArchivedCourses(archived || [])

    const allIds = [...(active || []), ...(archived || [])].map(c => c.id)
    if (allIds.length > 0) {
      const [goalData, examData] = await Promise.all([
        supabase.from('learning_goals').select('*').in('course_id', allIds).order('created_at'),
        supabase.from('course_exams').select('*').in('course_id', allIds).order('exam_date'),
      ])

      const groupedGoals = {}
      for (const g of goalData.data || []) {
        if (!groupedGoals[g.course_id]) groupedGoals[g.course_id] = []
        groupedGoals[g.course_id].push(g)
      }
      setGoals(groupedGoals)

      const groupedExams = {}
      for (const e of examData.data || []) {
        if (!groupedExams[e.course_id]) groupedExams[e.course_id] = []
        groupedExams[e.course_id].push(e)
      }
      setExams(groupedExams)
    }
  }

  async function fetchStudySessions() {
    const { data } = await supabase
      .from('study_sessions')
      .select('*, courses(name)')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(20)
    setStudySessions(data || [])
  }

  async function saveCourse() {
    setSaving(true)
    await supabase.from('courses').insert({
      user_id: user.id,
      name: courseForm.name,
      term: courseForm.term,
      exam_date: courseForm.exam_date || null,
      active: true,
    })
    await fetchCourses()
    setCourseForm({ name: '', term: 'Termin 3', exam_date: '', goal_hours: '', notes: '' })
    setShowNewCourse(false)
    setSaving(false)
  }

  async function saveArchivedCourse() {
    setSaving(true)
    await supabase.from('courses').insert({
      user_id: user.id,
      name: archiveForm.name,
      term: archiveForm.term,
      exam_date: archiveForm.exam_date || null,
      active: false,
    })
    await fetchCourses()
    setArchiveForm({ name: '', term: 'Termin 1', exam_date: '', grade: 'G', notes: '' })
    setShowNewArchive(false)
    setSaving(false)
  }

  async function archiveCourse(courseId, grade) {
    await supabase.from('courses').update({ active: false }).eq('id', courseId)
    await fetchCourses()
  }

  async function saveExam(courseId) {
    if (!examForm.name.trim()) return
    setSaving(true)
    await supabase.from('course_exams').insert({
      user_id: user.id,
      course_id: courseId,
      name: examForm.name,
      exam_date: examForm.exam_date || null,
      notes: examForm.notes,
    })
    setExamForm({ name: '', exam_date: '', notes: '' })
    setAddingExamTo(null)
    await fetchCourses()
    setSaving(false)
  }

  async function updateExamGrade(examId, grade) {
    await supabase.from('course_exams').update({ grade }).eq('id', examId)
    await fetchCourses()
  }

  async function deleteExam(examId) {
    await supabase.from('course_exams').delete().eq('id', examId)
    await fetchCourses()
  }

  async function addGoal(courseId) {
    if (!newGoal.trim()) return
    await supabase.from('learning_goals').insert({
      user_id: user.id,
      course_id: courseId,
      description: newGoal.trim(),
    })
    setNewGoal('')
    setAddingGoalTo(null)
    await fetchCourses()
  }

  async function toggleGoal(goalId, completed) {
    await supabase.from('learning_goals').update({
      completed: !completed,
      completed_at: !completed ? new Date().toISOString() : null,
    }).eq('id', goalId)
    await fetchCourses()
  }

  async function deleteGoal(goalId) {
    await supabase.from('learning_goals').delete().eq('id', goalId)
    await fetchCourses()
  }

  async function saveStudySession() {
    setSaving(true)
    await supabase.from('study_sessions').insert({
      user_id: user.id,
      course_id: sessionForm.course_id || null,
      subject: sessionForm.subject,
      hours: parseFloat(sessionForm.hours),
      notes: sessionForm.notes,
      date: sessionForm.date,
    })

    // Update study score
    const score = Math.min(50 + parseFloat(sessionForm.hours || 0) * 10, 100)
    const { data: existing } = await supabase.from('daily_scores').select('*').eq('user_id', user.id).eq('date', sessionForm.date).single()
    if (existing) {
      await supabase.from('daily_scores').update({ score_study: Math.max(existing.score_study || 0, score) }).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({ user_id: user.id, date: sessionForm.date, score_study: score })
    }

    await fetchStudySessions()
    setSessionForm({ course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd'), progress_notes: '', mastered_goals: [] })
    setShowNewSession(false)
    setSaving(false)
  }

  // Generate Claude Pro study prompt
  function generateStudyPrompt(course, specificExam = null) {
    const courseGoals = goals[course.id] || []
    const courseExams = exams[course.id] || []
    const targetExam = specificExam || courseExams.find(e => e.exam_date && differenceInDays(parseISO(e.exam_date), new Date()) >= 0) || courseExams[0]
    const remaining = courseGoals.filter(g => !g.completed)
    const mastered = courseGoals.filter(g => g.completed)
    const daysLeft = targetExam?.exam_date ? differenceInDays(parseISO(targetExam.exam_date), new Date()) : null
    const recentSessions = studySessions.filter(s => s.course_id === course.id).slice(0, 3)

    const prompt = `Du är Jarvis, Sigges personliga AI-assistent och studiecoach. Du hjälper honom plugga inför ${course.name}.

KURS: ${course.name} (${course.term})
${targetExam ? `EXAMINATION: ${targetExam.name}${daysLeft !== null ? ` — ${daysLeft} dagar kvar` : ''}` : ''}
${targetExam?.notes ? `TENTAANTECKNINGAR: ${targetExam.notes}` : ''}

EXAMINATIONER I KURSEN:
${courseExams.map(e => `- ${e.name}${e.exam_date ? ` (${format(parseISO(e.exam_date), 'd MMM yyyy', { locale: sv })})` : ''}${e.grade ? ` — Betyg: ${e.grade}` : ''}`).join('\n') || 'Inga registrerade'}

LÄRANDEMÅL DU INTE BEHÄRSKAR ÄNNU (${remaining.length} st):
${remaining.map((g, i) => `${i + 1}. ${g.description}`).join('\n') || 'Inga kvar — bra jobbat!'}

LÄRANDEMÅL DU REDAN BEHÄRSKAR (${mastered.length} st):
${mastered.map(g => `✓ ${g.description}`).join('\n') || 'Inga ännu'}

SENASTE STUDIESESSIONER:
${recentSessions.map(s => `- ${s.date}: ${s.subject} (${s.hours}h)${s.notes ? ' — ' + s.notes : ''}`).join('\n') || 'Inga loggade ännu'}

SIGGES STUDIETEKNIK:
- Föredrar att förstå helheten och logiken, inte utantillkunskap
- Lär sig bäst genom dialog och att bli förhörd
- Gillar när du förklarar med resonemang och exempel
- Vill bli rättad precist när han har fel
- Hates sycophancy — var rak och ärlig om han inte kan något
- Pratar svenska

SÅ HÄR JOBBAR VI:
1. Börja med att fråga vilket lärandemål han vill jobba med, eller välj det viktigaste om han är osäker
2. Förklara konceptet kort och logiskt med ett resonemang han kan följa
3. Förhör honom med frågor — ge inte svaret direkt
4. Analysera hans svar och ge precis feedback
5. När han behärskar ett mål, säg det tydligt och gå vidare
6. Håll koll på vilka mål ni gått igenom under sessionen

Börja nu. Hälsa honom välkommen och fråga var han vill börja.`

    return prompt
  }

  async function copyStudyPrompt(course) {
    const prompt = generateStudyPrompt(course)
    await navigator.clipboard.writeText(prompt)
    setCopied(course.id)
    setTimeout(() => setCopied(null), 2000)
  }

  function openClaudePro(course, specificExam = null) {
    const prompt = generateStudyPrompt(course, specificExam)
    const encoded = encodeURIComponent(prompt)
    window.open(`https://claude.ai/new?q=${encoded}`, '_blank')
  }

  const tabs = [
    { id: 'aktiva',  label: 'Aktiva kurser' },
    { id: 'session', label: 'Studielogg' },
    { id: 'arkiv',   label: 'Arkiv' },
  ]

  const totalStudyHours = studySessions.reduce((sum, s) => sum + (s.hours || 0), 0)
  const thisWeekHours = studySessions
    .filter(s => differenceInDays(new Date(), parseISO(s.date)) <= 7)
    .reduce((sum, s) => sum + (s.hours || 0), 0)

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '600' }}>Plugg</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            <span style={{ marginRight: '12px' }}>📚 {courses.length} aktiva kurser</span>
            <span style={{ color: '#f59e0b' }}>⏱ {thisWeekHours.toFixed(1)}h denna vecka</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', borderRadius: '10px', padding: '4px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--surface3)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontWeight: '500', fontFamily: 'DM Sans, sans-serif',
            transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* AKTIVA KURSER */}
      {activeTab === 'aktiva' && (
        <>
          <button onClick={() => setShowNewCourse(true)} className="btn btn-primary" style={{ marginBottom: '16px' }}>
            <Plus size={14} /> Ny kurs
          </button>

          {/* New course form */}
          {showNewCourse && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Ny kurs</div>
                <button onClick={() => setShowNewCourse(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kursnamn</label>
                  <input className="input" placeholder="t.ex. Kardiovaskulär medicin" value={courseForm.name} onChange={e => setCourseForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Termin</label>
                  <select className="input" value={courseForm.term} onChange={e => setCourseForm(f => ({ ...f, term: e.target.value }))}>
                    {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Tentadatum</label>
                  <input className="input" type="date" value={courseForm.exam_date} onChange={e => setCourseForm(f => ({ ...f, exam_date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Pluggmål (timmar totalt)</label>
                  <input className="input" type="number" placeholder="40" value={courseForm.goal_hours} onChange={e => setCourseForm(f => ({ ...f, goal_hours: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewCourse(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveCourse} className="btn btn-primary" disabled={saving || !courseForm.name}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Course cards */}
          {courses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <GraduationCap size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga aktiva kurser</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {courses.map(course => {
                const courseGoals = goals[course.id] || []
                const completedGoals = courseGoals.filter(g => g.completed).length
                const totalGoals = courseGoals.length
                const progress = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0
                const isExpanded = expandedCourse === course.id
                const courseHours = studySessions.filter(s => s.course_id === course.id).reduce((sum, s) => sum + (s.hours || 0), 0)

                return (
                  <div key={course.id} className="card">
                    {/* Course header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ fontSize: '16px', fontWeight: '600' }}>{course.name}</div>
                          <CountdownBadge examDate={course.exam_date} />
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '12px' }}>
                          <span>{course.term}</span>
                          {course.exam_date && <span>Tenta: {format(parseISO(course.exam_date), 'd MMM yyyy', { locale: sv })}</span>}
                          <span>⏱ {courseHours.toFixed(1)}h loggat</span>
                        </div>
                      </div>
                      <button onClick={() => setExpandedCourse(isExpanded ? null : course.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>

                    {/* Progress bar */}
                    {totalGoals > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                          <span>Lärandemål</span>
                          <span>{completedGoals}/{totalGoals} klara</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#10b981' : '#3b82f6', borderRadius: '3px', transition: 'width 0.6s' }} />
                        </div>
                      </div>
                    )}

                    {/* Study with Claude Pro button */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: isExpanded ? '16px' : '0' }}>
                      <button onClick={() => openClaudePro(course)} style={{
                        flex: 1, padding: '10px', borderRadius: '8px',
                        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                        border: '1px solid rgba(139,92,246,0.3)',
                        color: '#a78bfa', cursor: 'pointer', fontSize: '13px',
                        fontFamily: 'DM Sans, sans-serif', fontWeight: '600',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        transition: 'all 0.15s',
                      }}>
                        <Zap size={14} /> Starta pluggsession i Claude
                        <ExternalLink size={12} />
                      </button>
                      <button onClick={() => copyStudyPrompt(course)} className="btn btn-ghost" style={{ padding: '10px 12px' }} title="Kopiera systemprompt">
                        {copied === course.id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                      </button>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>

                        {/* Learning goals */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>LÄRANDEMÅL</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                            {courseGoals.length === 0 && (
                              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Inga lärandemål ännu</div>
                            )}
                            {courseGoals.map(goal => (
                              <div key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <button onClick={() => toggleGoal(goal.id, goal.completed)} style={{
                                  width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, marginTop: '1px',
                                  border: `2px solid ${goal.completed ? '#10b981' : 'var(--border)'}`,
                                  background: goal.completed ? '#10b981' : 'transparent',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  {goal.completed && <Check size={10} color="white" />}
                                </button>
                                <span style={{ fontSize: '13px', flex: 1, color: goal.completed ? 'var(--muted)' : 'var(--text)', textDecoration: goal.completed ? 'line-through' : 'none', lineHeight: '1.5' }}>
                                  {goal.description}
                                </span>
                                <button onClick={() => deleteGoal(goal.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4, padding: '2px', flexShrink: 0 }}>
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Add goal */}
                          {addingGoalTo === course.id ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input className="input" placeholder="Nytt lärandemål..." value={newGoal}
                                onChange={e => setNewGoal(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addGoal(course.id)}
                                autoFocus style={{ fontSize: '13px' }} />
                              <button onClick={() => addGoal(course.id)} className="btn btn-primary" style={{ flexShrink: 0 }}>Lägg till</button>
                              <button onClick={() => { setAddingGoalTo(null); setNewGoal('') }} className="btn btn-ghost" style={{ flexShrink: 0 }}>Avbryt</button>
                            </div>
                          ) : (
                            <button onClick={() => setAddingGoalTo(course.id)} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                              <Plus size={12} /> Lägg till lärandemål
                            </button>
                          )}
                        </div>

                        {/* Hours calculator */}
                        {course.exam_date && (
                          <div style={{ padding: '10px 12px', background: 'var(--surface2)', borderRadius: '8px', marginBottom: '12px' }}>
                            <HoursPerDayCalc
                              examDate={course.exam_date}
                              goalHours={40 - courseHours}
                            />
                            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                              Baserat på 40h totalt pluggtid
                            </div>
                          </div>
                        )}

                        {/* Examinationer */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>EXAMINATIONER</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                            {(exams[course.id] || []).length === 0 && (
                              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Inga examinationer registrerade</div>
                            )}
                            {(exams[course.id] || []).map(exam => {
                              const daysLeft = exam.exam_date ? differenceInDays(parseISO(exam.exam_date), new Date()) : null
                              const isExpanded = expandedExam === exam.id
                              return (
                                <div key={exam.id} style={{ background: 'var(--surface2)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                  <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                    onClick={() => setExpandedExam(isExpanded ? null : exam.id)}>
                                    <div>
                                      <div style={{ fontSize: '13px', fontWeight: '500' }}>{exam.name}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                                        {exam.exam_date && format(parseISO(exam.exam_date), 'd MMM yyyy', { locale: sv })}
                                        {daysLeft !== null && daysLeft >= 0 && (
                                          <span style={{ color: daysLeft <= 7 ? '#ef4444' : '#f59e0b', marginLeft: '8px' }}>{daysLeft}d kvar</span>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {exam.grade && (
                                        <span className="mono" style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
                                          background: exam.grade === 'VG' ? 'rgba(16,185,129,0.15)' : exam.grade === 'G' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)',
                                          color: exam.grade === 'VG' ? '#10b981' : exam.grade === 'G' ? '#3b82f6' : '#ef4444',
                                        }}>{exam.grade}</span>
                                      )}
                                      <button onClick={e => { e.stopPropagation(); openClaudePro(course, exam) }}
                                        style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '6px', padding: '4px 8px', color: '#a78bfa', cursor: 'pointer', fontSize: '11px', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Zap size={11} /> Plugga
                                      </button>
                                      <button onClick={e => { e.stopPropagation(); deleteExam(exam.id) }}
                                        style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4 }}>
                                        <X size={12} />
                                      </button>
                                      {isExpanded ? <ChevronUp size={13} color="var(--muted)" /> : <ChevronDown size={13} color="var(--muted)" />}
                                    </div>
                                  </div>
                                  {isExpanded && (
                                    <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)' }}>
                                      {exam.notes && <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '10px' }}>{exam.notes}</div>}
                                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Sätt betyg:</div>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        {GRADES.filter(g => g !== '—').map(g => (
                                          <button key={g} onClick={() => updateExamGrade(exam.id, g)} style={{
                                            padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
                                            border: `1px solid ${exam.grade === g ? (g === 'VG' ? '#10b981' : g === 'G' ? '#3b82f6' : '#ef4444') : 'var(--border)'}`,
                                            background: exam.grade === g ? (g === 'VG' ? 'rgba(16,185,129,0.15)' : g === 'G' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent',
                                            color: exam.grade === g ? (g === 'VG' ? '#10b981' : g === 'G' ? '#3b82f6' : '#ef4444') : 'var(--muted)',
                                            fontSize: '13px', fontFamily: 'DM Sans, sans-serif', fontWeight: '600',
                                          }}>{g}</button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>

                          {/* Add exam */}
                          {addingExamTo === course.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
                              <input className="input" placeholder="Tentanamn, t.ex. Delexamination 1" value={examForm.name}
                                onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))} autoFocus style={{ fontSize: '13px' }} />
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <input className="input" type="date" value={examForm.exam_date}
                                  onChange={e => setExamForm(f => ({ ...f, exam_date: e.target.value }))} style={{ fontSize: '13px' }} />
                                <input className="input" placeholder="Anteckningar (valfritt)" value={examForm.notes}
                                  onChange={e => setExamForm(f => ({ ...f, notes: e.target.value }))} style={{ fontSize: '13px' }} />
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => saveExam(course.id)} className="btn btn-primary" style={{ fontSize: '12px' }} disabled={saving || !examForm.name}>
                                  {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />} Spara
                                </button>
                                <button onClick={() => { setAddingExamTo(null); setExamForm({ name: '', exam_date: '', notes: '' }) }} className="btn btn-ghost" style={{ fontSize: '12px' }}>Avbryt</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setAddingExamTo(course.id)} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                              <Plus size={12} /> Lägg till examination
                            </button>
                          )}
                        </div>

                        {/* Archive button */}
                        <button onClick={() => archiveCourse(course.id)} className="btn btn-ghost" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          <Archive size={12} /> Arkivera kurs
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* STUDIELOGG TAB */}
      {activeTab === 'session' && (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Denna vecka', value: `${thisWeekHours.toFixed(1)}h`, color: '#f59e0b' },
              { label: 'Totalt loggat', value: `${totalStudyHours.toFixed(1)}h`, color: '#3b82f6' },
              { label: 'Sessioner', value: studySessions.length, color: '#10b981' },
            ].map(({ label, value, color }) => (
              <div key={label} className="card">
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                <div className="mono" style={{ fontSize: '22px', fontWeight: '600', color }}>{value}</div>
              </div>
            ))}
          </div>

          <button onClick={() => setShowNewSession(true)} className="btn btn-primary" style={{ marginBottom: '16px' }}>
            <Plus size={14} /> Logga studiesession
          </button>

          {/* New session form */}
          {showNewSession && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Logga studiesession</div>
                <button onClick={() => setShowNewSession(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kurs</label>
                  <select className="input" value={sessionForm.course_id} onChange={e => setSessionForm(f => ({ ...f, course_id: e.target.value }))}>
                    <option value="">Välj kurs...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Ämne / vad du gick igenom</label>
                  <input className="input" placeholder="t.ex. RAAS-systemet, hjärtsvikt" value={sessionForm.subject} onChange={e => setSessionForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Timmar</label>
                  <input className="input" type="number" step="0.5" placeholder="2.0" value={sessionForm.hours} onChange={e => setSessionForm(f => ({ ...f, hours: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                  <input className="input" type="date" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Anteckningar / hur gick det?</label>
                <textarea className="input" rows={3} placeholder="Vad lärde du dig? Vad var svårt? Var du i flow?" value={sessionForm.notes} onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewSession(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveStudySession} className="btn btn-primary" disabled={saving || !sessionForm.hours}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Sessions list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {studySessions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
                <BookOpen size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <div>Inga studiesessioner loggade</div>
              </div>
            ) : studySessions.map(session => (
              <div key={session.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '3px' }}>{session.subject || 'Studiesession'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {session.courses?.name && <span style={{ marginRight: '8px' }}>📚 {session.courses.name}</span>}
                      {format(parseISO(session.date), 'd MMM', { locale: sv })}
                    </div>
                    {session.notes && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px', fontStyle: 'italic' }}>{session.notes}</div>}
                  </div>
                  <div className="mono" style={{ fontSize: '16px', fontWeight: '600', color: '#f59e0b', flexShrink: 0 }}>
                    {session.hours}h
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ARKIV TAB */}
      {activeTab === 'arkiv' && (
        <>
          <button onClick={() => setShowNewArchive(true)} className="btn btn-ghost" style={{ marginBottom: '16px', fontSize: '13px' }}>
            <Plus size={13} /> Lägg till avklarad kurs
          </button>

          {showNewArchive && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Lägg till avklarad kurs</div>
                <button onClick={() => setShowNewArchive(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kursnamn</label>
                  <input className="input" placeholder="t.ex. Anatomi och fysiologi" value={archiveForm.name} onChange={e => setArchiveForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Termin</label>
                  <select className="input" value={archiveForm.term} onChange={e => setArchiveForm(f => ({ ...f, term: e.target.value }))}>
                    {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Betyg</label>
                  <select className="input" value={archiveForm.grade} onChange={e => setArchiveForm(f => ({ ...f, grade: e.target.value }))}>
                    {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Tentadatum (valfritt)</label>
                  <input className="input" type="date" value={archiveForm.exam_date} onChange={e => setArchiveForm(f => ({ ...f, exam_date: e.target.value }))} />
                </div>
              </div>
              <input className="input" placeholder="Anteckningar (valfritt)" value={archiveForm.notes} onChange={e => setArchiveForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: '12px' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewArchive(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveArchivedCourse} className="btn btn-primary" disabled={saving || !archiveForm.name}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {/* Archived courses grouped by term */}
          {archivedCourses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <Archive size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga arkiverade kurser ännu</div>
            </div>
          ) : (
            Object.entries(
              archivedCourses.reduce((acc, c) => {
                if (!acc[c.term]) acc[c.term] = []
                acc[c.term].push(c)
                return acc
              }, {})
            ).sort(([a], [b]) => a.localeCompare(b)).map(([term, termCourses]) => (
              <div key={term} style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px' }}>{term.toUpperCase()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {termCourses.map(course => (
                    <div key={course.id} className="card-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>{course.name}</div>
                        {course.exam_date && (
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                            {format(parseISO(course.exam_date), 'd MMM yyyy', { locale: sv })}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="mono" style={{
                          fontSize: '14px', fontWeight: '600', padding: '4px 10px', borderRadius: '6px',
                          background: course.grade === 'VG' ? 'rgba(16,185,129,0.15)' : course.grade === 'G' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)',
                          color: course.grade === 'VG' ? '#10b981' : course.grade === 'G' ? '#3b82f6' : '#ef4444',
                        }}>
                          {course.grade || '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
