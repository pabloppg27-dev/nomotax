// Código compartido por las funciones smtp-config y enviar-factura (se empaqueta dentro de cada una).
// SMTP propio de cada empresa: cifrado de la contraseña y conexión.
//
// Secreto necesario: SMTP_CLAVE (cualquier texto largo y aleatorio). Si se cambia, las contraseñas guardadas
// dejan de poder leerse y cada empresa tiene que volver a ponerla.

import nodemailer from "nodemailer";
// Cliente de Supabase con la clave secreta (solo lo que se usa aquí)
// deno-lint-ignore no-explicit-any
type Db = { from: (tabla: string) => any };

export interface SmtpEmpresa {
  owner_id: string;
  proveedor: string;
  host: string;
  puerto: number;
  seguridad: "ssl" | "starttls";
  usuario: string;
  remitente_email: string;
  remitente_nombre: string | null;
  activo: boolean;
  verificado_at: string | null;
  ultimo_error: string | null;
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const desdeB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function claveAes(): Promise<CryptoKey> {
  const secreto = Deno.env.get("SMTP_CLAVE");
  if (!secreto || secreto.length < 24) throw new Error("Falta el secreto SMTP_CLAVE (texto largo y aleatorio)");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secreto));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** «v1:iv:datos», AES-GCM 256 */
export async function cifrar(texto: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await claveAes(), new TextEncoder().encode(texto)));
  return `v1:${b64(iv)}:${b64(datos)}`;
}

export async function descifrar(guardado: string): Promise<string> {
  const [v, iv, datos] = guardado.split(":");
  if (v !== "v1" || !iv || !datos) throw new Error("Contraseña guardada en un formato desconocido");
  const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: desdeB64(iv) }, await claveAes(), desdeB64(datos));
  return new TextDecoder().decode(plano);
}

/** Solo servidores de correo de verdad: nada de localhost, IPs privadas ni puertos raros */
export function hostPermitido(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes(".") || h.length > 253) return false;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  const ip = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  return true;
}

export function transporte(c: Pick<SmtpEmpresa, "host" | "puerto" | "seguridad" | "usuario">, pass: string) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.puerto,
    secure: c.seguridad === "ssl",
    requireTLS: c.seguridad === "starttls",
    auth: { user: c.usuario, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

/** El SMTP activo de la empresa con su contraseña, o null si envía con NomoTax */
export async function smtpActivo(admin: Db, ownerId: string): Promise<{ config: SmtpEmpresa; pass: string } | null> {
  const { data: config } = await admin.from("smtp_empresas").select("*").eq("owner_id", ownerId).eq("activo", true).maybeSingle();
  if (!config) return null; // sin tabla (falta el SQL) o sin SMTP activo
  const { data: clave } = await admin.from("smtp_claves").select("clave_cifrada").eq("owner_id", ownerId).maybeSingle();
  if (!clave) return null;
  return { config: config as SmtpEmpresa, pass: await descifrar(clave.clave_cifrada as string) };
}

/** Error de SMTP en palabras normales (para la app) */
export function explicarErrorSmtp(e: unknown): string {
  const err = e as { code?: string; responseCode?: number; message?: string };
  const m = err.message ?? String(e);
  if (/smtp auth.*disabled|SmtpClientAuthentication/i.test(m)) {
    return "Tu cuenta de Microsoft tiene desactivado el envío por SMTP. Tu administrador debe activar «SMTP autenticado» o usa el envío con NomoTax.";
  }
  if (err.code === "EAUTH" || err.responseCode === 535 || /auth|credentials|password|username/i.test(m)) {
    return "El servidor no acepta el usuario o la contraseña. Revisa los datos (en Gmail hace falta una contraseña de aplicación).";
  }
  if (err.code === "ETIMEDOUT" || err.code === "ECONNECTION" || /timeout|timed out/i.test(m)) {
    return "No se ha podido conectar con el servidor: revisa el servidor y el puerto.";
  }
  if (err.code === "ENOTFOUND" || err.code === "EDNS" || /getaddrinfo|not known|dns/i.test(m)) return "No existe ese servidor de correo: revisa el nombre.";
  if (err.code === "ESOCKET" || /ssl|tls|certificate|wrong version/i.test(m)) {
    return "Fallo de seguridad al conectar (SSL/TLS): prueba con el otro tipo de seguridad o puerto (465 SSL / 587 STARTTLS).";
  }
  if (/sender|from address|not owned|send as/i.test(m)) return "El servidor no deja enviar con ese email de remitente: usa el mismo email con el que entras.";
  return `El servidor de correo ha respondido: ${m.slice(0, 200)}`;
}
