import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Check, ChevronRight, User, Target, Brain, Zap, LayoutDashboard, MessageSquare, TrendingUp, Plus, Settings, Activity, Ruler } from 'lucide-react'
import { SEX_OPTIONS, LIFE_STAGES, FOCUS_AREAS } from '../lib/personalization'

const STEPS = [
  { id: 'welcome',     Icon: LayoutDashboard, title: 'Välkommen till ditt OS' },
  { id: 'profile',     Icon: User,            title: 'Vem är du?' },
  { id: 'personalize', Icon: Ruler,           title: 'Anpassa dina tiers' },
  { id: 'goals',       Icon: Target,          title: 'Vad siktar du på?' },
  { id: 'jarvis',      Icon: Brain,           title: 'Konfigurera Jarvis' },
  { id: 'done',        Icon: Zap,             title: 'Allt klart!' },
]

const ACCENT = 'var(--accent)'

const numOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const strOrNull = (v) => (v && String(v).trim() ? String(v).trim() : null)

function OBSelect({ label, value, onChange, options, hint, placeholder = '— Välj —' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</label>
      <select className="input" value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {hint && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{hint}</div>}
    </div>
  )
}

function StepDot({ active, done, index }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      border: `2px solid ${done ? ACCENT : active ? ACCENT : 'var(--border)'}`,
      background: done ? ACCENT : active ? 'var(--accent-soft)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, transition: 'all 0.2s',
    }}>
      {done
        ? <Check size={13} color="white" />
        : <span style={{ fontSize: '11px', fontWeight: 700, color: active ? ACCENT : 'var(--muted)' }}>{index + 1}</span>
      }
    </div>
  )
}

function Field({ label, placeholder, value, onChange, multiline, type = 'text', hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</label>
      {multiline
        ? <textarea className="input" rows={3} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} style={{ resize: 'none', lineHeight: 1.6 }} />
        : <input className="input" type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
      }
      {hint && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>{hint}</div>}
    </div>
  )
}

