<?php
// Formulario de /contacto y /en/contacto → correo a info@nomotax.io
// Responde JSON si la petición viene de fetch; si no (sin JS), redirige de vuelta.

const DESTINO = 'info@nomotax.io';
const REMITENTE = 'info@nomotax.io';

$en = (($_POST['lang'] ?? '') === 'en');
$vuelta = $en ? '/en/contacto' : '/contacto';
$ajax = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;

function responder($ok, $msg, $ajax, $vuelta) {
  if ($ajax) {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($ok ? 200 : 400);
    echo json_encode(['ok' => $ok, 'error' => $ok ? null : $msg], JSON_UNESCAPED_UNICODE);
  } else {
    header('Location: ' . $vuelta . '?' . ($ok ? 'enviado=1' : 'error=1') . '#formulario');
  }
  exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  header('Location: /contacto');
  exit;
}

// Antispam: campo trampa oculto y menos de 3 s rellenando el formulario (t = ms, lo mide el navegador)
$t = (int)($_POST['t'] ?? 0);
if (!empty($_POST['web']) || ($t > 0 && $t < 3000)) {
  responder(true, '', $ajax, $vuelta); // fingimos éxito al bot
}

function limpio($v, $max) {
  $v = trim((string)$v);
  $v = str_replace(["\r", "\n"], ' ', $v); // sin saltos: evita inyección de cabeceras
  return mb_substr($v, 0, $max);
}

$nombre   = limpio($_POST['nombre'] ?? '', 120);
$email    = limpio($_POST['email'] ?? '', 160);
$telefono = limpio($_POST['telefono'] ?? '', 40);
$motivo   = limpio($_POST['motivo'] ?? '', 80);
$mensaje  = mb_substr(trim((string)($_POST['mensaje'] ?? '')), 0, 5000);
$acepta   = !empty($_POST['privacidad']);

if ($nombre === '' || $mensaje === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !$acepta) {
  responder(false, $en ? 'Please fill in the required fields.' : 'Revisa los campos obligatorios.', $ajax, $vuelta);
}

$asunto = 'Contacto web: ' . $nombre . ($motivo !== '' ? ' · ' . $motivo : '');
$cuerpo = "Nuevo mensaje desde el formulario de nomotax.io" . ($en ? ' (EN)' : '') . "\n\n"
  . "Nombre:   $nombre\n"
  . "Email:    $email\n"
  . "Teléfono: " . ($telefono !== '' ? $telefono : '—') . "\n"
  . "Motivo:   " . ($motivo !== '' ? $motivo : '—') . "\n\n"
  . "Mensaje:\n$mensaje\n\n"
  . "—\nEnviado el " . date('d/m/Y H:i') . " · IP " . ($_SERVER['REMOTE_ADDR'] ?? '?') . "\n"
  . "Responde a este correo para contestar directamente a $email.\n";

$cabeceras = implode("\r\n", [
  'From: NomoTax web <' . REMITENTE . '>',
  'Reply-To: ' . $nombre . ' <' . $email . '>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=UTF-8',
  'Content-Transfer-Encoding: 8bit',
]);

$ok = mail(DESTINO, '=?UTF-8?B?' . base64_encode($asunto) . '?=', $cuerpo, $cabeceras, '-f' . REMITENTE);

responder($ok, $en ? 'The message could not be sent. Please email info@nomotax.io.' : 'No se ha podido enviar. Escríbenos a info@nomotax.io.', $ajax, $vuelta);
