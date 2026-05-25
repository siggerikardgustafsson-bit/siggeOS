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
import AuthCallback from './pages/AuthCallback'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--muted)' }}>
      Laddar...
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
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/"             element={<Dashboard />} />
        <Route path="/jarvis"       element={<Jarvis />} />
        <Route path="/journal"      element={<JournalPage />} />
        <Route path="/traning"      element={<TraningPage />} />
        <Route path="/halsa"        element={<HalsaPage />} />
        <Route path="/ekonomi"      element={<EkonomiPage />} />
        <Route path="/plugg"        element={<PluggPage />} />
        <Route path="/jobb"         element={<JobbPage />} />
        <Route path="/upplevelser"  element={<UpplevelserPage />} />
        <Route path="/insights"     element={<InsightsPage />} />
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
