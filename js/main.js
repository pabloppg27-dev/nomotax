/* ============================================================
   IDIOMA — la web existe en español (raíz) y en inglés (/en/).
   Los textos de las páginas se traducen en el HTML; aquí solo
   los que genera el JavaScript. T("texto en español") devuelve
   la traducción en las páginas en inglés y el original en el resto.
   ============================================================ */
var NT_LANG = (document.documentElement.lang || "es").slice(0, 2);
// Fechas en el idioma de la página; los importes siempre en formato europeo (100.000 €)
var NT_LOCALE = NT_LANG === "en" ? "en-GB" : "es-ES";
var NT_EN = {
  "Gracias, hemos recibido tu mensaje. Te contactaremos en breve.": "Thank you, we have received your message. We will be in touch shortly.",
  "¡Gracias! Un asesor de NomoTax se pondrá en contacto contigo por teléfono en las próximas 24 horas. Está atento/a a una llamada desde el +34 642 75 76 33.": "Thank you! A NomoTax adviser will call you within the next 24 hours. Keep an eye out for a call from +34 642 75 76 33.",
  "Plan anual": "Annual plan",
  "Plan mensual": "Monthly plan",
  "Por favor, selecciona el tipo de sociedad y cuándo la necesitas.": "Please select the type of company and when you need it.",
  "Por favor, selecciona el tipo de sociedad.": "Please select the type of company.",
  "Por favor, indica si requieres alta de autónomo.": "Please tell us whether you need to register as self-employed.",
  "Indica el nombre que quieres para tu LLC.": "Enter the name you want for your LLC.",
  "Selecciona cuándo quieres tenerla constituida.": "Select when you want it incorporated.",
  "Selecciona el estado donde quieres constituirla.": "Select the state where you want to form it.",
  "Indica tu nombre y apellidos.": "Enter your full name.",
  "Indica un correo electrónico válido.": "Enter a valid email address.",
  "Indica un teléfono móvil válido.": "Enter a valid mobile number.",
  "Indica el nombre de tu LLC.": "Enter your LLC's name.",
  "Indica un EIN válido (formato 12-3456789).": "Enter a valid EIN (format 12-3456789).",
  "Requiere certificado del ICAA (o del órgano competente de tu comunidad) o del INAEM para artes escénicas y musicales, y contrato de financiación comunicado a la AEAT antes de finalizar el periodo impositivo.": "Requires a certificate from the ICAA (or the competent regional body) or from INAEM for performing arts and music, and a financing agreement notified to the Spanish Tax Agency (AEAT) before the end of the tax period.",
  "Requiere informe motivado vinculante del Ministerio de Ciencia, Innovación y Universidades sobre el proyecto, y contrato de financiación comunicado a la AEAT antes de finalizar el periodo impositivo.": "Requires a binding reasoned report on the project from the Ministry of Science, Innovation and Universities, and a financing agreement notified to the Spanish Tax Agency (AEAT) before the end of the tax period.",
  "Lo que pagarías de IRPF": "What you would pay in personal income tax (IRPF)",
  "Lo que pagarías de Impuesto de Sociedades": "What you would pay in Corporate Income Tax",
  "Autónomo · IRPF": "Self-employed · IRPF",
  "Empresa · Impuesto de Sociedades": "Company · Corporate Income Tax",
  "Selecciona qué tipo de proyecto te interesa.": "Select the type of project you are interested in.",
  " · aportación estimada ": " · estimated contribution ",
  " · ahorro neto ": " · net saving ",
  "Cultura": "Culture",
  "I+D": "R&D",
  "Todavía no lo sé": "Not sure yet",
  "Tributa al 24% + 47%": "Taxed at 24% + 47%",
  "Tributa al 24%": "Taxed at 24%",
  "Exentas": "Exempt",
  "Incluidas arriba": "Included above",
  "Empieza por tu salario": "Start with your salary",
  "Pon tus cifras": "Enter your figures",
  "Con tus ingresos reales verás la diferencia entre los dos regímenes.": "With your real income you'll see the difference between the two regimes.",
  "Te ahorras cada año": "You save every year",
  " en los seis años que dura el régimen.": " over the six years the regime lasts.",
  "Con estos números": "With these numbers",
  "No te compensa": "It doesn't pay off",
  "El régimen general sale ": "The standard regime is ",
  " más barato al año. Conviene revisarlo con tu caso completo.": " cheaper per year. It's worth reviewing with your full case.",
  "Un asesor especialista revisará tu caso y te contactará en las próximas 24 horas con el precio cerrado y los siguientes pasos.": "A specialist adviser will review your case and contact you within 24 hours with a fixed price and the next steps.",
  "Selecciona": "Select",
  "Completa todos los campos.": "Please complete all fields.",
  "Elige una fecha a partir de mañana.": "Choose a date from tomorrow onwards.",
  "La fecha de notificación no puede ser posterior a hoy.": "The notification date cannot be later than today.",
  "Elige un día de lunes a viernes.": "Choose a weekday (Monday to Friday).",
  "Aviso de cookies": "Cookie notice",
  "Solo usamos cookies técnicas, necesarias para que la web funcione. No usamos cookies de análisis ni de publicidad. ": "We only use technical cookies, needed for the site to work. We don't use analytics or advertising cookies. ",
  "Política de cookies": "Cookie policy",
  "Aceptar": "Accept",
  "Asesoría gratuita · 30 min": "Free consultation · 30 min",
  "Reserva tu asesoría": "Book your consultation",
  "No hemos podido cargar la agenda en este momento. Escríbenos por WhatsApp y te damos cita al momento.": "We couldn't load the calendar right now. Message us on WhatsApp and we'll book you in straight away.",
  "Escribir por WhatsApp": "Message us on WhatsApp",
  "Sin compromiso. Elige el día y la hora que mejor te vengan.": "No commitment. Pick the day and time that suit you best.",
  "Cargando disponibilidad…": "Loading availability…",
  "Ahora mismo no quedan huecos libres. Escríbenos por WhatsApp y buscamos un momento.": "There are no free slots right now. Message us on WhatsApp and we'll find a time.",
  "Horas en tu zona horaria": "Times shown in your time zone",
  "Cambiar": "Change",
  "¿Cómo prefieres hablar?": "How would you like to talk?",
  "Videollamada (Google Meet)": "Video call (Google Meet)",
  "Llamada por WhatsApp": "WhatsApp call",
  "Nombre y apellidos": "Full name",
  "Email": "Email",
  "Teléfono (WhatsApp)": "Phone (WhatsApp)",
  "¿Sobre qué quieres hablar?": "What would you like to discuss?",
  "Cuéntanos brevemente tu situación (opcional)": "Tell us briefly about your situation (optional)",
  "He leído y acepto la ": "I have read and accept the ",
  "política de privacidad": "privacy policy",
  "Confirmar reserva": "Confirm booking",
  "Indica un teléfono válido.": "Enter a valid phone number.",
  "Debes aceptar la política de privacidad.": "Please accept the privacy policy.",
  "Reservando…": "Booking…",
  "Ya tienes una reserva reciente con este email. Si necesitas cambiarla, escríbenos por WhatsApp.": "You already have a recent booking with this email. If you need to change it, message us on WhatsApp.",
  "No hemos podido completar la reserva. Inténtalo de nuevo o escríbenos por WhatsApp.": "We couldn't complete the booking. Please try again or message us on WhatsApp.",
  "¡Reserva confirmada!": "Booking confirmed!",
  "Te hemos enviado la invitación a tu email con el enlace de Google Meet.": "We've sent the invitation to your email with the Google Meet link.",
  "Te hemos enviado la invitación a tu email. Te llamaremos por WhatsApp a esa hora.": "We've sent the invitation to your email. We'll call you on WhatsApp at that time.",
  "Si necesitas cambiarla, escríbenos por WhatsApp.": "If you need to change it, message us on WhatsApp.",
  "Cerrar": "Close",
  "Sobre": "About",
  "¿Sobre qué servicio?": "Which service is it about?"
};
function T(texto) {
  return NT_LANG === "en" && NT_EN.hasOwnProperty(texto) ? NT_EN[texto] : texto;
}

