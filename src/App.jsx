import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Jarvis from './pages/Jarvis'
import JournalPage from './pages/Journal'
import TraningPage from './pages/Traning'
import EkonomiPage from './pages/Ekonomi'
import HalsaPage from './pages/Halsa'
import PluggPage from './pages/Plugg'
import JobbPage from './pages/Jobb'
import InsightsPage from './pages/Insights'
import UpplevelserPage from './pages/Upplevelser'
import SettingsPage from './pages/Settings'
import KalenderPage from './pages/Kalender'
import ExportPage from './pages/Export'
import AuthCallback from './pages/AuthCallback'
import StravaCallback from './pages/StravaCallback'

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

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
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
        <Route path="/installningar" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
