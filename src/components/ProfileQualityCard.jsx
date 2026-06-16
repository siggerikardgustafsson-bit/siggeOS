// ============================================================================
// ProfileQualityCard (Phase 8) — surfaces profile completeness, personalization
// status, missing critical fields and per-category tier confidence, with a CTA
// to the Profile page so users can unlock more accurate scores.
//
// Pure presentational: pass a `profile` row (the Phase-5 `profiles` shape) and,
// optionally, a `confidences` map ({ strength, conditioning, economy, health }).
// Degrades gracefully — a null/empty profile renders the "get started" state.
//
//   variant="full"    → Profile page card (all sections)
//   variant="compact" → Dashboard nudge (ring + status + top missing fields)
// ============================================================================
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, ChevronRight, Sparkles } from 'lucide-react'
import {
  getProfileCompleteness, getCategoryConfidences, CATEGORY_PROFILE_FIELDS,
} from '../lib/profileCompleteness'

const CAT_LABELS = {
  strength: 'Styrka', conditioning: 'Kondition', economy: 'Ekonomi', health: 'Hälsa',
}

function Ring({ pct, color, size = 54, stroke = 5 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100)
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ fontSize: size * 0.28, fontWeight: 800, fill: 'var(--text)' }}>{pct}%</text>
    </svg>
  )
}

function ConfidenceBar({ label, pct }) {
  const color = pct >= 85 ? '#10b981' : pct >= 70 ? '#06b6d4' : pct >= 55 ? '#f59e0b' : '#6b7280'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style={{ fontSize: '12px', color: 'var(--muted)', width: '74px', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color, width: '34px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

export default function ProfileQualityCard({ profile, confidences, variant = 'full', onEdit }) {
  const navigate = useNavigate()
  const comp = getProfileCompleteness(profile)
  const conf = confidences || getCategoryConfidences(profile)
  const status = comp.status
  const goEdit = () => (onEdit ? onEdit() : navigate('/profil'))

  if (variant === 'compact') {
    if (comp.pct >= 85) return null // fully personalized → no nudge needed
    return (
      <button
        onClick={goEdit}
        className="card"
        style={{
          display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left',
          cursor: 'pointer', width: '100%', border: '1px solid var(--border)',
        }}
      >
        <Ring pct={comp.pct} color={status.color} size={48} stroke={4} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
            <Sparkles size={13} color={status.color} /> Profilkvalitet · {status.label}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {comp.missingCritical.length
              ? `Lägg till ${comp.missingCritical.slice(0, 3).map((m) => m.label.toLowerCase()).join(', ')} för mer exakta tiers`
              : 'Komplettera profilen för full personalisering'}
          </div>
        </div>
        <ChevronRight size={16} color="var(--muted)" style={{ flexShrink: 0 }} />
      </button>
    )
  }

  // ── full ──
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
        <Ring pct={comp.pct} color={status.color} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontWeight: 700, fontSize: '15px' }}>
            <ShieldCheck size={15} color={status.color} /> Profilkvalitet
          </div>
          <div style={{ marginTop: '4px' }}>
            <span style={{
              display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px',
              color: status.color, background: status.color + '1f', border: `1px solid ${status.color}40`,
            }}>{status.label}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '6px' }}>
            Ju mer du fyller i, desto mer exakta blir dina tiers och din Maxx Score.
          </div>
        </div>
      </div>

      {comp.missingCritical.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Saknas — lås upp mer exakta poäng
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {comp.missingCritical.map((m) => (
              <span key={m.key} style={{
                fontSize: '12px', padding: '4px 10px', borderRadius: '999px',
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
              }}>{m.label}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '10px' }}>
          Tillförlitlighet per kategori
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
          {Object.keys(CATEGORY_PROFILE_FIELDS).map((cat) => (
            <ConfidenceBar key={cat} label={CAT_LABELS[cat]} pct={conf[cat] ?? 0} />
          ))}
        </div>
      </div>

      <button onClick={goEdit} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
        <Sparkles size={14} /> {comp.isComplete ? 'Granska profil' : 'Förbättra profil'}
      </button>
    </div>
  )
}
