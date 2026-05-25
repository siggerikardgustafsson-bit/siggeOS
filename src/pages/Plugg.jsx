import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, differenceInDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Plus, X, Save, Loader, BookOpen, GraduationCap,
  ExternalLink, Copy, Check, ChevronDown, ChevronUp,
  Archive, Zap, Upload
} from 'lucide-react'

const GRADES = ['IG', 'G']
const TERMS = ['Termin 1','Termin 2','Termin 3','Termin 4','Termin 5','Termin 6',
               'Termin 7','Termin 8','Termin 9','Termin 10','Termin 11']

function CountdownBadge({ examDate }) {
  if (!examDate) return null
  const days = differenceInDays(parseISO(examDate), new Date())
  const color = days <= 7 ? '#ef4444' : days <= 14 ? '#f59e0b' : days <= 30 ? '#3b82f6' : '#10b981'
  return (
    <div className="mono" style={{ fontSize: '12px', color, fontWeight: '600',
      padding: '3px 8px', borderRadius: '6px', background: color + '15' }}>
      {days < 0 ? 'Passerad' : days === 0 ? 'IDAG' : `${days}d`}
    </div>
  )
}

export default function PluggPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('aktiva')
  const [courses, setCourses] = useState([])
  const [archivedCourses, setArchivedCourses] = useState([])
  const [studySessions, setStudySessions] = useState([])
  const [exams, setExams] = useState({})
  const [goals, setGoals] = useState({}) // examId -> goals[]
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [expandedExam, setExpandedExam] = useState(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [uploadingGoalsPdf, setUploadingGoalsPdf] = useState(null)
  const [uploadingOldExam, setUploadingOldExam] = useState(null)
  const [estimatingTime, setEstimatingTime] = useState(null)
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [showNewArchive, setShowNewArchive] = useState(false)
  const [addingExamTo, setAddingExamTo] = useState(null)
  const [examForm, setExamForm] = useState({ name: '', exam_date: '', notes: '' })
  const [newGoal, setNewGoal] = useState('')
  const [addingGoalTo, setAddingGoalTo] = useState(null) // examId
  const [courseForm, setCourseForm] = useState({ name: '', term: 'Termin 3', end_date: '', notes: '' })
  const [archiveForm, setArchiveForm] = useState({ name: '', term: 'Termin 1', end_date: '', grade: 'G', points_earned: '', points_max: '' })
  const [sessionForm, setSessionForm] = useState({
    course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd')
  })

  useEffect(() => { if (user) { fetchCourses(); fetchStudySessions() } }, [user])

  async function fetchCourses() {
    const { data: active } = await supabase.from('courses').select('*')
      .eq('user_id', user.id).eq('active', true).order('exam_date')
    const { data: archived } = await supabase.from('courses').select('*')
      .eq('user_id', user.id).eq('active', false).order('term')
    setCourses(active || [])
    setArchivedCourses(archived || [])

    const allIds = [...(active || []), ...(archived || [])].map(c => c.id)
    if (allIds.length > 0) {
      const [eRes, gRes] = await Promise.all([
        supabase.from('course_exams').select('*').in('course_id', allIds).order('exam_date'),
        supabase.from('learning_goals').select('*').in('course_id', allIds).order('created_at'),
      ])

      const eMap = {}
      for (const e of eRes.data || []) {
        if (!eMap[e.course_id]) eMap[e.course_id] = []
        eMap[e.course_id].push(e)
      }
      setExams(eMap)

      // Group goals by exam_id (if set) or fall back to course-level (exam_id null)
      const gMap = {}
      for (const g of gRes.data || []) {
        const key = g.exam_id || `course_${g.course_id}`
        if (!gMap[key]) gMap[key] = []
        gMap[key].push(g)
      }
      setGoals(gMap)
    }
  }

  async function fetchStudySessions() {
    const { data } = await supabase.from('study_sessions')
      .select('*, courses(name)').eq('user_id', user.id)
      .order('date', { ascending: false }).limit(20)
    setStudySessions(data || [])
  }

  async function saveCourse() {
    setSaving(true)
    await supabase.from('courses').insert({
      user_id: user.id, name: courseForm.name, term: courseForm.term,
      exam_date: courseForm.end_date || null, active: true,
    })
    await fetchCourses()
    setCourseForm({ name: '', term: 'Termin 3', end_date: '', notes: '' })
    setShowNewCourse(false)
    setSaving(false)
  }

  async function saveCourseEdit(courseId) {
    setSaving(true)
    await supabase.from('courses').update({
      name: editForm.name, term: editForm.term,
      exam_date: editForm.end_date || null,
    }).eq('id', courseId)
    setEditingCourse(null)
    await fetchCourses()
    setSaving(false)
  }

  async function saveArchivedCourse() {
    setSaving(true)
    await supabase.from('courses').insert({
      user_id: user.id, name: archiveForm.name, term: archiveForm.term,
      exam_date: archiveForm.end_date || null,
      grade: archiveForm.grade,
      points_earned: archiveForm.points_earned ? parseFloat(archiveForm.points_earned) : null,
      points_max: archiveForm.points_max ? parseFloat(archiveForm.points_max) : null,
      active: false,
    })
    await fetchCourses()
    setArchiveForm({ name: '', term: 'Termin 1', end_date: '', grade: 'G', points_earned: '', points_max: '' })
    setShowNewArchive(false)
    setSaving(false)
  }

  async function archiveCourse(courseId) {
    await supabase.from('courses').update({ active: false }).eq('id', courseId)
    await fetchCourses()
  }

  async function saveExam(courseId) {
    if (!examForm.name.trim()) return
    setSaving(true)
    await supabase.from('course_exams').insert({
      user_id: user.id, course_id: courseId, name: examForm.name,
      exam_date: examForm.exam_date || null, notes: examForm.notes,
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

  async function addGoal(examId, courseId) {
    if (!newGoal.trim()) return
    await supabase.from('learning_goals').insert({
      user_id: user.id, course_id: courseId,
      exam_id: examId, description: newGoal.trim(),
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
      user_id: user.id, course_id: sessionForm.course_id || null,
      subject: sessionForm.subject, hours: parseFloat(sessionForm.hours),
      notes: sessionForm.notes, date: sessionForm.date,
    })
    const score = Math.min(50 + parseFloat(sessionForm.hours || 0) * 10, 100)
    const { data: existing } = await supabase.from('daily_scores').select('*')
      .eq('user_id', user.id).eq('date', sessionForm.date).single()
    if (existing) {
      await supabase.from('daily_scores').update({ score_study: Math.max(existing.score_study || 0, score) }).eq('id', existing.id)
    } else {
      await supabase.from('daily_scores').insert({ user_id: user.id, date: sessionForm.date, score_study: score })
    }
    await fetchStudySessions()
    setSessionForm({ course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd') })
    setShowNewSession(false)
    setSaving(false)
  }

  async function handleGoalsPdfUpload(e, examId, courseId) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingGoalsPdf(examId)
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extrahera alla lärandemål från detta dokument. Returnera ENBART ett JSON-objekt med nyckeln "goals" som är en array av strängar. Inga backticks.' }
          ]}],
          context: '',
          systemPrompt: 'Returnera alltid bara JSON utan backticks.',
        },
      })
      if (data?.content) {
        try {
          const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
          if (parsed.goals?.length > 0) {
            await supabase.from('learning_goals').insert(
              parsed.goals.map(g => ({
                user_id: user.id, course_id: courseId,
                exam_id: examId, description: g, source_file: file.name
              }))
            )
            await fetchCourses()
          }
        } catch { /* ignore */ }
      }
    } catch (err) { console.error(err) }
    setUploadingGoalsPdf(null)
    e.target.value = ''
  }

  async function handleOldExamUpload(e, examId) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingOldExam(examId)
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: 'Extrahera hela innehållet i detta tentadokument som text. Behåll alla frågor och svar. Returnera bara texten.' }
          ]}],
          context: '',
          systemPrompt: 'Du extraherar text från tentadokument. Returnera bara texten.',
        },
      })
      if (data?.content) {
        await supabase.from('course_exams').update({
          old_exam_content: data.content,
          old_exam_filename: file.name,
        }).eq('id', examId)
        await fetchCourses()
      }
    } catch (err) { console.error(err) }
    setUploadingOldExam(null)
    e.target.value = ''
  }

  async function estimateStudyTime(course) {
    const allExams = exams[course.id] || []
    const allGoals = allExams.flatMap(e => goals[e.id] || [])
    if (allGoals.length === 0) return
    setEstimatingTime(course.id)
    try {
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{ role: 'user', content:
            `Uppskatta studietimmar för "${course.name}" (${course.term}, KI) baserat på ${allGoals.length} lärandemål. Returnera JSON: {"hours": <tal>, "reasoning": "<2 meningar svenska>"}\n${allGoals.map((g,i) => `${i+1}. ${g.description}`).join('\n')}`
          }],
          context: '',
          systemPrompt: 'Returnera bara JSON utan backticks.',
        },
      })
      if (data?.content) {
        try {
          const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
          await supabase.from('courses').update({
            ai_time_hours: parsed.hours, ai_time_estimate: parsed.reasoning
          }).eq('id', course.id)
          await fetchCourses()
        } catch { /* ignore */ }
      }
    } catch (err) { console.error(err) }
    setEstimatingTime(null)
  }

  function generateStudyPrompt(course, specificExam = null) {
    const courseExams = exams[course.id] || []
    const targetExam = specificExam || courseExams[0]
    const examGoals = targetExam ? (goals[targetExam.id] || []) : []
    const remaining = examGoals.filter(g => !g.completed)
    const mastered = examGoals.filter(g => g.completed)
    const daysLeft = targetExam?.exam_date ? differenceInDays(parseISO(targetExam.exam_date), new Date()) : null
    const recentSessions = studySessions.filter(s => s.course_id === course.id).slice(0, 3)

    return `Du är Jarvis, Sigges studiecoach för ${course.name}.

KURS: ${course.name} (${course.term})
${targetExam ? `EXAMINATION: ${targetExam.name}${daysLeft !== null ? ` — ${daysLeft} dagar kvar` : ''}` : ''}
${targetExam?.old_exam_filename ? `GAMMAL TENTA TILLGÄNGLIG: ${targetExam.old_exam_filename}` : ''}
${targetExam?.old_exam_content ? `\nGAMMAL TENTA (använd för att förstå examinationsformatet):\n${targetExam.old_exam_content.slice(0, 2000)}` : ''}

EXAMINATIONER:
${courseExams.map(e => `- ${e.name}${e.exam_date ? ` (${format(parseISO(e.exam_date), 'd MMM yyyy', { locale: sv })})` : ''}${e.grade ? ` — ${e.grade}` : ''}`).join('\n') || 'Inga'}

LÄRANDEMÅL EJ BEHÄRSKADE (${remaining.length} st):
${remaining.map((g,i) => `${i+1}. ${g.description}`).join('\n') || 'Inga kvar!'}

LÄRANDEMÅL BEHÄRSKADE (${mastered.length} st):
${mastered.map(g => `✓ ${g.description}`).join('\n') || 'Inga ännu'}

SENASTE SESSIONER:
${recentSessions.map(s => `- ${s.date}: ${s.subject} (${s.hours}h)`).join('\n') || 'Inga'}

SIGGES STUDIETEKNIK: Förstår logik och resonemang, inte utantill. Lär via dialog. Vill bli rättad precist. Hatar sycophancy. Pratar svenska.

Börja: välj viktigaste lärandemålet → förklara kort → förhör → precis feedback → när behärskat, gå vidare. Hälsa honom välkommen och börja.`
  }

  async function copyStudyPrompt(course) {
    await navigator.clipboard.writeText(generateStudyPrompt(course))
    setCopied(course.id)
    setTimeout(() => setCopied(null), 2000)
  }

  function openClaudePro(course, specificExam = null) {
    window.open(`https://claude.ai/new?q=${encodeURIComponent(generateStudyPrompt(course, specificExam))}`, '_blank')
  }

  const tabs = [
    { id: 'aktiva', label: 'Aktiva kurser' },
    { id: 'session', label: 'Studielogg' },
    { id: 'arkiv', label: 'Arkiv' },
  ]

  const totalStudyHours = studySessions.reduce((sum, s) => sum + (s.hours || 0), 0)
  const thisWeekHours = studySessions
    .filter(s => differenceInDays(new Date(), parseISO(s.date)) <= 7)
    .reduce((sum, s) => sum + (s.hours || 0), 0)

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '600' }}>Plugg</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
            <span style={{ marginRight: '12px' }}>📚 {courses.length} aktiva kurser</span>
            <span style={{ color: '#f59e0b' }}>⏱ {thisWeekHours.toFixed(1)}h denna vecka</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', borderRadius: '10px', padding: '4px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--surface3)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontWeight: '500', fontFamily: 'DM Sans, sans-serif', transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ===== AKTIVA KURSER ===== */}
      {activeTab === 'aktiva' && (
        <>
          <button onClick={() => setShowNewCourse(true)} className="btn btn-primary" style={{ marginBottom: '16px' }}>
            <Plus size={14} /> Ny kurs
          </button>

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
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Slutdatum (kursens slut)</label>
                  <input className="input" type="date" value={courseForm.end_date} onChange={e => setCourseForm(f => ({ ...f, end_date: e.target.value }))} />
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

          {courses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <GraduationCap size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga aktiva kurser</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {courses.map(course => {
                const courseExams = exams[course.id] || []
                const allGoals = courseExams.flatMap(e => goals[e.id] || [])
                const completedGoals = allGoals.filter(g => g.completed).length
                const totalGoals = allGoals.length
                const progress = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0
                const isExpanded = expandedCourse === course.id
                const courseHours = studySessions.filter(s => s.course_id === course.id).reduce((sum, s) => sum + (s.hours || 0), 0)

                return (
                  <div key={course.id} className="card">
                    {editingCourse === course.id ? (
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '12px', color: 'var(--blue)' }}>Redigera kurs</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Kursnamn</label>
                            <input className="input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Termin</label>
                            <select className="input" value={editForm.term} onChange={e => setEditForm(f => ({ ...f, term: e.target.value }))}>
                              {TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Slutdatum</label>
                            <input className="input" type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => saveCourseEdit(course.id)} className="btn btn-primary" disabled={saving}>
                            {saving ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={13} />} Spara
                          </button>
                          <button onClick={() => setEditingCourse(null)} className="btn btn-ghost">Avbryt</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <div style={{ fontSize: '16px', fontWeight: '600' }}>{course.name}</div>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                              <span>{course.term}</span>
                              {course.exam_date && <span>Slutar: {format(parseISO(course.exam_date), 'd MMM yyyy', { locale: sv })}</span>}
                              <span>⏱ {courseHours.toFixed(1)}h loggat</span>
                              {course.ai_time_hours && <span style={{ color: '#f59e0b' }}>🤖 ~{course.ai_time_hours}h uppskattat</span>}
                            </div>
                            {course.ai_time_estimate && (
                              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '3px', fontStyle: 'italic' }}>{course.ai_time_estimate}</div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => { setEditingCourse(course.id); setEditForm({ name: course.name, term: course.term, end_date: course.exam_date || '' }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '14px' }}>✏️</button>
                            <button onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>

                        {totalGoals > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                              <span>Lärandemål (alla examinationer)</span>
                              <span>{completedGoals}/{totalGoals} klara</span>
                            </div>
                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${progress}%`, background: progress === 100 ? '#10b981' : '#3b82f6', borderRadius: '3px', transition: 'width 0.6s' }} />
                            </div>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginBottom: isExpanded ? '16px' : '0' }}>
                          <button onClick={() => openClaudePro(course)} style={{
                            flex: 1, padding: '10px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
                            border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', cursor: 'pointer',
                            fontSize: '13px', fontFamily: 'DM Sans, sans-serif', fontWeight: '600',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          }}>
                            <Zap size={14} /> Starta pluggsession i Claude <ExternalLink size={12} />
                          </button>
                          <button onClick={() => copyStudyPrompt(course)} className="btn btn-ghost" style={{ padding: '10px 12px' }}>
                            {copied === course.id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                          </button>
                          {allGoals.length > 0 && (
                            <button onClick={() => estimateStudyTime(course)} className="btn btn-ghost" style={{ padding: '10px 12px', fontSize: '12px' }}>
                              {estimatingTime === course.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : '🤖'}
                            </button>
                          )}
                        </div>
                      </>
                    )}

                    {isExpanded && editingCourse !== course.id && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>

                        {/* Examinationer */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>EXAMINATIONER</div>

                          {courseExams.length === 0 && (
                            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '10px' }}>Inga examinationer — lägg till nedan</div>
                          )}

                          {courseExams.map(exam => {
                            const daysLeft = exam.exam_date ? differenceInDays(parseISO(exam.exam_date), new Date()) : null
                            const isExamExpanded = expandedExam === exam.id
                            const examGoals = goals[exam.id] || []
                            const examCompleted = examGoals.filter(g => g.completed).length

                            return (
                              <div key={exam.id} style={{ marginBottom: '10px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                                {/* Exam header */}
                                <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                  onClick={() => setExpandedExam(isExamExpanded ? null : exam.id)}>
                                  <div>
                                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{exam.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', display: 'flex', gap: '10px' }}>
                                      {exam.exam_date && <span>{format(parseISO(exam.exam_date), 'd MMM yyyy', { locale: sv })}</span>}
                                      {daysLeft !== null && daysLeft >= 0 && <span style={{ color: daysLeft <= 7 ? '#ef4444' : '#f59e0b' }}>{daysLeft}d kvar</span>}
                                      {examGoals.length > 0 && <span>{examCompleted}/{examGoals.length} mål klara</span>}
                                      {exam.old_exam_filename && <span style={{ color: '#10b981' }}>📄 {exam.old_exam_filename}</span>}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {exam.grade && (
                                      <span className="mono" style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
                                        background: exam.grade === 'G' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                        color: exam.grade === 'G' ? '#10b981' : '#ef4444',
                                      }}>{exam.grade}</span>
                                    )}
                                    <button onClick={e => { e.stopPropagation(); openClaudePro(course, exam) }}
                                      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)',
                                        borderRadius: '6px', padding: '4px 8px', color: '#a78bfa', cursor: 'pointer',
                                        fontSize: '11px', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <Zap size={11} /> Plugga
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); deleteExam(exam.id) }}
                                      style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4 }}>
                                      <X size={12} />
                                    </button>
                                    {isExamExpanded ? <ChevronUp size={13} color="var(--muted)" /> : <ChevronDown size={13} color="var(--muted)" />}
                                  </div>
                                </div>

                                {isExamExpanded && (
                                  <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>

                                    {/* Betyg */}
                                    <div style={{ marginBottom: '14px' }}>
                                      <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Betyg:</div>
                                      <div style={{ display: 'flex', gap: '6px' }}>
                                        {GRADES.map(g => (
                                          <button key={g} onClick={() => updateExamGrade(exam.id, g)} style={{
                                            padding: '5px 14px', borderRadius: '6px', cursor: 'pointer',
                                            border: `1px solid ${exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--border)'}`,
                                            background: exam.grade === g ? (g === 'G' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)') : 'transparent',
                                            color: exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--muted)',
                                            fontSize: '13px', fontFamily: 'DM Sans, sans-serif', fontWeight: '600',
                                          }}>{g}</button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* PDF buttons */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                      <input type="file" accept=".pdf" style={{ display: 'none' }} id={`goals-${exam.id}`}
                                        onChange={e => handleGoalsPdfUpload(e, exam.id, exam.course_id)} />
                                      <label htmlFor={`goals-${exam.id}`} style={{
                                        padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--border)',
                                        color: 'var(--muted)', cursor: 'pointer', fontSize: '12px',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                      }}>
                                        {uploadingGoalsPdf === exam.id
                                          ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Importerar...</>
                                          : <><Upload size={11} /> Importera lärandemål (PDF)</>}
                                      </label>

                                      <input type="file" accept=".pdf" style={{ display: 'none' }} id={`oldexam-${exam.id}`}
                                        onChange={e => handleOldExamUpload(e, exam.id)} />
                                      <label htmlFor={`oldexam-${exam.id}`} style={{
                                        padding: '7px 12px', borderRadius: '6px',
                                        border: `1px solid ${exam.old_exam_filename ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                                        color: exam.old_exam_filename ? '#10b981' : 'var(--muted)',
                                        cursor: 'pointer', fontSize: '12px',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        background: exam.old_exam_filename ? 'rgba(16,185,129,0.06)' : 'transparent',
                                      }}>
                                        {uploadingOldExam === exam.id
                                          ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</>
                                          : exam.old_exam_filename
                                            ? <><Check size={11} /> {exam.old_exam_filename}</>
                                            : <><Upload size={11} /> Ladda upp gammal tenta (PDF)</>}
                                      </label>
                                    </div>

                                    {/* Learning goals for this exam */}
                                    <div>
                                      <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '8px' }}>
                                        LÄRANDEMÅL ({examGoals.length})
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                        {examGoals.length === 0 && (
                                          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Inga lärandemål — importera PDF eller lägg till manuellt</div>
                                        )}
                                        {examGoals.map(goal => (
                                          <div key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                            <button onClick={() => toggleGoal(goal.id, goal.completed)} style={{
                                              width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0, marginTop: '1px',
                                              border: `2px solid ${goal.completed ? '#10b981' : 'var(--border)'}`,
                                              background: goal.completed ? '#10b981' : 'transparent',
                                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                              {goal.completed && <Check size={10} color="white" />}
                                            </button>
                                            <span style={{ fontSize: '13px', flex: 1, lineHeight: '1.5',
                                              color: goal.completed ? 'var(--muted)' : 'var(--text)',
                                              textDecoration: goal.completed ? 'line-through' : 'none' }}>
                                              {goal.description}
                                              {goal.source_file && <span style={{ fontSize: '10px', color: 'var(--muted)', marginLeft: '6px' }}>📄</span>}
                                            </span>
                                            <button onClick={() => deleteGoal(goal.id)}
                                              style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', opacity: 0.4, padding: '2px', flexShrink: 0 }}>
                                              <X size={12} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>

                                      {addingGoalTo === exam.id ? (
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                          <input className="input" placeholder="Nytt lärandemål..." value={newGoal}
                                            onChange={e => setNewGoal(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addGoal(exam.id, exam.course_id)}
                                            autoFocus style={{ fontSize: '13px' }} />
                                          <button onClick={() => addGoal(exam.id, exam.course_id)} className="btn btn-primary" style={{ flexShrink: 0 }}>Lägg till</button>
                                          <button onClick={() => { setAddingGoalTo(null); setNewGoal('') }} className="btn btn-ghost" style={{ flexShrink: 0 }}>Avbryt</button>
                                        </div>
                                      ) : (
                                        <button onClick={() => setAddingGoalTo(exam.id)} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                                          <Plus size={12} /> Lägg till manuellt
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}

                          {/* Add exam */}
                          {addingExamTo === course.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--surface2)', borderRadius: '8px' }}>
                              <input className="input" placeholder="t.ex. Delexamination 1" value={examForm.name}
                                onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))} autoFocus />
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div>
                                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Tentadatum</label>
                                  <input className="input" type="date" value={examForm.exam_date}
                                    onChange={e => setExamForm(f => ({ ...f, exam_date: e.target.value }))} />
                                </div>
                                <div>
                                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Anteckningar</label>
                                  <input className="input" placeholder="Valfritt" value={examForm.notes}
                                    onChange={e => setExamForm(f => ({ ...f, notes: e.target.value }))} />
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => saveExam(course.id)} className="btn btn-primary" disabled={saving || !examForm.name}>
                                  <Save size={12} /> Spara
                                </button>
                                <button onClick={() => { setAddingExamTo(null); setExamForm({ name: '', exam_date: '', notes: '' }) }}
                                  className="btn btn-ghost">Avbryt</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setAddingExamTo(course.id)} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                              <Plus size={12} /> Lägg till examination
                            </button>
                          )}
                        </div>

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

      {/* ===== STUDIELOGG ===== */}
      {activeTab === 'session' && (
        <>
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
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Ämne</label>
                  <input className="input" placeholder="t.ex. RAAS-systemet" value={sessionForm.subject} onChange={e => setSessionForm(f => ({ ...f, subject: e.target.value }))} />
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
              <textarea className="input" rows={2} placeholder="Anteckningar..." value={sessionForm.notes}
                onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} style={{ resize: 'vertical', marginBottom: '12px' }} />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewSession(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveStudySession} className="btn btn-primary" disabled={saving || !sessionForm.hours}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

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
                    {session.notes && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px', fontStyle: 'italic' }}>{session.notes}</div>}
                  </div>
                  <div className="mono" style={{ fontSize: '16px', fontWeight: '600', color: '#f59e0b' }}>{session.hours}h</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== ARKIV ===== */}
      {activeTab === 'arkiv' && (
        <>
          <button onClick={() => setShowNewArchive(true)} className="btn btn-ghost" style={{ marginBottom: '16px', fontSize: '13px' }}>
            <Plus size={13} /> Lägg till avklarad kurs
          </button>

          {showNewArchive && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ fontWeight: '600' }}>Avklarad kurs</div>
                <button onClick={() => setShowNewArchive(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kursnamn</label>
                  <input className="input" placeholder="t.ex. Anatomi" value={archiveForm.name} onChange={e => setArchiveForm(f => ({ ...f, name: e.target.value }))} />
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
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Slutdatum</label>
                  <input className="input" type="date" value={archiveForm.end_date} onChange={e => setArchiveForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Poäng (valfritt)</label>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input className="input" type="number" placeholder="45" value={archiveForm.points_earned}
                      onChange={e => setArchiveForm(f => ({ ...f, points_earned: e.target.value }))} style={{ flex: 1 }} />
                    <span style={{ color: 'var(--muted)', fontSize: '13px' }}>av</span>
                    <input className="input" type="number" placeholder="60" value={archiveForm.points_max}
                      onChange={e => setArchiveForm(f => ({ ...f, points_max: e.target.value }))} style={{ flex: 1 }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewArchive(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveArchivedCourse} className="btn btn-primary" disabled={saving || !archiveForm.name}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {archivedCourses.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>
              <Archive size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga arkiverade kurser</div>
            </div>
          ) : Object.entries(
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
                      {course.end_date && (
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                          {format(parseISO(course.exam_date), 'd MMM yyyy', { locale: sv })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {course.points_earned && course.points_max && (
                        <span className="mono" style={{ fontSize: '12px', color: 'var(--muted)' }}>
                          {course.points_earned}/{course.points_max}p
                        </span>
                      )}
                      <div className="mono" style={{
                        fontSize: '14px', fontWeight: '600', padding: '4px 10px', borderRadius: '6px',
                        background: course.grade === 'G' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: course.grade === 'G' ? '#10b981' : '#ef4444',
                      }}>{course.grade || '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
