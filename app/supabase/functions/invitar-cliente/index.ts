// Da de alta a un cliente nuevo. Solo lo puede usar el asesor.
// Entrada (POST JSON): { email, nombre?, nif?, bienvenida? }  → alta nueva
//                      { reenviar: <id del cliente> }          → contraseña nueva + correo de bienvenida
// Devuelve una contraseña provisional para entregar al cliente
// (luego la cambia en "Mi perfil").

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import nodemailer from "npm:nodemailer@6.9.16";

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

/** Clave secreta (solo para operaciones de administración) */
function claveSecreta(): string {
  const k = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!k) throw new Error("Falta la clave secreta de Supabase")
  return k
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function passwordProvisional(): string {
  // Sin caracteres que se confundan (0/O, 1/l/I)
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, clavePublica(req), {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "Sesión no válida" }, 401);

  const { data: me } = await asUser.from("profiles").select("role").eq("id", userData.user.id).single();
  if (me?.role !== "advisor") return json({ error: "Solo el asesor puede dar de alta clientes" }, 403);

  let body: { email?: string; nombre?: string; nif?: string; bienvenida?: boolean; reenviar?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }

  // Reenviar el acceso a un cliente que ya existe: contraseña nueva + correo de bienvenida
  if (body.reenviar) {
    const admin = createClient(url, claveSecreta(), { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: perfil } = await admin.from("profiles").select("id, email, nombre, role").eq("id", body.reenviar).single();
    if (!perfil?.email || perfil.role !== "client") return json({ error: "Cliente no encontrado" }, 404);
    const nueva = passwordProvisional();
    const { error: e1 } = await admin.auth.admin.updateUserById(perfil.id, { password: nueva });
    if (e1) return json({ error: "No se ha podido cambiar la contraseña" }, 500);
    const r = await enviarBienvenida(perfil.email, perfil.nombre, nueva);
    if (r === "enviada") await admin.from("profiles").update({ bienvenida_enviada_at: new Date().toISOString() }).eq("id", perfil.id);
    return json({ id: perfil.id, email: perfil.email, password: nueva, bienvenida: r });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email no válido" }, 400);

  const admin = createClient(url, claveSecreta(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const password = passwordProvisional();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: body.nombre ?? null },
  });
  if (error || !created.user) {
    const msg = error?.message?.toLowerCase().includes("already")
      ? "Ya existe un usuario con ese email"
      : "No se ha podido crear el usuario";
    return json({ error: msg }, 400);
  }

  if (body.nombre || body.nif) {
    await admin.from("profiles")
      .update({ nombre: body.nombre ?? null, nif: body.nif?.toUpperCase().replace(/[\s.-]/g, "") ?? null })
      .eq("id", created.user.id);
  }

  // Correo de bienvenida (sale desde info@nomotax.io por el correo de Hostinger)
  let bienvenida: "no" | "enviada" | "error" = "no";
  if (body.bienvenida) {
    bienvenida = await enviarBienvenida(email, body.nombre ?? null, password);
    if (bienvenida === "enviada") {
      await admin.from("profiles").update({ bienvenida_enviada_at: new Date().toISOString() }).eq("id", created.user.id);
    }
  }

  return json({ id: created.user.id, email, password, bienvenida });
});

/** Envía la bienvenida desde info@nomotax.io (SMTP de Hostinger). Secreto necesario: SMTP_PASSWORD */
async function enviarBienvenida(email: string, nombre: string | null, password: string): Promise<"enviada" | "error"> {
  const pass = Deno.env.get("SMTP_PASSWORD");
  if (!pass) {
    console.error("Falta el secreto SMTP_PASSWORD (contraseña del buzón info@nomotax.io)");
    return "error";
  }
  try {
    const t = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com",
      port: 465,
      secure: true,
      auth: { user: Deno.env.get("SMTP_USER") ?? "info@nomotax.io", pass },
    });
    await t.sendMail({
      from: '"NomoTax" <info@nomotax.io>',
      to: email,
      bcc: "pablo@nomotax.io",
      subject: "Bienvenido/a al Área de clientes de NomoTax",
      html: html({ nombre, email, password }),
      text: texto({ nombre, email, password }),
    });
    return "enviada";
  } catch (e) {
    console.error("Bienvenida", e);
    return "error";
  }
}

