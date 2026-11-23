// Documentos. Se guardan solos, sin elegir nada:
//  - modo real → Supabase Storage (bucket privado «crm», solo el asesor): desde cualquier ordenador.
//  - modo demo → dentro de Chrome (almacenamiento privado del navegador).
// Opcional: una carpeta del Mac (File System Access) si se elige en «Usar una carpeta del Mac».
// Estructura: Cliente / [Proyecto] / [Tareas / «Título · id6»] / archivo
import { MODO, supabase } from './supabase'

export type Ruta = string[]
export interface Archivo { nombre: string; ruta: string; fecha: number; abrir: () => Promise<void>; borrar: () => Promise<void> }
export interface Almacen {
  tipo: 'nube' | 'navegador' | 'mac'
  listar(ruta: Ruta, recursivo: boolean): Promise<Archivo[]>
  guardar(ruta: Ruta, archivos: File[]): Promise<void>
  carpetas(ruta: Ruta): Promise<string[]>
}

const limpio = (s: string) => s.replace(/[\\/:*?"<>|#%{}^~[\]`]/g, '-').trim() || 'Sin nombre'
const ordenar = (a: Archivo[]) => a.sort((x, y) => y.fecha - x.fecha)
function abrirUrl(url: string) { const w = window.open(url, '_blank'); if (!w) location.href = url }
function nombreLibre(existe: (n: string) => boolean, nombre: string) {
  let n = nombre; let i = 1
  while (existe(n)) { const p = nombre.lastIndexOf('.'); n = p > 0 ? `${nombre.slice(0, p)} (${++i})${nombre.slice(p)}` : `${nombre} (${++i})` }
  return n
}

// ---------- carpetas (Mac o navegador): mismo API ----------
type Dir = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: string }): Promise<PermissionState>
  requestPermission(o: { mode: string }): Promise<PermissionState>
  values(): AsyncIterable<FileSystemHandle>
}
function almacenCarpeta(raiz: Dir, tipo: 'mac' | 'navegador'): Almacen {
  const ir = async (ruta: Ruta, crear = true) => {
    let d = raiz
    for (const p of ruta) d = (await d.getDirectoryHandle(limpio(p), { create: crear })) as Dir
    return d
  }
  async function listarDir(d: Dir, recursivo: boolean, rel: string): Promise<Archivo[]> {
    const out: Archivo[] = []
    for await (const h of d.values()) {
      if (h.name.startsWith('.')) continue
      if (h.kind === 'directory') { if (recursivo) out.push(...await listarDir(h as Dir, true, rel ? `${rel}/${h.name}` : h.name)); continue }
      const f = await (h as FileSystemFileHandle).getFile()
      out.push({ nombre: h.name, ruta: rel, fecha: f.lastModified,
        abrir: async () => abrirUrl(URL.createObjectURL(await (h as FileSystemFileHandle).getFile())),
        borrar: () => d.removeEntry(h.name) })
    }
    return out
  }
  return {
    tipo,
    listar: async (ruta, rec) => ordenar(await listarDir(await ir(ruta), rec, '')),
    async guardar(ruta, archivos) {
      const d = await ir(ruta)
      const hay = new Set<string>(); for await (const h of d.values()) hay.add(h.name)
      for (const f of archivos) {
        const n = nombreLibre((x) => hay.has(x), f.name); hay.add(n)
        const w = await (await d.getFileHandle(n, { create: true })).createWritable(); await w.write(f); await w.close()
      }
    },
    async carpetas(ruta) {
      const out: string[] = []
      try { for await (const h of (await ir(ruta, false)).values()) if (h.kind === 'directory') out.push(h.name) } catch { /* no existe */ }
      return out
    },
  }
}

