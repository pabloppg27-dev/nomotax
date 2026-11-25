// Cerebro del dictado: recibe lo que dice Pablo y devuelve tareas, reuniones (y clientes nuevos) bien redactadas.
// Lo usan la función de Supabase crm-dictado (publicada) y el servidor local de `npm run dev`.
// Sin imports: recibe el cliente de Anthropic ya creado.

export interface EntradaDictado {
  texto: string
  hoy: string // YYYY-MM-DD
  clientes: { id: string; nombre: string; tipo?: string | null; pais?: string | null }[]
  proyectos: { id: string; nombre: string; cliente_id?: string | null }[]
}

const nulo = (t: string) => ({ type: ['string', 'null'], description: t })

export const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tareas', 'reuniones', 'clientes_nuevos', 'resumen'],
  properties: {
    tareas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'detalle', 'prioridad', 'cliente_id', 'cliente_nuevo', 'proyecto_id', 'fecha'],
        properties: {
          titulo: { type: 'string', description: 'Nombre claro y concreto de la tarea' },
          detalle: { type: 'string', description: 'Explicación bien redactada' },
          prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
          cliente_id: nulo('id de la lista de clientes, o null'),
          cliente_nuevo: nulo('nombre exacto de un cliente de clientes_nuevos, si la tarea es de uno de ellos'),
          proyecto_id: nulo('id de la lista de proyectos, o null'),
          fecha: nulo('YYYY-MM-DD o null'),
        },
      },
    },
    reuniones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'detalle', 'cliente_id', 'cliente_nuevo', 'proyecto_id', 'fecha', 'hora', 'duracion', 'meet', 'email'],
        properties: {
          titulo: { type: 'string', description: 'Asunto de la reunión, p. ej. «Revisión del IVA · Nova Hiring»' },
          detalle: { type: 'string', description: 'Orden del día o contexto, bien redactado (va en la invitación)' },
          cliente_id: nulo('id de la lista de clientes, o null'),
          cliente_nuevo: nulo('nombre exacto de un cliente de clientes_nuevos'),
          proyecto_id: nulo('id de la lista de proyectos, o null'),
          fecha: nulo('YYYY-MM-DD'),
          hora: nulo('HH:MM en 24 h, hora de España'),
          duracion: { type: 'integer', description: 'Minutos; 60 si no lo dice' },
          meet: { type: 'boolean', description: 'true salvo que diga presencial o por teléfono' },
          email: nulo('email del invitado si lo dice, bien escrito (p. ej. jorge@empresa.com); si no, null'),
        },
      },
    },
    clientes_nuevos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'tipo', 'pais', 'email', 'notas'],
        properties: { nombre: { type: 'string' }, tipo: nulo('SL, LLC, autónomo, particular…'), pais: nulo('país'), email: nulo('su email si lo dice, bien escrito; si no, null'), notas: nulo('lo que se sepa') },
      },
    },
    resumen: { type: 'string', description: 'Una frase corta confirmando lo creado' },
  },
}

function sistema(e: EntradaDictado) {
  const dia = new Date(e.hoy + 'T12:00:00Z').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return `Eres el asistente personal de Pablo, que dirige NomoTax (asesoría fiscal y contable para SL y autónomos españoles y para clientes internacionales: LLC americanas, no residentes…). Pablo te dicta por voz, de forma natural y desordenada, lo que tiene que hacer. Tú lo conviertes en tareas de su CRM, como lo haría un buen asistente: pensando qué quiere decir de verdad, no copiando sus palabras.

Hoy es ${dia} (${e.hoy}).

Cómo crear cada tarea:
- titulo: nombre concreto y accionable, que se entienda solo leyéndolo en una lista. Empieza por verbo en infinitivo. Máximo unas 8 palabras. Sin muletillas («vale», «eh», «necesito que me crees una tarea»), sin prioridad ni fecha. Puede incluir el cliente si ayuda (p. ej. «Agendar llamada con Diego Fernández por Airwallex»).
- detalle: redáctalo bien, en español claro y profesional, en 1-4 frases o viñetas cortas: qué hay que hacer, para qué y lo que haya dicho de contexto (importes, plataformas, personas, documentos). Si tiene pasos obvios, enuméralos. No inventes hechos que no haya dicho; puedes añadir un siguiente paso evidente.
- prioridad: la que diga. Si no la dice, dedúcela: alta si habla de urgente, hoy/mañana, plazo de Hacienda cercano o un cliente bloqueado; baja si es «cuando pueda» o algo interno sin prisa; si no, media.
- fecha: fecha límite si la dice o se deduce («el viernes» = el próximo viernes; «la semana que viene» = lunes de la próxima semana; «fin de mes» = último día del mes; plazos de modelos trimestrales = día 20 del mes siguiente al trimestre, salvo el 4T: 30 de enero). Si no hay ninguna pista, null.
- cliente_id: elige de la lista el cliente al que se refiere aunque lo diga a medias, con otro nombre comercial o mal transcrito por el reconocedor de voz (p. ej. «nova» = Nova Hiring SL). Si nombra a una persona o empresa que NO está en la lista y es claramente un cliente, añádela a clientes_nuevos y pon su nombre en cliente_nuevo (cliente_id = null). Si no hay cliente, ambos null.
- proyecto_id: si lo nombra o encaja claramente en uno de los proyectos activos (p. ej. un 303 del cuarto trimestre → «4T … España»; una tarea de una constitución en curso de ese cliente → ese proyecto).
- Si en un mismo dictado pide varias cosas distintas, crea varias tareas. Si solo pide dar de alta un cliente, tareas puede ir vacía.
- El reconocedor de voz comete errores: «nomotags» = NomoTax, «airwallex», «LLC», «EIN», «IRS», «modelo 303», etc. Corrígelos.

Reuniones (van a «reuniones», NO a tareas):
- Si pide agendar/programar/fijar una reunión, sesión, llamada o videollamada con día y hora (aunque la hora sea aproximada: «a las 5 de la tarde» = 17:00, «por la mañana» = 10:00), crea una reunión. Si no dice día ni hora («tengo que agendar una llamada con X»), es una tarea.
- titulo: asunto corto; incluye el cliente. detalle: qué se va a tratar, redactado para que lo lea el cliente en la invitación (sin notas internas).
- fecha y hora: deduce «mañana», «el jueves» (el próximo), «el lunes que viene»… duracion: la que diga («media hora» = 30), si no 60. meet: true salvo presencial o teléfono.
- email: si dice un correo, ponlo bien escrito. El reconocedor de voz lo transcribe raro: «arroba» = @, «punto» = ., «guion» = -, «guion bajo» = _, sin espacios y en minúsculas (p. ej. «jorge arroba nova hiring punto com» = jorge@novahiring.com). Si no dice correo, null.
- cliente_id / proyecto_id: igual que en las tareas. Si la reunión es con alguien que no está en la lista de clientes, añádelo a clientes_nuevos (con su email si lo dice) y pon su nombre en cliente_nuevo.

resumen: una frase corta tipo «2 tareas creadas para Nova Hiring» o «Reunión preparada con Xapa el jueves a las 11».`
}

