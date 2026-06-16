import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { supabase } from '../lib/supabase'
import {
  User, Ruler, Briefcase, SlidersHorizontal, Target, Save, Loader, Check, Upload, Camera,
} from 'lucide-react'
import {
  getUserProfile, computeAge,
  SEX_OPTIONS, LIFE_STAGES, FOCUS_AREAS, UNIT_SYSTEMS, CURRENCIES, LANGUAGES,
} from '../lib/personalization'
import ProfileQualityCard from '../components/ProfileQualityCard'

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
      <div className="set-badge"><Icon size={15} color="var(--accent)" /></div>
      <div>
        <div style={{ fontWeight: '600', fontSize: '15px' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '1px' }}>{subtitle}</div>}
      </div>
    </div>
  )
}

const LABEL = { fontSize: '12px', color: 'var(--muted)', display: 'block', marginBottom: '6px', fontWeight: '500' }

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={LABEL}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>{hint}</div>}
    </div>
  )
}

function Select({ value, onChange, options, placeholder = '— Välj —' }) {
  return (
    <select className="input" value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  )
}

const EMPTY = {
  display_name: '', first_name: '', last_name: '', birth_date: '', sex: '', country: '', city: '',
  height_cm: '', weight_kg: '', target_weight_kg: '',
  life_stage: '', occupation: '', study_program: '', study_institution: '',
  currency: '', unit_system: '', locale: '', timezone: '',
  primary_focus: '', secondary_focus: '', avatar_url: '',
}

const numOrNull = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v))
const strOrNull = (v) => (v && String(v).trim() ? String(v).trim() : null)

