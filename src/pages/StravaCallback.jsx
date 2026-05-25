import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function StravaCallback() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('Kopplar Strava...')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const error = params.get('error')

    if (error || !code) {
      setStatus('Något gick fel. Försöker igen...')
      setTimeout(() => navigate('/traning'), 2000)
      return
    }

    async function exchange() {
      try {
        const session = (await supabase.auth.getSession()).data.session
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/strava-sync?action=exchange`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ code }),
        })
        const data = await res.json()
        if (data.ok) {
          setStatus(`✓ Strava kopplat! Välkommen ${data.athlete?.firstname || ''}`)
        } else {
          setStatus('Något gick fel: ' + (data.error || 'okänt'))
        }
      } catch (e) {
        setStatus('Fel: ' + e.message)
      }
      setTimeout(() => navigate('/traning'), 2000)
    }

    exchange()
  }, [])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '32px' }}>🟠</div>
      <div style={{ fontSize: '16px', color: 'var(--text)' }}>{status}</div>
    </div>
  )
}