export default function Onboarding({ onComplete }) {
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Profile — identity
  const [displayName, setDisplayName] = useState('')
  const [aboutMe, setAboutMe] = useState('')
  const [sex, setSex] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [country, setCountry] = useState('')

  // Personalize — body + life + focus (feeds Tier Engine v2 / Maxx Score v2)
  const [heightCm, setHeightCm] = useState('')
  const [weightKg, setWeightKg] = useState('')
  const [targetWeightKg, setTargetWeightKg] = useState('')
  const [lifeStage, setLifeStage] = useState('')
  const [occupation, setOccupation] = useState('')
  const [primaryFocus, setPrimaryFocus] = useState('')
  const [secondaryFocus, setSecondaryFocus] = useState('')

  // Goals
  const [oneYear, setOneYear] = useState('')
  const [threeYear, setThreeYear] = useState('')
  const [incomeGoal, setIncomeGoal] = useState('')
  const [weightGoal, setWeightGoal] = useState('')

  // Jarvis
  const [jarvisStyle, setJarvisStyle] = useState(70)
  const [jarvisPersonality, setJarvisPersonality] = useState('')

  const isLast = step === STEPS.length - 1

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }

  function canProceed() {
    if (step === 1) return displayName.trim().length > 0
    return true
  }

  async function finish() {
    setSaving(true)
    await supabase.from('user_settings').upsert({
      user_id: user.id,
      display_name: displayName.trim(),
      about_me: aboutMe.trim(),
      goals: {
        one_year: oneYear,
        three_year: threeYear,
        monthly_income_goal: incomeGoal,
        body_weight_goal: weightGoal,
        csn_fribelopp: 114500,
      },
      jarvis_style: jarvisStyle,
      jarvis_personality: jarvisPersonality,
      onboarding_done: true,
    }, { onConflict: 'user_id' })

    // Phase 8 — persist the personalization profile so Tier Engine v2 / Maxx
    // Score v2 activate immediately. Wrapped + non-blocking: if the Phase-5
    // `profiles` migration isn't applied yet, onboarding still completes.
    try {
      const profilePayload = {
        id: user.id,
        display_name: strOrNull(displayName),
        sex: strOrNull(sex),
        birth_date: birthDate || null,
        country: strOrNull(country),
        height_cm: numOrNull(heightCm),
        weight_kg: numOrNull(weightKg),
        target_weight_kg: numOrNull(targetWeightKg),
        life_stage: strOrNull(lifeStage),
        occupation: strOrNull(occupation),
        primary_focus: strOrNull(primaryFocus),
        secondary_focus: strOrNull(secondaryFocus),
      }
      const { error } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' })
      if (error) console.warn('[onboarding] profile save skipped:', error.message)
    } catch (e) {
      console.warn('[onboarding] profile save failed:', e?.message || e)
    }

    setSaving(false)
    onComplete()
  }

  const currentStep = STEPS[step]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(12px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        width: '100%', maxWidth: '480px',
        background: 'var(--surface)',
        border: '1px solid var(--glass-border)',
        borderRadius: '24px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
      }}>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'var(--surface2)' }}>
          <div style={{
            height: '100%',
            width: `${(step / (STEPS.length - 1)) * 100}%`,
            background: 'var(--accent)',
            transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '20px 24px 0', gap: '8px' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: i < STEPS.length - 1 ? 1 : 0 }}>
              <StepDot active={i === step} done={i < step} index={i} />
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 1, background: i < step ? 'var(--accent)' : 'var(--border)', transition: 'background 0.3s' }} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>

          {/* Step header */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ width: 44, height: 44, borderRadius: '12px', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
              {currentStep.Icon && <currentStep.Icon size={20} color="var(--accent)" />}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.3px' }}>{currentStep.title}</div>
          </div>

          {/* ── WELCOME ── */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '15px', color: 'var(--text)', lineHeight: 1.7 }}>
                Det här är ditt personliga livs-OS — ett ställe där du samlar data om allt som betyder något och låter AI hjälpa dig att bli den bästa versionen av dig själv.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { Icon: Activity,       text: 'Tracka hälsa, träning, plugg, ekonomi och mer' },
                  { Icon: MessageSquare,  text: 'Jarvis — din personliga AI-coach som känner dig på djupet' },
                  { Icon: TrendingUp,     text: 'Tier-system som visar din framgång över tid' },
                  { Icon: Plus,           text: 'Snabblogg vad som helst direkt från vilken sida som helst' },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ width:28, height:28, borderRadius:'8px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><f.Icon size={14} color='var(--accent)' /></div>
                    <span style={{ fontSize: '13px', color: 'var(--text)' }}>{f.text}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                Det tar ~2 minuter att ställa in. Du kan alltid ändra allt i Inställningar senare.
              </div>
            </div>
          )}

          {/* ── PROFILE ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Field
                label="Ditt namn"
                placeholder="t.ex. Sigge Gustafsson"
                value={displayName}
                onChange={setDisplayName}
                hint="Visas i dashboard-headern"
              />
              <Field
                label="Om dig"
                placeholder="Berätta om dig själv — vem du är, vad du jobbar med, vad som driver dig, var du är i livet just nu..."
                value={aboutMe}
                onChange={setAboutMe}
                multiline
                hint="Jarvis använder detta som sin primära kontext om dig"
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <OBSelect label="Kön" value={sex} onChange={setSex} options={SEX_OPTIONS} />
                <Field label="Födelsedatum" type="date" value={birthDate} onChange={setBirthDate} />
              </div>
              <Field label="Land" placeholder="t.ex. Sverige" value={country} onChange={setCountry} hint="Allt är valfritt — men hjälper oss anpassa dina tiers" />
            </div>
          )}

          {/* ── PERSONALIZE (body + life + focus → Tier Engine v2) ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.6 }}>
                Detta aktiverar personaliserade tiers — t.ex. styrka relativt din kroppsvikt och ekonomi-mål för din livsfas. Allt är valfritt.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <Field label="Längd (cm)" type="number" placeholder="180" value={heightCm} onChange={setHeightCm} />
                <Field label="Vikt (kg)" type="number" placeholder="80" value={weightKg} onChange={setWeightKg} />
                <Field label="Målvikt (kg)" type="number" placeholder="78" value={targetWeightKg} onChange={setTargetWeightKg} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <OBSelect label="Livsfas" value={lifeStage} onChange={setLifeStage} options={LIFE_STAGES} />
                <Field label="Sysselsättning" placeholder="t.ex. Student" value={occupation} onChange={setOccupation} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <OBSelect label="Primärt fokus" value={primaryFocus} onChange={setPrimaryFocus} options={FOCUS_AREAS} />
                <OBSelect label="Sekundärt fokus" value={secondaryFocus} onChange={setSecondaryFocus} options={FOCUS_AREAS} />
              </div>
            </div>
          )}

          {/* ── GOALS ── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Field
                label="1 års mål"
                placeholder="Vad vill du uppnå det närmaste året?"
                value={oneYear}
                onChange={setOneYear}
                multiline
              />
              <Field
                label="3 års mål"
                placeholder="Var befinner du dig om 3 år?"
                value={threeYear}
                onChange={setThreeYear}
                multiline
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field
                  label="Inkomstmål (kr/mån netto)"
                  placeholder="t.ex. 100000"
                  value={incomeGoal}
                  onChange={setIncomeGoal}
                  type="number"
                />
                <Field
                  label="Viktmål (kg)"
                  placeholder="t.ex. 75"
                  value={weightGoal}
                  onChange={setWeightGoal}
                  type="number"
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                Alla fält är valfria — du kan fylla i mer i Inställningar → Profil & mål.
              </div>
            </div>
          )}

          {/* ── JARVIS ── */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '10px' }}>Ärlighetsgrad</div>
                <input
                  type="range" min="0" max="100" value={jarvisStyle}
                  onChange={e => setJarvisStyle(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)', marginBottom: '6px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)' }}>
                  <span>Diplomatisk</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                    {jarvisStyle < 30 ? 'Diplomatisk' : jarvisStyle < 60 ? 'Balanserad' : jarvisStyle < 85 ? 'Direkt' : 'Brutalt ärlig'}
                  </span>
                  <span>Brutalt ärlig</span>
                </div>
              </div>
              <Field
                label="Extra instruktioner till Jarvis (valfritt)"
                placeholder="t.ex. Prata alltid som en bästa vän. Påminn mig om mina långsiktiga mål. Utmana mig när jag är lat."
                value={jarvisPersonality}
                onChange={setJarvisPersonality}
                multiline
              />
              <div style={{
                padding: '12px 14px', borderRadius: '12px',
                background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
              }}>
                <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600, marginBottom: '4px', display:'flex', alignItems:'center', gap:'5px' }}><Zap size={12} /> Tips</div>
                <div style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.6 }}>
                  Jarvis lär sig mer om dig efter varje konversation och lagrar insikter automatiskt. Ju mer du använder den, desto bättre blir den.
                </div>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 5 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontSize: '15px', color: 'var(--text)', lineHeight: 1.7 }}>
                Du är redo. Börja med att logga dagens hälsadata eller öppna Jarvis och berätta hur det går.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { Icon: Plus,          text: 'Tryck på + knappen för snabblogg' },
                  { Icon: MessageSquare, text: 'Fråga Jarvis vad som helst om ditt liv' },
                  { Icon: Settings,      text: 'Fyll i mer info i Inställningar → Profil' },
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surface2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ width:28, height:28, borderRadius:'8px', background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><t.Icon size={14} color='var(--accent)' /></div>
                    <span style={{ fontSize: '13px', color: 'var(--text)' }}>{t.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ marginTop: '28px', display: 'flex', gap: '10px' }}>
            {step > 0 && step < STEPS.length - 1 && (
              <button onClick={() => setStep(s => s - 1)} className="btn btn-ghost" style={{ fontSize: '13px' }}>
                Tillbaka
              </button>
            )}
            <button
              onClick={isLast ? finish : next}
              disabled={!canProceed() || saving}
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center', padding: '12px', fontSize: '14px', opacity: !canProceed() ? 0.5 : 1 }}
            >
              {saving ? 'Sparar...' : isLast ? 'Kom igång!' : (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                  {step === 0 ? 'Sätt igång' : 'Nästa'} <ChevronRight size={15} />
                </span>
              )}
            </button>
          </div>

          {/* Skip on non-required steps */}
          {step > 1 && step < STEPS.length - 1 && (
            <button onClick={next} style={{ width: '100%', marginTop: '8px', background: 'transparent', border: 'none', color: 'var(--muted)', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
              Hoppa över detta steg
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(30px) scale(0.97); opacity: 0; }
          to   { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
