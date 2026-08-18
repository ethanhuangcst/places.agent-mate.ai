(function () {
  var STORAGE = window.PLACES_I18N_STORAGE;
  var CATALOGS = window.PLACES_I18N;
  var LANG = window.PLACES_LOCALE_LANG;
  var LOCALES = window.PLACES_LOCALES;

  function currentLocale() {
    var stored = localStorage.getItem(STORAGE);
    if (LOCALES.indexOf(stored) !== -1) return stored;
    return "EN";
  }

  function t(key, vars) {
    var loc = currentLocale();
    var catalog = CATALOGS[loc] || {};
    var en = CATALOGS.EN || {};
    var value = catalog[key];
    if (value == null || value === "") value = en[key];
    if (value == null || value === "") value = key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        value = value.replace(new RegExp("\\{" + name + "\\}", "g"), vars[name]);
      });
    }
    return value;
  }

  function applyI18n() {
    var loc = currentLocale();
    document.documentElement.lang = LANG[loc] || "en";
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var vars = {};
      var raw = el.getAttribute("data-i18n-vars");
      if (raw) {
        try {
          vars = JSON.parse(raw);
        } catch (e) {
          vars = {};
        }
      }
      var value = t(key, vars);
      if (el.dataset.i18nAttr) {
        el.setAttribute(el.dataset.i18nAttr, value);
      } else {
        el.textContent = value;
      }
    });
    document.querySelectorAll("[data-page-title]").forEach(function (el) {
      document.title = el.getAttribute("data-page-title");
    });
    var titleKey = document.body.getAttribute("data-title-key");
    if (titleKey) {
      document.title = t(titleKey) + " — places.agent-mate.ai";
    } else if (!document.title) {
      document.title = "places.agent-mate.ai";
    }
    document.querySelectorAll(".locale-switch button").forEach(function (btn) {
      var on = btn.getAttribute("data-locale") === loc;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function bindLocale() {
    document.querySelectorAll(".locale-switch button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        localStorage.setItem(STORAGE, btn.getAttribute("data-locale"));
        applyI18n();
      });
    });
  }

  function bindPassword() {
    document.querySelectorAll(".password-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = document.getElementById(btn.getAttribute("data-for"));
        if (!input) return;
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.setAttribute("aria-pressed", show ? "true" : "false");
        btn.setAttribute("data-i18n", show ? "admin.login.hide_password" : "admin.login.show_password");
        applyI18n();
      });
    });
  }

  function bindCopy() {
    document.querySelectorAll("[data-copy]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var text = btn.getAttribute("data-copy");
        var done = function () {
          btn.setAttribute("data-i18n", "admin.common.copied");
          applyI18n();
          setTimeout(function () {
            btn.setAttribute("data-i18n", "admin.keys.copy");
            applyI18n();
          }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(done);
        } else {
          done();
        }
      });
    });
  }

  function bindMenu() {
    var toggle = document.querySelector(".menu-toggle");
    var shell = document.querySelector(".app-shell");
    if (!toggle || !shell) return;
    toggle.addEventListener("click", function () {
      shell.classList.toggle("is-nav-open");
    });
  }

  function bindDialogs() {
    document.querySelectorAll("[data-open-dialog]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var dlg = document.getElementById(btn.getAttribute("data-open-dialog"));
        if (dlg) dlg.classList.add("is-open");
      });
    });
    document.querySelectorAll("[data-close-dialog]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var dlg = btn.closest(".dialog-backdrop");
        if (dlg) dlg.classList.remove("is-open");
      });
    });
    document.querySelectorAll(".dialog-backdrop").forEach(function (dlg) {
      dlg.addEventListener("click", function (e) {
        if (e.target === dlg) dlg.classList.remove("is-open");
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      document.querySelectorAll(".dialog-backdrop.is-open").forEach(function (dlg) {
        dlg.classList.remove("is-open");
      });
    });
  }

  function applyQueryState() {
    var params = new URLSearchParams(location.search);
    if (params.get("error") === "1") {
      var err = document.querySelector("[data-error]");
      if (err) err.hidden = false;
    }
    if (params.get("sent") === "1") {
      var sent = document.querySelector("[data-sent]");
      var lead = document.querySelector("[data-reset-lead]");
      var form = document.querySelector("[data-reset-form]");
      if (sent) sent.hidden = false;
      if (lead) lead.hidden = true;
      if (form) form.hidden = true;
    }
    if (params.get("done") === "1") {
      var done = document.querySelector("[data-set-done]");
      var formBlock = document.querySelector("[data-set-form]");
      if (done) done.hidden = false;
      if (formBlock) formBlock.hidden = true;
    } else {
      var doneDefault = document.querySelector("[data-set-done]");
      if (doneDefault) doneDefault.hidden = true;
    }
    var mode = params.get("mode");
    if (mode === "reset") {
      var emptyLead = document.querySelector("[data-set-empty-lead]");
      var resetLead = document.querySelector("[data-set-reset-lead]");
      var emptyNote = document.querySelector("[data-set-empty-note]");
      if (emptyLead) emptyLead.hidden = true;
      if (resetLead) resetLead.hidden = false;
      if (emptyNote) emptyNote.hidden = true;
    }
    var setError = params.get("error");
    if (setError === "session") {
      var sessionCallout = document.querySelector("[data-set-error-session]");
      var fields = document.querySelector("[data-set-fields]");
      var formBlock = document.querySelector("[data-set-form]");
      if (sessionCallout) sessionCallout.hidden = false;
      if (fields) fields.hidden = true;
      if (formBlock) formBlock.hidden = false;
    }
    if (setError === "mismatch") {
      var mismatch = document.querySelector("[data-set-error-mismatch]");
      if (mismatch) mismatch.hidden = false;
    }
    if (params.get("empty") === "1") {
      var table = document.querySelector("[data-keys-table]");
      var empty = document.querySelector("[data-keys-empty]");
      if (table) table.hidden = true;
      if (empty) empty.hidden = false;
    }
    var confirm = params.get("confirm");
    if (confirm) {
      var dlg = document.getElementById("dialog-" + confirm);
      if (dlg) dlg.classList.add("is-open");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindLocale();
    bindPassword();
    bindCopy();
    bindMenu();
    bindDialogs();
    applyQueryState();
    applyI18n();
  });

  window.placesT = t;
})();
