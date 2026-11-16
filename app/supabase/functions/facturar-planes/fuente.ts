// FUENTE de la Edge Function facturar-planes. NO se pega en Supabase:
// `node scripts/empaquetar-facturar.mjs` genera index.ts (un solo archivo) y ese es el que se pega.
//
// Cada día (pg_cron, ver supabase/facturacion-automatica.sql) emite la factura de NomoTax a los
// clientes a los que les toca según su plan:
//   1. La factura se crea en la cuenta del emisor (tu perfil de cliente, NOMOTAX_EMISOR_EMAIL),
//      emitida y numerada por la base de datos (serie del perfil, p. ej. NT2026-0001).
//   2. PDF con el mismo diseño que la app (src/lib/pdfFactura.ts).
//   3. Se guarda como gasto revisado, con el PDF, en la cuenta del cliente.
//   4. Se envía al cliente desde info@nomotax.io (a su email de facturación o, si no, al de su cuenta).
//
// Entrada (POST, cabecera x-cron-secret = secreto CRON_SECRET):
//   {}                          → factura lo de hoy
//   { "fecha": "2026-12-01" }   → como si hoy fuera esa fecha
//   { "simular": true }         → solo dice qué haría (no emite, no guarda, no envía)
//   { "cliente": "<uuid, email o nombre>" } → solo ese cliente
//   { "prueba": true, "cliente": "…" [, "enviar_a": "otro@email"] }
//        → factura de PRUEBA a ese cliente con su plan (serie PRUEBA, marca de agua, «sin validez»),
//          enviada a su email de facturación / de cuenta (o a enviar_a si se indica).
//          Sirve para probar todo el circuito sin gastar la numeración NT.

import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { jsPDF } from "jspdf";
import { construirPdf, type LogoPdf } from "../../../src/lib/pdfFactura";
import { facturaDelDia, IRPF_NOMOTAX } from "../../../src/lib/facturaPlan";
import { calcularTotales } from "../../../src/lib/totals";
import type { Emisor, Invoice } from "../../../src/lib/types";
import { asuntoFactura, htmlFactura, textoFactura } from "./correo";

const BUCKET = "documentos";
const DIAS_RECUPERAR = 3; // si un día falla el cron, al siguiente se emiten las que quedaron pendientes

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });

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

