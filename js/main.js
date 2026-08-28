document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
    });
  }

  function closeAllMenus() {
    document.querySelectorAll(".mega-menu.open").forEach(function (m) {
      m.classList.remove("open");
    });
    document.querySelectorAll(".mega-trigger.open").forEach(function (b) {
      b.classList.remove("open");
    });
  }

  document.querySelectorAll(".mega-trigger").forEach(function (btn) {
    var menu = document.getElementById("mega-" + btn.dataset.menu);
    if (!menu) return;

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = menu.classList.contains("open");
      closeAllMenus();
      if (!isOpen) {
        menu.classList.add("open");
        btn.classList.add("open");
      }
    });

    menu.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  });

  document.querySelectorAll(".nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      nav.classList.remove("open");
      closeAllMenus();
    });
  });

  document.addEventListener("click", closeAllMenus);

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
});
