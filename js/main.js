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
        status.textContent = "Gracias, hemos recibido tu mensaje. Te contactaremos en breve.";
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
  var SUCCESS_MSG = "¡Gracias! Un asesor de NomoTax se pondrá en contacto contigo por teléfono en las próximas 24 horas. Está atento/a a una llamada desde el +34 642 75 76 33.";

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
      openAltaModal(btn.getAttribute("data-plan"), isAnnual ? "Plan anual" : "Plan mensual");
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
      openAltaAutoModal(btn.getAttribute("data-plan"), isAnnual ? "Plan anual" : "Plan mensual");
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
        alert("Por favor, selecciona el tipo de sociedad y cuándo la necesitas.");
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
        alert("Por favor, selecciona el tipo de sociedad.");
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
        alert("Por favor, indica si requieres alta de autónomo.");
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
          return llcShowError("Indica el nombre que quieres para tu LLC.");
        }
        if (!plazo) {
          return llcShowError("Selecciona cuándo quieres tenerla constituida.");
        }
        if (!estado) {
          return llcShowError("Selecciona el estado donde quieres constituirla.");
        }
        if (!nombre.value.trim()) {
          return llcShowError("Indica tu nombre y apellidos.");
        }
        if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          return llcShowError("Indica un correo electrónico válido.");
        }
        if (telefono.value.replace(/\D/g, "").length < 9) {
          return llcShowError("Indica un teléfono móvil válido.");
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
          return packShowError("Indica el nombre de tu LLC.");
        }
        if (ein.value.replace(/\D/g, "").length !== 9) {
          return packShowError("Indica un EIN válido (formato 12-3456789).");
        }
        if (!nombre.value.trim()) {
          return packShowError("Indica tu nombre y apellidos.");
        }
        if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          return packShowError("Indica un correo electrónico válido.");
        }
        if (telefono.value.replace(/\D/g, "").length < 9) {
          return packShowError("Indica un teléfono móvil válido.");
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
    cultura: "Requiere certificado del ICAA (o del órgano competente de tu comunidad) o del INAEM para artes escénicas y musicales, y contrato de financiación comunicado a la AEAT antes de finalizar el periodo impositivo.",
    idi: "Requiere informe motivado vinculante del Ministerio de Ciencia, Innovación y Universidades sobre el proyecto, y contrato de financiación comunicado a la AEAT antes de finalizar el periodo impositivo."
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
        ? "Lo que pagarías de IRPF"
        : "Lo que pagarías de Impuesto de Sociedades";
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
          ? "Autónomo · IRPF"
          : "Empresa · Impuesto de Sociedades";
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

      if (!interes) return mostrarError("Selecciona qué tipo de proyecto te interesa.");
      if (!nombre.value.trim()) return mostrarError("Indica tu nombre y apellidos.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        return mostrarError("Indica un correo electrónico válido.");
      }
      if (telefono.value.replace(/\D/g, "").length < 9) {
        return mostrarError("Indica un teléfono móvil válido.");
      }

      if (successMeta && ultimo) {
        successMeta.textContent = interes + " · aportación estimada " +
          eur.format(ultimo.aportacion) + " · ahorro neto " + eur.format(ultimo.ahorro);
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

    out.tagSalario.textContent = r.excede ? "Tributa al 24% + 47%" : "Tributa al 24%";

    out.bkSalario.textContent = eur.format(r.cuotaSalarioBk);
    out.bkAhorro.textContent = eur.format(r.cuotaAhorroBk);
    out.bkExt.textContent = r.rentaExtranjera > 0 ? "Exentas" : eur.format(0);

    out.gnGeneral.textContent = eur.format(r.cuotaGeneral);
    out.gnAhorro.textContent = eur.format(r.cuotaAhorroGn);
    out.gnExt.textContent = r.rentaExtranjera > 0 ? "Incluidas arriba" : eur.format(0);
    out.gnTotal.textContent = eur.format(r.totalGn);
    out.bkTotal.textContent = eur.format(r.totalBk);

    var ganaBeckham = r.diferencia > 0;
    var sinDatos = r.totalBk === 0 && r.totalGn === 0;
    out.colBeckham.classList.toggle("bk-out-col-win", ganaBeckham && !sinDatos);
    out.colGeneral.classList.toggle("bk-out-col-win", !ganaBeckham && !sinDatos);
    out.veredicto.classList.toggle("bk-verdict-bad", !ganaBeckham);

    if (sinDatos) {
      out.veredictoLabel.textContent = "Empieza por tu salario";
      out.veredictoValor.textContent = "Pon tus cifras";
      out.veredictoNota.textContent = "Con tus ingresos reales verás la diferencia entre los dos regímenes.";
    } else if (ganaBeckham) {
      out.veredictoLabel.textContent = "Te ahorras cada año";
      out.veredictoValor.textContent = eur.format(r.diferencia);
      out.veredictoNota.textContent = eur.format(r.diferencia * 6) +
        " en los seis años que dura el régimen.";
    } else {
      out.veredictoLabel.textContent = "Con estos números";
      out.veredictoValor.textContent = "No te compensa";
      out.veredictoNota.textContent = "El régimen general sale " +
        eur.format(Math.abs(r.diferencia)) + " más barato al año. Conviene revisarlo con tu caso completo.";
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

  var EXITO_POR_DEFECTO = "Un asesor especialista revisará tu caso y te contactará en las próximas 24 horas con el precio cerrado y los siguientes pasos.";

  var CCAA = [
    "Andalucía", "Aragón", "Asturias", "Baleares", "Canarias", "Cantabria",
    "Castilla-La Mancha", "Castilla y León", "Cataluña", "Comunidad Valenciana",
    "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia", "Navarra",
    "País Vasco", "Ceuta", "Melilla"
  ];

  /* Rellenar los selects de comunidad autónoma */
  modal.querySelectorAll("[data-cns-ccaa]").forEach(function (sel) {
    var html = '<option value="">Selecciona</option>';
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
      var error = campo.getAttribute("data-error") || "Completa todos los campos.";

      if (campo.hasAttribute("data-required")) {
        if (!campo.querySelector(".gst-option-selected")) return error;
        continue;
      }
      if (!campo.value.trim()) return error;
      if (campo.type === "date") {
        if (campo.min && campo.value < campo.min) return "Elige una fecha a partir de mañana.";
        if (campo.max && campo.value > campo.max) return "La fecha de notificación no puede ser posterior a hoy.";
        if (campo.hasAttribute("data-laborable")) {
          var dia = new Date(campo.value + "T12:00:00").getDay();
          if (dia === 0 || dia === 6) return "Elige un día de lunes a viernes.";
        }
      }
    }
    return "";
  }

  function fechaLarga(valor) {
    var d = new Date(valor + "T12:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
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

      if (!nombre.value.trim()) return mostrarError("Indica tu nombre y apellidos.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        return mostrarError("Indica un correo electrónico válido.");
      }
      if (telefono.value.replace(/\D/g, "").length < 9) {
        return mostrarError("Indica un teléfono móvil válido.");
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
