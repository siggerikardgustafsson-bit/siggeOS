import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { format, differenceInDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Plus, X, Save, Loader, BookOpen, GraduationCap,
  ExternalLink, Copy, Check, ChevronDown, ChevronUp,
  Archive, Zap, Upload, FileText, Trash2
} from 'lucide-react'

const GRADES = ['IG', 'G']
const TERMS = ['Termin 1','Termin 2','Termin 3','Termin 4','Termin 5','Termin 6',
               'Termin 7','Termin 8','Termin 9','Termin 10','Termin 11']

function CountdownBadge({ examDate }) {
  if (!examDate) return null
  const days = differenceInDays(parseISO(examDate), new Date())
  const color = days < 0 ? '#6b7280' : days <= 7 ? '#ef4444' : days <= 14 ? '#f59e0b' : days <= 30 ? '#3b82f6' : '#10b981'
  return (
    <div className="mono" style={{ fontSize: '11px', color, fontWeight: '600',
      padding: '2px 7px', borderRadius: '5px', background: color + '15', flexShrink: 0 }}>
      {days < 0 ? 'Avklarad' : days === 0 ? 'IDAG' : `${days}d`}
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
  const [goals, setGoals] = useState({})
  const [examFiles, setExamFiles] = useState({})
  const [archivedFiles, setArchivedFiles] = useState({})
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [expandedExam, setExpandedExam] = useState(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [uploadingGoalsPdf, setUploadingGoalsPdf] = useState(null)
  const [uploadingOldExam, setUploadingOldExam] = useState(null)
  const [uploadingArchivePdf, setUploadingArchivePdf] = useState(null)
  const [estimatingTime, setEstimatingTime] = useState(null)
  const [showNewCourse, setShowNewCourse] = useState(false)
  const [showNewSession, setShowNewSession] = useState(false)
  const [showNewArchive, setShowNewArchive] = useState(false)
  const [addingExamTo, setAddingExamTo] = useState(null)
  const [examForm, setExamForm] = useState({ name: '', exam_date: '', notes: '' })
  const [editingExamPoints, setEditingExamPoints] = useState(null)
  const [examPointsForm, setExamPointsForm] = useState({ points_earned: '', points_max: '' })
  const [newGoal, setNewGoal] = useState('')
  const [addingGoalTo, setAddingGoalTo] = useState(null)
  const [courseForm, setCourseForm] = useState({ name: '', term: 'Termin 3', end_date: '' })
  const [archiveForm, setArchiveForm] = useState({ name: '', term: 'Termin 1', end_date: '', grade: 'G', points_earned: '', points_max: '' })
  const [sessionForm, setSessionForm] = useState({
    course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd')
  })
  const [mandatorySessions, setMandatorySessions] = useState({})
  const [mandatoryUnmatched, setMandatoryUnmatched] = useState([])
  const [syncingMandatory, setSyncingMandatory] = useState(false)

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    await Promise.all([fetchCourses(), fetchStudySessions(), fetchMandatory()])
  }

  async function fetchMandatory() {
    const { data } = await supabase
      .from('mandatory_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
    const matched = {}
    const unmatched = []
    for (const s of data || []) {
      if (s.course_id) {
        if (!matched[s.course_id]) matched[s.course_id] = []
        matched[s.course_id].push(s)
      } else {
        unmatched.push(s)
      }
    }
    setMandatorySessions(matched)
    setMandatoryUnmatched(unmatched)
  }

  async function syncMandatory() {
    setSyncingMandatory(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?action=mandatory`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        }
      })
      const data = await res.json()
      alert(`Synkade ${data.synced || 0} obligatoriska moment`)
      await fetchMandatory()
    } catch(e) { alert('Sync misslyckades') }
    setSyncingMandatory(false)
  }

  async function toggleMandatoryAttended(id, current) {
    await supabase.from('mandatory_sessions').update({ attended: !current }).eq('id', id)
    await fetchMandatory()
  }

  async function fetchCourses() {
    const { data: activeCourses } = await supabase
      .from('courses').select('*').eq('user_id', user.id).eq('active', true).order('created_at')
    const { data: archived } = await supabase
      .from('courses').select('*').eq('user_id', user.id).eq('active', false).order('created_at', { ascending: false })

    const allIds = [...(activeCourses || []), ...(archived || [])].map(c => c.id)
    if (allIds.length === 0) { setCourses([]); setArchivedCourses([]); return }

    const [examsRes, goalsRes, examFilesRes, archFilesRes] = await Promise.all([
      supabase.from('course_exams').select('*').in('course_id', allIds).order('exam_date'),
      supabase.from('learning_goals').select('*').in('course_id', allIds),
      supabase.from('exam_old_files').select('*').in('course_id', allIds),
      supabase.from('archived_exam_files').select('*').in('course_id', allIds),
    ])

    const examMap = {}
    for (const e of (examsRes.data || [])) {
      if (!examMap[e.course_id]) examMap[e.course_id] = []
      examMap[e.course_id].push(e)
    }
    const goalMap = {}
    for (const g of (goalsRes.data || [])) {
      if (!goalMap[g.exam_id]) goalMap[g.exam_id] = []
      goalMap[g.exam_id].push(g)
    }
    const examFileMap = {}
    for (const f of (examFilesRes.data || [])) {
      if (!examFileMap[f.exam_id]) examFileMap[f.exam_id] = []
      examFileMap[f.exam_id].push(f)
    }
    const archFileMap = {}
    for (const f of (archFilesRes.data || [])) {
      if (!archFileMap[f.course_id]) archFileMap[f.course_id] = []
      archFileMap[f.course_id].push(f)
    }

    setCourses(activeCourses || [])
    setArchivedCourses(archived || [])
    setExams(examMap)
    setGoals(goalMap)
    setExamFiles(examFileMap)
    setArchivedFiles(archFileMap)
  }

  async function fetchStudySessions() {
    const { data } = await supabase
      .from('study_sessions').select('*, courses(name)')
      .eq('user_id', user.id).order('date', { ascending: false }).limit(50)
    setStudySessions(data || [])
  }

  async function saveCourse() {
    setSaving(true)
    await supabase.from('courses').insert({
      user_id: user.id, ...courseForm, active: true,
    })
    await fetchCourses()
    setCourseForm({ name: '', term: 'Termin 3', end_date: '' })
    setShowNewCourse(false)
    setSaving(false)
  }

  async function saveArchive() {
    setSaving(true)
    await supabase.from('courses').insert({
      user_id: user.id, ...archiveForm, active: false,
      grade: archiveForm.grade,
    })
    await fetchCourses()
    setArchiveForm({ name: '', term: 'Termin 1', end_date: '', grade: 'G', points_earned: '', points_max: '' })
    setShowNewArchive(false)
    setSaving(false)
  }

  async function saveExam(courseId) {
    if (!examForm.name) return
    setSaving(true)
    await supabase.from('course_exams').insert({
      user_id: user.id, course_id: courseId,
      name: examForm.name, exam_date: examForm.exam_date || null, notes: examForm.notes,
    })
    await fetchCourses()
    setExamForm({ name: '', exam_date: '', notes: '' })
    setAddingExamTo(null)
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

  async function saveExamPoints(examId) {
    await supabase.from('course_exams').update({
      points_earned: parseFloat(examPointsForm.points_earned) || null,
      points_max: parseFloat(examPointsForm.points_max) || null,
    }).eq('id', examId)
    setEditingExamPoints(null)
    await fetchCourses()
  }

  async function addGoal(examId, courseId) {
    if (!newGoal.trim()) return
    await supabase.from('learning_goals').insert({
      user_id: user.id, course_id: courseId, exam_id: examId,
      goal: newGoal.trim(), source_file: 'manual',
    })
    setNewGoal('')
    setAddingGoalTo(null)
    await fetchCourses()
  }

  async function deleteGoal(goalId) {
    await supabase.from('learning_goals').delete().eq('id', goalId)
    await fetchCourses()
  }

  async function deleteExamFile(fileId) {
    await supabase.from('exam_old_files').delete().eq('id', fileId)
    await fetchCourses()
  }

  async function saveStudySession() {
    if (!sessionForm.hours) return
    setSaving(true)
    await supabase.from('study_sessions').insert({
      user_id: user.id, ...sessionForm, hours: parseFloat(sessionForm.hours),
    })
    await fetchStudySessions()
    setSessionForm({ course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd') })
    setShowNewSession(false)
    setSaving(false)
  }

  async function archiveCourse(courseId) {
    await supabase.from('courses').update({ active: false }).eq('id', courseId)
    await fetchCourses()
  }

  async function deleteCourse(courseId) {
    if (!window.confirm('Ta bort kurs och all tillhörande data?')) return
    await supabase.from('courses').delete().eq('id', courseId)
    await fetchCourses()
  }

  async function saveEditCourse() {
    setSaving(true)
    await supabase.from('courses').update(editForm).eq('id', editingCourse)
    setEditingCourse(null)
    await fetchCourses()
    setSaving(false)
  }

  async function estimateTime(courseId) {
    setEstimatingTime(courseId)
    const courseExams = exams[courseId] || []
    const allGoals = courseExams.flatMap(e => goals[e.id] || [])
    const course = courses.find(c => c.id === courseId)

    const { data } = await supabase.functions.invoke('jarvis-chat', {
      body: {
        messages: [{
          role: 'user',
          content: `Estimera studietid för kursen "${course?.name}" med ${courseExams.length} examinationer och ${allGoals.length} lärandemål. Ge ett konkret svar i timmar. Svara kort.`
        }],
        context: '',
        systemPrompt: 'Du är en studierådgivare. Ge konkret tidsestimering.',
      },
    })
    if (data?.content) {
      await supabase.from('courses').update({ ai_time_estimate: data.content }).eq('id', courseId)
      await fetchCourses()
    }
    setEstimatingTime(null)
  }

  async function handleGoalsPdfUpload(e, examId, courseId) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingGoalsPdf(examId)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Extrahera alla lärandemål från detta dokument. Returnera en JSON-lista: {"goals": ["mål 1", "mål 2", ...]}. Returnera BARA JSON.' }
            ]
          }],
          context: '',
          systemPrompt: 'Du extraherar lärandemål från PDF. Returnera bara JSON.',
        },
      })
      if (data?.content) {
        try {
          const parsed = JSON.parse(data.content.replace(/```json|```/g, '').trim())
          if (parsed.goals?.length > 0) {
            for (const goal of parsed.goals) {
              await supabase.from('learning_goals').insert({
                user_id: user.id, course_id: courseId, exam_id: examId,
                goal, source_file: file.name,
              })
            }
            await fetchCourses()
          }
        } catch(err) { console.error(err) }
      }
      setUploadingGoalsPdf(null)
    }
    reader.readAsDataURL(file)
  }

  async function handleOldExamUpload(e, examId, courseId) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingOldExam(examId)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: {
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Sammanfatta denna gamla tenta. Vad testades? Vilka frågetyper? Returnera JSON: {"summary": "...", "topics": ["ämne1", "ämne2"]}. Bara JSON.' }
            ]
          }],
          context: '',
          systemPrompt: 'Du analyserar gamla tentor. Returnera bara JSON.',
        },
      })
      await supabase.from('exam_old_files').insert({
        user_id: user.id, exam_id: examId, course_id: courseId,
        file_name: file.name, content: data?.content || '',
      })
      await fetchCourses()
      setUploadingOldExam(null)
    }
    reader.readAsDataURL(file)
  }

  async function handleArchivePdfUpload(e, courseId) {
    const file = e.target.files[0]
    if (!file) return
    setUploadingArchivePdf(courseId)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      await supabase.from('archived_exam_files').insert({
        user_id: user.id, course_id: courseId,
        file_name: file.name, file_type: 'pdf', content: base64,
      })
      await fetchCourses()
      setUploadingArchivePdf(null)
    }
    reader.readAsDataURL(file)
  }

  async function copyGoals(courseId) {
    const courseExams = exams[courseId] || []
    const allGoals = courseExams.flatMap(e =>
      (goals[e.id] || []).map(g => `• ${g.goal}`)
    )
    await navigator.clipboard.writeText(allGoals.join('\n'))
    setCopied(courseId)
    setTimeout(() => setCopied(null), 2000)
  }

  const thisWeekHours = studySessions
    .filter(s => differenceInDays(new Date(), parseISO(s.date)) <= 7)
    .reduce((sum, s) => sum + (s.hours || 0), 0)

  const totalStudyHours = studySessions.reduce((sum, s) => sum + (s.hours || 0), 0)

  const tabs = [
    { id: 'aktiva', label: 'Aktiva kurser', icon: BookOpen },
    { id: 'arkiv', label: 'Arkiv', icon: Archive },
    { id: 'session', label: 'Studielogg', icon: GraduationCap },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: '600' }}>Plugg</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '3px' }}>
            <span style={{ marginRight: '12px' }}>📚 {courses.length} aktiva kurser</span>
            <span style={{ color: '#f59e0b' }}>⏱ {thisWeekHours.toFixed(1)}h denna vecka</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={syncMandatory} disabled={syncingMandatory} className="btn btn-ghost" style={{ fontSize: '12px' }}>
            {syncingMandatory ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : '🎓'}
            Synka obligatoriska
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'var(--surface)', borderRadius: '10px', padding: '4px' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: '8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
            background: activeTab === tab.id ? 'var(--surface3)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text)' : 'var(--muted)',
            fontSize: '13px', fontWeight: '500', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      {/* ===== AKTIVA KURSER ===== */}
      {activeTab === 'aktiva' && (
        <>
          {showNewCourse && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', marginBottom: '14px' }}>Ny kurs</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kursnamn</label>
                  <input className="input" placeholder="t.ex. 2LAO04 Basvetenskap 5" value={courseForm.name} onChange={e => setCourseForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Termin</label>
                  <select className="input" value={courseForm.term} onChange={e => setCourseForm(f => ({ ...f, term: e.target.value }))}>
                    {TERMS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Slutdatum</label>
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

          {courses.length === 0 && !showNewCourse && (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', marginBottom: '16px' }}>
              <GraduationCap size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga aktiva kurser</div>
            </div>
          )}

          {courses.map(course => {
            const isExpanded = expandedCourse === course.id
            const courseExams = exams[course.id] || []
            const doneExams = courseExams.filter(e => e.grade === 'G').length
            const isEditing = editingCourse === course.id
            const daysLeft = course.end_date ? differenceInDays(parseISO(course.end_date), new Date()) : null
            const mandatoryForCourse = mandatorySessions[course.id] || []
            const attendedCount = mandatoryForCourse.filter(m => m.attended).length

            return (
              <div key={course.id} className="card" style={{ marginBottom: '12px' }}>
                {isEditing ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <input className="input" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Kursnamn" />
                      <select className="input" value={editForm.term || ''} onChange={e => setEditForm(f => ({ ...f, term: e.target.value }))}>
                        {TERMS.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <input className="input" type="date" value={editForm.end_date || ''} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={saveEditCourse} className="btn btn-primary" disabled={saving}><Save size={14} /> Spara</button>
                      <button onClick={() => setEditingCourse(null)} className="btn btn-ghost">Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                      onClick={() => setExpandedCourse(isExpanded ? null : course.id)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <div style={{ fontSize: '15px', fontWeight: '600' }}>{course.name}</div>
                          {courseExams.length > 0 && (
                            <div style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px',
                              background: doneExams === courseExams.length ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                              color: doneExams === courseExams.length ? '#10b981' : '#f59e0b', fontWeight: '600' }}>
                              {doneExams}/{courseExams.length} klara
                            </div>
                          )}
                          {mandatoryForCourse.length > 0 && (
                            <div style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px',
                              background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: '600' }}>
                              🎓 {attendedCount}/{mandatoryForCourse.length}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <span>{course.term}</span>
                          {daysLeft !== null && (
                            <span style={{ color: daysLeft < 14 ? '#ef4444' : daysLeft < 30 ? '#f59e0b' : 'var(--muted)' }}>
                              {daysLeft < 0 ? 'Avslutad' : `${daysLeft}d kvar`}
                            </span>
                          )}
                          {course.ai_time_estimate && (
                            <span style={{ color: '#8b5cf6' }}>⏱ {course.ai_time_estimate.slice(0, 40)}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button onClick={e => { e.stopPropagation(); setEditingCourse(course.id); setEditForm({ name: course.name, term: course.term, end_date: course.end_date || '' }) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px', opacity: 0.6 }}>
                          ✏️
                        </button>
                        {isExpanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>

                        {/* Obligatoriska moment */}
                        {mandatoryForCourse.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>
                              OBLIGATORISKA MOMENT ({mandatoryForCourse.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {mandatoryForCourse.sort((a, b) => b.date.localeCompare(a.date)).map(session => (
                                <div key={session.id} style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  padding: '8px 12px', borderRadius: '8px',
                                  background: session.attended ? 'rgba(16,185,129,0.06)' : 'var(--surface2)',
                                  border: `1px solid ${session.attended ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                                }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {session.title}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                                      {format(parseISO(session.date), 'd MMM yyyy', { locale: sv })}
                                    </div>
                                  </div>
                                  <button onClick={() => toggleMandatoryAttended(session.id, session.attended)} style={{
                                    fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                                    background: session.attended ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                                    color: session.attended ? '#10b981' : 'var(--muted)',
                                    fontFamily: 'Inter, sans-serif', flexShrink: 0, marginLeft: '8px',
                                  }}>
                                    {session.attended ? '✓ Närvaro' : 'Markera'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Examinationer */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>EXAMINATIONER</div>
                          {courseExams.length === 0 && (
                            <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '10px' }}>Inga examinationer tillagda</div>
                          )}
                          {courseExams.map(exam => {
                            const isExamExpanded = expandedExam === exam.id
                            const examGoalList = goals[exam.id] || []
                            const examFilesForExam = examFiles[exam.id] || []
                            return (
                              <div key={exam.id} style={{ marginBottom: '8px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                                <div style={{
                                  padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                  background: exam.grade === 'G' ? 'rgba(16,185,129,0.06)' : exam.grade === 'IG' ? 'rgba(239,68,68,0.06)' : 'var(--surface2)',
                                  borderLeft: `3px solid ${exam.grade === 'G' ? '#10b981' : exam.grade === 'IG' ? '#ef4444' : 'var(--border)'}`,
                                }}
                                  onClick={() => setExpandedExam(isExamExpanded ? null : exam.id)}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exam.name}</div>
                                    {exam.exam_date && <CountdownBadge examDate={exam.exam_date} />}
                                    {examGoalList.length > 0 && (
                                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{examGoalList.length} mål</span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                                    {GRADES.map(g => (
                                      <button key={g} onClick={e => { e.stopPropagation(); updateExamGrade(exam.id, exam.grade === g ? null : g) }} style={{
                                        padding: '3px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
                                        border: `1px solid ${exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--border)'}`,
                                        background: exam.grade === g ? (g === 'G' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'transparent',
                                        color: exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--muted)',
                                      }}>{g}</button>
                                    ))}
                                    <button onClick={e => { e.stopPropagation(); deleteExam(exam.id) }}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', opacity: 0.5, padding: '2px' }}>
                                      <X size={13} />
                                    </button>
                                    {isExamExpanded ? <ChevronUp size={13} color="var(--muted)" /> : <ChevronDown size={13} color="var(--muted)" />}
                                  </div>
                                </div>

                                {isExamExpanded && (
                                  <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
                                    {/* Poäng */}
                                    <div style={{ marginBottom: '12px' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>POÄNG</div>
                                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        {editingExamPoints === exam.id ? (
                                          <>
                                            <input className="input" type="number" placeholder="Fick" value={examPointsForm.points_earned}
                                              onChange={e => setExamPointsForm(f => ({ ...f, points_earned: e.target.value }))}
                                              style={{ width: '70px', padding: '6px 8px' }} />
                                            <span style={{ color: 'var(--muted)' }}>/</span>
                                            <input className="input" type="number" placeholder="Max" value={examPointsForm.points_max}
                                              onChange={e => setExamPointsForm(f => ({ ...f, points_max: e.target.value }))}
                                              style={{ width: '70px', padding: '6px 8px' }} />
                                            <button onClick={() => saveExamPoints(exam.id)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '12px' }}><Check size={12} /></button>
                                            <button onClick={() => setEditingExamPoints(null)} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: '12px' }}><X size={12} /></button>
                                          </>
                                        ) : (
                                          <button onClick={() => { setEditingExamPoints(exam.id); setExamPointsForm({ points_earned: exam.points_earned || '', points_max: exam.points_max || '' }) }}
                                            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
                                            {exam.points_earned && exam.points_max ? `✏️ ${exam.points_earned}/${exam.points_max}p` : '+ Poäng'}
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* PDF upload */}
                                    <div style={{ marginBottom: '12px' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>FILER</div>
                                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <input type="file" accept=".pdf" style={{ display: 'none' }} id={`goals-${exam.id}`}
                                          onChange={e => handleGoalsPdfUpload(e, exam.id, course.id)} />
                                        <label htmlFor={`goals-${exam.id}`} style={{
                                          padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                          color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px',
                                        }}>
                                          {uploadingGoalsPdf === exam.id
                                            ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Importerar...</>
                                            : <><Upload size={11} /> Lärandemål PDF</>}
                                        </label>
                                        <input type="file" accept=".pdf" style={{ display: 'none' }} id={`oldexam-${exam.id}`}
                                          onChange={e => handleOldExamUpload(e, exam.id, course.id)} />
                                        <label htmlFor={`oldexam-${exam.id}`} style={{
                                          padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                          color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px',
                                        }}>
                                          {uploadingOldExam === exam.id
                                            ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</>
                                            : <><FileText size={11} /> Gammal tenta</>}
                                        </label>
                                      </div>
                                      {examFilesForExam.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                                          {examFilesForExam.map(f => (
                                            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                                              <FileText size={11} color="#10b981" />
                                              <span style={{ fontSize: '12px', flex: 1 }}>{f.file_name}</span>
                                              <button onClick={() => deleteExamFile(f.id)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }}>
                                                <Trash2 size={11} />
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>

                                    {/* Lärandemål */}
                                    {examGoalList.length > 0 && (
                                      <div>
                                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>LÄRANDEMÅL ({examGoalList.length})</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          {examGoalList.map(goal => (
                                            <div key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', marginTop: '6px', flexShrink: 0 }} />
                                              <span style={{ fontSize: '12px', color: 'var(--muted2)', lineHeight: '1.5' }}>{goal.goal}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Lägg till lärandemål */}
                                    {addingGoalTo === exam.id ? (
                                      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                        <input className="input" placeholder="Nytt lärandemål..." value={newGoal}
                                          onChange={e => setNewGoal(e.target.value)}
                                          onKeyDown={e => e.key === 'Enter' && addGoal(exam.id, course.id)} />
                                        <button onClick={() => addGoal(exam.id, course.id)} className="btn btn-primary" style={{ padding: '8px 12px' }}><Check size={14} /></button>
                                        <button onClick={() => setAddingGoalTo(null)} className="btn btn-ghost" style={{ padding: '8px 12px' }}><X size={14} /></button>
                                      </div>
                                    ) : (
                                      <button onClick={() => setAddingGoalTo(exam.id)} className="btn btn-ghost" style={{ fontSize: '12px', marginTop: '10px' }}>
                                        <Plus size={11} /> Lärandemål
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* Lägg till examination */}
                        {addingExamTo === course.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                            <input className="input" placeholder="t.ex. Delexamination 1, OSCE, Skriftlig salstenta" value={examForm.name}
                              onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Datum</label>
                                <input className="input" type="date" value={examForm.exam_date} onChange={e => setExamForm(f => ({ ...f, exam_date: e.target.value }))} />
                              </div>
                              <div>
                                <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Anteckningar</label>
                                <input className="input" placeholder="Valfritt" value={examForm.notes} onChange={e => setExamForm(f => ({ ...f, notes: e.target.value }))} />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button onClick={() => saveExam(course.id)} className="btn btn-primary" disabled={saving}><Save size={12} /> Spara</button>
                              <button onClick={() => { setAddingExamTo(null); setExamForm({ name: '', exam_date: '', notes: '' }) }} className="btn btn-ghost">Avbryt</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAddingExamTo(course.id)} className="btn btn-ghost" style={{ fontSize: '12px', marginBottom: '12px' }}>
                            <Plus size={12} /> Lägg till examination
                          </button>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                          <button onClick={() => copyGoals(course.id)} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                            {copied === course.id ? <><Check size={12} /> Kopierat!</> : <><Copy size={12} /> Kopiera mål</>}
                          </button>
                          <button onClick={() => estimateTime(course.id)} disabled={estimatingTime === course.id} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                            {estimatingTime === course.id ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Estimerar...</> : <><Zap size={12} /> Estimera tid</>}
                          </button>
                          <button onClick={() => archiveCourse(course.id)} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                            <Archive size={12} /> Arkivera
                          </button>
                          <button onClick={() => deleteCourse(course.id)} className="btn btn-danger" style={{ fontSize: '12px' }}>
                            <Trash2 size={12} /> Ta bort
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}

          <button onClick={() => setShowNewCourse(true)} className="btn btn-primary" style={{ marginTop: '8px' }}>
            <Plus size={14} /> Ny kurs
          </button>

          {/* Omatschade obligatoriska */}
          {mandatoryUnmatched.length > 0 && (
            <div className="card" style={{ marginTop: '16px', borderColor: 'rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize: '12px', color: '#a78bfa', fontWeight: '600', marginBottom: '8px' }}>
                OBLIGATORISKA UTAN KOPPLAD KURS ({mandatoryUnmatched.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {mandatoryUnmatched.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: '13px' }}>{s.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{format(parseISO(s.date), 'd MMM yyyy', { locale: sv })}</div>
                    </div>
                    <button onClick={() => toggleMandatoryAttended(s.id, s.attended)} style={{
                      fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: s.attended ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                      color: s.attended ? '#10b981' : 'var(--muted)', fontFamily: 'Inter, sans-serif',
                    }}>
                      {s.attended ? '✓ Närvaro' : 'Markera'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== ARKIV ===== */}
      {activeTab === 'arkiv' && (
        <>
          {showNewArchive && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', marginBottom: '14px' }}>Arkivera kurs manuellt</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Kursnamn</label>
                  <input className="input" placeholder="t.ex. 1LAO01" value={archiveForm.name} onChange={e => setArchiveForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Termin</label>
                  <select className="input" value={archiveForm.term} onChange={e => setArchiveForm(f => ({ ...f, term: e.target.value }))}>
                    {TERMS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Slutdatum</label>
                  <input className="input" type="date" value={archiveForm.end_date} onChange={e => setArchiveForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Betyg</label>
                  <select className="input" value={archiveForm.grade} onChange={e => setArchiveForm(f => ({ ...f, grade: e.target.value }))}>
                    {GRADES.map(g => <option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewArchive(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveArchive} className="btn btn-primary" disabled={saving || !archiveForm.name}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          {archivedCourses.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)', marginBottom: '16px' }}>
              <Archive size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <div>Inga arkiverade kurser</div>
            </div>
          )}

          {archivedCourses.map(course => {
            const isExpanded = expandedCourse === `archive-${course.id}`
            const courseExams = exams[course.id] || []
            const doneExams = courseExams.filter(e => e.grade === 'G').length
            const archCourseFiles = archivedFiles[course.id] || []

            return (
              <div key={course.id} className="card" style={{ marginBottom: '10px', borderColor: course.grade === 'G' ? 'rgba(16,185,129,0.2)' : 'var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedCourse(isExpanded ? null : `archive-${course.id}`)}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600' }}>{course.name}</div>
                      {course.grade && (
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px',
                          background: course.grade === 'G' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: course.grade === 'G' ? '#10b981' : '#ef4444', fontWeight: '700' }}>
                          {course.grade}
                        </span>
                      )}
                      {courseExams.length > 0 && (
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{doneExams}/{courseExams.length} klara</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {course.term}{course.end_date ? ` · ${format(parseISO(course.end_date), 'MMM yyyy', { locale: sv })}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {isExpanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>EXAMINATIONER</div>
                    {courseExams.map(exam => {
                      const isExamExpanded = expandedExam === `arc-${exam.id}`
                      const examGoalList = goals[exam.id] || []
                      const examFilesForExam = examFiles[exam.id] || []
                      return (
                        <div key={exam.id} style={{ marginBottom: '8px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                          <div style={{
                            padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: exam.grade === 'G' ? 'rgba(16,185,129,0.06)' : exam.grade === 'IG' ? 'rgba(239,68,68,0.06)' : 'var(--surface2)',
                            borderLeft: `3px solid ${exam.grade === 'G' ? '#10b981' : exam.grade === 'IG' ? '#ef4444' : 'var(--border)'}`,
                          }} onClick={() => setExpandedExam(isExamExpanded ? null : `arc-${exam.id}`)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exam.name}</div>
                              {exam.exam_date && <CountdownBadge examDate={exam.exam_date} />}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                              <div style={{ fontSize: '12px', color: exam.grade === 'G' ? '#10b981' : exam.grade === 'IG' ? '#ef4444' : 'var(--muted)', fontWeight: '600' }}>
                                {exam.grade}{exam.points_earned && exam.points_max ? ` · ${exam.points_earned}/${exam.points_max}p` : ''}
                              </div>
                              {GRADES.map(g => (
                                <button key={g} onClick={e => { e.stopPropagation(); updateExamGrade(exam.id, exam.grade === g ? null : g) }} style={{
                                  padding: '3px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontFamily: 'DM Sans, sans-serif',
                                  border: `1px solid ${exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--border)'}`,
                                  background: exam.grade === g ? (g === 'G' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'transparent',
                                  color: exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--muted)',
                                }}>{g}</button>
                              ))}
                              {editingExamPoints === `arc-${exam.id}` ? (
                                <>
                                  <input className="input" type="number" placeholder="Fick" value={examPointsForm.points_earned}
                                    onChange={e => setExamPointsForm(f => ({ ...f, points_earned: e.target.value }))}
                                    style={{ width: '60px', padding: '4px 6px', fontSize: '12px' }} />
                                  <span style={{ color: 'var(--muted)' }}>/</span>
                                  <input className="input" type="number" placeholder="Max" value={examPointsForm.points_max}
                                    onChange={e => setExamPointsForm(f => ({ ...f, points_max: e.target.value }))}
                                    style={{ width: '60px', padding: '4px 6px', fontSize: '12px' }} />
                                  <button onClick={() => saveExamPoints(exam.id)} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '11px' }}><Check size={11} /></button>
                                  <button onClick={() => setEditingExamPoints(null)} className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }}><X size={11} /></button>
                                </>
                              ) : (
                                <button onClick={() => { setEditingExamPoints(`arc-${exam.id}`); setExamPointsForm({ points_earned: exam.points_earned || '', points_max: exam.points_max || '' }) }}
                                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', color: 'var(--muted)', fontSize: '11px', fontFamily: 'Inter, sans-serif' }}>
                                  {exam.points_earned && exam.points_max ? `✏️ ${exam.points_earned}/${exam.points_max}p` : '+ Poäng'}
                                </button>
                              )}
                              {isExamExpanded ? <ChevronUp size={13} color="var(--muted)" /> : <ChevronDown size={13} color="var(--muted)" />}
                            </div>
                          </div>

                          {isExamExpanded && (
                            <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
                              <div style={{ marginBottom: '12px' }}>
                                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>FILER</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                  <input type="file" accept=".pdf" style={{ display: 'none' }} id={`arc-goals-${exam.id}`}
                                    onChange={e => handleGoalsPdfUpload(e, exam.id, course.id)} />
                                  <label htmlFor={`arc-goals-${exam.id}`} style={{
                                    padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                    color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px',
                                  }}>
                                    {uploadingGoalsPdf === exam.id
                                      ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Importerar...</>
                                      : <><Upload size={11} /> Lärandemål PDF</>}
                                  </label>
                                  <input type="file" accept=".pdf" style={{ display: 'none' }} id={`arc-oldexam-${exam.id}`}
                                    onChange={e => handleOldExamUpload(e, exam.id, course.id)} />
                                  <label htmlFor={`arc-oldexam-${exam.id}`} style={{
                                    padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                    color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px',
                                  }}>
                                    {uploadingOldExam === exam.id
                                      ? <><Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</>
                                      : <><FileText size={11} /> Gammal tenta</>}
                                  </label>
                                </div>
                                {examFilesForExam.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {examFilesForExam.map(f => (
                                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--muted)' }}>
                                        <FileText size={11} color="#10b981" />
                                        <span style={{ flex: 1 }}>{f.file_name}</span>
                                        <button onClick={() => deleteExamFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '2px' }}>
                                          <Trash2 size={11} />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {examGoalList.length > 0 && (
                                <div>
                                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>LÄRANDEMÅL</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {examGoalList.map(goal => (
                                      <div key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', marginTop: '6px', flexShrink: 0 }} />
                                        <span style={{ fontSize: '12px', color: 'var(--muted2)', lineHeight: '1.5' }}>{goal.goal}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {addingExamTo === `arc-${course.id}` ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                  <input className="input" placeholder="t.ex. Delexamination 1" value={examForm.name}
                                    onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))} />
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div>
                                      <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Datum</label>
                                      <input className="input" type="date" value={examForm.exam_date} onChange={e => setExamForm(f => ({ ...f, exam_date: e.target.value }))} />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>Anteckningar</label>
                                      <input className="input" placeholder="Valfritt" value={examForm.notes} onChange={e => setExamForm(f => ({ ...f, notes: e.target.value }))} />
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => saveExam(course.id)} className="btn btn-primary" disabled={saving}><Save size={12} /> Spara</button>
                                    <button onClick={() => { setAddingExamTo(null); setExamForm({ name: '', exam_date: '', notes: '' }) }} className="btn btn-ghost">Avbryt</button>
                                  </div>
                                </div>
                              ) : (
                                <button onClick={() => setAddingExamTo(`arc-${course.id}`)} className="btn btn-ghost" style={{ fontSize: '12px', marginTop: '8px' }}>
                                  <Plus size={12} /> Lägg till examination
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          <button onClick={() => setShowNewArchive(true)} className="btn btn-ghost" style={{ marginTop: '8px', fontSize: '13px' }}>
            <Plus size={14} /> Arkivera kurs manuellt
          </button>
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
                    {[...courses, ...archivedCourses].map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Timmar</label>
                  <input className="input" type="number" step="0.5" placeholder="t.ex. 2.5" value={sessionForm.hours} onChange={e => setSessionForm(f => ({ ...f, hours: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Datum</label>
                  <input className="input" type="date" value={sessionForm.date} onChange={e => setSessionForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Ämne</label>
                  <input className="input" placeholder="Vad pluggade du?" value={sessionForm.subject} onChange={e => setSessionForm(f => ({ ...f, subject: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Anteckningar</label>
                  <input className="input" placeholder="Valfritt" value={sessionForm.notes} onChange={e => setSessionForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNewSession(false)} className="btn btn-ghost">Avbryt</button>
                <button onClick={saveStudySession} className="btn btn-primary" disabled={saving || !sessionForm.hours}>
                  {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />} Spara
                </button>
              </div>
            </div>
          )}

          <button onClick={() => setShowNewSession(true)} className="btn btn-primary" style={{ marginBottom: '16px' }}>
            <Plus size={14} /> Logga session
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {studySessions.map(session => (
              <div key={session.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '3px' }}>
                      {session.courses?.name || 'Okänd kurs'}
                      {session.subject && <span style={{ color: 'var(--muted)', fontWeight: '400' }}> · {session.subject}</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {format(parseISO(session.date), 'd MMM yyyy', { locale: sv })}
                      {session.notes && ` · ${session.notes}`}
                    </div>
                  </div>
                  <div className="mono" style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>
                    {session.hours}h
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  )
}
