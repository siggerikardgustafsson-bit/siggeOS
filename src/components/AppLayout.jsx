import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import QuickLog from './QuickLog'
import Onboarding from './Onboarding'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function AppLayout() {
  const location = useLocation()
  const { user } = useAuth()
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('user_settings').select('onboarding_done').eq('user_id', user.id).single()
      .then(({ data }) => {
        if (!data || !data.onboarding_done) setShowOnboarding(true)
      })
  }, [user])

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      padding: '0',
      gap: '0',
      boxSizing: 'border-box',
    }}>

      {/* Sidebar — floating glass panel */}
      <div className="hidden-mobile" style={{
        flexShrink: 0,
        padding: '10px 0 10px 10px',
        boxSizing: 'border-box',
        height: '100vh',
      }}>
        <div style={{
          height: '100%',
          borderRadius: '18px',
          overflow: 'hidden',
          boxShadow: 'var(--glass-shadow)',
        }}>
          <Sidebar />
        </div>
      </div>

      {/* Main content */}
      <main style={{
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

      {/* Onboarding — shown once for new users */}
      {showOnboarding && <Onboarding onComplete={() => setShowOnboarding(false)} />}

      <style>{`
        .hidden-mobile { display: flex; }
        .show-mobile { display: none; }

        .page-wrap {
          display: flex;
          flex-direction: column;
          min-height: 100%;
          gap: 0;
        }

        .page-header {
          position: sticky;
          top: 0;
          z-index: 30;
          margin: 0 0 18px 0;
          flex-shrink: 0;
          padding: 22px 28px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          background: linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035));
          backdrop-filter: blur(34px);
          -webkit-backdrop-filter: blur(34px);
          border: 1px solid var(--glass-border);
          border-radius: 22px;
          box-shadow: var(--glass-shadow);
          overflow: hidden;
          min-height: 110px;
        }

        .page-header::before {
          content: '';
          position: absolute;
          top: 0; left: 10%; right: 10%; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.34), transparent);
          pointer-events: none;
        }

        .page-header::after {
          content: '';
          position: absolute;
          inset: -80% -20% auto auto;
          width: 360px;
          height: 220px;
          border-radius: 999px;
          background: radial-gradient(circle, var(--accent-soft), transparent 68%);
          pointer-events: none;
        }

        .page-header-title {
          position: relative;
          z-index: 1;
          font-family: Georgia, 'Times New Roman', serif;
          font-size: clamp(34px, 4vw, 54px);
          line-height: 0.92;
          font-weight: 900;
          font-style: italic;
          color: var(--text);
          letter-spacing: -0.075em;
          white-space: nowrap;
          text-shadow: 0 1px 18px rgba(255,255,255,0.10);
        }

        .page-header-sub {
          position: relative;
          z-index: 1;
          font-size: 14px;
          color: var(--muted2);
          margin-top: 7px;
          white-space: nowrap;
        }

        .page-header-actions {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          flex-shrink: 0;
        }

        .page-content-scroll {
          flex: 1;
          padding: 0 0 24px 0;
        }

        /* Mobile */
        @media (max-width: 768px) {
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block; }

          main {
            padding: 8px 8px 0 8px !important;
          }

          .page-header {
            top: 0;
            margin: 0 0 12px 0;
            padding: 14px 16px;
            border-radius: 18px;
            min-height: 82px;
            flex-wrap: wrap;
            gap: 8px;
          }

          .page-header-title { font-size: 32px; letter-spacing: -0.07em; }
          .page-header-sub   { font-size: 11px; margin-top: 4px; }

          .page-header-actions {
            gap: 5px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            max-width: 100%;
          }
          .page-header-actions::-webkit-scrollbar { display: none; }

          .page-content-scroll {
            padding: 0 0 90px 0;
          }

          /* Kill all horizontal overflow */
          * { max-width: 100%; box-sizing: border-box; }

          /* Responsive grids */
          .grid-4 { grid-template-columns: repeat(2, 1fr) !important; }
          .grid-2 { grid-template-columns: 1fr !important; }
          .grid-auto { grid-template-columns: 1fr !important; }

          /* Dashboard specific */
          .dashboard-bottom { grid-template-columns: 1fr !important; }
          .dashboard-header-row { flex-wrap: wrap; gap: 4px; }

          /* Category cards on mobile — prevent overflow */
          .cat-card { min-height: 130px !important; padding: 10px !important; }
          .cat-card .metric-value { font-size: 11px !important; }
          .cat-card .metric-label { font-size: 9px !important; }

          /* Insights */
          .insights-stat-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .insights-chart-grid { grid-template-columns: 1fr !important; }
          .insights-obs-grid { grid-template-columns: 1fr !important; }

          /* Settings — sidebar becomes horizontal tab bar */
          .settings-page { padding: 12px 12px 100px 12px !important; }
          .settings-layout { grid-template-columns: 1fr !important; }
          .settings-nav {
            position: static !important;
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            gap: 2px !important;
            padding: 4px !important;
            scrollbar-width: none !important;
          }
          .settings-nav::-webkit-scrollbar { display: none; }
          .settings-nav-btn {
            flex-shrink: 0 !important;
            width: auto !important;
            padding: 7px 11px !important;
            border-left: none !important;
            border-bottom: 2px solid transparent !important;
            border-radius: 8px !important;
            white-space: nowrap !important;
            font-size: 12px !important;
            text-align: center !important;
          }

          /* Journal — stack calendar above entry */
          .journal-layout { grid-template-columns: 1fr !important; }

          /* Jarvis — ensure input stays at bottom above nav */
          .jarvis-input-area { padding-bottom: 0 !important; }
          .jarvis-container {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 60px !important;
            margin: 0 !important;
            padding: 8px !important;
            width: 100% !important;
            height: auto !important;
          }

          /* Dashboard — ensure cards don't overflow right */
          .grid-4 > * { min-width: 0 !important; overflow: hidden !important; }
          .cat-card { width: 100% !important; overflow: hidden !important; }

          /* FAB — above bottom nav on mobile */
          .quicklog-fab { bottom: 72px !important; right: 16px !important; width: 48px !important; height: 48px !important; }

          /* Widgets single col */
          .widget-grid-2 { grid-template-columns: 1fr !important; }

          /* Input font sizes — prevent iOS zoom */
          input, textarea, select { font-size: 16px !important; }

          /* Buttons don't overflow */
          .btn { white-space: nowrap; flex-shrink: 0; font-size: 12px !important; padding: 6px 11px !important; }
          .btn-full { font-size: 14px !important; padding: 13px !important; }

          /* page-header buttons extra compact */
          .page-header .btn { font-size: 11px !important; padding: 5px 9px !important; }
          .page-header .btn-icon { padding: 5px !important; }
        }

        @media (max-width: 400px) {
          main { padding: 6px 6px 0 6px !important; }
          .page-header { padding: 12px 14px; min-height: 78px; }
        }
      `}</style>
    </div>
  )
}