// deno-lint-ignore no-explicit-any
export async function pensar(anthropic: any, e: EntradaDictado) {
  // Haiku 5.5: barato y rápido. Para volver a Opus: model 'claude-opus-5-5'.
  const r = await anthropic.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
    system: sistema(e),
    messages: [{
      role: 'user',
      content: `Clientes:\n${JSON.stringify(e.clientes)}\n\nProyectos activos:\n${JSON.stringify(e.proyectos)}\n\nDictado de Pablo:\n«${e.texto.trim()}»`,
    }],
  })
  if (r.stop_reason === 'refusal') throw new Error('Claude no ha podido procesar el dictado')
  const texto = r.content.find((b: { type: string }) => b.type === 'text')?.text
  if (!texto) throw new Error('Respuesta vacía')
  const out = JSON.parse(texto)
  // Seguridad: solo ids que existen
  const cs = new Set(e.clientes.map((c) => c.id)); const ps = new Set(e.proyectos.map((p) => p.id))
  for (const t of out.tareas) {
    if (t.cliente_id && !cs.has(t.cliente_id)) t.cliente_id = null
    if (t.proyecto_id && !ps.has(t.proyecto_id)) t.proyecto_id = null
    if (t.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(t.fecha)) t.fecha = null
  }
  const limpiarEmail = (m: unknown) => {
    const x = typeof m === 'string' ? m.replace(/\s+/g, '').toLowerCase() : ''
    return /^[^@]+@[^@]+\.[a-z]{2,}$/.test(x) ? x : null
  }
  for (const c of out.clientes_nuevos ?? []) c.email = limpiarEmail(c.email)
  out.reuniones ??= []
  for (const r of out.reuniones) {
    if (r.cliente_id && !cs.has(r.cliente_id)) r.cliente_id = null
    if (r.proyecto_id && !ps.has(r.proyecto_id)) r.proyecto_id = null
    if (r.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) r.fecha = null
    if (r.hora && !/^\d{1,2}:\d{2}$/.test(r.hora)) r.hora = null
    if (r.hora) r.hora = r.hora.padStart(5, '0')
    if (!(r.duracion > 0)) r.duracion = 60
    r.email = limpiarEmail(r.email)
  }
  return out as Resultado
}

export interface TareaDictada {
  titulo: string; detalle: string; prioridad: 'alta' | 'media' | 'baja'
  cliente_id: string | null; cliente_nuevo: string | null; proyecto_id: string | null; fecha: string | null
}
export interface ReunionDictada {
  titulo: string; detalle: string; cliente_id: string | null; cliente_nuevo: string | null; proyecto_id: string | null
  fecha: string | null; hora: string | null; duracion: number; meet: boolean; email: string | null
}
export interface Resultado {
  tareas: TareaDictada[]
  reuniones: ReunionDictada[]
  clientes_nuevos: { nombre: string; tipo: string | null; pais: string | null; email?: string | null; notas: string | null }[]
  resumen: string
}

// ---------- Google Calendar (vía el Apps Script de reservas) ----------
export const AGENDA_URL = 'https://script.google.com/macros/s/AKfycbzV2OYEZS3uIIHw5l8Xh8duZxgbzydO1ZdTsa6qtKR_sRxtNiZjF07rqmnIUyzjSmzAKQ/exec'

/** accion: 'crm_agendar' | 'crm_cancelar'. Devuelve lo que responda el Apps Script ({ ok, evento_id, meet… }). */
export async function agenda(secreto: string, datos: Record<string, unknown>) {
  if (!secreto) throw new Error('Falta CRM_AGENDA_SECRETO')
  const r = await fetch(AGENDA_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ ...datos, secreto }) })
  const t = await r.text()
  try { return JSON.parse(t) } catch { throw new Error('Google Calendar no responde bien') }
}