document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  var header = document.querySelector(".site-header");

  /* ===== Hamburger toggle ===== */
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen);
      if (isOpen) {
        document.body.style.overflow = "hidden";
      } else {
        document.body.style.overflow = "";
      }
    });
  }

  /* ===== Mega menus ===== */
  function closeAllMenus() {
    document.querySelectorAll(".mega-menu.open").forEach(function (m) {
      m.classList.remove("open");
    });
    document.querySelectorAll(".mega-trigger.open").forEach(function (b) {
      b.classList.remove("open");
      b.setAttribute("aria-expanded", "false");
    });
  }

  document.querySelectorAll(".mega-trigger").forEach(function (btn) {
    var menu = document.getElementById("mega-" + btn.dataset.menu);
    if (!menu) return;

    btn.setAttribute("aria-expanded", "false");

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = menu.classList.contains("open");
      closeAllMenus();
      if (!isOpen) {
        menu.classList.add("open");
        btn.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });

    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  });

  document.querySelectorAll(".nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      nav.classList.remove("open");
      document.body.style.overflow = "";
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      closeAllMenus();
    });
  });

  document.addEventListener("click", closeAllMenus);

  /* ===== Escape key closes menus and mobile nav ===== */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeAllMenus();
      if (nav && nav.classList.contains("open")) {
        nav.classList.remove("open");
        document.body.style.overflow = "";
        if (toggle) {
          toggle.setAttribute("aria-expanded", "false");
          toggle.focus();
        }
      }
    }
  });

  /* ===== Scroll → header border ===== */
  if (header) {
    var ticking = false;
    window.addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(function () {
          if (window.scrollY > 8) {
            header.classList.add("is-scrolled");
          } else {
            header.classList.remove("is-scrolled");
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ===== Contact form ===== */
  var form = document.querySelector(".contact-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = form.querySelector(".form-status");
      if (status) {
        status.textContent = T("Gracias, hemos recibido tu mensaje. Te contactaremos en breve.");
      }
      form.reset();
    });
  }

  /* ===== Plan toggle — generic helper ===== */
  function setupPlanToggle(toggleId, labelMensualId, labelAnualId, sectionId) {
    var toggle = document.getElementById(toggleId);
    var lm = document.getElementById(labelMensualId);
    var la = document.getElementById(labelAnualId);
    var section = document.getElementById(sectionId);
    if (!toggle || !section) return;

    function update(isAnnual) {
      section.querySelectorAll(".gst-plan-card").forEach(function (card) {
        var monthly = card.getAttribute("data-price-monthly");
        var annual = card.getAttribute("data-price-annual");
        var amountEl = card.querySelector(".gst-plan-amount");
        if (monthly && annual && amountEl) {
          amountEl.textContent = isAnnual ? annual : monthly;
        }
      });
      if (lm && la) {
        lm.classList.toggle("gst-toggle-active", !isAnnual);
        la.classList.toggle("gst-toggle-active", isAnnual);
      }
    }

    toggle.addEventListener("click", function () {
      var isAnnual = toggle.getAttribute("aria-pressed") !== "true";
      toggle.setAttribute("aria-pressed", isAnnual);
      update(isAnnual);
    });

    if (lm) { lm.addEventListener("click", function () { toggle.setAttribute("aria-pressed", "false"); update(false); }); }
    if (la) { la.addEventListener("click", function () { toggle.setAttribute("aria-pressed", "true"); update(true); }); }
  }

  /* Empresa toggle */
  setupPlanToggle("toggle-anual", "label-mensual", "label-anual", "planes-empresas");
  /* Autónomo toggle */
  setupPlanToggle("toggle-anual-auto", "label-mensual-auto", "label-anual-auto", "planes-autonomos");

  /* ===== Modal — Constituir Sociedad ===== */
  var modalOverlay = document.getElementById("modal-constituir");
  var btnConstituir = document.getElementById("btn-constituir");
  var modalClose = document.getElementById("modal-close");
  var formConstituir = document.getElementById("form-constituir");

  function openModal() {
    if (modalOverlay) {
      modalOverlay.classList.add("gst-modal-open");
      modalOverlay.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeModal() {
    if (modalOverlay) {
      modalOverlay.classList.remove("gst-modal-open");
      modalOverlay.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  if (btnConstituir) {
    btnConstituir.addEventListener("click", openModal);
  }

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === modalOverlay) closeModal();
    });
  }

  /* ===== Mensaje de confirmación tras enviar cualquier formulario ===== */
  var SUCCESS_MSG = T("¡Gracias! Un asesor de NomoTax se pondrá en contacto contigo por teléfono en las próximas 24 horas. Está atento/a a una llamada desde el +34 642 75 76 33.");

  /* ===== Modal — Solicitar Alta ===== */
  var modalAlta = document.getElementById("modal-alta");
  var modalAltaClose = document.getElementById("modal-alta-close");
  var modalAltaPlan = document.getElementById("modal-alta-plan");
  var modalAltaPeriodo = document.getElementById("modal-alta-periodo");
  var formAlta = document.getElementById("form-alta");

  function openAltaModal(planName, periodoText) {
    if (modalAlta) {
      if (modalAltaPlan) modalAltaPlan.textContent = planName;
      if (modalAltaPeriodo) modalAltaPeriodo.textContent = periodoText || "";
      modalAlta.classList.add("gst-modal-open");
      modalAlta.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeAltaModal() {
    if (modalAlta) {
      modalAlta.classList.remove("gst-modal-open");
      modalAlta.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  /* Contratar buttons — Empresa */
  document.querySelectorAll(".gst-plan-cta:not(.gst-plan-cta-auto):not(.gst-plan-cta-laboral)").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var toggleEmpresa = document.getElementById("toggle-anual");
      var isAnnual = toggleEmpresa && toggleEmpresa.getAttribute("aria-pressed") === "true";
      openAltaModal(btn.getAttribute("data-plan"), isAnnual ? T("Plan anual") : T("Plan mensual"));
    });
  });

  if (modalAltaClose) {
    modalAltaClose.addEventListener("click", closeAltaModal);
  }

  if (modalAlta) {
    modalAlta.addEventListener("click", function (e) {
      if (e.target === modalAlta) closeAltaModal();
    });
  }

  /* ===== Modal — Solicitar Alta Autónomo ===== */
  var modalAltaAuto = document.getElementById("modal-alta-auto");
  var modalAltaAutoClose = document.getElementById("modal-alta-auto-close");
  var modalAltaAutoPlan = document.getElementById("modal-alta-auto-plan");
  var modalAltaAutoPeriodo = document.getElementById("modal-alta-auto-periodo");
  var formAltaAuto = document.getElementById("form-alta-auto");
  var autoFechaWrap = document.getElementById("auto-fecha-wrap");

  function openAltaAutoModal(planName, periodoText) {
    if (modalAltaAuto) {
      if (modalAltaAutoPlan) modalAltaAutoPlan.textContent = planName;
      if (modalAltaAutoPeriodo) modalAltaAutoPeriodo.textContent = periodoText || "";
      modalAltaAuto.classList.add("gst-modal-open");
      modalAltaAuto.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeAltaAutoModal() {
    if (modalAltaAuto) {
      modalAltaAuto.classList.remove("gst-modal-open");
      modalAltaAuto.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  /* Contratar buttons — Autónomo */
  document.querySelectorAll(".gst-plan-cta-auto").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var toggleAuto = document.getElementById("toggle-anual-auto");
      var isAnnual = toggleAuto && toggleAuto.getAttribute("aria-pressed") === "true";
      openAltaAutoModal(btn.getAttribute("data-plan"), isAnnual ? T("Plan anual") : T("Plan mensual"));
    });
  });

  if (modalAltaAutoClose) {
    modalAltaAutoClose.addEventListener("click", closeAltaAutoModal);
  }

  if (modalAltaAuto) {
    modalAltaAuto.addEventListener("click", function (e) {
      if (e.target === modalAltaAuto) closeAltaAutoModal();
    });
  }

  /* Show/hide date field based on alta selection */
  var autoFieldAlta = document.getElementById("auto-field-alta");
  if (autoFieldAlta && autoFechaWrap) {
    autoFieldAlta.addEventListener("click", function (e) {
      var btn = e.target.closest(".gst-modal-option");
      if (!btn) return;
      autoFechaWrap.style.display = btn.getAttribute("data-value") === "si" ? "" : "none";
    });
  }

  /* ===== Modal — Solicitar Área Laboral ===== */
  var modalLaboral = document.getElementById("modal-laboral");
  var modalLaboralClose = document.getElementById("modal-laboral-close");
  var modalLaboralPlan = document.getElementById("modal-laboral-plan");
  var formLaboral = document.getElementById("form-laboral");

  function openLaboralModal(planName) {
    if (modalLaboral) {
      if (modalLaboralPlan) modalLaboralPlan.textContent = planName;
      modalLaboral.classList.add("gst-modal-open");
      modalLaboral.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }
  }

  function closeLaboralModal() {
    if (modalLaboral) {
      modalLaboral.classList.remove("gst-modal-open");
      modalLaboral.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }
  }

  /* Contratar buttons — Área Laboral */
  document.querySelectorAll(".gst-plan-cta-laboral").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openLaboralModal(btn.getAttribute("data-plan"));
    });
  });

  if (modalLaboralClose) {
    modalLaboralClose.addEventListener("click", closeLaboralModal);
  }

  if (modalLaboral) {
    modalLaboral.addEventListener("click", function (e) {
      if (e.target === modalLaboral) closeLaboralModal();
    });
  }

  /* Escape key closes any open modal */
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (modalOverlay && modalOverlay.classList.contains("gst-modal-open")) {
        closeModal();
      }
      if (modalAlta && modalAlta.classList.contains("gst-modal-open")) {
        closeAltaModal();
      }
      if (modalAltaAuto && modalAltaAuto.classList.contains("gst-modal-open")) {
        closeAltaAutoModal();
      }
      if (modalLaboral && modalLaboral.classList.contains("gst-modal-open")) {
        closeLaboralModal();
      }
    }
  });

  /* Option buttons in all modals */
  document.querySelectorAll(".gst-modal-options").forEach(function (group) {
    group.addEventListener("click", function (e) {
      var btn = e.target.closest(".gst-modal-option");
      if (!btn) return;
      group.querySelectorAll(".gst-modal-option").forEach(function (b) {
        b.classList.remove("gst-option-selected");
      });
      btn.classList.add("gst-option-selected");
    });
  });

  /* Form submit — Constituir */
  if (formConstituir) {
    formConstituir.addEventListener("submit", function (e) {
      e.preventDefault();
      var tipo = formConstituir.querySelector("#field-tipo .gst-option-selected");
      var cuando = formConstituir.querySelector("#field-cuando .gst-option-selected");

      if (!tipo || !cuando) {
        alert(T("Por favor, selecciona el tipo de sociedad y cuándo la necesitas."));
        return;
      }

      alert(SUCCESS_MSG);
      formConstituir.reset();
      formConstituir.querySelectorAll(".gst-option-selected").forEach(function (b) {
        b.classList.remove("gst-option-selected");
      });
      closeModal();
    });
  }

  /* Form submit — Alta */
  if (formAlta) {
    formAlta.addEventListener("submit", function (e) {
      e.preventDefault();
      var tipo = formAlta.querySelector("#alta-field-tipo .gst-option-selected");

      if (!tipo) {
        alert(T("Por favor, selecciona el tipo de sociedad."));
        return;
      }

      alert(SUCCESS_MSG);
      formAlta.reset();
      formAlta.querySelectorAll(".gst-option-selected").forEach(function (b) {
        b.classList.remove("gst-option-selected");
      });
      closeAltaModal();
    });
  }

  /* Form submit — Alta Autónomo */
  if (formAltaAuto) {
    formAltaAuto.addEventListener("submit", function (e) {
      e.preventDefault();
      var alta = formAltaAuto.querySelector("#auto-field-alta .gst-option-selected");

      if (!alta) {
        alert(T("Por favor, indica si requieres alta de autónomo."));
        return;
      }

      alert(SUCCESS_MSG);
      formAltaAuto.reset();
      formAltaAuto.querySelectorAll(".gst-option-selected").forEach(function (b) {
        b.classList.remove("gst-option-selected");
      });
      if (autoFechaWrap) autoFechaWrap.style.display = "none";
      closeAltaAutoModal();
    });
  }

  /* Form submit — Área Laboral */
  if (formLaboral) {
    formLaboral.addEventListener("submit", function (e) {
      e.preventDefault();
      alert(SUCCESS_MSG);
      formLaboral.reset();
      closeLaboralModal();
    });
  }

  /* ═══════════════════════════════════════════════
     Modal — Solicitud de constitución de LLC (llc-usa.html)
     ═══════════════════════════════════════════════ */
  var llcModal = document.getElementById("llc-modal");

  if (llcModal) {
    var llcForm = document.getElementById("llc-form");
    var llcFormStep = document.getElementById("llc-modal-form-step");
    var llcSuccess = document.getElementById("llc-modal-success");
    var llcSuccessMeta = document.getElementById("llc-modal-success-meta");
    var llcPlanLabel = document.getElementById("llc-modal-plan");
    var llcError = document.getElementById("llc-form-error");
    var llcCloseBtn = document.getElementById("llc-modal-close");
    var llcDoneBtn = document.getElementById("llc-modal-done");
    var llcStates = document.getElementById("llc-field-estado");

    function llcShowError(msg) {
      if (!llcError) return;
      llcError.textContent = msg;
      llcError.hidden = false;
    }

    function llcClearError() {
      if (!llcError) return;
      llcError.textContent = "";
      llcError.hidden = true;
    }

    function llcResetModal() {
      if (llcForm) llcForm.reset();
      llcModal.querySelectorAll(".gst-option-selected").forEach(function (b) {
        b.classList.remove("gst-option-selected");
      });
      llcClearError();
      if (llcFormStep) llcFormStep.hidden = false;
      if (llcSuccess) llcSuccess.hidden = true;
    }

    function llcOpenModal(planName) {
      if (llcPlanLabel) llcPlanLabel.textContent = planName || "";
      llcResetModal();
      llcModal.classList.add("gst-modal-open");
      llcModal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function llcCloseModal() {
      llcModal.classList.remove("gst-modal-open");
      llcModal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    /* Abrir desde las cards de planes */
    document.querySelectorAll("[data-llc-plan]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        llcOpenModal(btn.getAttribute("data-llc-plan"));
      });
    });

    /* Selector de estado (mismo comportamiento que .gst-modal-options) */
    if (llcStates) {
      llcStates.addEventListener("click", function (e) {
        var opt = e.target.closest(".llc-state-opt");
        if (!opt) return;
        llcStates.querySelectorAll(".llc-state-opt").forEach(function (b) {
          b.classList.remove("gst-option-selected");
        });
        opt.classList.add("gst-option-selected");
        llcClearError();
      });
    }

    if (llcCloseBtn) llcCloseBtn.addEventListener("click", llcCloseModal);
    if (llcDoneBtn) llcDoneBtn.addEventListener("click", llcCloseModal);

    llcModal.addEventListener("click", function (e) {
      if (e.target === llcModal) llcCloseModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && llcModal.classList.contains("gst-modal-open")) {
        llcCloseModal();
      }
    });

    if (llcForm) {
      llcForm.addEventListener("submit", function (e) {
        e.preventDefault();
        llcClearError();

        var nombreLlc = document.getElementById("llc-nombre-llc");
        var plazo = llcForm.querySelector("#llc-field-plazo .gst-option-selected");
        var estado = llcForm.querySelector("#llc-field-estado .gst-option-selected");
        var nombre = document.getElementById("llc-nombre");
        var email = document.getElementById("llc-email");
        var telefono = document.getElementById("llc-telefono");

        if (!nombreLlc.value.trim()) {
          return llcShowError(T("Indica el nombre que quieres para tu LLC."));
        }
        if (!plazo) {
          return llcShowError(T("Selecciona cuándo quieres tenerla constituida."));
        }
        if (!estado) {
          return llcShowError(T("Selecciona el estado donde quieres constituirla."));
        }
        if (!nombre.value.trim()) {
          return llcShowError(T("Indica tu nombre y apellidos."));
        }
        if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          return llcShowError(T("Indica un correo electrónico válido."));
        }
        if (telefono.value.replace(/\D/g, "").length < 9) {
          return llcShowError(T("Indica un teléfono móvil válido."));
        }

        if (llcSuccessMeta) {
          llcSuccessMeta.textContent =
            nombreLlc.value.trim() +
            " · " + estado.getAttribute("data-value") +
            " (tasa estatal $" + estado.getAttribute("data-fee") + ")" +
            " · " + plazo.getAttribute("data-value");
        }

        if (llcFormStep) llcFormStep.hidden = true;
        if (llcSuccess) llcSuccess.hidden = false;
        llcModal.querySelector(".gst-modal").scrollTop = 0;
      });
    }
  }

  /* ═══════════════════════════════════════════════
     Modal — Contratar pack / servicio de gestión (llc-usa.html)
     ═══════════════════════════════════════════════ */
  var packModal = document.getElementById("pack-modal");

  if (packModal) {
    var packForm = document.getElementById("pack-form");
    var packFormStep = document.getElementById("pack-modal-form-step");
    var packSuccess = document.getElementById("pack-modal-success");
    var packSuccessMeta = document.getElementById("pack-modal-success-meta");
    var packServiceLabel = document.getElementById("pack-modal-service");
    var packError = document.getElementById("pack-form-error");
    var packCloseBtn = document.getElementById("pack-modal-close");
    var packDoneBtn = document.getElementById("pack-modal-done");

    function packShowError(msg) {
      if (!packError) return;
      packError.textContent = msg;
      packError.hidden = false;
    }

    function packClearError() {
      if (!packError) return;
      packError.textContent = "";
      packError.hidden = true;
    }

    function packResetModal() {
      if (packForm) packForm.reset();
      packClearError();
      if (packFormStep) packFormStep.hidden = false;
      if (packSuccess) packSuccess.hidden = true;
    }

    function packOpenModal(serviceName) {
      if (packServiceLabel) packServiceLabel.textContent = serviceName || "";
      packResetModal();
      packModal.classList.add("gst-modal-open");
      packModal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function packCloseModal() {
      packModal.classList.remove("gst-modal-open");
      packModal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    /* Abrir desde las cards de packs y servicios individuales */
    document.querySelectorAll("[data-llc-pack]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        packOpenModal(btn.getAttribute("data-llc-pack"));
      });
    });

    if (packCloseBtn) packCloseBtn.addEventListener("click", packCloseModal);
    if (packDoneBtn) packDoneBtn.addEventListener("click", packCloseModal);

    packModal.addEventListener("click", function (e) {
      if (e.target === packModal) packCloseModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && packModal.classList.contains("gst-modal-open")) {
        packCloseModal();
      }
    });

    if (packForm) {
      packForm.addEventListener("submit", function (e) {
        e.preventDefault();
        packClearError();

        var nombreLlc = document.getElementById("pack-nombre-llc");
        var ein = document.getElementById("pack-ein");
        var nombre = document.getElementById("pack-nombre");
        var email = document.getElementById("pack-email");
        var telefono = document.getElementById("pack-telefono");

        if (!nombreLlc.value.trim()) {
          return packShowError(T("Indica el nombre de tu LLC."));
        }
        if (ein.value.replace(/\D/g, "").length !== 9) {
          return packShowError(T("Indica un EIN válido (formato 12-3456789)."));
        }
        if (!nombre.value.trim()) {
          return packShowError(T("Indica tu nombre y apellidos."));
        }
        if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          return packShowError(T("Indica un correo electrónico válido."));
        }
        if (telefono.value.replace(/\D/g, "").length < 9) {
          return packShowError(T("Indica un teléfono móvil válido."));
        }

        if (packSuccessMeta) {
          packSuccessMeta.textContent =
            nombreLlc.value.trim() +
            " · EIN " + ein.value.trim();
        }

        if (packFormStep) packFormStep.hidden = true;
        if (packSuccess) packSuccess.hidden = false;
        packModal.querySelector(".gst-modal").scrollTop = 0;
      });
    }
  }
});

