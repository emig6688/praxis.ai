import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useEffect } from 'react'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import ManageContadores from './pages/admin/ManageContadores'
import ManageClientes from './pages/admin/ManageClientes'
import AdminBase from './pages/admin/AdminBase'
import Agente from './pages/admin/Agente'
import ContadorDashboard from './pages/contador/ContadorDashboard'
import ClienteDetail from './pages/contador/ClienteDetail'
import DashboardIVA from './pages/contador/DashboardIVA'
import DescargaMasiva from './pages/contador/DescargaMasiva'
import Dashboard from './pages/contador/Dashboard'
import Reportes from './pages/contador/Reportes'
import ClienteDashboard from './pages/cliente/ClienteDashboard'

function LogoutRedirect() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    logout()
    navigate('/login', { replace: true })
  }, [])
  return null
}

function RootRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.rol === 'superadmin') return <Navigate to="/superadmin" replace />
  if (user.rol === 'admin') return <Navigate to="/admin" replace />
  if (user.rol === 'contador') return <Navigate to="/contador" replace />
  return <Navigate to="/cliente" replace />
}

function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/logout" element={<LogoutRedirect />} />
        <Route path="/" element={<RootRedirect />} />

        {/* Super Admin */}
        <Route path="/superadmin" element={
          <ProtectedRoute roles={['superadmin']}>
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />

        {/* Admin de estudio */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/admin/contadores" element={
          <ProtectedRoute roles={['admin']}>
            <ManageContadores />
          </ProtectedRoute>
        } />
        <Route path="/admin/clientes" element={
          <ProtectedRoute roles={['admin']}>
            <ManageClientes />
          </ProtectedRoute>
        } />
        <Route path="/admin/base" element={
          <ProtectedRoute roles={['admin']}>
            <AdminBase />
          </ProtectedRoute>
        } />
        <Route path="/admin/agente" element={
          <ProtectedRoute roles={['admin']}>
            <Agente />
          </ProtectedRoute>
        } />

        {/* Contador */}
        <Route path="/contador" element={
          <ProtectedRoute roles={['admin', 'contador']}>
            <ContadorDashboard />
          </ProtectedRoute>
        } />
        <Route path="/contador/cliente/:id" element={
          <ProtectedRoute roles={['admin', 'contador']}>
            <ClienteDetail />
          </ProtectedRoute>
        } />
        <Route path="/contador/dashboard-iva" element={
          <ProtectedRoute roles={['admin', 'contador']}>
            <DashboardIVA />
          </ProtectedRoute>
        } />
        <Route path="/contador/descarga-masiva" element={
          <ProtectedRoute roles={['admin', 'contador']}>
            <DescargaMasiva />
          </ProtectedRoute>
        } />
        <Route path="/contador/dashboard" element={
          <ProtectedRoute roles={['admin', 'contador']}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/contador/reportes" element={
          <ProtectedRoute roles={['admin', 'contador']}>
            <Reportes />
          </ProtectedRoute>
        } />

        {/* Cliente */}
        <Route path="/cliente" element={
          <ProtectedRoute roles={['cliente']}>
            <ClienteDashboard />
          </ProtectedRoute>
        } />

        <Route path="/unauthorized" element={
          <div className="text-center py-20">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Sin permisos</h1>
            <p className="text-gray-500">No tenés acceso a esta sección.</p>
          </div>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
