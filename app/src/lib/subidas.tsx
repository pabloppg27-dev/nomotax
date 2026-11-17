/**
 * Subidas en segundo plano: gastos, tickets y facturas emitidas de otro programa.
 * Se encolan aquí y se procesan de 3 en 3 aunque cierres la ventana o cambies de página
 * (mientras la pestaña de la app siga abierta). El progreso se ve en el panel flotante (PanelSubidas).
 * Sirve para cualquier rol: titular, asesor, admin, comercial o empleado (cada uno sube a la cuenta en la que está).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { errorMessage, supabase } from './supabase'
import { hoyISO } from './format'
import { necesitaRevision } from './contabilidad.ts'
import { columnasDivisa } from './divisas'
import { importesDe, leerFactura, prepararArchivo, subirDocumento } from './upload'
import { nuevoId } from './id'

/** gasto = Gastos · ticket = ticket de un empleado (Mi espacio) · factura = factura emitida con otro programa */
export type TipoSubida = 'gasto' | 'ticket' | 'factura'

export interface Subida {
  key: string
  nombre: string
  tipo: TipoSubida
  estado: 'esperando' | 'subiendo' | 'leyendo' | 'hecho' | 'error'
  /** Guardada pero sin leer, o el motivo del fallo */
  error?: string
  /** id del gasto o de la factura creada */
  id?: string
}

type Avisar = (p: Partial<Subida>) => void

const SIMULTANEAS = 3

async function procesarGasto(ownerId: string, file: File, avisar: Avisar) {
  const archivo = await prepararArchivo(file)
  const path = await subirDocumento(ownerId, 'gastos', archivo)
  // Se crea ya (sale en la lista como pendiente) y luego se rellena con lo que lee la IA
  const { data: fila, error } = await supabase.from('expenses').insert({ owner_id: ownerId, file_path: path, estado: 'pendiente' }).select().single()
  if (error) throw new Error(await errorMessage(error))
  avisar({ estado: 'leyendo', id: fila.id })
  emitir()
  try {
    const ocr = await leerFactura(path, 'gasto', ownerId)
    const imp = importesDe(ocr)
    const { error: e2 } = await supabase
      .from('expenses')
      .update({
        fecha: ocr.fecha,
        proveedor: ocr.emisor.nombre,
        proveedor_nif: ocr.emisor.nif,
        numero: ocr.numero,
        concepto: ocr.concepto,
        categoria: ocr.categoria,
        ...imp,
        naturaleza: ocr.naturaleza === 'inversion' ? 'inversion' : 'gasto',
        revision: necesitaRevision(ocr.naturaleza, imp.base) ? 'pendiente' : null,
        ...columnasDivisa(ocr),
        ocr,
      })
      .eq('id', fila.id)
    if (e2) throw new Error(await errorMessage(e2))
    avisar({ estado: 'hecho' })
  } catch (e) {
    avisar({ estado: 'error', error: `Guardado, pero no se ha podido leer: ${(e as Error).message}` })
  }
}

async function procesarFactura(ownerId: string, file: File, avisar: Avisar) {
  const archivo = await prepararArchivo(file)
  const path = await subirDocumento(ownerId, 'facturas', archivo)
  avisar({ estado: 'leyendo' })
  let datos: Record<string, unknown> = {}
  let fallo: string | undefined
  try {
    const ocr = await leerFactura(path, 'emitida', ownerId)
    const imp = importesDe(ocr)
    datos = {
      numero: ocr.numero,
      fecha: ocr.fecha || hoyISO(),
      vencimiento: ocr.vencimiento,
      cliente: { nombre: ocr.receptor.nombre, nif: ocr.receptor.nif, direccion: ocr.receptor.direccion },
      base: imp.base,
      cuota_iva: imp.cuota_iva,
      cuota_irpf: imp.cuota_irpf,
      irpf_pct: imp.irpf_pct ?? 0,
      total: imp.total,
      lineas: [{ concepto: ocr.concepto || 'Según factura', cantidad: 1, precio: imp.base, iva: imp.iva_pct ?? 0 }],
      ...columnasDivisa(ocr),
      ocr,
    }
  } catch (e) {
    fallo = `Guardada, pero no se ha podido leer: ${(e as Error).message}`
  }
  const { data, error } = await supabase
    .from('invoices')
    .insert({ owner_id: ownerId, origen: 'externa', estado: 'emitida', file_path: path, ...datos })
    .select()
    .single()
  if (error) throw new Error(await errorMessage(error))
  avisar(fallo ? { estado: 'error', error: fallo, id: data.id } : { estado: 'hecho', id: data.id })
}