/* ============================================================
   ESCALAS FISCALES COMPARTIDAS
   ------------------------------------------------------------
   Las usan la calculadora de deducciones (Cultura e I+D) y la
   de Ley Beckham. Escalas AEAT del ejercicio 2025 (últimas
   publicadas). Revisar cuando se publiquen las de 2026.
   Cada tramo: [base desde, tipo marginal %].
   ============================================================ */
var NOMOTAX_FISCAL = (function () {

  var ESCALA_ESTATAL = [
    [0, 9.5], [12450, 12], [20200, 15], [35200, 18.5], [60000, 22.5], [300000, 24.5]
  ];

  var ESCALAS_AUTONOMICAS = {
    andalucia: [[0, 9.5], [13000, 12], [21100, 15], [35200, 18.5], [60000, 22.5]],
    aragon: [[0, 9.5], [13072.5, 12], [21210, 15], [36960, 18.5], [52500, 20.5], [60000, 23], [80000, 24], [90000, 25], [130000, 25.5]],
    asturias: [[0, 9], [12450, 12], [17707.2, 14], [33007.2, 19.2], [53407.2, 21.5], [70000, 22.5], [90000, 25], [175000, 26]],
    baleares: [[0, 9], [10000, 11.25], [18000, 14.25], [30000, 17.5], [48000, 19], [70000, 21.75], [90000, 22.75], [120000, 23.75], [175000, 24.75]],
    canarias: [[0, 9], [13748, 11.5], [19422, 14], [35924, 18.5], [57566, 23.5], [93268, 25], [123745, 26]],
    cantabria: [[0, 8.5], [13000, 11], [21000, 14.5], [35200, 18], [60000, 22.5], [90000, 24.5]],
    castillalamancha: [[0, 9.5], [12450, 12], [20200, 15], [35200, 18.5], [60000, 22.5]],
    castillaleon: [[0, 9], [12450, 12], [20200, 14], [35200, 18.5], [53407.2, 21.5]],
    cataluna: [[0, 9.5], [12500, 12.5], [22000, 16], [33000, 19], [53000, 21.5], [90000, 23.5], [120000, 24.5], [175000, 25.5]],
    extremadura: [[0, 8], [12450, 10], [20200, 16], [24200, 17.5], [35200, 21], [60000, 23.5], [80200, 24], [99200, 24.5], [120200, 25]],
    galicia: [[0, 9], [12985.35, 11.65], [21068.6, 14.9], [35200, 18.4], [60000, 22.5]],
    madrid: [[0, 8.5], [13362.22, 10.7], [19004.63, 12.8], [35425.68, 17.4], [57320.4, 20.5]],
    murcia: [[0, 9.5], [12450, 11.2], [20200, 13.3], [34000, 17.9], [60000, 22.5]],
    rioja: [[0, 8], [12450, 10.6], [20200, 13.6], [35200, 17.8], [40000, 18.3], [50000, 19], [60000, 24.5], [120000, 27]],
    valenciana: [[0, 9], [12000, 12], [22000, 15], [32000, 17.5], [42000, 20], [52000, 22.5], [62000, 25], [72000, 26.5], [100000, 27.5], [150000, 28.5], [200000, 29.5]],

    // Escala autonómica supletoria del art. 65 LIRPF: remite a la estatal del
    // art. 63.1. Es la referencia neutra cuando no se concreta la comunidad.
    supletoria: ESCALA_ESTATAL
  };

  // Base liquidable del ahorro (estatal + autonómica ya sumadas).
  // El tramo superior subió del 28 % al 30 % por la Ley 7/2024, con
  // efectos desde el 01/01/2025, y alcanza también a los impatriados.
  var ESCALA_AHORRO = [
    [0, 19], [6000, 21], [50000, 23], [200000, 27], [300000, 30]
  ];

  var MINIMO_PERSONAL = 5550;

  function aplicarEscala(base, escala) {
    var cuota = 0;
    for (var i = 0; i < escala.length; i++) {
      var desde = escala[i][0];
      if (base <= desde) break;
      var hasta = i + 1 < escala.length ? escala[i + 1][0] : Infinity;
      var tramo = Math.min(base, hasta) - desde;
      cuota += tramo * escala[i][1] / 100;
    }
    return cuota;
  }

  function cuotaIrpf(base, ccaa) {
    var auton = ESCALAS_AUTONOMICAS[ccaa] || ESCALAS_AUTONOMICAS.madrid;
    var bruta = aplicarEscala(base, ESCALA_ESTATAL) + aplicarEscala(base, auton);
    var minimo = aplicarEscala(Math.min(base, MINIMO_PERSONAL), ESCALA_ESTATAL) +
      aplicarEscala(Math.min(base, MINIMO_PERSONAL), auton);
    return Math.max(0, bruta - minimo);
  }

  function cuotaAhorro(base) {
    return aplicarEscala(Math.max(0, base), ESCALA_AHORRO);
  }

  return {
    ESCALA_ESTATAL: ESCALA_ESTATAL,
    ESCALAS_AUTONOMICAS: ESCALAS_AUTONOMICAS,
    ESCALA_AHORRO: ESCALA_AHORRO,
    MINIMO_PERSONAL: MINIMO_PERSONAL,
    aplicarEscala: aplicarEscala,
    cuotaIrpf: cuotaIrpf,
    cuotaAhorro: cuotaAhorro
  };

})();

