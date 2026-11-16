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
import Asesor from './pages/Asesor'
import Trabajadores from './pages/laboral/Trabajadores'
import NuevaAlta from './pages/laboral/NuevaAlta'
import FichaTrabajador from './pages/laboral/FichaTrabajador'
import Nominas from './pages/laboral/Nominas'
import Empresa from './pages/laboral/Empresa'
import MiAsesor from './pages/MiAsesor'
import Contabilidad from './pages/Contabilidad'
import Impuestos from './pages/Impuestos'
import VistaSocio from './pages/VistaSocio'
import MiEspacio from './pages/MiEspacio'
import AbrirConfiguracion from './pages/Configuracion'
import { ConfigProvider } from './components/Configuracion'
import type { Permiso } from './lib/types'

function Protegido({ children }: { children: ReactNode }) {
  const { session, loading, me, sinAcceso } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!me) return <SinPerfil />
  if (sinAcceso) return <SinAcceso />
  return <>{children}</>
}

/** Solo si tienes ese permiso en la empresa que estás viendo; si no, a la portada */
function Requiere({ permiso, children }: { permiso: Permiso; children: ReactNode }) {
  const { puede } = useAuth()
  return puede(permiso) ? <>{children}</> : <Navigate to="/" replace />
}

/** Portada según lo que eres en la empresa */
function Inicio() {
  const { rol } = useAuth()
  if (rol === 'socio') return <Navigate to="/socio" replace />
  if (rol === 'empleado') return <Navigate to="/mi-espacio" replace />
  return <Resumen />
}

function SoloEmpleado({ children }: { children: ReactNode }) {
  const { rol } = useAuth()
  return rol === 'empleado' ? <>{children}</> : <Navigate to="/" replace />
}

function SinAcceso() {
  const { signOut, me } = useAuth()
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-sm">
        <img src="/logo.png" alt="" className="mx-auto mb-5 size-11" />
        <p className="font-medium">Ya no tienes acceso a ninguna empresa.</p>
        <p className="mt-1 text-sm text-muted">
          Si crees que es un error, pide a la empresa que vuelva a darte acceso a {me?.email ?? 'tu email'}.
        </p>
        <button onClick={signOut} className="mt-4 text-sm underline">
          Cerrar sesión
        </button>
      </div>
    </div>
  )
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
                <ConfigProvider>
                  <Layout />
                </ConfigProvider>
              </Protegido>
            }
          >
            <Route index element={<Inicio />} />
            <Route path="gastos" element={<Requiere permiso="gastos"><Gastos /></Requiere>} />
            <Route path="facturas" element={<Requiere permiso="ventas"><Facturas /></Requiere>} />
            <Route path="facturas/nueva" element={<Requiere permiso="ventas"><FacturaEditor /></Requiere>} />
            <Route path="facturas/:id" element={<Requiere permiso="ventas"><FacturaEditor /></Requiere>} />
            <Route path="presupuestos" element={<Requiere permiso="ventas"><Presupuestos /></Requiere>} />
            <Route path="presupuestos/nuevo" element={<Requiere permiso="ventas"><PresupuestoEditor /></Requiere>} />
            <Route path="presupuestos/:id" element={<Requiere permiso="ventas"><PresupuestoEditor /></Requiere>} />
            <Route path="clientes" element={<Requiere permiso="ventas"><Clientes /></Requiere>} />
            <Route path="contabilidad" element={<Requiere permiso="contabilidad"><Contabilidad /></Requiere>} />
            <Route path="impuestos" element={<Requiere permiso="impuestos"><Impuestos /></Requiere>} />
            <Route path="laboral" element={<Requiere permiso="laboral"><Trabajadores /></Requiere>} />
            <Route path="laboral/alta" element={<Requiere permiso="laboral"><NuevaAlta /></Requiere>} />
            <Route path="laboral/alta/:id" element={<Requiere permiso="laboral"><NuevaAlta /></Requiere>} />
            <Route path="laboral/trabajadores/:id" element={<Requiere permiso="laboral"><FichaTrabajador /></Requiere>} />
            <Route path="laboral/nominas" element={<Requiere permiso="nominas"><Nominas /></Requiere>} />
            <Route path="laboral/empresa" element={<Requiere permiso="laboral"><Empresa /></Requiere>} />
            <Route path="usuarios" element={<AbrirConfiguracion seccion="usuarios" />} />
            <Route path="configuracion/:seccion?" element={<AbrirConfiguracion />} />
            <Route path="socio" element={<Requiere permiso="socio"><VistaSocio /></Requiere>} />
            <Route path="mi-espacio" element={<SoloEmpleado><MiEspacio /></SoloEmpleado>} />
            <Route path="perfil" element={<AbrirConfiguracion seccion="perfil" />} />
            <Route path="mi-asesor" element={<Requiere permiso="asesor"><MiAsesor /></Requiere>} />
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
