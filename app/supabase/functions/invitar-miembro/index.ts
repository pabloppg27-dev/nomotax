// GENERADO con `node scripts/empaquetar-facturar.mjs invitar-miembro` a partir de fuente.ts y src/lib.
// Pega este archivo entero en Supabase → Edge Functions → invitar-miembro. No lo edites a mano.

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import nodemailer from "npm:nodemailer@6.9.16";
// supabase/functions/_compartido/smtp.ts
const desdeB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function claveAes() {
	const secreto = Deno.env.get("SMTP_CLAVE");
	if (!secreto || secreto.length < 24) throw new Error("Falta el secreto SMTP_CLAVE (texto largo y aleatorio)");
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secreto));
	return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function descifrar(guardado) {
	const [v, iv, datos] = guardado.split(":");
	if (v !== "v1" || !iv || !datos) throw new Error("Contraseña guardada en un formato desconocido");
	const plano = await crypto.subtle.decrypt({
		name: "AES-GCM",
		iv: desdeB64(iv)
	}, await claveAes(), desdeB64(datos));
	return new TextDecoder().decode(plano);
}
function transporte(c, pass) {
	return nodemailer.createTransport({
		host: c.host,
		port: c.puerto,
		secure: c.seguridad === "ssl",
		requireTLS: c.seguridad === "starttls",
		auth: {
			user: c.usuario,
			pass
		},
		connectionTimeout: 1e4,
		greetingTimeout: 1e4,
		socketTimeout: 2e4
	});
}
/** El SMTP activo de la empresa con su contraseña, o null si envía con NomoTax */
async function smtpActivo(admin, ownerId) {
	const { data: config } = await admin.from("smtp_empresas").select("*").eq("owner_id", ownerId).eq("activo", true).maybeSingle();
	if (!config) return null;
	const { data: clave } = await admin.from("smtp_claves").select("clave_cifrada").eq("owner_id", ownerId).maybeSingle();
	if (!clave) return null;
	return {
		config,
		pass: await descifrar(clave.clave_cifrada)
	};
}
/** Error de SMTP en palabras normales (para la app) */
function explicarErrorSmtp(e) {
	const err = e;
	const m = err.message ?? String(e);
	if (/smtp auth.*disabled|SmtpClientAuthentication/i.test(m)) return "Tu cuenta de Microsoft tiene desactivado el envío por SMTP. Tu administrador debe activar «SMTP autenticado» o usa el envío con NomoTax.";
	if (err.code === "EAUTH" || err.responseCode === 535 || /auth|credentials|password|username/i.test(m)) return "El servidor no acepta el usuario o la contraseña. Revisa los datos (en Gmail hace falta una contraseña de aplicación).";
	if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || /timeout|timed out/i.test(m)) return "No se ha podido conectar con el servidor: revisa el servidor y el puerto.";
	if (err.code === "ENOTFOUND" || err.code === "EDNS" || /getaddrinfo|not known|dns/i.test(m)) return "No existe ese servidor de correo: revisa el nombre.";
	if (err.code === "ESOCKET" || /ssl|tls|certificate|wrong version/i.test(m)) return "Fallo de seguridad al conectar (SSL/TLS): prueba con el otro tipo de seguridad o puerto (465 SSL / 587 STARTTLS).";
	if (/sender|from address|not owned|send as/i.test(m)) return "El servidor no deja enviar con ese email de remitente: usa el mismo email con el que entras.";
	return `El servidor de correo ha respondido: ${m.slice(0, 200)}`;
}
// src/lib/correoFactura.ts
const VARIABLES_CORREO = [
	{
		id: "cliente",
		detalle: "Nombre del cliente"
	},
	{
		id: "numero",
		detalle: "Número de factura"
	},
	{
		id: "total",
		detalle: "Importe total"
	},
	{
		id: "fecha",
		detalle: "Fecha de la factura"
	},
	{
		id: "vencimiento",
		detalle: "Fecha de vencimiento"
	},
	{
		id: "empresa",
		detalle: "Tu nombre o marca"
	}
];
/** Plantilla por defecto. Si el cliente es de fuera (PDF en otro idioma), en inglés */
function plantillaPorDefecto(idioma = "es") {
	if (idioma === "es") return {
		asunto: "Factura {numero} · {empresa}",
		mensaje: "Estimado cliente:\n\nLe enviamos la factura {numero} por un importe de {total}, con vencimiento el {vencimiento}. Encontrará el PDF adjunto y el detalle de los conceptos a continuación.\n\nQuedamos a su disposición para cualquier consulta."
	};
	return {
		asunto: "Invoice {numero} · {empresa}",
		mensaje: "Dear Customer,\n\nPlease find attached invoice {numero} for {total}, due on {vencimiento}. The breakdown of the charges is shown below.\n\nPlease let us know if you have any questions."
	};
}
function esc(s) {
	return String(s ?? "").replace(/[&<>"']/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[c]);
}
const LIMA = "#CDF564";
function colorValido(hex, porDefecto = LIMA) {
	return /^#[0-9a-f]{6}$/i.test((hex ?? "").trim()) ? hex.trim() : porDefecto;
}
/** Cabecera y botón de los correos: negro de NomoTax salvo que la empresa elija otro color */
const NEGRO_CORREO = "#111110";
/** Relación de contraste entre dos colores (1 a 21; a partir de 3 se lee bien un texto grande o en negrita) */
function contraste(a, b) {
	const [x, y] = [luminancia(a), luminancia(b)];
	return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
/** El color de acento para escribir sobre la cabecera; si no se lee sobre ese fondo, blanco o negro */
function acentoSobre(acento, fondo) {
	return contraste(acento, fondo) >= 3 ? acento : textoSobre(fondo);
}
function luminancia(hex) {
	const n = parseInt(hex.slice(1), 16);
	const lin = (c) => {
		const v = c / 255;
		return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
	};
	return .2126 * lin(n >> 16 & 255) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255);
}
/** Negro o blanco, lo que mejor se lea sobre el color */
const textoSobre = (hex) => luminancia(hex) > .179 ? "#111110" : "#ffffff";
// src/lib/plantillasCorreo.ts
/**
* Plantillas de correo de cada empresa (Configuración → Plantillas): facturas, accesos, nóminas y presupuestos.
* Cada una tiene asunto y mensaje con {variables}; el diseño (cabecera, logo, color de marca, pie) es común.
* La factura tiene su propio diseño en correoFactura.ts; el resto usa htmlCorreoPlantilla().
* Sin navegador: lo usan la vista previa de la app y las funciones del servidor (invitar-miembro…).
*/
const NOMBRE_ROL = {
	admin: "Administración",
	socio: "Socio",
	comercial: "Comercial",
	empleado: "Empleado"
};
const FUNCIONES_ROL = {
	admin: "Llevar la gestión de la empresa: facturas, gastos, bancos y lo demás que te hayan activado.",
	socio: "Ver cómo va la empresa: cifras clave, pérdidas y ganancias, balance y liquidez.",
	comercial: "Hacer presupuestos y facturas y llevar la ficha de los clientes.",
	empleado: "Subir tus tickets de gasto y ver tus nóminas y tus documentos."
};
const PLANTILLAS = [
	{
		tipo: "factura",
		titulo: "Facturas",
		detalle: "El correo con el que envías cada factura a tu cliente (con el PDF adjunto).",
		colAsunto: "correo_asunto",
		colMensaje: "correo_mensaje",
		variables: VARIABLES_CORREO,
		porDefecto: plantillaPorDefecto("es"),
		enUso: true
	},
	{
		tipo: "acceso",
		titulo: "Accesos",
		detalle: "El correo que recibe cada persona a la que das acceso a la empresa. Los datos de acceso se añaden solos.",
		colAsunto: "acceso_asunto",
		colMensaje: "acceso_mensaje",
		variables: [
			{
				id: "nombre",
				detalle: "Nombre de la persona"
			},
			{
				id: "empresa",
				detalle: "Tu nombre o marca"
			},
			{
				id: "rol",
				detalle: "Su rol (Administración, Socio…)"
			},
			{
				id: "funciones",
				detalle: "Lo que puede hacer con ese rol"
			}
		],
		porDefecto: {
			asunto: "Tienes acceso a {empresa}",
			mensaje: "Hola {nombre}:\n\n{empresa} te ha dado acceso a su Área de clientes como {rol}.\n\n{funciones}"
		},
		enUso: true
	},
	{
		tipo: "nomina",
		titulo: "Nóminas",
		detalle: "El correo con el que enviarás cada nómina a tus trabajadores (con el PDF adjunto).",
		colAsunto: "nomina_asunto",
		colMensaje: "nomina_mensaje",
		variables: [
			{
				id: "trabajador",
				detalle: "Nombre del trabajador"
			},
			{
				id: "mes",
				detalle: "Mes de la nómina (por ejemplo, octubre de 2026)"
			},
			{
				id: "empresa",
				detalle: "Tu nombre o marca"
			}
		],
		porDefecto: {
			asunto: "Tu nómina de {mes} · {empresa}",
			mensaje: "Hola {trabajador}:\n\nTe adjuntamos tu nómina de {mes}. Si ves cualquier error o tienes alguna duda, responde a este correo y lo revisamos.\n\nUn saludo."
		},
		enUso: false
	},
	{
		tipo: "presupuesto",
		titulo: "Presupuestos",
		detalle: "El correo con el que envías cada presupuesto a tu cliente (con el PDF adjunto).",
		colAsunto: "presupuesto_asunto",
		colMensaje: "presupuesto_mensaje",
		variables: [
			{
				id: "cliente",
				detalle: "Nombre del cliente"
			},
			{
				id: "numero",
				detalle: "Número de presupuesto"
			},
			{
				id: "total",
				detalle: "Importe total"
			},
			{
				id: "fecha",
				detalle: "Fecha del presupuesto"
			},
			{
				id: "validez",
				detalle: "Hasta cuándo es válido"
			},
			{
				id: "empresa",
				detalle: "Tu nombre o marca"
			}
		],
		porDefecto: {
			asunto: "Presupuesto {numero} · {empresa}",
			mensaje: "Estimado cliente:\n\nLe enviamos el presupuesto {numero} por un importe de {total}, válido hasta el {validez}. Encontrará el PDF adjunto.\n\nQuedamos a su disposición para cualquier consulta."
		},
		enUso: false
	}
];
const plantillaDe = (tipo) => PLANTILLAS.find((p) => p.tipo === tipo);
/** Cambia {nombre}, {empresa}… por sus datos (las variables que no existen se quedan como están) */
function rellenarVars(texto, vars) {
	return texto.replace(/\{\s*([a-zA-Z]+)\s*\}/g, (m, k) => k.toLowerCase() in vars ? vars[k.toLowerCase()] : m);
}
/** Asunto y mensaje listos para enviar: lo que ha escrito la empresa o, si está vacío, lo de por defecto */
function correoDePlantilla(tipo, guardada, vars) {
	const def = plantillaDe(tipo).porDefecto;
	return {
		asunto: rellenarVars(guardada.asunto?.trim() || def.asunto, vars).replace(/\s+/g, " ").trim(),
		mensaje: rellenarVars(guardada.mensaje?.trim() || def.mensaje, vars).replace(/ +([:,;])/g, "$1")
	};
}
const FONT = "Helvetica,Arial,sans-serif";
const APP_URL = "https://clientes.nomotax.io";
const ETIQUETA = {
	acceso: "ACCESO",
	nomina: "NÓMINA",
	presupuesto: "PRESUPUESTO"
};
/** Cuadro de resumen de cada tipo (accesos, datos de la nómina o del presupuesto) */
function cuadro(tipo, v, color) {
	const etiqueta = (t) => `<span style="color:#6b6b66;font-size:12px;letter-spacing:1px">${t}</span><br>`;
	let dentro = "";
	if (tipo === "acceso") {
		const clave = v.contrasena ? `Contraseña provisional: <strong style="font-family:Menlo,Consolas,monospace;font-size:16px;background:${color};color:${textoSobre(color)};padding:2px 6px;border-radius:6px">${esc(v.contrasena)}</strong>` : "Contraseña: <strong>la que ya usas en NomoTax</strong><br><span style=\"color:#6b6b66\">Arriba, en la barra lateral, podrás elegir la empresa.</span>";
		dentro = `${etiqueta("TUS ACCESOS")}Usuario: <strong>${esc(v.usuario ?? "")}</strong><br>${clave}`;
	} else if (tipo === "nomina") dentro = `${etiqueta("NÓMINA")}<strong style="font-size:17px">${esc(v.mes ?? "")}</strong><br><span style="color:#6b6b66">📎 ${esc(v.archivo ?? "")}</span>`;
	else dentro = `${etiqueta("PRESUPUESTO")}<strong style="font-size:17px">${esc(v.numero ?? "")}</strong> · <span style="color:#6b6b66">${esc(v.fecha ?? "")}</span><br>Total: <strong style="font-family:Menlo,Consolas,monospace;background:${color};color:${textoSobre(color)};padding:2px 8px;border-radius:6px;white-space:nowrap">${esc(v.total ?? "")}</strong><br><span style="color:#6b6b66">Válido hasta el ${esc(v.validez ?? "")} · 📎 ${esc(v.archivo ?? "")}</span>`;
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px;margin-top:8px"><tr><td style="padding:18px 20px;font:15px/1.7 ${FONT};color:#111110">${dentro}</td></tr></table>`;
}
const TITULO = {
	acceso: (v) => `Hola${v.nombre ? " " + v.nombre : ""}, ya tienes acceso`,
	nomina: (v) => `Tu nómina de ${v.mes ?? ""}`,
	presupuesto: (v) => `Presupuesto de ${v.empresa ?? ""}`
};
/** HTML del correo de accesos, nóminas y presupuestos, con la marca de la empresa */
function htmlCorreoPlantilla(tipo, mensaje, v, diseno) {
	const color = colorValido(diseno.color);
	const cabecera = colorValido(diseno.cabecera, NEGRO_CORREO);
	const colorBoton = colorValido(diseno.boton, NEGRO_CORREO);
	const acento = acentoSobre(color, cabecera);
	const parrafos = mensaje.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px 0">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
	const logo = diseno.logo ? `<td style="padding-right:14px" valign="middle"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#ffffff;border-radius:10px;padding:6px 8px"><img src="${esc(diseno.logo)}" alt="" height="32" style="display:block;height:32px;width:auto;max-width:150px;border:0"></td></tr></table></td>` : "";
	const contacto = [diseno.respuesta ? `<a href="mailto:${esc(diseno.respuesta)}" style="color:#111110;font-weight:600">${esc(diseno.respuesta)}</a>` : "", diseno.telefono ? `<a href="tel:${esc(diseno.telefono.replace(/[^\d+]/g, ""))}" style="color:#111110;font-weight:600">${esc(diseno.telefono)}</a>` : ""].filter(Boolean).join(" &nbsp;·&nbsp; ");
	const boton = tipo === "acceso" ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0"><tr><td style="background:${colorBoton};border-radius:999px"><a href="${APP_URL}" style="display:inline-block;padding:14px 28px;font:600 15px ${FONT};color:${textoSobre(colorBoton)};text-decoration:none">Entrar en el Área de clientes →</a></td></tr></table>${v.contrasena ? `<p style="margin:0 0 16px 0;font-size:13px;color:#6b6b66">Al entrar, cambia la contraseña en «Mi perfil».</p>` : ""}` : "";
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e7e2">
  <tr><td style="background:${cabecera};padding:24px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${logo}
      <td valign="middle" style="font:600 18px/1.3 ${FONT};color:${textoSobre(cabecera)}">${esc(diseno.empresa)}<br>
        <span style="font:500 11px ${FONT};letter-spacing:2px;color:${acento}">${ETIQUETA[tipo]}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="height:4px;line-height:4px;font-size:0;background:${color}">&nbsp;</td></tr>
  <tr><td style="padding:30px 32px 8px 32px;font:15px/1.6 ${FONT};color:#111110">
    <h1 style="margin:0 0 18px 0;font:600 24px/1.25 ${FONT};color:#111110">${esc(TITULO[tipo](v))}</h1>
    ${parrafos}
    ${cuadro(tipo, v, color)}
    ${boton}
    <p style="margin:0 0 22px 0"></p>
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 ${FONT};color:#111110;border-top:1px solid #efefea">
    ${contacto ? `<p style="margin:18px 0 4px 0">Si tienes cualquier duda, responde a este correo o escríbenos a:</p>${contacto}` : ""}
    <p style="margin:18px 0 0 0"><strong>${esc(diseno.empresa)}</strong></p>
  </td></tr>
</table>
<p style="font:12px ${FONT};color:#9a9a94;margin:16px 0 0 0">Enviado con NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`;
}
/** Versión en texto plano */
function textoCorreoPlantilla(tipo, mensaje, v, diseno) {
	const extra = tipo === "acceso" ? [
		`Entra en: ${APP_URL}`,
		`Usuario: ${v.usuario ?? ""}`,
		v.contrasena ? `Contraseña provisional: ${v.contrasena}` : "Contraseña: la que ya usas en NomoTax."
	] : tipo === "nomina" ? [`Nómina: ${v.mes ?? ""}`, `Adjunto: ${v.archivo ?? ""}`] : [
		`Presupuesto ${v.numero ?? ""} · ${v.fecha ?? ""}`,
		`Total: ${v.total ?? ""}`,
		`Válido hasta el ${v.validez ?? ""}`
	];
	return [
		TITULO[tipo](v),
		"",
		mensaje.trim(),
		"",
		...extra,
		"",
		[diseno.respuesta, diseno.telefono].filter(Boolean).join(" · "),
		diseno.empresa,
		"",
		"— Enviado con NomoTax · nomotax.io"
	].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
// supabase/functions/invitar-miembro/fuente.ts
function primeraDeJson(nombre) {
	const raw = Deno.env.get(nombre);
	if (!raw) return void 0;
	try {
		const obj = JSON.parse(raw);
		if (typeof obj === "string") return obj;
		if (obj && typeof obj === "object") return obj.default ?? Object.values(obj)[0];
	} catch {
		return raw;
	}
}
function clavePublica(req) {
	const k = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
	if (!k) throw new Error("Falta la clave pública de Supabase");
	return k;
}
function claveSecreta() {
	const k = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!k) throw new Error("Falta la clave secreta de Supabase");
	return k;
}
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};
function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...CORS,
			"Content-Type": "application/json"
		}
	});
}
function passwordProvisional() {
	const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	const bytes = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(14));
	return Array.from(bytes, (b) => abc[b % 56]).join("");
}
const ROLES = [
	"admin",
	"socio",
	"comercial",
	"empleado"
];
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
	const authHeader = req.headers.get("Authorization");
	if (!authHeader) return json({ error: "Falta la sesión" }, 401);
	const url = Deno.env.get("SUPABASE_URL");
	const asUser = createClient(url, clavePublica(req), { global: { headers: { Authorization: authHeader } } });
	const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
	if (!userData?.user) return json({ error: "Sesión no válida" }, 401);
	let body;
	try {
		body = await req.json();
	} catch {
		return json({ error: "Petición no válida" }, 400);
	}
	const admin = createClient(url, claveSecreta(), { auth: {
		autoRefreshToken: false,
		persistSession: false
	} });
	const puedeGestionar = async (cuenta) => {
		const { data } = await asUser.rpc("puede", {
			cuenta,
			modulo: "usuarios"
		});
		return data === true;
	};
	if (body.reenviar) {
		const { data: m } = await admin.from("miembros").select("*").eq("id", body.reenviar).single();
		if (!m) return json({ error: "Acceso no encontrado" }, 404);
		if (!await puedeGestionar(m.cuenta_id)) return json({ error: "No puedes gestionar los usuarios de esta empresa" }, 403);
		const { data: perfil } = await admin.from("profiles").select("role").eq("id", m.user_id).single();
		if (perfil?.role !== "member") return json({ error: "Esta persona tiene su propia cuenta en NomoTax: entra con su contraseña de siempre (o «He olvidado la contraseña»)." }, 400);
		const nueva = passwordProvisional();
		const { error } = await admin.auth.admin.updateUserById(m.user_id, { password: nueva });
		if (error) return json({ error: "No se ha podido cambiar la contraseña" }, 500);
		const r = await enviar(admin, {
			cuenta: m.cuenta_id,
			email: m.email,
			nombre: m.nombre,
			rol: m.rol,
			password: nueva
		});
		return json({
			id: m.id,
			email: m.email,
			password: nueva,
			bienvenida: r
		});
	}
	const cuenta = body.cuenta_id;
	const email = body.email?.trim().toLowerCase();
	const rol = body.rol;
	if (!cuenta) return json({ error: "Falta la empresa" }, 400);
	if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email no válido" }, 400);
	if (!rol || !ROLES.includes(rol)) return json({ error: "Elige un rol" }, 400);
	if (!await puedeGestionar(cuenta)) return json({ error: "No puedes gestionar los usuarios de esta empresa" }, 403);
	const { data: existente } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
	if (existente?.id === cuenta) return json({ error: "Ese email es el del titular de la empresa: ya tiene acceso a todo" }, 400);
	if (existente?.role === "advisor") return json({ error: "Ese email es el del asesor: ya tiene acceso a todo" }, 400);
	if (existente) {
		const { data: ya } = await admin.from("miembros").select("id").eq("cuenta_id", cuenta).eq("user_id", existente.id).maybeSingle();
		if (ya) return json({ error: "Esta persona ya tiene acceso a la empresa. Cambia su rol en la lista." }, 400);
	}
	let userId = existente?.id;
	let password = null;
	let creado = false;
	if (!userId) {
		password = passwordProvisional();
		const { data: nuevo, error } = await admin.auth.admin.createUser({
			email,
			password,
			email_confirm: true,
			user_metadata: { nombre: body.nombre ?? null }
		});
		if (error || !nuevo.user) return json({ error: "No se ha podido crear el usuario" }, 400);
		userId = nuevo.user.id;
		creado = true;
		await admin.from("profiles").update({
			role: "member",
			nombre: body.nombre?.trim() || null
		}).eq("id", userId);
	}
	const { data: miembro, error: eM } = await admin.from("miembros").insert({
		cuenta_id: cuenta,
		user_id: userId,
		email,
		nombre: body.nombre?.trim() || null,
		rol,
		permisos: rol === "admin" ? body.permisos ?? {} : {},
		trabajador_id: rol === "empleado" ? body.trabajador_id ?? null : null,
		invitado_por: userData.user.id
	}).select().single();
	if (eM || !miembro) {
		console.error("invitar-miembro", eM);
		if (creado) await admin.auth.admin.deleteUser(userId);
		return json({ error: eM?.message?.includes("trabajador") ? eM.message : "No se ha podido dar el acceso" }, 400);
	}
	let bienvenida = "no";
	if (body.bienvenida !== false) bienvenida = await enviar(admin, {
		cuenta,
		email,
		nombre: body.nombre ?? null,
		rol,
		password
	});
	return json({
		id: miembro.id,
		email,
		password,
		nuevo: creado,
		bienvenida
	});
});
const LIMPIA = (s) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();
/**
* Manda el acceso con la plantilla «Accesos» de la empresa, desde su correo propio (si lo tiene conectado)
* o desde info@nomotax.io con su nombre. Devuelve «error» si no ha podido salir (la contraseña se enseña igualmente en la app).
*/
async function enviar(admin, d) {
	try {
		const { data: perfil } = await admin.from("profiles").select("*").eq("id", d.cuenta).single();
		const p = perfil ?? {};
		const empresa = LIMPIA(p.nombre_comercial || p.nombre || p.email || "tu empresa");
		const respuesta = (p.email_respuesta || p.email || "").trim();
		const vars = {
			nombre: LIMPIA(d.nombre),
			empresa,
			rol: NOMBRE_ROL[d.rol],
			funciones: FUNCIONES_ROL[d.rol],
			usuario: d.email,
			contrasena: d.password ?? ""
		};
		const { asunto, mensaje } = correoDePlantilla("acceso", {
			asunto: p.acceso_asunto,
			mensaje: p.acceso_mensaje
		}, vars);
		const diseno = {
			empresa,
			color: p.color_marca,
			cabecera: p.color_cabecera,
			boton: p.color_boton,
			logo: null,
			respuesta,
			telefono: p.telefono
		};
		const mail = {
			to: d.email,
			subject: asunto,
			text: textoCorreoPlantilla("acceso", mensaje, vars, diseno),
			html: htmlCorreoPlantilla("acceso", mensaje, vars, diseno)
		};
		const propio = await smtpActivo(admin, d.cuenta);
		if (propio) {
			const c = propio.config;
			try {
				await transporte(c, propio.pass).sendMail({
					...mail,
					from: {
						name: c.remitente_nombre || empresa,
						address: c.remitente_email
					},
					...respuesta && respuesta.toLowerCase() !== c.remitente_email.toLowerCase() ? { replyTo: respuesta } : {}
				});
			} catch (e) {
				console.error("Correo de acceso (SMTP de la empresa)", e);
				await admin.from("smtp_empresas").update({ ultimo_error: explicarErrorSmtp(e) }).eq("owner_id", d.cuenta);
				return "error";
			}
			return "enviada";
		}
		const pass = Deno.env.get("SMTP_PASSWORD");
		if (!pass) {
			console.error("Falta el secreto SMTP_PASSWORD (contraseña del buzón info@nomotax.io)");
			return "error";
		}
		const usuario = Deno.env.get("SMTP_USER") ?? "info@nomotax.io";
		await nodemailer.createTransport({
			host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com",
			port: 465,
			secure: true,
			auth: {
				user: usuario,
				pass
			}
		}).sendMail({
			...mail,
			from: {
				name: `${empresa} vía NomoTax`,
				address: usuario
			},
			...respuesta ? { replyTo: respuesta } : {},
			bcc: "pablo@nomotax.io"
		});
		return "enviada";
	} catch (e) {
		console.error("Correo de acceso", e);
		return "error";
	}
}