/* ============================================================
   CALCULADORA DE DEDUCCIONES — CULTURA E I+D
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  var calc = document.getElementById("ded-impuesto");
  if (!calc) return;

  var cuotaIrpf = NOMOTAX_FISCAL.cuotaIrpf;

  var TOPE_DEDUCCION = 0.5;   // art. 39.1 LIS — límite conjunto elevado
  var RATIO_120 = 1.2;        // art. 39.7 / 39.3 LIS — tope 1,20 × aportación

  function cuotaIs(base, entidad) {
    if (base <= 0) return 0;
    if (entidad === "general") return base * 0.25;
    if (entidad === "erd") return base * 0.23;
    var primerTramo = Math.min(base, 50000);
    return primerTramo * 0.19 + Math.max(0, base - 50000) * 0.21;
  }

  var eur = new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true
  });

  var proyectoToggle = document.getElementById("ded-proyecto");
  var fieldCcaa = document.getElementById("ded-field-ccaa");
  var fieldEntidad = document.getElementById("ded-field-entidad");
  var selectCcaa = document.getElementById("ded-ccaa");
  var selectEntidad = document.getElementById("ded-entidad");
  var inputBeneficio = document.getElementById("ded-beneficio");
  var rangeBeneficio = document.getElementById("ded-beneficio-range");

  var outCuotaLabel = document.getElementById("ded-out-cuota-label");
  var outCuota = document.getElementById("ded-out-cuota");
  var outAportacion = document.getElementById("ded-out-aportacion");
  var outDeduccion = document.getElementById("ded-out-deduccion");
  var outAhorro = document.getElementById("ded-out-ahorro");
  var outFinal = document.getElementById("ded-out-final");
  var outReq = document.getElementById("ded-out-req");

  var REQUISITOS = {
    cultura: T("Requiere certificado del ICAA (o del órgano competente de tu comunidad) o del INAEM para artes escénicas y musicales, y contrato de financiación comunicado a la AEAT antes de finalizar el periodo impositivo."),
    idi: T("Requiere informe motivado vinculante del Ministerio de Ciencia, Innovación y Universidades sobre el proyecto, y contrato de financiación comunicado a la AEAT antes de finalizar el periodo impositivo.")
  };

  var estado = {
    impuesto: "irpf",
    proyecto: "cultura",
    beneficio: 100000
  };

  var ultimo = null;

  function calcular() {
    var base = estado.beneficio;
    var cuota = estado.impuesto === "irpf"
      ? cuotaIrpf(base, selectCcaa ? selectCcaa.value : "madrid")
      : cuotaIs(base, selectEntidad ? selectEntidad.value : "micro");

    var deduccion = cuota * TOPE_DEDUCCION;
    var aportacion = deduccion / RATIO_120;

    return {
      cuota: cuota,
      deduccion: deduccion,
      aportacion: aportacion,
      ahorro: deduccion - aportacion,
      final: cuota - deduccion
    };
  }

  function render() {
    var r = calcular();
    ultimo = r;

    if (outCuotaLabel) {
      outCuotaLabel.textContent = estado.impuesto === "irpf"
        ? T("Lo que pagarías de IRPF")
        : T("Lo que pagarías de Impuesto de Sociedades");
    }
    if (outCuota) outCuota.textContent = eur.format(r.cuota);
    if (outAportacion) outAportacion.textContent = eur.format(r.aportacion);
    if (outDeduccion) outDeduccion.textContent = eur.format(r.deduccion);
    if (outAhorro) outAhorro.textContent = eur.format(r.ahorro);
    if (outFinal) outFinal.textContent = eur.format(r.final);
    if (outReq) outReq.textContent = REQUISITOS[estado.proyecto];
  }

  function activarToggle(grupo, valor) {
    var botones = grupo.querySelectorAll(".ded-toggle-btn");
    for (var i = 0; i < botones.length; i++) {
      var activo = botones[i].getAttribute("data-value") === valor;
      botones[i].classList.toggle("is-active", activo);
      botones[i].setAttribute("aria-selected", activo ? "true" : "false");
    }
  }

  function setImpuesto(valor) {
    estado.impuesto = valor;
    activarToggle(calc, valor);
    if (fieldCcaa) fieldCcaa.hidden = valor !== "irpf";
    if (fieldEntidad) fieldEntidad.hidden = valor !== "is";
    render();
  }

  calc.addEventListener("click", function (e) {
    var btn = e.target.closest(".ded-toggle-btn");
    if (btn) setImpuesto(btn.getAttribute("data-value"));
  });

  if (proyectoToggle) {
    proyectoToggle.addEventListener("click", function (e) {
      var btn = e.target.closest(".ded-toggle-btn");
      if (!btn) return;
      estado.proyecto = btn.getAttribute("data-value");
      activarToggle(proyectoToggle, estado.proyecto);
      render();
    });
  }

  if (selectCcaa) selectCcaa.addEventListener("change", render);
  if (selectEntidad) selectEntidad.addEventListener("change", render);

  function setBeneficio(valor, origen) {
    var min = Number(inputBeneficio.min) || 0;
    var max = Number(inputBeneficio.max) || Infinity;
    var limpio = Math.min(max, Math.max(min, Math.round(valor || min)));
    estado.beneficio = limpio;
    if (origen !== "input") inputBeneficio.value = limpio;
    if (origen !== "range" && rangeBeneficio) rangeBeneficio.value = limpio;
    render();
  }

  if (rangeBeneficio) {
    rangeBeneficio.addEventListener("input", function () {
      setBeneficio(Number(rangeBeneficio.value), "range");
    });
  }
  if (inputBeneficio) {
    inputBeneficio.addEventListener("input", function () {
      var v = Number(inputBeneficio.value);
      if (!inputBeneficio.value || isNaN(v)) return;
      setBeneficio(v, "input");
    });
    inputBeneficio.addEventListener("blur", function () {
      setBeneficio(Number(inputBeneficio.value), "blur");
    });
  }

  // Píldoras del hero: además de saltar a su timeline, preseleccionan la pestaña
  var pills = document.querySelectorAll("[data-ded-jump]");
  for (var p = 0; p < pills.length; p++) {
    pills[p].addEventListener("click", function () {
      setImpuesto(this.getAttribute("data-ded-jump"));
    });
  }

  render();

  /* ── Modal de consulta ── */
  var modal = document.getElementById("ded-modal");
  if (!modal) return;

  var panel = modal.querySelector(".gst-modal");
  var formStep = document.getElementById("ded-modal-form-step");
  var success = document.getElementById("ded-modal-success");
  var successMeta = document.getElementById("ded-modal-success-meta");
  var form = document.getElementById("ded-form");
  var errorBox = document.getElementById("ded-form-error");
  var opciones = document.getElementById("ded-field-interes");
  var interes = "";

  function abrirModal() {
    if (ultimo) {
      var perfil = document.getElementById("ded-modal-perfil");
      var benef = document.getElementById("ded-modal-beneficio");
      var aport = document.getElementById("ded-modal-aportacion");
      var ahorro = document.getElementById("ded-modal-ahorro");
      if (perfil) {
        perfil.textContent = estado.impuesto === "irpf"
          ? T("Autónomo · IRPF")
          : T("Empresa · Impuesto de Sociedades");
      }
      if (benef) benef.textContent = eur.format(estado.beneficio);
      if (aport) aport.textContent = eur.format(ultimo.aportacion);
      if (ahorro) ahorro.textContent = eur.format(ultimo.ahorro);
    }
    if (opciones) {
      var preseleccion = estado.proyecto === "cultura" ? "Cultura" : "I+D";
      var botones = opciones.querySelectorAll(".gst-modal-option");
      for (var i = 0; i < botones.length; i++) {
        var activo = botones[i].getAttribute("data-value") === preseleccion;
        botones[i].classList.toggle("gst-option-selected", activo);
        if (activo) interes = preseleccion;
      }
    }
    modal.classList.add("gst-modal-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (panel) panel.scrollTop = 0;
  }

  function cerrarModal() {
    modal.classList.remove("gst-modal-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  var abrir = document.getElementById("ded-open-modal");
  if (abrir) abrir.addEventListener("click", abrirModal);

  var cerrar = document.getElementById("ded-modal-close");
  if (cerrar) cerrar.addEventListener("click", cerrarModal);

  var hecho = document.getElementById("ded-modal-done");
  if (hecho) hecho.addEventListener("click", cerrarModal);

  modal.addEventListener("click", function (e) {
    if (e.target === modal) cerrarModal();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("gst-modal-open")) cerrarModal();
  });

  if (opciones) {
    opciones.addEventListener("click", function (e) {
      var btn = e.target.closest(".gst-modal-option");
      if (!btn) return;
      var botones = opciones.querySelectorAll(".gst-modal-option");
      for (var i = 0; i < botones.length; i++) {
        botones[i].classList.remove("gst-option-selected");
      }
      btn.classList.add("gst-option-selected");
      interes = btn.getAttribute("data-value");
    });
  }

  function mostrarError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (errorBox) errorBox.hidden = true;

      var nombre = document.getElementById("ded-nombre");
      var email = document.getElementById("ded-email");
      var telefono = document.getElementById("ded-telefono");

      if (!interes) return mostrarError(T("Selecciona qué tipo de proyecto te interesa."));
      if (!nombre.value.trim()) return mostrarError(T("Indica tu nombre y apellidos."));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        return mostrarError(T("Indica un correo electrónico válido."));
      }
      if (telefono.value.replace(/\D/g, "").length < 9) {
        return mostrarError(T("Indica un teléfono móvil válido."));
      }

      if (successMeta && ultimo) {
        successMeta.textContent = T(interes) + T(" · aportación estimada ") +
          eur.format(ultimo.aportacion) + T(" · ahorro neto ") + eur.format(ultimo.ahorro);
      }

      if (formStep) formStep.hidden = true;
      if (success) success.hidden = false;
      if (panel) panel.scrollTop = 0;
    });
  }
});


