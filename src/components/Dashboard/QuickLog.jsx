import React, { useState } from 'react'
import { supabase } from '../../supabase'
import { format } from 'date-fns'

const USER_ID = 'c051041c-83e4-4b3d-8e9f-e531e3dde025'

export default function QuickLog({ onSaved }) {
  const [tab, setTab] = useState('wellbeing')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Wellbeing state
  const [energy, setEnergy] = useState(7)
  const [stress, setStress] = useState(4)
  const [mood, setMood] = useState(7)
  const [steps, setSteps] = useState('')
  const [weight, setWeight] = useState('')
  const [sleepHours, setSleepHours] = useState('')

  // Skill state
  const [skill, setSkill] = useState('spanish')
  const [skillMinutes, setSkillMinutes] = useState('')

  async function saveWellbeing() {
    setSaving(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const payload = {
      user_id: USER_ID,
      date: today,
      energy_level: energy,
      stress_level: stress,
      mood: mood,
    }
    if (steps) payload.steps = parseInt(steps)
    if (weight) payload.weight_kg = parseFloat(weight)
    if (sleepHours) payload.sleep_hours = parseFloat(sleepHours)

    const { error } = await supabase
      .from('health_logs')
      .upsert(payload, { onConflict: 'user_id,date' })

    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000); onSaved?.() }
  }

  async function saveSkill() {
    if (!skillMinutes) return
    setSaving(true)
    const { error } = await supabase
      .from('skill_logs')
      .insert({
        user_id: USER_ID,
        date: format(new Date(), 'yyyy-MM-dd'),
        skill,
        minutes: parseInt(skillMinutes),
      })
    setSaving(false)
    if (!error) { setSkillMinutes(''); setSaved(true); setTimeout(() => setSaved(false), 2000); onSaved?.() }
  }

  const tabs = [
    { id: 'wellbeing', label: '🌡 Mående' },
    { id: 'body', label: '⚖️ Kropp' },
    { id: 'skill', label: '🎸 Färdighet' },
  ]

  const sliderStyle = (val, max, accentColor) => ({
    width: '100%',
    accentColor,
    cursor: 'pointer',
  })

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '14px',
      padding: '20px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        ⚡ Snabblogg
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 12px', fontSize: '12px', borderRadius: '8px',
            background: tab === t.id ? 'var(--accent)' : 'transparent',
            border: '1px solid ' + (tab === t.id ? 'var(--accent)' : 'var(--border)'),
            color: tab === t.id ? '#fff' : 'var(--muted)',
            cursor: 'pointer', fontWeight: tab === t.id ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Wellbeing tab */}
      {tab === 'wellbeing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { label: 'Energi', val: energy, set: setEnergy, color: '#f59e0b', emoji: '⚡' },
            { label: 'Stress (lägre = bättre)', val: stress, set: setStress, color: '#ef4444', emoji: '🧠' },
            { label: 'Humör', val: mood, set: setMood, color: '#10b981', emoji: '😊' },
          ].map(s => (
            <div key={s.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{s.emoji} {s.label}</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: s.color }}>{s.val}/10</span>
              </div>
              <input type="range" min={1} max={10} value={s.val}
                onChange={e => s.set(Number(e.target.value))}
                style={sliderStyle(s.val, 10, s.color)} />
            </div>
          ))}
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>👣 Steg (valfritt)</div>
            <input
              type="number" placeholder="ex. 8500"
              value={steps} onChange={e => setSteps(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* Body tab */}
      {tab === 'body' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>⚖️ Vikt (kg)</div>
            <input
              type="number" step="0.1" placeholder="ex. 77.2"
              value={weight} onChange={e => setWeight(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>🛌 Sömn (timmar)</div>
            <input
              type="number" step="0.5" placeholder="ex. 7.5"
              value={sleepHours} onChange={e => setSleepHours(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* Skill tab */}
      {tab === 'skill' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>🎯 Färdighet</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'spanish', label: '🇪🇸 Spanska' },
                { id: 'serbian', label: '🇷🇸 Serbiska' },
                { id: 'guitar', label: '🎸 Gitarr' },
              ].map(s => (
                <button key={s.id} onClick={() => setSkill(s.id)} style={{
                  flex: 1, padding: '8px 4px', fontSize: '11px',
                  borderRadius: '8px',
                  background: skill === s.id ? '#8b5cf622' : 'transparent',
                  border: '1px solid ' + (skill === s.id ? '#8b5cf6' : 'var(--border)'),
                  color: skill === s.id ? '#8b5cf6' : 'var(--muted)',
                  cursor: 'pointer',
                }}>{s.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '6px' }}>⏱ Minuter idag</div>
            <input
              type="number" placeholder="ex. 30"
              value={skillMinutes} onChange={e => setSkillMinutes(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={tab === 'skill' ? saveSkill : saveWellbeing}
        disabled={saving}
        style={{
          width: '100%', marginTop: '18px',
          padding: '11px',
          background: saved ? '#10b98122' : 'var(--accent)',
          border: '1px solid ' + (saved ? '#10b981' : 'var(--accent)'),
          borderRadius: '10px',
          color: saved ? '#10b981' : '#fff',
          fontWeight: 600, fontSize: '14px',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1,
          transition: 'all 0.2s',
        }}
      >
        {saved ? '✓ Sparat!' : saving ? 'Sparar...' : 'Spara'}
      </button>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '14px',
  boxSizing: 'border-box',
  outline: 'none',
}
