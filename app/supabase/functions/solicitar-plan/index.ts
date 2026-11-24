// Un cliente pide cambiar de plan desde el comparador del Área de clientes.
// Entrada (POST JSON): { plan: 'empresa_max' | ..., cuenta?: <id> }
//   cuenta: la cuenta para la que se pide (por defecto la propia). Si es otra, tiene que ser
//   una cuenta vinculada de quien lo pide (supabase/cuentas-titular.sql: mi_rol = 'titular').
// Envía un correo a pablo@nomotax.io desde info@nomotax.io (SMTP de Hostinger, secreto SMTP_PASSWORD).
// No cambia el plan: eso lo hace el asesor desde el perfil del cliente.

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import nodemailer from "npm:nodemailer@6.9.16";

const ASESOR = "pablo@nomotax.io";
const APP_URL = "https://clientes.nomotax.io";

const PLANES: Record<string, string> = {
  empresa_base: "Empresa Base (99€/mes)",
  empresa_smart: "Empresa Smart (149€/mes)",
  empresa_max: "Empresa Max (desde 249€/mes)",
  autonomo_core: "Autónomo Core (39€/mes)",
  autonomo_plus: "Autónomo Plus (59€/mes)",
  autonomo_pro: "Autónomo Pro (89€/mes)",
};

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  const clave = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
  if (!clave) return json({ error: "Falta la clave pública de Supabase" }, 500);
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, clave, { global: { headers: { Authorization: authHeader } } });

  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "Sesión no válida" }, 401);

  let body: { plan?: string; cuenta?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }
  const nuevo = body.plan ?? "";
  if (!PLANES[nuevo]) return json({ error: "Plan no válido" }, 400);

  // Para otra cuenta (una vinculada del mismo titular): solo si eres su titular
  const cuenta = body.cuenta && body.cuenta !== userData.user.id ? body.cuenta : userData.user.id;
  if (cuenta !== userData.user.id) {
    const { data: rol } = await asUser.rpc("mi_rol", { cuenta });
    if (rol !== "titular") return json({ error: "Solo el titular de la cuenta puede pedir un cambio de plan" }, 403);
  }

  const { data: perfil } = await asUser
    .from("profiles")
    .select("nombre, nif, email, telefono, plan")
    .eq("id", cuenta)
    .single();
  if (!perfil) return json({ error: "Perfil no encontrado" }, 404);
  if (perfil.plan === nuevo) return json({ error: "Ya tienes ese plan" }, 400);

  const pass = Deno.env.get("SMTP_PASSWORD");
  if (!pass) {
    console.error("Falta el secreto SMTP_PASSWORD (contraseña del buzón info@nomotax.io)");
    return json({ error: "No se ha podido enviar la solicitud. Escríbenos a info@nomotax.io" }, 500);
  }

  const cliente = perfil.nombre || perfil.email || userData.user.email || "Un cliente";
  const actual = perfil.plan ? PLANES[perfil.plan] ?? perfil.plan : "Sin plan asignado";
  const pedido = PLANES[nuevo];
  const email = perfil.email || userData.user.email || "";

  try {
    const t = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com",
      port: 465,
      secure: true,
      auth: { user: Deno.env.get("SMTP_USER") ?? "info@nomotax.io", pass },
    });
    await t.sendMail({
      from: '"NomoTax · Área de clientes" <info@nomotax.io>',
      to: ASESOR,
      replyTo: email || undefined,
      subject: `Cambio de plan: ${cliente} quiere ${pedido.split(" (")[0]}`,
      text: [
        `${cliente} ha solicitado un cambio de plan desde el Área de clientes.`,
        "",
        `Plan actual: ${actual}`,
        `Plan solicitado: ${pedido}`,
        "",
        `NIF: ${perfil.nif ?? "—"}`,
        `Email: ${email || "—"}`,
        `Teléfono: ${perfil.telefono ?? "—"}`,
        "",
        `Para cambiarlo: ${APP_URL}/asesor → entra en su cuenta → Configuración → Plan → Editar plan y cobro.`,
        "Responde a este correo para escribirle directamente.",
      ].join("\n"),
      html: `<div style="font:15px/1.6 Helvetica,Arial,sans-serif;color:#111110">
<p><strong>${esc(cliente)}</strong> ha solicitado un cambio de plan desde el Área de clientes.</p>
<table cellpadding="0" cellspacing="0" style="margin:12px 0;border-collapse:collapse">
<tr><td style="padding:4px 16px 4px 0;color:#6b6b66">Plan actual</td><td>${esc(actual)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b6b66">Plan solicitado</td><td><strong style="background:#CDF564;padding:2px 6px;border-radius:6px">${esc(pedido)}</strong></td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b6b66">NIF</td><td>${esc(perfil.nif ?? "—")}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b6b66">Email</td><td>${esc(email || "—")}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#6b6b66">Teléfono</td><td>${esc(perfil.telefono ?? "—")}</td></tr>
</table>
<p style="color:#6b6b66">Para cambiarlo: <a href="${APP_URL}/asesor">Panel del asesor</a> → entra en su cuenta → Configuración → Plan → Editar plan y cobro.<br>Responde a este correo para escribirle directamente.</p>
</div>`,
    });
  } catch (e) {
    console.error("Solicitud de plan", e);
    return json({ error: "No se ha podido enviar la solicitud. Escríbenos a info@nomotax.io" }, 500);
  }

  return json({ ok: true });
});
