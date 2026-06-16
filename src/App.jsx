import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'
import StravaCallback from './pages/StravaCallback'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Jarvis = lazy(() => import('./pages/Jarvis'))
const JournalPage = lazy(() => import('./pages/Journal'))
const TraningPage = lazy(() => import('./pages/Traning'))
const EkonomiPage = lazy(() => import('./pages/Ekonomi'))
const HalsaPage = lazy(() => import('./pages/Halsa'))
const PluggPage = lazy(() => import('./pages/Plugg'))
const JobbPage = lazy(() => import('./pages/Jobb'))
const InsightsPage = lazy(() => import('./pages/Insights'))
const UpplevelserPage = lazy(() => import('./pages/Upplevelser'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const KalenderPage = lazy(() => import('./pages/Kalender'))
const ExportPage = lazy(() => import('./pages/Export'))
const ProfilePage = lazy(() => import('./pages/Profile'))

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="maxxit-loading-screen">
      <div className="maxxit-loading-card">
        <div className="maxxit-logo maxxit-logo-large"><span>Maxx</span><strong>It</strong></div>
        <div className="maxxit-loading-text">Startar instrumentpanelen…</div>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function PageFallback() {
  return (
    <div className="maxxit-loading-screen">
      <div className="maxxit-loading-card">
        <div className="maxxit-logo maxxit-logo-large"><span>Maxx</span><strong>It</strong></div>
        <div className="maxxit-loading-text">Laddar…</div>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, recovery } = useAuth()
  return (
    <Suspense fallback={<PageFallback />}>
    <Routes>
      {/* During password recovery a session exists, but we must keep the user on
          /login so they can set a new password (don't bounce them to Dashboard). */}
      <Route path="/login" element={user && !recovery ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/strava-callback" element={<StravaCallback />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/"             element={<Dashboard />} />
        <Route path="/jarvis"       element={<Jarvis />} />
        <Route path="/journal"      element={<JournalPage />} />
        <Route path="/traning"      element={<TraningPage />} />
        <Route path="/halsa"        element={<HalsaPage />} />
        <Route path="/ekonomi"      element={<EkonomiPage />} />
        <Route path="/plugg"        element={<PluggPage />} />
        <Route path="/jobb"         element={<JobbPage />} />
        <Route path="/upplevelser"   element={<UpplevelserPage />} />
        <Route path="/insights"      element={<InsightsPage />} />
        <Route path="/kalender"      element={<KalenderPage />} />
        <Route path="/export"        element={<ExportPage />} />
        <Route path="/profil"        element={<ProfilePage />} />
        <Route path="/installningar" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
