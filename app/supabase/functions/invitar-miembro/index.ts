// Da acceso a una persona a la empresa (rol admin, socio, comercial o empleado).
// La usan el titular, el asesor y los admins con el permiso «usuarios» (función SQL puede(cuenta, 'usuarios')).
//
// Entrada (POST JSON):
//   { cuenta_id, email, nombre?, rol, permisos?, trabajador_id?, bienvenida? }  → acceso nuevo
//   { reenviar: <id del miembro> }                                             → contraseña nueva + correo
//
// Si la persona no tiene usuario, se crea (tipo 'member') con una contraseña provisional.
// Si ya tiene usuario (por ejemplo, es cliente de NomoTax con su propia empresa), solo se le añade
// el acceso y se le avisa: entra con su contraseña de siempre y elige la empresa arriba.
// Pegar en Supabase → Edge Functions → Deploy a new function → Via Editor → nombre «invitar-miembro».

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import nodemailer from "npm:nodemailer@6.9.16";

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

function claveSecreta(): string {
  const k = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!k) throw new Error("Falta la clave secreta de Supabase");
  return k;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function passwordProvisional(): string {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

type Rol = "admin" | "socio" | "comercial" | "empleado";
const ROLES: Rol[] = ["admin", "socio", "comercial", "empleado"];

const QUE_PUEDE: Record<Rol, string> = {
  admin: "Llevar la gestión de la empresa: facturas, gastos, bancos y lo demás que te hayan activado.",
  socio: "Ver cómo va la empresa: cifras clave, pérdidas y ganancias, balance y liquidez.",
  comercial: "Hacer presupuestos y facturas y llevar la ficha de los clientes.",
  empleado: "Subir tus tickets de gasto y ver tus nóminas y tus documentos.",
};
const NOMBRE_ROL: Record<Rol, string> = { admin: "Administración", socio: "Socio", comercial: "Comercial", empleado: "Empleado" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Falta la sesión" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, clavePublica(req), { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ error: "Sesión no válida" }, 401);

  let body: {
    cuenta_id?: string; email?: string; nombre?: string; rol?: Rol; permisos?: Record<string, boolean>;
    trabajador_id?: string | null; bienvenida?: boolean; reenviar?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Petición no válida" }, 400);
  }

  const admin = createClient(url, claveSecreta(), { auth: { autoRefreshToken: false, persistSession: false } });

  const puedeGestionar = async (cuenta: string) => {
    const { data } = await asUser.rpc("puede", { cuenta, modulo: "usuarios" });
    return data === true;
  };
  const nombreEmpresa = async (cuenta: string) => {
    const { data } = await admin.from("profiles").select("nombre, nombre_comercial, email").eq("id", cuenta).single();
    return (data?.nombre_comercial || data?.nombre || data?.email || "tu empresa") as string;
  };

  // ------------------------------------------------ Reenviar el acceso
  if (body.reenviar) {
    const { data: m } = await admin.from("miembros").select("*").eq("id", body.reenviar).single();
    if (!m) return json({ error: "Acceso no encontrado" }, 404);
    if (!(await puedeGestionar(m.cuenta_id))) return json({ error: "No puedes gestionar los usuarios de esta empresa" }, 403);
    const { data: perfil } = await admin.from("profiles").select("role").eq("id", m.user_id).single();
    if (perfil?.role !== "member") {
      return json({ error: "Esta persona tiene su propia cuenta en NomoTax: entra con su contraseña de siempre (o «He olvidado la contraseña»)." }, 400);
    }
    const nueva = passwordProvisional();
    const { error } = await admin.auth.admin.updateUserById(m.user_id, { password: nueva });
    if (error) return json({ error: "No se ha podido cambiar la contraseña" }, 500);
    const r = await enviar({ email: m.email, nombre: m.nombre, empresa: await nombreEmpresa(m.cuenta_id), rol: m.rol, password: nueva });
    return json({ id: m.id, email: m.email, password: nueva, bienvenida: r });
  }

  // ------------------------------------------------ Acceso nuevo
  const cuenta = body.cuenta_id;
  const email = body.email?.trim().toLowerCase();
  const rol = body.rol;
  if (!cuenta) return json({ error: "Falta la empresa" }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email no válido" }, 400);
  if (!rol || !ROLES.includes(rol)) return json({ error: "Elige un rol" }, 400);
  if (!(await puedeGestionar(cuenta))) return json({ error: "No puedes gestionar los usuarios de esta empresa" }, 403);

  const { data: existente } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (existente?.id === cuenta) return json({ error: "Ese email es el del titular de la empresa: ya tiene acceso a todo" }, 400);
  if (existente?.role === "advisor") return json({ error: "Ese email es el del asesor: ya tiene acceso a todo" }, 400);
  if (existente) {
    const { data: ya } = await admin.from("miembros").select("id").eq("cuenta_id", cuenta).eq("user_id", existente.id).maybeSingle();
    if (ya) return json({ error: "Esta persona ya tiene acceso a la empresa. Cambia su rol en la lista." }, 400);
  }

  let userId = existente?.id as string | undefined;
  let password: string | null = null;
  let creado = false;
  if (!userId) {
    password = passwordProvisional();
    const { data: nuevo, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: body.nombre ?? null },
    });
    if (error || !nuevo.user) return json({ error: "No se ha podido crear el usuario" }, 400);
    userId = nuevo.user.id;
    creado = true;
    await admin.from("profiles").update({ role: "member", nombre: body.nombre?.trim() || null }).eq("id", userId);
  }

  const { data: miembro, error: eM } = await admin.from("miembros").insert({
    cuenta_id: cuenta,
    user_id: userId,
    email,
    nombre: body.nombre?.trim() || null,
    rol,
    permisos: rol === "admin" ? body.permisos ?? {} : {},
    trabajador_id: rol === "empleado" ? body.trabajador_id ?? null : null,
    invitado_por: userData.user.id,
  }).select().single();
  if (eM || !miembro) {
    console.error("invitar-miembro", eM);
    if (creado) await admin.auth.admin.deleteUser(userId);
    return json({ error: eM?.message?.includes("trabajador") ? eM.message : "No se ha podido dar el acceso" }, 400);
  }

  let bienvenida: "no" | "enviada" | "error" = "no";
  if (body.bienvenida !== false) {
    bienvenida = await enviar({ email, nombre: body.nombre ?? null, empresa: await nombreEmpresa(cuenta), rol, password });
  }
  return json({ id: miembro.id, email, password, nuevo: creado, bienvenida });
});

