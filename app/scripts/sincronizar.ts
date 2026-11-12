/**
 * NomoTax · Copia automática del Área de clientes a las carpetas del asesor.
 *
 * Para cada cliente escribe en ~/Documents/NomoTax Clientes/<Cliente>/:
 *   02 Contabilidad/<año>/Libros contables/Área de clientes/
 *       <Cliente> - Contabilidad <año>.xlsx      (todos los libros, fácil de leer)
 *       <Cliente> - Asientos A3 / Sage / Holded  (para importar)
 *   02 Contabilidad/<año>/Facturas recibidas/Área de clientes/   (gastos subidos)
 *   02 Contabilidad/<año>/Facturas emitidas/Área de clientes/    (facturas subidas)
 *   06 Laboral/<año>/Nóminas/Área de clientes/                   (nóminas publicadas)
 *
 * Solo escribe dentro de las carpetas «Área de clientes»: nunca toca tus archivos.
 * Solo reescribe lo que ha cambiado.
 *
 * Uso:
 *   npm run sincronizar             → una pasada
 *   npm run sincronizar -- --vigilar → se queda escuchando: copia al momento cada cambio
 *                                      (y una pasada completa cada 30 minutos)
 *
 * Necesita scripts/sincronizar.env con SUPABASE_URL y SUPABASE_SECRET_KEY.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { entre, generarAsientos, type AsientoManual, type DatosContables, type Inmovilizado } from '../src/lib/contabilidad.ts'
import { asientosA3, asientosHolded, asientosSage, libroExcel } from '../src/lib/exportar.ts'
import type { Expense, Invoice, Nomina, Profile } from '../src/lib/types.ts'

const URL_SB = process.env.SUPABASE_URL
const CLAVE = process.env.SUPABASE_SECRET_KEY
if (!URL_SB || !CLAVE) {
  console.error('Falta scripts/sincronizar.env con SUPABASE_URL y SUPABASE_SECRET_KEY (la clave secreta de Supabase → Settings → API Keys).')
  process.exit(1)
}
const RAIZ = process.env.CARPETA_CLIENTES || join(homedir(), 'Documents', 'NomoTax Clientes')
const SUB = 'Área de clientes'
const MANIFIESTO = join(RAIZ, '.area-de-clientes.json')
const BUCKET = 'documentos'

const sb = createClient(URL_SB, CLAVE, { auth: { persistSession: false } })

/** ruta relativa a RAIZ → { cliente, huella } de lo que escribimos nosotros */
type Manifiesto = Record<string, { cliente: string; huella: string }>
let manifiesto: Manifiesto = existsSync(MANIFIESTO) ? JSON.parse(readFileSync(MANIFIESTO, 'utf8')) : {}
const guardarManifiesto = () => writeFileSync(MANIFIESTO, JSON.stringify(manifiesto, null, 1))

const hora = () => new Date().toLocaleTimeString('es-ES')
const log = (...a: unknown[]) => console.log(`[${hora()}]`, ...a)

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

