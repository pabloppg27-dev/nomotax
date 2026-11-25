// Dictado: voz → texto (OpenAI si hay clave; si no, Web Speech API del navegador) → interpretación (Claude en la función crm-dictado,
// o un intérprete sencillo en modo demo).
import { MODO, supabase } from './supabase'
import { iso } from './fechas'
import type { Cliente, Prioridad, Proyecto } from './tipos'

export type { Resultado, ReunionDictada, TareaDictada } from '../../servidor/pensar'
import type { Resultado } from '../../servidor/pensar'

type SR = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null }

export const hayVoz = () => typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)

/** Empieza a escuchar. Devuelve una función para parar. */
export function escuchar(onTexto: (texto: string) => void, onFin: () => void, onError: (m: string) => void) {
  const W = window as unknown as Record<string, new () => SR>
  const rec = new (W.SpeechRecognition ?? W.webkitSpeechRecognition)()
  rec.lang = 'es-ES'; rec.continuous = true; rec.interimResults = true
  let final = ''
  rec.onresult = (e) => {
    let parcial = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      if (r.isFinal) final += r[0].transcript + ' '; else parcial += r[0].transcript
    }
    onTexto((final + parcial).trim())
  }
  rec.onend = onFin
  rec.onerror = (e) => onError(e.error === 'not-allowed' ? 'Chrome no tiene permiso para el micrófono' : e.error)
  rec.start()
  return () => rec.stop()
}

// ---------- Voz → texto con OpenAI (mejor que el reconocedor del navegador) ----------
// Se graba el audio y, al parar, el servidor lo transcribe con el vocabulario de clientes y proyectos.

export const hayGrabadora = () => typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia

let transcripcionDisponible: Promise<boolean> | null = null
/** ¿Hay clave de OpenAI en el servidor? (se pregunta una vez por sesión) */
export function hayTranscripcion() {
  if (!hayGrabadora()) return Promise.resolve(false)
  transcripcionDisponible ??= llamarTranscripcion({ comprobar: true }).then(() => true, () => false)
  return transcripcionDisponible
}

async function llamarTranscripcion(body: Record<string, unknown>): Promise<{ texto?: string }> {
  if (MODO === 'real') {
    const { data, error } = await supabase.functions.invoke('crm-dictado', { body: { accion: 'transcribir', ...body } })
    if (error) throw error
    return data
  }
  const r = await fetch('/api/transcribir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error ?? 'Error al transcribir')
  return d
}

/** Empieza a grabar. Devuelve una función que para y entrega el audio. */
export async function grabar(): Promise<() => Promise<Blob>> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined)
  const trozos: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data) }
  rec.start()
  return () => new Promise((ok) => {
    rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); ok(new Blob(trozos, { type: rec.mimeType || tipo || 'audio/webm' })) }
    if (rec.state === 'inactive') rec.onstop(new Event('stop')); else rec.stop()
  })
}

const aBase64 = (b: Blob) => new Promise<string>((ok, mal) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result).split(',')[1] ?? '')
  r.onerror = () => mal(r.error)
  r.readAsDataURL(b)
})

/** Audio → texto, con los nombres de clientes y proyectos como vocabulario */
export async function transcribir(audio: Blob, clientes: Cliente[], proyectos: Proyecto[]) {
  if (audio.size < 1000) return ''
  const d = await llamarTranscripcion({
    audio: await aBase64(audio), tipo: audio.type,
    clientes: clientes.map((c) => ({ nombre: c.nombre })),
    proyectos: proyectos.filter((p) => p.estado === 'activo').map((p) => ({ nombre: p.nombre })),
  })
  return d.texto ?? ''
}

/** Claude piensa el dictado. Local: /api/dictado (npm run dev con clave). Publicado: función crm-dictado. */
export async function interpretar(texto: string, clientes: Cliente[], proyectos: Proyecto[]): Promise<Resultado & { sinClaude?: boolean }> {
  const body = {
    texto, hoy: iso(new Date()),
    clientes: clientes.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo ?? null, pais: c.pais ?? null })),
    proyectos: proyectos.filter((p) => p.estado === 'activo').map((p) => ({ id: p.id, nombre: p.nombre, cliente_id: p.cliente_id ?? null })),
  }
  if (MODO === 'real') {
    const { data, error } = await supabase.functions.invoke('crm-dictado', { body })
    if (error) throw error
    return data as Resultado
  }
  const r = await fetch('/api/dictado', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null)
  if (r?.ok) return r.json()
  const err = r ? await r.json().catch(() => ({})) : {}
  if (r && err.error !== 'sin-clave') throw new Error(err.error ?? 'Error al hablar con Claude')
  return { ...interpretarLocal(texto, clientes, proyectos), sinClaude: true }
}

