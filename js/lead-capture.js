/*
  ==========================================================================
  TAKAFUL.CARE — LEAD CAPTURE  (v6)

  New in v6: sends a ready-made WhatsApp link (wa_link) so a GHL
  notification can have a one-tap "WhatsApp the lead" button. GHL can't
  strip the "+" from a phone number inside a merge field, so we build the
  clean wa.me link here (digits only) and pass it as its own field.

  Everything else is unchanged from v5:
  - Sends GET (data in the query string) so the workflow's
    {{inboundWebhookRequest.queryParams.<key>}} mappings resolve.
  - Waits for the request to settle before redirecting.
  - Inert while the webhook URL is a placeholder.

  UPLOAD TO:  js/lead-capture.js   (repo root — replaces the old file)
  Reference it with a bumped cache-buster so browsers fetch the new copy:
      <script src="/js/lead-capture.js?v=6" defer></script>

  TO EXCLUDE a form:  add  data-ghl="off"  to the <form> tag.
  ==========================================================================
*/

(function () {
  "use strict";

  var GHL_WEBHOOK_URL =
    "https://services.leadconnectorhq.com/hooks/xsyaGwI7Qtc8BigBxu9E/webhook-trigger/4712bb69-509c-4313-a11c-09ed5736ad14";

  var DEBUG = false;
  var THANK_YOU_URL = "/terima-kasih";
  var MAX_TEXT = 300;
  var MAX_WAIT = 3000;

  var CONFIGURED =
    GHL_WEBHOOK_URL.indexOf("http") === 0 &&
    GHL_WEBHOOK_URL.indexOf("PASTE_") === -1;

  function log() {
    if (DEBUG && window.console) {
      console.log.apply(console,
        ["[lead-capture]"].concat([].slice.call(arguments)));
    }
  }

  if (!CONFIGURED) { log("No webhook URL — inert."); return; }

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
      if (name.charAt(0) === "_") continue;

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

  // Returns { e164: "+60123456789", digits: "60123456789" }
  function normalisePhone(raw) {
    if (!raw) return { e164: "", digits: "" };
    var s = String(raw).replace(/[^\d+]/g, "");
    var e164;
    if (s.indexOf("+") === 0) {
      e164 = s;
    } else {
      s = s.replace(/\D/g, "");
      if (s.indexOf("60") === 0) e164 = "+" + s;
      else if (s.indexOf("0") === 0) e164 = "+6" + s;
      else if (s.length >= 9) e164 = "+60" + s;
      else e164 = raw;
    }
    return { e164: e164, digits: e164.replace(/\D/g, "") };
  }

  function findByPattern(data, re) {
    var keys = Object.keys(data);
    for (var i = 0; i < keys.length; i++) {
      if (re.test(keys[i])) return data[keys[i]];
    }
    return "";
  }

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
      var fonRaw = findByPattern(data, /(phone|tel|wasap|whatsapp|nombor)/i);
      var mel  = findByPattern(data, /(emel|email|e-?mail)/i);
      var fon = normalisePhone(fonRaw);

      if (!nama || !fon.e164) {
        e.preventDefault();
        alert("Sila lengkapkan nama dan nombor telefon anda.");
        return;
      }

      e.preventDefault();

      var payload = {};
      for (var k in data) { if (data.hasOwnProperty(k)) payload[k] = data[k]; }

      payload.nama = nama;
      payload.telefon = fon.e164;
      payload.emel = mel;
      payload.email = mel;
      payload.source = sourceFromPath();
      payload.page_url = window.location.href;

      // Ready-made one-tap WhatsApp link to the LEAD's number (digits only).
      payload.wa_link = "https://wa.me/" + fon.digits;

      var qp = new URLSearchParams(window.location.search);
      payload.utm_source = qp.get("utm_source") || "";
      payload.utm_medium = qp.get("utm_medium") || "";
      payload.utm_campaign = qp.get("utm_campaign") || "";
      payload.fbclid = qp.get("fbclid") || "";

      if (typeof fbq === "function") {
        try { fbq("track", "Lead"); } catch (err) {}
      }

      var btn = form.querySelector('[type="submit"], button');
      if (btn) { btn.disabled = true; btn.textContent = "Menghantar..."; }

      sendToGHL(payload, function () {
        if (DEBUG) {
          log("Would redirect to " + THANK_YOU_URL + " (held by DEBUG)");
          if (btn) { btn.disabled = false; btn.textContent = "Hantar"; }
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
