import { useEffect } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useConfig } from '../components/Configuracion'
import type { IdSeccion } from '../lib/configuracion'

/**
 * Direcciones de siempre (/perfil, /configuracion/plan…): abren la ventana de Configuración en esa
 * sección y dejan detrás la página principal. Las usan los correos (bienvenida, «He olvidado la contraseña»)
 * y la tarjeta «Tu plan» del menú.
 */
export default function AbrirConfiguracion({ seccion: fija }: { seccion?: IdSeccion }) {
  const params = useParams()
  const [query] = useSearchParams()
  const { rol } = useAuth()
  const { abrir } = useConfig()
  const seccion = (fija ?? params.seccion) as IdSeccion | undefined
  const nuevaClave = query.has('nueva-clave')

  useEffect(() => {
    abrir(seccion, { nuevaClave })
  }, [abrir, seccion, nuevaClave])

  const inicio = rol === 'socio' ? '/socio' : rol === 'empleado' ? '/mi-espacio' : '/'
  return <Navigate to={inicio} replace />
}
