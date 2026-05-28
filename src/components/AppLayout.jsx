import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import { useEffect } from 'react'
import { initBackground } from '../hooks/useBackground'

export default function AppLayout() {
  const location = useLocation()

  useEffect(() => {
    initBackground()
  }, [location.pathname])

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      padding: '10px',
      gap: '10px',
      boxSizing: 'border-box',
    }}>

      {/* Sidebar — floating widget */}
      <div className="hidden-mobile app-sidebar-floating" style={{ flexShrink: 0 }}>
        <div style={{
          height: '100%',
          borderRadius: '18px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}>
          <Sidebar floating />
        </div>
      </div>

      {/* Main content — this is the scroll container, needed for sticky to work */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        background: 'transparent',
        minHeight: 0,
        borderRadius: '18px',
        display: 'flex',
        flexDirection: 'column',
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

        /* page-wrap fills main and handles its own layout */
        .page-wrap {
          display: flex;
          flex-direction: column;
          min-height: 100%;
          gap: 0;
        }

        /* Floating sticky header */
        .page-header {
          position: sticky;
          top: 10px;
          z-index: 30;
          margin: 10px 10px 0;
          flex-shrink: 0;
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--surface);
          backdrop-filter: blur(32px);
          -webkit-backdrop-filter: blur(32px);
          border: 1px solid var(--glass-border);
          border-radius: 16px;
          box-shadow: var(--glass-shadow);
          overflow: hidden;
        }

        .page-header::before {
          content: '';
          position: absolute;
          top: 0; left: 12%; right: 12%; height: 1px;
          background: linear-gradient(90deg, transparent, var(--border2), transparent);
          pointer-events: none;
        }

        .page-header-title {
          font-size: 15px;
          font-weight: 500;
          color: var(--text);
          letter-spacing: -0.01em;
        }

        .page-header-sub {
          font-size: 11px;
          color: var(--muted);
          margin-top: 3px;
        }

        /* Scrollable content with iOS fade */
        .page-content-scroll {
          flex: 1;
          padding: 12px 10px 24px;
          -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 0px,
            rgba(0,0,0,0.7) 20px,
            black 40px
          );
          mask-image: linear-gradient(
            to bottom,
            transparent 0px,
            rgba(0,0,0,0.7) 20px,
            black 40px
          );
        }

        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block; }
          .page-content-scroll { padding-bottom: 80px; }
          * { max-width: 100vw; }
        }
      `}</style>
    </div>
  )
}
