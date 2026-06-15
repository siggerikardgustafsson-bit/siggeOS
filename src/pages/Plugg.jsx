import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { format, differenceInDays, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import {
  Plus, X, Save, Loader, BookOpen, GraduationCap,
  Copy, Check, ChevronDown, ChevronUp,
  Archive, Zap, Upload, FileText, Trash2, Edit2
} from 'lucide-react'
import StudyModal from '../components/StudyModal'

const GRADES = ['IG', 'G']

// Mandatory-session titles arrive as "KOD. Kursnamn, Typ, Obligatorisk, Lärare: X, Lärare: Y".
// Strip the redundant course code/name prefix and the "Obligatorisk" noise; surface teachers separately.
function parseMandTitle(title) {
  if (!title) return { label: title || '', teachers: [] }
  const parts = title.split(',').map(s => s.trim()).filter(Boolean)
  const rest = parts.slice(1) // drop "KOD. Kursnamn"
  const teachers = rest
    .filter(p => /^l[äa]rare:/i.test(p))
    .map(p => p.replace(/^l[äa]rare:\s*/i, '').trim())
    .filter(Boolean)
  const labelParts = rest.filter(p => !/^l[äa]rare:/i.test(p) && p.toLowerCase() !== 'obligatorisk')
  const label = labelParts.join(' · ') || parts[0] || title
  return { label, teachers }
}
const TERMS = ['Termin 1','Termin 2','Termin 3','Termin 4','Termin 5','Termin 6',
               'Termin 7','Termin 8','Termin 9','Termin 10','Termin 11','Extrakurrikulär']

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

function extractJsonFromText(text) {
  if (!text) return null
  const clean = text.trim()
  // Try direct parse first
  try { return JSON.parse(clean) } catch {}
  // Extract from code block
  const block = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (block) { try { return JSON.parse(block[1].trim()) } catch {} }
  // Extract first {...} object
  const obj = clean.match(/\{[\s\S]*\}/)
  if (obj) { try { return JSON.parse(obj[0]) } catch {} }
  return null
}

export default function PluggPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState('aktiva')
  const [courses, setCourses] = useState([])
  const [archivedCourses, setArchivedCourses] = useState([])
  const [studySessions, setStudySessions] = useState([])
  const [exams, setExams] = useState({})
  const [goals, setGoals] = useState({})
  const [examFiles, setExamFiles] = useState({})
  const [expandedCourse, setExpandedCourse] = useState(null)
  const [expandedExam, setExpandedExam] = useState(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(null)
  const [editingCourse, setEditingCourse] = useState(null)
  const [editingMandTitle, setEditingMandTitle] = useState(null)
  const [mandTitleDraft, setMandTitleDraft] = useState('')
  const [editForm, setEditForm] = useState({})
  const [uploadingGoalsPdf, setUploadingGoalsPdf] = useState(null)
  const [uploadingOldExam, setUploadingOldExam] = useState(null)
  const [uploadingCourseMaterial, setUploadingCourseMaterial] = useState(null)
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
  const [courseForm, setCourseForm] = useState({ name: '', term: 'Termin 3', exam_date: '' })
  const [archiveForm, setArchiveForm] = useState({ name: '', term: 'Termin 1', exam_date: '', grade: 'G' })
  const [sessionForm, setSessionForm] = useState({ course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd') })
  const [mandatorySessions, setMandatorySessions] = useState({})
  const [mandatoryUnmatched, setMandatoryUnmatched] = useState([])
  const [syncingMandatory, setSyncingMandatory] = useState(false)
  const [studySession, setStudySession] = useState(null)
  const [showFilesFor, setShowFilesFor] = useState(null) // examId
  const [courseMaterials, setCourseMaterials] = useState({}) // examId -> []
  const [studyTasks, setStudyTasks] = useState({}) // courseId -> []
  const [taskDeadlines, setTaskDeadlines] = useState({}) // taskId -> []
  const [showNewTaskFor, setShowNewTaskFor] = useState(null)
  const [expandedTask, setExpandedTask] = useState(null)
  const [taskForm, setTaskForm] = useState({
    title: '',
    task_type: 'läsa',
    status: 'todo',
    priority: 'medium',
    estimated_minutes: '',
    notes: '',
    deadlines: [{ name: '', due_date: '' }],
  })

  useEffect(() => { if (user) fetchAll() }, [user])

  async function fetchAll() {
    await Promise.all([fetchCourses(), fetchStudySessions(), fetchMandatory()])
  }

  async function fetchMandatory() {
    const { data } = await supabase.from('mandatory_sessions').select('*').eq('user_id', user.id).order('date', { ascending: false })
    const matched = {}
    const unmatched = []
    for (const s of data || []) {
      if (s.course_id) { if (!matched[s.course_id]) matched[s.course_id] = []; matched[s.course_id].push(s) }
      else unmatched.push(s)
    }
    setMandatorySessions(matched)
    setMandatoryUnmatched(unmatched)
  }

  async function syncMandatory() {
    setSyncingMandatory(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync?action=mandatory`, {
        headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }
      })
      const data = await res.json()
      toast({ message: `Synkade ${data.synced || 0} obligatoriska moment`, type: 'success' })
      await fetchMandatory()
    } catch(e) { toast({ message: 'Sync misslyckades — försök igen', type: 'error' }) }
    setSyncingMandatory(false)
  }


  async function saveMandTitle(sessionId) {
    if (!mandTitleDraft.trim()) return
    await supabase.from('mandatory_sessions').update({ custom_title: mandTitleDraft.trim() }).eq('id', sessionId)
    setMandatorySessions(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        next[key] = next[key].map(s => s.id === sessionId ? { ...s, custom_title: mandTitleDraft.trim() } : s)
      }
      return next
    })
    setEditingMandTitle(null)
  }

  async function deleteMandatorySession(id) {
    await supabase.from('mandatory_sessions').delete().eq('id', id)
    setMandatorySessions(prev => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        next[key] = next[key].filter(s => s.id !== id)
      }
      return next
    })
    setMandatoryUnmatched(prev => prev.filter(s => s.id !== id))
  }


  async function toggleMandatoryAttended(id, current) {
    await supabase.from('mandatory_sessions').update({ attended: !current }).eq('id', id)
    await fetchMandatory()
  }

  async function fetchCourses() {
    const { data: activeCourses } = await supabase.from('courses').select('*').eq('user_id', user.id).eq('active', true).order('created_at')
    const { data: archived } = await supabase.from('courses').select('*').eq('user_id', user.id).eq('active', false).order('created_at', { ascending: false })
    const allIds = [...(activeCourses || []), ...(archived || [])].map(c => c.id)
    if (allIds.length === 0) {
      setCourses([]); setArchivedCourses([]); setExams({}); setGoals({}); setExamFiles({}); setCourseMaterials({}); setStudyTasks({}); setTaskDeadlines({})
      return
    }
    const [examsRes, goalsRes, examFilesRes, courseMaterialsRes, tasksRes] = await Promise.all([
      supabase.from('course_exams').select('*').in('course_id', allIds).order('exam_date'),
      supabase.from('learning_goals').select('*').in('course_id', allIds),
      supabase.from('exam_old_files').select('*').in('course_id', allIds),
      supabase.from('course_materials').select('*').in('course_id', allIds),
      supabase.from('study_tasks').select('*').in('course_id', allIds).order('created_at', { ascending: false }),
    ])
    const examMap = {}
    for (const e of (examsRes.data || [])) { if (!examMap[e.course_id]) examMap[e.course_id] = []; examMap[e.course_id].push(e) }
    const goalMap = {}
    for (const g of (goalsRes.data || [])) { if (!goalMap[g.exam_id]) goalMap[g.exam_id] = []; goalMap[g.exam_id].push(g) }
    const examFileMap = {}
    for (const f of (examFilesRes.data || [])) { if (!examFileMap[f.exam_id]) examFileMap[f.exam_id] = []; examFileMap[f.exam_id].push(f) }
    const courseMaterialMap = {}
    for (const m of (courseMaterialsRes.data || [])) { if (!courseMaterialMap[m.exam_id]) courseMaterialMap[m.exam_id] = []; courseMaterialMap[m.exam_id].push(m) }
    const taskMap = {}
    const taskIds = (tasksRes.data || []).map(t => t.id)
    for (const t of (tasksRes.data || [])) { if (!taskMap[t.course_id]) taskMap[t.course_id] = []; taskMap[t.course_id].push(t) }
    const deadlineMap = {}
    if (taskIds.length > 0) {
      const { data: deadlines } = await supabase.from('study_task_deadlines').select('*').in('task_id', taskIds).order('sort_order').order('due_date', { ascending: true })
      for (const d of (deadlines || [])) { if (!deadlineMap[d.task_id]) deadlineMap[d.task_id] = []; deadlineMap[d.task_id].push(d) }
    }
    setCourses(activeCourses || [])
    setArchivedCourses(archived || [])
    setExams(examMap)
    setGoals(goalMap)
    setExamFiles(examFileMap)
    setCourseMaterials(courseMaterialMap)
    setStudyTasks(taskMap)
    setTaskDeadlines(deadlineMap)
  }

  async function fetchStudySessions() {
    const { data } = await supabase.from('study_sessions').select('*, courses(name)').eq('user_id', user.id).order('date', { ascending: false }).limit(50)
    setStudySessions(data || [])
  }

  async function saveCourse() {
    setSaving(true)
    await supabase.from('courses').insert({ user_id: user.id, ...courseForm, active: true })
    await fetchCourses()
    setCourseForm({ name: '', term: 'Termin 3', exam_date: '' })
    setShowNewCourse(false)
    setSaving(false)
  }

  async function saveArchive() {
    setSaving(true)
    await supabase.from('courses').insert({ user_id: user.id, ...archiveForm, active: false })
    await fetchCourses()
    setArchiveForm({ name: '', term: 'Termin 1', exam_date: '', grade: 'G' })
    setShowNewArchive(false)
    setSaving(false)
  }

  async function saveExam(courseId) {
    if (!examForm.name) return
    setSaving(true)
    await supabase.from('course_exams').insert({ user_id: user.id, course_id: courseId, name: examForm.name, exam_date: examForm.exam_date || null, notes: examForm.notes })
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
    await supabase.from('course_exams').update({ points_earned: parseFloat(examPointsForm.points_earned) || null, points_max: parseFloat(examPointsForm.points_max) || null }).eq('id', examId)
    setEditingExamPoints(null)
    await fetchCourses()
  }

  async function addGoal(examId, courseId) {
    if (!newGoal.trim()) return
    await supabase.from('learning_goals').insert({ user_id: user.id, course_id: courseId, exam_id: examId, description: newGoal.trim(), source_file: 'manual' })
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

  async function deleteCourseMaterial(id) {
    await supabase.from('course_materials').delete().eq('id', id)
    await fetchCourses()
  }

  async function saveStudySession() {
    if (!sessionForm.hours) return
    setSaving(true)
    await supabase.from('study_sessions').insert({ user_id: user.id, ...sessionForm, hours: parseFloat(sessionForm.hours) })
    await fetchStudySessions()
    setSessionForm({ course_id: '', subject: '', hours: '', notes: '', date: format(new Date(), 'yyyy-MM-dd') })
    setShowNewSession(false)
    setSaving(false)
  }

  function resetTaskForm() {
    setTaskForm({
      title: '',
      task_type: 'läsa',
      status: 'todo',
      priority: 'medium',
      estimated_minutes: '',
      notes: '',
      deadlines: [{ name: '', due_date: '' }],
    })
  }

  function addTaskDeadlineField() {
    setTaskForm(f => ({ ...f, deadlines: [...f.deadlines, { name: '', due_date: '' }] }))
  }

  function updateTaskDeadlineField(index, field, value) {
    setTaskForm(f => ({
      ...f,
      deadlines: f.deadlines.map((d, i) => i === index ? { ...d, [field]: value } : d),
    }))
  }

  function removeTaskDeadlineField(index) {
    setTaskForm(f => ({ ...f, deadlines: f.deadlines.length === 1 ? [{ name: '', due_date: '' }] : f.deadlines.filter((_, i) => i !== index) }))
  }

  async function saveStudyTask(courseId) {
    if (!taskForm.title.trim()) return
    setSaving(true)
    const { data: task, error } = await supabase.from('study_tasks').insert({
      user_id: user.id,
      course_id: courseId,
      title: taskForm.title.trim(),
      task_type: taskForm.task_type,
      status: taskForm.status,
      priority: taskForm.priority,
      estimated_minutes: taskForm.estimated_minutes ? parseInt(taskForm.estimated_minutes, 10) : null,
      notes: taskForm.notes.trim() || null,
    }).select().single()

    if (!error && task) {
      const deadlineRows = taskForm.deadlines
        .map((d, index) => ({
          user_id: user.id,
          task_id: task.id,
          name: d.name.trim(),
          due_date: d.due_date || null,
          sort_order: index,
        }))
        .filter(d => d.name || d.due_date)
      if (deadlineRows.length > 0) await supabase.from('study_task_deadlines').insert(deadlineRows)
    } else if (error) {
      console.error('Kunde inte skapa uppgift', error)
      toast({ message: 'Kunde inte skapa uppgift. Har du kört SQL-migrationen för study_tasks?', type: 'error' })
    }

    resetTaskForm()
    setShowNewTaskFor(null)
    await fetchCourses()
    setSaving(false)
  }

  async function toggleStudyTask(task) {
    const nextStatus = task.status === 'done' ? 'todo' : 'done'
    await supabase.from('study_tasks').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', task.id)
    await fetchCourses()
  }

  async function toggleTaskDeadline(deadline) {
    await supabase.from('study_task_deadlines').update({
      completed: !deadline.completed,
      completed_at: !deadline.completed ? new Date().toISOString() : null,
    }).eq('id', deadline.id)
    await fetchCourses()
  }

  async function deleteStudyTask(taskId) {
    if (!window.confirm('Ta bort uppgift och alla deadlines?')) return
    await supabase.from('study_tasks').delete().eq('id', taskId)
    await fetchCourses()
  }

  async function archiveCourse(courseId) {
    await supabase.from('courses').update({ active: false }).eq('id', courseId)
    await fetchCourses()
  }

  async function deleteCourse(courseId) {
    if (!window.confirm('Ta bort kurs?')) return
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
    const course = courses.find(c => c.id === courseId)
    const courseExams = exams[courseId] || []
    const allGoals = courseExams.flatMap(e => goals[e.id] || [])
    const { data } = await supabase.functions.invoke('jarvis-chat', {
      body: { messages: [{ role: 'user', content: `Estimera studietid för "${course?.name}" med ${courseExams.length} examinationer och ${allGoals.length} lärandemål. Ge ett konkret svar i timmar.` }], context: '', systemPrompt: 'Du är studierådgivare. Ge konkret tidsestimering på svenska.' }
    })
    if (data?.content) { await supabase.from('courses').update({ ai_time_estimate: data.content }).eq('id', courseId); await fetchCourses() }
    setEstimatingTime(null)
  }

  async function handleGoalsPdfUpload(e, examId, courseId) {
    const file = e.target.files[0]; if (!file) return
    setUploadingGoalsPdf(examId)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      const { data } = await supabase.functions.invoke('jarvis-chat', {
        body: { messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: 'Extrahera alla lärandemål. Returnera JSON: {"goals": ["mål 1", ...]}. Bara JSON.' }] }], context: '', systemPrompt: 'Extrahera lärandemål. Returnera bara JSON.' }
      })
      if (data?.content) {
        const parsed = extractJsonFromText(data.content)
        if (parsed?.goals?.length > 0) {
          for (const goal of parsed.goals) {
            await supabase.from('learning_goals').insert({ user_id: user.id, course_id: courseId, exam_id: examId, description: goal, source_file: file.name })
          }
          await fetchCourses()
          toast({ message: `${parsed.goals.length} lärandemål extraherade`, type: 'success' })
        } else {
          toast({ message: 'Kunde inte hitta lärandemål i PDF:en', type: 'error' })
        }
      } else {
        toast({ message: 'Jarvis svarade inte — försök igen', type: 'error' })
      }
      setUploadingGoalsPdf(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleOldExamUpload(e, examId, courseId) {
    const file = e.target.files[0]; if (!file) return
    setUploadingOldExam(examId)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      // Extract text via Jarvis at upload time so we don't need to send large PDFs later
      let extractedText = ''
      try {
        const { data } = await supabase.functions.invoke('jarvis-chat', {
          body: {
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                { type: 'text', text: 'Extrahera hela innehållet i detta tentapapper ordagrant. Behåll alla frågor, svarsalternativ och numrering exakt som de är. Returnera bara texten.' }
              ]
            }],
            context: '',
            systemPrompt: 'Du extraherar text från PDF-tentor. Returnera bara texten exakt som den är.',
          },
        })
        extractedText = data?.content || ''
      } catch(err) {
        console.error('PDF extraction failed:', err)
        extractedText = `[Kunde inte extrahera text från ${file.name}]`
      }
      await supabase.from('exam_old_files').insert({
        user_id: user.id,
        exam_id: examId,
        course_id: courseId,
        file_name: file.name,
        content: extractedText, // Store extracted text, not base64
      })
      await fetchCourses()
      setUploadingOldExam(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleCourseMaterialUpload(e, examId, courseId) {
    const file = e.target.files[0]; if (!file) return
    setUploadingCourseMaterial(examId)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      let extractedText = ''
      try {
        const { data } = await supabase.functions.invoke('jarvis-chat', {
          body: {
            messages: [{
              role: 'user',
              content: [
                { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                { type: 'text', text: 'Extrahera allt textinnehåll från detta kursmaterial. Behåll rubriker, struktur och alla detaljer exakt som de är. Returnera bara texten.' }
              ]
            }],
            context: '',
            systemPrompt: 'Du extraherar text från PDF-kursmaterial. Returnera bara texten.',
          },
        })
        extractedText = data?.content || ''
      } catch(err) {
        extractedText = `[Kunde inte extrahera text från ${file.name}]`
      }
      await supabase.from('course_materials').insert({
        user_id: user.id,
        exam_id: examId,
        course_id: courseId,
        file_name: file.name,
        content: extractedText,
      })
      await fetchCourses()
      setUploadingCourseMaterial(null)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function copyGoals(courseId) {
    const courseExams = exams[courseId] || []
    const allGoals = courseExams.flatMap(e => (goals[e.id] || []).map(g => `• ${g.description}`))
    await navigator.clipboard.writeText(allGoals.join('\n'))
    setCopied(courseId)
    setTimeout(() => setCopied(null), 2000)
  }

  const thisWeekHours = studySessions.filter(s => differenceInDays(new Date(), parseISO(s.date)) <= 7).reduce((sum, s) => sum + (s.hours || 0), 0)
  const totalStudyHours = studySessions.reduce((sum, s) => sum + (s.hours || 0), 0)

  return (
    <div className="page-wrap">


      <div className="page-header">
        <div>
          <div className="page-header-title">Plugg</div>
          <div className="page-header-sub">{courses.length} aktiva kurser</div>
        </div>
        <div className="page-header-actions">
          <button onClick={syncMandatory} disabled={syncingMandatory} className="btn btn-ghost">{syncingMandatory ? <Loader size={13} style={{ animation: "spin 1s linear infinite" }} /> : null} Synka</button>
        </div>
      </div>
      <div className="page-content-scroll">
        <div style={{ padding: "16px 16px 0", maxWidth: "1000px", margin: "0 auto" }}>

      <div className="mx-segment" style={{ display: 'flex', width: '100%', marginBottom: '20px' }}>
        {[{ id: 'aktiva', label: 'Aktiva kurser', icon: GraduationCap }, { id: 'arkiv', label: 'Arkiv', icon: Archive }, { id: 'session', label: 'Studielogg', icon: BookOpen }].map(tab => {
          const TabIcon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`mx-segment-btn ${activeTab === tab.id ? 'active' : ''}`} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
              <TabIcon size={15} className="mx-seg-ico" /> {tab.label}
            </button>
          )
        })}
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
                  <input className="input" placeholder="t.ex. 2LAO04" value={courseForm.name} onChange={e => setCourseForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Termin</label>
                  <select className="input" value={courseForm.term} onChange={e => setCourseForm(f => ({ ...f, term: e.target.value }))}>
                    {TERMS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px' }}>Slutdatum</label>
                  <input className="input" type="date" value={courseForm.exam_date} onChange={e => setCourseForm(f => ({ ...f, exam_date: e.target.value }))} />
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

          {[...courses].sort((a, b) => {
            const aExtra = a.term === 'Extrakurrikulär' ? 1 : 0
            const bExtra = b.term === 'Extrakurrikulär' ? 1 : 0
            return aExtra - bExtra
          }).map((course, courseIdx, sortedArr) => {
            const prevCourse = sortedArr[courseIdx - 1]
            const showExtraHeader = course.term === 'Extrakurrikulär' && (courseIdx === 0 || prevCourse?.term !== 'Extrakurrikulär')
            const showLakarHeader = course.term !== 'Extrakurrikulär' && courseIdx === 0 && sortedArr.some(c => c.term === 'Extrakurrikulär')
            const isExpanded = expandedCourse === course.id
            const courseExams = exams[course.id] || []
            const doneExams = courseExams.filter(e => e.grade === 'G').length
            const isEditing = editingCourse === course.id
            const daysLeft = course.exam_date ? differenceInDays(parseISO(course.exam_date), new Date()) : null
            const mandatoryForCourse = mandatorySessions[course.id] || []
            const attendedCount = mandatoryForCourse.filter(m => m.attended).length
            const accentColor = course.term === 'Extrakurrikulär' ? '#a78bfa' : (daysLeft !== null && daysLeft < 14 ? '#ef4444' : daysLeft !== null && daysLeft < 30 ? '#f59e0b' : '#3b82f6')
            const initials = (course.name || '?').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
            const examPct = courseExams.length > 0 ? Math.round((doneExams / courseExams.length) * 100) : null

            return (
              <div key={course.id}>
                {showLakarHeader && (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '10px' }}>LÄKARPROGRAMMET</div>
                )}
                {showExtraHeader && (
                  <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: '700', letterSpacing: '0.08em', marginBottom: '10px', marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>EXTRAKURRIKULÄRT</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(139,92,246,0.3)' }} />
                  </div>
                )}
              <div className="card pg-course" style={{ marginBottom: '12px', borderColor: course.term === 'Extrakurrikulär' ? 'rgba(139,92,246,0.2)' : 'var(--border)', '--pg-accent': accentColor }}>
                {isEditing ? (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <input className="input" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      <select className="input" value={editForm.term || ''} onChange={e => setEditForm(f => ({ ...f, term: e.target.value }))}>
                        {TERMS.map(t => <option key={t}>{t}</option>)}
                      </select>
                      <input className="input" type="date" value={editForm.exam_date || ''} onChange={e => setEditForm(f => ({ ...f, exam_date: e.target.value }))} />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={saveEditCourse} className="btn btn-primary" disabled={saving}><Save size={14} /> Spara</button>
                      <button onClick={() => setEditingCourse(null)} className="btn btn-ghost">Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}
                      onClick={() => setExpandedCourse(isExpanded ? null : course.id)}>
                      <div className="pg-avatar" style={{ '--pg-accent': accentColor }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: '15px', fontWeight: '700', letterSpacing: '-0.01em' }}>{course.name}</div>
                          {courseExams.length > 0 && (
                            <div style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '999px',
                              background: doneExams === courseExams.length ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                              color: doneExams === courseExams.length ? '#10b981' : '#f59e0b', fontWeight: '700' }}>
                              {doneExams}/{courseExams.length} klara
                            </div>
                          )}
                          {mandatoryForCourse.length > 0 && (
                            <div style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '999px', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: '700' }}>
                               {attendedCount}/{mandatoryForCourse.length}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: examPct !== null ? '8px' : 0 }}>
                          <span style={{ color: course.term === 'Extrakurrikulär' ? '#a78bfa' : 'inherit' }}>{course.term}</span>
                        </div>
                        {examPct !== null && (
                          <div className="pg-progress" style={{ '--pg-accent': accentColor }}>
                            <div className="pg-progress-fill" style={{ width: examPct + '%' }} />
                          </div>
                        )}
                      </div>
                      {daysLeft !== null && (
                        <div className="pg-days" style={{ '--pg-accent': accentColor }}>
                          <div className="pg-days-num">{daysLeft < 0 ? '✓' : daysLeft}</div>
                          <div className="pg-days-lbl">{daysLeft < 0 ? 'Avslutad' : daysLeft === 1 ? 'dag kvar' : 'dagar kvar'}</div>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
                        <button onClick={e => { e.stopPropagation(); setEditingCourse(course.id); setEditForm({ name: course.name, term: course.term, exam_date: course.exam_date || '' }) }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '4px', opacity: 0.6 }}><Edit2 size={14} /></button>
                        {isExpanded ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>

                        <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Obligatoriska */}
                        {mandatoryForCourse.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>OBLIGATORISKA MOMENT ({mandatoryForCourse.length})</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                              {mandatoryForCourse.sort((a, b) => b.date.localeCompare(a.date)).map(session => {
                                const timeStr = session.start_time ? format(parseISO(session.start_time), 'HH:mm') + (session.end_time ? '\u2013' + format(parseISO(session.end_time), 'HH:mm') : '') : null
                                const parsedMand = session.custom_title ? { label: session.custom_title, teachers: [] } : parseMandTitle(session.title)
                                const displayTitle = parsedMand.label
                                const teacherStr = parsedMand.teachers.length > 0 ? parsedMand.teachers[0].split(' ').slice(0, 2).join(' ') + (parsedMand.teachers.length > 1 ? ` +${parsedMand.teachers.length - 1}` : '') : null
                                const isEditingThis = editingMandTitle === session.id
                                return (
                                  <div key={session.id} style={{ borderRadius: '8px', background: session.attended ? 'rgba(16,185,129,0.06)' : 'var(--surface2)', border: `1px solid ${session.attended ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`, marginBottom: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                                      <button onClick={() => toggleMandatoryAttended(session.id, session.attended)} style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: `2px solid ${session.attended ? '#10b981' : 'rgba(255,255,255,0.2)'}`, background: session.attended ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {session.attended && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                                      </button>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        {isEditingThis ? (
                                          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                                            <input autoFocus className="input" value={mandTitleDraft} onChange={e => setMandTitleDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveMandTitle(session.id); if (e.key === 'Escape') setEditingMandTitle(null) }} style={{ fontSize: 12, padding: '4px 8px', flex: 1 }} />
                                            <button onClick={() => saveMandTitle(session.id)} className="btn btn-primary" style={{ padding: '4px 8px', fontSize: 11 }}><Check size={11} /></button>
                                            <button onClick={() => setEditingMandTitle(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2 }}><X size={12} /></button>
                                          </div>
                                        ) : (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <span style={{ fontSize: 13, fontWeight: 500, color: session.attended ? 'var(--muted)' : 'var(--text)', textDecoration: session.attended ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayTitle}</span>
                                            <button onClick={() => { setEditingMandTitle(session.id); setMandTitleDraft(displayTitle) }} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, opacity: 0.4, flexShrink: 0 }}><Edit2 size={11} /></button>
                                          </div>
                                        )}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center', minWidth: 0 }}>
                                          <span style={{ fontSize: 11, color: 'var(--muted)', flexShrink: 0 }}>{format(parseISO(session.date), 'd MMM', { locale: sv })}</span>
                                          {timeStr && <span style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 600, flexShrink: 0 }}>{timeStr}</span>}
                                          {teacherStr && <span style={{ fontSize: 11, color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teacherStr}</span>}
                                        </div>
                                      </div>
                                      <button onClick={() => deleteMandatorySession(session.id)} style={{ background: 'none', border: 'none', color: 'rgba(248,113,113,0.35)', cursor: 'pointer', padding: 3, flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.color = '#f87171'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(248,113,113,0.35)'}><Trash2 size={12} /></button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Uppgifter */}
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600' }}>UPPGIFTER</div>
                            {showNewTaskFor !== course.id && (
                              <button onClick={() => { setShowNewTaskFor(course.id); resetTaskForm() }} className="btn btn-ghost" style={{ fontSize: '12px', padding: '5px 10px' }}>
                                Ny uppgift
                              </button>
                            )}
                          </div>

                          {showNewTaskFor === course.id && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--surface2)', padding: '12px', marginBottom: '10px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 0.8fr 0.8fr', gap: '8px', marginBottom: '8px' }}>
                                <input className="input" placeholder="Uppgift, t.ex. Plugga inflammation" value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} />
                                <select className="input" value={taskForm.task_type} onChange={e => setTaskForm(f => ({ ...f, task_type: e.target.value }))}>
                                  {['läsa', 'föreläsning', 'anki', 'tenta', 'repetition', 'annat'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <select className="input" value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}>
                                  <option value="low">Låg</option>
                                  <option value="medium">Medium</option>
                                  <option value="high">Hög</option>
                                </select>
                                <input className="input" type="number" min="0" placeholder="min" value={taskForm.estimated_minutes} onChange={e => setTaskForm(f => ({ ...f, estimated_minutes: e.target.value }))} />
                              </div>
                              <input className="input" placeholder="Anteckningar, valfritt" value={taskForm.notes} onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))} style={{ marginBottom: '10px' }} />

                              <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '6px' }}>DEADLINES / MILESTONES</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                                {taskForm.deadlines.map((deadline, index) => (
                                  <div key={index} className="plugg-deadline-row" style={{ display: 'grid', gridTemplateColumns: '1fr 170px auto', gap: '8px', alignItems: 'center' }}>
                                    <input className="input" placeholder="Namn, t.ex. Läs kapitel 4" value={deadline.name} onChange={e => updateTaskDeadlineField(index, 'name', e.target.value)} />
                                    <input className="input" type="date" value={deadline.due_date} onChange={e => updateTaskDeadlineField(index, 'due_date', e.target.value)} />
                                    <button onClick={() => removeTaskDeadlineField(index)} className="btn btn-ghost btn-icon" type="button"><X size={13} /></button>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                <button onClick={addTaskDeadlineField} className="btn btn-ghost" type="button" style={{ fontSize: '12px' }}>Lägg till deadline</button>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button onClick={() => { setShowNewTaskFor(null); resetTaskForm() }} className="btn btn-ghost">Avbryt</button>
                                  <button onClick={() => saveStudyTask(course.id)} className="btn btn-primary" disabled={saving || !taskForm.title.trim()}>{saving ? 'Sparar...' : 'Spara uppgift'}</button>
                                </div>
                              </div>
                            </div>
                          )}

                          {(studyTasks[course.id] || []).length === 0 ? (
                            <button onClick={() => { setShowNewTaskFor(course.id); resetTaskForm() }}
                              className="evidence-clickable"
                              style={{ width: '100%', fontSize: '12px', color: 'var(--muted2)', padding: '12px', border: '1px dashed var(--border2)', borderRadius: '10px', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                              <Plus size={13} /> Lägg till första uppgiften
                            </button>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {(studyTasks[course.id] || []).map(task => {
                                const deadlinesForTask = taskDeadlines[task.id] || []
                                const completedDeadlines = deadlinesForTask.filter(d => d.completed).length
                                const nextDeadline = deadlinesForTask
                                  .filter(d => !d.completed && d.due_date)
                                  .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
                                const done = task.status === 'done'
                                const priorityColor = task.priority === 'high' ? '#ef4444' : task.priority === 'low' ? '#6b7280' : '#f59e0b'
                                return (
                                  <div key={task.id} style={{ border: '1px solid var(--border)', borderRadius: '10px', background: done ? 'rgba(16,185,129,0.06)' : 'var(--surface2)', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer' }} onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0, flex: 1 }}>
                                        <button onClick={e => { e.stopPropagation(); toggleStudyTask(task) }} style={{ width: '20px', height: '20px', borderRadius: '6px', border: `1px solid ${done ? '#10b981' : 'var(--border)'}`, background: done ? 'rgba(16,185,129,0.2)' : 'transparent', color: done ? '#10b981' : 'var(--muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                          {done ? <Check size={13} /> : null}
                                        </button>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                          <div style={{ fontSize: '13px', fontWeight: '600', color: done ? 'var(--muted)' : 'var(--text)', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                                          <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'flex', gap: '8px', marginTop: '2px', flexWrap: 'wrap' }}>
                                            <span>{task.task_type}</span>
                                            <span style={{ color: priorityColor, fontWeight: '600' }}>{task.priority === 'high' ? 'Hög prio' : task.priority === 'low' ? 'Låg prio' : 'Medium prio'}</span>
                                            {task.estimated_minutes ? <span>{task.estimated_minutes} min</span> : null}
                                            {deadlinesForTask.length > 0 ? <span>{completedDeadlines}/{deadlinesForTask.length} deadlines</span> : null}
                                            {nextDeadline ? <span style={{ color: '#3b82f6', fontWeight: '600' }}>Nästa: {nextDeadline.name || 'Deadline'} · {format(parseISO(nextDeadline.due_date), 'd MMM', { locale: sv })}</span> : null}
                                          </div>
                                        </div>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button onClick={e => { e.stopPropagation(); deleteStudyTask(task.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', opacity: 0.55, padding: '3px' }}><Trash2 size={13} /></button>
                                        {expandedTask === task.id ? <ChevronUp size={13} color="var(--muted)" /> : <ChevronDown size={13} color="var(--muted)" />}
                                      </div>
                                    </div>
                                    {expandedTask === task.id && (
                                      <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border)' }}>
                                        {task.notes && <div style={{ fontSize: '12px', color: 'var(--muted2)', lineHeight: '1.5', marginTop: '10px', marginBottom: '8px' }}>{task.notes}</div>}
                                        {deadlinesForTask.length > 0 && (
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                                            {deadlinesForTask.map(deadline => (
                                              <div key={deadline.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: deadline.completed ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.035)', border: `1px solid ${deadline.completed ? 'rgba(16,185,129,0.18)' : 'var(--border)'}` }}>
                                                <button onClick={() => toggleTaskDeadline(deadline)} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                                                  <span style={{ width: '18px', height: '18px', borderRadius: '5px', border: `1px solid ${deadline.completed ? '#10b981' : 'var(--border)'}`, background: deadline.completed ? 'rgba(16,185,129,0.2)' : 'transparent', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{deadline.completed ? <Check size={12} /> : null}</span>
                                                  <span style={{ fontSize: '12px', fontWeight: '500', color: deadline.completed ? 'var(--muted)' : 'var(--text)', textDecoration: deadline.completed ? 'line-through' : 'none' }}>{deadline.name || 'Deadline'}</span>
                                                </button>
                                                {deadline.due_date && <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>{format(parseISO(deadline.due_date), 'd MMM yyyy', { locale: sv })}</span>}
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* Examinationer */}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: '16px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>EXAMINATIONER</div>
                          {courseExams.map(exam => {
                            const isExamExpanded = expandedExam === exam.id
                            const examGoalList = goals[exam.id] || []
                            const examFilesForExam = examFiles[exam.id] || []
                            const examMaterials = courseMaterials[exam.id] || []
                            const totalFiles = examFilesForExam.length + examMaterials.length + (examGoalList.some(g => g.source_file && g.source_file !== 'manual') ? 1 : 0)
                            const showFiles = showFilesFor === exam.id
                            return (
                              <div key={exam.id} style={{ marginBottom: '10px', border: `1px solid ${exam.grade === 'G' ? 'rgba(16,185,129,0.3)' : exam.grade === 'IG' ? 'rgba(239,68,68,0.3)' : 'rgba(139,92,246,0.2)'}`, borderRadius: '12px', overflow: 'hidden', background: exam.grade === 'G' ? 'rgba(16,185,129,0.07)' : exam.grade === 'IG' ? 'rgba(239,68,68,0.07)' : 'rgba(139,92,246,0.05)' }}>
                                <div style={{ padding: '14px', cursor: 'pointer' }}
                                  onClick={() => setExpandedExam(isExamExpanded ? null : exam.id)}>
                                  {/* Top: name + grade + expand */}
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)', lineHeight: 1.3, flex: 1 }}>{exam.name}</div>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                      {GRADES.map(g => (
                                        <button key={g} onClick={e => { e.stopPropagation(); updateExamGrade(exam.id, exam.grade === g ? null : g) }} style={{ padding: '3px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif', border: `1px solid ${exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--border)'}`, background: exam.grade === g ? (g === 'G' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'transparent', color: exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--muted)', fontWeight: exam.grade === g ? 700 : 400 }}>{g}</button>
                                      ))}
                                      {isExamExpanded ? <ChevronUp size={13} color="var(--muted)" /> : <ChevronDown size={13} color="var(--muted)" />}
                                    </div>
                                  </div>
                                  {/* Middle: date + goals count */}
                                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                                    {exam.exam_date && <CountdownBadge examDate={exam.exam_date} />}
                                    {examGoalList.length > 0 && <span style={{ fontSize: '11px', color: 'var(--muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 20 }}>{examGoalList.length} lärandemål</span>}
                                  </div>
                                  {/* Bottom: action buttons */}
                                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {examGoalList.length > 0 && (
                                      <button onClick={e => { e.stopPropagation(); setStudySession({ exam, courseId: course.id, goals: examGoalList }) }} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: 'white', cursor: 'pointer', fontSize: '13px', fontFamily: 'Inter, sans-serif', fontWeight: '700', boxShadow: '0 2px 8px rgba(139,92,246,0.4)', flex: 1, justifyContent: 'center' }}><BookOpen size={13} /> Plugga</button>
                                    )}
                                    <button onClick={e => { e.stopPropagation(); setShowFilesFor(showFiles ? null : exam.id) }} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: showFiles ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)', color: showFiles ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
                                      <FileText size={11} /> {totalFiles > 0 ? `Filer (${totalFiles})` : 'Filer'}
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); deleteExam(exam.id) }} style={{ background: 'none', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: 'rgba(248,113,113,0.6)' }}>
                                      <X size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* File manager panel */}
                                {showFiles && (
                                  <div style={{ padding: '12px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }} onClick={e => e.stopPropagation()}>
                                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>BIFOGADE FILER</div>

                                    {/* Lärandemål PDF */}
                                    <div style={{ marginBottom: '10px' }}>
                                      <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: '600', marginBottom: '5px' }}>LÄRANDEMÅL</div>
                                      {examGoalList.filter(g => g.source_file && g.source_file !== 'manual').length > 0
                                        ? [...new Set(examGoalList.filter(g => g.source_file && g.source_file !== 'manual').map(g => g.source_file))].map(fname => (
                                          <div key={fname} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', marginBottom: '4px' }}>
                                            <FileText size={11} color="#3b82f6" />
                                            <span style={{ fontSize: '12px', flex: 1, color: '#3b82f6' }}>{fname}</span>
                                            <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{examGoalList.filter(g => g.source_file === fname).length} mål</span>
                                            <button onClick={async () => {
                                              if (!window.confirm(`Ta bort alla lärandemål från "${fname}"?`)) return
                                              const idsToDelete = examGoalList.filter(g => g.source_file === fname).map(g => g.id)
                                              for (const id of idsToDelete) await supabase.from('learning_goals').delete().eq('id', id)
                                              await fetchCourses()
                                            }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', opacity: 0.7 }}>
                                              <Trash2 size={11} />
                                            </button>
                                          </div>
                                        ))
                                        : <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Inga lärandemål importerade</div>
                                      }
                                      <input type="file" accept=".pdf" style={{ display: 'none' }} id={`goals-panel-${exam.id}`} onChange={e => handleGoalsPdfUpload(e, exam.id, course.id)} />
                                      <label htmlFor={`goals-panel-${exam.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', cursor: 'pointer', fontSize: '11px', background: 'rgba(59,130,246,0.06)', marginTop: '4px' }}>
                                        {uploadingGoalsPdf === exam.id ? <><Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> Importerar...</> : <><Upload size={10} /> Ladda upp PDF</>}
                                      </label>
                                    </div>

                                    {/* Gamla tentor */}
                                    <div style={{ marginBottom: '10px' }}>
                                      <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '600', marginBottom: '5px' }}>GAMLA TENTOR</div>
                                      {examFilesForExam.length > 0
                                        ? examFilesForExam.map(f => (
                                          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)', marginBottom: '4px' }}>
                                            <FileText size={11} color="#f59e0b" />
                                            <span style={{ fontSize: '12px', flex: 1 }}>{f.file_name}</span>
                                            <button onClick={() => deleteExamFile(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', opacity: 0.7 }}>
                                              <Trash2 size={11} />
                                            </button>
                                          </div>
                                        ))
                                        : <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Inga gamla tentor uppladdade</div>
                                      }
                                      <input type="file" accept=".pdf" style={{ display: 'none' }} id={`oldexam-panel-${exam.id}`} onChange={e => handleOldExamUpload(e, exam.id, course.id)} />
                                      <label htmlFor={`oldexam-panel-${exam.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', cursor: 'pointer', fontSize: '11px', background: 'rgba(245,158,11,0.06)', marginTop: '4px' }}>
                                        {uploadingOldExam === exam.id ? <><Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</> : <><Upload size={10} /> Ladda upp PDF</>}
                                      </label>
                                    </div>

                                    {/* Kursmaterial */}
                                    <div style={{ marginBottom: '4px' }}>
                                      <div style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', marginBottom: '5px' }}>KURSMATERIAL</div>
                                      {examMaterials.length > 0
                                        ? examMaterials.map(m => (
                                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', marginBottom: '4px' }}>
                                            <FileText size={11} color="#10b981" />
                                            <span style={{ fontSize: '12px', flex: 1 }}>{m.file_name}</span>
                                            <button onClick={() => deleteCourseMaterial(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', opacity: 0.7 }}>
                                              <Trash2 size={11} />
                                            </button>
                                          </div>
                                        ))
                                        : <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>Inget kursmaterial uppladdat</div>
                                      }
                                      <input type="file" accept=".pdf" style={{ display: 'none' }} id={`material-panel-${exam.id}`} onChange={e => handleCourseMaterialUpload(e, exam.id, course.id)} />
                                      <label htmlFor={`material-panel-${exam.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', cursor: 'pointer', fontSize: '11px', background: 'rgba(16,185,129,0.06)', marginTop: '4px' }}>
                                        {uploadingCourseMaterial === exam.id ? <><Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> Läser in...</> : <><Upload size={10} /> Ladda upp PDF</>}
                                      </label>
                                    </div>
                                  </div>
                                )}

                                {isExamExpanded && (
                                  <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
                                    {/* Poäng */}
                                    <div style={{ marginBottom: '12px' }}>
                                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>POÄNG</div>
                                      {editingExamPoints === exam.id ? (
                                        <div className="page-header-actions">
                                          <input className="input" type="number" placeholder="Fick" value={examPointsForm.points_earned} onChange={e => setExamPointsForm(f => ({ ...f, points_earned: e.target.value }))} style={{ width: '70px', padding: '6px 8px' }} />
                                          <span style={{ color: 'var(--muted)' }}>/</span>
                                          <input className="input" type="number" placeholder="Max" value={examPointsForm.points_max} onChange={e => setExamPointsForm(f => ({ ...f, points_max: e.target.value }))} style={{ width: '70px', padding: '6px 8px' }} />
                                          <button onClick={() => saveExamPoints(exam.id)} className="btn btn-primary" style={{ padding: '6px 10px' }}><Check size={12} /></button>
                                          <button onClick={() => setEditingExamPoints(null)} className="btn btn-ghost" style={{ padding: '6px 10px' }}><X size={12} /></button>
                                        </div>
                                      ) : (
                                        <button onClick={() => { setEditingExamPoints(exam.id); setExamPointsForm({ points_earned: exam.points_earned || '', points_max: exam.points_max || '' }) }}
                                          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', color: 'var(--muted)', fontSize: '12px', fontFamily: 'Inter, sans-serif' }}>
                                          {exam.points_earned && exam.points_max ? `️ ${exam.points_earned}/${exam.points_max}p` : '+ Poäng'}
                                        </button>
                                      )}
                                    </div>

                                    {/* Filhantering finns i "Filer"-panelen ovan */}

                                    {/* Lärandemål */}
                                    {examGoalList.length > 0 && (
                                      <div style={{ marginBottom: '12px' }}>
                                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', fontWeight: '600' }}>LÄRANDEMÅL ({examGoalList.length})</div>
                                        <div className="pg-goals-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '6px', ...(examGoalList.length > 6 ? { maxHeight: '232px', overflowY: 'auto', paddingRight: '6px' } : {}) }}>
                                          {examGoalList.map(goal => {
                                            const m = goal.mastery || 0
                                            const color = m >= 80 ? '#10b981' : m >= 50 ? '#f59e0b' : m >= 20 ? '#3b82f6' : '#6b7280'
                                            return (
                                              <div key={goal.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                                <div style={{ flexShrink: 0, marginTop: '2px', width: '28px', height: '28px', borderRadius: '50%', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: color + '15' }}>
                                                  <span style={{ fontSize: '8px', fontWeight: '700', color, fontFamily: 'monospace' }}>{m}</span>
                                                </div>
                                                <span style={{ fontSize: '12px', color: 'var(--muted2)', lineHeight: '1.5', paddingTop: '4px' }}>{goal.description}</span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Lägg till lärandemål */}
                                    {addingGoalTo === exam.id ? (
                                      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                        <input className="input" placeholder="Nytt lärandemål..." value={newGoal} onChange={e => setNewGoal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addGoal(exam.id, course.id)} />
                                        <button onClick={() => addGoal(exam.id, course.id)} className="btn btn-primary" style={{ padding: '8px 12px' }}><Check size={14} /></button>
                                        <button onClick={() => setAddingGoalTo(null)} className="btn btn-ghost" style={{ padding: '8px 12px' }}><X size={14} /></button>
                                      </div>
                                    ) : (
                                      <button onClick={() => setAddingGoalTo(exam.id)} className="btn btn-ghost" style={{ fontSize: '12px', marginBottom: '12px' }}>
                                        <Plus size={11} /> Lärandemål
                                      </button>
                                    )}

                                    {/* Lägg till examination */}
                                    {addingExamTo === exam.id ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <input className="input" placeholder="Examinationsnamn" value={examForm.name} onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))} />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                          <input className="input" type="date" value={examForm.exam_date} onChange={e => setExamForm(f => ({ ...f, exam_date: e.target.value }))} />
                                          <input className="input" placeholder="Anteckningar" value={examForm.notes} onChange={e => setExamForm(f => ({ ...f, notes: e.target.value }))} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                          <button onClick={() => saveExam(course.id)} className="btn btn-primary" disabled={saving}><Save size={12} /> Spara</button>
                                          <button onClick={() => setAddingExamTo(null)} className="btn btn-ghost">Avbryt</button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {addingExamTo === course.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                            <input className="input" placeholder="t.ex. Delexamination 1" value={examForm.name} onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <input className="input" type="date" value={examForm.exam_date} onChange={e => setExamForm(f => ({ ...f, exam_date: e.target.value }))} />
                              <input className="input" placeholder="Anteckningar" value={examForm.notes} onChange={e => setExamForm(f => ({ ...f, notes: e.target.value }))} />
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

                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', paddingTop: '12px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button onClick={() => copyGoals(course.id)} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                            {copied === course.id ? <><Check size={12} /> Kopierat!</> : <><Copy size={12} /> Kopiera mål</>}
                          </button>
                          <button onClick={() => estimateTime(course.id)} disabled={estimatingTime === course.id} className="btn btn-ghost" style={{ fontSize: '12px' }}>
                            {estimatingTime === course.id ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Estimerar...</> : <><Zap size={12} /> Estimera tid</>}
                          </button>
                          <span style={{ flex: 1 }} />
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
              </div>
            )
          })}

          <button onClick={() => setShowNewCourse(true)} className="btn btn-primary" style={{ marginTop: '8px' }}>
            <Plus size={14} /> Ny kurs
          </button>

          {mandatoryUnmatched.length > 0 && (
            <div className="card" style={{ marginTop: '16px', borderColor: 'rgba(139,92,246,0.2)' }}>
              <div style={{ fontSize: '12px', color: '#a78bfa', fontWeight: '600', marginBottom: '8px' }}>OBLIGATORISKA UTAN KOPPLAD KURS ({mandatoryUnmatched.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {mandatoryUnmatched.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div>
                      <div>{s.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{format(parseISO(s.date), 'd MMM yyyy', { locale: sv })}</div>
                    </div>
                    <button onClick={() => toggleMandatoryAttended(s.id, s.attended)} style={{
                      fontSize: '11px', padding: '3px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                      background: s.attended ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                      color: s.attended ? '#10b981' : 'var(--muted)', fontFamily: 'Inter, sans-serif',
                    }}>{s.attended ? '✓ Närvaro' : 'Markera'}</button>
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
              <div style={{ fontWeight: '600', marginBottom: '14px' }}>Arkivera kurs</div>
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
                  <input className="input" type="date" value={archiveForm.exam_date} onChange={e => setArchiveForm(f => ({ ...f, exam_date: e.target.value }))} />
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
            return (
              <div key={course.id} className="card pg-course" style={{ marginBottom: '10px', borderColor: course.grade === 'G' ? 'rgba(16,185,129,0.2)' : 'var(--border)', '--pg-accent': course.grade === 'G' ? '#10b981' : course.grade === 'IG' ? '#ef4444' : '#6b7280' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setExpandedCourse(isExpanded ? null : `archive-${course.id}`)}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <div style={{ fontSize: '14px', fontWeight: '600' }}>{course.name}</div>
                      {course.grade && (
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px',
                          background: course.grade === 'G' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: course.grade === 'G' ? '#10b981' : '#ef4444', fontWeight: '700' }}>{course.grade}</span>
                      )}
                      {courseExams.length > 0 && <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{doneExams}/{courseExams.length} klara</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                      {course.term}{course.exam_date ? ` · ${format(parseISO(course.exam_date), 'MMM yyyy', { locale: sv })}` : ''}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={14} color="var(--muted)" /> : <ChevronDown size={14} color="var(--muted)" />}
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px' }}>EXAMINATIONER</div>
                    {courseExams.map(exam => {
                      const examGoalList = goals[exam.id] || []
                      return (
                        <div key={exam.id} style={{ marginBottom: '8px', padding: '10px 14px', borderRadius: '8px',
                          background: exam.grade === 'G' ? 'rgba(16,185,129,0.06)' : 'var(--surface2)',
                          border: `1px solid ${exam.grade === 'G' ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
                          borderLeft: `3px solid ${exam.grade === 'G' ? '#10b981' : exam.grade === 'IG' ? '#ef4444' : 'var(--border)'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '13px', fontWeight: '500' }}>{exam.name}</div>
                            <div className="page-header-actions">
                              {GRADES.map(g => (
                                <button key={g} onClick={() => updateExamGrade(exam.id, exam.grade === g ? null : g)} style={{
                                  padding: '3px 10px', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontFamily: 'Inter, sans-serif',
                                  border: `1px solid ${exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--border)'}`,
                                  background: exam.grade === g ? (g === 'G' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'transparent',
                                  color: exam.grade === g ? (g === 'G' ? '#10b981' : '#ef4444') : 'var(--muted)',
                                }}>{g}</button>
                              ))}
                              {exam.points_earned && exam.points_max && (
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{exam.points_earned}/{exam.points_max}p</span>
                              )}
                            </div>
                          </div>
                          {examGoalList.length > 0 && (
                            <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--muted)' }}>{examGoalList.length} lärandemål</div>
                          )}
                        </div>
                      )
                    })}
                    {addingExamTo === `arc-${course.id}` ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                        <input className="input" placeholder="Examinationsnamn" value={examForm.name} onChange={e => setExamForm(f => ({ ...f, name: e.target.value }))} />
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => saveExam(course.id)} className="btn btn-primary" disabled={saving}><Save size={12} /> Spara</button>
                          <button onClick={() => setAddingExamTo(null)} className="btn btn-ghost">Avbryt</button>
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

          <button onClick={() => setShowNewArchive(true)} className="btn btn-ghost" style={{ marginTop: '8px', fontSize: '13px' }}>
            <Plus size={14} /> Arkivera kurs manuellt
          </button>
        </>
      )}

      {/* ===== STUDIELOGG ===== */}
      {activeTab === 'session' && (
        <>
          <div className="plugg-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Denna vecka', value: `${thisWeekHours.toFixed(1)}h`, color: '#f59e0b' },
              { label: 'Totalt loggat', value: `${totalStudyHours.toFixed(1)}h`, color: '#3b82f6' },
              { label: 'Sessioner', value: studySessions.length, color: '#10b981' },
            ].map(({ label, value, color }) => (
              <div key={label} className="pg-stat" style={{ '--pg-c': color }}>
                <div className="pg-stat-cap">{label}</div>
                <div className="pg-stat-num mono">{value}</div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="mono" style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>{session.hours}h</div>
                    <button onClick={async () => {
                      await supabase.from('study_sessions').delete().eq('id', session.id)
                      await fetchStudySessions()
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', opacity: 0.5, padding: '4px' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {studySession && (
        <StudyModal
          exam={studySession.exam}
          courseId={studySession.courseId}
          goals={goals[studySession.exam.id] || studySession.goals}
          onClose={() => setStudySession(null)}
          onMasteryUpdate={() => fetchCourses()}
        />
      )}
    </div>
        </div>
      </div>
  )
}