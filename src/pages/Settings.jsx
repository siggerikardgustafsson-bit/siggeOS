import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { supabase } from '../lib/supabase'
import {
  Sun, Moon, Palette, Image, Layout, Bell, Shield,
  Download, Trash2, Save, Loader, Upload, X, Check,
  User, Target, Brain, ChevronRight, Zap
} from 'lucide-react'

const ACCENTS = [
  { id: 'blue',   label: 'Blå',    color: '#4f8ef7' },
  { id: 'purple', label: 'Lila',   color: '#a78bfa' },
  { id: 'green',  label: 'Grön',   color: '#34d399' },
  { id: 'pink',   label: 'Rosa',   color: '#f472b6' },
  { id: 'orange', label: 'Orange', color: '#fb923c' },
  { id: 'cyan',   label: 'Cyan',   color: '#22d3ee' },
]

const PRESET_BG = [
  { id: 'none', label: 'Ingen', url: '' },
  { id: 'alps', label: 'Alperna', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&q=80' },
  { id: 'city', label: 'Stad', url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1920&q=80' },
  { id: 'forest', label: 'Skog', url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1920&q=80' },
  { id: 'ocean', label: 'Hav', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80' },
  { id: 'desert', label: 'Öken', url: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1920&q=80' },
  { id: 'aurora', label: 'Norrsken', url: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1920&q=80' },
  { id: 'balkans', label: 'Balkan', url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=80' },
]


const DEFAULT_GOALS = {
  one_year: '',
  three_year: '',
  ten_year: '',
  future_plan: '',
  monthly_income_goal: '',
  body_weight_goal: '',
  body_weight_deadline: '',
  attachments: {
    about_me: [],
    one_year: [],
    three_year: [],
    ten_year: [],
    future_plan: [],
  },
}

function mergeGoals(savedGoals = {}) {
  return {
    ...DEFAULT_GOALS,
    ...savedGoals,
    attachments: {
      ...DEFAULT_GOALS.attachments,
      ...(savedGoals.attachments || {}),
    },
  }
}

function formatFileSize(bytes = 0) {
  if (!bytes) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={15} color="var(--accent)" />
      </div>
      <div>
        <div style={{ fontWeight: '600', fontSize: '15px' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '1px' }}>{subtitle}</div>}
      </div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)} style={{
      width: '44px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer',
      background: value ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      boxShadow: value ? '0 0 12px var(--accent-glow)' : 'none',
    }}>
      <div style={{
        width: '20px', height: '20px', borderRadius: '50%', background: 'white',
        position: 'absolute', top: '3px', transition: 'left 0.2s',
        left: value ? '21px' : '3px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }} />
    </button>
  )
}

function SettingRow({ label, sub, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: '500' }}>{label}</div>
        {sub && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}


function ContextFileUpload({ field, files = [], onUpload, onRemove }) {
  return (
    <div style={{ marginTop: '10px' }}>
      <label className="btn btn-ghost" style={{ fontSize: '12px', width: '100%', justifyContent: 'center', cursor: 'pointer' }}>
        <Upload size={13} /> Bifoga PDF som Jarvis-kontext
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={e => onUpload(field, e.target.files, e)}
          style={{ display: 'none' }}
        />
      </label>

      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
          {files.map(file => (
            <div key={file.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '9px', background: 'var(--surface2)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{formatFileSize(file.size)} · PDF · Jarvis-kontext</div>
              </div>
              <button onClick={() => onRemove(field, file.id)} style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: '3px' }} title="Ta bort fil">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { user, signOut } = useAuth()
  const { theme, setTheme, accent, setAccent, bgImage, setBgImage, blurId, setBlurId, dimId, setDimId, compact, setCompact, BACKGROUNDS, BLUR_LEVELS, DIM_LEVELS } = useTheme()
  const [activeSection, setActiveSection] = useState('utseende')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const bgFileRef = useRef()

  // Profile & goals
  const [displayName, setDisplayName] = useState('')
  const [aboutMe, setAboutMe] = useState('')
  const [goals, setGoals] = useState(DEFAULT_GOALS)
  const [jarvisStyle, setJarvisStyle] = useState(70) // 0=diplomatic, 100=brutal
  const [jarvisLang, setJarvisLang] = useState('svenska')
  const [jarvisPersonality, setJarvisPersonality] = useState('')

  // Notifications
  const [notifJournal, setNotifJournal] = useState(false)
  const [notifTraining, setNotifTraining] = useState(false)

  useEffect(() => {
    if (user) loadProfile()
  }, [user])

  async function loadProfile() {
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setDisplayName(data.display_name || '')
      setAboutMe(data.about_me || '')
      setGoals(mergeGoals(data.goals))
      setJarvisStyle(data.jarvis_style ?? 70)
      setJarvisLang(data.jarvis_lang || 'svenska')
      setJarvisPersonality(data.jarvis_personality || '')
      setNotifJournal(data.notif_journal || false)
      setNotifTraining(data.notif_training || false)
    }
  }

  async function saveProfile() {
    setSaving(true)
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      display_name: displayName,
      about_me: aboutMe,
      goals,
      jarvis_style: jarvisStyle,
      jarvis_lang: jarvisLang,
      jarvis_personality: jarvisPersonality,
      notif_journal: notifJournal,
      notif_training: notifTraining,
    }, { onConflict: 'user_id' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }


  function getContextFiles(field) {
    return goals.attachments?.[field] || []
  }

  function handleContextFileUpload(field, fileList, event) {
    const files = Array.from(fileList || [])
    if (!files.length) return

    files.forEach(file => {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return

      const reader = new FileReader()
      reader.onload = ev => {
        const uploadedFile = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          type: file.type || 'application/pdf',
          size: file.size,
          dataUrl: ev.target.result,
          uploadedAt: new Date().toISOString(),
        }

        setGoals(g => ({
          ...g,
          attachments: {
            ...(g.attachments || {}),
            [field]: [...(g.attachments?.[field] || []), uploadedFile],
          },
        }))
      }
      reader.readAsDataURL(file)
    })

    if (event?.target) event.target.value = ''
  }

  function removeContextFile(field, fileId) {
    setGoals(g => ({
      ...g,
      attachments: {
        ...(g.attachments || {}),
        [field]: (g.attachments?.[field] || []).filter(file => file.id !== fileId),
      },
    }))
  }

  function handleBgUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setBgImage(ev.target.result)
    reader.readAsDataURL(file)
  }

  async function exportData() {
    const tables = ['health_logs', 'journal_entries', 'training_sessions', 'income_logs', 'expense_logs', 'pa_shifts', 'trips', 'adventures', 'side_quests']
    const result = {}
    for (const t of tables) {
      const { data } = await supabase.from(t).select('*').eq('user_id', user.id)
      result[t] = data || []
    }
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sigge-os-export-${new Date().toISOString().slice(0,10)}.json`
    a.click()
  }

  const sections = [
    { id: 'utseende', label: 'Utseende', icon: Palette },
    { id: 'profil', label: 'Profil & mål', icon: User },
    { id: 'jarvis', label: 'Jarvis AI', icon: Brain },
    { id: 'notiser', label: 'Notiser', icon: Bell },
    { id: 'data', label: 'Data & integritet', icon: Shield },
  ]

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Inställningar</div>
          <div className="page-header-sub">Anpassa Sigge OS efter dina preferenser</div>
        </div>
      </div>

      <div className="page-content-scroll">
        <div style={{ padding: '16px 16px 0', maxWidth: '820px', margin: '0 auto' }}>
          <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'start' }}>

        {/* Sidebar nav */}
        <div className="card settings-nav" style={{ padding: '8px', position: 'sticky', top: '16px' }}>
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)} className="settings-nav-btn" style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '9px',
              padding: '9px 10px', borderRadius: '9px', border: 'none', cursor: 'pointer',
              background: activeSection === s.id ? 'var(--accent-soft)' : 'transparent',
              color: activeSection === s.id ? 'var(--accent)' : 'var(--muted2)',
              fontSize: '13px', fontWeight: activeSection === s.id ? '500' : '400',
              fontFamily: 'Inter, sans-serif', transition: 'all 0.15s', textAlign: 'left',
              borderLeft: activeSection === s.id ? `2px solid var(--accent)` : '2px solid transparent',
            }}>
              <s.icon size={14} />
              {s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* ===== UTSEENDE ===== */}
          {activeSection === 'utseende' && (
            <>
              <div className="card">
                <SectionHeader icon={Moon} title="Tema" subtitle="Välj mörkt eller ljust läge" />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                  {[
                    { id: 'dark',  label: 'Mörkt', icon: Moon,  preview: '#07090f' },
                    { id: 'light', label: 'Ljust', icon: Sun,   preview: '#f0f2f8' },
                  ].map(t => (
                    <button key={t.id} onClick={() => setTheme(t.id)} style={{
                      padding: '14px', borderRadius: '12px', cursor: 'pointer',
                      border: `1.5px solid ${theme === t.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: theme === t.id ? 'var(--accent-soft)' : 'var(--surface2)',
                      display: 'flex', alignItems: 'center', gap: '10px', fontFamily: 'Inter, sans-serif',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ width: '36px', height: '24px', borderRadius: '6px', background: t.preview, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <t.icon size={12} color={t.id === 'dark' ? '#fff' : '#000'} />
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: theme === t.id ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                      {theme === t.id && <Check size={13} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                    </button>
                  ))}
                </div>

                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: '600', marginBottom: '10px', letterSpacing: '0.05em' }}>ACCENTFÄRG</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ACCENTS.map(a => (
                    <button key={a.id} onClick={() => setAccent(a.id)} style={{
                      width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: a.color, transition: 'all 0.15s',
                      outline: accent === a.id ? `3px solid ${a.color}` : '3px solid transparent',
                      outlineOffset: '3px',
                      boxShadow: accent === a.id ? `0 0 14px ${a.color}60` : 'none',
                      transform: accent === a.id ? 'scale(1.1)' : 'scale(1)',
                    }} title={a.label} />
                  ))}
                </div>
              </div>

              <div className="card">
                <SectionHeader icon={Image} title="Bakgrundsbild" subtitle="Alla sidor får glaseffekt ovanpå bilden" />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
                  {(BACKGROUNDS || []).map(bg => (
                    <button key={bg.id} onClick={() => setBgImage(bg.url)} style={{
                      borderRadius: '10px', overflow: 'hidden',
                      border: '1.5px solid ' + (bgImage === bg.url ? 'var(--accent)' : 'var(--border)'),
                      cursor: 'pointer', aspectRatio: '16/9', position: 'relative',
                      padding: 0, transition: 'all 0.15s',
                      boxShadow: bgImage === bg.url ? '0 0 12px var(--accent-glow)' : 'none',
                    }}>
                      {bg.thumb || bg.url ? (
                        <img src={bg.thumb || bg.url} alt={bg.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={16} color="var(--muted)" />
                        </div>
                      )}
                      {bgImage === bg.url && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={16} color="white" />
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: '4px', left: '5px', fontSize: '9px', color: 'white', fontWeight: '600', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                        {bg.label}
                      </div>
                    </button>
                  ))}
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.06em', marginBottom: '8px' }}>OSKÄRPA</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(BLUR_LEVELS || []).map(b => (
                      <button key={b.id} onClick={() => setBlurId(b.id)} style={{
                        flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer',
                        border: '1px solid ' + (blurId === b.id ? 'var(--accent-border)' : 'var(--border)'),
                        background: blurId === b.id ? 'var(--accent-soft)' : 'var(--surface2)',
                        color: blurId === b.id ? 'var(--accent)' : 'var(--muted2)',
                        fontSize: '12px', fontWeight: blurId === b.id ? '600' : '400',
                        fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
                      }}>{b.label}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: '600', letterSpacing: '0.06em', marginBottom: '8px' }}>MÖRKLÄGGNING</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {(DIM_LEVELS || []).map(d => (
                      <button key={d.id} onClick={() => setDimId(d.id)} style={{
                        flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer',
                        border: '1px solid ' + (dimId === d.id ? 'var(--accent-border)' : 'var(--border)'),
                        background: dimId === d.id ? 'var(--accent-soft)' : 'var(--surface2)',
                        color: dimId === d.id ? 'var(--accent)' : 'var(--muted2)',
                        fontSize: '12px', fontWeight: dimId === d.id ? '600' : '400',
                        fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
                      }}>{d.label}</button>
                    ))}
                  </div>
                </div>

                <input ref={bgFileRef} type="file" accept="image/*" onChange={handleBgUpload} style={{ display: 'none' }} />
                <button onClick={() => bgFileRef.current?.click()} className="btn btn-ghost" style={{ fontSize: '12px', width: '100%', justifyContent: 'center' }}>
                  <Upload size={13} /> Ladda upp egen bild
                </button>
              </div>

              <div className="card">
                <SectionHeader icon={Layout} title="Layout" subtitle="Justera täthet och visning" />
                <SettingRow label="Kompakt läge" sub="Tätare spacing, fler datapunkter synliga">
                  <Toggle value={compact} onChange={setCompact} />
                </SettingRow>
              </div>
            </>
          )}

          {/* ===== PROFIL & MÅL ===== */}
          {activeSection === 'profil' && (
            <>
              <div className="card">
                <SectionHeader icon={User} title="Om mig" subtitle="Jarvis använder detta som kontext i alla samtal" />
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>VISNINGSNAMN</label>
                  <input className="input" type="text" placeholder="t.ex. Sigge Gustafsson" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Visas i Dashboard-headern</div>
                </div>
                <textarea className="input" rows={5} placeholder="Berätta om dig själv — vem du är, vad du jobbar med, vad som driver dig..." value={aboutMe} onChange={e => setAboutMe(e.target.value)} style={{ resize: 'vertical', lineHeight: '1.6' }} />
                <ContextFileUpload field="about_me" files={getContextFiles('about_me')} onUpload={handleContextFileUpload} onRemove={removeContextFile} />
              </div>

              <div className="card">
                <SectionHeader icon={Target} title="Långsiktiga mål" subtitle="Redigera mål och bifoga kontext som Jarvis kan använda" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>1 ÅRS MÅL</label>
                    <textarea className="input" rows={3} placeholder="Vad vill du uppnå det närmaste året?" value={goals.one_year} onChange={e => setGoals(g => ({ ...g, one_year: e.target.value }))} style={{ resize: 'vertical' }} />
                    <ContextFileUpload field="one_year" files={getContextFiles('one_year')} onUpload={handleContextFileUpload} onRemove={removeContextFile} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>3 ÅRS MÅL</label>
                    <textarea className="input" rows={3} placeholder="Var befinner du dig om 3 år?" value={goals.three_year} onChange={e => setGoals(g => ({ ...g, three_year: e.target.value }))} style={{ resize: 'vertical' }} />
                    <ContextFileUpload field="three_year" files={getContextFiles('three_year')} onUpload={handleContextFileUpload} onRemove={removeContextFile} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>10 ÅRS VISION</label>
                    <textarea className="input" rows={3} placeholder="Hur ser ditt liv ut om 10 år?" value={goals.ten_year} onChange={e => setGoals(g => ({ ...g, ten_year: e.target.value }))} style={{ resize: 'vertical' }} />
                    <ContextFileUpload field="ten_year" files={getContextFiles('ten_year')} onUpload={handleContextFileUpload} onRemove={removeContextFile} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>FRAMTIDSPLAN</label>
                    <textarea className="input" rows={4} placeholder="Din övergripande plan: hälsa, karriär, ekonomi, relationer, resor, sidoprojekt och livsstil..." value={goals.future_plan} onChange={e => setGoals(g => ({ ...g, future_plan: e.target.value }))} style={{ resize: 'vertical', lineHeight: '1.6' }} />
                    <ContextFileUpload field="future_plan" files={getContextFiles('future_plan')} onUpload={handleContextFileUpload} onRemove={removeContextFile} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>KROPPSVIKTSMÅL (kg)</label>
                      <input className="input" type="number" step="0.1" placeholder="t.ex. 82" value={goals.body_weight_goal} onChange={e => setGoals(g => ({ ...g, body_weight_goal: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>DATUM FÖR VIKTMÅL</label>
                      <input className="input" type="date" value={goals.body_weight_deadline} onChange={e => setGoals(g => ({ ...g, body_weight_deadline: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>INKOMSTMÅL (kr/mån netto)</label>
                    <input className="input" type="number" placeholder="100000" value={goals.monthly_income_goal} onChange={e => setGoals(g => ({ ...g, monthly_income_goal: e.target.value }))} />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>CSN FRIBELOPP (kr/halvår)</label>
                    <input className="input" type="number" placeholder="114500" value={goals.csn_fribelopp || ''} onChange={e => setGoals(g => ({ ...g, csn_fribelopp: e.target.value ? parseInt(e.target.value) : '' }))} />
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Jarvis och Ekonomi-sidan använder detta för CSN-beräkningar. Uppdatera vid regeländring.</div>
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>LÖNINGSDAG (dag i månaden)</label>
                    <input className="input" type="number" min="1" max="31" placeholder="25" value={goals.salary_day || ''} onChange={e => setGoals(g => ({ ...g, salary_day: e.target.value ? parseInt(e.target.value) : '' }))} />
                    <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>Ekonomi mäter perioder löning-till-löning från denna dag.</div>
                  </div>
                </div>
              </div>

              <button onClick={saveProfile} className="btn btn-primary" disabled={saving} style={{ justifyContent: 'center', padding: '12px' }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> :
                 saved ? <><Check size={14} /> Sparat!</> :
                 <><Save size={14} /> Spara profil</>}
              </button>
            </>
          )}

          {/* ===== JARVIS AI ===== */}
          {activeSection === 'jarvis' && (
            <>
              <div className="card">
                <SectionHeader icon={Brain} title="Jarvis beteende" subtitle="Hur ska din AI uppföra sig?" />

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500' }}>Ärlighetsgrad</label>
                    <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: '600' }}>
                      {jarvisStyle < 30 ? 'Diplomatisk' : jarvisStyle < 60 ? 'Balanserad' : jarvisStyle < 85 ? 'Direkt' : 'Brutalt ärlig'}
                    </span>
                  </div>
                  <input type="range" min="0" max="100" value={jarvisStyle} onChange={e => setJarvisStyle(parseInt(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                    <span>Diplomatisk</span>
                    <span>Brutalt ärlig</span>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '8px', fontWeight: '500' }}>SVARSSPRÅK</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['svenska', 'engelska', 'auto'].map(lang => (
                      <button key={lang} onClick={() => setJarvisLang(lang)} style={{
                        flex: 1, padding: '9px', borderRadius: '8px', cursor: 'pointer',
                        border: `1px solid ${jarvisLang === lang ? 'var(--accent-border)' : 'var(--border)'}`,
                        background: jarvisLang === lang ? 'var(--accent-soft)' : 'var(--surface2)',
                        color: jarvisLang === lang ? 'var(--accent)' : 'var(--muted2)',
                        fontSize: '13px', fontWeight: jarvisLang === lang ? '500' : '400', fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
                      }}>
                        {lang.charAt(0).toUpperCase() + lang.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }}>JARVIS PERSONLIGHET (valfritt)</label>
                  <textarea className="input" rows={3} placeholder="Beskriv hur du vill att Jarvis ska uppföra sig eller prata. T.ex. 'Tala som en mentor, var direkt, använd ibland humor'..." value={jarvisPersonality} onChange={e => setJarvisPersonality(e.target.value)} style={{ resize: 'vertical' }} />
                </div>
              </div>

              <button onClick={saveProfile} className="btn btn-primary" disabled={saving} style={{ justifyContent: 'center', padding: '12px' }}>
                {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar...</> :
                 saved ? <><Check size={14} /> Sparat!</> :
                 <><Save size={14} /> Spara inställningar</>}
              </button>
            </>
          )}

          {/* ===== NOTISER ===== */}
          {activeSection === 'notiser' && (
            <div className="card">
              <SectionHeader icon={Bell} title="Påminnelser" subtitle="Kräver att du tillåter notiser i webbläsaren" />
              <SettingRow label="Journal-påminnelse" sub="Påminn mig att logga journal varje kväll">
                <Toggle value={notifJournal} onChange={v => { setNotifJournal(v); saveProfile() }} />
              </SettingRow>
              <SettingRow label="Tränings-påminnelse" sub="Påminn mig om jag inte tränat på 3 dagar">
                <Toggle value={notifTraining} onChange={v => { setNotifTraining(v); saveProfile() }} />
              </SettingRow>
              <div style={{ marginTop: '14px', padding: '12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', fontSize: '12px', color: 'var(--amber)' }}>
                Notiser kräver att Sigge OS är öppen i webbläsaren. Native notiser kräver en installerad app.
              </div>
            </div>
          )}

          {/* ===== DATA & INTEGRITET ===== */}
          {activeSection === 'data' && (
            <>
              <div className="card">
                <SectionHeader icon={Download} title="Exportera data" subtitle="Ladda ner all din data som JSON" />
                <p style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: '1.6', marginBottom: '14px' }}>
                  All din data — hälsa, journal, träning, ekonomi, resor m.m. — exporteras som en JSON-fil du kan spara lokalt.
                </p>
                <button onClick={exportData} className="btn btn-ghost" style={{ fontSize: '13px' }}>
                  <Download size={14} /> Exportera all data
                </button>
              </div>

              <div className="card" style={{ borderColor: 'rgba(248,113,113,0.15)' }}>
                <SectionHeader icon={Shield} title="Konto" subtitle="Hantera din inloggning" />
                <SettingRow label="Inloggad som" sub={user?.email}>
                  <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '6px', background: 'rgba(52,211,153,0.1)', color: 'var(--green)', border: '1px solid rgba(52,211,153,0.2)' }}>Aktiv</span>
                </SettingRow>
                <div style={{ marginTop: '16px' }}>
                  <button onClick={async () => { await signOut(); window.location.href = '/login' }} className="btn btn-danger" style={{ fontSize: '13px' }}>
                    Logga ut
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        </div>
        </div>
      </div>
    </div>
  )
}
