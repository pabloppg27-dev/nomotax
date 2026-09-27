/**
 * NomoTax · Motor de reservas de la asesoría gratuita
 * ------------------------------------------------------------------
 * Google Apps Script publicado como aplicación web en la cuenta de Google
 * de NomoTax. La web (js/main.js, bloque "RESERVAS") le pide los huecos
 * libres y le envía las reservas; aquí se consulta el Google Calendar,
 * se crea la cita (con enlace de Google Meet si es videollamada) y Google
 * envía la invitación al cliente. Al propietario le llega además un email.
 *
 * Para cambiar horarios, duración o antelación basta con editar CONFIG
 * y volver a desplegar (Implementar → Gestionar implementaciones → editar
 * → Nueva versión). Requiere el servicio avanzado "Google Calendar API".
 */

var CONFIG = {
  zona: 'Europe/Madrid',
  calendario: 'primary',
  duracion: 30,          // minutos de cada cita
  paso: 30,              // cada cuántos minutos puede empezar una cita
  margen: 15,            // minutos libres antes y después de cada cita
  antelacionHoras: 12,   // no se puede reservar con menos antelación
  diasVista: 28,         // hasta cuántos días en adelante
  // 1 = lunes … 7 = domingo, en hora de Madrid
  horario: {
    1: [['09:00', '14:00'], ['16:00', '19:00']],
    2: [['09:00', '14:00'], ['16:00', '19:00']],
    3: [['09:00', '14:00'], ['16:00', '19:00']],
    4: [['09:00', '14:00'], ['16:00', '19:00']],
    5: [['09:00', '14:00'], ['16:00', '19:00']]
  },
  whatsapp: '+34 642 75 76 33',
  email: 'info@nomotax.io'
};

/* ---------- Entradas de la aplicación web ---------- */

function doGet(e) {
  var accion = (e && e.parameter && e.parameter.accion) || 'huecos';
  if (accion === 'huecos') {
    // La agenda se guarda 2 minutos en caché: responde al instante y ahorra consultas
    var cache = CacheService.getScriptCache();
    var guardado = cache.get('huecos');
    if (guardado) return ContentService.createTextOutput(guardado).setMimeType(ContentService.MimeType.JSON);
    var texto = JSON.stringify(huecosLibres());
    cache.put('huecos', texto, 120);
    return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
  }
  return responder({ ok: false, error: 'accion' });
}

function doPost(e) {
  var datos;
  try {
    datos = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder({ ok: false, error: 'formato' });
  }
  if (datos.accion === 'reservar') return responder(reservar(datos));
  return responder({ ok: false, error: 'accion' });
}

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Disponibilidad ---------- */

function huecosLibres() {
  var ahora = new Date();
  var desde = new Date(ahora.getTime() + CONFIG.antelacionHoras * 3600000);
  var hasta = new Date(ahora.getTime() + (CONFIG.diasVista + 1) * 86400000);
  var ocupado = ocupados(ahora, hasta);
  var vistos = {};
  var huecos = [];

  for (var d = 0; d <= CONFIG.diasVista + 1; d++) {
    var dia = new Date(ahora.getTime() + d * 86400000);
    var ymd = Utilities.formatDate(dia, CONFIG.zona, 'yyyy-MM-dd');
    if (vistos[ymd]) continue;
    vistos[ymd] = true;
    var tramos = CONFIG.horario[Number(Utilities.formatDate(dia, CONFIG.zona, 'u'))];
    if (!tramos) continue;

    tramos.forEach(function (tramo) {
      var t = enZona(ymd, tramo[0]).getTime();
      var fin = enZona(ymd, tramo[1]).getTime();
      while (t + CONFIG.duracion * 60000 <= fin) {
        if (t >= desde.getTime() && t <= hasta.getTime() && estaLibre(t, ocupado)) {
          huecos.push(new Date(t).toISOString());
        }
        t += CONFIG.paso * 60000;
      }
    });
  }
  return { ok: true, zona: CONFIG.zona, duracion: CONFIG.duracion, huecos: huecos };
}

// "2026-10-02" + "09:00" en hora de Madrid → Date
function enZona(ymd, hm) {
  return Utilities.parseDate(ymd + ' ' + hm, CONFIG.zona, 'yyyy-MM-dd HH:mm');
}

// Tramos ocupados del calendario (respeta los eventos marcados como "Disponible")
function ocupados(desde, hasta) {
  var r = Calendar.Freebusy.query({
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    timeZone: CONFIG.zona,
    items: [{ id: CONFIG.calendario }]
  });
  var cal = r.calendars[CONFIG.calendario] || r.calendars[Object.keys(r.calendars)[0]] || {};
  return (cal.busy || []).map(function (b) {
    return [new Date(b.start).getTime(), new Date(b.end).getTime()];
  });
}

function estaLibre(t, ocupado) {
  var a = t - CONFIG.margen * 60000;
  var b = t + (CONFIG.duracion + CONFIG.margen) * 60000;
  return !ocupado.some(function (o) { return o[0] < b && o[1] > a; });
}

/* ---------- Reserva ---------- */

