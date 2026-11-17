// GENERADO con `node scripts/empaquetar-facturar.mjs smtp-config` a partir de fuente.ts y src/lib.
// Pega este archivo entero en Supabase → Edge Functions → smtp-config. No lo edites a mano.

import { createClient } from "npm:@supabase/supabase-js@^2.119.0";
import nodemailer from "npm:nodemailer@6.9.16";
// supabase/functions/_compartido/smtp.ts
const b64 = (bytes) => {
	let s = "";
	for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
	return btoa(s);
};
const desdeB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function claveAes() {
	const secreto = Deno.env.get("SMTP_CLAVE");
	if (!secreto || secreto.length < 24) throw new Error("Falta el secreto SMTP_CLAVE (texto largo y aleatorio)");
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secreto));
	return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}
/** «v1:iv:datos», AES-GCM 256 */
async function cifrar(texto) {
	const iv = crypto.getRandomValues(/* @__PURE__ */ new Uint8Array(12));
	const datos = new Uint8Array(await crypto.subtle.encrypt({
		name: "AES-GCM",
		iv
	}, await claveAes(), new TextEncoder().encode(texto)));
	return `v1:${b64(iv)}:${b64(datos)}`;
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
/** Solo servidores de correo de verdad: nada de localhost, IPs privadas ni puertos raros */
function hostPermitido(host) {
	const h = host.trim().toLowerCase();
	if (!/^[a-z0-9.-]+$/.test(h) || !h.includes(".") || h.length > 253) return false;
	if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
	const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (ip) {
		const [a, b] = [Number(ip[1]), Number(ip[2])];
		if (a === 10 || a === 127 || a === 0 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127) return false;
	}
	return true;
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
// supabase/functions/smtp-config/fuente.ts
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
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
	status,
	headers: {
		...CORS,
		"Content-Type": "application/json"
	}
});
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const linea = (s, max = 200) => String(s ?? "").replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim().slice(0, max);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;"
})[c]);
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
	const authHeader = req.headers.get("Authorization");
	if (!authHeader) return json({ error: "Falta la sesión" }, 401);
	const url = Deno.env.get("SUPABASE_URL");
	const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
	const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	if (!publica || !secreta) return json({ error: "Faltan las claves de Supabase" }, 500);
	const asUser = createClient(url, publica, { global: { headers: { Authorization: authHeader } } });
	const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
	const user = userData?.user;
	if (!user) return json({ error: "Sesión no válida" }, 401);
	const admin = createClient(url, secreta, { auth: {
		persistSession: false,
		autoRefreshToken: false
	} });
	let body;
	try {
		body = await req.json();
	} catch {
		return json({ error: "Petición no válida" }, 400);
	}
	const cuenta = String(body.cuenta_id ?? "");
	if (!/^[0-9a-f-]{36}$/i.test(cuenta)) return json({ error: "Falta la empresa" }, 400);
	const { data: puede, error: ePuede } = await asUser.rpc("puede", {
		cuenta,
		modulo: "empresa"
	});
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
		await admin.from("smtp_empresas").update({
			activo: false,
			updated_at: (/* @__PURE__ */ new Date()).toISOString()
		}).eq("owner_id", cuenta);
		return json({
			ok: true,
			activo: false
		});
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
		if (![
			25,
			465,
			587,
			2525
		].includes(puerto)) return json({ error: "El puerto tiene que ser 465, 587, 25 o 2525" }, 400);
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
			updated_at: (/* @__PURE__ */ new Date()).toISOString()
		});
		if (eCfg) return json({ error: `No se ha podido guardar: ${eCfg.message}` }, 500);
		if (password) try {
			const { error: eClave } = await admin.from("smtp_claves").upsert({
				owner_id: cuenta,
				clave_cifrada: await cifrar(password)
			});
			if (eClave) throw new Error(eClave.message);
		} catch (e) {
			return json({ error: `No se ha podido guardar la contraseña: ${e instanceof Error ? e.message : e}` }, 500);
		}
	} else if (accion !== "probar") return json({ error: "Acción desconocida" }, 400);
	const { data: cfg } = await admin.from("smtp_empresas").select("*").eq("owner_id", cuenta).maybeSingle();
	const { data: clave } = await admin.from("smtp_claves").select("clave_cifrada").eq("owner_id", cuenta).maybeSingle();
	if (!cfg || !clave) return json({ error: "Primero guarda la configuración" }, 400);
	const c = cfg;
	const destino = (user.email ?? "").toLowerCase();
	let error = null;
	try {
		const t = transporte(c, await descifrar(clave.clave_cifrada));
		await t.verify();
		if (destino) await t.sendMail({
			from: {
				name: c.remitente_nombre || c.remitente_email,
				address: c.remitente_email
			},
			to: destino,
			subject: "Prueba de correo · NomoTax",
			text: `Tu correo está conectado.\n\nA partir de ahora, las facturas que envíes desde NomoTax saldrán desde ${c.remitente_email}.\n\n— NomoTax`,
			html: `<div style="font:15px/1.6 Helvetica,Arial,sans-serif;color:#111110;max-width:520px"><p><strong>Tu correo está conectado.</strong></p><p>A partir de ahora, las facturas que envíes desde NomoTax saldrán desde <strong>${esc(c.remitente_email)}</strong>.</p><p style="color:#9a9a94;font-size:12px">NomoTax · nomotax.io</p></div>`
		});
	} catch (e) {
		console.error("smtp-config:", e instanceof Error ? e.message : e);
		error = e instanceof Error && e.message.includes("SMTP_CLAVE") ? e.message : explicarErrorSmtp(e);
	}
	const ahora = (/* @__PURE__ */ new Date()).toISOString();
	await admin.from("smtp_empresas").update(error ? {
		activo: false,
		ultimo_error: error,
		updated_at: ahora
	} : {
		activo: true,
		verificado_at: ahora,
		ultimo_error: null,
		updated_at: ahora
	}).eq("owner_id", cuenta);
	if (error) return json({
		ok: false,
		activo: false,
		error
	});
	return json({
		ok: true,
		activo: true,
		enviado_a: destino || null
	});
});
