import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Layout from './components/Layout'
import { ConfirmHost, Loading, ToastHost } from './components/ui'
import Login from './pages/Login'
import Resumen from './pages/Resumen'
import Gastos from './pages/Gastos'
import Facturas from './pages/Facturas'
import FacturaEditor from './pages/FacturaEditor'
import Presupuestos from './pages/Presupuestos'
import PresupuestoEditor from './pages/PresupuestoEditor'
import Clientes from './pages/Clientes'
import Perfil from './pages/Perfil'
import Asesor from './pages/Asesor'
import Trabajadores from './pages/laboral/Trabajadores'
import NuevaAlta from './pages/laboral/NuevaAlta'
import FichaTrabajador from './pages/laboral/FichaTrabajador'
import Nominas from './pages/laboral/Nominas'
import Empresa from './pages/laboral/Empresa'
import MiAsesor from './pages/MiAsesor'

function Protegido({ children }: { children: ReactNode }) {
  const { session, loading, me } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!me) return <SinPerfil />
  return <>{children}</>
}

function SoloAsesor({ children }: { children: ReactNode }) {
  const { isAdvisor } = useAuth()
  return isAdvisor ? <>{children}</> : <Navigate to="/" replace />
}

function SinPerfil() {
  const { signOut } = useAuth()
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-medium">Tu cuenta todavía no tiene perfil.</p>
        <p className="mt-1 text-sm text-muted">Escribe a tu asesor para que la active.</p>
        <button onClick={signOut} className="mt-4 text-sm underline">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function SinConfigurar() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink p-6 text-white">
      <div className="max-w-md">
        <img src="/logo.png" alt="" className="mb-6 size-12" />
        <h1 className="text-2xl font-semibold">Falta conectar Supabase</h1>
        <p className="mt-3 text-white/70">
          Crea el archivo <code className="rounded bg-white/10 px-1.5 py-0.5 text-lima">app/.env.local</code> con
          <code className="mx-1 text-lima">VITE_SUPABASE_URL</code> y
          <code className="mx-1 text-lima">VITE_SUPABASE_ANON_KEY</code>
          (tienes un ejemplo en <code className="text-lima">.env.example</code>) y reinicia el servidor.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  if (!configured) return <SinConfigurar />
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <Protegido>
                <Layout />
              </Protegido>
            }
          >
            <Route index element={<Resumen />} />
            <Route path="gastos" element={<Gastos />} />
            <Route path="facturas" element={<Facturas />} />
            <Route path="facturas/nueva" element={<FacturaEditor />} />
            <Route path="facturas/:id" element={<FacturaEditor />} />
            <Route path="presupuestos" element={<Presupuestos />} />
            <Route path="presupuestos/nuevo" element={<PresupuestoEditor />} />
            <Route path="presupuestos/:id" element={<PresupuestoEditor />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="laboral" element={<Trabajadores />} />
            <Route path="laboral/alta" element={<NuevaAlta />} />
            <Route path="laboral/alta/:id" element={<NuevaAlta />} />
            <Route path="laboral/trabajadores/:id" element={<FichaTrabajador />} />
            <Route path="laboral/nominas" element={<Nominas />} />
            <Route path="laboral/empresa" element={<Empresa />} />
            <Route path="perfil" element={<Perfil />} />
            <Route path="mi-asesor" element={<MiAsesor />} />
            <Route
              path="asesor"
              element={
                <SoloAsesor>
                  <Asesor />
                </SoloAsesor>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastHost />
        <ConfirmHost />
      </AuthProvider>
    </BrowserRouter>
  )
}
