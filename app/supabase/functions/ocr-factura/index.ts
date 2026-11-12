// Lee una factura (PDF o foto) con Claude y devuelve sus datos estructurados.
// Entrada (POST JSON): { path: string, tipo: "gasto" | "emitida", owner_id?: string }
//   path → ruta del archivo en el bucket "documentos" (ya subido por el cliente)
// Secreto necesario: ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets)

import Anthropic from "npm:@anthropic-ai/sdk@^1.8.0";
import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import { encodeBase64 } from "jsr:@std/encoding@^1/base64";

// Claves de Supabase dentro de las Edge Functions.
// Sirve tanto con las claves antiguas (anon / service_role) como con las nuevas
// (publishable / secret), que Supabase expone como JSON en SUPABASE_*_KEYS.

function primeraDeJson(nombre: string): string | undefined {
  const raw = Deno.env.get(nombre)
  if (!raw) return undefined
  try {
    const obj = JSON.parse(raw)
    if (typeof obj === "string") return obj
    if (obj && typeof obj === "object") return obj.default ?? Object.values(obj)[0]
  } catch {
    return raw
  }
  return undefined
}

/** Clave pública: la que envía la app en la cabecera apikey, o la del entorno */
function clavePublica(req: Request): string {
  const k = req.headers.get("apikey") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    primeraDeJson("SUPABASE_PUBLISHABLE_KEYS")
  if (!k) throw new Error("Falta la clave pública de Supabase")
  return k
}


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIAS = [
  "compras", "suministros", "alquiler", "software", "material", "profesionales",
  "publicidad", "viajes", "vehiculo", "formacion", "seguros", "bancos", "tributos", "otros",
];

// Tipos de inmovilizado (las mismas claves que usa la app para amortizar)
const TIPOS_INMOVILIZADO = [
  "ninguno", "equipos_informaticos", "aplicaciones", "mobiliario", "maquinaria", "utillaje",
  "instalaciones", "transporte", "construcciones", "otro",
];

const MAX_BYTES = 15 * 1024 * 1024;

// Límite de la API: máximo 16 campos con anyOf. Los textos desconocidos vienen como "" (luego se pasan a null)
const texto = { type: "string" };
const numOpcional = { anyOf: [{ type: "number" }, { type: "null" }] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "es_factura", "tipo_documento", "emisor", "receptor", "numero", "fecha", "vencimiento",
    "concepto", "desglose_iva", "base_total", "cuota_iva_total", "irpf_pct", "cuota_irpf",
    "total", "moneda", "categoria", "naturaleza", "tipo_inmovilizado", "notas",
  ],
  properties: {
    es_factura: { type: "boolean" },
    tipo_documento: { type: "string", enum: ["factura", "factura_simplificada", "rectificativa", "otro"] },
    emisor: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "nif", "direccion"],
      properties: { nombre: texto, nif: texto, direccion: texto },
    },
    receptor: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "nif", "direccion"],
      properties: { nombre: texto, nif: texto, direccion: texto },
    },
    numero: texto,
    fecha: texto,
    vencimiento: texto,
    concepto: texto,
    desglose_iva: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["base", "tipo", "cuota"],
        properties: { base: { type: "number" }, tipo: { type: "number" }, cuota: { type: "number" } },
      },
    },
    base_total: numOpcional,
    cuota_iva_total: numOpcional,
    irpf_pct: numOpcional,
    cuota_irpf: numOpcional,
    total: numOpcional,
    moneda: texto,
    categoria: { type: "string", enum: CATEGORIAS },
    naturaleza: { type: "string", enum: ["gasto", "inversion"] },
    tipo_inmovilizado: { type: "string", enum: TIPOS_INMOVILIZADO },
    notas: texto,
  },
};