/* ============================================================
   CALCULADORA LEY BECKHAM — IMPATRIADOS vs RÉGIMEN GENERAL
   ------------------------------------------------------------
   Compara la cuota del art. 93 LIRPF (24 % hasta 600.000 € y
   47 % sobre el exceso, solo rentas españolas salvo el trabajo)
   con la del régimen general. Usa las escalas de NOMOTAX_FISCAL.
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  var raiz = document.getElementById("bk-calc");
  if (!raiz) return;

  var TIPO_IMPATRIADOS = 0.24;
  var LIMITE_24 = 600000;       // art. 93.2.e) LIRPF
  var TIPO_EXCESO = 0.47;

  // Régimen general: gastos deducibles del rendimiento del trabajo
  var BASE_MAX_COTIZACION = 58914;   // 4.909,50 € × 12
  var TIPO_COTIZACION = 0.0648;      // contingencias comunes + desempleo + FP
  var OTROS_GASTOS = 2000;           // art. 19.2.f) LIRPF

  var eur = new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0
  });

  var campos = {
    salario: document.getElementById("bk-salario"),
    divEs: document.getElementById("bk-div-es"),
    divExt: document.getElementById("bk-div-ext"),
    ganEs: document.getElementById("bk-gan-es"),
    ganExt: document.getElementById("bk-gan-ext")
  };

  var out = {
    bkSalario: document.getElementById("bk-bk-salario"),
    bkAhorro: document.getElementById("bk-bk-ahorro"),
    bkExt: document.getElementById("bk-bk-ext"),
    bkTotal: document.getElementById("bk-bk-total"),
    gnGeneral: document.getElementById("bk-gn-general"),
    gnAhorro: document.getElementById("bk-gn-ahorro"),
    gnExt: document.getElementById("bk-gn-ext"),
    gnTotal: document.getElementById("bk-gn-total"),
    colBeckham: document.getElementById("bk-col-beckham"),
    colGeneral: document.getElementById("bk-col-general"),
    veredicto: document.getElementById("bk-verdict"),
    veredictoLabel: document.getElementById("bk-verdict-label"),
    veredictoValor: document.getElementById("bk-verdict-value"),
    veredictoNota: document.getElementById("bk-verdict-note"),
    tagSalario: document.getElementById("bk-tag-salario")
  };

  function leer(input) {
    var valor = parseFloat(input.value);
    return isNaN(valor) || valor < 0 ? 0 : valor;
  }

  function calcular() {
    var salario = leer(campos.salario);
    var divEs = leer(campos.divEs);
    var divExt = leer(campos.divExt);
    var ganEs = leer(campos.ganEs);
    var ganExt = leer(campos.ganExt);

    // ── Régimen de impatriados ──
    var cuotaSalarioBk = Math.min(salario, LIMITE_24) * TIPO_IMPATRIADOS +
      Math.max(0, salario - LIMITE_24) * TIPO_EXCESO;
    var ahorroEs = divEs + ganEs;
    var cuotaAhorroBk = NOMOTAX_FISCAL.cuotaAhorro(ahorroEs);
    var totalBk = cuotaSalarioBk + cuotaAhorroBk;

    // ── Régimen general ──
    var gastos = Math.min(salario, BASE_MAX_COTIZACION) * TIPO_COTIZACION + OTROS_GASTOS;
    var baseGeneral = Math.max(0, salario - gastos);
    var baseAhorro = divEs + divExt + ganEs + ganExt;
    var cuotaGeneral = NOMOTAX_FISCAL.cuotaIrpf(baseGeneral, "supletoria");
    var cuotaAhorroGn = NOMOTAX_FISCAL.cuotaAhorro(baseAhorro);
    var totalGn = cuotaGeneral + cuotaAhorroGn;

    return {
      salario: salario,
      excede: salario > LIMITE_24,
      cuotaSalarioBk: cuotaSalarioBk,
      cuotaAhorroBk: cuotaAhorroBk,
      totalBk: totalBk,
      cuotaGeneral: cuotaGeneral,
      cuotaAhorroGn: cuotaAhorroGn,
      rentaExtranjera: divExt + ganExt,
      totalGn: totalGn,
      diferencia: totalGn - totalBk
    };
  }

  function render() {
    var r = calcular();

    out.tagSalario.textContent = r.excede ? T("Tributa al 24% + 47%") : T("Tributa al 24%");

    out.bkSalario.textContent = eur.format(r.cuotaSalarioBk);
    out.bkAhorro.textContent = eur.format(r.cuotaAhorroBk);
    out.bkExt.textContent = r.rentaExtranjera > 0 ? T("Exentas") : eur.format(0);

    out.gnGeneral.textContent = eur.format(r.cuotaGeneral);
    out.gnAhorro.textContent = eur.format(r.cuotaAhorroGn);
    out.gnExt.textContent = r.rentaExtranjera > 0 ? T("Incluidas arriba") : eur.format(0);
    out.gnTotal.textContent = eur.format(r.totalGn);
    out.bkTotal.textContent = eur.format(r.totalBk);

    var ganaBeckham = r.diferencia > 0;
    var sinDatos = r.totalBk === 0 && r.totalGn === 0;
    out.colBeckham.classList.toggle("bk-out-col-win", ganaBeckham && !sinDatos);
    out.colGeneral.classList.toggle("bk-out-col-win", !ganaBeckham && !sinDatos);
    out.veredicto.classList.toggle("bk-verdict-bad", !ganaBeckham);

    if (sinDatos) {
      out.veredictoLabel.textContent = T("Empieza por tu salario");
      out.veredictoValor.textContent = T("Pon tus cifras");
      out.veredictoNota.textContent = T("Con tus ingresos reales verás la diferencia entre los dos regímenes.");
    } else if (ganaBeckham) {
      out.veredictoLabel.textContent = T("Te ahorras cada año");
      out.veredictoValor.textContent = eur.format(r.diferencia);
      out.veredictoNota.textContent = eur.format(r.diferencia * 6) +
        T(" en los seis años que dura el régimen.");
    } else {
      out.veredictoLabel.textContent = T("Con estos números");
      out.veredictoValor.textContent = T("No te compensa");
      out.veredictoNota.textContent = T("El régimen general sale ") +
        eur.format(Math.abs(r.diferencia)) + T(" más barato al año. Conviene revisarlo con tu caso completo.");
    }
  }

  Object.keys(campos).forEach(function (clave) {
    campos[clave].addEventListener("input", render);
    campos[clave].addEventListener("change", render);
  });

  render();
});

/* ============================================================
   CONSULTORÍA — modal de contratación
   (consultoria.html y cambio-residencia-fiscal.html)
   ------------------------------------------------------------
   Un único modal con un bloque de campos por servicio
   (.cns-case[data-cns-case]). Cada botón [data-cns] abre el
   bloque de su servicio. Título, precio, subtítulo, texto del
   botón y mensaje final se leen de los data-* del bloque.
   Campos condicionales: [data-cns-show="grupo:Valor1|Valor2"].
   Preselección desde el botón: [data-cns-preset="grupo:Valor"].
   Resumen final con opciones elegidas: [data-meta="grupo,#idFecha,grupo"]
   (un "#" delante indica un campo de fecha, que se muestra en largo).
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  var modal = document.getElementById("cns-modal");
  if (!modal) return;

  var panel = modal.querySelector(".gst-modal");
  var form = document.getElementById("cns-form");
  var formStep = document.getElementById("cns-modal-form-step");
  var success = document.getElementById("cns-modal-success");
  var errorBox = document.getElementById("cns-form-error");
  var casos = modal.querySelectorAll(".cns-case");
  var ui = {
    titulo: document.getElementById("cns-modal-title"),
    precio: document.getElementById("cns-modal-price"),
    subtitulo: document.getElementById("cns-modal-subtitle"),
    enviar: document.getElementById("cns-modal-submit"),
    exitoTexto: document.getElementById("cns-modal-success-text"),
    exitoMeta: document.getElementById("cns-modal-success-meta")
  };
  var actual = null;

  var EXITO_POR_DEFECTO = T("Un asesor especialista revisará tu caso y te contactará en las próximas 24 horas con el precio cerrado y los siguientes pasos.");

  var CCAA = [
    "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias", "Cantabria",
    "Castilla-La Mancha", "Castilla y León", "Cataluña", "Comunidad Valenciana",
    "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia", "Navarra",
    "País Vasco", "Ceuta", "Melilla"
  ];

  /* Rellenar los selects de comunidad autónoma */
  modal.querySelectorAll("[data-cns-ccaa]").forEach(function (sel) {
    var html = '<option value="">' + T("Selecciona") + '</option>';
    CCAA.forEach(function (c) { html += "<option>" + c + "</option>"; });
    sel.innerHTML = html;
  });

  /* Fechas en formato AAAA-MM-DD de la hora local (toISOString usa UTC) */
  function isoLocal(d) {
    var m = d.getMonth() + 1;
    var dia = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (dia < 10 ? "0" : "") + dia;
  }

  function fijarLimitesFecha() {
    var hoy = new Date();
    var manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
    modal.querySelectorAll('input[type="date"]').forEach(function (inp) {
      if (inp.getAttribute("data-min") === "manana") inp.min = isoLocal(manana);
      if (inp.getAttribute("data-max") === "hoy") inp.max = isoLocal(hoy);
    });
  }

  function valorGrupo(caso, nombre) {
    var sel = caso.querySelector('[data-name="' + nombre + '"] .gst-option-selected');
    return sel ? sel.getAttribute("data-value") : "";
  }

  function actualizarCondicionales() {
    if (!actual) return;
    actual.querySelectorAll("[data-cns-show]").forEach(function (el) {
      var partes = el.getAttribute("data-cns-show").split(":");
      var admitidos = partes[1].split("|");
      el.hidden = admitidos.indexOf(valorGrupo(actual, partes[0])) === -1;
    });
  }

  function visible(el) {
    return !el.closest("[hidden]");
  }

  function mostrarError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function limpiarError() {
    if (!errorBox) return;
    errorBox.textContent = "";
    errorBox.hidden = true;
  }

  function resetear() {
    if (form) form.reset();
    modal.querySelectorAll(".gst-option-selected").forEach(function (b) {
      b.classList.remove("gst-option-selected");
    });
    modal.querySelectorAll(".cns-multi .gst-modal-option").forEach(function (b) {
      b.setAttribute("aria-pressed", "false");
    });
    limpiarError();
    if (formStep) formStep.hidden = false;
    if (success) success.hidden = true;
  }

  function abrir(clave, preset) {
    var caso = modal.querySelector('.cns-case[data-cns-case="' + clave + '"]');
    if (!caso) return;

    resetear();
    casos.forEach(function (c) { c.hidden = c !== caso; });
    actual = caso;

    ui.titulo.textContent = caso.getAttribute("data-title") || "";
    ui.precio.textContent = caso.getAttribute("data-price") || "";
    ui.precio.hidden = !caso.getAttribute("data-price");
    ui.subtitulo.textContent = caso.getAttribute("data-subtitle") || "";
    ui.enviar.textContent = caso.getAttribute("data-submit") || "Solicitar";

    if (preset) {
      var partes = preset.split(":");
      var opcion = caso.querySelector('[data-name="' + partes[0] + '"] [data-value="' + partes[1] + '"]');
      if (opcion) opcion.classList.add("gst-option-selected");
    }

    fijarLimitesFecha();
    actualizarCondicionales();

    modal.classList.add("gst-modal-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (panel) panel.scrollTop = 0;
  }

  function cerrar() {
    modal.classList.remove("gst-modal-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.querySelectorAll("[data-cns]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      abrir(btn.getAttribute("data-cns"), btn.getAttribute("data-cns-preset"));
    });
  });

  var btnCerrar = document.getElementById("cns-modal-close");
  if (btnCerrar) btnCerrar.addEventListener("click", cerrar);

  var btnHecho = document.getElementById("cns-modal-done");
  if (btnHecho) btnHecho.addEventListener("click", cerrar);

  /* Selección múltiple: cada botón se marca y desmarca por separado */
  modal.querySelectorAll(".cns-multi").forEach(function (grupo) {
    grupo.addEventListener("click", function (e) {
      var btn = e.target.closest(".gst-modal-option");
      if (!btn) return;
      var activo = btn.classList.toggle("gst-option-selected");
      btn.setAttribute("aria-pressed", activo ? "true" : "false");
    });
  });

  /* La selección simple la gestiona el manejador común de .gst-modal-options;
     aquí, que ya está aplicada, solo se recalculan los campos condicionales. */
  modal.addEventListener("click", function (e) {
    if (e.target === modal) return cerrar();
    if (e.target.closest(".gst-modal-option")) {
      actualizarCondicionales();
      limpiarError();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.classList.contains("gst-modal-open")) cerrar();
  });

  /* Recorre grupos de botones y campos en el orden del formulario,
     para que el error señale siempre el primero pendiente. */
  function validarCaso(caso) {
    var campos = caso.querySelectorAll("[data-required], input[required], select[required], textarea[required]");
    for (var i = 0; i < campos.length; i++) {
      var campo = campos[i];
      if (!visible(campo)) continue;
      var error = campo.getAttribute("data-error") || T("Completa todos los campos.");

      if (campo.hasAttribute("data-required")) {
        if (!campo.querySelector(".gst-option-selected")) return error;
        continue;
      }
      if (!campo.value.trim()) return error;
      if (campo.type === "date") {
        if (campo.min && campo.value < campo.min) return T("Elige una fecha a partir de mañana.");
        if (campo.max && campo.value > campo.max) return T("La fecha de notificación no puede ser posterior a hoy.");
        if (campo.hasAttribute("data-laborable")) {
          var dia = new Date(campo.value + "T12:00:00").getDay();
          if (dia === 0 || dia === 6) return T("Elige un día de lunes a viernes.");
        }
      }
    }
    return "";
  }

  function fechaLarga(valor) {
    var d = new Date(valor + "T12:00:00");
    return d.toLocaleDateString(NT_LOCALE, { weekday: "long", day: "numeric", month: "long" });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      limpiarError();
      if (!actual) return;

      var fallo = validarCaso(actual);
      if (fallo) return mostrarError(fallo);

      var nombre = document.getElementById("cns-nombre");
      var email = document.getElementById("cns-email");
      var telefono = document.getElementById("cns-telefono");

      if (!nombre.value.trim()) return mostrarError(T("Indica tu nombre y apellidos."));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        return mostrarError(T("Indica un correo electrónico válido."));
      }
      if (telefono.value.replace(/\D/g, "").length < 9) {
        return mostrarError(T("Indica un teléfono móvil válido."));
      }

      /* Resumen bajo la confirmación: servicio y precio, las opciones de
         data-meta si las hay y, en la sesión, cuándo */
      var meta = [actual.getAttribute("data-title")];
      var gruposMeta = actual.getAttribute("data-meta");
      if (actual.getAttribute("data-cns-case") === "sesion") {
        var fecha = document.getElementById("cns-ses-fecha");
        meta.push(valorGrupo(actual, "duracion"));
        meta.push(fechaLarga(fecha.value) + ", " + valorGrupo(actual, "franja").toLowerCase());
      } else if (gruposMeta) {
        gruposMeta.split(",").forEach(function (nombre) {
          var valor;
          if (nombre.charAt(0) === "#") {
            var campoFecha = document.getElementById(nombre.slice(1));
            valor = campoFecha && campoFecha.value ? fechaLarga(campoFecha.value) : "";
          } else {
            valor = valorGrupo(actual, nombre);
          }
          if (valor) meta.push(valor);
        });
      } else if (actual.getAttribute("data-price")) {
        meta.push(actual.getAttribute("data-price"));
      }

      if (ui.exitoTexto) ui.exitoTexto.textContent = actual.getAttribute("data-success") || EXITO_POR_DEFECTO;
      if (ui.exitoMeta) ui.exitoMeta.textContent = meta.join(" · ");

      if (formStep) formStep.hidden = true;
      if (success) success.hidden = false;
      if (panel) panel.scrollTop = 0;
    });
  }
});