// Aviso a las páginas abiertas (Gastos, Facturas, Mi espacio) para que recarguen su lista
const eventos = new EventTarget()
function emitir() {
  eventos.dispatchEvent(new Event('cambio'))
}
/** La página vuelve a cargar su lista cada vez que una subida avanza o termina */
export function useAlCambiarSubidas(cb: () => void) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    const h = () => ref.current()
    eventos.addEventListener('cambio', h)
    return () => eventos.removeEventListener('cambio', h)
  }, [])
}

interface Ctx {
  subidas: Subida[]
  /** Pone los archivos en la cola y vuelve enseguida: se procesan en segundo plano */
  encolar: (tipo: TipoSubida, ownerId: string, files: File[]) => void
  /** Quita del panel las ya terminadas */
  limpiar: () => void
}

const SubidasCtx = createContext<Ctx | null>(null)

export function SubidasProvider({ children }: { children: ReactNode }) {
  const [subidas, setSubidas] = useState<Subida[]>([])
  const cola = useRef<{ key: string; tipo: TipoSubida; ownerId: string; file: File }[]>([])
  const activas = useRef(0)

  const avisar = useCallback((key: string, p: Partial<Subida>) => setSubidas((ss) => ss.map((s) => (s.key === key ? { ...s, ...p } : s))), [])

  const bombear = useCallback(() => {
    while (activas.current < SIMULTANEAS && cola.current.length) {
      const t = cola.current.shift()!
      activas.current++
      const av: Avisar = (p) => avisar(t.key, p)
      av({ estado: 'subiendo' })
      const trabajo = t.tipo === 'factura' ? procesarFactura(t.ownerId, t.file, av) : procesarGasto(t.ownerId, t.file, av)
      trabajo
        .catch((e) => av({ estado: 'error', error: (e as Error)?.message ?? String(e) }))
        .finally(() => {
          activas.current--
          emitir()
          bombear()
        })
    }
  }, [avisar])

  const encolar = useCallback(
    (tipo: TipoSubida, ownerId: string, files: File[]) => {
      if (!files.length) return
      const nuevas: Subida[] = files.map((f) => ({ key: nuevoId(), nombre: f.name, tipo, estado: 'esperando' }))
      // Al empezar un lote nuevo, las ya terminadas se quitan del panel
      setSubidas((ss) => [...ss.filter((s) => s.estado !== 'hecho' && s.estado !== 'error'), ...nuevas])
      nuevas.forEach((s, i) => cola.current.push({ key: s.key, tipo, ownerId, file: files[i] }))
      bombear()
    },
    [bombear],
  )

  const limpiar = useCallback(() => setSubidas((ss) => ss.filter((s) => s.estado !== 'hecho' && s.estado !== 'error')), [])

  // Si quedan subidas en marcha, el navegador avisa antes de cerrar o recargar la pestaña
  const pendientes = subidas.some((s) => s.estado === 'esperando' || s.estado === 'subiendo' || s.estado === 'leyendo')
  useEffect(() => {
    if (!pendientes) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [pendientes])

  return <SubidasCtx.Provider value={{ subidas, encolar, limpiar }}>{children}</SubidasCtx.Provider>
}

export function useSubidas(): Ctx {
  const c = useContext(SubidasCtx)
  if (!c) throw new Error('useSubidas fuera de SubidasProvider')
  return c
}