/** Correo desde info@nomotax.io (SMTP de Hostinger). Secreto necesario: SMTP_PASSWORD */
async function enviar(d: { email: string; nombre: string | null; empresa: string; rol: Rol; password: string | null }): Promise<"enviada" | "error"> {
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
      to: d.email,
      bcc: "pablo@nomotax.io",
      subject: `Tienes acceso a ${d.empresa} en el Área de clientes de NomoTax`,
      html: html(d),
      text: texto(d),
    });
    return "enviada";
  } catch (e) {
    console.error("Correo de acceso", e);
    return "error";
  }
}

const APP_URL = "https://clientes.nomotax.io";
const LOGO = "https://clientes.nomotax.io/logo.png";
const WHATSAPP = "https://wa.me/34642757633";
const TELEFONO = "+34 642 75 76 33";

function texto(d: { email: string; nombre: string | null; empresa: string; rol: Rol; password: string | null }) {
  return [
    `Hola${d.nombre ? " " + d.nombre : ""},`,
    "",
    `${d.empresa} te ha dado acceso a su Área de clientes de NomoTax como «${NOMBRE_ROL[d.rol]}».`,
    QUE_PUEDE[d.rol],
    "",
    `Entra en: ${APP_URL}`,
    `Usuario: ${d.email}`,
    d.password ? `Contraseña provisional: ${d.password}` : "Contraseña: la que ya usas en NomoTax. Arriba podrás elegir la empresa.",
    "",
    d.password ? "Al entrar, cámbiala en «Mi perfil»." : "",
    `¿Dudas? WhatsApp ${WHATSAPP} · ${TELEFONO} · info@nomotax.io`,
    "",
    "NomoTax",
  ].join("\n");
}

function esc(s: unknown) {
  return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
}

function html(d: { email: string; nombre: string | null; empresa: string; rol: Rol; password: string | null }) {
  const nombre = d.nombre ? " " + esc(d.nombre) : "";
  const clave = d.password
    ? `Contraseña provisional: <strong style="font-family:Menlo,Consolas,monospace;font-size:16px;background:#CDF564;padding:2px 6px;border-radius:6px">${esc(d.password)}</strong>`
    : `Contraseña: <strong>la que ya usas en NomoTax</strong><br><span style="color:#6b6b66">Arriba, en la barra lateral, podrás elegir la empresa.</span>`;
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
    <h1 style="margin:0 0 12px 0;font:600 24px/1.25 Helvetica,Arial,sans-serif;color:#111110">Hola${nombre}, ya tienes acceso</h1>
    <p style="margin:0 0 6px 0"><strong>${esc(d.empresa)}</strong> te ha dado acceso a su Área de clientes de NomoTax como <strong>${NOMBRE_ROL[d.rol]}</strong>.</p>
    <p style="margin:0 0 22px 0;color:#6b6b66">${QUE_PUEDE[d.rol]}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px">
      <tr><td style="padding:18px 20px;font:15px/1.7 Helvetica,Arial,sans-serif;color:#111110">
        <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">TUS ACCESOS</span><br>
        Usuario: <strong>${esc(d.email)}</strong><br>
        ${clave}
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#111110;border-radius:999px">
      <a href="${APP_URL}" style="display:inline-block;padding:14px 28px;font:600 15px Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none">Entrar en el Área de clientes →</a>
    </td></tr></table>
    ${d.password ? '<p style="margin:0 0 16px 0;color:#6b6b66">Al entrar, cambia la contraseña en «Mi perfil».</p>' : ""}
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 Helvetica,Arial,sans-serif;color:#111110;border-top:1px solid #efefea">
    <p style="margin:18px 0 4px 0">¿Dudas? Estamos a un mensaje:</p>
    <a href="${WHATSAPP}" style="color:#111110;font-weight:600">WhatsApp</a> &nbsp;·&nbsp;
    <a href="tel:+34642757633" style="color:#111110;font-weight:600">${TELEFONO}</a> &nbsp;·&nbsp;
    <a href="mailto:info@nomotax.io" style="color:#111110;font-weight:600">info@nomotax.io</a>
  </td></tr>
</table>
<p style="font:12px Helvetica,Arial,sans-serif;color:#9a9a94;margin:16px 0 0 0">NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`;
}
