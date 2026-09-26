/*
  ==========================================================================
  TAKAFUL.CARE — CALCULATOR LEAD CAPTURE (v1)

  WHY THIS EXISTS (separate from /js/lead-capture.js)
  The calculator pages render their lead form with a Preact "island" that
  hydrates AFTER the page loads. The normal lead-capture.js binds forms at
  load time, so it would never see a form that appears later. This script
  instead listens for submit events at the DOCUMENT level in the CAPTURE
  phase, so it catches the submit no matter when the form was rendered.

  It ONLY acts on forms whose action points at LocusPilot (the calculator
  lead forms), so it cannot interfere with anything else on the page.

  WHAT IT DOES
  Intercepts that submit, sends the lead to GHL as a GET query string
  (matching the workflow's queryParams mapping), then redirects to
  /terima-kasih — same destination as every other form on the site.

  UPLOAD TO:  js/calc-lead-capture.js
  REFERENCE (on calculator pages only, before </body>):
      <script src="/js/calc-lead-capture.js?v=1" defer></script>
  ==========================================================================
*/

(function () {
  "use strict";

  var GHL_WEBHOOK_URL =
    "https://services.leadconnectorhq.com/hooks/xsyaGwI7Qtc8BigBxu9E/webhook-trigger/4712bb69-509c-4313-a11c-09ed5736ad14";

  var THANK_YOU_URL = "/terima-kasih";
  var MAX_WAIT = 3000;

  function sourceFromPath() {
    var p = window.location.pathname.replace(/\/+$/, "");
    if (!p) return "homepage";
    return p.replace(/^\//, "").replace(/\//g, "-");
  }

  // Malaysian numbers -> E.164. Returns { e164, digits }.
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

  function sendToGHL(data, done) {
    var qs = new URLSearchParams(data).toString();
    var joiner = GHL_WEBHOOK_URL.indexOf("?") === -1 ? "?" : "&";
    var url = GHL_WEBHOOK_URL + joiner + qs;

    var finished = false;
    function finish() { if (finished) return; finished = true; done(); }

    setTimeout(finish, MAX_WAIT);
    try {
      fetch(url, { method: "GET", mode: "no-cors", keepalive: true })
        .then(finish).catch(finish);
    } catch (e) {
      try { new Image().src = url; } catch (e2) {}
      finish();
    }
  }

  // Capture-phase listener on document: fires for any form, including ones
  // hydrated by Preact after page load.
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || form.tagName !== "FORM") return;

    var action = form.getAttribute("action") || "";
    // Only the LocusPilot calculator lead forms — leave everything else alone.
    if (action.indexOf("locuspilot.com") === -1) return;

    // Collect fields.
    var data = {};
    var els = form.querySelectorAll("input, select, textarea");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.name || el.id;
      if (!name) continue;
      if (el.type === "submit" || el.type === "button") continue;
      if (name.charAt(0) === "_") continue;        // skip _next etc.
      var v = (el.value || "").trim();
      if (v) data[name] = v;
    }

    function byPattern(re) {
      for (var k in data) { if (data.hasOwnProperty(k) && re.test(k)) return data[k]; }
      return "";
    }

    var nama = byPattern(/(^nama|^name|full_?name)/i);
    var fonRaw = byPattern(/(phone|tel|wasap|whatsapp|nombor)/i);
    var mel = byPattern(/(emel|email|e-?mail)/i);

    // If required fields are empty, let native validation handle it.
    if (!nama || !fonRaw) return;

    // We are handling this lead — stop the LocusPilot POST.
    e.preventDefault();

    var fon = normalisePhone(fonRaw);
    var src = sourceFromPath();

    var payload = {
      nama: nama,
      telefon: fon.e164,
      emel: mel,
      email: mel,
      source: src,
      offer: src,                       // e.g. kalkulator-hibah
      wa_link: "https://wa.me/" + fon.digits,
      page_url: window.location.href
    };

    var qp = new URLSearchParams(window.location.search);
    payload.utm_source = qp.get("utm_source") || "";
    payload.utm_medium = qp.get("utm_medium") || "";
    payload.utm_campaign = qp.get("utm_campaign") || "";
    payload.fbclid = qp.get("fbclid") || "";

    if (typeof fbq === "function") { try { fbq("track", "Lead"); } catch (err) {} }

    var btn = form.querySelector('[type="submit"], button');
    if (btn) { btn.disabled = true; }

    sendToGHL(payload, function () {
      window.location.href = THANK_YOU_URL;
    });
  }, true); // <-- capture phase

})();