const SYSTEM = `Eres el asistente contable de NomoTax, una asesoría fiscal. Extraes los datos de facturas y tickets (sobre todo españoles, pero pueden ser de cualquier país) para registrarlos en la contabilidad de un cliente.

Reglas:
- Copia los datos tal como aparecen en el documento. No inventes nada: si un texto no aparece o no se lee, devuelve "" (cadena vacía); si es un importe, null.
- Importes: números con punto decimal, sin símbolo de moneda (1.234,56 € → 1234.56). Moneda en código ISO (EUR, USD…).
- Fechas en formato AAAA-MM-DD.
- NIF/CIF/VAT sin espacios ni guiones, en mayúsculas (B-12.345.678 → B12345678).
- desglose_iva: una entrada por cada tipo de IVA (o IGIC/IPSI) que aparezca, con su base, el tipo en % y la cuota. Si la factura está exenta o no lleva IVA, una entrada con tipo 0.
- Si un ticket solo muestra el total con IVA incluido y el tipo aplicado, calcula la base y la cuota, y dilo en "notas".
- irpf_pct y cuota_irpf: solo si la factura practica retención de IRPF; la cuota es positiva aunque reste en el total.
- total: el importe final a pagar de la factura.
- concepto: resumen breve (máximo 8 palabras) de lo que se factura.
- categoria: para gastos, la categoría contable que mejor encaje: compras (mercaderías y materias primas), suministros (luz, agua, gas, internet, teléfono), alquiler, software (software y suscripciones), material (material de oficina y equipos), profesionales (gestoría, abogados, consultores, freelance), publicidad (publicidad y marketing), viajes (transporte, alojamiento y dietas), vehiculo (combustible, reparaciones, parking, peajes), formacion, seguros, bancos (comisiones bancarias), tributos (impuestos y tasas), otros.
- naturaleza: "inversion" si lo comprado es un bien duradero que la empresa usará más de un año (ordenadores, móviles, tablets, monitores, impresoras, muebles, maquinaria, herramientas, vehículos, instalaciones y reformas del local, licencias de software de compra única); "gasto" si se consume en el año (suministros, servicios, suscripciones mensuales o anuales, reparaciones, material fungible, comidas, viajes…). Si dudas, "gasto" y explícalo en "notas".
- tipo_inmovilizado: si naturaleza es "inversion", el tipo de bien: equipos_informaticos (ordenadores, portátiles, móviles, tablets, monitores, impresoras), aplicaciones (software de compra única, web a medida), mobiliario, maquinaria, utillaje (herramientas), instalaciones (reformas, climatización, electricidad del local), transporte (vehículos), construcciones (edificios, locales), otro. Si es "gasto", "ninguno".
- es_factura: false si el documento no es una factura ni un ticket (por ejemplo, un presupuesto, un albarán o una foto sin relación). Explica el motivo en "notas".
- notas: solo si hay algo que deba revisar una persona (datos ilegibles, sumas que no cuadran, factura que parece emitida y no recibida…). Una sola frase corta y directa, máximo 15 palabras, sin repetir importes ni NIF. Ej.: "Parece una factura emitida, no recibida." "" si no hay dudas.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Convierte las cadenas vacías en null (lo que espera la app) */
function vaciosANull(v: unknown): unknown {
  if (v === "") return null;
  if (Array.isArray(v)) return v.map(vaciosANull);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, vaciosANull(x)]));
  }
  return v;
}

function mediaTypeFor(path: string, blobType: string): string | null {
  const t = blobType.toLowerCase();
  if (["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(t)) return t;
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  // Cliente con la sesión del usuario: el almacenamiento aplica sus permisos (RLS)
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, clavePublica(req), {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (userError || !userData.user) return json({ error: "Sesión no válida" }, 401);

  let body: { path?: string; tipo?: string; owner_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  const path = body.path;
  const tipo = body.tipo === "emitida" ? "emitida" : "gasto";
  if (!path) return json({ error: "Falta el archivo" }, 400);

  const { data: file, error: dlError } = await supabase.storage.from("documentos").download(path);
  if (dlError || !file) return json({ error: "No se ha podido abrir el archivo" }, 404);
  if (file.size > MAX_BYTES) return json({ error: "El archivo supera los 15 MB" }, 413);

  const mediaType = mediaTypeFor(path, file.type);
  if (!mediaType) return json({ error: "Formato no admitido. Sube un PDF, JPG, PNG o WEBP." }, 415);

  // Datos del titular de la cuenta, para distinguir emisor y receptor
  const ownerId = body.owner_id ?? userData.user.id;
  const { data: owner } = await supabase.from("profiles").select("nombre, nif").eq("id", ownerId).single();
  const titular = owner?.nombre || owner?.nif
    ? `${owner?.nombre ?? "(sin nombre)"}${owner?.nif ? `, NIF ${owner.nif}` : ""}`
    : "(sin datos fiscales todavía)";
  const contexto = tipo === "gasto"
    ? `Esta es una factura RECIBIDA (un gasto). El titular de la cuenta, que normalmente aparece como receptor, es: ${titular}.`
    : `Esta es una factura EMITIDA (un ingreso). El titular de la cuenta, que normalmente aparece como emisor, es: ${titular}. En "categoria" pon "otros".`;

  const data = encodeBase64(new Uint8Array(await file.arrayBuffer()));
  const fileBlock = mediaType === "application/pdf"
    ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
    : {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mediaType as "image/jpeg" | "image/png" | "image/webp", data },
    };

  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  try {
    const response = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA },
      },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [fileBlock, { type: "text", text: `${contexto}\nExtrae los datos de este documento.` }],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "No se ha podido leer este documento. Rellena los datos a mano." }, 422);
    }
    if (response.stop_reason === "max_tokens") {
      return json({ error: "El documento es demasiado largo para leerlo automáticamente." }, 422);
    }

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "Respuesta vacía" }, 502);

    const extraido = vaciosANull(JSON.parse(text.text));
    return json({
      datos: extraido,
      uso: { entrada: response.usage.input_tokens, salida: response.usage.output_tokens },
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "La clave de Anthropic no es válida (revisa ANTHROPIC_API_KEY)" }, 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "Demasiadas facturas a la vez. Espera un minuto y vuelve a intentarlo." }, 429);
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("Bad request", err.message);
      return json({ error: "El archivo no se ha podido procesar. Prueba con otra foto o el PDF original." }, 400);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic", err.status, err.message);
      return json({ error: "El servicio de lectura no está disponible ahora mismo." }, 502);
    }
    if (err instanceof SyntaxError) {
      return json({ error: "La lectura ha devuelto datos no válidos. Inténtalo otra vez." }, 502);
    }
    console.error(err);
    return json({ error: "Error inesperado al leer la factura" }, 500);
  }
});
