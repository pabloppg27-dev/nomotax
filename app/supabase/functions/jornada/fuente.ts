// FUENTE de la Edge Function «jornada». NO se pega en Supabase:
// `node scripts/empaquetar-facturar.mjs jornada` genera index.ts (un solo archivo) y ese es el que se pega.
// Al publicarla: Verify JWT DESACTIVADO (la llama el cron sin sesión; aquí se comprueba la clave o la sesión).
//
// 1) Informe semanal (cada lunes, cron de supabase/informe-jornada.sql, cabecera x-cron-secret = CRON_SECRET):
//      { "accion": "informe" }
//    A cada trabajador que ficha, el resumen de su semana (lunes a domingo anterior, hora de Madrid):
//    lo fichado frente a su jornada, días sin fichar o sin salida; vacaciones, permisos, bajas y festivos no
//    cuentan. Al propietario y a quien lleva Laboral, el resumen del equipo y lo pendiente de aprobar.
//    Solo empresas con perfil_laboral.informe_jornada = true. Cada envío queda en informes_jornada (no se repite).
//    Prueba: { "accion": "informe", "prueba": true, "empresa": "nova", "para": "tu@email" , "semana": "2026-11-23" }
//      → todos los correos de esa empresa solo a «para» (por defecto NOMOTAX_EMISOR_EMAIL), sin registrar nada.
//
// 2) Avisos de ausencias (desde la app, con la sesión del usuario):
//      { "accion": "aviso", "ausencia_id": "…", "evento": "nueva" | "resuelta" | "anulada" }
//    nueva → al propietario y a quien lleva Laboral; resuelta/anulada → al trabajador.
//
// Correo: desde el SMTP propio de la empresa si lo tiene activo (Configuración → Correo); si no, desde
// info@nomotax.io como «Empresa vía NomoTax» (SMTP_USER / SMTP_PASSWORD). Secretos: CRON_SECRET, SMTP_PASSWORD,
// SMTP_CLAVE (para el SMTP propio), NOMOTAX_EMISOR_EMAIL (destino de las pruebas).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { explicarErrorSmtp, smtpActivo, transporte } from "../_compartido/smtp";
import { diaMadrid, horaMadrid, informeSemana, lunesAnterior, type InformeTrabajador } from "../../../src/lib/informeJornada";
import { comunidadDe, festivosDe, provinciaDeTrabajo, type FestivoLocal } from "../../../src/lib/festivos";
import { diaSemana, diasDeAusencia, nombreAusencia, sumarDias, textoFechas, type Ausencia } from "../../../src/lib/ausencias";
import { NOMBRE_TIPO, type Fichaje } from "../../../src/lib/fichaje";
import {
  APP_URL,
  asuntoInformeEquipo,
  asuntoInformeTrabajador,
  esc,
  htmlAviso,
  htmlInformeEquipo,
  htmlInformeTrabajador,
  textoAviso,
  textoInformeEquipo,
  textoInformeTrabajador,
  type DatosAviso,
  type PendienteAprobar,
} from "../../../src/lib/correoJornada";