export default function ProfilePage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!user) return
    let active = true
    ;(async () => {
      const p = await getUserProfile(user.id)
      if (!active) return
      if (p) {
        setForm({
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map(k => [k, p[k] ?? ''])),
        })
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [user])

  async function save() {
    setSaving(true)
    const payload = {
      id: user.id,
      display_name: strOrNull(form.display_name),
      first_name: strOrNull(form.first_name),
      last_name: strOrNull(form.last_name),
      birth_date: form.birth_date || null,
      sex: strOrNull(form.sex),
      country: strOrNull(form.country),
      city: strOrNull(form.city),
      height_cm: numOrNull(form.height_cm),
      weight_kg: numOrNull(form.weight_kg),
      target_weight_kg: numOrNull(form.target_weight_kg),
      life_stage: strOrNull(form.life_stage),
      occupation: strOrNull(form.occupation),
      study_program: strOrNull(form.study_program),
      study_institution: strOrNull(form.study_institution),
      currency: strOrNull(form.currency),
      unit_system: strOrNull(form.unit_system),
      locale: strOrNull(form.locale),
      timezone: strOrNull(form.timezone),
      primary_focus: strOrNull(form.primary_focus),
      secondary_focus: strOrNull(form.secondary_focus),
      avatar_url: strOrNull(form.avatar_url),
    }
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' })
    if (error) {
      console.error(error)
      setSaving(false)
      toast({ message: 'Kunde inte spara profilen — är migrationen körd?', type: 'error' })
      return
    }
    // Bridge: keep the legacy dashboard greeting (user_settings.display_name) in
    // sync until profile/settings identity is consolidated (future phase).
    if (payload.display_name) {
      await supabase.from('user_settings')
        .upsert({ user_id: user.id, display_name: payload.display_name }, { onConflict: 'user_id' })
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    toast({ message: 'Profil sparad', type: 'success' })
  }

  async function onAvatarFile(e) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const path = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, cacheControl: '3600' })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${data.publicUrl}?v=${Date.now()}`
      setForm(f => ({ ...f, avatar_url: url }))
      await supabase.from('profiles').upsert({ id: user.id, avatar_url: url }, { onConflict: 'id' })
      toast({ message: 'Profilbild uppdaterad', type: 'success' })
    } catch (err) {
      console.error(err)
      toast({ message: 'Kunde inte ladda upp bild (kräver avatars-bucket från migrationen)', type: 'error' })
    } finally {
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  const age = computeAge(form.birth_date)
  const initials = (form.display_name || form.first_name || user?.email || '?').trim().charAt(0).toUpperCase()

  if (loading) {
    return (
      <div className="page-wrap">
        <div className="page-header"><div><div className="page-header-title">Profil</div></div></div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--muted)' }}>
          <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Laddar profil…
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <div className="page-header-title">Profil</div>
          <div className="page-header-sub">Din identitet och dina preferenser — grunden för personalisering</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '720px' }}>

        {/* Avatar + name */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
              background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {form.avatar_url
                ? <img src={form.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent)' }}>{initials}</span>}
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploading} title="Byt bild" style={{
              position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%',
              border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)',
            }}>
              {uploading ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={12} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onAvatarFile} style={{ display: 'none' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>{form.display_name || 'Namnlös'}</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{user?.email}{age != null ? ` · ${age} år` : ''}</div>
            <button onClick={() => fileRef.current?.click()} className="btn btn-ghost" style={{ fontSize: '12px', marginTop: '8px' }}>
              <Upload size={12} /> Ladda upp profilbild
            </button>
          </div>
        </div>

        {/* Profile quality — live completeness + per-category confidence (Phase 8) */}
        <ProfileQualityCard profile={form} variant="full" onEdit={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />

        {/* Identity */}
        <div className="card">
          <SectionHeader icon={User} title="Identitet" subtitle="Vem du är" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="VISNINGSNAMN" hint="Visas i Dashboard-headern">
                <input className="input" type="text" placeholder="t.ex. Alex Andersson" value={form.display_name} onChange={e => set('display_name')(e.target.value)} />
              </Field>
            </div>
            <Field label="FÖRNAMN"><input className="input" value={form.first_name} onChange={e => set('first_name')(e.target.value)} /></Field>
            <Field label="EFTERNAMN"><input className="input" value={form.last_name} onChange={e => set('last_name')(e.target.value)} /></Field>
            <Field label="FÖDELSEDATUM" hint={age != null ? `Ålder: ${age} år` : null}>
              <input className="input" type="date" value={form.birth_date} onChange={e => set('birth_date')(e.target.value)} />
            </Field>
            <Field label="KÖN"><Select value={form.sex} onChange={set('sex')} options={SEX_OPTIONS} /></Field>
            <Field label="LAND"><input className="input" value={form.country} onChange={e => set('country')(e.target.value)} placeholder="t.ex. Sverige" /></Field>
            <Field label="STAD"><input className="input" value={form.city} onChange={e => set('city')(e.target.value)} placeholder="t.ex. Stockholm" /></Field>
          </div>
        </div>

        {/* Body */}
        <div className="card">
          <SectionHeader icon={Ruler} title="Kropp" subtitle="Används för framtida tier-beräkningar (ej aktiverat än)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Field label="LÄNGD (cm)"><input className="input" type="number" value={form.height_cm} onChange={e => set('height_cm')(e.target.value)} placeholder="180" /></Field>
            <Field label="VIKT (kg)"><input className="input" type="number" step="0.1" value={form.weight_kg} onChange={e => set('weight_kg')(e.target.value)} placeholder="80" /></Field>
            <Field label="MÅLVIKT (kg)"><input className="input" type="number" step="0.1" value={form.target_weight_kg} onChange={e => set('target_weight_kg')(e.target.value)} placeholder="78" /></Field>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>Daglig vikt loggas fortsatt under Hälsa — detta är en valfri profil-baslinje.</div>
        </div>

        {/* Life context */}
        <div className="card">
          <SectionHeader icon={Briefcase} title="Livssituation" subtitle="Din kontext just nu" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="LIVSFAS"><Select value={form.life_stage} onChange={set('life_stage')} options={LIFE_STAGES} /></Field>
            <Field label="SYSSELSÄTTNING"><input className="input" value={form.occupation} onChange={e => set('occupation')(e.target.value)} placeholder="t.ex. Läkarstudent" /></Field>
            <Field label="UTBILDNINGSPROGRAM"><input className="input" value={form.study_program} onChange={e => set('study_program')(e.target.value)} placeholder="t.ex. Läkarprogrammet" /></Field>
            <Field label="LÄROSÄTE"><input className="input" value={form.study_institution} onChange={e => set('study_institution')(e.target.value)} placeholder="t.ex. Karolinska Institutet" /></Field>
          </div>
        </div>

        {/* Preferences */}
        <div className="card">
          <SectionHeader icon={SlidersHorizontal} title="Preferenser" subtitle="Valuta, enheter och språk" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="VALUTA"><Select value={form.currency} onChange={set('currency')} options={CURRENCIES} placeholder="SEK" /></Field>
            <Field label="ENHETSSYSTEM"><Select value={form.unit_system} onChange={set('unit_system')} options={UNIT_SYSTEMS} placeholder="Metriskt" /></Field>
            <Field label="SPRÅK"><Select value={form.locale} onChange={set('locale')} options={LANGUAGES} placeholder="Svenska" /></Field>
            <Field label="TIDSZON" hint="t.ex. Europe/Stockholm"><input className="input" value={form.timezone} onChange={e => set('timezone')(e.target.value)} placeholder="Europe/Stockholm" /></Field>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>Tema och bakgrund ställs in under Inställningar → Utseende.</div>
        </div>

        {/* Goals / focus */}
        <div className="card">
          <SectionHeader icon={Target} title="Fokusområden" subtitle="Vad du prioriterar — driver framtida personalisering" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="PRIMÄRT FOKUS"><Select value={form.primary_focus} onChange={set('primary_focus')} options={FOCUS_AREAS} /></Field>
            <Field label="SEKUNDÄRT FOKUS"><Select value={form.secondary_focus} onChange={set('secondary_focus')} options={FOCUS_AREAS} /></Field>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px' }}>Detaljerade mål och Jarvis-kontext redigeras fortsatt under Inställningar → Profil & mål.</div>
        </div>

        <button onClick={save} className="btn btn-primary" disabled={saving} style={{ justifyContent: 'center', padding: '12px' }}>
          {saving ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Sparar…</> :
           saved ? <><Check size={14} /> Sparat!</> :
           <><Save size={14} /> Spara profil</>}
        </button>
      </div>
    </div>
  )
}
