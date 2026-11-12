// Lee una nómina (PDF) con Claude y devuelve sus importes. Solo para el asesor.
// Entrada (POST JSON): { path: string }  → ruta del PDF en el bucket "documentos"
// Secreto necesario: ANTHROPIC_API_KEY

import Anthropic from "npm:@anthropic-ai/sdk@^1.8.0";
import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import { encodeBase64 } from "jsr:@std/encoding@^1/base64";

function primeraDeJson(nombre: string): string | undefined {
  const raw = Deno.env.get(nombre);
  if (!raw) return undefined;
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === "string") return obj;
    if (obj && typeof obj === "object") return obj.default ?? Object.values(obj)[0];
  } catch {
    return raw;
  }
  return undefined;
}

function clavePublica(req: Request): string {
  const k = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
  if (!k) throw new Error("Falta la clave pública de Supabase");
  return k;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 15 * 1024 * 1024;

// Máximo 16 campos con anyOf (límite de la API). Textos desconocidos → "".
const texto = { type: "string" };
const numOpcional = { anyOf: [{ type: "number" }, { type: "null" }] };
const enteroOpcional = { anyOf: [{ type: "integer" }, { type: "null" }] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "es_nomina", "trabajador", "empresa", "periodo_mes", "periodo_anio", "tipo",
    "total_devengado", "total_deducciones", "liquido", "irpf_importe", "irpf_pct",
    "ss_trabajador", "ss_empresa", "variables", "conceptos_variables", "notas",
  ],
  properties: {
    es_nomina: { type: "boolean" },
    trabajador: {
      type: "object",
      additionalProperties: false,
      required: ["nombre", "dni", "nss"],
      properties: { nombre: texto, dni: texto, nss: texto },
    },
    empresa: texto,
    periodo_mes: enteroOpcional,
    periodo_anio: enteroOpcional,
    tipo: { type: "string", enum: ["mensual", "extra", "finiquito", "atrasos", "otro"] },
    total_devengado: numOpcional,
    total_deducciones: numOpcional,
    liquido: numOpcional,
    irpf_importe: numOpcional,
    irpf_pct: numOpcional,
    ss_trabajador: numOpcional,
    ss_empresa: numOpcional,
    variables: numOpcional,
    conceptos_variables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concepto", "importe"],
        properties: { concepto: texto, importe: { type: "number" } },
      },
    },
    notas: texto,
  },
};

const SYSTEM = [
  "Eres el asistente laboral de NomoTax, una asesoría. Extraes los importes de recibos de salarios (nóminas) españoles.",
  "",
  "Reglas:",
  "- Copia los datos tal como aparecen. No inventes: si un texto no aparece, devuelve \"\" (cadena vacía); si es un importe, null.",
  "- Importes con punto decimal y sin símbolo (1.234,56 → 1234.56).",
  "- DNI/NIE y NSS sin espacios, puntos ni guiones, en mayúsculas.",
  "- periodo_mes (1-12) y periodo_anio: el periodo de liquidación de la nómina.",
  "- tipo: mensual, extra (paga extraordinaria separada), finiquito, atrasos u otro.",
  "- total_devengado: el total devengado (bruto) del recibo.",
  "- total_deducciones: el total a deducir.",
  "- liquido: el líquido total a percibir.",
  "- irpf_importe e irpf_pct: la retención de IRPF y su porcentaje.",
  "- ss_trabajador: suma de las aportaciones del trabajador a la Seguridad Social (contingencias comunes, desempleo, formación profesional, MEI…), sin el IRPF.",
  "- ss_empresa: suma de la aportación de la empresa a la Seguridad Social (contingencias comunes, AT y EP, desempleo, FOGASA, formación profesional, MEI…). Suele aparecer al pie, en «aportación de la empresa». Si solo aparecen bases y tipos, calcula las cuotas y dilo en notas.",
  "- variables: suma de los conceptos no fijos del mes (incentivos, comisiones, horas extraordinarias, bonus, primas, objetivos). 0 si no hay.",
  "- conceptos_variables: cada uno de esos conceptos con su importe.",
  "- es_nomina: false si el documento no es una nómina (explícalo en notas).",
  "- notas: dudas que deba revisar una persona; \"\" si no hay.",
].join("\n");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function vaciosANull(v: unknown): unknown {
  if (v === "") return null;
  if (Array.isArray(v)) return v.map(vaciosANull);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, vaciosANull(x)]));
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, clavePublica(req), {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "Sesión no válida" }, 401);

  const { data: me } = await supabase.from("profiles").select("role").eq("id", userData.user.id).single();
  if (me?.role !== "advisor") return json({ error: "Solo el asesor puede leer nóminas" }, 403);

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  if (!body.path) return json({ error: "Falta el archivo" }, 400);

  const { data: file, error: dlError } = await supabase.storage.from("documentos").download(body.path);
  if (dlError || !file) return json({ error: "No se ha podido abrir el archivo" }, 404);
  if (file.size > MAX_BYTES) return json({ error: "El archivo supera los 15 MB" }, 413);
  if (!body.path.toLowerCase().endsWith(".pdf")) return json({ error: "La nómina tiene que ser un PDF" }, 415);

  const data = encodeBase64(new Uint8Array(await file.arrayBuffer()));
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  try {
    const response = await anthropic.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
            { type: "text", text: "Extrae los datos de esta nómina." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return json({ error: "No se ha podido leer esta nómina." }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "La nómina es demasiado larga." }, 422);

    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "Respuesta vacía" }, 502);
    return json({ datos: vaciosANull(JSON.parse(text.text)) });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "La clave de Anthropic no es válida" }, 500);
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Demasiadas nóminas a la vez. Espera un minuto." }, 429);
    if (err instanceof Anthropic.BadRequestError) {
      console.error("Bad request", err.status, err.message);
      return json({ error: "La nómina no se ha podido procesar." }, 400);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic", err.status, err.message);
      return json({ error: "El servicio de lectura no está disponible ahora mismo." }, 502);
    }
    if (err instanceof SyntaxError) return json({ error: "La lectura ha devuelto datos no válidos." }, 502);
    console.error(err);
    return json({ error: "Error inesperado al leer la nómina" }, 500);
  }
});
