import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Jarvis from './pages/Jarvis'
import {
  JournalPage, TraningPage, HalsaPage, KostPage,
  EkonomiPage, PluggPage, JobbPage, SocialtPage,
  ResorPage, InsightsPage
} from './pages/Placeholders'

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
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/"        element={<Dashboard />} />
        <Route path="/jarvis"  element={<Jarvis />} />
        <Route path="/journal" element={<JournalPage />} />
        <Route path="/traning" element={<TraningPage />} />
        <Route path="/halsa"   element={<HalsaPage />} />
        <Route path="/kost"    element={<KostPage />} />
        <Route path="/ekonomi" element={<EkonomiPage />} />
        <Route path="/plugg"   element={<PluggPage />} />
        <Route path="/jobb"    element={<JobbPage />} />
        <Route path="/socialt" element={<SocialtPage />} />
        <Route path="/resor"   element={<ResorPage />} />
        <Route path="/insights" element={<InsightsPage />} />
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
