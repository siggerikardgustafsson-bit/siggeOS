import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppLayout() {
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
        background: 'transparent',
        paddingBottom: '80px',
      }}>
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <div className="show-mobile">
        <BottomNav />
      </div>

      <style>{`
        .hidden-mobile { display: flex; }
        .show-mobile { display: none; }
        @media (max-width: 768px) {
          .hidden-mobile { display: none; }
          .show-mobile { display: block; }
        }
      `}</style>
    </div>
  )
}
