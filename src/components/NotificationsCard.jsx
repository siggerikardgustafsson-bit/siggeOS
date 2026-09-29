import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import SectionHeader from './ui/SectionHeader'
import { pushSupport, currentSubscription, enablePush, disablePush, sendTestPush } from '../lib/push'

// Settings → Notiser. Device-level on/off (push subscription) + what to send
// (user_settings.notif_journal / notif_training, saved immediately). The
// push-notify edge function only sends a reminder when something is missing.

function Switch({ value, onChange, disabled }) {
  return (
    <button type="button" onClick={() => !disabled && onChange(!value)} disabled={disabled} aria-pressed={value}
      style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
        background: value ? 'var(--accent)' : 'rgba(148,163,184,0.25)', boxShadow: value ? 'none' : 'inset 0 0 0 1px var(--border)', position: 'relative', transition: 'background .15s', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'left .15s' }} />
    </button>
  )
}

function Row({ title, sub, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13.5px', color: 'var(--text)', fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.45 }}>{sub}</div>
      </div>
      {children}
    </div>
  )
}

export default function NotificationsCard({ userId }) {
  const { toast } = useToast()
  const [support] = useState(() => pushSupport())
  const [subscribed, setSubscribed] = useState(false)
  const [prefs, setPrefs] = useState({ notif_journal: false, notif_training: false })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!userId) return
    currentSubscription().then((s) => setSubscribed(!!s)).catch(() => {})
    supabase.from('user_settings').select('notif_journal,notif_training').eq('user_id', userId).maybeSingle()
      .then(({ data }) => data && setPrefs({ notif_journal: !!data.notif_journal, notif_training: !!data.notif_training }))
  }, [userId])

  async function setPref(key, value) {
    setPrefs((p) => ({ ...p, [key]: value }))
    const { error } = await supabase.from('user_settings').upsert({ user_id: userId, [key]: value }, { onConflict: 'user_id' })
    if (error) { toast({ message: 'Kunde inte spara.', type: 'error' }); setPrefs((p) => ({ ...p, [key]: !value })) }
  }

  async function toggleDevice(on) {
    setBusy(true)
    try {
      if (on) {
        await enablePush(userId)
        setSubscribed(true)
        // First enable: turn both kinds on unless the user already chose.
        if (!prefs.notif_journal && !prefs.notif_training) { await setPref('notif_journal', true); await setPref('notif_training', true) }
        toast({ message: 'Notiser aktiverade på den här enheten.', type: 'success' })
      } else {
        await disablePush(userId)
        setSubscribed(false)
      }
    } catch (e) {
      toast({ message: e?.message || 'Kunde inte aktivera notiser.', type: 'error' })
    }
    setBusy(false)
  }

  async function test() {
    try {
      const n = await sendTestPush()
      toast({ message: n ? `Testnotis skickad till ${n} enhet${n > 1 ? 'er' : ''}.` : 'Ingen enhet tog emot – aktivera notiser först.', type: n ? 'success' : 'error' })
    } catch { toast({ message: 'Testnotisen misslyckades.', type: 'error' }) }
  }

  return (
    <div className="card">
      <SectionHeader icon={Bell} title="Påminnelser" subtitle="Bara när något faktiskt saknas – högst en av varje sort per dag" />

      {!support.ok ? (
        <div style={{ fontSize: '12.5px', color: 'var(--muted2)', lineHeight: 1.55, padding: '10px 12px', borderRadius: '8px', background: 'var(--surface2)' }}>
          {support.reason === 'ios-not-installed'
            ? <>På iPhone fungerar notiser bara när MaxxIt är tillagd på hemskärmen: tryck <strong>Dela → Lägg till på hemskärmen</strong>, öppna appen därifrån och kom tillbaka hit.</>
            : 'Den här webbläsaren stöder inte push-notiser.'}
        </div>
      ) : (
        <Row title="Notiser på den här enheten" sub={subscribed ? 'Aktiva. Varje telefon/dator aktiveras för sig.' : (support.permission === 'denied' ? 'Blockerade i inställningarna för webbläsaren/telefonen – tillåt dem där först.' : 'Av.')}>
          <Switch value={subscribed} onChange={toggleDevice} disabled={busy || support.permission === 'denied'} />
        </Row>
      )}

      <Row title="Loggpåminnelser" sub="09:00 om nattens sömn inte är loggad · 21:00 om dagens journal saknas.">
        <Switch value={prefs.notif_journal} onChange={(v) => setPref('notif_journal', v)} />
      </Row>
      <Row title="Jarvis-påminnelser" sub="Kvällen före en tenta (18:00) · halvvägs och sista dagen i ett experiment (12:00) · när veckorapporten är klar (sön 20:00).">
        <Switch value={prefs.notif_training} onChange={(v) => setPref('notif_training', v)} />
      </Row>

      {subscribed && (
        <div style={{ marginTop: '12px' }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={test}>Skicka testnotis</button>
        </div>
      )}
    </div>
  )
}
