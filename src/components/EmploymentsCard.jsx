import { useState } from 'react'
import { Briefcase, Plus, Trash2, Save, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import { priceShift } from '../lib/pay'

// Jobb → Tjänster: each job's own pay rules (employments, post_deploy_28).
// Saving re-prices every shift of the job (estimated_pay is a cache for
// Export; everything else prices live through pay.js).

const DAY_LABELS = [['Mån', 1], ['Tis', 2], ['Ons', 3], ['Tor', 4], ['Fre', 5], ['Lör', 6], ['Sön', 0]]
const EMPTY = {
  name: '', employer: '', kind: 'hourly', hourly_rate: '', monthly_salary: '', ob_rules: [], ob_mode: 'sum',
  jour_rate: '', jour_rules: [], jour_from: '22:00', jour_to: '06:00', jour_ob: false, holiday_pay_pct: 0, tax_rate: 0.3,
  match_keywords: [], is_default: false, active: true, notes: '',
}
const numOrNull = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v))

function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <div className="label" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.35 }}>{hint}</div>}
    </label>
  )
}

function ObRuleRow({ rule, onChange, onRemove }) {
  const days = rule.days || []
  const toggleDay = (d) => onChange({ ...rule, days: days.includes(d) ? days.filter(x => x !== d) : [...days, d] })
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* OB and jour rules share this row; "Ersätter andra OB" only means something for OB. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 70px 70px auto', gap: 6, alignItems: 'center' }}>
        <input className="input" placeholder="Namn, t.ex. OB natt" value={rule.label || ''} onChange={e => onChange({ ...rule, label: e.target.value })} />
        <input className="input mono" type="number" step="0.01" placeholder="kr/h" value={rule.kr ?? ''} onChange={e => onChange({ ...rule, kr: numOrNull(e.target.value) })} />
        <input className="input mono" placeholder="18:00" value={rule.from || ''} onChange={e => onChange({ ...rule, from: e.target.value })} />
        <input className="input mono" placeholder="22:00" value={rule.to || ''} onChange={e => onChange({ ...rule, to: e.target.value })} />
        <button type="button" onClick={onRemove} className="btn btn-ghost" style={{ padding: '6px 8px' }} aria-label="Ta bort regel"><Trash2 size={13} /></button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        {!rule.holiday && DAY_LABELS.map(([l, d]) => (
          <button key={d} type="button" onClick={() => toggleDay(d)} style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 12, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            border: '1px solid ' + (days.includes(d) ? 'var(--accent)' : 'var(--border)'),
            background: days.includes(d) ? 'rgba(79,142,247,0.14)' : 'transparent', color: days.includes(d) ? 'var(--accent)' : 'var(--muted)',
          }}>{l}</button>
        ))}
        <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <input type="checkbox" checked={!!rule.holiday} onChange={e => onChange({ ...rule, holiday: e.target.checked })} /> Storhelg
        </label>
        <label style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }} title="Om regeln gäller används bara den (inga andra OB-tillägg samtidigt)">
          <input type="checkbox" checked={!!rule.exclusive} onChange={e => onChange({ ...rule, exclusive: e.target.checked })} /> Ersätter andra OB
        </label>
      </div>
    </div>
  )
}

