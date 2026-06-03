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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>

        {/* Logo */}
        <div style={{ marginBottom: '48px', textAlign: 'center' }}>
          <div className="brand-kicker" style={{ justifyContent: 'center', marginBottom: '10px' }}>MAXXIT</div>
          <div style={{ fontSize: '36px', fontWeight: '800', letterSpacing: '-1.4px', marginBottom: '8px' }}>
            Sigge
            <span style={{
              background: 'linear-gradient(135deg, #4f8ef7, #a78bfa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>OS</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', letterSpacing: '0.02em' }}>
            MaxxIt · personlig prestation, data och riktning
          </div>
        </div>

        {/* Glass card */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.07) inset',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

            {error && (
              <div style={{
                color: '#f87171', fontSize: '13px',
                padding: '9px 12px',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.15)',
                borderRadius: '8px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '4px', padding: '11px', fontSize: '14px' }}
            >
              {loading ? 'Startar systemet…' : 'Logga in'}
            </button>
          </form>
        </div>

        <div style={{ marginTop: '28px', color: 'rgba(255,255,255,0.2)', fontSize: '11px', textAlign: 'center', letterSpacing: '0.04em' }}>
          MAXXIT · SIGGEOS · PRIVAT INSTRUMENTPANEL
        </div>
      </div>
    </div>
  )
}