/* ============================================================
   APARICIÓN SUAVE AL HACER SCROLL
   ------------------------------------------------------------
   Los bloques de cada sección aparecen con un leve fundido al
   entrar en pantalla; las tarjetas de una rejilla, en cascada
   por columnas. Solo se aplica a lo que empieza fuera de la
   vista (así nada parpadea al cargar) y respeta la preferencia
   "reducir movimiento" del dispositivo.
   ============================================================ */
document.addEventListener("DOMContentLoaded", function () {
  if (!("IntersectionObserver" in window)) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var pliegue = window.innerHeight;
  var elementos = [];

  function esContenedor(el) {
    return typeof el.className === "string" &&
      /(^|\s)[\w-]*(inner|container)(\s|$)/.test(el.className) && el.children.length > 0;
  }

  function decorativo(el) {
    var cs = getComputedStyle(el);
    return cs.position === "absolute" || cs.position === "fixed" ||
      el.getAttribute("aria-hidden") === "true" || el.offsetHeight === 0;
  }

  function esRejilla(el) {
    var cs = getComputedStyle(el);
    return el.children.length >= 2 &&
      (cs.display === "grid" || (cs.display === "flex" && cs.flexWrap === "wrap"));
  }

  function marcar(el, retraso) {
    if (decorativo(el)) return;
    if (el.getBoundingClientRect().top < pliegue) return;
    el.classList.add("nt-reveal");
    el._ntDelay = retraso || 0;
    if (retraso) el.style.setProperty("--nt-delay", retraso + "ms");
    elementos.push(el);
  }

  function repartir(bloque, orden) {
    if (esRejilla(bloque)) {
      // Cascada por columnas: la posición dentro de cada fila marca el retraso
      var cols = getComputedStyle(bloque).gridTemplateColumns;
      var n = cols && cols !== "none" ? cols.split(" ").length : 4;
      Array.prototype.forEach.call(bloque.children, function (hijo, j) {
        marcar(hijo, (j % Math.max(n, 1)) * 70);
      });
    } else if (bloque.offsetHeight > pliegue * 1.2 && bloque.children.length > 1) {
      // Bloques muy altos (líneas de tiempo, listas largas): elemento a elemento
      Array.prototype.forEach.call(bloque.children, function (hijo) { marcar(hijo, 0); });
    } else {
      marcar(bloque, Math.min(orden, 3) * 60);
    }
  }

  document.querySelectorAll("body > section").forEach(function (seccion, i) {
    if (i === 0) return; // la cabecera de la página tiene su propia entrada
    var orden = 0;
    Array.prototype.forEach.call(seccion.children, function (hijo) {
      if (esContenedor(hijo)) {
        Array.prototype.forEach.call(hijo.children, function (b) { repartir(b, orden++); });
      } else {
        repartir(hijo, orden++);
      }
    });
  });

  var observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (!entrada.isIntersecting) return;
      var el = entrada.target;
      el.classList.add("nt-visible");
      observador.unobserve(el);
      // Al terminar se quitan las clases para no interferir con los efectos al pasar el cursor
      setTimeout(function () {
        el.classList.remove("nt-reveal", "nt-visible");
        el.style.removeProperty("--nt-delay");
      }, 700 + el._ntDelay);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  elementos.forEach(function (el) { observador.observe(el); });
});

/* ============================================================
   AVISO DE COOKIES
   ------------------------------------------------------------
   La web solo usa cookies técnicas (sin analítica, publicidad
   ni servicios de terceros), así que el aviso es informativo:
   se muestra hasta que se acepta y la elección se guarda en el
   navegador. Cualquier elemento con data-cookies-config lo abre.
   ============================================================ */
(function () {
  var CLAVE = "nt-cookies";
  var banner = null;

  function leer() {
    try { return localStorage.getItem(CLAVE); } catch (e) { return null; }
  }

  function guardar(valor) {
    try { localStorage.setItem(CLAVE, valor); } catch (e) {}
  }

  function cerrar() {
    if (banner) banner.hidden = true;
    document.body.classList.remove("nt-cookies-open");
  }

  function mostrar() {
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "nt-cookies";
      banner.setAttribute("role", "dialog");
      banner.setAttribute("aria-live", "polite");
      banner.setAttribute("aria-label", T("Aviso de cookies"));
      banner.innerHTML =
        "<span class=\"nt-cookies-title\">Cookies</span><p></p>" +
        "<div class=\"nt-cookies-actions\"><button type=\"button\" class=\"nt-cookies-accept\"></button></div>";
      var p = banner.querySelector("p");
      p.appendChild(document.createTextNode(T("Solo usamos cookies técnicas, necesarias para que la web funcione. No usamos cookies de análisis ni de publicidad. ")));
      var mas = document.createElement("a");
      mas.href = "cookies";
      mas.textContent = T("Política de cookies");
      p.appendChild(mas);
      var aceptar = banner.querySelector(".nt-cookies-accept");
      aceptar.textContent = T("Aceptar");
      aceptar.addEventListener("click", function () {
        guardar("aceptadas");
        cerrar();
      });
      document.body.appendChild(banner);
    }
    banner.hidden = false;
    document.body.classList.add("nt-cookies-open");
    document.body.style.setProperty("--nt-cookies-h", banner.offsetHeight + "px");
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!leer()) mostrar();
    document.addEventListener("click", function (e) {
      var el = e.target.closest && e.target.closest("[data-cookies-config]");
      if (!el) return;
      e.preventDefault();
      mostrar();
    });
  });
})();

/* ============================================================
   RESERVAS — asesoría gratuita
   ------------------------------------------------------------
   Los botones y enlaces de "Asesoría gratis" abren un pop-up con
   los huecos libres del Google Calendar de NomoTax; en /asesoria
   el mismo reservador aparece dentro de la página
   ([data-reserva-inline]). El motor es un Google Apps Script
   (tools/booking/Code.gs): da los huecos, crea la cita con enlace
   de Google Meet o llamada por WhatsApp y Google envía la
   invitación. Las horas se muestran en la zona horaria del
   visitante. Sin URL del motor, en local se usan huecos de prueba.
   ============================================================ */
var NT_RESERVAS_API = "https://script.google.com/macros/s/AKfycbzV2OYEZS3uIIHw5l8Xh8duZxgbzydO1ZdTsa6qtKR_sRxtNiZjF07rqmnIUyzjSmzAKQ/exec";