function reservar(d) {
  // Campo trampa: si viene relleno es un bot; se responde "ok" sin hacer nada
  if (d.web) return { ok: true };

  var nombre = limpiar(d.nombre, 100);
  var email = limpiar(d.email, 150).toLowerCase();
  var telefono = limpiar(d.telefono, 30);
  var motivo = limpiar(d.motivo, 1000);
  var tipo = d.tipo === 'whatsapp' ? 'whatsapp' : 'meet';
  var en = d.idioma === 'en';
  var zonaCliente = limpiar(d.zona, 60);
  // Servicio desde el que se reserva: en español para ti y en el idioma del cliente para su invitación
  var servicio = limpiar(d.servicio, 80) || 'Consulta general';
  var servicioCliente = limpiar(d.servicioCliente, 80) || servicio;
  var detalle = limpiar(d.detalle, 80);
  var pagina = limpiar(d.pagina, 120);
  var tema = servicioCliente + (detalle ? ' (' + detalle + ')' : '');

  if (nombre.length < 2) return { ok: false, error: 'nombre' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: 'email' };
  if (telefono.replace(/\D/g, '').length < 6) return { ok: false, error: 'telefono' };
  var inicio = new Date(d.inicio);
  if (isNaN(inicio.getTime())) return { ok: false, error: 'fecha' };

  var cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(20000);
  try {
    // El hueco tiene que seguir libre (evita dobles reservas)
    if (huecosLibres().huecos.indexOf(inicio.toISOString()) < 0) return { ok: false, error: 'ocupado' };

    // Una reserva por email cada 6 horas
    var cache = CacheService.getScriptCache();
    if (cache.get('r:' + email)) return { ok: false, error: 'repetida' };

    var fin = new Date(inicio.getTime() + CONFIG.duracion * 60000);
    var modalidad = tipo === 'meet'
      ? (en ? 'Video call (Google Meet — the link is in this invitation)' : 'Videollamada (Google Meet — el enlace está en esta invitación)')
      : (en ? 'WhatsApp call to ' + telefono : 'Llamada por WhatsApp al ' + telefono);

    var descripcion = (en
      ? ['Free 30-minute tax consultation with NomoTax.', '',
         'Service: ' + tema, 'Format: ' + modalidad, 'Name: ' + nombre, 'Email: ' + email, 'Phone: ' + telefono,
         motivo ? 'Topic: ' + motivo : '', '',
         'Need to change it? Message us on WhatsApp (' + CONFIG.whatsapp + ') or email ' + CONFIG.email + '.']
      : ['Asesoría fiscal gratuita de 30 minutos con NomoTax.', '',
         'Servicio: ' + tema, 'Modalidad: ' + modalidad, 'Nombre: ' + nombre, 'Email: ' + email, 'Teléfono: ' + telefono,
         motivo ? 'Motivo: ' + motivo : '', '',
         '¿Necesitas cambiarla? Escríbenos por WhatsApp (' + CONFIG.whatsapp + ') o a ' + CONFIG.email + '.']
    ).filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\n');

    var evento = {
      summary: (en ? 'Free consultation NomoTax · ' : 'Asesoría gratuita NomoTax · ') + tema + ' · ' + nombre +
        (tipo === 'whatsapp' ? ' (WhatsApp)' : ''),
      description: descripcion,
      start: { dateTime: inicio.toISOString(), timeZone: CONFIG.zona },
      end: { dateTime: fin.toISOString(), timeZone: CONFIG.zona },
      attendees: [{ email: email, displayName: nombre }],
      reminders: { useDefault: true }
    };
    if (tipo === 'meet') {
      evento.conferenceData = {
        createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: 'hangoutsMeet' } }
      };
    }
    var creado = Calendar.Events.insert(evento, CONFIG.calendario, { conferenceDataVersion: 1, sendUpdates: 'all' });
    cache.put('r:' + email, '1', 6 * 3600);
    cache.remove('huecos');

    avisarPropietario(inicio, nombre, email, telefono, motivo, tipo, zonaCliente, en, creado,
      servicio + (detalle ? ' (' + detalle + ')' : ''), pagina);
    return { ok: true, inicio: inicio.toISOString(), meet: creado.hangoutLink || '' };
  } finally {
    cerrojo.releaseLock();
  }
}

function avisarPropietario(inicio, nombre, email, telefono, motivo, tipo, zonaCliente, en, creado, servicio, pagina) {
  try {
    var cuando = Utilities.formatDate(inicio, CONFIG.zona, 'dd/MM/yyyy HH:mm');
    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: 'Nueva reserva · ' + servicio + ' · ' + nombre + ' · ' + Utilities.formatDate(inicio, CONFIG.zona, 'dd/MM HH:mm'),
      body: [
        'Nueva asesoría gratuita reservada desde nomotax.io', '',
        'Servicio: ' + servicio,
        'Cuándo: ' + cuando + ' (hora de España)',
        'Modalidad: ' + (tipo === 'meet' ? 'Google Meet' + (creado.hangoutLink ? ' · ' + creado.hangoutLink : '') : 'Llamada por WhatsApp'),
        'Nombre: ' + nombre, 'Email: ' + email, 'Teléfono: ' + telefono,
        'Motivo: ' + (motivo || '—'),
        'Idioma de la web: ' + (en ? 'inglés' : 'español') + (zonaCliente ? ' · zona horaria del cliente: ' + zonaCliente : ''),
        'Reservado desde: https://nomotax.io' + (pagina || '/'), '',
        'Evento: ' + (creado.htmlLink || '')
      ].join('\n')
    });
  } catch (err) {
    console.error(err);
  }
}

function limpiar(valor, max) {
  return String(valor == null ? '' : valor).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

/* Ejecutar una vez desde el editor para conceder los permisos */
function autorizar() {
  var r = huecosLibres();
  console.log('Huecos libres: ' + r.huecos.length + ' · primero: ' + (r.huecos[0] || '—'));
  console.log('Cuenta: ' + Session.getEffectiveUser().getEmail());
}
