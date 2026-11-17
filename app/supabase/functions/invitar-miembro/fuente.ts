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
//
// El correo de acceso sale desde el correo propio de la empresa (Configuración → Correo, smtp_empresas activo)
// o, si no lo ha conectado, desde info@nomotax.io con su nombre. El texto es su plantilla de «Accesos» (Configuración → Plantillas).
// FUENTE: NO se pega en Supabase. `node scripts/empaquetar-facturar.mjs invitar-miembro` genera index.ts (un solo archivo)
// y ese es el que se pega en Edge Functions → invitar-miembro. Secretos: SMTP_PASSWORD (NomoTax) y SMTP_CLAVE (correo propio).

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { explicarErrorSmtp, smtpActivo, transporte } from "../_compartido/smtp";
import {
  FUNCIONES_ROL,
  NOMBRE_ROL,
  correoDePlantilla,
  htmlCorreoPlantilla,
  textoCorreoPlantilla,
} from "../../../src/lib/plantillasCorreo";

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
    const r = await enviar(admin, { cuenta: m.cuenta_id, email: m.email, nombre: m.nombre, rol: m.rol, password: nueva });
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
    trabajador_id: body.trabajador_id ?? null,
    invitado_por: userData.user.id,
  }).select().single();
  if (eM || !miembro) {
    console.error("invitar-miembro", eM);
    if (creado) await admin.auth.admin.deleteUser(userId);
    return json({ error: eM?.message?.includes("trabajador") ? eM.message : "No se ha podido dar el acceso" }, 400);
  }

  let bienvenida: "no" | "enviada" | "error" = "no";
  if (body.bienvenida !== false) {
    bienvenida = await enviar(admin, { cuenta, email, nombre: body.nombre ?? null, rol, password });
  }
  return json({ id: miembro.id, email, password, nuevo: creado, bienvenida });
});

/** Datos del correo de acceso */
interface DatosAcceso {
  cuenta: string;
  email: string;
  nombre: string | null;
  rol: Rol;
  password: string | null;
}

const LIMPIA = (s: unknown) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();

/**
 * Manda el acceso con la plantilla «Accesos» de la empresa, desde su correo propio (si lo tiene conectado)
 * o desde info@nomotax.io con su nombre. Devuelve «error» si no ha podido salir (la contraseña se enseña igualmente en la app).
 */
// deno-lint-ignore no-explicit-any
async function enviar(admin: { from: (t: string) => any }, d: DatosAcceso): Promise<"enviada" | "error"> {
  try {
    const { data: perfil } = await admin.from("profiles").select("*").eq("id", d.cuenta).single();
    const p = (perfil ?? {}) as Record<string, string | null>;
    const empresa = LIMPIA(p.nombre_comercial || p.nombre || p.email || "tu empresa");
    const respuesta = (p.email_respuesta || p.email || "").trim();

    const vars = {
      nombre: LIMPIA(d.nombre),
      empresa,
      rol: NOMBRE_ROL[d.rol],
      funciones: FUNCIONES_ROL[d.rol],
      usuario: d.email,
      contrasena: d.password ?? "",
    };
    const { asunto, mensaje } = correoDePlantilla("acceso", { asunto: p.acceso_asunto, mensaje: p.acceso_mensaje }, vars);
    const diseno = { empresa, color: p.color_marca, cabecera: p.color_cabecera, boton: p.color_boton, logo: null, respuesta, telefono: p.telefono };
    const mail = {
      to: d.email,
      subject: asunto,
      text: textoCorreoPlantilla("acceso", mensaje, vars, diseno),
      html: htmlCorreoPlantilla("acceso", mensaje, vars, diseno),
    };

    // ¿La empresa tiene su propio correo conectado?
    const propio = await smtpActivo(admin, d.cuenta);
    if (propio) {
      const c = propio.config;
      try {
        await transporte(c, propio.pass).sendMail({
          ...mail,
          from: { name: c.remitente_nombre || empresa, address: c.remitente_email },
          ...(respuesta && respuesta.toLowerCase() !== c.remitente_email.toLowerCase() ? { replyTo: respuesta } : {}),
        });
      } catch (e) {
        console.error("Correo de acceso (SMTP de la empresa)", e);
        await admin.from("smtp_empresas").update({ ultimo_error: explicarErrorSmtp(e) }).eq("owner_id", d.cuenta);
        return "error";
      }
      return "enviada";
    }

    // Con NomoTax: info@nomotax.io con el nombre de la empresa
    const pass = Deno.env.get("SMTP_PASSWORD");
    if (!pass) {
      console.error("Falta el secreto SMTP_PASSWORD (contraseña del buzón info@nomotax.io)");
      return "error";
    }
    const usuario = Deno.env.get("SMTP_USER") ?? "info@nomotax.io";
    const t = nodemailer.createTransport({ host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com", port: 465, secure: true, auth: { user: usuario, pass } });
    await t.sendMail({
      ...mail,
      from: { name: `${empresa} vía NomoTax`, address: usuario },
      ...(respuesta ? { replyTo: respuesta } : {}),
      bcc: "pablo@nomotax.io",
    });
    return "enviada";
  } catch (e) {
    console.error("Correo de acceso", e);
    return "error";
  }
}
