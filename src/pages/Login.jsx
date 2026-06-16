import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Map Supabase's raw auth error strings to friendly Swedish copy. Falls back to
// the raw message so nothing is ever silently swallowed.
function friendlyError(raw) {
  const m = (raw || '').toLowerCase()
  if (m.includes('already registered') || m.includes('already exists') || m.includes('user already'))
    return 'Det finns redan ett konto med den här mailadressen. Logga in istället.'
  if (m.includes('invalid login') || m.includes('invalid credentials'))
    return 'Fel mail eller lösenord.'
  if (m.includes('password should be') || m.includes('at least 6'))
    return 'Lösenordet är för svagt — använd minst 6 tecken.'
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('valid email'))
    return 'Ogiltig mailadress.'
  if (m.includes('email not confirmed'))
    return 'Du måste bekräfta din mail först. Kolla din inkorg.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'För många försök. Vänta en stund och prova igen.'
  return raw || 'Något gick fel. Försök igen.'
}

// mode: 'signin' | 'signup' | 'forgot' | 'recovery'
export default function Login() {
  const { signIn, signUp, resetPassword, updatePassword, recovery, clearRecovery } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState(recovery ? 'recovery' : 'signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  // Keep the form in recovery mode if a reset link lands after first render.
  if (recovery && mode !== 'recovery') setMode('recovery')

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    try {
      if (mode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) setError(friendlyError(error.message))
        // success → AuthProvider session listener redirects via the router
      } else if (mode === 'signup') {
        const { error, needsEmailConfirmation } = await signUp(email, password, displayName)
        if (error) {
          setError(friendlyError(error.message))
        } else if (needsEmailConfirmation) {
          setNotice('Konto skapat! Kolla din mail och klicka på länken för att bekräfta, sen kan du logga in.')
          setMode('signin')
        }
        // if confirmation is off, a session is created and the router redirects
      } else if (mode === 'forgot') {
        const { error } = await resetPassword(email)
        if (error) setError(friendlyError(error.message))
        else setNotice('Om mailen finns hos oss har vi skickat en återställningslänk. Kolla din inkorg.')
      } else if (mode === 'recovery') {
        if (password.length < 6) {
          setError('Lösenordet är för svagt — använd minst 6 tecken.')
        } else {
          const { error } = await updatePassword(password)
          if (error) setError(friendlyError(error.message))
          else {
            clearRecovery()
            setNotice('Lösenordet är uppdaterat!')
            navigate('/', { replace: true })
          }
        }
      }
    } catch (err) {
      setError(friendlyError(err?.message))
    }
    setLoading(false)
  }

  const titles = {
    signin: { kicker: 'PERSONAL OS', h1: 'Logga in', sub: 'Fortsätt där du slutade.' },
    signup: { kicker: 'KOM IGÅNG', h1: 'Skapa konto', sub: 'Bygg ditt personliga livs-OS.' },
    forgot: { kicker: 'ÅTERSTÄLL', h1: 'Glömt lösenord', sub: 'Vi mailar dig en återställningslänk.' },
    recovery: { kicker: 'NYTT LÖSENORD', h1: 'Välj nytt lösenord', sub: 'Skriv in ditt nya lösenord nedan.' },
  }
  const t = titles[mode]
  const submitLabel = {
    signin: loading ? 'Loggar in…' : 'Öppna MaxxIt',
    signup: loading ? 'Skapar konto…' : 'Skapa konto',
    forgot: loading ? 'Skickar…' : 'Skicka länk',
    recovery: loading ? 'Sparar…' : 'Spara lösenord',
  }[mode]

  return (
    <div className="maxxit-login">
      <div className="maxxit-login-shell">
        <div className="maxxit-login-hero">
          <div className="maxxit-logo maxxit-logo-hero">
            <span>Maxx</span><strong>It</strong>
          </div>
          <div className="maxxit-login-tagline">
            Din personliga instrumentpanel för prestation, riktning och livsdata.
          </div>
          <div className="maxxit-command-row">
            <span>Logga</span>
            <span>Synka</span>
            <span>Analysera</span>
            <span>Rank up</span>
          </div>
        </div>

        <div className="maxxit-login-card">
          <div className="maxxit-card-kicker">{t.kicker}</div>
          <h1>{t.h1}</h1>
          <p>{t.sub}</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
            {mode === 'signup' && (
              <input
                className="input"
                type="text"
                placeholder="Ditt namn"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            )}

            {mode !== 'recovery' && (
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            )}

            {mode !== 'forgot' && (
              <input
                className="input"
                type="password"
                placeholder={mode === 'recovery' ? 'Nytt lösenord' : 'Lösenord'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={mode === 'signin' ? undefined : 6}
              />
            )}

            {error && <div className="maxxit-error">{error}</div>}
            {notice && (
              <div className="maxxit-error" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--text)' }}>
                {notice}
              </div>
            )}

            <button type="submit" className="btn btn-primary maxxit-primary" disabled={loading}>
              {submitLabel}
            </button>
          </form>

          {/* Mode switches */}
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--muted)' }}>
            {mode === 'signin' && (
              <>
                <button type="button" onClick={() => switchMode('signup')} className="maxxit-link-btn">
                  Inget konto? <strong>Skapa ett</strong>
                </button>
                <button type="button" onClick={() => switchMode('forgot')} className="maxxit-link-btn">
                  Glömt lösenord?
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button type="button" onClick={() => switchMode('signin')} className="maxxit-link-btn">
                Har du redan ett konto? <strong>Logga in</strong>
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => switchMode('signin')} className="maxxit-link-btn">
                ← Tillbaka till inloggning
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .maxxit-link-btn {
          background: none; border: none; padding: 0; text-align: left;
          color: var(--muted); font-size: 13px; cursor: pointer;
          font-family: Inter, sans-serif;
        }
        .maxxit-link-btn:hover { color: var(--text); }
        .maxxit-link-btn strong { color: var(--accent); font-weight: 600; }
      `}</style>
    </div>
  )
}