/** Fecha de hoy en Madrid, YYYY-MM-DD */
function hoyMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function restarDias(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const eur = (n: number) =>
  `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean })}€`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const secreto = Deno.env.get("CRON_SECRET")?.trim();
  if (!secreto || req.headers.get("x-cron-secret")?.trim() !== secreto) return json({ error: "No autorizado" }, 401);

  let body: { fecha?: string; simular?: boolean; cliente?: string; prueba?: boolean; enviar_a?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const hoy = body.fecha && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : hoyMadrid();
  const simular = Boolean(body.simular);
  const prueba = Boolean(body.prueba);
  if (prueba && !body.cliente) return json({ error: "En modo prueba indica el cliente" }, 400);

  const clave = primeraDeJson("SUPABASE_SECRET_KEYS") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!clave) return json({ error: "Falta la clave secreta de Supabase" }, 500);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, clave, { auth: { persistSession: false, autoRefreshToken: false } });

  // Emisor: tu perfil de cliente (el que lleva tus impuestos)
  const emailEmisor = (Deno.env.get("NOMOTAX_EMISOR_EMAIL") ?? "").trim().toLowerCase();
  if (!emailEmisor) return json({ error: "Falta el secreto NOMOTAX_EMISOR_EMAIL (email de tu perfil de cliente)" }, 500);
  const { data: emisor } = await db.from("profiles").select("*").ilike("email", emailEmisor).maybeSingle();
  if (!emisor) return json({ error: `No hay ningún perfil con el email ${emailEmisor}` }, 500);
  if (!emisor.nombre || !emisor.nif || !emisor.direccion) {
    return json({ error: "Completa nombre, NIF y dirección en «Mi perfil» de la cuenta emisora" }, 500);
  }

  let consulta = db.from("profiles").select("*").eq("role", "client").not("plan", "is", null).neq("id", emisor.id);
  if (body.cliente) {
    const c = body.cliente.trim();
    consulta = /^[0-9a-f-]{36}$/i.test(c) ? consulta.eq("id", c) : c.includes("@") ? consulta.ilike("email", c) : consulta.ilike("nombre", `%${c}%`);
  }
  const { data: clientes, error: eCli } = await consulta;
  if (eCli) return json({ error: eCli.message }, 500);

  // Días a revisar: hoy y los anteriores por si el cron no corrió
  const dias = Array.from({ length: DIAS_RECUPERAR + 1 }, (_, i) => restarDias(hoy, DIAS_RECUPERAR - i));
  const resultado: unknown[] = [];

  if (prueba) {
    if ((clientes ?? []).length !== 1) {
      return json({ error: `Encuentro ${(clientes ?? []).length} clientes con plan para «${body.cliente}»; tiene que ser uno` }, 400);
    }
    const cli = clientes![0];
    // Las líneas de su plan, como si hoy fuera su día de cobro (no toca su fecha real)
    const f = facturaDelDia({ ...cli, plan_proximo_cobro: hoy }, hoy);
    if (!f) return json({ error: "Ese cliente no tiene plan" }, 400);
    const totales = calcularTotales(f.lineas, IRPF_NOMOTAX);
    const destino = (body.enviar_a || cli.email_facturacion || cli.email || "").trim();
    try {
      // Se registra con el periodo de hoy: así no bloquea su factura real del día de cobro
      const r = await emitir(db, emisor, cli, hoy, hoy, f, totales, destino, true);
      return json({ hoy, prueba, emisor: emisor.email, facturas: [r] });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  for (const cli of clientes ?? []) {
    for (const dia of dias) {
      const f = facturaDelDia(cli, dia);
      if (!f) continue;

      const { data: hecha } = await db.from("facturas_plan").select("id").eq("cliente_id", cli.id).eq("periodo", dia).maybeSingle();
      if (hecha) continue;

      const totales = calcularTotales(f.lineas, IRPF_NOMOTAX);
      const destino = (cli.email_facturacion || cli.email || "").trim();
      if (simular) {
        resultado.push({ cliente: cli.nombre, dia, destino, lineas: f.lineas, ...totales, desglose: undefined });
        continue;
      }

      try {
        resultado.push(await emitir(db, emisor, cli, dia, hoy, f, totales, destino));
      } catch (e) {
        console.error("facturar-planes", cli.nombre, e);
        resultado.push({ cliente: cli.nombre, dia, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  return json({ hoy, simular, emisor: emisor.email, facturas: resultado });
});

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type Perfil = Record<string, any>;

async function emitir(
  db: Db,
  emisor: Perfil,
  cli: Perfil,
  dia: string,
  hoy: string,
  f: { lineas: Invoice["lineas"]; resumen: string },
  t: { base: number; cuota_iva: number; cuota_irpf: number; total: number },
  destino: string,
  prueba = false,
) {
  // 1. Contacto del cliente en la cuenta emisora (por NIF; si no, se crea)
  const datosCliente = {
    nombre: cli.nombre,
    nif: cli.nif,
    email: destino || null,
    direccion: cli.direccion,
    cp: cli.cp,
    ciudad: cli.ciudad,
    provincia: cli.provincia,
    pais: cli.pais ?? "España",
  };
  let contactId: string | null = null;
  if (cli.nif) {
    const { data: c } = await db.from("contacts").select("id").eq("owner_id", emisor.id).eq("nif", cli.nif).maybeSingle();
    contactId = c?.id ?? null;
  }
  if (!contactId) {
    const { data: c, error } = await db.from("contacts").insert({ owner_id: emisor.id, ...datosCliente }).select("id").single();
    if (error) throw new Error(`Contacto: ${error.message}`);
    contactId = c.id;
  }

  // 2. Factura emitida en la cuenta emisora (la base de datos pone número y datos del emisor)
  const { data: factura, error: eFac } = await db
    .from("invoices")
    .insert({
      owner_id: emisor.id,
      contact_id: contactId,
      origen: "app",
      cliente: datosCliente,
      serie: prueba ? "PRUEBA" : (emisor.serie_factura || "F").toUpperCase(),
      fecha: hoy,
      vencimiento: hoy,
      lineas: f.lineas,
      base: t.base,
      cuota_iva: t.cuota_iva,
      irpf_pct: IRPF_NOMOTAX,
      cuota_irpf: t.cuota_irpf,
      total: t.total,
      estado: "emitida",
      notas: prueba ? "Factura de PRUEBA del sistema de facturación automática. Sin validez fiscal." : null,
    })
    .select("*")
    .single();
  if (eFac) throw new Error(`Factura: ${eFac.message}`);

  // 3. PDF con el diseño de la app
  const emisorPdf = (factura.emisor ?? emisor) as Emisor;
  const logo = await cargarLogo(db, emisorPdf.logo_path);
  const { doc, nombre } = await construirPdf(
    "factura",
    factura as Invoice,
    emisorPdf,
    { color: emisor.color_marca, nombreComercial: emisor.nombre_comercial },
    logo,
    prueba,
  );
  const pdf = new Uint8Array(doc.output("arraybuffer"));

  const rutaEmisor = `${emisor.id}/facturas/${factura.numero}.pdf`;
  const up1 = await db.storage.from(BUCKET).upload(rutaEmisor, pdf, { contentType: "application/pdf", upsert: true });
  if (up1.error) throw new Error(`PDF emisor: ${up1.error.message}`);
  await db.from("invoices").update({ file_path: rutaEmisor }).eq("id", factura.id);

  // 4. Gasto revisado en la cuenta del cliente, con el PDF
  const rutaCliente = `${cli.id}/gastos/${factura.numero}.pdf`;
  const up2 = await db.storage.from(BUCKET).upload(rutaCliente, pdf, { contentType: "application/pdf", upsert: true });
  if (up2.error) throw new Error(`PDF cliente: ${up2.error.message}`);
  const proveedor = emisor.nombre_comercial ? `${emisor.nombre_comercial} (${emisor.nombre})` : emisor.nombre;
  const { data: gasto, error: eGas } = await db
    .from("expenses")
    .insert({
      owner_id: cli.id,
      fecha: hoy,
      proveedor,
      proveedor_nif: emisor.nif,
      numero: factura.numero,
      concepto: prueba ? `PRUEBA · ${f.resumen}` : f.resumen,
      categoria: "profesionales",
      base: t.base,
      iva_pct: 21,
      cuota_iva: t.cuota_iva,
      irpf_pct: IRPF_NOMOTAX,
      cuota_irpf: t.cuota_irpf,
      total: t.total,
      estado: "revisado",
      file_path: rutaCliente,
    })
    .select("id")
    .single();
  if (eGas) throw new Error(`Gasto del cliente: ${eGas.message}`);

  // 5. Registro (evita facturar dos veces el mismo periodo)
  const { data: reg, error: eReg } = await db
    .from("facturas_plan")
    .insert({ cliente_id: cli.id, periodo: dia, invoice_id: factura.id, expense_id: gasto.id, email: destino || null })
    .select("id")
    .single();
  if (eReg) throw new Error(`Registro: ${eReg.message}`);

  // 6. Correo al cliente desde info@nomotax.io (sin copia)
  let enviada = false;
  let errorEnvio: string | null = null;
  if (destino) {
    try {
      await enviarFactura(
        destino,
        {
          nombre: cli.nombre,
          numero: factura.numero,
          fecha: factura.fecha,
          lineas: f.lineas,
          base: t.base,
          cuota_iva: t.cuota_iva,
          cuota_irpf: t.cuota_irpf,
          total: t.total,
          iban: emisorPdf.iban ?? null,
          prueba,
        },
        nombre,
        pdf,
      );
      enviada = true;
      await db.from("facturas_plan").update({ enviada_at: new Date().toISOString() }).eq("id", reg.id);
    } catch (e) {
      errorEnvio = e instanceof Error ? e.message : String(e);
      await db.from("facturas_plan").update({ error: errorEnvio }).eq("id", reg.id);
    }
  } else {
    errorEnvio = "El cliente no tiene email";
  }

  return { cliente: cli.nombre, dia, numero: factura.numero, total: t.total, destino, enviada, error: errorEnvio };
}

async function cargarLogo(db: Db, path: string | null | undefined): Promise<LogoPdf | null> {
  if (!path) return null;
  try {
    const { data } = await db.storage.from(BUCKET).download(path);
    if (!data) return null;
    const tipo = (data.type || "").toLowerCase();
    const formato = tipo.includes("png") || path.endsWith(".png") ? "PNG" : tipo.includes("jpeg") || tipo.includes("jpg") || /\.jpe?g$/.test(path) ? "JPEG" : null;
    if (!formato) return null; // webp: el PDF del servidor sale sin logo
    const bytes = new Uint8Array(await data.arrayBuffer());
    const dataUrl = `data:image/${formato.toLowerCase()};base64,${aBase64(bytes)}`;
    const props = new jsPDF().getImageProperties(dataUrl);
    return { dataUrl, formato, w: props.width, h: props.height };
  } catch {
    return null;
  }
}

async function enviarFactura(email: string, datos: Parameters<typeof htmlFactura>[0], archivo: string, pdf: Uint8Array) {
  const pass = Deno.env.get("SMTP_PASSWORD");
  if (!pass) throw new Error("Falta el secreto SMTP_PASSWORD");
  const t = nodemailer.createTransport({
    host: Deno.env.get("SMTP_HOST") ?? "smtp.hostinger.com",
    port: 465,
    secure: true,
    auth: { user: Deno.env.get("SMTP_USER") ?? "info@nomotax.io", pass },
  });
  await t.sendMail({
    from: '"NomoTax" <info@nomotax.io>',
    to: email,
    subject: asuntoFactura(datos),
    text: textoFactura(datos),
    html: htmlFactura(datos),
    attachments: [{ filename: archivo, content: pdf, contentType: "application/pdf" }],
  });
}
