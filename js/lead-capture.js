/*
  ==========================================================================
  TAKAFUL.CARE — UNIVERSAL LEAD CAPTURE
  Wires EVERY form on the site to GoHighLevel without rebuilding any form.

  UPLOAD TO:  public/js/lead-capture.js

  THEN add this one line to your base layout, just before </body>:
      <script src="/js/lead-capture.js" defer></script>

  Your base layout is the .astro file that renders the site header and
  footer — usually src/layouts/BaseLayout.astro or Layout.astro. Adding it
  there covers dapatkan-sebut-harga, hubungi-kami, and every future page
  in one edit.

  NOTE: files in public/ (your ad landing pages) do NOT use the Astro
  layout, so they keep their own inline script. No conflict, no double-send.

  TO EXCLUDE a form:  add  data-ghl="off"  to the <form> tag.
  ==========================================================================
*/

(function () {
  "use strict";

  /* ---- SWAP THIS ------------------------------------------------------ */
  var GHL_WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/xsyaGwI7Qtc8BigBxu9E/webhook-trigger/ce95454a-5115-4ad9-a0ca-25ebd4a3a916";
  /* --------------------------------------------------------------------- */

  var THANK_YOU_URL = "/terima-kasih";
  var REDIRECT_AFTER_SUBMIT = true;   // false = show inline success instead

  // Maps URL path -> the source value sent to GHL.
  function sourceFromPath() {
    var p = window.location.pathname.replace(/\/+$/, "");
    if (!p || p === "") return "homepage";
    return p.replace(/^\//, "").replace(/\//g, "-");
  }

  function collect(form) {
    var data = {};
    var els = form.querySelectorAll("input, select, textarea");

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.name || el.id;
      if (!name) continue;
      if (el.type === "submit" || el.type === "button") continue;

      if (el.type === "checkbox") {
        if (el.checked) {
          data[name] = data[name] ? data[name] + ", " + (el.value || "Ya") : (el.value || "Ya");
        }
        continue;
      }
      if (el.type === "radio") {
        if (el.checked) data[name] = el.value;
        continue;
      }
      var v = (el.value || "").trim();
      if (v) data[name] = v;
    }
    return data;
  }

  // Finds the first field whose name/id looks like a phone number.
  function looksLikePhone(data) {
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      if (/(phone|tel|wasap|whatsapp|nombor)/i.test(keys[i])) return data[keys[i]];
    }
    return "";
  }

  function looksLikeName(data) {
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      if (/(^nama|name)/i.test(keys[i])) return data[keys[i]];
    }
    return "";
  }

  function showInlineSuccess(form) {
    var box = document.createElement("div");
    box.setAttribute("role", "status");
    box.style.cssText =
      "background:#E1F5EE;border:1px solid #C4EBDD;border-radius:12px;" +
      "padding:18px 20px;color:#0F6E56;font-weight:600;margin-top:12px;";
    box.textContent =
      "Terima kasih — permohonan anda diterima. Saya akan hubungi anda melalui WhatsApp dalam masa 24 jam.";
    form.parentNode.insertBefore(box, form.nextSibling);
    form.style.display = "none";
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function bind(form) {
    if (form.getAttribute("data-ghl") === "off") return;
    if (form.getAttribute("data-ghl-bound") === "1") return;
    form.setAttribute("data-ghl-bound", "1");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var data = collect(form);

      // honeypot: any field literally named "company" left filled = bot
      if (data.company) return;

      var nama = looksLikeName(data);
      var fon = looksLikePhone(data);

      if (!nama || !fon) {
        alert("Sila lengkapkan nama dan nombor telefon anda.");
        return;
      }

      var btn = form.querySelector('[type="submit"], button');
      var original = "";
      if (btn) {
        original = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Menghantar…";
      }

      var qp = new URLSearchParams(window.location.search);
      data.source = sourceFromPath();
      data.page_url = window.location.href;
      data.utm_source = qp.get("utm_source") || "";
      data.utm_medium = qp.get("utm_medium") || "";
      data.utm_campaign = qp.get("utm_campaign") || "";
      data.fbclid = qp.get("fbclid") || "";

      if (typeof fbq === "function") { fbq("track", "Lead"); }

      var payload = new URLSearchParams(data).toString();

      var done = function () {
        if (REDIRECT_AFTER_SUBMIT) {
          window.location.href = THANK_YOU_URL;
        } else {
          if (btn) { btn.disabled = false; btn.textContent = original; }
          showInlineSuccess(form);
        }
      };

      // form-urlencoded + no-cors = simple request, never blocked by CORS
      fetch(GHL_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload
      }).then(done).catch(done);

      if (REDIRECT_AFTER_SUBMIT) {
        setTimeout(function () { window.location.href = THANK_YOU_URL; }, 4000);
      }
    });
  }

  function init() {
    var forms = document.querySelectorAll("form");
    for (var i = 0; i < forms.length; i++) bind(forms[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