// ---------- nube (Supabase Storage) ----------
const BUCKET = 'crm'
// Las claves de Storage no admiten bien tildes/espacios raros: cada tramo va codificado.
// Storage no admite «%» en las claves: se codifica y el «%» se cambia por «+» (permitido; un «+» real queda como %2B → +2B).
const enc = (s: string) => encodeURIComponent(limpio(s)).replace(/%/g, '+')
const cod = (ruta: Ruta) => ruta.map(enc).join('/')
const dec = (s: string) => { try { return decodeURIComponent(s.replace(/\+/g, '%')) } catch { return s } }
const almacenNube: Almacen = {
  tipo: 'nube',
  async listar(ruta, recursivo) {
    const out: Archivo[] = []
    const recorrer = async (pref: string, rel: string) => {
      const { data, error } = await supabase.storage.from(BUCKET).list(pref, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw error
      for (const o of data ?? []) {
        const clave = `${pref}/${o.name}`
        if (!o.id) { if (recursivo) await recorrer(clave, rel ? `${rel}/${dec(o.name)}` : dec(o.name)); continue }
        if (o.name === '.vacio') continue
        out.push({ nombre: dec(o.name), ruta: rel, fecha: new Date(o.created_at ?? 0).getTime(),
          abrir: async () => {
            const { data: u, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(clave, 300)
            if (e) throw e; abrirUrl(u.signedUrl)
          },
          borrar: async () => { const { error: e } = await supabase.storage.from(BUCKET).remove([clave]); if (e) throw e } })
      }
    }
    await recorrer(cod(ruta), '')
    return ordenar(out)
  },
  async guardar(ruta, archivos) {
    const pref = cod(ruta)
    const { data } = await supabase.storage.from(BUCKET).list(pref, { limit: 1000 })
    const hay = new Set((data ?? []).map((o) => dec(o.name)))
    for (const f of archivos) {
      const n = nombreLibre((x) => hay.has(x), f.name); hay.add(n)
      const { error } = await supabase.storage.from(BUCKET).upload(`${pref}/${enc(n)}`, f, { contentType: f.type || undefined })
      if (error) throw error
    }
  },
  async carpetas(ruta) {
    const { data } = await supabase.storage.from(BUCKET).list(cod(ruta), { limit: 1000 })
    return (data ?? []).filter((o) => !o.id).map((o) => dec(o.name))
  },
}

// ---------- elección del almacén ----------
const hayMac = () => 'showDirectoryPicker' in window
export const puedeUsarMac = hayMac

function idb<T>(fn: (s: IDBObjectStore) => IDBRequest<T>, modo: IDBTransactionMode = 'readonly') {
  return new Promise<T>((ok, ko) => {
    const r = indexedDB.open('crm-nomotax', 1)
    r.onupgradeneeded = () => r.result.createObjectStore('kv')
    r.onsuccess = () => { const q = fn(r.result.transaction('kv', modo).objectStore('kv')); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error) }
    r.onerror = () => ko(r.error)
  })
}
const carpetaMac = () => idb<Dir | undefined>((s) => s.get('raiz'))

export async function elegirCarpetaMac() {
  const h = await (window as unknown as { showDirectoryPicker(o: object): Promise<Dir> })
    .showDirectoryPicker({ id: 'crm-nomotax', mode: 'readwrite', startIn: 'documents' })
  await idb((s) => s.put(h, 'raiz'), 'readwrite')
}
export const dejarCarpetaMac = () => idb((s) => s.delete('raiz'), 'readwrite')

/** Almacén activo. Si hay carpeta del Mac elegida pero falta permiso: { pidePermiso } (necesita un clic). */
export async function almacen(pedirPermiso = false): Promise<{ alm: Almacen; nombreMac?: string } | { pidePermiso: string }> {
  const mac = hayMac() ? await carpetaMac() : undefined
  if (mac) {
    let p = await mac.queryPermission({ mode: 'readwrite' })
    if (p !== 'granted' && pedirPermiso) p = await mac.requestPermission({ mode: 'readwrite' })
    if (p === 'granted') return { alm: almacenCarpeta(mac, 'mac'), nombreMac: mac.name }
    return { pidePermiso: mac.name }
  }
  if (MODO === 'real') return { alm: almacenNube }
  const opfs = await (navigator.storage as unknown as { getDirectory(): Promise<Dir> }).getDirectory()
  return { alm: almacenCarpeta(opfs, 'navegador') }
}

/** Ruta de la carpeta de una tarea; la encuentra aunque luego cambies el título. */
export async function rutaTarea(alm: Almacen, base: Ruta, titulo: string, id: string): Promise<Ruta> {
  const marca = `· ${id.slice(0, 6)}`
  const ya = (await alm.carpetas([...base, 'Tareas'])).find((n) => n.endsWith(marca))
  return [...base, 'Tareas', ya ?? `${titulo.slice(0, 60)} ${marca}`]
}
