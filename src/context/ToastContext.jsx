import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

let idCounter = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback(({ message, type = 'info', duration = 4000, action }) => {
    const id = ++idCounter
    setToasts(prev => [...prev, { id, message, type, action }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
        left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px',
        pointerEvents: 'none', width: 'min(420px, calc(100vw - 32px))',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            padding: '12px 16px', borderRadius: '12px', pointerEvents: 'all',
            background: t.type === 'error' ? 'rgba(239,68,68,0.15)' : t.type === 'success' ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.10)',
            border: `1px solid ${t.type === 'error' ? 'rgba(239,68,68,0.3)' : t.type === 'success' ? 'rgba(52,211,153,0.25)' : 'rgba(255,255,255,0.14)'}`,
            backdropFilter: 'blur(20px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            animation: 'toast-in 0.2s ease',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500, flex: 1 }}>{t.message}</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              {t.action && (
                <button onClick={() => { t.action.onClick(); dismiss(t.id) }} style={{
                  fontSize: '12px', fontWeight: 700, color: 'var(--accent)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'inherit',
                }}>
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', fontSize: '16px', lineHeight: 1, padding: '0 2px',
              }}>×</button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
