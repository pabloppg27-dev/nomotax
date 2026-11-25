// Correo de la factura mensual: mismo diseño que el de bienvenida (invitar-cliente).

const APP_URL = "https://clientes.nomotax.io";
const LOGO = "https://clientes.nomotax.io/logo.png";
const WHATSAPP = "https://wa.me/34642757633";
const TELEFONO = "+34 642 75 76 33";

export interface DatosCorreoFactura {
  nombre: string | null;
  numero: string;
  fecha: string; // YYYY-MM-DD
  lineas: { concepto: string; cantidad: number; precio: number }[];
  base: number;
  cuota_iva: number;
  cuota_irpf: number;
  total: number;
  iban?: string | null;
  prueba?: boolean;
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
}

const eur = (n: number) =>
  `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" as unknown as boolean })}€`;

const fechaLarga = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function asuntoFactura(d: DatosCorreoFactura) {
  return `${d.prueba ? "[PRUEBA] " : ""}Tu factura ${d.numero} de NomoTax`;
}

export function textoFactura(d: DatosCorreoFactura) {
  return [
    `Hola${d.nombre ? " " + d.nombre : ""},`,
    "",
    `Te adjuntamos la factura ${d.numero} del ${fechaLarga(d.fecha)}.`,
    "",
    ...d.lineas.map((l) => `· ${l.concepto.split("\n")[0]}: ${eur(l.cantidad * l.precio)}`),
    `Total: ${eur(d.total)} (IVA incluido, retención descontada)`,
    "",
    d.iban ? `Pago por transferencia a ${d.iban}, indicando ${d.numero}.` : "",
    `También la tienes en NomoTax Business Hub, en Gastos: ${APP_URL}/gastos`,
    "",
    `¿Dudas? WhatsApp ${WHATSAPP} · ${TELEFONO} · info@nomotax.io`,
    "",
    "Un saludo,",
    "El equipo de NomoTax",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");
}

export function htmlFactura(d: DatosCorreoFactura) {
  const nombre = d.nombre ? " " + esc(d.nombre) : "";
  const fila = (izq: string, der: string, fuerte = false) => `
      <tr><td style="padding:6px 0;font:${fuerte ? "600 " : ""}14px/1.5 Helvetica,Arial,sans-serif;color:${fuerte ? "#111110" : "#6b6b66"}">${izq}</td>
      <td align="right" style="padding:6px 0;font:${fuerte ? "600 " : ""}14px/1.5 Helvetica,Arial,sans-serif;color:#111110;white-space:nowrap">${der}</td></tr>`;
  const conceptos = d.lineas
    .map((l) => {
      const [titulo, detalle] = l.concepto.split("\n");
      return `
      <tr><td style="padding:10px 0;border-bottom:1px solid #e7e7e2;font:14px/1.45 Helvetica,Arial,sans-serif;color:#111110">
        <strong>${esc(titulo)}</strong>${detalle ? `<br><span style="color:#6b6b66">${esc(detalle)}</span>` : ""}
        ${l.cantidad !== 1 ? `<br><span style="color:#6b6b66">${l.cantidad} × ${eur(l.precio)}</span>` : ""}
      </td>
      <td align="right" valign="top" style="padding:10px 0;border-bottom:1px solid #e7e7e2;font:14px/1.45 Helvetica,Arial,sans-serif;color:#111110;white-space:nowrap">${eur(l.cantidad * l.precio)}</td></tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0;background:#f7f7f5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e7e7e2">
  <tr><td style="background:#111110;padding:26px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${LOGO}" width="40" height="40" alt="NomoTax" style="display:block;border-radius:8px"></td>
      <td style="padding-left:12px;font:600 18px Helvetica,Arial,sans-serif;color:#ffffff">NomoTax<br>
        <span style="font:500 11px Helvetica,Arial,sans-serif;letter-spacing:2px;color:#CDF564">${d.prueba ? "FACTURA DE PRUEBA" : "TU FACTURA"}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px 32px 8px 32px;font:15px/1.6 Helvetica,Arial,sans-serif;color:#111110">
    <h1 style="margin:0 0 12px 0;font:600 24px/1.25 Helvetica,Arial,sans-serif;color:#111110">Hola${nombre}, aquí tienes tu factura</h1>
    <p style="margin:0 0 22px 0">Te adjuntamos en PDF la factura de este mes. Gracias por confiar en NomoTax.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f5;border-radius:14px">
      <tr><td style="padding:18px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font:14px/1.5 Helvetica,Arial,sans-serif;color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">FACTURA</span><br>
            <strong style="font-size:17px">${esc(d.numero)}</strong><br>
            <span style="color:#6b6b66">${fechaLarga(d.fecha)}</span>
          </td>
          <td align="right" valign="top" style="font:14px/1.5 Helvetica,Arial,sans-serif;color:#111110">
            <span style="color:#6b6b66;font-size:12px;letter-spacing:1px">TOTAL</span><br>
            <strong style="font-family:Menlo,Consolas,monospace;font-size:18px;background:#CDF564;padding:2px 8px;border-radius:6px;white-space:nowrap">${eur(d.total)}</strong>
          </td>
        </tr></table>
      </td></tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px 0">
      ${conceptos}
      ${fila("Base imponible", eur(d.base))}
      ${fila("IVA 21%", eur(d.cuota_iva))}
      ${d.cuota_irpf ? fila("Retención IRPF 15%", `−${eur(d.cuota_irpf)}`) : ""}
      ${fila("Total", eur(d.total), true)}
    </table>

    ${d.iban ? `<p style="margin:14px 0 0 0;font-size:14px;color:#6b6b66">Pago por transferencia a <strong style="color:#111110">${esc(d.iban)}</strong>, indicando <strong style="color:#111110">${esc(d.numero)}</strong>. En el PDF tienes un código QR para pagar desde la app de tu banco.</p>` : ""}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#111110;border-radius:999px">
      <a href="${APP_URL}/gastos" style="display:inline-block;padding:14px 28px;font:600 15px Helvetica,Arial,sans-serif;color:#ffffff;text-decoration:none">Verla en Business Hub →</a>
    </td></tr></table>
    <p style="margin:0 0 18px 0;font-size:14px;color:#6b6b66">Ya está guardada en tus Gastos, lista para tu contabilidad: no tienes que subirla.</p>
  </td></tr>
  <tr><td style="padding:8px 32px 30px 32px;font:14px/1.6 Helvetica,Arial,sans-serif;color:#111110;border-top:1px solid #efefea">
    <p style="margin:18px 0 4px 0">¿Dudas con la factura? Estamos a un mensaje:</p>
    <a href="${WHATSAPP}" style="color:#111110;font-weight:600">WhatsApp</a> &nbsp;·&nbsp;
    <a href="tel:+34642757633" style="color:#111110;font-weight:600">${TELEFONO}</a> &nbsp;·&nbsp;
    <a href="mailto:info@nomotax.io" style="color:#111110;font-weight:600">info@nomotax.io</a>
    <p style="margin:18px 0 0 0">Un saludo,<br><strong>El equipo de NomoTax</strong></p>
  </td></tr>
</table>
<p style="font:12px Helvetica,Arial,sans-serif;color:#9a9a94;margin:16px 0 0 0">NomoTax · <a href="https://nomotax.io" style="color:#9a9a94">nomotax.io</a></p>
</td></tr></table></body></html>`;
}