function EmploymentForm({ initial, onSave, onCancel, onDelete, saving }) {
  const [f, setF] = useState(() => ({ ...EMPTY, ...initial, match_keywords: initial?.match_keywords || [], jour_rules: initial?.jour_rules || [] }))
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const setRule = (i, r) => set('ob_rules', f.ob_rules.map((x, j) => (j === i ? r : x)))
  // Live example: a weekday night 22–07 on this model, so edits are tangible.
  const exNight = priceShift({ start_time: '2026-09-29T20:00:00Z', end_time: '2026-09-30T05:00:00Z', shift_type: 'vaken' }, { ...f, hourly_rate: numOrNull(f.hourly_rate), jour_rate: numOrNull(f.jour_rate) })
  const exSov = priceShift({ start_time: '2026-09-29T20:00:00Z', end_time: '2026-09-30T05:00:00Z', shift_type: 'sov' }, { ...f, hourly_rate: numOrNull(f.hourly_rate), jour_rate: numOrNull(f.jour_rate) })
  const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
      <div style={grid2}>
        <Field label="Tjänst"><input className="input" placeholder="Personlig assistent" value={f.name} onChange={e => set('name', e.target.value)} /></Field>
        <Field label="Arbetsgivare"><input className="input" placeholder="Humana" value={f.employer || ''} onChange={e => set('employer', e.target.value)} /></Field>
        <Field label="Lönetyp">
          <select className="input" value={f.kind} onChange={e => set('kind', e.target.value)}>
            <option value="hourly">Timlön</option>
            <option value="monthly">Månadslön</option>
          </select>
        </Field>
        {f.kind === 'hourly'
          ? <Field label="Timlön (kr/h)"><input className="input mono" type="number" step="0.01" value={f.hourly_rate ?? ''} onChange={e => set('hourly_rate', e.target.value)} /></Field>
          : <Field label="Månadslön brutto (kr)"><input className="input mono" type="number" value={f.monthly_salary ?? ''} onChange={e => set('monthly_salary', e.target.value)} /></Field>}
      </div>

      {f.kind === 'hourly' && (<>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>OB-tillägg</div>
            <select className="input" style={{ width: 'auto', fontSize: 12 }} value={f.ob_mode} onChange={e => set('ob_mode', e.target.value)}>
              <option value="sum">Tillägg läggs ihop</option>
              <option value="highest">Bara det högsta gäller</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {f.ob_rules.map((r, i) => <ObRuleRow key={i} rule={r} onChange={r2 => setRule(i, r2)} onRemove={() => set('ob_rules', f.ob_rules.filter((_, j) => j !== i))} />)}
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
              onClick={() => set('ob_rules', [...f.ob_rules, { label: '', kr: null, days: [1, 2, 3, 4, 5], from: '18:00', to: '22:00' }])}>
              <Plus size={13} /> Lägg till OB-regel
            </button>
          </div>
        </div>

        <div style={grid2}>
          <Field label="Jour (kr/h, sovpass)" hint="Ersätter timlönen under jourtiden på sovpass"><input className="input mono" type="number" step="0.01" value={f.jour_rate ?? ''} onChange={e => set('jour_rate', e.target.value)} /></Field>
          <Field label="Jour från"><input className="input mono" value={f.jour_from || ''} onChange={e => set('jour_from', e.target.value)} /></Field>
          <Field label="Jour till"><input className="input mono" value={f.jour_to || ''} onChange={e => set('jour_to', e.target.value)} /></Field>
          <Field label="OB under jour">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, paddingTop: 8 }}>
              <input type="checkbox" checked={!!f.jour_ob} onChange={e => set('jour_ob', e.target.checked)} /> Ja, OB läggs på
            </label>
          </Field>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>Avvikande jourtaxa</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>T.ex. söndag eller storhelg. Högsta matchande taxa gäller, annars jourtaxan ovan. Tider över midnatt räknas till dagen de börjar.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {f.jour_rules.map((r, i) => <ObRuleRow key={i} rule={r} onChange={r2 => set('jour_rules', f.jour_rules.map((x, j) => (j === i ? r2 : x)))} onRemove={() => set('jour_rules', f.jour_rules.filter((_, j) => j !== i))} />)}
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}
              onClick={() => set('jour_rules', [...f.jour_rules, { label: '', kr: null, days: [0], from: '00:00', to: '24:00' }])}>
              <Plus size={13} /> Lägg till jourtaxa
            </button>
          </div>
        </div>
      </>)}

      <div style={grid2}>
        <Field label="Semesterersättning (%)" hint="Vanligt för timanställda: 12–13 %"><input className="input mono" type="number" step="0.1" value={f.holiday_pay_pct ?? 0} onChange={e => set('holiday_pay_pct', e.target.value)} /></Field>
        <Field label="Skatt (%)" hint="Se din lönespec – skatt / bruttolön"><input className="input mono" type="number" step="0.1" value={f.tax_rate != null ? Math.round(Number(f.tax_rate) * 1000) / 10 : ''} onChange={e => set('tax_rate', numOrNull(e.target.value) == null ? null : Number(e.target.value) / 100)} /></Field>
        <Field label="Kalenderord" hint="Pass i Google Kalender vars titel innehåller något av orden"><input className="input" placeholder="assistanstid, hos hw" value={(f.match_keywords || []).join(', ')} onChange={e => set('match_keywords', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} /></Field>
      </div>
      <Field label="Anteckningar"><textarea className="input" rows={2} style={{ resize: 'vertical' }} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
        <input type="checkbox" checked={!!f.is_default} onChange={e => set('is_default', e.target.checked)} /> Standardtjänst (nya pass kopplas hit)
      </label>

      {f.kind === 'hourly' && (exNight || exSov) && (
        <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 10px', background: 'rgba(245,158,11,0.07)', borderRadius: 6, lineHeight: 1.5 }}>
          Exempel, vardagsnatt 22–07: vakenpass <b className="mono" style={{ color: 'var(--text)' }}>{exNight?.gross?.toLocaleString('sv-SE') ?? '—'} kr</b>
          {exSov && <> · sovpass <b className="mono" style={{ color: 'var(--text)' }}>{exSov.gross.toLocaleString('sv-SE')} kr</b></>} brutto
          {exNight && <> · netto ~{exNight.net.toLocaleString('sv-SE')} kr</>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={saving || !f.name.trim()} onClick={() => onSave(f)}><Save size={13} /> {saving ? 'Sparar…' : 'Spara'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Avbryt</button>
        {onDelete && <button type="button" className="btn btn-ghost" style={{ marginLeft: 'auto', color: '#ef4444' }} onClick={onDelete}><Trash2 size={13} /> Ta bort</button>}
      </div>
    </div>
  )
}

export default function EmploymentsCard({ userId, employments, onChanged }) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null) // employment id | 'new' | null
  const [saving, setSaving] = useState(false)

  async function save(f) {
    setSaving(true)
    const row = {
      name: f.name.trim(), employer: f.employer?.trim() || null, kind: f.kind,
      hourly_rate: numOrNull(f.hourly_rate), monthly_salary: numOrNull(f.monthly_salary),
      ob_rules: (f.ob_rules || []).filter(r => r.label || r.kr).map(r => ({ ...r, kr: numOrNull(r.kr) })),
      ob_mode: f.ob_mode, jour_rate: numOrNull(f.jour_rate),
      jour_rules: (f.jour_rules || []).filter(r => r.label || r.kr).map(({ exclusive, ...r }) => ({ ...r, kr: numOrNull(r.kr) })), jour_from: f.jour_from || null, jour_to: f.jour_to || null,
      jour_ob: !!f.jour_ob, holiday_pay_pct: numOrNull(f.holiday_pay_pct) ?? 0, tax_rate: f.tax_rate ?? 0.3,
      match_keywords: f.match_keywords || [], is_default: !!f.is_default, active: f.active !== false,
      notes: f.notes || null, updated_at: new Date().toISOString(),
    }
    const isNew = editing === 'new'
    const res = isNew
      ? await supabase.from('employments').insert({ ...row, user_id: userId }).select().single()
      : await supabase.from('employments').update(row).eq('id', editing).eq('user_id', userId).select().single()
    if (res.error) { toast({ message: 'Kunde inte spara: ' + res.error.message, type: 'error' }); setSaving(false); return }
    const saved = res.data
    // Only one default job.
    if (saved.is_default) await supabase.from('employments').update({ is_default: false }).eq('user_id', userId).neq('id', saved.id)
    // Re-price this job's shifts (cache for Export/Jarvis history).
    const { data: shifts } = await supabase.from('pa_shifts').select('id,start_time,end_time,shift_type').eq('user_id', userId).eq('employment_id', saved.id)
    await Promise.all((shifts || []).map(s => supabase.from('pa_shifts').update({ estimated_pay: priceShift(s, saved)?.gross ?? null }).eq('id', s.id).eq('user_id', userId)))
    toast({ message: `Sparat. ${shifts?.length || 0} pass omräknade.`, type: 'success' })
    setSaving(false); setEditing(null); onChanged?.()
  }

  async function remove(id) {
    if (!window.confirm('Ta bort tjänsten? Passen finns kvar men kopplas till standardtjänsten.')) return
    const { error } = await supabase.from('employments').delete().eq('id', id).eq('user_id', userId)
    if (error) { toast({ message: error.message, type: 'error' }); return }
    setEditing(null); onChanged?.()
  }

  const summary = (e) => e.kind === 'monthly'
    ? `${Number(e.monthly_salary || 0).toLocaleString('sv-SE')} kr/mån`
    : `${e.hourly_rate ?? '?'} kr/h · ${(e.ob_rules || []).length} OB-regler${e.jour_rate ? ` · jour ${e.jour_rate}` : ''}${(e.jour_rules || []).length ? ` (+${e.jour_rules.length} taxor)` : ''}${Number(e.holiday_pay_pct) ? ` · sem ${e.holiday_pay_pct}%` : ''} · skatt ${Math.round((e.tax_rate ?? 0.3) * 100)}%`

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}><Briefcase size={14} /> Tjänster &amp; lönemodell</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {employments.length ? employments.map(e => e.name).join(' · ') : 'Ingen tjänst – lägg till för att räkna lön'}
          </div>
        </div>
        {open ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {employments.map(e => (
            <div key={e.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
              {editing === e.id
                ? <EmploymentForm initial={e} saving={saving} onSave={save} onCancel={() => setEditing(null)} onDelete={() => remove(e.id)} />
                : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}{e.employer ? ` · ${e.employer}` : ''}{e.is_default && <span style={{ fontSize: 10.5, color: 'var(--accent)', marginLeft: 6 }}>standard</span>}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{summary(e)}</div>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => setEditing(e.id)}>Redigera</button>
                  </div>
                )}
            </div>
          ))}
          {editing === 'new'
            ? <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}><EmploymentForm initial={{ is_default: !employments.length }} saving={saving} onSave={save} onCancel={() => setEditing(null)} /></div>
            : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: employments.length ? '1px solid var(--border)' : 'none', paddingTop: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing('new')}><Plus size={13} /> Ny tjänst</button>
                <button type="button" className="btn btn-ghost" onClick={() => navigate('/jarvis', { state: { prefill: 'Här är mitt avtal/min lönespec – läs ut lönemodellen och uppdatera min tjänst.' } })}>
                  <Sparkles size={13} /> Låt Jarvis läsa avtal/lönespec
                </button>
              </div>
            )}
        </div>
      )}
    </div>
  )
}
