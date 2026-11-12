/**
 * NomoTax · Correo de bienvenida del Área de clientes.
 * Proyecto de Apps Script en la cuenta info@nomotax.io (los correos salen desde ahí).
 *
 * Lo llama SOLO la función «invitar-cliente» de Supabase, con una clave secreta
 * guardada aquí en Configuración del proyecto → Propiedades del script → CLAVE.
 * Implementar → Aplicación web → Ejecutar como: yo · Acceso: cualquier usuario.
 */

const APP_URL = 'https://clientes.nomotax.io';
const LOGO = 'https://clientes.nomotax.io/logo.png';
const COPIA = 'pablo@nomotax.io';
const WHATSAPP = 'https://wa.me/34642757633';
const TELEFONO = '+34 642 75 76 33';

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return salida({ ok: false, error: 'json' });
  }
  const clave = PropertiesService.getScriptProperties().getProperty('CLAVE');
  if (!clave || d.clave !== clave) return salida({ ok: false, error: 'clave' });
  if (d.accion !== 'bienvenida' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email || '') || !d.password) {
    return salida({ ok: false, error: 'datos' });
  }
  try {
    MailApp.sendEmail({
      to: d.email,
      bcc: COPIA,
      name: 'NomoTax',
      replyTo: 'info@nomotax.io',
      subject: 'Bienvenido/a al Área de clientes de NomoTax',
      htmlBody: html(d),
      body: texto(d),
    });
    return salida({ ok: true });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  }
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function esc(s) {
  return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function texto(d) {
  return [
    `Hola${d.nombre ? ' ' + d.nombre : ''},`,
    '',
    'Ya tienes acceso al Área de clientes de NomoTax.',
    '',
    `Entra en: ${APP_URL}`,
    `Usuario: ${d.email}`,
    `Contraseña provisional: ${d.password}`,
    '',
    'Al entrar, cámbiala en «Mi perfil».',
    '',
    'Qué puedes hacer: subir tus gastos (también con una foto desde el móvil), crear facturas y presupuestos, ver tu contabilidad al día y hablar con tu asesor desde «Mi asesor».',
    '',
    `¿Dudas? Escríbenos por WhatsApp (${WHATSAPP}), llámanos al ${TELEFONO} o responde a este correo.`,
    '',
    'Pablo Pérez del Pulgar · NomoTax',
  ].join('\n');
}

function html(d) {
  const nombre = d.nombre ? ' ' + esc(d.nombre) : '';
  const paso = (n, t, s) => `
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

/** Prueba manual desde el editor: envía el correo a info@ con datos de ejemplo */
function probar() {
  MailApp.sendEmail({ to: 'info@nomotax.io', name: 'NomoTax', subject: '[Prueba] Bienvenida Área de clientes', htmlBody: html({ nombre: 'Cliente de prueba', email: 'cliente@ejemplo.com', password: 'Abc123xyz' }), body: 'prueba' });
}