(function () {
  var API = NT_RESERVAS_API;
  var PRUEBA = !API && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var WHATSAPP = "https://wa.me/34642757633";
  var ZONA = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "Europe/Madrid";
  var peticion = null;

  /* ---------- Servicio desde el que se reserva ----------
     Se deduce de la página (o de la sección con data-reserva-servicio, p. ej.
     planes de autónomo o de empresa en Gestoría) y del plan de la tarjeta en
     la que se ha pulsado. El visitante puede cambiarlo en el formulario. */
  var SERVICIOS = [
    ["general", "Consulta general", "General enquiry"],
    ["gestoria", "Gestoría", "Accounting"],
    ["gestoria-autonomo", "Gestoría · Autónomo", "Accounting · Self-employed"],
    ["gestoria-sl", "Gestoría · Empresa / SL", "Accounting · Company / SL"],
    ["consultoria", "Consultoría fiscal", "Tax consulting"],
    ["espana", "Fiscalidad en España", "Tax in Spain"],
    ["holding", "Estructuras holding", "Holding structures"],
    ["beckham", "Ley Beckham", "Beckham Law"],
    ["ganancias", "Ganancias patrimoniales", "Capital gains"],
    ["deducciones", "Deducciones I+D y Cultura", "R&D and Culture deductions"],
    ["internacional", "Fiscalidad internacional", "International tax"],
    ["llc", "LLC en EE. UU.", "US LLC"],
    ["estructuras", "Estructuras internacionales", "International structures"],
    ["residencia", "Cambio de residencia fiscal", "Tax residency change"],
    ["nomadas", "Nómadas digitales", "Digital nomads"]
  ];
  var POR_PAGINA = {
    "nacional": "espana",
    "internacional": "internacional",
    "asesoria-fiscal-mercantil-laboral": "gestoria",
    "consultoria": "consultoria",
    "holding": "holding",
    "ley-beckham": "beckham",
    "ganancias-patrimoniales": "ganancias",
    "deducciones-id-cultura": "deducciones",
    "llc-usa": "llc",
    "estructuras-internacionales": "estructuras",
    "cambio-residencia-fiscal": "residencia",
    "nomadas-digitales": "nomadas"
  };

  function servicio(clave) {
    for (var i = 0; i < SERVICIOS.length; i++) if (SERVICIOS[i][0] === clave) return SERVICIOS[i];
    return SERVICIOS[0];
  }

  function nombreServicio(clave, idioma) {
    var s = servicio(clave);
    return (idioma || NT_LANG) === "en" ? s[2] : s[1];
  }

  function contexto(n) {
    var pagina = location.pathname.replace(/^\/(en\/)?/, "").replace(/\.html$/, "").replace(/\/$/, "");
    var clave = POR_PAGINA[pagina] || "general";
    var seccion = n && n.closest && n.closest("[data-reserva-servicio]");
    if (seccion) clave = seccion.getAttribute("data-reserva-servicio");
    // Plan de la tarjeta pulsada (LLC Essential, Compliance Advanced…)
    var detalle = "";
    for (var a = n; a && a !== document.body; a = a.parentElement) {
      var planes = a.querySelectorAll("[data-llc-plan], [data-llc-pack], [data-plan]");
      if (planes.length > 1) break;
      if (planes.length === 1) {
        detalle = planes[0].getAttribute("data-llc-plan") || planes[0].getAttribute("data-llc-pack") || planes[0].getAttribute("data-plan") || "";
        break;
      }
    }
    return { clave: clave, detalle: detalle, pagina: location.pathname };
  }

  /* ---------- Datos ---------- */

  function huecosDePrueba() {
    var huecos = [];
    var ahora = Date.now();
    for (var d = 1; d <= 28; d++) {
      var dia = new Date(ahora + d * 86400000);
      if (dia.getDay() === 0 || dia.getDay() === 6) continue;
      [[9, 14], [16, 19]].forEach(function (t) {
        for (var h = t[0] * 2; h < t[1] * 2; h++) {
          if ((d * 7 + h) % 5 === 0) continue;
          var x = new Date(dia);
          x.setHours(Math.floor(h / 2), (h % 2) * 30, 0, 0);
          huecos.push(x.toISOString());
        }
      });
    }
    return { ok: true, huecos: huecos, duracion: 30 };
  }

  // Copia de la agenda en el navegador (3 min) para no esperar al pasar de una página a otra
  var CLAVE_AGENDA = "nt-agenda";

  function agendaGuardada() {
    try {
      var g = JSON.parse(sessionStorage.getItem(CLAVE_AGENDA) || "null");
      if (g && Date.now() - g.t < 180000 && g.api === API) return g.datos;
    } catch (e) {}
    return null;
  }

  function guardarAgenda(datos) {
    try { sessionStorage.setItem(CLAVE_AGENDA, JSON.stringify({ t: Date.now(), api: API, datos: datos })); } catch (e) {}
  }

  function olvidarAgenda() {
    try { sessionStorage.removeItem(CLAVE_AGENDA); } catch (e) {}
  }

  function cargarHuecos(forzar) {
    if (peticion && !forzar) return peticion;
    var copia = !forzar && !PRUEBA && agendaGuardada();
    if (copia) {
      peticion = Promise.resolve(copia);
      return peticion;
    }
    if (PRUEBA) {
      peticion = new Promise(function (ok) { setTimeout(function () { ok(huecosDePrueba()); }, 500); });
    } else if (!API) {
      peticion = Promise.reject(new Error("sin motor"));
    } else {
      peticion = fetch(API + "?accion=huecos", { credentials: "omit" })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j.ok) throw new Error(j.error || "error"); guardarAgenda(j); return j; });
    }
    peticion.catch(function () { peticion = null; });
    return peticion;
  }

  function enviarReserva(datos) {
    if (PRUEBA) {
      return new Promise(function (ok) { setTimeout(function () { ok({ ok: true, inicio: datos.inicio }); }, 800); });
    }
    return fetch(API, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(datos)
    }).then(function (r) { return r.json(); });
  }

  /* ---------- Formatos (idioma de la página, zona del visitante) ---------- */

  function fmt(opciones) {
    opciones.timeZone = ZONA;
    return new Intl.DateTimeFormat(NT_LOCALE, opciones);
  }
  var fDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
  var fHora = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
  var fLargo = fmt({ weekday: "long", day: "numeric", month: "long" });
  var fMes = fmt({ month: "long" });
  var fMesCorto = fmt({ month: "short" });
  var fSemana = fmt({ weekday: "short" });

  function claveDia(fecha) { return fDia.format(fecha); }

  function largo(fecha) {
    var t = fLargo.format(fecha);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Fecha de calendario (sin hora) a partir de "AAAA-MM-DD"
  function fechaDeClave(clave) {
    var p = clave.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  }

  function el(etiqueta, clase, texto) {
    var n = document.createElement(etiqueta);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* ---------- Reservador ---------- */

  function Reservador(contenedor, alCerrar) {
    var estado = { huecos: [], porDia: {}, dia: null, hora: null, tipo: "meet", ctx: contexto(null) };
    var raiz = el("div", "ntb-body");
    contenedor.appendChild(raiz);

    function cabecera() {
      raiz.appendChild(el("span", "ntb-eyebrow", T("Asesoría gratuita · 30 min")));
      var h = el("h2", "ntb-title", T("Reserva tu asesoría"));
      h.id = "ntb-titulo-" + Math.random().toString(36).slice(2, 7);
      contenedor.setAttribute("aria-labelledby", h.id);
      raiz.appendChild(h);
    }

    function limpiar() { raiz.innerHTML = ""; cabecera(); }

    function arriba() {
      if (contenedor.classList.contains("ntb-inline")) {
        var y = contenedor.getBoundingClientRect().top;
        if (y < 0) contenedor.scrollIntoView({ block: "start" });
      } else {
        contenedor.scrollTop = 0;
      }
    }

    function tema() {
      if (estado.ctx.clave === "general") return;
      var chip = el("p", "ntb-topic");
      chip.appendChild(el("span", null, T("Sobre") + ": "));
      chip.appendChild(el("strong", null, nombreServicio(estado.ctx.clave) + (estado.ctx.detalle ? " · " + estado.ctx.detalle : "")));
      raiz.appendChild(chip);
    }

    function errorAgenda() {
      limpiar();
      var p = el("p", "ntb-sub", T("No hemos podido cargar la agenda en este momento. Escríbenos por WhatsApp y te damos cita al momento."));
      raiz.appendChild(p);
      var a = el("a", "ntb-submit", T("Escribir por WhatsApp"));
      a.href = WHATSAPP; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.style.display = "block"; a.style.textAlign = "center"; a.style.textDecoration = "none";
      raiz.appendChild(a);
    }

    function paso1(forzar) {
      limpiar();
      raiz.appendChild(el("p", "ntb-sub", T("Sin compromiso. Elige el día y la hora que mejor te vengan.")));
      tema();
      var cargando = el("div", "ntb-loading", T("Cargando disponibilidad…"));
      raiz.appendChild(cargando);
      cargarHuecos(forzar).then(function (r) {
        estado.huecos = r.huecos || [];
        estado.porDia = {};
        estado.huecos.forEach(function (iso) {
          var k = claveDia(new Date(iso));
          (estado.porDia[k] = estado.porDia[k] || []).push(iso);
        });
        if (estado.dia && !estado.porDia[estado.dia]) estado.dia = null;
        if (!estado.dia) estado.dia = Object.keys(estado.porDia).sort()[0] || null;
        pintarCalendario();
      }, errorAgenda);
    }

    function pintarCalendario() {
      limpiar();
      raiz.appendChild(el("p", "ntb-sub", T("Sin compromiso. Elige el día y la hora que mejor te vengan.")));
      tema();
      var dias = Object.keys(estado.porDia).sort();
      if (!dias.length) {
        raiz.appendChild(el("p", "ntb-empty", T("Ahora mismo no quedan huecos libres. Escríbenos por WhatsApp y buscamos un momento.")));
        return;
      }
      var grid = el("div", "ntb-grid");
      var izq = el("div"); var der = el("div");
      grid.appendChild(izq); grid.appendChild(der);
      raiz.appendChild(grid);

      // Calendario: semanas de lunes a domingo desde hoy hasta el último día con huecos
      var hoy = fechaDeClave(claveDia(new Date()));
      var inicio = new Date(hoy.getTime() - ((hoy.getUTCDay() + 6) % 7) * 86400000);
      var ultimo = fechaDeClave(dias[dias.length - 1]);
      var mesIni = fMes.format(hoy);
      var mesFin = fMes.format(ultimo);
      var titulo = (mesIni === mesFin ? mesIni : mesIni + " – " + mesFin) + " " + ultimo.getUTCFullYear();
      izq.appendChild(el("div", "ntb-month", titulo.charAt(0).toUpperCase() + titulo.slice(1)));
      var cal = el("div", "ntb-cal");
      for (var i = 0; i < 7; i++) {
        var nombreDia = fSemana.format(new Date(inicio.getTime() + i * 86400000)).replace(".", "");
        cal.appendChild(el("span", "ntb-dow", nombreDia.slice(0, NT_LANG === "en" ? 3 : 2)));
      }
      for (var t = inicio.getTime(); t <= ultimo.getTime() || (t - inicio.getTime()) / 86400000 % 7 !== 0; t += 86400000) {
        var f = new Date(t);
        var k = f.toISOString().slice(0, 10);
        var b = el("button", "ntb-day");
        b.type = "button";
        b.appendChild(document.createTextNode(String(f.getUTCDate())));
        if (f.getUTCDate() === 1) b.appendChild(el("small", null, fMesCorto.format(f).replace(".", "")));
        if (!estado.porDia[k]) {
          b.disabled = true;
        } else {
          b.setAttribute("aria-label", fLargo.format(new Date(estado.porDia[k][0])));
          if (k === estado.dia) b.classList.add("is-selected");
          b.addEventListener("click", (function (clave) {
            return function () { estado.dia = clave; estado.hora = null; pintarCalendario(); };
          })(k));
        }
        cal.appendChild(b);
      }
      izq.appendChild(cal);

      // En móvil, en lugar del calendario: tira deslizable solo con los días que tienen huecos
      var tira = el("div", "ntb-strip");
      dias.forEach(function (k) {
        var f = fechaDeClave(k);
        var chip = el("button", "ntb-chip" + (k === estado.dia ? " is-selected" : ""));
        chip.type = "button";
        chip.setAttribute("aria-label", largo(new Date(estado.porDia[k][0])));
        chip.appendChild(el("small", null, fSemana.format(f).replace(".", "")));
        chip.appendChild(el("strong", null, String(f.getUTCDate())));
        chip.appendChild(el("small", null, fMesCorto.format(f).replace(".", "")));
        chip.addEventListener("click", function () { estado.dia = k; estado.hora = null; pintarCalendario(); });
        tira.appendChild(chip);
      });
      izq.appendChild(tira);
      requestAnimationFrame(function () {
        var sel = tira.querySelector(".is-selected");
        if (sel) tira.scrollLeft = sel.offsetLeft - (tira.clientWidth - sel.offsetWidth) / 2;
      });

      var etiqueta = el("span", "ntb-label", largo(new Date(estado.porDia[estado.dia][0])));
      etiqueta.style.textTransform = "none";
      der.appendChild(etiqueta);
      var horas = el("div", "ntb-times");
      estado.porDia[estado.dia].forEach(function (iso) {
        var h = el("button", "ntb-time", fHora.format(new Date(iso)));
        h.type = "button";
        h.addEventListener("click", function () { estado.hora = iso; paso2(); });
        horas.appendChild(h);
      });
      der.appendChild(horas);
      raiz.appendChild(el("p", "ntb-hint", T("Horas en tu zona horaria") + " (" + ZONA.replace(/_/g, " ") + ")."));
    }

    function campo(tipo, nombre, texto, obligatorio, completo) {
      var envoltorio = el("label", completo ? "ntb-field-full" : null);
      envoltorio.appendChild(el("span", "ntb-label", texto + (obligatorio ? " *" : "")));
      var input = el(tipo === "textarea" ? "textarea" : "input", "ntb-input");
      if (tipo !== "textarea") input.type = tipo;
      input.name = nombre;
      if (obligatorio) input.required = true;
      envoltorio.appendChild(input);
      return envoltorio;
    }

    function paso2(mensaje) {
      limpiar();
      var inicio = new Date(estado.hora);
      var resumen = el("div", "ntb-summary");
      resumen.appendChild(el("span", null, largo(inicio) + " · " + fHora.format(inicio) + " (30 min)"));
      var cambiar = el("button", "ntb-link", T("Cambiar"));
      cambiar.type = "button";
      cambiar.addEventListener("click", function () { pintarCalendario(); });
      resumen.appendChild(cambiar);
      cambiar.addEventListener("click", arriba);
      raiz.appendChild(resumen);

      var form = el("form");
      form.noValidate = true;
      form.appendChild(el("span", "ntb-label", T("¿Cómo prefieres hablar?")));
      var tipos = el("div", "ntb-types");
      [["meet", T("Videollamada (Google Meet)")], ["whatsapp", T("Llamada por WhatsApp")]].forEach(function (o) {
        var b = el("button", "ntb-type" + (estado.tipo === o[0] ? " is-selected" : ""), o[1]);
        b.type = "button";
        b.addEventListener("click", function () {
          estado.tipo = o[0];
          tipos.querySelectorAll(".ntb-type").forEach(function (x) { x.classList.toggle("is-selected", x === b); });
        });
        tipos.appendChild(b);
      });
      form.appendChild(tipos);

      var campos = el("div", "ntb-fields");
      var envTema = el("label", "ntb-field-full");
      envTema.appendChild(el("span", "ntb-label", T("¿Sobre qué servicio?")));
      var selTema = el("select", "ntb-input ntb-select");
      selTema.name = "servicio";
      SERVICIOS.forEach(function (s) {
        var o = el("option", null, NT_LANG === "en" ? s[2] : s[1]);
        o.value = s[0];
        if (s[0] === estado.ctx.clave) o.selected = true;
        selTema.appendChild(o);
      });
      envTema.appendChild(selTema);
      campos.appendChild(envTema);
      campos.appendChild(campo("text", "nombre", T("Nombre y apellidos"), true));
      campos.appendChild(campo("email", "email", T("Email"), true));
      campos.appendChild(campo("tel", "telefono", T("Teléfono (WhatsApp)"), true, true));
      var motivo = campo("textarea", "motivo", T("¿Sobre qué quieres hablar?"), false, true);
      motivo.querySelector("textarea").placeholder = T("Cuéntanos brevemente tu situación (opcional)");
      campos.appendChild(motivo);
      form.appendChild(campos);
      form.nombre.autocomplete = "name";
      form.email.autocomplete = "email";
      form.telefono.autocomplete = "tel";

      var trampa = el("div", "ntb-trap");
      trampa.setAttribute("aria-hidden", "true");
      var web = el("input"); web.name = "web"; web.tabIndex = -1; web.autocomplete = "off";
      trampa.appendChild(web);
      form.appendChild(trampa);

      var check = el("label", "ntb-check");
      var cb = el("input"); cb.type = "checkbox"; cb.name = "privacidad";
      check.appendChild(cb);
      var txt = el("span");
      txt.appendChild(document.createTextNode(T("He leído y acepto la ")));
      var pol = el("a", null, T("política de privacidad"));
      pol.href = "privacidad"; pol.target = "_blank";
      txt.appendChild(pol);
      txt.appendChild(document.createTextNode("."));
      check.appendChild(txt);
      form.appendChild(check);

      var error = el("p", "ntb-error");
      error.hidden = !mensaje;
      if (mensaje) error.textContent = mensaje;
      form.appendChild(error);

      var enviar = el("button", "ntb-submit", T("Confirmar reserva"));
      enviar.type = "submit";
      var acciones = el("div", "ntb-actions");
      acciones.appendChild(enviar);
      form.appendChild(acciones);
      raiz.appendChild(form);
      arriba();

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var d = {
          accion: "reservar",
          inicio: estado.hora,
          tipo: estado.tipo,
          nombre: form.nombre.value.trim(),
          email: form.email.value.trim(),
          telefono: form.telefono.value.trim(),
          motivo: form.motivo.value.trim(),
          web: form.web.value,
          idioma: NT_LANG,
          zona: ZONA,
          servicio: nombreServicio(selTema.value, "es"),
          servicioCliente: nombreServicio(selTema.value),
          detalle: selTema.value === estado.ctx.clave ? estado.ctx.detalle : "",
          pagina: estado.ctx.pagina
        };
        var fallo = "";
        if (d.nombre.length < 2) fallo = T("Indica tu nombre y apellidos.");
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) fallo = T("Indica un correo electrónico válido.");
        else if (d.telefono.replace(/\D/g, "").length < 6) fallo = T("Indica un teléfono válido.");
        else if (!cb.checked) fallo = T("Debes aceptar la política de privacidad.");
        if (fallo) { error.textContent = fallo; error.hidden = false; return; }

        error.hidden = true;
        enviar.disabled = true;
        enviar.textContent = T("Reservando…");
        enviarReserva(d).then(function (r) {
          if (r && r.ok) return hecho(d, r);
          enviar.disabled = false;
          enviar.textContent = T("Confirmar reserva");
          if (r && r.error === "ocupado") {
            estado.hora = null;
            olvidarAgenda();
            cargarHuecos(true);
            paso1(true);
            arriba();
            return;
          }
          error.textContent = r && r.error === "repetida"
            ? T("Ya tienes una reserva reciente con este email. Si necesitas cambiarla, escríbenos por WhatsApp.")
            : T("No hemos podido completar la reserva. Inténtalo de nuevo o escríbenos por WhatsApp.");
          error.hidden = false;
        }, function () {
          enviar.disabled = false;
          enviar.textContent = T("Confirmar reserva");
          error.textContent = T("No hemos podido completar la reserva. Inténtalo de nuevo o escríbenos por WhatsApp.");
          error.hidden = false;
        });
      });
    }

    function hecho(d, r) {
      raiz.innerHTML = "";
      var inicio = new Date(r.inicio || d.inicio);
      var caja = el("div", "ntb-done");
      caja.appendChild(el("div", "ntb-done-icon", "✓"));
      caja.appendChild(el("h2", "ntb-title", T("¡Reserva confirmada!")));
      var cuando = el("p");
      cuando.appendChild(el("strong", null, largo(inicio) + " · " + fHora.format(inicio)));
      caja.appendChild(cuando);
      caja.appendChild(el("p", null, d.tipo === "meet"
        ? T("Te hemos enviado la invitación a tu email con el enlace de Google Meet.")
        : T("Te hemos enviado la invitación a tu email. Te llamaremos por WhatsApp a esa hora.")));
      caja.appendChild(el("p", null, T("Si necesitas cambiarla, escríbenos por WhatsApp.")));
      if (alCerrar) {
        var cerrar = el("button", "ntb-submit", T("Cerrar"));
        cerrar.type = "button";
        cerrar.addEventListener("click", alCerrar);
        caja.appendChild(cerrar);
      }
      raiz.appendChild(caja);
      arriba();
      // La agenda ha cambiado: la próxima vez se vuelve a pedir
      peticion = null;
      olvidarAgenda();
    }

    this.empezar = function (ctx) {
      estado.hora = null;
      estado.ctx = ctx || contexto(null);
      paso1();
    };
  }

  /* ---------- Pop-up ---------- */

  var overlay = null, reservador = null, ultimoFoco = null;

  function cerrarPopup() {
    if (!overlay) return;
    overlay.classList.remove("ntb-open");
    document.body.classList.remove("ntb-lock");
    if (ultimoFoco) ultimoFoco.focus();
  }

  function abrirPopup(ctx) {
    ultimoFoco = document.activeElement;
    if (!overlay) {
      overlay = el("div", "ntb-overlay");
      var caja = el("div", "ntb");
      caja.setAttribute("role", "dialog");
      caja.setAttribute("aria-modal", "true");
      var x = el("button", "ntb-close", "×");
      x.type = "button";
      x.setAttribute("aria-label", T("Cerrar"));
      x.addEventListener("click", cerrarPopup);
      caja.appendChild(x);
      overlay.appendChild(caja);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) cerrarPopup(); });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && overlay.classList.contains("ntb-open")) cerrarPopup();
      });
      document.body.appendChild(overlay);
      reservador = new Reservador(caja, cerrarPopup);
    }
    reservador.empezar(ctx);
    overlay.classList.add("ntb-open");
    document.body.classList.add("ntb-lock");
    overlay.querySelector(".ntb-close").focus();
  }

  function esAsesoria(n) {
    if (n.matches("[data-reserva], [data-cns='asesoria-gratis']")) return true;
    if (n.tagName !== "A") return false;
    return /^(\.\.\/|\/|\/en\/)?asesoria\/?(#.*)?$/.test(n.getAttribute("href") || "");
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Captura: se adelanta a los pop-ups antiguos de "asesoría gratis"
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var n = e.target.closest && e.target.closest("a, button, [data-reserva]");
      if (!n || !esAsesoria(n)) return;
      e.preventDefault();
      e.stopPropagation();
      var nav = document.querySelector(".nav.open");
      if (nav) { var t = document.querySelector(".nav-toggle"); if (t) t.click(); }
      abrirPopup(contexto(n));
    }, true);

    document.querySelectorAll("[data-reserva-inline]").forEach(function (c) {
      c.classList.add("ntb", "ntb-inline");
      new Reservador(c).empezar(contexto(c));
    });

    // Se pide la agenda en cuanto el visitante se acerca a un botón de reserva,
    // así el pop-up abre ya con los huecos cargados
    function intencion(e) {
      var n = e.target.closest && e.target.closest("a, button, [data-reserva]");
      if (n && esAsesoria(n)) cargarHuecos();
    }
    document.addEventListener("pointerover", intencion, { passive: true });
    document.addEventListener("focusin", intencion);
    document.addEventListener("touchstart", intencion, { passive: true });

    // Y, con la página ya cargada, se precarga en segundo plano (Google tarda unos segundos en arrancar)
    window.addEventListener("load", function () {
      setTimeout(function () { if (API) cargarHuecos(); }, 2500);
    });
  });
})();