type Cliente = SupabaseClient;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

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

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const linea = (s: string) => s.replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim();
/** Cuentas técnicas sin buzón (cuentas vinculadas del mismo titular) */
const conBuzon = (e: string | null | undefined): e is string => Boolean(e && EMAIL.test(e) && !/@sin-acceso\.nomotax\.io$/i.test(e) && !/\.example$/i.test(e));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
  if (!secreta || !publica) return json({ error: "Faltan las claves de Supabase" }, 500);
  const admin = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const cron = Deno.env.get("CRON_SECRET");
  const conClave = Boolean(cron && req.headers.get("x-cron-secret") === cron);

  if (body.accion === "aviso") {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Falta la sesión" }, 401);
    const asUser = createClient(url, publica, { global: { headers: { Authorization: auth } } });
    const { data: u } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u?.user) return json({ error: "Sesión no válida" }, 401);
    return aviso(admin, asUser, u.user.id, String(body.ausencia_id ?? ""), String(body.evento ?? ""));
  }

  if (!conClave) return json({ error: "No autorizado" }, 401);
  try {
    return json(await informe(admin, body));
  } catch (e) {
    console.error("jornada: informe", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// ================================================================== Envío

interface Correo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  responderA?: string | null;
}
type Enviar = (c: Correo) => Promise<{ remitente: string; error: string | null }>;

/** Una conexión por empresa: su SMTP propio o NomoTax («Empresa vía NomoTax») */
async function preparaEnvio(admin: Cliente, ownerId: string, empresa: string): Promise<Enviar> {
  let propio: Awaited<ReturnType<typeof smtpActivo>> = null;
  try {
    propio = await smtpActivo(admin, ownerId);
  } catch (e) {
    console.warn(`jornada: SMTP propio de ${ownerId} no disponible, se envía con NomoTax: ${e instanceof Error ? e.message : e}`);
  }
  if (propio) {
    const c = propio.config;
    const t = transporte(c, propio.pass);
    return async (m) => {
      try {
        await t.sendMail({
          from: { name: linea(c.remitente_nombre || empresa), address: c.remitente_email },
          to: m.para,
          replyTo: m.responderA || undefined,
          subject: linea(m.asunto),
          html: m.html,
          text: m.texto,
        });
        return { remitente: c.remitente_email, error: null };
      } catch (e) {
        await admin.from("smtp_empresas").update({ ultimo_error: explicarErrorSmtp(e) }).eq("owner_id", ownerId);
        return { remitente: c.remitente_email, error: explicarErrorSmtp(e) };
      }
    };
  }
  const usuario = Deno.env.get("SMTP_USER") ?? "info@nomotax.io";
  const pass = Deno.env.get("SMTP_PASSWORD");
  if (!pass) throw new Error("Falta el secreto SMTP_PASSWORD (correo info@nomotax.io)");
  const t = nodemailer.createTransport({ host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com", port: 465, secure: true, auth: { user: usuario, pass } });
  return async (m) => {
    try {
      await t.sendMail({
        from: { name: linea(`${empresa} vía NomoTax`), address: usuario },
        to: m.para,
        replyTo: m.responderA || undefined,
        subject: linea(m.asunto),
        html: m.html,
        text: m.texto,
      });
      return { remitente: usuario, error: null };
    } catch (e) {
      return { remitente: usuario, error: e instanceof Error ? e.message : String(e) };
    }
  };
}

// ================================================================== Datos de una empresa

interface Empresa {
  id: string;
  nombre: string | null;
  nombre_comercial: string | null;
  email: string | null;
  email_respuesta?: string | null;
  provincia: string | null;
}
interface Miembro {
  user_id: string;
  email: string;
  nombre: string | null;
  rol: string;
  permisos: Record<string, boolean> | null;
  trabajador_id: string | null;
  fichaje: boolean;
}
interface Trab {
  id: string;
  nombre: string;
  estado: string;
  fecha_inicio: string;
  fecha_baja: string | null;
  jornada: string | null;
  horas_semana: number | null;
  centro_id: string | null;
}

const nombreEmpresa = (p: Empresa) => p.nombre_comercial || p.nombre || "Tu empresa";

/** Quien recibe lo de la empresa: la cuenta (propietario) y los administradores con Laboral */
function destinatariosEmpresa(p: Empresa, miembros: Miembro[]): { email: string; nombre: string | null }[] {
  const out = new Map<string, { email: string; nombre: string | null }>();
  if (conBuzon(p.email)) out.set(p.email.toLowerCase(), { email: p.email, nombre: null });
  for (const m of miembros) {
    if (m.rol === "admin" && m.permisos?.laboral && conBuzon(m.email) && !out.has(m.email.toLowerCase())) {
      out.set(m.email.toLowerCase(), { email: m.email, nombre: m.nombre });
    }
  }
  return [...out.values()];
}

/** Festivos de cada trabajador según la provincia de su centro (o de la empresa) */
function festivosPara(t: Pick<Trab, "centro_id">, centros: { id: string; provincia: string | null }[], p: Empresa, locales: FestivoLocal[]) {
  return festivosDe(comunidadDe(provinciaDeTrabajo(t.centro_id, centros, p)), locales);
}

// ================================================================== 1) Informe semanal

async function informe(admin: Cliente, body: Record<string, unknown>) {
  const prueba = body.prueba === true;
  const paraPrueba = String(body.para ?? Deno.env.get("NOMOTAX_EMISOR_EMAIL") ?? "info@nomotax.io").trim();
  if (prueba && !EMAIL.test(paraPrueba)) throw new Error("«para» no es un email válido");
  const lunes = typeof body.semana === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.semana) ? body.semana : lunesAnterior(diaMadrid(new Date()));
  if (diaSemana(lunes) !== 1) throw new Error(`${lunes} no es lunes`);

  // Empresas: las que lo tienen activado; en prueba, la que se nombre (aunque no esté activado)
  let ids: string[];
  if (typeof body.empresa === "string" && body.empresa.trim()) {
    const q = `%${body.empresa.trim().replace(/[%_]/g, "")}%`;
    const { data } = await admin.from("profiles").select("id").or(`nombre.ilike.${q},nombre_comercial.ilike.${q}`);
    ids = (data ?? []).map((x: { id: string }) => x.id);
    if (!prueba) {
      const { data: act } = await admin.from("perfil_laboral").select("owner_id").eq("informe_jornada", true).in("owner_id", ids.length ? ids : ["-"]);
      ids = (act ?? []).map((x: { owner_id: string }) => x.owner_id);
    }
  } else {
    if (prueba) throw new Error("En prueba, di la empresa: { \"empresa\": \"nova\" }");
    const { data } = await admin.from("perfil_laboral").select("owner_id").eq("informe_jornada", true);
    ids = (data ?? []).map((x: { owner_id: string }) => x.owner_id);
  }

  const resultado: unknown[] = [];
  for (const id of ids) {
    try {
      resultado.push(await informeEmpresa(admin, id, lunes, prueba ? paraPrueba : null));
    } catch (e) {
      console.error(`jornada: empresa ${id}`, e);
      resultado.push({ empresa: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { semana: lunes, prueba, empresas: resultado };
}

async function informeEmpresa(admin: Cliente, ownerId: string, lunes: string, paraPrueba: string | null) {
  const domingo = sumarDias(lunes, 6);
  const [{ data: perfil }, { data: perfilLab }, { data: trabs }, { data: miembros }, { data: centros }, { data: fichajes }, { data: ausencias }, { data: locales }, { data: pendFich }] =
    await Promise.all([
      admin.from("profiles").select("*").eq("id", ownerId).single(),
      admin.from("perfil_laboral").select("horas_semana_convenio").eq("owner_id", ownerId).maybeSingle(),
      admin.from("trabajadores").select("id, nombre, estado, fecha_inicio, fecha_baja, jornada, horas_semana, centro_id").eq("owner_id", ownerId).order("nombre"),
      admin.from("miembros").select("user_id, email, nombre, rol, permisos, trabajador_id, fichaje").eq("cuenta_id", ownerId).eq("activo", true),
      admin.from("centros_trabajo").select("id, provincia").eq("owner_id", ownerId),
      admin.from("fichajes").select("*").eq("owner_id", ownerId).gte("momento", `${sumarDias(lunes, -1)}T00:00:00Z`).lt("momento", `${sumarDias(domingo, 2)}T00:00:00Z`).order("momento"),
      admin.from("ausencias").select("*").eq("owner_id", ownerId).lte("desde", domingo).or(`hasta.is.null,hasta.gte.${lunes}`),
      admin.from("festivos_empresa").select("fecha, nombre").eq("owner_id", ownerId),
      admin.from("fichajes").select("*").eq("owner_id", ownerId).eq("estado", "pendiente").order("momento"),
    ]);
  if (!perfil) throw new Error("No existe la empresa");
  const p = perfil as Empresa;
  const empresa = nombreEmpresa(p);
  const ms = (miembros ?? []) as Miembro[];
  const ts = ((trabs ?? []) as Trab[]).filter((t) => t.estado === "alta" || (t.estado === "baja" && t.fecha_baja && t.fecha_baja >= lunes));
  const cs = (centros ?? []) as { id: string; provincia: string | null }[];
  const fs = (fichajes ?? []) as Fichaje[];
  const as = (ausencias ?? []) as Ausencia[];
  const ls = (locales ?? []) as FestivoLocal[];
  const nombreDe = (id: string) => ts.find((t) => t.id === id)?.nombre ?? (trabs as Trab[] | null)?.find((t) => t.id === id)?.nombre ?? "—";

  const conFichaje = new Map(ms.filter((m) => m.fichaje && m.trabajador_id).map((m) => [m.trabajador_id!, m]));
  const informes: { inf: InformeTrabajador; m: Miembro }[] = [];
  for (const t of ts) {
    const m = conFichaje.get(t.id);
    if (!m || t.fecha_inicio > domingo) continue;
    const inf = informeSemana({
      trabajador: t,
      horasConvenio: perfilLab?.horas_semana_convenio ?? 40,
      fichajes: fs,
      ausencias: as,
      festivos: festivosPara(t, cs, p, ls),
      lunes,
    });
    informes.push({ inf, m });
  }
  const sinFichaje = ts.filter((t) => t.estado === "alta" && !conFichaje.has(t.id) && t.fecha_inicio <= domingo).map((t) => t.nombre);
  if (!informes.length) return { empresa, enviados: 0, nota: "Nadie tiene el fichaje activado" };

  // Ya enviados esta semana (si el cron se repite, no se manda dos veces)
  const yaEnviados = new Set<string>();
  if (!paraPrueba) {
    const { data } = await admin.from("informes_jornada").select("email").eq("owner_id", ownerId).eq("semana", lunes).is("error", null);
    for (const r of data ?? []) yaEnviados.add(String(r.email).toLowerCase());
  }

  const enviar = await preparaEnvio(admin, ownerId, empresa);
  const responderEmpresa = conBuzon(p.email_respuesta) ? p.email_respuesta : conBuzon(p.email) ? p.email : null;
  const enviados: { para: string; quien: string; error: string | null }[] = [];
  const registrar = async (email: string, trabajadorId: string | null, r: { remitente: string; error: string | null }) => {
    if (paraPrueba) return;
    await admin
      .from("informes_jornada")
      .upsert({ owner_id: ownerId, semana: lunes, trabajador_id: trabajadorId, email, remitente: r.remitente, error: r.error }, { onConflict: "owner_id,semana,email" });
  };

  // A cada trabajador
  for (const { inf, m } of informes) {
    if (!conBuzon(m.email)) continue;
    if (yaEnviados.has(m.email.toLowerCase())) continue;
    const d = { empresa, inf, prueba: Boolean(paraPrueba) };
    const r = await enviar({
      para: paraPrueba ?? m.email,
      asunto: asuntoInformeTrabajador(d) + (paraPrueba ? ` → ${m.email}` : ""),
      html: htmlInformeTrabajador(d),
      texto: textoInformeTrabajador(d),
      responderA: responderEmpresa,
    });
    await registrar(m.email, inf.trabajadorId, r);
    enviados.push({ para: m.email, quien: inf.nombre, error: r.error });
  }

  // Al propietario y a quien lleva Laboral
  const correcciones: PendienteAprobar[] = ((pendFich ?? []) as Fichaje[]).map((f) => ({
    nombre: nombreDe(f.trabajador_id),
    texto: `${NOMBRE_TIPO[f.tipo].toLowerCase()} del ${new Date(f.momento).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Madrid" })} a las ${horaMadrid(f.momento)}`,
    motivo: f.motivo,
  }));
  const { data: pendAus } = await admin.from("ausencias").select("*").eq("owner_id", ownerId).eq("estado", "pendiente").order("desde");
  const ausPend: PendienteAprobar[] = ((pendAus ?? []) as Ausencia[]).map((a) => ({
    nombre: nombreDe(a.trabajador_id),
    texto: `${nombreAusencia(a).toLowerCase()} ${textoFechas(a, true)}`,
    motivo: a.motivo,
  }));
  for (const dest of destinatariosEmpresa(p, ms)) {
    if (yaEnviados.has(dest.email.toLowerCase())) continue;
    const d = { empresa, para: dest.nombre, lunes, informes: informes.map((x) => x.inf), sinFichaje, correcciones, ausencias: ausPend, prueba: Boolean(paraPrueba) };
    const r = await enviar({
      para: paraPrueba ?? dest.email,
      asunto: asuntoInformeEquipo(d) + (paraPrueba ? ` → ${dest.email}` : ""),
      html: htmlInformeEquipo(d),
      texto: textoInformeEquipo(d),
      responderA: "info@nomotax.io",
    });
    await registrar(dest.email, null, r);
    enviados.push({ para: dest.email, quien: "equipo", error: r.error });
  }

  return {
    empresa,
    trabajadores: informes.map(({ inf }) => ({ nombre: inf.nombre, estado: inf.estado, fichado: inf.fichadoMin, jornada: inf.esperadoMin, sinFichar: inf.sinFichar, sinSalida: inf.sinSalida })),
    sinFichaje,
    enviados,
  };
}

// ================================================================== 2) Avisos de ausencias

const reciente = (iso: string | null) => Boolean(iso && Date.now() - new Date(iso).getTime() < 15 * 60 * 1000);

async function aviso(admin: Cliente, asUser: Cliente, userId: string, ausenciaId: string, evento: string) {
  if (!/^[0-9a-f-]{36}$/i.test(ausenciaId) || !["nueva", "resuelta", "anulada"].includes(evento)) return json({ error: "Petición no válida" }, 400);
  // Con la sesión del usuario: solo si puede verla (RLS)
  const { data: a } = await asUser.from("ausencias").select("*").eq("id", ausenciaId).maybeSingle();
  if (!a) return json({ error: "No existe esa ausencia" }, 404);
  const aus = a as Ausencia;
  // Solo justo después del cambio (no se puede usar para mandar correos cuando se quiera)
  if (evento === "nueva" ? !reciente(aus.created_at) : !reciente(aus.revisado_at)) return json({ ok: true, enviado: false, motivo: "fuera de plazo" });
  if (evento === "nueva" && aus.solicitado_por !== userId) return json({ ok: true, enviado: false });

  const [{ data: perfil }, { data: trab }, { data: miembros }, { data: centros }, { data: locales }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", aus.owner_id).single(),
    admin.from("trabajadores").select("id, nombre, centro_id").eq("id", aus.trabajador_id).single(),
    admin.from("miembros").select("user_id, email, nombre, rol, permisos, trabajador_id, fichaje").eq("cuenta_id", aus.owner_id).eq("activo", true),
    admin.from("centros_trabajo").select("id, provincia").eq("owner_id", aus.owner_id),
    admin.from("festivos_empresa").select("fecha, nombre").eq("owner_id", aus.owner_id),
  ]);
  if (!perfil || !trab) return json({ error: "Faltan datos" }, 404);
  const p = perfil as Empresa;
  const empresa = nombreEmpresa(p);
  const ms = (miembros ?? []) as Miembro[];
  const festivos = festivosPara(trab as Trab, (centros ?? []) as { id: string; provincia: string | null }[], p, (locales ?? []) as FestivoLocal[]);
  const dias = diasDeAusencia(aus, festivos, diaMadrid(new Date()));
  const nombre = (trab as Trab).nombre;
  const pilaT = nombre.split(/\s+/)[0];
  const que = aus.tipo === "vacaciones" ? "vacaciones" : aus.tipo === "permiso" ? "un permiso" : "una baja";
  const detalle: [string, string][] = [
    ["Tipo", nombreAusencia(aus)],
    ["Fechas", textoFechas(aus, true).replace(/^./, (c) => c.toUpperCase())],
    ...(aus.hasta || aus.tipo !== "baja" ? [["Días laborables", String(dias)] as [string, string]] : []),
    ...(aus.motivo ? [["Comentario", aus.motivo] as [string, string]] : []),
    ...(aus.tipo !== "vacaciones" ? [["Justificante", aus.archivo_path ? "Adjunto en NomoTax" : "No adjunto"] as [string, string]] : []),
  ];

  const enviar = await preparaEnvio(admin, aus.owner_id, empresa);
  const errores: string[] = [];

  if (evento === "nueva") {
    const d: DatosAviso = {
      empresa,
      etiqueta: "AUSENCIAS",
      titulo: aus.tipo === "baja" ? `${nombre} ha comunicado una baja` : `${nombre} pide ${que}`,
      parrafo:
        aus.tipo === "baja"
          ? `${esc(pilaT)} estará de baja ${esc(textoFechas(aus, true))}. No hay que aprobarla: queda registrada y esos días no cuentan como «sin fichar». Tu asesor la tendrá en cuenta en la nómina.`
          : `${esc(pilaT)} ha pedido ${que} ${esc(textoFechas(aus, true))}. Apruébalo o recházalo en NomoTax: le avisaremos por correo.`,
      detalle,
      boton: { href: `${APP_URL}/laboral/ausencias`, texto: aus.tipo === "baja" ? "Ver en Laboral" : "Revisar la solicitud" },
      pie: `Te llega porque llevas Laboral en ${esc(empresa)} · NomoTax`,
    };
    for (const dest of destinatariosEmpresa(p, ms)) {
      if (ms.some((m) => m.user_id === userId && m.email.toLowerCase() === dest.email.toLowerCase())) continue;
      const r = await enviar({ para: dest.email, asunto: d.titulo, html: htmlAviso(d), texto: textoAviso(d) });
      if (r.error) errores.push(r.error);
    }
  } else {
    const m = ms.find((x) => x.trabajador_id === aus.trabajador_id);
    if (!m || !conBuzon(m.email)) return json({ ok: true, enviado: false, motivo: "el trabajador no tiene usuario" });
    const apuntada = aus.estado === "aprobada" && aus.solicitado_por === aus.revisado_por;
    const tit =
      evento === "anulada"
        ? `Se ha anulado tu ausencia ${textoFechas(aus)}`
        : apuntada
          ? `La empresa ha apuntado tus ${aus.tipo === "vacaciones" ? "vacaciones" : "días de permiso"}`
          : aus.estado === "aprobada"
            ? aus.tipo === "vacaciones"
              ? "Tus vacaciones están aprobadas"
              : "Tu permiso está aprobado"
            : aus.tipo === "vacaciones"
              ? "Tus vacaciones no se han aprobado"
              : "Tu permiso no se ha aprobado";
    const par =
      evento === "anulada"
        ? `${esc(empresa)} ha anulado ${esc(nombreAusencia(aus).toLowerCase())} ${esc(textoFechas(aus, true))}${aus.respuesta ? `. Motivo: «${esc(aus.respuesta)}»` : ""}. Esos días vuelven a ser de trabajo: hay que fichar.`
        : aus.estado === "aprobada"
          ? `${esc(pilaT)}, ${apuntada ? "ya está registrado" : "está aprobado"}: ${esc(textoFechas(aus, true))} no tienes que fichar.${aus.tipo === "vacaciones" ? " ¡Que las disfrutes!" : ""}`
          : `${esc(pilaT)}, la empresa no ha aprobado tu solicitud ${esc(textoFechas(aus, true))}${aus.respuesta ? `. Motivo: «${esc(aus.respuesta)}»` : ""}. Si quieres, pide otras fechas o habla con tu responsable.`;
    const d: DatosAviso = {
      empresa,
      etiqueta: "AUSENCIAS",
      titulo: tit,
      parrafo: par,
      detalle,
      boton: { href: `${APP_URL}/mi-espacio/ausencias`, texto: "Ver mis ausencias" },
      pie: `${esc(empresa)} te avisa con NomoTax`,
    };
    const r = await enviar({ para: m.email, asunto: tit, html: htmlAviso(d), texto: textoAviso(d), responderA: conBuzon(p.email_respuesta) ? p.email_respuesta : conBuzon(p.email) ? p.email : null });
    if (r.error) errores.push(r.error);
  }
  return json({ ok: errores.length === 0, enviado: errores.length === 0, errores });
}
