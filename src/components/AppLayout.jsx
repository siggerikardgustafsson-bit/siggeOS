import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppLayout() {
  const location = useLocation()

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
          margin: 0 0 12px 0;
          flex-shrink: 0;
          padding: 10px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          background: var(--surface);
          backdrop-filter: blur(32px);
          -webkit-backdrop-filter: blur(32px);
          border: 1px solid var(--glass-border);
          border-radius: 16px;
          box-shadow: var(--glass-shadow);
          overflow: hidden;
          min-height: 0;
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
          white-space: nowrap;
        }

        .page-header-sub {
          font-size: 11px;
          color: var(--muted);
          margin-top: 3px;
          white-space: nowrap;
        }

        .page-header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
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
            margin: 0 0 10px 0;
            padding: 8px 12px;
            border-radius: 14px;
            flex-wrap: wrap;
            gap: 6px;
          }

          .page-header-title { font-size: 14px; }
          .page-header-sub   { font-size: 10px; margin-top: 1px; }

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
          .page-header { padding: 7px 10px; }
        }
      `}</style>
    </div>
  )
}
