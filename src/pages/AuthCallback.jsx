import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Kopplar Google Kalender...')

  useEffect(() => {
    handleCallback()
  }, [])

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    if (error) {
      setStatus('Något gick fel: ' + error)
      setTimeout(() => navigate('/jobb'), 3000)
      return
    }

    if (code && state === 'google_calendar') {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

        const resp = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'exchange_code',
            code,
            redirect_uri: `${window.location.origin}/auth/callback`,
          }),
        })

        const data = await resp.json()
        if (data.success) {
          setStatus('✓ Google Kalender kopplad! Synkar pass...')
          // Trigger first sync
          await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ action: 'sync' }),
          })
          setStatus('✓ Klar! Dina pass har importerats.')
        } else {
          setStatus('Kunde inte koppla: ' + (data.error || 'Okänt fel'))
        }
      } catch (err) {
        setStatus('Fel: ' + err.message)
      }
      setTimeout(() => navigate('/jobb'), 2000)
    } else {
      navigate('/')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', flexDirection: 'column', gap: '16px',
    }}>
      <div style={{ fontSize: '18px', color: 'var(--text)' }}>{status}</div>
      <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Omdirigerar till Jobb...</div>
    </div>
  )
}
