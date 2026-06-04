import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import QuickLog from './QuickLog'
import Onboarding from './Onboarding'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

function routeClass(pathname) {
  if (pathname === '/') return 'route-dashboard'
  const segment = pathname.split('/').filter(Boolean)[0] || 'dashboard'
  return `route-${segment}`
}

export default function AppLayout() {
  const location = useLocation()
  const { user } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('user_settings')
      .select('onboarding_done')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (!data || !data.onboarding_done) setShowOnboarding(true)
      })
  }, [user])

  return (
    <div className={`maxxit-app-shell ${routeClass(location.pathname)}`}>
      <div className="hidden-mobile app-sidebar-floating">
        <div className="app-sidebar-frame">
          <Sidebar />
        </div>
      </div>

      <main className="sigge-main-scroll">
        <Outlet />
      </main>

      <div className="show-mobile">
        <BottomNav />
      </div>

      <QuickLog />

      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
    </div>
  )
}
