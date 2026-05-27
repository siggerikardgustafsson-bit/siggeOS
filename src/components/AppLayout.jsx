import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import { useEffect } from 'react'
import { initBackground } from '../hooks/useBackground'

export default function AppLayout() {
  const location = useLocation()

  // Re-apply background on every navigation (in case DOM updated)
  useEffect(() => {
    initBackground()
  }, [location.pathname])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* Sidebar — desktop only */}
      <div className="hidden-mobile">
        <Sidebar />
      </div>

      {/* Main content */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'transparent',
        minHeight: 0,
      }}>
        <div className="page-content">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav — mobile only */}
      <div className="show-mobile">
        <BottomNav />
      </div>

      <style>{`
        .hidden-mobile { display: flex; }
        .show-mobile { display: none; }
        .page-content { width: 100%; }

        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block; }
          .page-content { padding-bottom: 80px; }
          * { max-width: 100vw; }
          [style*="gridTemplateColumns: 'repeat(6"] { grid-template-columns: repeat(2, 1fr) !important; }
          [style*="gridTemplateColumns: 'repeat(5"] { grid-template-columns: repeat(2, 1fr) !important; }
          [style*="gridTemplateColumns: 'repeat(4"] { grid-template-columns: repeat(2, 1fr) !important; }
          [style*="gridTemplateColumns: 'repeat(3"] { grid-template-columns: repeat(2, 1fr) !important; }
          [style*="gridTemplateColumns: '1fr 1fr'"] { grid-template-columns: 1fr !important; }
          [style*="gridTemplateColumns: '200px 1fr'"] { grid-template-columns: 1fr !important; }
          [style*="gridTemplateColumns: 'auto 1fr'"] { grid-template-columns: 1fr !important; }
          [style*="gridTemplateColumns: '1fr 300px'"] { grid-template-columns: 1fr !important; }
          [style*="gridTemplateColumns: 'minmax(0,1fr) 230px'"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
