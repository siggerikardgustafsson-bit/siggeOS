import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import QuickLog from './QuickLog'
import CommandPalette from './CommandPalette'
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
    supabase.from('user_settings').select('onboarding_done').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data || !data.onboarding_done) setShowOnboarding(true)
      })
  }, [user])

  return (
    <div className={`sigge-app-shell maxxit-app-shell ${routeClass(location.pathname)}`} style={{
      display: 'flex',
      height: '100dvh',
      overflow: 'clip',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      gap: '0',
      boxSizing: 'border-box',
    }}>

      {/* Sidebar — hover-expand glass rail */}
      <div className="hidden-mobile app-sidebar-floating" style={{
        flexShrink: 0,
        padding: '10px 0 10px 10px',
        boxSizing: 'border-box',
        height: '100vh',
        position: 'relative',
        zIndex: 40,
      }}>
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="sigge-main-scroll" style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'transparent',
        minHeight: 0,
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '10px',
        boxSizing: 'border-box',
      }}>
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <div className="show-mobile">
        <BottomNav />
      </div>

      {/* Global quick-log FAB — visible on all pages */}
      <QuickLog />

      {/* Global command palette — open with ⌘K / Ctrl+K */}
      <CommandPalette />

      {/* Onboarding — shown once for new users */}
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}
    </div>
  )
}
