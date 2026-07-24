/*
  ==========================================================================
  TAKAFUL.CARE — LEAD CAPTURE (v3)

  GOAL: leads go to GoHighLevel, not to the site builder's endpoint.

  HOW IT BEHAVES
  - GHL URL still a placeholder  -> script does nothing at all. The form
    submits to whatever its action says (the LocusPilot builder endpoint),
    exactly as it did before. Nothing breaks, no lead is lost.
  - GHL URL filled in            -> script takes over: sends the lead to
    GHL, stops the builder submission, and redirects to /terima-kasih.

  So the switchover is a single paste. Nothing else to change, and there
  is never a window where leads fall through a gap.

  UPLOAD TO:  js/lead-capture.js   (repo root — replaces the old file)

  Already referenced by:
      <script src="/js/lead-capture.js" defer></script>
  in hubungi-kami/index.html and dapatkan-sebut-harga/index.html

  TO EXCLUDE a form:  add  data-ghl="off"  to the <form> tag.
  ==========================================================================
*/

(function () {
  "use strict";

  /* ---- PASTE YOUR SAVED GHL WEBHOOK URL HERE -------------------------- */
  var GHL_WEBHOOK_URL = "PASTE_YOUR_GHL_INBOUND_WEBHOOK_URL_HERE";
  /* --------------------------------------------------------------------- */

  var THANK_YOU_URL = "/terima-kasih";

  // Until a real URL is pasted above, this script stays completely inert.
  var CONFIGURED =
    GHL_WEBHOOK_URL.indexOf("http") === 0 &&
    GHL_WEBHOOK_URL.indexOf("PASTE_") === -1;

  if (!CONFIGURED) return;   // <- forms keep working via their own action

  var HONEYPOTS = ["company", "_website_url", "website_url"];

  function sourceFromPath() {
    var p = window.location.pathname.replace(/\/+$/, "");
    if (!p) return "homepage";
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
      if (name.charAt(0) === "_") continue;        // skip _next, _website_url

      if (el.type === "checkbox") {
        if (el.checked) {
          data[name] = data[name]
            ? data[name] + ", " + (el.value || "Ya")
            : (el.value || "Ya");
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

  function isBot(form) {
    for (var i = 0; i < HONEYPOTS.length; i++) {
      var f = form.querySelector('[name="' + HONEYPOTS[i] + '"]');
      if (f && f.value && f.value.trim() !== "") return true;
    }
    return false;
  }

  // Malaysian numbers -> E.164, the format GHL and WhatsApp accept.
  //   012-345 6789 -> +60123456789
  function normalisePhone(raw) {
    if (!raw) return "";
    var s = String(raw).replace(/[^\d+]/g, "");
    if (s.indexOf("+") === 0) return s;
    s = s.replace(/\D/g, "");
    if (s.indexOf("60") === 0) return "+" + s;
    if (s.indexOf("0") === 0) return "+6" + s;
    if (s.length >= 9) return "+60" + s;
    return raw;
  }

  function findByPattern(data, re) {
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      if (re.test(keys[i])) return data[keys[i]];
    }
    return "";
  }

  function sendToGHL(data) {
    var body = new URLSearchParams(data).toString();

    // sendBeacon is built for this: fire-and-forget, survives navigation.
    try {
      if (navigator.sendBeacon) {
        var blob = new Blob([body], {
          type: "application/x-www-form-urlencoded"
        });
        if (navigator.sendBeacon(GHL_WEBHOOK_URL, blob)) return;
      }
    } catch (e) { /* fall through */ }

    try {
      fetch(GHL_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      });
    } catch (e) { /* never block the user */ }
  }

  function bind(form) {
    if (form.getAttribute("data-ghl") === "off") return;
    if (form.getAttribute("data-ghl-bound") === "1") return;
    form.setAttribute("data-ghl-bound", "1");

    form.addEventListener("submit", function (e) {
      if (isBot(form)) { e.preventDefault(); return; }

      var data = collect(form);

      var nama = findByPattern(data, /(^nama|^name|full_?name)/i);
      var fon  = findByPattern(data, /(phone|tel|wasap|whatsapp|nombor)/i);
      var mel  = findByPattern(data, /(emel|email|e-?mail)/i);

      if (!nama || !fon) {
        e.preventDefault();
        alert("Sila lengkapkan nama dan nombor telefon anda.");
        return;
      }

      // We are handling this lead — stop the builder endpoint receiving it.
      e.preventDefault();

      var payload = {};
      for (var k in data) { if (data.hasOwnProperty(k)) payload[k] = data[k]; }

      payload.nama = nama;
      payload.telefon = normalisePhone(fon);
      payload.emel = mel;
      payload.source = sourceFromPath();
      payload.page_url = window.location.href;

      var qp = new URLSearchParams(window.location.search);
      payload.utm_source = qp.get("utm_source") || "";
      payload.utm_medium = qp.get("utm_medium") || "";
      payload.utm_campaign = qp.get("utm_campaign") || "";
      payload.fbclid = qp.get("fbclid") || "";

      if (typeof fbq === "function") {
        try { fbq("track", "Lead"); } catch (err) {}
      }

      sendToGHL(payload);

      var btn = form.querySelector('[type="submit"], button');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menghantar...";
      }

      // Short pause so the beacon leaves the browser before we navigate.
      setTimeout(function () {
        window.location.href = THANK_YOU_URL;
      }, 700);
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
