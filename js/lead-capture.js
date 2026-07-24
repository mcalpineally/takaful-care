/*
  ==========================================================================
  TAKAFUL.CARE — LEAD CAPTURE  (v5 — FINAL)

  Replaces the old file completely. The old one had two faults:
    1. It pointed at the DELETED webhook (ending 0ea147c1...) so every
       request went nowhere.
    2. It sent POST. The workflow is mapped to queryParams, which only
       exists on a GET, so even with the right URL every field would
       have arrived blank.

  Both fixed here, and the correct webhook URL is already filled in.
  Nothing to paste — just upload this file as-is.

  UPLOAD TO:  js/lead-capture.js   (repo root, replacing the old file)

  Referenced by:
      <script src="/js/lead-capture.js" defer></script>
  in hubungi-kami/index.html and dapatkan-sebut-harga/index.html

  TO EXCLUDE a form:  add  data-ghl="off"  to the <form> tag.
  ==========================================================================
*/

(function () {
  "use strict";

  /* Your saved GHL inbound webhook (trigger 4712bb69...).
     If you ever rebuild the trigger, replace this line — nothing else. */
  var GHL_WEBHOOK_URL =
    "https://services.leadconnectorhq.com/hooks/xsyaGwI7Qtc8BigBxu9E/webhook-trigger/4712bb69-509c-4313-a11c-09ed5736ad14";

  var DEBUG = false;               // true = log to console, skip redirect
  var THANK_YOU_URL = "/terima-kasih";
  var MAX_TEXT = 300;              // cap free text so the URL stays valid
  var MAX_WAIT = 3000;             // ms to wait for GHL before redirecting

  var CONFIGURED =
    GHL_WEBHOOK_URL.indexOf("http") === 0 &&
    GHL_WEBHOOK_URL.indexOf("PASTE_") === -1;

  function log() {
    if (DEBUG && window.console) {
      console.log.apply(console,
        ["[lead-capture]"].concat([].slice.call(arguments)));
    }
  }

  if (!CONFIGURED) {
    log("No webhook URL — script inert, form submits normally.");
    return;
  }

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
      if (name.charAt(0) === "_") continue;      // skip _next, _website_url

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
      if (v) data[name] = v.length > MAX_TEXT ? v.slice(0, MAX_TEXT) : v;
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
  //   012-345 6789  ->  +60123456789
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

  // GET, so the data lands in queryParams where the workflow reads it.
  // We wait for the request to settle before navigating — firing and
  // redirecting immediately is what caused leads to vanish before.
  function sendToGHL(data, done) {
    var qs = new URLSearchParams(data).toString();
    var joiner = GHL_WEBHOOK_URL.indexOf("?") === -1 ? "?" : "&";
    var url = GHL_WEBHOOK_URL + joiner + qs;

    log("Sending:", url);

    var finished = false;
    function finish(why) {
      if (finished) return;
      finished = true;
      log("Done:", why);
      done();
    }

    setTimeout(function () { finish("timeout"); }, MAX_WAIT);

    try {
      fetch(url, { method: "GET", mode: "no-cors", keepalive: true })
        .then(function () { finish("completed"); })
        .catch(function (e) { log("fetch error", e); finish("errored"); });
    } catch (e) {
      log("fetch threw", e);
      try { new Image().src = url; } catch (e2) {}
      finish("image fallback");
    }
  }

  function bind(form) {
    if (form.getAttribute("data-ghl") === "off") return;
    if (form.getAttribute("data-ghl-bound") === "1") return;
    form.setAttribute("data-ghl-bound", "1");
    log("Bound form:", form.id || "(no id)");

    form.addEventListener("submit", function (e) {
      if (isBot(form)) { e.preventDefault(); log("Honeypot"); return; }

      var data = collect(form);
      log("Collected:", data);

      var nama = findByPattern(data, /(^nama|^name|full_?name)/i);
      var fon  = findByPattern(data, /(phone|tel|wasap|whatsapp|nombor)/i);
      var mel  = findByPattern(data, /(emel|email|e-?mail)/i);

      if (!nama || !fon) {
        e.preventDefault();
        alert("Sila lengkapkan nama dan nombor telefon anda.");
        return;
      }

      // We handle this lead — stop the builder endpoint receiving it.
      e.preventDefault();

      var payload = {};
      for (var k in data) { if (data.hasOwnProperty(k)) payload[k] = data[k]; }

      payload.nama = nama;
      payload.telefon = normalisePhone(fon);
      payload.emel = mel;
      payload.email = mel;          // both spellings so mapping cannot miss
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

      var btn = form.querySelector('[type="submit"], button');
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Menghantar...";
      }

      sendToGHL(payload, function () {
        if (DEBUG) {
          log("Would redirect to " + THANK_YOU_URL + " (held by DEBUG)");
          if (btn) { btn.disabled = false; btn.textContent = "Hantar Mesej"; }
          return;
        }
        window.location.href = THANK_YOU_URL;
      });
    });
  }

  function init() {
    var forms = document.querySelectorAll("form");
    log("Forms found:", forms.length);
    for (var i = 0; i < forms.length; i++) bind(forms[i]);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
