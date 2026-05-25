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
      background: 'var(--bg)',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        {/* Logo */}
        <div style={{ marginBottom: '40px', textAlign: 'center' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: '600',
            letterSpacing: '-0.5px',
            color: 'var(--text)',
          }}>
            Sigge<span style={{ color: 'var(--blue)' }}>OS</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '14px', marginTop: '6px' }}>
            Ditt personliga livs-OS
          </div>
        </div>

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
            <div style={{ color: 'var(--red)', fontSize: '13px', padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '4px', padding: '12px' }}
          >
            {loading ? 'Loggar in...' : 'Logga in'}
          </button>
        </form>

        <div style={{ marginTop: '32px', color: 'var(--muted)', fontSize: '12px', textAlign: 'center' }}>
          Sigge OS · Personligt & privat
        </div>
      </div>
    </div>
  )
}
