// GENERADO con `node scripts/empaquetar-facturar.mjs jornada` a partir de fuente.ts y src/lib.
// Pega este archivo entero en Supabase → Edge Functions → jornada. No lo edites a mano.

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
// src/lib/fichaje.ts
const NOMBRE_TIPO = {
	entrada: "Entrada",
	pausa: "Inicio de pausa",
	reanudar: "Fin de pausa",
	salida: "Salida"
};
/** Fichajes que cuentan: válidos y no sustituidos por una corrección válida */
function vigentes(fs) {
	const anulados = new Set(fs.filter((f) => f.estado === "valido" && f.anula_id).map((f) => f.anula_id));
	return fs.filter((f) => f.estado === "valido" && !anulados.has(f.id)).sort((a, b) => a.momento.localeCompare(b.momento));
}
/** Día local (AAAA-MM-DD) de un instante */
function diaLocal(iso) {
	const d = new Date(iso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/**
* Agrupa por día (el de la entrada) y suma el tiempo trabajado y de pausa. `ahora` cierra el tramo abierto
* (con `cerrarAbierto = false` no se cuenta: informe semanal). `diaDe` da el día de un instante (el informe
* usa la hora de Madrid aunque el servidor esté en UTC).
*/
function resumenDias(fs, ahora = /* @__PURE__ */ new Date(), diaDe = diaLocal, cerrarAbierto = true) {
	const dias = /* @__PURE__ */ new Map();
	let actual = null;
	let desde = null;
	let pausaDesde = null;
	for (const f of vigentes(fs)) {
		const t = new Date(f.momento).getTime();
		if (f.tipo === "entrada" && actual && (desde !== null || pausaDesde !== null)) actual.abierto = true;
		if (f.tipo === "entrada" || !actual) {
			const d = diaDe(f.momento);
			actual = dias.get(d) ?? {
				dia: d,
				entrada: null,
				salida: null,
				trabajadoMin: 0,
				pausaMin: 0,
				abierto: false,
				fichajes: []
			};
			dias.set(d, actual);
		}
		actual.fichajes.push(f);
		if (f.tipo === "entrada") {
			actual.entrada ??= f.momento;
			desde = t;
			pausaDesde = null;
		} else if (f.tipo === "pausa" && desde !== null) {
			actual.trabajadoMin += (t - desde) / 6e4;
			desde = null;
			pausaDesde = t;
		} else if (f.tipo === "reanudar") {
			if (pausaDesde !== null) actual.pausaMin += (t - pausaDesde) / 6e4;
			pausaDesde = null;
			desde = t;
		} else if (f.tipo === "salida") {
			if (desde !== null) actual.trabajadoMin += (t - desde) / 6e4;
			if (pausaDesde !== null) actual.pausaMin += (t - pausaDesde) / 6e4;
			actual.salida = f.momento;
			desde = pausaDesde = null;
		}
	}
	if (actual && (desde !== null || pausaDesde !== null)) {
		actual.abierto = true;
		if (actual.dia !== diaDe(ahora.toISOString())) cerrarAbierto = false;
		if (cerrarAbierto && desde !== null) actual.trabajadoMin += (ahora.getTime() - desde) / 6e4;
		if (cerrarAbierto && pausaDesde !== null) actual.pausaMin += (ahora.getTime() - pausaDesde) / 6e4;
	}
	return [...dias.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}
// src/lib/ausencias.ts
const NOMBRE_TIPO_AUSENCIA = {
	vacaciones: "Vacaciones",
	permiso: "Permiso",
	baja: "Baja"
};
/** Permisos retribuidos del art. 37.3 y 37.9 del Estatuto de los Trabajadores (el convenio puede mejorarlos) */
const SUBTIPOS_PERMISO = [
	{
		id: "matrimonio",
		nombre: "Matrimonio o registro de pareja de hecho",
		ayuda: "15 días naturales (art. 37.3.a ET)."
	},
	{
		id: "familiar",
		nombre: "Accidente, enfermedad grave u hospitalización de un familiar",
		ayuda: "5 días (art. 37.3.b ET)."
	},
	{
		id: "fallecimiento",
		nombre: "Fallecimiento de un familiar",
		ayuda: "2 días; 4 si tienes que desplazarte (art. 37.3.b bis ET)."
	},
	{
		id: "mudanza",
		nombre: "Traslado de domicilio",
		ayuda: "1 día (art. 37.3.c ET)."
	},
	{
		id: "deber",
		nombre: "Deber público o personal inexcusable",
		ayuda: "El tiempo indispensable (art. 37.3.d ET)."
	},
	{
		id: "prenatal",
		nombre: "Exámenes prenatales o preparación al parto",
		ayuda: "El tiempo indispensable (art. 37.3.f ET)."
	},
	{
		id: "fuerza_mayor",
		nombre: "Urgencia familiar (fuerza mayor)",
		ayuda: "Hasta 4 días al año, también por horas (art. 37.9 ET)."
	},
	{
		id: "medico",
		nombre: "Visita médica",
		ayuda: "Según tu convenio."
	},
	{
		id: "asuntos_propios",
		nombre: "Asuntos propios",
		ayuda: "Solo si lo da tu convenio o la empresa."
	},
	{
		id: "otro",
		nombre: "Otro motivo",
		ayuda: "Explica el motivo."
	}
];
const SUBTIPOS_BAJA = [
	{
		id: "enfermedad",
		nombre: "Enfermedad común o accidente no laboral"
	},
	{
		id: "accidente_trabajo",
		nombre: "Accidente de trabajo o enfermedad profesional"
	},
	{
		id: "nacimiento",
		nombre: "Nacimiento y cuidado de menor"
	},
	{
		id: "riesgo_embarazo",
		nombre: "Riesgo durante el embarazo o la lactancia"
	},
	{
		id: "otro",
		nombre: "Otra"
	}
];
/** «Vacaciones», «Permiso · Traslado de domicilio», «Baja · Enfermedad común…» */
function nombreAusencia(a, corto = false) {
	const base = NOMBRE_TIPO_AUSENCIA[a.tipo];
	if (corto || !a.subtipo || a.subtipo === "otro") return base;
	const sub = (a.tipo === "permiso" ? SUBTIPOS_PERMISO : a.tipo === "baja" ? SUBTIPOS_BAJA : []).find((s) => s.id === a.subtipo);
	return sub ? `${base} · ${sub.nombre}` : base;
}
/** Cuenta en el saldo, el calendario y el informe: pendiente o aprobada */
const vigente = (a) => a.estado === "pendiente" || a.estado === "aprobada";
const aFecha = (iso) => /* @__PURE__ */ new Date(iso.slice(0, 10) + "T12:00:00Z");
const aIso = (d) => d.toISOString().slice(0, 10);
function sumarDias(iso, n) {
	const d = aFecha(iso);
	d.setUTCDate(d.getUTCDate() + n);
	return aIso(d);
}
/** 0 = domingo … 6 = sábado */
const diaSemana = (iso) => aFecha(iso).getUTCDay();
const esFinDeSemana = (iso) => diaSemana(iso) === 0 || diaSemana(iso) === 6;
/** Todos los días entre dos fechas, ambas incluidas */
function diasEntre(desde, hasta) {
	const out = [];
	for (let d = desde; d <= hasta && out.length < 800; d = sumarDias(d, 1)) out.push(d);
	return out;
}
/** Lunes a viernes que no son festivo */
function diasLaborables(desde, hasta, festivos) {
	return diasEntre(desde, hasta).filter((d) => !esFinDeSemana(d) && !festivos.has(d));
}
/** Días laborables de una ausencia (una baja abierta, hasta `hoy`) */
function diasDeAusencia(a, festivos, hoy) {
	const fin = a.hasta ?? (hoy < a.desde ? a.desde : hoy);
	return diasLaborables(a.desde, fin, festivos).length;
}
/** La ausencia vigente que cubre ese día (aprobada antes que pendiente) */
function ausenciaDelDia(dia, as) {
	const cubre = as.filter((a) => vigente(a) && a.desde <= dia && (a.hasta ?? "9999-12-31") >= dia);
	return cubre.find((a) => a.estado === "aprobada") ?? cubre[0] ?? null;
}
/** «del 21 al 31 de diciembre», «el 10 de diciembre», «desde el 16 de noviembre» */
function textoFechas(a, conAnio = false) {
	const f = (iso, anio) => aFecha(iso).toLocaleDateString("es-ES", {
		day: "numeric",
		month: "long",
		...anio ? { year: "numeric" } : {},
		timeZone: "UTC"
	});
	if (!a.hasta) return `desde el ${f(a.desde, conAnio)}`;
	if (a.hasta === a.desde) return `el ${f(a.desde, conAnio)}`;
	return `del ${a.desde.slice(0, 7) === a.hasta.slice(0, 7) ? String(Number(a.desde.slice(8, 10))) : f(a.desde, conAnio && a.desde.slice(0, 4) !== a.hasta.slice(0, 4))} al ${f(a.hasta, conAnio)}`;
}
// src/lib/informeJornada.ts
/**
* Informe semanal de jornada (lo manda la Edge Function «jornada» cada lunes).
* Por trabajador y semana (lunes a domingo, hora de Madrid): lo fichado frente a su jornada,
* sin pedir que fiche los días de vacaciones, permiso, baja o festivo.
* Cálculo puro: lo prueba test-data/probar-informe-jornada.ts.
*/
const ZONA = "Europe/Madrid";
/** Día (AAAA-MM-DD) de un instante en Madrid */
const diaMadrid = (iso) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: ZONA });
/** «9:02» en Madrid */
const horaMadrid = (iso) => new Date(iso).toLocaleTimeString("es-ES", {
	hour: "numeric",
	minute: "2-digit",
	timeZone: ZONA
});
/** Lunes de la semana anterior a `hoy` (si hoy es lunes, el de hace 7 días) */
function lunesAnterior(hoy) {
	return sumarDias(sumarDias(hoy, -((diaSemana(hoy) + 6) % 7)), -7);
}
const CORTO = [
	"Dom",
	"Lun",
	"Mar",
	"Mié",
	"Jue",
	"Vie",
	"Sáb"
];
const etiquetaDia = (iso) => `${CORTO[diaSemana(iso)]} ${Number(iso.slice(8, 10))}`;
function informeSemana(p) {
	const { trabajador: t, lunes } = p;
	const domingo = sumarDias(lunes, 6);
	const horasSemana = Number(t.jornada === "parcial" ? t.horas_semana || 0 : t.horas_semana || p.horasConvenio || 40);
	const porDia = Math.round(horasSemana * 60 / 5);
	const mios = p.fichajes.filter((f) => f.trabajador_id === t.id);
	const resumen = new Map(resumenDias(mios, /* @__PURE__ */ new Date(), diaMadrid, false).map((d) => [d.dia, d]));
	const pendientes = new Set(mios.filter((f) => f.estado === "pendiente").map((f) => diaMadrid(f.momento)));
	const susAusencias = p.ausencias.filter((a) => a.trabajador_id === t.id);
	const dias = [];
	for (const dia of diasEntre(lunes, domingo)) {
		const r = resumen.get(dia);
		const finde = diaSemana(dia) === 0 || diaSemana(dia) === 6;
		const base = {
			dia,
			etiqueta: etiquetaDia(dia),
			estado: "ok",
			esperadoMin: 0,
			fichadoMin: Math.round(r?.trabajadoMin ?? 0),
			pausaMin: Math.round(r?.pausaMin ?? 0),
			entrada: r?.entrada ?? null,
			salida: r?.salida ?? null,
			texto: null
		};
		const fueraContrato = dia < t.fecha_inicio || Boolean(t.fecha_baja && dia > t.fecha_baja);
		const aus = ausenciaDelDia(dia, susAusencias);
		const fest = p.festivos.get(dia);
		if (finde) {
			if (r) dias.push({
				...base,
				estado: r.abierto ? pendientes.has(dia) ? "correccion" : "salida" : "finde"
			});
			continue;
		}
		if (fueraContrato) {
			if (r) dias.push({
				...base,
				estado: "fuera"
			});
			continue;
		}
		if (fest) {
			dias.push({
				...base,
				estado: "festivo",
				texto: fest
			});
			continue;
		}
		if (aus) {
			dias.push({
				...base,
				estado: "ausencia",
				texto: nombreAusencia(aus, true),
				ausenciaTipo: aus.tipo,
				ausenciaPendiente: aus.estado === "pendiente"
			});
			continue;
		}
		const esperado = {
			...base,
			esperadoMin: porDia
		};
		if (!r) dias.push({
			...esperado,
			estado: pendientes.has(dia) ? "correccion" : "falta"
		});
		else if (r.abierto) dias.push({
			...esperado,
			estado: pendientes.has(dia) ? "correccion" : "salida"
		});
		else dias.push(esperado);
	}
	const fichadoMin = dias.reduce((s, d) => s + d.fichadoMin, 0);
	const esperadoMin = dias.reduce((s, d) => s + d.esperadoMin, 0);
	const sinFichar = dias.filter((d) => d.estado === "falta").length;
	const sinSalida = dias.filter((d) => d.estado === "salida").length;
	const correcciones = dias.filter((d) => d.estado === "correccion").length;
	const diasAusencia = {};
	for (const d of dias) if (d.ausenciaTipo) diasAusencia[d.ausenciaTipo] = (diasAusencia[d.ausenciaTipo] ?? 0) + 1;
	const estado = sinFichar + sinSalida > 0 ? "incompleto" : fichadoMin < esperadoMin - 60 && correcciones === 0 ? "de_menos" : "completo";
	return {
		trabajadorId: t.id,
		nombre: t.nombre,
		lunes,
		domingo,
		horasSemana,
		dias,
		fichadoMin,
		esperadoMin,
		sinFichar,
		sinSalida,
		correcciones,
		estado,
		diasAusencia
	};
}
/** «7 h 30», «45 min», «−16 h 30» */
function duracionCorta(min) {
	const s = min < 0 ? "−" : "";
	const m = Math.abs(Math.round(min));
	const h = Math.floor(m / 60);
	return s + (h ? `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}` : `${m} min`);
}
/** «del lunes 23 al domingo 29 de noviembre» */
function textoSemana(lunes) {
	const dom = sumarDias(lunes, 6);
	const mes = (iso) => (/* @__PURE__ */ new Date(iso + "T12:00:00Z")).toLocaleDateString("es-ES", {
		month: "long",
		timeZone: "UTC"
	});
	const d = (iso) => Number(iso.slice(8, 10));
	return mes(lunes) === mes(dom) ? `del lunes ${d(lunes)} al domingo ${d(dom)} de ${mes(dom)}` : `del lunes ${d(lunes)} de ${mes(lunes)} al domingo ${d(dom)} de ${mes(dom)}`;
}
// src/lib/festivosDatos.ts
/** Comunidad autónoma de cada provincia (nombres de src/lib/paises.ts) */
const COMUNIDAD_DE_PROVINCIA = {
	"Álava": "PV",
	"Albacete": "CM",
	"Alicante": "VC",
	"Almería": "AN",
	"Ávila": "CL",
	"Badajoz": "EX",
	"Illes Balears": "IB",
	"Barcelona": "CT",
	"Burgos": "CL",
	"Cáceres": "EX",
	"Cádiz": "AN",
	"Castellón": "VC",
	"Ciudad Real": "CM",
	"Córdoba": "AN",
	"A Coruña": "GA",
	"Cuenca": "CM",
	"Girona": "CT",
	"Granada": "AN",
	"Guadalajara": "CM",
	"Gipuzkoa": "PV",
	"Huelva": "AN",
	"Huesca": "AR",
	"Jaén": "AN",
	"León": "CL",
	"Lleida": "CT",
	"La Rioja": "RI",
	"Lugo": "GA",
	"Madrid": "MD",
	"Málaga": "AN",
	"Murcia": "MC",
	"Navarra": "NC",
	"Ourense": "GA",
	"Asturias": "AS",
	"Palencia": "CL",
	"Las Palmas": "CN",
	"Pontevedra": "GA",
	"Salamanca": "CL",
	"Santa Cruz de Tenerife": "CN",
	"Cantabria": "CB",
	"Segovia": "CL",
	"Sevilla": "AN",
	"Soria": "CL",
	"Tarragona": "CT",
	"Teruel": "AR",
	"Toledo": "CM",
	"Valencia": "VC",
	"Valladolid": "CL",
	"Bizkaia": "PV",
	"Zamora": "CL",
	"Zaragoza": "AR",
	"Ceuta": "CE",
	"Melilla": "ML"
};
/** [fecha, nombre] de cada fiesta nacional o autonómica, por comunidad */
const FESTIVOS = {
	AN: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-02-28", "Día de Andalucía"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-01", "Día de Andalucía"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-08-16", "Lunes siguiente a asunción de la Virgen"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	AR: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-23", "San Jorge/Día de Aragón"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-04-23", "San Jorge/Día de Aragón"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-08-16", "Lunes siguiente a asunción de la Virgen"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	AS: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-09-08", "Día de Asturias"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-08-16", "Lunes siguiente a asunción de la Virgen"],
		["2027-09-08", "Día de Asturias"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	IB: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-03-02", "Lunes siguiente al Día de les Illes Balears"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-06", "Lunes de Pascua"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2026-12-26", "San Esteban"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-01", "Día de les Illes Balears"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-03-29", "Lunes de Pascua"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	CN: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-05-30", "Día de Canarias"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-08-16", "Lunes siguiente a asunción de la Virgen"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	CB: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-07-28", "Día de las Instituciones de Cantabria"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-09-15", "La Bien Aparecida"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-07-28", "Día de las Instituciones de Cantabria"],
		["2027-09-15", "La Bien Aparecida"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	CM: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-06", "Lunes de Pascua"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-06-04", "Corpus Christi"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-05-27", "Corpus Christi"],
		["2027-05-31", "Día de Castilla-La Mancha"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	CL: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-23", "Fiesta de Castilla y León"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-04-23", "Fiesta de Castilla y León"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-08-16", "Lunes siguiente a asunción de la Virgen"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	CT: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-06", "Lunes de Pascua"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-06-24", "San Juan"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-09-11", "Fiesta Nacional de Cataluña"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2026-12-26", "San Esteban"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-26", "Viernes Santo"],
		["2027-03-29", "Lunes de Pascua"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-06-24", "Día de San Juan"],
		["2027-09-11", "Fiesta Nacional de Cataluña"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	EX: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-09-08", "Día de Extremadura"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-09-08", "Día de Extremadura"],
		["2027-10-11", "Sustitución 15 de agosto"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	GA: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-03-19", "San José"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-06-24", "San Juan"],
		["2026-07-25", "Santiago Apóstol/Día Nacional de Galicia"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-19", "San José"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-05-17", "Día de las Letras Gallegas"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	MD: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-05-02", "Fiesta de la Comunidad de Madrid"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-19", "San José"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-08-16", "Lunes siguiente a asunción de la Virgen"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	MC: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-03-19", "San José"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-06-09", "Día de la Región de Murcia"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-19", "San José"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-06-09", "Día de la Región de Murcia"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	NC: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-03-19", "San José"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-06", "Lunes de Pascua"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-11-02", "Día siguiente a Todos los Santos"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-19", "San José"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-03-29", "Lunes de Pascua"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	PV: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-03-19", "San José"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-06", "Lunes de Pascua"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-07-25", "Santiago Apóstol/Día Nacional de Galicia"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-03-29", "Lunes de Pascua"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-10-07", "Aniversario 1er Gobierno Euskadi"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	RI: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-06", "Lunes de Pascua"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-06-09", "Día de la Rioja"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-03-29", "Lunes de Pascua"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-06-09", "Día de La Rioja"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	VC: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-03-19", "San José"],
		["2026-04-03", "Viernes Santo"],
		["2026-04-06", "Lunes de Pascua"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-06-24", "San Juan"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-09", "Día de la Comunitat Valenciana"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-19", "San José"],
		["2027-03-26", "Viernes Santo"],
		["2027-03-29", "Lunes de Pascua"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-10-09", "Día de la Comunitat Valenciana"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	CE: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-05-27", "Fiesta Sacrificio-Eidul Adha"],
		["2026-08-05", "Nuestra Señora de África"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-09-02", "Día de Ceuta"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-05-17", "Eidul Adha-Fiesta Sacrificio"],
		["2027-08-05", "Nuestra Señora de África"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	],
	ML: [
		["2026-01-01", "Año Nuevo"],
		["2026-01-06", "Epifanía del Señor"],
		["2026-03-20", "Fiesta del Eid Fitr"],
		["2026-04-02", "Jueves Santo"],
		["2026-04-03", "Viernes Santo"],
		["2026-05-01", "Fiesta del Trabajo"],
		["2026-05-27", "Fiesta Sacrificio-Aid al Adha"],
		["2026-08-15", "Asunción de la Virgen"],
		["2026-10-12", "Fiesta Nacional de España"],
		["2026-12-07", "Lunes siguiente al Día de la Constitución Española"],
		["2026-12-08", "Inmaculada Concepción"],
		["2026-12-25", "Natividad del Señor"],
		["2027-01-01", "Año Nuevo"],
		["2027-01-06", "Epifanía del Señor"],
		["2027-03-10", "Fiesta del Eid Fitr"],
		["2027-03-25", "Jueves Santo"],
		["2027-03-26", "Viernes Santo"],
		["2027-05-01", "Fiesta del Trabajo"],
		["2027-05-17", "Fiesta Sacrificio-Aid Al Adha"],
		["2027-10-12", "Fiesta Nacional de España"],
		["2027-11-01", "Todos los Santos"],
		["2027-12-06", "Día de la Constitución Española"],
		["2027-12-08", "Inmaculada Concepción"],
		["2027-12-25", "Natividad del Señor"]
	]
};
"AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(" ");
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
/** Por orden de código: las dos primeras cifras del código postal */
const PROVINCIAS = [
	"Álava",
	"Albacete",
	"Alicante",
	"Almería",
	"Ávila",
	"Badajoz",
	"Illes Balears",
	"Barcelona",
	"Burgos",
	"Cáceres",
	"Cádiz",
	"Castellón",
	"Ciudad Real",
	"Córdoba",
	"A Coruña",
	"Cuenca",
	"Girona",
	"Granada",
	"Guadalajara",
	"Gipuzkoa",
	"Huelva",
	"Huesca",
	"Jaén",
	"León",
	"Lleida",
	"La Rioja",
	"Lugo",
	"Madrid",
	"Málaga",
	"Murcia",
	"Navarra",
	"Ourense",
	"Asturias",
	"Palencia",
	"Las Palmas",
	"Pontevedra",
	"Salamanca",
	"Santa Cruz de Tenerife",
	"Cantabria",
	"Segovia",
	"Sevilla",
	"Soria",
	"Tarragona",
	"Teruel",
	"Toledo",
	"Valencia",
	"Valladolid",
	"Bizkaia",
	"Zamora",
	"Zaragoza",
	"Ceuta",
	"Melilla"
];
[...PROVINCIAS].sort((a, b) => a.localeCompare(b, "es"));
const ALIAS_PROVINCIA = {
	araba: "Álava",
	arabaalava: "Álava",
	alavaaraba: "Álava",
	alacant: "Alicante",
	alicantealacant: "Alicante",
	baleares: "Illes Balears",
	islasbaleares: "Illes Balears",
	balears: "Illes Balears",
	castello: "Castellón",
	castellondelaplana: "Castellón",
	castellonsecastello: "Castellón",
	coruna: "A Coruña",
	lacoruna: "A Coruña",
	gerona: "Girona",
	guipuzcoa: "Gipuzkoa",
	lerida: "Lleida",
	orense: "Ourense",
	vizcaya: "Bizkaia",
	nafarroa: "Navarra",
	comunidadforaldenavarra: "Navarra",
	comunidaddemadrid: "Madrid",
	regiondemurcia: "Murcia",
	principadodeasturias: "Asturias",
	tenerife: "Santa Cruz de Tenerife",
	grancanaria: "Las Palmas",
	valenciavalencia: "Valencia",
	larioja: "La Rioja",
	rioja: "La Rioja"
};
const INDICE_PROVINCIA = new Map(PROVINCIAS.map((p) => [norm(p), p]));
/** Nombre de la lista para lo que venga escrito («Vizcaya» → «Bizkaia»); null si no es una provincia */
function provinciaDe(texto) {
	if (!texto?.trim()) return null;
	const n = norm(texto);
	return INDICE_PROVINCIA.get(n) ?? ALIAS_PROVINCIA[n] ?? null;
}
// src/lib/festivos.ts
/**
* Festivos que cuenta la app: nacionales y autonómicos del BOE (festivosDatos.ts) según la provincia del
* centro de trabajo (o de la empresa), más los locales que pone cada empresa (tabla festivos_empresa).
* Lo usan las vacaciones (días laborables) y el informe semanal de jornada.
*/
/** Comunidad autónoma de una provincia escrita de cualquier forma («Vizcaya», «Barcelona»…) */
function comunidadDe(provincia) {
	const p = provinciaDe(provincia);
	return p ? COMUNIDAD_DE_PROVINCIA[p] ?? null : null;
}
/** Las fiestas que están en todas las comunidades (si no se sabe dónde trabaja) */
let comunes = null;
function festivosComunes() {
	if (comunes) return comunes;
	const listas = Object.values(FESTIVOS);
	comunes = listas[0].filter(([f]) => listas.every((l) => l.some(([g]) => g === f)));
	return comunes;
}
/** fecha (AAAA-MM-DD) → nombre de la fiesta. Locales al final: si coinciden, manda el nombre local. */
function festivosDe(comunidad, locales = []) {
	const m = new Map(comunidad ? FESTIVOS[comunidad] : festivosComunes());
	for (const l of locales) m.set(l.fecha, l.nombre);
	return m;
}
/** Provincia donde trabaja: la de su centro de trabajo; si no tiene, la de la empresa */
function provinciaDeTrabajo(centroId, centros, empresa) {
	return (centroId ? centros.find((x) => x.id === centroId) : null)?.provincia || (centros.length === 1 ? centros[0].provincia : null) || empresa?.provincia || null;
}
// src/lib/correoJornada.ts
/**
* Correos del registro de jornada (Edge Function «jornada»): informe semanal al trabajador, informe del
* equipo al propietario y avisos de ausencias. Diseño aprobado por Pablo (maquetas de test-data/).
* HTML de correo: tablas y estilos en línea. Botones sin flecha.
*/
const APP_URL = "https://clientes.nomotax.io";
const LOGO = "https://clientes.nomotax.io/logo.png";
const F = "Helvetica,Arial,sans-serif";
const MONO = "Menlo,Consolas,monospace";
const GRIS = "#6b6b66";
const LINEA = "#e7e7e2";
function esc(s) {
	return String(s ?? "").replace(/[&<>"]/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;"
	})[c]);
}
const pila = (nombre) => nombre.trim().split(/\s+/)[0] ?? "";
function chip(tono, texto) {
	const [bg, fg] = {
		ok: ["#CDF564", "#111110"],
		falta: ["#fde7e4", "#a8200d"],
		salida: ["#fff1d6", "#8a5a00"],
		pend: ["#e8eefc", "#2a4a9c"],
		aus: ["#eef9cf", "#3d5200"],
		gris: ["#efefea", "#4a4a45"]
	}[tono];
	return `<span style="display:inline-block;margin:3px 4px 0 0;padding:2px 8px;border-radius:999px;background:${bg};color:${fg};font:600 11px/1.6 ${F};white-space:nowrap">${esc(texto)}</span>`;
}
function cabecera(empresa, etiqueta) {
	return `
  <tr><td style="background:#111110;padding:24px 28px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${LOGO}" width="40" height="40" alt="" style="display:block;border-radius:8px"></td>
      <td style="padding-left:12px;font:600 17px/1.3 ${F};color:#ffffff">${esc(empresa)}<br>
        <span style="font:500 11px ${F};letter-spacing:2px;color:#CDF564">${etiqueta}</span></td>
    </tr></table>
  </td></tr>`;
}
function barra(hecho, total) {
	const p = total > 0 ? Math.max(0, Math.min(100, Math.round(hecho / total * 100))) : 100;
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border-radius:999px;overflow:hidden;background:#e7e7e2"><tr>
    <td width="${Math.max(p, 1)}%" style="height:10px;background:${p >= 100 ? "#CDF564" : "#111110"};font-size:0;line-height:0">&nbsp;</td>
    ${p < 100 ? `<td width="${100 - p}%" style="height:10px;font-size:0;line-height:0">&nbsp;</td>` : ""}
  </tr></table>`;
}
const cifra = (titulo, valor, destacar = false) => `
  <td valign="top" style="padding:0 6px 0 0;font:13px/1.4 ${F};color:#111110">
    <span style="color:${GRIS};font-size:11px;letter-spacing:1px">${titulo}</span><br>
    <strong style="font:600 19px/1.4 ${MONO};${destacar ? "background:#CDF564;padding:1px 6px;border-radius:6px;" : ""}white-space:nowrap">${valor}</strong>
  </td>`;
const cajaLegal = (titulo, texto) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 6px 0;border-left:3px solid #111110;background:#f7f7f5;border-radius:0 12px 12px 0">
    <tr><td style="padding:16px 18px;font:13px/1.6 ${F};color:#3a3a36">
      <strong style="display:block;margin-bottom:4px;color:#111110;font-size:14px">${titulo}</strong>${texto}
    </td></tr></table>`;
const boton = (href, texto) => `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px 0"><tr><td style="background:#111110;border-radius:999px">
    <a href="${href}" style="display:inline-block;padding:14px 26px;font:600 15px ${F};color:#ffffff;text-decoration:none">${texto}</a>
  </td></tr></table>`;
function envoltorio(filas, pie, prueba) {
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:28px 10px"><tr><td align="center">
${prueba ? `<p style="font:600 12px ${F};color:#a8200d;margin:0 0 10px 0">PRUEBA: este correo solo te llega a ti</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid ${LINEA}">
${filas}
</table>
<p style="font:12px/1.6 ${F};color:#9a9a94;margin:16px 8px 0 8px;max-width:560px">${pie}</p>
</td></tr></table></body></html>`;
}
const contacto = `
  <tr><td style="padding:14px 28px 26px 28px;font:13px/1.6 ${F};color:#111110;border-top:1px solid #efefea">
    <p style="margin:12px 0 4px 0">¿Dudas con el registro o con algún trabajador? Escríbenos:</p>
    <a href="https://wa.me/34642757633" style="color:#111110;font-weight:600">WhatsApp</a> &nbsp;·&nbsp;
    <a href="tel:+34642757633" style="color:#111110;font-weight:600">+34 642 75 76 33</a> &nbsp;·&nbsp;
    <a href="mailto:info@nomotax.io" style="color:#111110;font-weight:600">info@nomotax.io</a>
  </td></tr>`;
const NOMBRE_AUS = {
	vacaciones: ["día de vacaciones", "días de vacaciones"],
	permiso: ["día de permiso", "días de permiso"],
	baja: ["día de baja", "días de baja"]
};
const plural = (n, [uno, varios]) => `${n} ${n === 1 ? uno : varios}`;
/** «No cuentan: 1 día de vacaciones y 1 festivo» */
function noCuentan(inf) {
	const partes = Object.entries(inf.diasAusencia).map(([t, n]) => plural(n, NOMBRE_AUS[t]));
	const fest = inf.dias.filter((d) => d.estado === "festivo").length;
	if (fest) partes.push(plural(fest, ["festivo", "festivos"]));
	if (!partes.length) return "";
	return ` No cuentan: ${partes.length > 1 ? partes.slice(0, -1).join(", ") + " y " + partes[partes.length - 1] : partes[0]}.`;
}
function asuntoInformeTrabajador({ inf, prueba }) {
	const que = inf.estado === "incompleto" ? "te falta completar tu registro de jornada" : inf.estado === "de_menos" ? "revisa tu registro de jornada" : inf.correcciones ? "tu registro de jornada está pendiente de una corrección" : "tu registro de jornada está completo";
	return `${prueba ? "[PRUEBA] " : ""}${pila(inf.nombre)}, ${que} (semana del ${Number(inf.lunes.slice(8))})`;
}
function horario(d) {
	if (d.estado === "festivo") return `<span style="color:${GRIS}">${esc(d.texto)}</span>`;
	if (d.estado === "ausencia") return `<span style="color:${GRIS}">No se ficha</span>`;
	if (!d.entrada) return "—";
	const h = (iso) => new Date(iso).toLocaleTimeString("es-ES", {
		hour: "numeric",
		minute: "2-digit",
		timeZone: "Europe/Madrid"
	});
	return `${h(d.entrada)} – ${d.salida && d.estado !== "salida" ? h(d.salida) : "¿?"}`;
}
function chipDia(d) {
	switch (d.estado) {
		case "falta": return chip("falta", "Sin fichar");
		case "salida": return chip("salida", "Falta la salida");
		case "correccion": return chip("pend", "Corrección enviada");
		case "festivo": return chip("gris", "Festivo");
		case "ausencia": return chip("aus", `${d.texto}${d.ausenciaPendiente ? " · por aprobar" : ""}`);
		case "finde": return chip("gris", "Fin de semana");
		default: return "";
	}
}
function filaDia(d) {
	const c = chipDia(d);
	const sinHoras = d.estado === "festivo" || d.estado === "ausencia";
	return `
  <tr>
    <td valign="top" style="padding:11px 0;border-bottom:1px solid ${LINEA};font:600 14px/1.4 ${F};color:#111110;white-space:nowrap">${d.etiqueta}</td>
    <td valign="top" style="padding:11px 8px;border-bottom:1px solid ${LINEA};font:14px/1.4 ${F};color:${d.estado === "falta" ? GRIS : "#111110"}">
      ${horario(d)}${d.pausaMin ? `<br><span style="font-size:12px;color:${GRIS}">pausa ${d.pausaMin} min</span>` : ""}
      ${c ? `<br>${c}` : ""}
    </td>
    <td align="right" valign="top" style="padding:11px 0;border-bottom:1px solid ${LINEA};font:600 14px/1.4 ${MONO};color:#111110;white-space:nowrap">${sinHoras ? "—" : d.fichadoMin ? duracionCorta(d.fichadoMin) : "0 h"}${d.esperadoMin ? `<br><span style="font:12px ${F};color:${GRIS}">de ${duracionCorta(d.esperadoMin)}</span>` : ""}</td>
  </tr>`;
}
const paso = (n, texto) => `
      <tr><td valign="top" style="padding:3px 10px 3px 0"><strong style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#CDF564;text-align:center;line-height:22px;font-size:12px">${n}</strong></td>
          <td style="padding:3px 0">${texto}</td></tr>`;
function htmlInformeTrabajador({ empresa, inf, prueba }) {
	const nombre = esc(pila(inf.nombre));
	const falta = inf.esperadoMin - inf.fichadoMin;
	const diasMal = inf.sinFichar + inf.sinSalida;
	const titulo = inf.estado === "incompleto" ? `${nombre}, tu registro de la semana pasada está incompleto` : inf.estado === "de_menos" ? `${nombre}, revisa tu registro de la semana pasada` : inf.correcciones ? `${nombre}, tu registro está pendiente de ${inf.correcciones === 1 ? "una corrección" : "unas correcciones"}` : inf.esperadoMin === 0 ? `${nombre}, la semana pasada no tenías que fichar` : `${nombre}, tu registro de la semana pasada está completo`;
	const intro = inf.estado === "incompleto" ? `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Te ${diasMal === 1 ? "falta <strong>1 día</strong>" : `faltan <strong>${diasMal} días</strong>`} por completar: corrígelo en NomoTax esta semana.` : inf.estado === "de_menos" ? `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Fichaste <strong>${duracionCorta(falta)} menos</strong> que tu jornada: si falta algún fichaje, corrígelo en NomoTax.` : inf.correcciones ? `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Ya pediste ${inf.correcciones === 1 ? "la corrección" : "las correcciones"}: cuando la empresa ${inf.correcciones === 1 ? "la apruebe" : "las apruebe"}, quedará completo. No tienes que hacer nada más.` : inf.esperadoMin === 0 ? `Resumen ${textoSemana(inf.lunes)}: no tenías días de trabajo. No tienes que hacer nada.` : `Este es el resumen de tus fichajes ${textoSemana(inf.lunes)}. Todo en orden: no tienes que hacer nada.`;
	const hayQueHacer = inf.estado !== "completo";
	return envoltorio(`${cabecera(empresa, "REGISTRO DE JORNADA")}
  <tr><td style="padding:28px 28px 6px 28px;font:15px/1.6 ${F};color:#111110">
    <h1 style="margin:0 0 10px 0;font:600 23px/1.25 ${F}">${titulo}</h1>
    <p style="margin:0 0 20px 0;color:#3a3a36">${intro}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px"><tr><td style="padding:18px 18px 20px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${cifra("FICHADO", duracionCorta(inf.fichadoMin))}
        ${cifra("JORNADA", duracionCorta(inf.esperadoMin))}
        ${falta > 0 ? cifra("FALTA", duracionCorta(falta), true) : cifra("DIFERENCIA", (falta < 0 ? "+" : "") + duracionCorta(-falta), true)}
      </tr></table>
      ${barra(inf.fichadoMin, inf.esperadoMin)}
      <p style="margin:10px 0 0 0;font:12px/1.5 ${F};color:${GRIS}">Tu jornada: ${duracionCorta(inf.horasSemana * 60)} a la semana.${noCuentan(inf)}</p>
    </td></tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0">
      ${inf.dias.map(filaDia).join("")}
    </table>

    ${hayQueHacer ? `<h2 style="margin:26px 0 8px 0;font:600 17px/1.3 ${F}">Qué tienes que hacer</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font:14px/1.55 ${F};color:#111110">
      ${paso(1, "Entra en NomoTax y ve a <strong>Fichar</strong>.")}
      ${paso(2, "Pulsa <strong>«Se me olvidó fichar»</strong> por cada día marcado, pon la hora real y el motivo.")}
      ${paso(3, "Tu empresa revisa la corrección y la aprueba.")}
    </table>
    ${boton(`${APP_URL}/fichar`, "Corregir mis fichajes")}
    ${cajaLegal("Fichar es obligatorio", "La ley exige registrar cada día tu hora real de entrada y salida (art. 34.9 del Estatuto de los Trabajadores) y la Inspección de Trabajo puede revisarlo. No fichar cuando la empresa lo pide puede ser un incumplimiento laboral (arts. 5 y 58 del Estatuto).")}` : boton(`${APP_URL}/fichar`, "Ver mi registro")}
  </td></tr>
  <tr><td style="padding:14px 28px 26px 28px;font:13px/1.6 ${F};color:${GRIS}">
    Vacaciones, permisos y bajas: pídelos o comunícalos en NomoTax, en <a href="${APP_URL}/mi-espacio/ausencias" style="color:#111110;font-weight:600">Ausencias</a>. Esos días no hay que fichar.
  </td></tr>`, `${esc(empresa)} te envía este resumen con NomoTax los lunes que a tu registro le falta algo.`, prueba);
}
function textoInformeTrabajador({ empresa, inf }) {
	const lineas = inf.dias.map((d) => {
		const extra = chipDia(d) ? ` [${chipDia(d).replace(/<[^>]+>/g, "")}]` : "";
		return `· ${d.etiqueta}: ${horario(d).replace(/<[^>]+>/g, "")} — ${d.estado === "festivo" || d.estado === "ausencia" ? "no se ficha" : duracionCorta(d.fichadoMin)}${extra}`;
	});
	return [
		`Hola ${pila(inf.nombre)},`,
		"",
		`Resumen de tus fichajes ${textoSemana(inf.lunes)}: ${duracionCorta(inf.fichadoMin)} de ${duracionCorta(inf.esperadoMin)}.`,
		"",
		...lineas,
		"",
		inf.estado === "completo" ? "Todo en orden." : `Corrige lo que falte en NomoTax → Fichar → «Se me olvidó fichar»: ${APP_URL}/fichar`,
		"",
		"Fichar es obligatorio: la ley exige registrar cada día la hora real de entrada y salida (art. 34.9 del Estatuto de los Trabajadores).",
		"",
		empresa
	].join("\n");
}
function asuntoInformeEquipo(d) {
	const mal = d.informes.filter((i) => i.estado === "incompleto").length;
	return `${d.prueba ? "[PRUEBA] " : ""}Registro de jornada de ${d.empresa}: semana del ${Number(d.lunes.slice(8))}${mal ? ` · ${mal} con días sin completar` : " · todo en orden"}`;
}
function filaEquipo(i) {
	const chips = [];
	if (i.sinFichar) chips.push(chip("falta", i.sinFichar === 1 ? "1 día sin fichar" : `${i.sinFichar} días sin fichar`));
	if (i.sinSalida) chips.push(chip("salida", i.sinSalida === 1 ? "1 sin salida" : `${i.sinSalida} sin salida`));
	if (i.correcciones) chips.push(chip("pend", i.correcciones === 1 ? "1 corrección por aprobar" : `${i.correcciones} correcciones por aprobar`));
	for (const [t, n] of Object.entries(i.diasAusencia)) chips.push(chip("aus", plural(n, NOMBRE_AUS[t])));
	if (i.estado === "de_menos") chips.push(chip("salida", `${duracionCorta(i.esperadoMin - i.fichadoMin)} por debajo`));
	if (i.estado === "completo" && !i.correcciones) chips.unshift(chip("ok", "Completo"));
	const dif = i.fichadoMin - i.esperadoMin;
	return `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid ${LINEA};font:14px/1.4 ${F};color:#111110">
      <strong>${esc(i.nombre)}</strong><br>${chips.join("")}
    </td>
    <td align="right" valign="top" style="padding:12px 0 12px 8px;border-bottom:1px solid ${LINEA};font:600 14px/1.4 ${MONO};color:#111110;white-space:nowrap">
      ${duracionCorta(i.fichadoMin)}<br><span style="font:12px ${F};color:${dif < -60 ? "#a8200d" : GRIS}">${dif ? `${dif > 0 ? "+" : ""}${duracionCorta(dif)} ` : ""}de ${duracionCorta(i.esperadoMin)}</span>
    </td>
  </tr>`;
}
const cajaPendiente = (p) => `
    <tr><td style="padding:0 0 8px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINEA};border-radius:12px"><tr><td style="padding:12px 16px;font:14px/1.5 ${F};color:#111110">
      <strong>${esc(p.nombre)}</strong> · ${esc(p.texto)}${p.motivo ? `<br><span style="color:${GRIS}">«${esc(p.motivo)}»</span>` : ""}
    </td></tr></table></td></tr>`;
function htmlInformeEquipo(d) {
	const totF = d.informes.reduce((s, i) => s + i.fichadoMin, 0);
	const totT = d.informes.reduce((s, i) => s + i.esperadoMin, 0);
	const mal = d.informes.filter((i) => i.estado === "incompleto").length;
	const pct = totT ? Math.round(totF / totT * 100) : 100;
	const hola = d.para ? `${esc(pila(d.para))}, así` : "Así";
	return envoltorio(`${cabecera(d.empresa, "INFORME SEMANAL DE JORNADA")}
  <tr><td style="padding:28px 28px 6px 28px;font:15px/1.6 ${F};color:#111110">
    <h1 style="margin:0 0 10px 0;font:600 23px/1.25 ${F}">${hola} fichó tu equipo la semana pasada</h1>
    <p style="margin:0 0 20px 0;color:#3a3a36">Resumen del registro de jornada ${textoSemana(d.lunes)}. ${mal ? `<strong>${mal} de ${d.informes.length} ${d.informes.length === 1 ? "persona" : "personas"}</strong> ${mal === 1 ? "tiene" : "tienen"} días sin completar; ya les hemos avisado para que lo corrijan.` : "Todo el equipo tiene el registro completo."}</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px"><tr><td style="padding:18px 18px 20px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${cifra("FICHADO", duracionCorta(totF))}
        ${cifra("JORNADA", duracionCorta(totT))}
        ${cifra("REGISTRADO", `${pct}%`, true)}
      </tr></table>
      ${barra(totF, totT)}
    </td></tr></table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0 0">
      <tr><td style="padding:0 0 6px 0;font:600 11px ${F};letter-spacing:1px;color:${GRIS}">PERSONA</td>
          <td align="right" style="padding:0 0 6px 0;font:600 11px ${F};letter-spacing:1px;color:${GRIS}">FICHADO</td></tr>
      ${d.informes.map(filaEquipo).join("")}
    </table>
    ${d.sinFichaje.length ? `<p style="margin:12px 0 0 0;font:13px/1.5 ${F};color:#8a5a00">Sin el fichaje activado: <strong>${d.sinFichaje.map(esc).join(", ")}</strong>. También tienen que registrar su jornada: actívalo en Configuración → Usuarios.</p>` : ""}

    ${d.correcciones.length || d.ausencias.length ? `<h2 style="margin:26px 0 10px 0;font:600 17px/1.3 ${F}">Pendiente de tu aprobación</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${d.correcciones.map(cajaPendiente).join("")}
      ${d.ausencias.map(cajaPendiente).join("")}
    </table>
    ${boton(`${APP_URL}/laboral/${d.correcciones.length ? "fichajes" : "ausencias"}`, d.correcciones.length ? "Revisar los fichajes" : "Revisar las ausencias")}` : boton(`${APP_URL}/laboral/fichajes`, "Ver el registro")}

    ${cajaLegal("Obligatorio para la empresa", "Hay que registrar cada día la entrada y la salida de cada trabajador y guardarlo 4 años (art. 34.9 del Estatuto de los Trabajadores). No hacerlo es una infracción grave: multa de 751€ a 7.500€ por cada infracción (arts. 7.5 y 40 LISOS, importes vigentes), aparte de otras que la Inspección de Trabajo pueda detectar, como horas extra sin pagar o sin cotizar.")}
  </td></tr>
  ${contacto}`, `Recibes este informe cada lunes porque ${esc(d.empresa)} tiene el registro de jornada en NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a>`, d.prueba);
}
function textoInformeEquipo(d) {
	return [
		`Registro de jornada ${textoSemana(d.lunes)} · ${d.empresa}`,
		"",
		...d.informes.map((i) => `· ${i.nombre}: ${duracionCorta(i.fichadoMin)} de ${duracionCorta(i.esperadoMin)}${i.sinFichar ? ` · ${i.sinFichar} sin fichar` : ""}${i.sinSalida ? ` · ${i.sinSalida} sin salida` : ""}`),
		"",
		...d.correcciones.length || d.ausencias.length ? [
			"Pendiente de tu aprobación:",
			...[...d.correcciones, ...d.ausencias].map((p) => `· ${p.nombre}: ${p.texto}`),
			""
		] : [],
		`Revísalo en ${APP_URL}/laboral/fichajes`,
		"",
		"El registro diario de jornada es obligatorio para la empresa (art. 34.9 del Estatuto de los Trabajadores)."
	].join("\n");
}
function htmlAviso(d) {
	return envoltorio(`${cabecera(d.empresa, d.etiqueta)}
  <tr><td style="padding:28px 28px 24px 28px;font:15px/1.6 ${F};color:#111110">
    <h1 style="margin:0 0 10px 0;font:600 22px/1.25 ${F}">${esc(d.titulo)}</h1>
    <p style="margin:0 0 18px 0;color:#3a3a36">${d.parrafo}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px"><tr><td style="padding:8px 18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${d.detalle.map(([k, v], i) => `<tr><td style="padding:8px 0;${i ? `border-top:1px solid ${LINEA};` : ""}font:13px/1.5 ${F};color:${GRIS};white-space:nowrap;vertical-align:top">${esc(k)}</td>
          <td align="right" style="padding:8px 0 8px 12px;${i ? `border-top:1px solid ${LINEA};` : ""}font:14px/1.5 ${F};color:#111110">${esc(v)}</td></tr>`).join("")}
      </table>
    </td></tr></table>
    ${boton(d.boton.href, d.boton.texto)}
  </td></tr>`, d.pie);
}
const textoAviso = (d) => [
	d.titulo,
	"",
	d.parrafo.replace(/<[^>]+>/g, ""),
	"",
	...d.detalle.map(([k, v]) => `${k}: ${v}`),
	"",
	`${d.boton.texto}: ${d.boton.href}`
].join("\n");
// supabase/functions/jornada/fuente.ts
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
	"Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
	status,
	headers: {
		...CORS,
		"Content-Type": "application/json"
	}
});
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
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const linea = (s) => s.replace(/[\r\n\t\u0000-\u001f]+/g, " ").trim();
/** Cuentas técnicas sin buzón (cuentas vinculadas del mismo titular) */
const conBuzon = (e) => Boolean(e && EMAIL.test(e) && !/@sin-acceso\.nomotax\.io$/i.test(e) && !/\.example$/i.test(e));
Deno.serve(async (req) => {
	if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
	if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
	const url = Deno.env.get("SUPABASE_URL");
	const secreta = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	const publica = req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? primeraDeJson("SUPABASE_PUBLISHABLE_KEYS");
	if (!secreta || !publica) return json({ error: "Faltan las claves de Supabase" }, 500);
	const admin = createClient(url, secreta, { auth: {
		persistSession: false,
		autoRefreshToken: false
	} });
	let body;
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
/** Una conexión por empresa: su SMTP propio o NomoTax («Empresa vía NomoTax») */
async function preparaEnvio(admin, ownerId, empresa) {
	let propio = null;
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
					from: {
						name: linea(c.remitente_nombre || empresa),
						address: c.remitente_email
					},
					to: m.para,
					replyTo: m.responderA || void 0,
					subject: linea(m.asunto),
					html: m.html,
					text: m.texto
				});
				return {
					remitente: c.remitente_email,
					error: null
				};
			} catch (e) {
				await admin.from("smtp_empresas").update({ ultimo_error: explicarErrorSmtp(e) }).eq("owner_id", ownerId);
				return {
					remitente: c.remitente_email,
					error: explicarErrorSmtp(e)
				};
			}
		};
	}
	const usuario = Deno.env.get("SMTP_USER") ?? "info@nomotax.io";
	const pass = Deno.env.get("SMTP_PASSWORD");
	if (!pass) throw new Error("Falta el secreto SMTP_PASSWORD (correo info@nomotax.io)");
	const t = nodemailer.createTransport({
		host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com",
		port: 465,
		secure: true,
		auth: {
			user: usuario,
			pass
		}
	});
	return async (m) => {
		try {
			await t.sendMail({
				from: {
					name: linea(`${empresa} vía NomoTax`),
					address: usuario
				},
				to: m.para,
				replyTo: m.responderA || void 0,
				subject: linea(m.asunto),
				html: m.html,
				text: m.texto
			});
			return {
				remitente: usuario,
				error: null
			};
		} catch (e) {
			return {
				remitente: usuario,
				error: e instanceof Error ? e.message : String(e)
			};
		}
	};
}
const nombreEmpresa = (p) => p.nombre_comercial || p.nombre || "Tu empresa";
/** Quien recibe lo de la empresa: la cuenta (propietario) y los administradores con Laboral */
function destinatariosEmpresa(p, miembros) {
	const out = /* @__PURE__ */ new Map();
	if (conBuzon(p.email)) out.set(p.email.toLowerCase(), {
		email: p.email,
		nombre: null
	});
	for (const m of miembros) if (m.rol === "admin" && m.permisos?.laboral && conBuzon(m.email) && !out.has(m.email.toLowerCase())) out.set(m.email.toLowerCase(), {
		email: m.email,
		nombre: m.nombre
	});
	return [...out.values()];
}
/** Festivos de cada trabajador según la provincia de su centro (o de la empresa) */
function festivosPara(t, centros, p, locales) {
	return festivosDe(comunidadDe(provinciaDeTrabajo(t.centro_id, centros, p)), locales);
}
async function informe(admin, body) {
	const prueba = body.prueba === true;
	const paraPrueba = String(body.para ?? Deno.env.get("NOMOTAX_EMISOR_EMAIL") ?? "info@nomotax.io").trim();
	if (prueba && !EMAIL.test(paraPrueba)) throw new Error("«para» no es un email válido");
	const lunes = typeof body.semana === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.semana) ? body.semana : lunesAnterior(diaMadrid(/* @__PURE__ */ new Date()));
	if (diaSemana(lunes) !== 1) throw new Error(`${lunes} no es lunes`);
	let ids;
	if (typeof body.empresa === "string" && body.empresa.trim()) {
		const q = `%${body.empresa.trim().replace(/[%_]/g, "")}%`;
		const { data } = await admin.from("profiles").select("id").or(`nombre.ilike.${q},nombre_comercial.ilike.${q}`);
		ids = (data ?? []).map((x) => x.id);
		if (!prueba) {
			const { data: act } = await admin.from("perfil_laboral").select("owner_id").eq("informe_jornada", true).in("owner_id", ids.length ? ids : ["-"]);
			ids = (act ?? []).map((x) => x.owner_id);
		}
	} else {
		if (prueba) throw new Error("En prueba, di la empresa: { \"empresa\": \"nova\" }");
		const { data } = await admin.from("perfil_laboral").select("owner_id").eq("informe_jornada", true);
		ids = (data ?? []).map((x) => x.owner_id);
	}
	const resultado = [];
	for (const id of ids) try {
		resultado.push(await informeEmpresa(admin, id, lunes, prueba ? paraPrueba : null));
	} catch (e) {
		console.error(`jornada: empresa ${id}`, e);
		resultado.push({
			empresa: id,
			error: e instanceof Error ? e.message : String(e)
		});
	}
	return {
		semana: lunes,
		prueba,
		empresas: resultado
	};
}
async function informeEmpresa(admin, ownerId, lunes, paraPrueba) {
	const domingo = sumarDias(lunes, 6);
	const [{ data: perfil }, { data: perfilLab }, { data: trabs }, { data: miembros }, { data: centros }, { data: fichajes }, { data: ausencias }, { data: locales }, { data: pendFich }] = await Promise.all([
		admin.from("profiles").select("*").eq("id", ownerId).single(),
		admin.from("perfil_laboral").select("horas_semana_convenio").eq("owner_id", ownerId).maybeSingle(),
		admin.from("trabajadores").select("id, nombre, estado, fecha_inicio, fecha_baja, jornada, horas_semana, centro_id").eq("owner_id", ownerId).order("nombre"),
		admin.from("miembros").select("user_id, email, nombre, rol, permisos, trabajador_id, fichaje").eq("cuenta_id", ownerId).eq("activo", true),
		admin.from("centros_trabajo").select("id, provincia").eq("owner_id", ownerId),
		admin.from("fichajes").select("*").eq("owner_id", ownerId).gte("momento", `${sumarDias(lunes, -1)}T00:00:00Z`).lt("momento", `${sumarDias(domingo, 2)}T00:00:00Z`).order("momento"),
		admin.from("ausencias").select("*").eq("owner_id", ownerId).lte("desde", domingo).or(`hasta.is.null,hasta.gte.${lunes}`),
		admin.from("festivos_empresa").select("fecha, nombre").eq("owner_id", ownerId),
		admin.from("fichajes").select("*").eq("owner_id", ownerId).eq("estado", "pendiente").order("momento")
	]);
	if (!perfil) throw new Error("No existe la empresa");
	const p = perfil;
	const empresa = nombreEmpresa(p);
	const ms = miembros ?? [];
	const ts = (trabs ?? []).filter((t) => t.estado === "alta" || t.estado === "baja" && t.fecha_baja && t.fecha_baja >= lunes);
	const cs = centros ?? [];
	const fs = fichajes ?? [];
	const as = ausencias ?? [];
	const ls = locales ?? [];
	const nombreDe = (id) => ts.find((t) => t.id === id)?.nombre ?? trabs?.find((t) => t.id === id)?.nombre ?? "—";
	const conFichaje = new Map(ms.filter((m) => m.fichaje && m.trabajador_id).map((m) => [m.trabajador_id, m]));
	const informes = [];
	for (const t of ts) {
		const m = conFichaje.get(t.id);
		if (!m || t.fecha_inicio > domingo) continue;
		const inf = informeSemana({
			trabajador: t,
			horasConvenio: perfilLab?.horas_semana_convenio ?? 40,
			fichajes: fs,
			ausencias: as,
			festivos: festivosPara(t, cs, p, ls),
			lunes
		});
		informes.push({
			inf,
			m
		});
	}
	const sinFichaje = ts.filter((t) => t.estado === "alta" && !conFichaje.has(t.id) && t.fecha_inicio <= domingo).map((t) => t.nombre);
	if (!informes.length) return {
		empresa,
		enviados: 0,
		nota: "Nadie tiene el fichaje activado"
	};
	const yaEnviados = /* @__PURE__ */ new Set();
	if (!paraPrueba) {
		const { data } = await admin.from("informes_jornada").select("email").eq("owner_id", ownerId).eq("semana", lunes).is("error", null);
		for (const r of data ?? []) yaEnviados.add(String(r.email).toLowerCase());
	}
	const enviar = await preparaEnvio(admin, ownerId, empresa);
	const responderEmpresa = conBuzon(p.email_respuesta) ? p.email_respuesta : conBuzon(p.email) ? p.email : null;
	const enviados = [];
	const registrar = async (email, trabajadorId, r) => {
		if (paraPrueba) return;
		await admin.from("informes_jornada").upsert({
			owner_id: ownerId,
			semana: lunes,
			trabajador_id: trabajadorId,
			email,
			remitente: r.remitente,
			error: r.error
		}, { onConflict: "owner_id,semana,email" });
	};
	for (const { inf, m } of informes) {
		if (inf.estado === "completo") continue;
		if (!conBuzon(m.email)) continue;
		if (yaEnviados.has(m.email.toLowerCase())) continue;
		const d = {
			empresa,
			inf,
			prueba: Boolean(paraPrueba)
		};
		const r = await enviar({
			para: paraPrueba ?? m.email,
			asunto: asuntoInformeTrabajador(d) + (paraPrueba ? ` → ${m.email}` : ""),
			html: htmlInformeTrabajador(d),
			texto: textoInformeTrabajador(d),
			responderA: responderEmpresa
		});
		await registrar(m.email, inf.trabajadorId, r);
		enviados.push({
			para: m.email,
			quien: inf.nombre,
			error: r.error
		});
	}
	const correcciones = (pendFich ?? []).map((f) => ({
		nombre: nombreDe(f.trabajador_id),
		texto: `${NOMBRE_TIPO[f.tipo].toLowerCase()} del ${new Date(f.momento).toLocaleDateString("es-ES", {
			weekday: "long",
			day: "numeric",
			month: "long",
			timeZone: "Europe/Madrid"
		})} a las ${horaMadrid(f.momento)}`,
		motivo: f.motivo
	}));
	const { data: pendAus } = await admin.from("ausencias").select("*").eq("owner_id", ownerId).eq("estado", "pendiente").order("desde");
	const ausPend = (pendAus ?? []).map((a) => ({
		nombre: nombreDe(a.trabajador_id),
		texto: `${nombreAusencia(a).toLowerCase()} ${textoFechas(a, true)}`,
		motivo: a.motivo
	}));
	for (const dest of destinatariosEmpresa(p, ms)) {
		if (yaEnviados.has(dest.email.toLowerCase())) continue;
		const d = {
			empresa,
			para: dest.nombre,
			lunes,
			informes: informes.map((x) => x.inf),
			sinFichaje,
			correcciones,
			ausencias: ausPend,
			prueba: Boolean(paraPrueba)
		};
		const r = await enviar({
			para: paraPrueba ?? dest.email,
			asunto: asuntoInformeEquipo(d) + (paraPrueba ? ` → ${dest.email}` : ""),
			html: htmlInformeEquipo(d),
			texto: textoInformeEquipo(d),
			responderA: "info@nomotax.io"
		});
		await registrar(dest.email, null, r);
		enviados.push({
			para: dest.email,
			quien: "equipo",
			error: r.error
		});
	}
	return {
		empresa,
		trabajadores: informes.map(({ inf }) => ({
			nombre: inf.nombre,
			estado: inf.estado,
			fichado: inf.fichadoMin,
			jornada: inf.esperadoMin,
			sinFichar: inf.sinFichar,
			sinSalida: inf.sinSalida
		})),
		sinFichaje,
		enviados
	};
}
const reciente = (iso) => Boolean(iso && Date.now() - new Date(iso).getTime() < 9e5);
async function aviso(admin, asUser, userId, ausenciaId, evento) {
	if (!/^[0-9a-f-]{36}$/i.test(ausenciaId) || ![
		"nueva",
		"resuelta",
		"anulada"
	].includes(evento)) return json({ error: "Petición no válida" }, 400);
	const { data: a } = await asUser.from("ausencias").select("*").eq("id", ausenciaId).maybeSingle();
	if (!a) return json({ error: "No existe esa ausencia" }, 404);
	const aus = a;
	if (evento === "nueva" ? !reciente(aus.created_at) : !reciente(aus.revisado_at)) return json({
		ok: true,
		enviado: false,
		motivo: "fuera de plazo"
	});
	if (evento === "nueva" && aus.solicitado_por !== userId) return json({
		ok: true,
		enviado: false
	});
	const [{ data: perfil }, { data: trab }, { data: miembros }, { data: centros }, { data: locales }] = await Promise.all([
		admin.from("profiles").select("*").eq("id", aus.owner_id).single(),
		admin.from("trabajadores").select("id, nombre, centro_id").eq("id", aus.trabajador_id).single(),
		admin.from("miembros").select("user_id, email, nombre, rol, permisos, trabajador_id, fichaje").eq("cuenta_id", aus.owner_id).eq("activo", true),
		admin.from("centros_trabajo").select("id, provincia").eq("owner_id", aus.owner_id),
		admin.from("festivos_empresa").select("fecha, nombre").eq("owner_id", aus.owner_id)
	]);
	if (!perfil || !trab) return json({ error: "Faltan datos" }, 404);
	const p = perfil;
	const empresa = nombreEmpresa(p);
	const ms = miembros ?? [];
	const dias = diasDeAusencia(aus, festivosPara(trab, centros ?? [], p, locales ?? []), diaMadrid(/* @__PURE__ */ new Date()));
	const nombre = trab.nombre;
	const pilaT = nombre.split(/\s+/)[0];
	const que = aus.tipo === "vacaciones" ? "vacaciones" : aus.tipo === "permiso" ? "un permiso" : "una baja";
	const detalle = [
		["Tipo", nombreAusencia(aus)],
		["Fechas", textoFechas(aus, true).replace(/^./, (c) => c.toUpperCase())],
		...aus.hasta || aus.tipo !== "baja" ? [["Días laborables", String(dias)]] : [],
		...aus.motivo ? [["Comentario", aus.motivo]] : [],
		...aus.tipo !== "vacaciones" ? [["Justificante", aus.archivo_path ? "Adjunto en NomoTax" : "No adjunto"]] : []
	];
	const enviar = await preparaEnvio(admin, aus.owner_id, empresa);
	const errores = [];
	if (evento === "nueva") {
		const d = {
			empresa,
			etiqueta: "AUSENCIAS",
			titulo: aus.tipo === "baja" ? `${nombre} ha comunicado una baja` : `${nombre} pide ${que}`,
			parrafo: aus.tipo === "baja" ? `${esc(pilaT)} estará de baja ${esc(textoFechas(aus, true))}. No hay que aprobarla: queda registrada y esos días no cuentan como «sin fichar». Tu asesor la tendrá en cuenta en la nómina.` : `${esc(pilaT)} ha pedido ${que} ${esc(textoFechas(aus, true))}. Apruébalo o recházalo en NomoTax: le avisaremos por correo.`,
			detalle,
			boton: {
				href: `${APP_URL}/laboral/ausencias`,
				texto: aus.tipo === "baja" ? "Ver en Laboral" : "Revisar la solicitud"
			},
			pie: `Te llega porque llevas Laboral en ${esc(empresa)} · NomoTax`
		};
		for (const dest of destinatariosEmpresa(p, ms)) {
			if (ms.some((m) => m.user_id === userId && m.email.toLowerCase() === dest.email.toLowerCase())) continue;
			const r = await enviar({
				para: dest.email,
				asunto: d.titulo,
				html: htmlAviso(d),
				texto: textoAviso(d)
			});
			if (r.error) errores.push(r.error);
		}
	} else {
		const { data: rev } = aus.revisado_por ? await admin.from("profiles").select("id, nombre, role").eq("id", aus.revisado_por).maybeSingle() : { data: null };
		const quien = ms.find((x) => x.user_id === aus.revisado_por)?.nombre || (rev && rev.id !== aus.owner_id && rev.role !== "advisor" ? rev.nombre : null) || null;
		const pilaQ = quien ? quien.split(/\s+/)[0] : null;
		const apuntada = aus.estado === "aprobada" && aus.solicitado_por === aus.revisado_por;
		const fechas = textoFechas(aus, true);
		const cosa = aus.tipo === "vacaciones" ? "tus vacaciones" : "tu permiso";
		const decision = evento === "anulada" ? "anulado" : apuntada ? "apuntado" : aus.estado === "aprobada" ? "aprobado" : "rechazado";
		const m = ms.find((x) => x.trabajador_id === aus.trabajador_id);
		const avisado = Boolean(m && conBuzon(m.email));
		if (m && avisado) {
			const tit = evento === "anulada" ? `${pilaQ ?? "La empresa"} ha anulado ${nombreAusencia(aus, true).toLowerCase() === "vacaciones" ? "tus vacaciones" : "tu ausencia"} ${textoFechas(aus)}` : apuntada ? `${pilaQ ?? "La empresa"} ha apuntado ${aus.tipo === "vacaciones" ? "tus vacaciones" : "tus días de permiso"}` : aus.estado === "aprobada" ? pilaQ ? `${pilaQ} ha aprobado ${cosa}` : aus.tipo === "vacaciones" ? "Tus vacaciones están aprobadas" : "Tu permiso está aprobado" : pilaQ ? `${pilaQ} no ha aprobado ${cosa}` : aus.tipo === "vacaciones" ? "Tus vacaciones no se han aprobado" : "Tu permiso no se ha aprobado";
			const por = quien ? esc(quien) : esc(empresa);
			const d = {
				empresa,
				etiqueta: "AUSENCIAS",
				titulo: tit,
				parrafo: evento === "anulada" ? `${por} ha anulado ${esc(nombreAusencia(aus).toLowerCase())} ${esc(fechas)}${aus.respuesta ? `. Motivo: «${esc(aus.respuesta)}»` : ""}. Esos días vuelven a ser de trabajo: hay que fichar.` : aus.estado === "aprobada" ? `${esc(pilaT)}, ${por} lo ha ${apuntada ? "registrado" : "aprobado"}: ${esc(fechas)} no tienes que fichar.${aus.tipo === "vacaciones" ? " ¡Que las disfrutes!" : ""}` : `${esc(pilaT)}, ${por} no ha aprobado tu solicitud ${esc(fechas)}${aus.respuesta ? `. Motivo: «${esc(aus.respuesta)}»` : ""}. Si quieres, pide otras fechas o habla con tu responsable.`,
				detalle,
				boton: {
					href: `${APP_URL}/mi-espacio/ausencias`,
					texto: "Ver mis ausencias"
				},
				pie: `${esc(empresa)} te avisa con NomoTax`
			};
			const r = await enviar({
				para: m.email,
				asunto: tit,
				html: htmlAviso(d),
				texto: textoAviso(d),
				responderA: conBuzon(p.email_respuesta) ? p.email_respuesta : conBuzon(p.email) ? p.email : null
			});
			if (r.error) errores.push(r.error);
		}
		const tit2 = `${aus.tipo === "vacaciones" ? "Vacaciones" : aus.tipo === "permiso" ? "Permiso" : "Baja"} de ${nombre} ${aus.tipo === "vacaciones" ? decision.replace(/o$/, "as") : aus.tipo === "baja" ? decision.replace(/o$/, "a") : decision}`;
		const d2 = {
			empresa,
			etiqueta: "AUSENCIAS",
			titulo: tit2,
			parrafo: `${quien ? esc(quien) : "Se"} ha ${decision} ${aus.tipo === "vacaciones" ? "las vacaciones" : aus.tipo === "permiso" ? "el permiso" : "la baja"} de ${esc(nombre)} ${esc(fechas)}${aus.respuesta && decision !== "aprobado" ? ` (motivo: «${esc(aus.respuesta)}»)` : ""}. ${avisado ? `${esc(pilaT)} ya lo sabe: le hemos avisado por correo.` : `${esc(pilaT)} no tiene usuario en NomoTax: díselo tú.`}`,
			detalle,
			boton: {
				href: `${APP_URL}/laboral/ausencias`,
				texto: "Ver en Laboral"
			},
			pie: `Te llega porque llevas Laboral en ${esc(empresa)} · NomoTax`
		};
		for (const dest of destinatariosEmpresa(p, ms)) {
			const r = await enviar({
				para: dest.email,
				asunto: tit2,
				html: htmlAviso(d2),
				texto: textoAviso(d2)
			});
			if (r.error) errores.push(r.error);
		}
	}
	return json({
		ok: errores.length === 0,
		enviado: errores.length === 0,
		errores
	});
}