// ---------- intérprete sencillo (modo demo / sin conexión) ----------
const sinTildes = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

function mejorCoincidencia<T extends { nombre: string }>(t: string, lista: T[]) {
  let mejor: T | undefined; let puntos = 0
  for (const x of lista) {
    const palabras = sinTildes(x.nombre).split(/\s+/).filter((p) => p.length > 2 && !['sl', 'slu', 'llc', 'sa'].includes(p))
    const n = palabras.filter((p) => t.includes(p)).length / Math.max(palabras.length, 1)
    if (n > puntos) { puntos = n; mejor = x }
  }
  return puntos >= 0.5 ? mejor : undefined
}

export function interpretarLocal(texto: string, clientes: Cliente[], proyectos: Proyecto[]): Resultado {
  const t = sinTildes(texto)
  if (/^(crea(r)?|nuevo|alta( de)?)( un)? cliente/.test(t)) {
    const nombre = texto.replace(/^.*?cliente( externo)?[:,]?\s*/i, '').split(/[,.]/)[0].trim()
    const email = texto.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase() ?? null
    return { tareas: [], reuniones: [], clientes_nuevos: [{ nombre, tipo: /llc/i.test(texto) ? 'LLC' : null, pais: null, email, notas: texto }], resumen: 'Cliente creado' }
  }
  const prioridad: Prioridad = /prioridad alta|urgente/.test(t) ? 'alta' : /prioridad baja/.test(t) ? 'baja' : 'media'
  const cli = mejorCoincidencia(t, clientes)
  const proy = mejorCoincidencia(t, proyectos.filter((p) => p.estado === 'activo'))
  let fecha: string | null = null
  const d = new Date()
  if (/pasado manana/.test(t)) { d.setDate(d.getDate() + 2); fecha = iso(d) }
  else if (/manana/.test(t)) { d.setDate(d.getDate() + 1); fecha = iso(d) }
  else if (/\bhoy\b/.test(t)) fecha = iso(d)
  else {
    const dia = DIAS.findIndex((x) => new RegExp(`\\b${x}\\b`).test(t))
    if (dia >= 0) { d.setDate(d.getDate() + (((dia - d.getDay()) + 7) % 7 || 7)); fecha = iso(d) }
    const m = t.match(/\bel (\d{1,2})\b/)
    if (m) { const n = new Date(d.getFullYear(), d.getMonth(), +m[1]); if (n < new Date()) n.setMonth(n.getMonth() + 1); fecha = iso(n) }
  }
  const hora = t.match(/a las (\d{1,2})(?:[:.](\d{2}))?( de la tarde| de la noche)?/)
  if (/reunion|sesion|videollamada|llamada|meet/.test(t) && hora) {
    let h = +hora[1]; if (hora[3] && h < 12) h += 12
    const c = cli?.nombre ?? ''
    return { tareas: [], clientes_nuevos: [], resumen: 'Reunión preparada', reuniones: [{
      titulo: `Reunión${c ? ' con ' + c : ''}`, detalle: texto, cliente_id: cli?.id ?? null, cliente_nuevo: null,
      proyecto_id: proy?.id ?? null, fecha: fecha ?? iso(new Date()), hora: `${String(h).padStart(2, '0')}:${hora[2] ?? '00'}`,
      email: texto.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase() ?? null,
      duracion: /media hora/.test(t) ? 30 : 60, meet: !/presencial|telefono/.test(t) }] }
  }
  const titulo = texto
    .replace(/^(crea(r)?( una)? tarea|nueva tarea|tarea)[:,]?\s*/i, '')
    .replace(/,?\s*(con )?prioridad (alta|media|baja)/i, '')
    .replace(/,?\s*(para |antes de(l)? )?(el |este |hoy|ma[nñ]ana|pasado ma[nñ]ana)(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|\d{1,2})?\b.*$/i, '')
    .split(/[.]/)[0].trim()
  return {
    tareas: [{ titulo: titulo.charAt(0).toUpperCase() + titulo.slice(1), detalle: texto, prioridad,
      cliente_id: cli?.id ?? null, cliente_nuevo: null, proyecto_id: proy?.id ?? null, fecha }],
    reuniones: [], clientes_nuevos: [], resumen: 'Tarea creada',
  }
}
