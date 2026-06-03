import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

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
          <div className="maxxit-card-kicker">PERSONAL OS</div>
          <h1>Logga in</h1>
          <p>Fortsätt där du slutade.</p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '18px' }}>
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              className="input"
              type="password"
              placeholder="Lösenord"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />

            {error && <div className="maxxit-error">{error}</div>}

            <button type="submit" className="btn btn-primary maxxit-primary" disabled={loading}>
              {loading ? 'Loggar in…' : 'Öppna MaxxIt'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
