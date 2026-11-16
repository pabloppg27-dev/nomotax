// Formulario de /contacto: validación y envío a enviar-contacto.php sin recargar la página
(function () {
  var form = document.getElementById('formulario');
  if (!form) return;
  var en = form.querySelector('[name="lang"]').value === 'en';
  var txt = en ? {
    sending: 'Sending…',
    ok: 'Thanks! We have received your message and will reply shortly.',
    required: 'Please fill in the required fields (*).',
    email: 'Please check your email address.',
    error: 'The message could not be sent. Please email info@nomotax.io.'
  } : {
    sending: 'Enviando…',
    ok: '¡Gracias! Hemos recibido tu mensaje y te responderemos pronto.',
    required: 'Rellena los campos obligatorios (*).',
    email: 'Revisa tu dirección de email.',
    error: 'No se ha podido enviar. Escríbenos a info@nomotax.io.'
  };
  var status = form.querySelector('.contact-form-status');
  var btn = form.querySelector('button[type="submit"]');
  var btnText = btn.textContent;
  var inicio = Date.now();

  function show(msg, ok) {
    status.textContent = msg;
    status.className = 'contact-form-status ' + (ok ? 'is-ok' : 'is-error');
  }

  // Vuelta del envío sin JS (?enviado=1 / ?error=1)
  if (/[?&]enviado=1/.test(location.search)) show(txt.ok, true);
  else if (/[?&]error=1/.test(location.search)) show(txt.error, false);

  form.addEventListener('input', function (e) {
    var f = e.target.closest('.contact-field, .contact-check');
    if (f) f.classList.remove('is-invalid');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var bad = null;
    form.querySelectorAll('[required]').forEach(function (el) {
      var empty = el.type === 'checkbox' ? !el.checked : !el.value.trim();
      var wrong = el.type === 'email' && !empty && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim());
      var wrap = el.closest('.contact-field, .contact-check');
      wrap.classList.toggle('is-invalid', empty || wrong);
      if ((empty || wrong) && !bad) bad = { el: el, wrong: wrong };
    });
    if (bad) {
      show(bad.wrong ? txt.email : txt.required, false);
      bad.el.focus();
      return;
    }

    form.querySelector('[name="t"]').value = Date.now() - inicio; // ms rellenando (antispam)
    btn.disabled = true;
    btn.textContent = txt.sending;
    status.textContent = '';
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { Accept: 'application/json' }
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || txt.error);
        form.reset();
        inicio = Date.now();
        show(txt.ok, true);
      })
      .catch(function (err) {
        show(err && err.message && err.message.indexOf('JSON') === -1 && err.message !== 'Failed to fetch' ? err.message : txt.error, false);
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = btnText;
      });
  });
})();