const limpio = (s: string) =>
  s
    .replace(/[/\\:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)

const huella = (x: unknown) => createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex')

/** Carpeta del cliente: la que ya existe con el mismo nombre (sin acentos ni puntos) o una nueva */
function carpetaCliente(p: Profile): string {
  const nombre = limpio(p.nombre || p.email || p.id)
  const clave = normalizar(nombre)
  if (existsSync(RAIZ)) {
    for (const d of readdirSync(RAIZ, { withFileTypes: true }))
      if (d.isDirectory() && normalizar(d.name) === clave) return join(RAIZ, d.name)
  }
  return join(RAIZ, nombre)
}

async function cargar(ownerId: string): Promise<DatosContables> {
  const [f, g, n, t, m, i] = await Promise.all([
    sb.from('invoices').select('*').eq('owner_id', ownerId),
    sb.from('expenses').select('*').eq('owner_id', ownerId),
    sb.from('nominas').select('*').eq('owner_id', ownerId),
    sb.from('trabajadores').select('id, nombre').eq('owner_id', ownerId),
    sb.from('asientos_manuales').select('*').eq('owner_id', ownerId),
    sb.from('inmovilizados').select('*').eq('owner_id', ownerId),
  ])
  for (const r of [f, g, n, t, m, i]) if (r.error) throw new Error(r.error.message)
  const nombreTrab = new Map(((t.data as { id: string; nombre: string }[]) ?? []).map((x) => [x.id, x.nombre]))
  return {
    facturas: (f.data as Invoice[]) ?? [],
    gastos: (g.data as Expense[]) ?? [],
    nominas: ((n.data as Nomina[]) ?? []).map((x) => ({ ...x, trabajador_nombre: x.trabajador_id ? nombreTrab.get(x.trabajador_id) : null })),
    manuales: (m.data as AsientoManual[]) ?? [],
    inmovilizados: (i.data as Inmovilizado[]) ?? [],
  }
}

type Salida = { ruta: string; huella: string; contenido: () => Promise<Buffer | string> }

/** Escribe solo si ha cambiado (o si el archivo ya no está) */
async function escribir(cliente: string, s: Salida): Promise<boolean> {
  const rel = relative(RAIZ, s.ruta)
  if (manifiesto[rel]?.huella === s.huella && existsSync(s.ruta)) return false
  const datos = await s.contenido()
  mkdirSync(dirname(s.ruta), { recursive: true })
  writeFileSync(s.ruta, datos)
  manifiesto[rel] = { cliente, huella: s.huella }
  return true
}

async function descargarDoc(path: string): Promise<Buffer> {
  const { data, error } = await sb.storage.from(BUCKET).download(path)
  if (error || !data) throw new Error(`No se ha podido descargar ${path}: ${error?.message}`)
  return Buffer.from(await data.arrayBuffer())
}

async function sincronizarCliente(p: Profile) {
  const d = await cargar(p.id)
  const nombre = limpio(p.nombre || p.email || 'Cliente')
  const base = carpetaCliente(p)
  const salidas: Salida[] = []

  // Años con movimiento (siempre el actual)
  const anios = new Set<number>([new Date().getFullYear()])
  for (const x of [...d.facturas, ...d.gastos, ...d.manuales]) if (x.fecha) anios.add(Number(x.fecha.slice(0, 4)))
  for (const x of d.nominas) anios.add(x.anio)

  for (const anio of [...anios].sort()) {
    const desde = `${anio}-01-01`
    const hasta = `${anio}-12-31`
    const { asientos, nombres } = generarAsientos({ ...d, hasta })
    const delAnio = entre(asientos, desde, hasta)
    if (!delAnio.length) continue
    const libros = join(base, '02 Contabilidad', String(anio), 'Libros contables', SUB)
    const h = huella({ asientos, nombres, i: d.inmovilizados, nombre, v: 1 })
    salidas.push(
      {
        ruta: join(libros, `${nombre} - Contabilidad ${anio}.xlsx`),
        huella: h,
        contenido: async () =>
          Buffer.from(await libroExcel({ cliente: nombre, ejercicio: anio, desde, hasta, asientos, nombres, inmovilizados: d.inmovilizados })),
      },
      { ruta: join(libros, `${nombre} - Asientos A3 ${anio}.xlsx`), huella: h, contenido: async () => Buffer.from(await asientosA3(delAnio, nombres)) },
      { ruta: join(libros, `${nombre} - Asientos Sage ${anio}.csv`), huella: h, contenido: async () => asientosSage(delAnio, nombres) },
      { ruta: join(libros, `${nombre} - Asientos Holded ${anio}.xlsx`), huella: h, contenido: async () => Buffer.from(await asientosHolded(delAnio, nombres)) },
    )
  }

  // Documentos subidos (el archivo no cambia: la huella es su ruta en el almacenamiento)
  const doc = (carpeta: string, nombreArchivo: string, path: string) =>
    salidas.push({ ruta: join(carpeta, limpio(nombreArchivo) + (extname(path) || '.pdf')), huella: path, contenido: () => descargarDoc(path) })

  for (const g of d.gastos) {
    if (!g.file_path || !g.fecha) continue
    const dir = join(base, '02 Contabilidad', g.fecha.slice(0, 4), 'Facturas recibidas', SUB)
    doc(dir, `${g.fecha} ${g.proveedor ?? 'Proveedor'}${g.numero ? ` ${g.numero}` : ''}`, g.file_path)
  }
  for (const f of d.facturas) {
    if (!f.file_path || !f.fecha) continue
    const dir = join(base, '02 Contabilidad', f.fecha.slice(0, 4), 'Facturas emitidas', SUB)
    doc(dir, `${f.fecha} ${f.numero ?? ''} ${f.cliente?.nombre ?? ''}`, f.file_path)
  }
  for (const n of d.nominas) {
    if (n.estado !== 'publicada' || !n.file_path) continue
    const dir = join(base, '06 Laboral', String(n.anio), 'Nóminas', SUB)
    const tipo = n.tipo === 'mensual' ? '' : ` (${n.tipo})`
    doc(dir, `${n.anio}-${String(n.mes).padStart(2, '0')} ${n.trabajador_nombre ?? n.nombre_leido ?? 'Trabajador'}${tipo}`, n.file_path)
  }

  let escritos = 0
  for (const s of salidas) {
    try {
      if (await escribir(p.id, s)) escritos++
    } catch (e) {
      log(`  ⚠ ${nombre}: ${(e as Error).message}`)
    }
  }

  // Lo que escribimos antes y ya no existe en la plataforma (p. ej. un gasto borrado) se quita.
  // Solo archivos nuestros (están en el manifiesto) y dentro de «Área de clientes».
  const esperadas = new Set(salidas.map((s) => relative(RAIZ, s.ruta)))
  let quitados = 0
  for (const [rel, info] of Object.entries(manifiesto)) {
    if (info.cliente !== p.id || esperadas.has(rel) || !rel.includes(SUB)) continue
    rmSync(join(RAIZ, rel), { force: true })
    delete manifiesto[rel]
    quitados++
  }
  guardarManifiesto()
  if (escritos || quitados) log(`✓ ${nombre}: ${escritos} actualizado${escritos === 1 ? '' : 's'}${quitados ? `, ${quitados} quitado${quitados === 1 ? '' : 's'}` : ''}`)
}

async function clientes(): Promise<Profile[]> {
  const { data, error } = await sb.from('profiles').select('*').eq('role', 'client')
  if (error) throw new Error(error.message)
  return (data as Profile[]) ?? []
}

async function todo() {
  const lista = await clientes()
  for (const p of lista) {
    try {
      await sincronizarCliente(p)
    } catch (e) {
      log(`⚠ ${p.nombre}: ${(e as Error).message}`)
    }
  }
  return lista.length
}

// ---------------------------------------------------------------------
const vigilar = process.argv.includes('--vigilar')
manifiesto = existsSync(MANIFIESTO) ? JSON.parse(readFileSync(MANIFIESTO, 'utf8')) : {}
mkdirSync(RAIZ, { recursive: true })
const n = await todo().catch((e: Error) => {
  console.error(`No se ha podido conectar con Supabase: ${e.message}. Revisa la clave de scripts/sincronizar.env.`)
  process.exit(1)
})
log(`Copia completa: ${n} cliente${n === 1 ? '' : 's'} en ${RAIZ}`)

if (vigilar) {
  const pendientes = new Map<string, ReturnType<typeof setTimeout>>()
  const programar = async (ownerId: string | undefined) => {
    if (!ownerId) return
    clearTimeout(pendientes.get(ownerId))
    pendientes.set(
      ownerId,
      setTimeout(async () => {
        pendientes.delete(ownerId)
        const { data } = await sb.from('profiles').select('*').eq('id', ownerId).maybeSingle()
        const p = data as Profile | null
        if (p?.role === 'client') await sincronizarCliente(p).catch((e) => log(`⚠ ${p.nombre}: ${(e as Error).message}`))
      }, 3000),
    )
  }
  const canal = sb.channel('copia-carpetas')
  for (const tabla of ['invoices', 'expenses', 'nominas', 'asientos_manuales', 'inmovilizados', 'trabajadores', 'profiles'])
    canal.on('postgres_changes', { event: '*', schema: 'public', table: tabla }, (cambio) => {
      const fila = (cambio.new && Object.keys(cambio.new).length ? cambio.new : cambio.old) as { owner_id?: string; id?: string }
      programar(tabla === 'profiles' ? fila.id : fila.owner_id)
    })
  canal.subscribe((estado) => estado === 'SUBSCRIBED' && log('Escuchando cambios en directo…'))
  setInterval(() => todo().catch((e) => log('⚠', (e as Error).message)), 30 * 60 * 1000)
} else {
  process.exit(0)
}
