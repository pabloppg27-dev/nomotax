// FUENTE de la Edge Function smtp-config. NO se pega en Supabase:
// `node scripts/empaquetar-facturar.mjs smtp-config` genera index.ts (un solo archivo) y ese es el que se pega.
//
// Configuración → Correo: la empresa conecta su propio servidor SMTP.
// Entrada (POST JSON, con la sesión del usuario):
//   { accion: "guardar", cuenta_id, proveedor, host, puerto, seguridad, usuario, password?, remitente_email, remitente_nombre? }
//        → guarda (la contraseña cifrada; si no viene, se queda la que había) y la prueba enseguida
//   { accion: "probar", cuenta_id }        → conecta y envía un correo de prueba a quien la usa; si sale bien, la activa
//   { accion: "desactivar", cuenta_id }    → los correos vuelven a salir con NomoTax
//   { accion: "borrar", cuenta_id }        → borra la configuración y la contraseña
// Puede quien gestiona los datos de la empresa: titular, asesor o admin con «empresa» (función SQL puede()).
// Secreto: SMTP_CLAVE (para cifrar las contraseñas). Tablas: supabase/correo-empresa.sql.

import { createClient } from "@supabase/supabase-js";
import { cifrar, descifrar, explicarErrorSmtp, hostPermitido, transporte, type SmtpEmpresa } from "../_compartido/smtp";

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

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const linea = (s: unknown, max = 200) => String(s ?? "").replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim().slice(0, max);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);

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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  const cuenta = String(body.cuenta_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(cuenta)) return json({ error: "Falta la empresa" }, 400);

  // Permiso: datos de la empresa
  const { data: puede, error: ePuede } = await asUser.rpc("puede", { cuenta, modulo: "empresa" });
  let autorizado = puede === true;
  if (ePuede) {
    const { data: yo } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    autorizado = user.id === cuenta || yo?.role === "advisor";
  }
  if (!autorizado) return json({ error: "No puedes cambiar el correo de esta empresa" }, 403);

  const accion = String(body.accion ?? "");

  if (accion === "borrar") {
    const { error } = await admin.from("smtp_empresas").delete().eq("owner_id", cuenta);
    if (error) return json({ error: "No se ha podido borrar" }, 500);
    return json({ ok: true });
  }

  if (accion === "desactivar") {
    await admin.from("smtp_empresas").update({ activo: false, updated_at: new Date().toISOString() }).eq("owner_id", cuenta);
    return json({ ok: true, activo: false });
  }

  if (accion === "guardar") {
    const host = linea(body.host, 253).toLowerCase();
    const puerto = Number(body.puerto);
    const seguridad = body.seguridad === "starttls" ? "starttls" : "ssl";
    const usuario = linea(body.usuario, 254);
    const remitente = linea(body.remitente_email, 254).toLowerCase();
    const nombre = linea(body.remitente_nombre, 120) || null;
    const password = typeof body.password === "string" ? body.password : "";
    if (!hostPermitido(host)) return json({ error: "Ese servidor de correo no es válido" }, 400);
    if (![25, 465, 587, 2525].includes(puerto)) return json({ error: "El puerto tiene que ser 465, 587, 25 o 2525" }, 400);
    if (!usuario) return json({ error: "Falta el usuario" }, 400);
    if (!EMAIL.test(remitente)) return json({ error: "El email del remitente no es válido" }, 400);
    if (password.length > 500) return json({ error: "Contraseña demasiado larga" }, 400);

    const { data: antes } = await admin.from("smtp_claves").select("owner_id").eq("owner_id", cuenta).maybeSingle();
    if (!password && !antes) return json({ error: "Falta la contraseña" }, 400);

    const { error: eCfg } = await admin.from("smtp_empresas").upsert({
      owner_id: cuenta,
      proveedor: linea(body.proveedor, 40) || "otro",
      host,
      puerto,
      seguridad,
      usuario,
      remitente_email: remitente,
      remitente_nombre: nombre,
      activo: false,
      verificado_at: null,
      ultimo_error: null,
      updated_at: new Date().toISOString(),
    });
    if (eCfg) return json({ error: `No se ha podido guardar: ${eCfg.message}` }, 500);
    if (password) {
      try {
        const { error: eClave } = await admin.from("smtp_claves").upsert({ owner_id: cuenta, clave_cifrada: await cifrar(password) });
        if (eClave) throw new Error(eClave.message);
      } catch (e) {
        return json({ error: `No se ha podido guardar la contraseña: ${e instanceof Error ? e.message : e}` }, 500);
      }
    }
    // Y se prueba enseguida
  } else if (accion !== "probar") {
    return json({ error: "Acción desconocida" }, 400);
  }

  // ------------------------------------------------ Probar: conectar y enviar un correo de prueba
  const { data: cfg } = await admin.from("smtp_empresas").select("*").eq("owner_id", cuenta).maybeSingle();
  const { data: clave } = await admin.from("smtp_claves").select("clave_cifrada").eq("owner_id", cuenta).maybeSingle();
  if (!cfg || !clave) return json({ error: "Primero guarda la configuración" }, 400);
  const c = cfg as SmtpEmpresa;
  const destino = (user.email ?? "").toLowerCase();

  let error: string | null = null;
  try {
    const t = transporte(c, await descifrar(clave.clave_cifrada as string));
    await t.verify();
    if (destino) {
      await t.sendMail({
        from: { name: c.remitente_nombre || c.remitente_email, address: c.remitente_email },
        to: destino,
        subject: "Prueba de correo · NomoTax",
        text: `Tu correo está conectado.\n\nA partir de ahora, las facturas que envíes desde NomoTax saldrán desde ${c.remitente_email}.\n\n— NomoTax`,
        html: `<div style="font:15px/1.6 Helvetica,Arial,sans-serif;color:#111110;max-width:520px"><p><strong>Tu correo está conectado.</strong></p><p>A partir de ahora, las facturas que envíes desde NomoTax saldrán desde <strong>${esc(c.remitente_email)}</strong>.</p><p style="color:#9a9a94;font-size:12px">NomoTax · nomotax.io</p></div>`,
      });
    }
  } catch (e) {
    console.error("smtp-config:", e instanceof Error ? e.message : e);
    error = e instanceof Error && e.message.includes("SMTP_CLAVE") ? e.message : explicarErrorSmtp(e);
  }

  const ahora = new Date().toISOString();
  await admin
    .from("smtp_empresas")
    .update(error ? { activo: false, ultimo_error: error, updated_at: ahora } : { activo: true, verificado_at: ahora, ultimo_error: null, updated_at: ahora })
    .eq("owner_id", cuenta);
  if (error) return json({ ok: false, activo: false, error });
  return json({ ok: true, activo: true, enviado_a: destino || null });
});
