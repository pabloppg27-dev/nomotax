// FUENTE de la Edge Function enviar-factura. NO se pega en Supabase:
// `node scripts/empaquetar-facturar.mjs enviar-factura` genera index.ts (un solo archivo) y ese es el que se pega.
//
// Envía una factura emitida por email al cliente de la empresa:
//   · Desde invoice@nomotax.io, con el nombre de la empresa («Empresa vía NomoTax»).
//   · Responder a: el email de respuestas de la empresa (profiles.email_respuesta) o el de su cuenta.
//     Así las respuestas le llegan a la empresa, no a NomoTax.
//   · PDF adjunto, generado aquí con el mismo diseño que la app (src/lib/pdfFactura.ts).
//   · Correo con el logo y el color de marca (src/lib/correoFactura.ts).
//
// Entrada (POST JSON, con la sesión del usuario):
//   { invoice_id, para: string[], cc?: string[], asunto, mensaje }   → factura
//   { quote_id,   para: string[], cc?: string[], asunto, mensaje }   → presupuesto
//
// Facturas: puede enviar quien puede emitir facturas de esa empresa (titular, asesor, administración con «ventas»;
// el comercial no), función SQL puede_emitir() de supabase/usuarios.sql.
// Presupuestos: quien tiene «ventas» (también el comercial), función SQL puede(). El envío queda en
// envios_factura (columna quote_id, supabase/envio-presupuestos.sql) y el presupuesto pasa a «Enviado».
//
// Correo: entra con info@nomotax.io (SMTP_USER / SMTP_PASSWORD, los de siempre) y envía como el alias
//   invoice@nomotax.io (FACTURAS_FROM). Si Hostinger no deja usar el alias, sale desde info@.
//   Con un buzón propio: SMTP_FACTURAS_USER + SMTP_FACTURAS_PASSWORD.
//   Opcionales: SMTP_HOST, FACTURAS_LIMITE_DIA (100).
//   Las respuestas van siempre a la empresa («Responder a»), salga desde donde salga.
//   Si la empresa ha conectado su propio correo (Configuración → Correo, smtp_empresas activo),
//   sale desde su correo y sin «vía NomoTax». Necesita el secreto SMTP_CLAVE (supabase/functions/_compartido/smtp.ts).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { construirPdf, type LogoPdf } from "../../../src/lib/pdfFactura";
import { MODO_PRUEBAS_FACTURAS } from "../../../src/lib/config";
import { htmlCorreoFactura, rellenar, textoCorreoFactura, type DatosFacturaCorreo } from "../../../src/lib/correoFactura";
import { cobroParaCorreo } from "../../../src/lib/cuentasBancarias";
import { htmlCorreoPlantilla, lenguaCorreo, rellenarVars, textoCorreoPlantilla, variablesPresupuesto } from "../../../src/lib/plantillasCorreo";
import type { Emisor, Invoice, Quote } from "../../../src/lib/types";
import { explicarErrorSmtp, smtpActivo, transporte as transporteSmtp } from "../_compartido/smtp";

const MAX_DESTINATARIOS = 5;
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/** Sin saltos de línea ni caracteres de control (cabeceras del correo) */
const linea = (s: string) => s.replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim();