function texto(d: { nombre: string | null; email: string; password: string }) {
  return [
    `Hola${d.nombre ? " " + d.nombre : ""},`,
    "",
    "Ya tienes acceso al Área de clientes de NomoTax.",
    "",
    `Entra en: ${APP_URL}`,
    `Usuario: ${d.email}`,
    `Contraseña provisional: ${d.password}`,
    "",
    "Al entrar, cámbiala en «Mi perfil».",
    "",
    `¿Dudas? WhatsApp ${WHATSAPP} · ${TELEFONO} · info@nomotax.io`,
    "",
    "Pablo Pérez del Pulgar · NomoTax",
  ].join("\n");
}

const APP_URL = "https://clientes.nomotax.io";
const LOGO = "https://clientes.nomotax.io/logo.png";
const WHATSAPP = "https://wa.me/34642757633";
const TELEFONO = "+34 642 75 76 33";

function esc(s: unknown) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
}

function html(d: { nombre: string | null; email: string; password: string }) {
  const nombre = d.nombre ? ' ' + esc(d.nombre) : '';
  const paso = (n: number, t: string, s: string) => `
    <tr><td style="padding:0 0 14px 0;vertical-align:top;width:36px">
      <div style="width:26px;height:26px;border-radius:13px;background:#CDF564;color:#111110;font:600 13px/26px Helvetica,Arial,sans-serif;text-align:center">${n}</div>
    </td><td style="padding:0 0 14px 0;font:15px/1.5 Helvetica,Arial,sans-serif;color:#111110">
      <strong>${t}</strong><br><span style="color:#6b6b66">${s}</span>
    </td></tr>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e7e2">
  <tr><td style="background:#111110;padding:26px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${LOGO}" width="40" height="40" alt="NomoTax" style="display:block;border-radius:8px"></td>
      <td style="padding-left:12px;font:600 18px Helvetica,Arial,sans-serif;color:#ffffff">NomoTax<br>
        <span style="font:500 11px Helvetica,Arial,sans-serif;letter-spacing:2px;color:#CDF564">ÁREA DE CLIENTES</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px 32px 8px 32px;font:15px/1.6 Helvetica,Arial,sans-serif;color:#111110">
    <h1 style="margin:0 0 12px 0;font:600 24px/1.25 Helvetica,Arial,sans-serif;color:#111110">Hola${nombre}, ¡bienvenido/a!</h1>
    <p style="margin:0 0 22px 0">Ya tienes acceso a tu Área de clientes de NomoTax: tus gastos, facturas y contabilidad, siempre al día y en un solo sitio.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px">
      <tr><td style="padding:18px 20px;font:15px/1.7 Helvetica,Arial,sans-serif;color:#111110">
        <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">TUS ACCESOS</span><br>
        Usuario: <strong>${esc(d.email)}</strong><br>
        Contraseña provisional: <strong style="font-family:Menlo,Consolas,monospace;font-size:16px;background:#CDF564;padding:2px 6px;border-radius:6px">${esc(d.password)}</strong>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#111110;border-radius:999px">
      <a href="${APP_URL}" style="display:inline-block;padding:14px 28px;font:600 15px Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none">Entrar en el Área de clientes →</a>
    </td></tr></table>
    <p style="margin:0 0 16px 0;font-weight:600">Para empezar</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${paso(1, 'Cambia tu contraseña', 'En «Mi perfil», nada más entrar.')}
      ${paso(2, 'Sube tus gastos', 'Arrastra los PDF o haz una foto con el móvil: los leemos automáticamente.')}
      ${paso(3, 'Crea tus facturas y presupuestos', 'Con tus datos y tu logo, listas para enviar en PDF.')}
      ${paso(4, 'Habla con tu asesor', 'En «Mi asesor»: WhatsApp, llamada o una cita en el calendario.')}
    </table>
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 Helvetica,Arial,sans-serif;color:#111110;border-top:1px solid #efefea">
    <p style="margin:18px 0 4px 0">¿Dudas? Estamos a un mensaje:</p>
    <a href="${WHATSAPP}" style="color:#111110;font-weight:600">WhatsApp</a> &nbsp;·&nbsp;
    <a href="tel:+34642757633" style="color:#111110;font-weight:600">${TELEFONO}</a> &nbsp;·&nbsp;
    <a href="mailto:info@nomotax.io" style="color:#111110;font-weight:600">info@nomotax.io</a>
    <p style="margin:18px 0 0 0">Un saludo,<br><strong>Pablo Pérez del Pulgar</strong><br><span style="color:#6b6b66">Tu asesor fiscal · NomoTax</span></p>
  </td></tr>
</table>
<p style="font:12px Helvetica,Arial,sans-serif;color:#9a9a94;margin:16px 0 0 0">NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`;
}