function emails(v: unknown): string[] | null {
  const lista = (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : [])
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  if (lista.some((e) => !EMAIL.test(e) || e.length > 254)) return null;
  return [...new Set(lista)];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
  const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!publica || !secreta) return json({ error: "Faltan las claves de Supabase" }, 500);

  const asUser = createClient(url, publica, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  const user = userData?.user;
  if (!user) return json({ error: "Sesión no válida" }, 401);
  const admin = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: { invoice_id?: string; quote_id?: string; para?: unknown; cc?: unknown; asunto?: string; mensaje?: string; logo?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }

  if (body.quote_id && !body.invoice_id) return enviarPresupuesto(body, user.id, asUser, admin);

  // ------------------------------------------------ Factura y permisos
  if (!body.invoice_id || !/^[0-9a-f-]{36}$/i.test(body.invoice_id)) return json({ error: "Falta la factura" }, 400);
  // Con la sesión del usuario: si no la puede ver (reglas de acceso), no existe para él
  const { data: factura } = await asUser.from("invoices").select("*").eq("id", body.invoice_id).maybeSingle();
  if (!factura) return json({ error: "Factura no encontrada" }, 404);
  const inv = factura as Invoice;
  if (inv.estado === "borrador" || !inv.numero) return json({ error: "Solo se pueden enviar facturas emitidas" }, 400);
  if (inv.origen !== "app") return json({ error: "Esta factura no se ha hecho en la app" }, 400);

  const { data: puede, error: ePuede } = await asUser.rpc("puede_emitir", { cuenta: inv.owner_id });
  let autorizado = puede === true;
  if (ePuede) {
    // Sin supabase/usuarios.sql: el titular o el asesor
    const { data: yo } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    autorizado = user.id === inv.owner_id || yo?.role === "advisor";
  }
  if (!autorizado) return json({ error: "No puedes enviar facturas de esta empresa" }, 403);

  // ------------------------------------------------ Destinatarios y texto
  const para = emails(body.para);
  const cc = emails(body.cc ?? []);
  if (!para || !cc) return json({ error: "Hay algún email que no es válido" }, 400);
  if (!para.length) return json({ error: "Indica a quién se envía" }, 400);
  if (para.length + cc.length > MAX_DESTINATARIOS) return json({ error: `Como máximo ${MAX_DESTINATARIOS} destinatarios` }, 400);
  const asuntoRaw = linea(String(body.asunto ?? ""));
  const mensajeRaw = String(body.mensaje ?? "").replace(/\r\n/g, "\n").trim();
  if (!asuntoRaw || asuntoRaw.length > 200) return json({ error: "El asunto tiene que tener entre 1 y 200 caracteres" }, 400);
  if (!mensajeRaw || mensajeRaw.length > 5000) return json({ error: "El mensaje tiene que tener entre 1 y 5.000 caracteres" }, 400);

  // Límite diario por empresa (que nadie use el remitente para mandar correo masivo)
  const limite = Number(Deno.env.get("FACTURAS_LIMITE_DIA") ?? 100);
  const { count } = await admin
    .from("envios_factura")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", inv.owner_id)
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if ((count ?? 0) >= limite) return json({ error: `Has llegado al límite de ${limite} envíos en 24 horas. Escríbenos si necesitas más.` }, 429);

  // ------------------------------------------------ Empresa, PDF y correo
  const { data: empresaPerfil } = await admin.from("profiles").select("*").eq("id", inv.owner_id).single();
  if (!empresaPerfil) return json({ error: "Empresa no encontrada" }, 404);
  const empresa = linea(empresaPerfil.nombre_comercial || empresaPerfil.nombre || empresaPerfil.email || "Empresa");
  const responder = (empresaPerfil.email_respuesta || empresaPerfil.email || "").trim().toLowerCase();

  const emisorPdf = (inv.emisor ?? empresaPerfil) as Emisor;
  // El logo lo manda la app ya reducido y en JPEG (src/lib/pdf.ts → logoParaEnvio). Aquí no se procesa ningún PNG:
  // descodificarlo agotaba la CPU de la función (error 546). Sin logo válido, el PDF y el correo salen sin él.
  const logo = logoDeLaApp(body.logo);
  const { doc, nombre: archivo } = await construirPdf(
    "factura",
    inv,
    emisorPdf,
    { color: empresaPerfil.color_marca, nombreComercial: empresaPerfil.nombre_comercial },
    logo?.pdf ?? null,
    MODO_PRUEBAS_FACTURAS,
  );
  const pdf = new Uint8Array(doc.output("arraybuffer"));

  // Factura en otra moneda (USD, GBP…): importes en esa moneda y las cuentas elegidas (src/lib/cuentasBancarias.ts)
  const cobro = cobroParaCorreo(inv, emisorPdf);
  const enEuros = cobro.moneda === "EUR";
  const datos: DatosFacturaCorreo = {
    cliente: inv.cliente?.nombre ?? null,
    numero: inv.numero,
    fecha: inv.fecha,
    vencimiento: inv.vencimiento,
    total: enEuros ? Number(inv.total) : cobro.total,
    empresa,
    pais: inv.cliente?.pais ?? null,
    lineas: enEuros ? inv.lineas : cobro.lineas,
    irpf_pct: Number(inv.irpf_pct),
    moneda: cobro.moneda,
  };
  // Por si quedó alguna {variable} sin cambiar
  const asunto = linea(rellenar(asuntoRaw, datos));
  const mensaje = rellenar(mensajeRaw, datos);
  const diseno = {
    empresa,
    color: empresaPerfil.color_marca,
    cabecera: empresaPerfil.color_cabecera ?? null,
    logo: logo ? "cid:logo-empresa" : null,
    respuesta: responder || null,
    telefono: emisorPdf.telefono ?? empresaPerfil.telefono ?? null,
    iban: cobro.pago,
    qr: cobro.qr,
    rectificativa: inv.tipo === "rectificativa",
  };

  // ¿La empresa tiene su propio correo conectado? (Configuración → Correo, supabase/correo-empresa.sql)
  let propioSmtp: Awaited<ReturnType<typeof smtpActivo>> = null;
  try {
    propioSmtp = await smtpActivo(admin, inv.owner_id);
  } catch (e) {
    // No se puede leer la contraseña (p. ej. falta SMTP_CLAVE): mejor avisar que enviar desde otro sitio
    console.error("enviar-factura: SMTP de la empresa:", e instanceof Error ? e.message : e);
    return json({ error: "No se ha podido usar tu correo de envío. Revisa Configuración → Correo." }, 500);
  }

  const mail = (desde: { name: string; address: string }) => ({
    from: desde,
    ...(responder && responder !== desde.address ? { replyTo: { name: empresa, address: responder } } : {}),
    to: para,
    ...(cc.length ? { cc } : {}),
    ...(empresaPerfil.correo_copia && responder && !para.includes(responder) && !cc.includes(responder) ? { bcc: responder } : {}),
    subject: asunto,
    text: textoCorreoFactura(mensaje, datos, diseno),
    html: htmlCorreoFactura(mensaje, datos, diseno),
    attachments: [
      { filename: archivo, content: pdf, contentType: "application/pdf" },
      ...(logo ? [{ filename: `logo.${logo.ext}`, content: logo.bytes, contentType: logo.tipo, cid: "logo-empresa" }] : []),
    ],
  });

  let errorEnvio: string | null = null;
  let errorParaUsuario = "No se ha podido enviar el correo. Prueba otra vez en unos minutos.";
  let remitente: string;

  if (propioSmtp) {
    // Desde el correo de la empresa, sin «vía NomoTax»
    const c = propioSmtp.config;
    remitente = c.remitente_email;
    try {
      await transporteSmtp(c, propioSmtp.pass).sendMail(mail({ name: c.remitente_nombre || empresa, address: c.remitente_email }));
    } catch (e) {
      errorEnvio = e instanceof Error ? e.message : String(e);
      errorParaUsuario = `Tu servidor de correo no ha enviado la factura. ${explicarErrorSmtp(e)}`;
      await admin.from("smtp_empresas").update({ ultimo_error: explicarErrorSmtp(e) }).eq("owner_id", inv.owner_id);
    }
  } else {
    // Con NomoTax: buzón propio de facturas (SMTP_FACTURAS_PASSWORD) o info@ enviando como FACTURAS_FROM
    const propio = Deno.env.get("SMTP_FACTURAS_PASSWORD");
    const usuario = propio ? (Deno.env.get("SMTP_FACTURAS_USER") ?? "invoice@nomotax.io") : (Deno.env.get("SMTP_USER") ?? "info@nomotax.io");
    const pass = propio ?? Deno.env.get("SMTP_PASSWORD");
    if (!pass) return json({ error: "Falta configurar el correo de envío (SMTP_PASSWORD)" }, 500);
    const alias = (Deno.env.get("FACTURAS_FROM") ?? "invoice@nomotax.io").trim().toLowerCase();
    const t = nodemailer.createTransport({ host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com", port: 465, secure: true, auth: { user: usuario, pass } });
    const enviar = (desde: string) => t.sendMail(mail({ name: `${empresa} vía NomoTax`, address: desde }));
    remitente = alias;
    try {
      await enviar(alias);
    } catch (e) {
      // Si falla con un remitente que no es el buzón (Hostinger no deja enviar como un alias: probado el 17/11/2026),
      // se reintenta desde el buzón con el que se entra. Las respuestas van igual a la empresa.
      if (alias !== usuario.toLowerCase()) {
        console.warn(`enviar-factura: no se ha podido enviar como ${alias}, se reintenta desde ${usuario}: ${e instanceof Error ? e.message : e}`);
        remitente = usuario;
        try {
          await enviar(usuario);
        } catch (e2) {
          errorEnvio = e2 instanceof Error ? e2.message : String(e2);
        }
      } else {
        errorEnvio = e instanceof Error ? e.message : String(e);
      }
    }
  }

  await admin.from("envios_factura").insert({
    owner_id: inv.owner_id,
    invoice_id: inv.id,
    enviado_por: user.id,
    para,
    cc,
    asunto,
    error: errorEnvio,
  });
  if (errorEnvio) {
    console.error("enviar-factura:", errorEnvio);
    return json({ error: errorParaUsuario }, 502);
  }

  const enviadaAt = new Date().toISOString();
  await admin.from("invoices").update({ enviada_at: enviadaAt, enviada_a: [...para, ...cc].join(", ") }).eq("id", inv.id);
  return json({ ok: true, enviada_at: enviadaAt, enviada_a: [...para, ...cc].join(", "), remitente });
});

/** Logo JPEG (data URL) que manda la app. Se comprueba que es un JPEG pequeño; no se descodifica. */
function logoDeLaApp(v: unknown): { pdf: LogoPdf; bytes: Uint8Array; tipo: string; ext: string } | null {
  if (!v || typeof v !== "object") return null;
  const { dataUrl, w, h } = v as { dataUrl?: unknown; w?: unknown; h?: unknown };
  const PREFIJO = "data:image/jpeg;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(PREFIJO) || dataUrl.length > 400_000) return null;
  const ancho = Math.round(Number(w));
  const alto = Math.round(Number(h));
  if (!(ancho >= 1 && ancho <= 600 && alto >= 1 && alto <= 600)) return null;
  try {
    const bin = atob(dataUrl.slice(PREFIJO.length));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // no es un JPEG
    return { pdf: { dataUrl, formato: "JPEG", w: ancho, h: alto }, bytes, tipo: "image/jpeg", ext: "jpg" };
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
type Cliente = SupabaseClient<any, "public", any>;

/** Envía un presupuesto (mismo remitente, límite y registro que las facturas; correo con la plantilla de presupuestos) */
async function enviarPresupuesto(
  body: { quote_id?: string; para?: unknown; cc?: unknown; asunto?: string; mensaje?: string; logo?: unknown },
  userId: string,
  asUser: Cliente,
  admin: Cliente,
): Promise<Response> {
  // ------------------------------------------------ Presupuesto y permisos
  if (!body.quote_id || !/^[0-9a-f-]{36}$/i.test(body.quote_id)) return json({ error: "Falta el presupuesto" }, 400);
  const { data: presupuesto } = await asUser.from("quotes").select("*").eq("id", body.quote_id).maybeSingle();
  if (!presupuesto) return json({ error: "Presupuesto no encontrado" }, 404);
  const q = presupuesto as Quote;
  if (!q.numero) return json({ error: "Guarda el presupuesto antes de enviarlo" }, 400);

  const { data: puede, error: ePuede } = await asUser.rpc("puede", { cuenta: q.owner_id, modulo: "ventas" });
  let autorizado = puede === true;
  if (ePuede) {
    // Sin supabase/usuarios.sql: el titular o el asesor
    const { data: yo } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    autorizado = userId === q.owner_id || yo?.role === "advisor";
  }
  if (!autorizado) return json({ error: "No puedes enviar presupuestos de esta empresa" }, 403);

  // ------------------------------------------------ Destinatarios y texto
  const para = emails(body.para);
  const cc = emails(body.cc ?? []);
  if (!para || !cc) return json({ error: "Hay algún email que no es válido" }, 400);
  if (!para.length) return json({ error: "Indica a quién se envía" }, 400);
  if (para.length + cc.length > MAX_DESTINATARIOS) return json({ error: `Como máximo ${MAX_DESTINATARIOS} destinatarios` }, 400);
  const asuntoRaw = linea(String(body.asunto ?? ""));
  const mensajeRaw = String(body.mensaje ?? "").replace(/\r\n/g, "\n").trim();
  if (!asuntoRaw || asuntoRaw.length > 200) return json({ error: "El asunto tiene que tener entre 1 y 200 caracteres" }, 400);
  if (!mensajeRaw || mensajeRaw.length > 5000) return json({ error: "El mensaje tiene que tener entre 1 y 5.000 caracteres" }, 400);

  // Límite diario por empresa, compartido con las facturas
  const limite = Number(Deno.env.get("FACTURAS_LIMITE_DIA") ?? 100);
  const { count } = await admin
    .from("envios_factura")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", q.owner_id)
    .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if ((count ?? 0) >= limite) return json({ error: `Has llegado al límite de ${limite} envíos en 24 horas. Escríbenos si necesitas más.` }, 429);

  // ------------------------------------------------ Empresa, PDF y correo
  const { data: empresaPerfil } = await admin.from("profiles").select("*").eq("id", q.owner_id).single();
  if (!empresaPerfil) return json({ error: "Empresa no encontrada" }, 404);
  const empresa = linea(empresaPerfil.nombre_comercial || empresaPerfil.nombre || empresaPerfil.email || "Empresa");
  const responder = (empresaPerfil.email_respuesta || empresaPerfil.email || "").trim().toLowerCase();

  // Como en la app (Descargar PDF): el emisor es el perfil actual de la empresa
  const emisorPdf = empresaPerfil as Emisor;
  const logo = logoDeLaApp(body.logo);
  const { doc, nombre: archivo } = await construirPdf(
    "presupuesto",
    q,
    emisorPdf,
    { color: empresaPerfil.color_marca, nombreComercial: empresaPerfil.nombre_comercial },
    logo?.pdf ?? null,
    MODO_PRUEBAS_FACTURAS,
  );
  const pdf = new Uint8Array(doc.output("arraybuffer"));

  const vars = { ...variablesPresupuesto(q, empresa), archivo };
  const asunto = linea(rellenarVars(asuntoRaw, vars));
  const mensaje = rellenarVars(mensajeRaw, vars);
  const diseno = {
    empresa,
    color: empresaPerfil.color_marca,
    cabecera: empresaPerfil.color_cabecera ?? null,
    logo: logo ? "cid:logo-empresa" : null,
    respuesta: responder || null,
    telefono: empresaPerfil.telefono ?? null,
    lengua: lenguaCorreo(q.cliente?.pais),
  };

  let propioSmtp: Awaited<ReturnType<typeof smtpActivo>> = null;
  try {
    propioSmtp = await smtpActivo(admin, q.owner_id);
  } catch (e) {
    console.error("enviar-factura (presupuesto): SMTP de la empresa:", e instanceof Error ? e.message : e);
    return json({ error: "No se ha podido usar tu correo de envío. Revisa Configuración → Correo." }, 500);
  }

  const mail = (desde: { name: string; address: string }) => ({
    from: desde,
    ...(responder && responder !== desde.address ? { replyTo: { name: empresa, address: responder } } : {}),
    to: para,
    ...(cc.length ? { cc } : {}),
    ...(empresaPerfil.correo_copia && responder && !para.includes(responder) && !cc.includes(responder) ? { bcc: responder } : {}),
    subject: asunto,
    text: textoCorreoPlantilla("presupuesto", mensaje, vars, diseno),
    html: htmlCorreoPlantilla("presupuesto", mensaje, vars, diseno),
    attachments: [
      { filename: archivo, content: pdf, contentType: "application/pdf" },
      ...(logo ? [{ filename: `logo.${logo.ext}`, content: logo.bytes, contentType: logo.tipo, cid: "logo-empresa" }] : []),
    ],
  });

  const r = await enviarCorreo(admin, q.owner_id, propioSmtp, empresa, mail, "el presupuesto");
  if ("respuesta" in r) return r.respuesta;

  // Registro (sin supabase/envio-presupuestos.sql no hay columna quote_id: el envío sale igual, sin registro)
  const { error: eReg } = await admin.from("envios_factura").insert({
    owner_id: q.owner_id,
    invoice_id: null,
    quote_id: q.id,
    enviado_por: userId,
    para,
    cc,
    asunto,
    error: r.error,
  });
  if (eReg) console.warn("enviar-factura (presupuesto): sin registro del envío (¿falta envio-presupuestos.sql?):", eReg.message);
  if (r.error) {
    console.error("enviar-factura (presupuesto):", r.error);
    return json({ error: r.paraUsuario }, 502);
  }

  const enviadoAt = new Date().toISOString();
  const enviadoA = [...para, ...cc].join(", ");
  // El estado, aparte: así cambia aunque falten las columnas de envio-presupuestos.sql
  const estado = q.estado === "borrador" ? "enviado" : q.estado;
  if (estado !== q.estado) await admin.from("quotes").update({ estado }).eq("id", q.id);
  await admin.from("quotes").update({ enviado_at: enviadoAt, enviado_a: enviadoA }).eq("id", q.id);
  return json({ ok: true, enviado_at: enviadoAt, enviado_a: enviadoA, estado, remitente: r.remitente });
}

/**
 * Manda el correo desde el SMTP propio de la empresa o desde NomoTax (igual que las facturas).
 * Devuelve el remitente usado y el error (si lo hubo), o una respuesta si falta configuración.
 */
async function enviarCorreo(
  admin: Cliente,
  ownerId: string,
  propioSmtp: Awaited<ReturnType<typeof smtpActivo>>,
  empresa: string,
  // deno-lint-ignore no-explicit-any
  mail: (desde: { name: string; address: string }) => any,
  queEs: string,
): Promise<{ remitente: string; error: string | null; paraUsuario: string } | { respuesta: Response }> {
  let error: string | null = null;
  let paraUsuario = "No se ha podido enviar el correo. Prueba otra vez en unos minutos.";
  let remitente: string;
  if (propioSmtp) {
    const c = propioSmtp.config;
    remitente = c.remitente_email;
    try {
      await transporteSmtp(c, propioSmtp.pass).sendMail(mail({ name: c.remitente_nombre || empresa, address: c.remitente_email }));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      paraUsuario = `Tu servidor de correo no ha enviado ${queEs}. ${explicarErrorSmtp(e)}`;
      await admin.from("smtp_empresas").update({ ultimo_error: explicarErrorSmtp(e) }).eq("owner_id", ownerId);
    }
  } else {
    const propio = Deno.env.get("SMTP_FACTURAS_PASSWORD");
    const usuario = propio ? (Deno.env.get("SMTP_FACTURAS_USER") ?? "invoice@nomotax.io") : (Deno.env.get("SMTP_USER") ?? "info@nomotax.io");
    const pass = propio ?? Deno.env.get("SMTP_PASSWORD");
    if (!pass) return { respuesta: json({ error: "Falta configurar el correo de envío (SMTP_PASSWORD)" }, 500) };
    const alias = (Deno.env.get("FACTURAS_FROM") ?? "invoice@nomotax.io").trim().toLowerCase();
    const t = nodemailer.createTransport({ host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com", port: 465, secure: true, auth: { user: usuario, pass } });
    const enviar = (desde: string) => t.sendMail(mail({ name: `${empresa} vía NomoTax`, address: desde }));
    remitente = alias;
    try {
      await enviar(alias);
    } catch (e) {
      // Hostinger no deja enviar como un alias: se reintenta desde el buzón con el que se entra
      if (alias !== usuario.toLowerCase()) {
        console.warn(`enviar-factura: no se ha podido enviar como ${alias}, se reintenta desde ${usuario}: ${e instanceof Error ? e.message : e}`);
        remitente = usuario;
        try {
          await enviar(usuario);
        } catch (e2) {
          error = e2 instanceof Error ? e2.message : String(e2);
        }
      } else {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }
  return { remitente, error, paraUsuario };
}
