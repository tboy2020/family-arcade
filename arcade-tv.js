/*!
 * Kids Learning Arcade — Xbox / TV Mode layer
 * © 2026 Taiwo Adegoke. All rights reserved.
 *
 * Adds, to the hub and every game, with ZERO changes to game logic:
 *   • "TV mode" — a bigger, 10-foot-readable layout (auto-on when a gamepad
 *     connects, or ?tv=1, or saved pref, or the 📺 toggle).
 *   • Controller navigation — D-pad / left-stick move a focus ring between the
 *     on-screen buttons & cards; Ⓐ picks; Ⓑ goes Back to the Arcade.
 *   • Keeps touch, mouse and keyboard working exactly as before. On a phone or
 *     plain desktop (no gamepad, small screen) nothing changes.
 *
 * Single file, no dependencies. Include at the end of <body>:
 *   hub:   <script defer src="arcade-tv.js"></script>
 *   games: <script defer src="../arcade-tv.js"></script>
 */
(function () {
  "use strict";
  if (window.__arcadeTV) return;            // guard against double-include

  var LS_TV = "kla_tv_mode";                // "1" / "0"
  var LS_PAD = "kla_pad_nav";               // "1" / "0" (controller nav on/off)
  var root = document.documentElement;

  /* ---------------- styles (injected once) ---------------- */
  var css = document.createElement("style");
  css.id = "tvStyle";
  css.textContent =
    "html.tv .wrap{max-width:1120px}" +
    "html.tv .grid{grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:22px}" +
    "html.tv .game{min-height:200px;border-radius:26px}" +
    "html.tv .game h3{font-size:28px}" +
    "html.tv .game small{font-size:18px}" +
    "html.tv .game .emoji{font-size:60px}" +
    "html.tv .btn{font-size:1.06em}" +
    "html.tv h1{letter-spacing:.01em}" +
    "html.tv body{scrollbar-width:thin}" +
    /* focus ring */
    "#tvRing{position:fixed;left:0;top:0;z-index:2147482000;pointer-events:none;border:4px solid #6d5bff;" +
      "border-radius:16px;box-shadow:0 0 0 4px rgba(109,91,255,.35),0 12px 30px rgba(80,60,140,.45);" +
      "transition:transform .12s cubic-bezier(.2,.8,.2,1),width .12s,height .12s;display:none}" +
    "html.tv.padnav #tvRing.on{display:block}" +
    /* hint bar */
    "#tvBar{position:fixed;pointer-events:none;left:50%;bottom:calc(12px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);" +
      "z-index:2147483000;display:none;gap:14px;align-items:center;background:rgba(58,47,85,.92);color:#fff;" +
      "font-family:inherit;font-weight:800;font-size:16px;padding:9px 16px;border-radius:999px;" +
      "box-shadow:0 10px 26px rgba(0,0,0,.4)}" +
    "html.tv.padnav #tvBar{display:flex}" +
    "#tvBar .k{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}" +
    "#tvBar b{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 5px;border-radius:7px;" +
      "background:#fff;color:#3a2f55;font-size:13px;font-weight:900}" +
    /* corner toggles */
    "#tvToggle{position:fixed;right:calc(10px + env(safe-area-inset-right,0px));top:calc(10px + env(safe-area-inset-top,0px));" +
      "z-index:2147483000;display:none;gap:8px}" +
    "#tvToggle button{font-family:inherit;font-weight:900;font-size:14px;border:0;cursor:pointer;border-radius:999px;" +
      "padding:9px 13px;background:rgba(58,47,85,.9);color:#fff;box-shadow:0 5px 14px rgba(0,0,0,.3);-webkit-tap-highlight-color:transparent}" +
    "#tvToggle button.off{opacity:.45}" +
    "@media (max-width:700px){#tvBar{font-size:13px;padding:7px 12px;gap:10px}}" +
    /* S3: the toast is display-only — never let it swallow a cursor click on the control beneath it */
    "#toast{pointer-events:none}" +
    /* S1: compact the player roster in TV mode so the Start button never drops below the TV fold (4-6 players) */
    "html.tv #plist{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px;align-items:start}" +
    "html.tv .prow{padding:10px 12px}" +
    "html.tv .sw{width:30px;height:30px}" +
    /* PERF on weak Xbox GPUs: a FIXED multi-gradient background repaints on every scroll frame — the
       classic "page unresponsive / Wait or Exit" hang when scrolling the list. Detach it, and stop the
       forever-animating blobs, so TV scrolling stays smooth. */
    "html.tv body{background-attachment:scroll}" +
    "html.tv .blob{animation:none}" +
    "@keyframes faGlow{0%,100%{box-shadow:0 0 0 0 rgba(23,166,115,.55)}70%{box-shadow:0 0 0 10px rgba(23,166,115,0)}}";
  (document.head || root).appendChild(css);

  /* ---------------- UI chrome ---------------- */
  var ring = el("div", { id: "tvRing" });
  var bar = el("div", { id: "tvBar" });
  bar.innerHTML =
    (hubPage() ? '<span class="k" style="opacity:.92">Hold <b>☰</b> → “Use game controls”</span>' : '') +
    '<span class="k">✥ <span style="margin-left:2px">Move</span></span>' +
    '<span class="k"><b>A</b> Pick</span>' +
    '<span class="k"><b>B</b> Back</span>';
  var toggleWrap = el("div", { id: "tvToggle" });
  var tvBtn = el("button", { type: "button" });
  var padBtn = el("button", { type: "button" });
  toggleWrap.appendChild(tvBtn);
  toggleWrap.appendChild(padBtn);
  var mount = function () {
    document.body.appendChild(ring);
    document.body.appendChild(bar);
    document.body.appendChild(toggleWrap);
    refreshToggles();
  };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  /* ---------------- TV mode state ---------------- */
  var isHub = hubPage();
  var savedPad = read(LS_PAD);
  // Controller focus-ring nav: default ON for the HUB menu (so the stick / D-pad walks the game
  // list and Ⓐ launches, once the pad is in Xbox "game controls" mode) — default OFF inside games
  // (rely on Edge's native cursor there, avoiding the double-fire that could pop "Leave game?" on
  // trace-stars). An explicit 🎮 toggle is remembered and always wins.
  var tvOn = false, padNav = (savedPad != null) ? (savedPad === "1") : isHub;
  function setTV(on, remember) {
    tvOn = !!on;
    root.classList.toggle("tv", tvOn);
    root.classList.toggle("padnav", tvOn && padNav);
    if (remember) write(LS_TV, tvOn ? "1" : "0");
    if (tvOn && padNav && !cur) focusFirst();
    if (!tvOn) hideRing();
    refreshToggles();
  }
  function setPadNav(on, remember) {
    padNav = !!on;
    root.classList.toggle("padnav", tvOn && padNav);
    if (remember) write(LS_PAD, padNav ? "1" : "0");
    if (tvOn && padNav && !cur) focusFirst(); else if (!padNav) hideRing();
    refreshToggles();
  }
  function refreshToggles() {
    if (!document.body) return;
    tvBtn.textContent = tvOn ? "📺 TV on" : "📺 TV mode";
    tvBtn.className = tvOn ? "" : "off";
    padBtn.textContent = padNav ? "🎮 Controller" : "🎮 Off";
    padBtn.className = padNav ? "" : "off";
    padBtn.style.display = tvOn ? "" : "none";
    // show the toggle group on big screens, when a pad is present, or when TV is on
    var show = tvOn || gamepadPresent() || window.innerWidth >= 1100;
    toggleWrap.style.display = show ? "flex" : "none";
  }
  tvBtn.addEventListener("click", function () { setTV(!tvOn, true); });
  padBtn.addEventListener("click", function () { setPadNav(!padNav, true); });
  window.addEventListener("resize", refreshToggles);

  // initial TV state: explicit ?tv=, else saved pref, else off (gamepad connect flips it on)
  var q = (location.search.match(/[?&]tv=([01])/) || [])[1];
  if (q != null) setTV(q === "1", true);
  else if (read(LS_TV) === "1") setTV(true, false);
  else setTV(false, false);

  /* ---------------- focusable discovery + spatial nav ---------------- */
  var cur = null;
  var SEL = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusables() {
    var out = [], list = document.querySelectorAll(SEL);
    for (var i = 0; i < list.length; i++) { var e = list[i]; if (visible(e) && !isChrome(e)) out.push(e); }
    return out;
  }
  function isChrome(e) { return e === tvBtn || e === padBtn || toggleWrap.contains(e); }
  function visible(e) {
    // "reachable", not "on-screen": off-screen cards stay navigable (we scroll to them).
    if (e.offsetParent === null && e.getClientRects().length === 0) return false;
    var r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var cs = getComputedStyle(e);
    return cs.visibility !== "hidden" && cs.pointerEvents !== "none" && cs.display !== "none";
  }
  function center(e) { var r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r }; }

  function setCur(e, scroll) {
    cur = e;
    if (!e) { hideRing(); return; }
    try { e.focus({ preventScroll: true }); } catch (_) {}
    if (scroll !== false) { try { e.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); } catch (_) { try { e.scrollIntoView(); } catch (__) {} } }
    placeRing();
  }
  function placeRing() {
    if (!cur || !tvOn || !padNav) { hideRing(); return; }
    var r = cur.getBoundingClientRect(), pad = 6;
    ring.style.width = (r.width + pad * 2) + "px";
    ring.style.height = (r.height + pad * 2) + "px";
    ring.style.transform = "translate(" + (r.left - pad) + "px," + (r.top - pad) + "px)";
    ring.classList.add("on");
  }
  function hideRing() { ring.classList.remove("on"); }
  function focusFirst() {
    var list = focusables();
    if (!list.length) return;
    // prefer a primary action: a game card, a big Play button, else first
    var pref = null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], c = (e.className || "") + "";
      if (/\bgame\b/.test(c) || /\bbig\b/.test(c)) { pref = e; break; }
    }
    setCur(pref || list[0]);
  }
  function nav(dir) {
    var list = focusables();
    if (!list.length) return;
    if (!cur || list.indexOf(cur) === -1) { focusFirst(); return; }
    var a = center(cur), best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (e === cur) continue;
      var b = center(e), dx = b.x - a.x, dy = b.y - a.y, ok = false, primary = 0, secondary = 0;
      if (dir === "right") { ok = dx > 8; primary = dx; secondary = Math.abs(dy); }
      else if (dir === "left") { ok = dx < -8; primary = -dx; secondary = Math.abs(dy); }
      else if (dir === "down") { ok = dy > 8; primary = dy; secondary = Math.abs(dx); }
      else if (dir === "up") { ok = dy < -8; primary = -dy; secondary = Math.abs(dx); }
      if (!ok) continue;
      var score = primary + secondary * 2.2;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) setCur(best);
  }
  function activate() {
    if (!cur) { focusFirst(); return; }
    try { cur.click(); } catch (_) {}
  }
  function goBack() {
    var back = document.querySelector('a[href="../index.html"],a[href="../"],a[href="./index.html"]');
    if (!back) {
      var as = document.querySelectorAll("a[href]");
      for (var i = 0; i < as.length; i++) { if (/arcade/i.test(as[i].textContent || "")) { back = as[i]; break; } }
    }
    if (back) { try { back.click(); return; } catch (_) {} }
    if (history.length > 1) history.back();
  }

  // keep the ring glued to its element as layouts shift / screens change
  window.addEventListener("scroll", placeRing, true);
  window.addEventListener("resize", placeRing);
  var mo = new MutationObserver(function () {
    if (!(tvOn && padNav)) return;          // ring is off (e.g. inside a game) — do no per-mutation work
    if (cur && (!cur.isConnected || !visible(cur))) { cur = null; focusFirst(); }
    else placeRing();
  });
  try { mo.observe(document.documentElement, { attributes: true, childList: true, subtree: true, attributeFilter: ["class", "style", "hidden", "disabled"] }); } catch (_) {}

  /* ---------------- gamepad loop ---------------- */
  var prevBtn = {}, axisHeld = { dir: null, t: 0, started: false }, FIRST = 320, REPEAT = 150, raf = null;
  function gamepadPresent() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) if (pads[i]) return true;
    return false;
  }
  function firstPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) if (pads[i]) return pads[i];
    return null;
  }
  function pressed(p, i) { return !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5)); }
  function edge(p, i, name) { var now = pressed(p, i), was = prevBtn[name]; prevBtn[name] = now; return now && !was; }

  function tick(ts) {
    raf = requestAnimationFrame(tick);
    var p = firstPad();
    if (!p) return;
    if (!padNav || !tvOn) {
      // still let a button-press on a connected pad turn TV mode on the first time
      if (anyPressed(p)) { if (!tvOn) setTV(true, true); if (!padNav) { /* leave off if user disabled */ } }
      if (!padNav || !tvOn) return;
    }
    // direction from D-pad or left stick
    var dir = null;
    if (pressed(p, 12)) dir = "up"; else if (pressed(p, 13)) dir = "down";
    else if (pressed(p, 14)) dir = "left"; else if (pressed(p, 15)) dir = "right";
    if (!dir) {
      var ax = p.axes[0] || 0, ay = p.axes[1] || 0, dz = 0.55;
      if (Math.abs(ax) > Math.abs(ay)) { if (ax > dz) dir = "right"; else if (ax < -dz) dir = "left"; }
      else { if (ay > dz) dir = "down"; else if (ay < -dz) dir = "up"; }
    }
    if (dir) {
      if (axisHeld.dir !== dir) { axisHeld.dir = dir; axisHeld.t = ts; nav(dir); }
      else if (ts - axisHeld.t > (axisHeld.started ? REPEAT : FIRST)) { axisHeld.t = ts; axisHeld.started = true; nav(dir); }
    } else { axisHeld.dir = null; axisHeld.started = false; }
    // buttons: A(0) pick, B(1) back, LB(4)/RB(5) page scroll, Menu(9) back too
    if (edge(p, 0, "A")) activate();
    if (edge(p, 1, "B")) goBack();
    if (edge(p, 9, "menu")) goBack();
    if (edge(p, 4, "LB")) window.scrollBy({ top: -window.innerHeight * 0.6, behavior: "smooth" });
    if (edge(p, 5, "RB")) window.scrollBy({ top: window.innerHeight * 0.6, behavior: "smooth" });
  }
  function anyPressed(p) { for (var i = 0; i < p.buttons.length; i++) if (pressed(p, i)) return true; return false; }

  window.addEventListener("gamepadconnected", function () {
    if (!tvOn) setTV(true, true);           // a controller means they're on a TV — turn TV mode on
    refreshToggles();
    if (tvOn && padNav) focusFirst();
  });
  window.addEventListener("gamepaddisconnected", refreshToggles);
  if (gamepadPresent()) { if (!tvOn) setTV(true, true); }
  raf = requestAnimationFrame(tick);

  /* ---------------- tiny helpers ---------------- */
  function hubPage() { try { return document.querySelectorAll("a.game").length >= 3; } catch (_) { return false; } }
  function el(tag, attrs) { var e = document.createElement(tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function read(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  /* ---------------- Family Arcade: "earn David" unlock ---------------- */
  // Finish FA_NEED learning games -> unlock David Co-op Quest for FA_REWARD_MS.
  // Shares (same-origin) localStorage with david/index.html's own gate.
  var FA_DONE = "fa_quests_done", FA_UNTIL = "fa_unlock_until", FA_NEED = 3, FA_REWARD_MS = 30 * 60 * 1000;
  // Stars per game, by how much learning it is (folder name -> stars). Finishing ANY game awards its
  // stars; collect FA_NEED to unlock David. Big games (typing, math) alone are enough.
  var FA_WEIGHTS = { "type-quest": 3, "number-stackers": 3, "flip-find": 2, "clock-coins": 2, "wild-world": 2, "world-hop": 2, "brain-buddies": 2, "trace-stars": 2, "story-spinner": 2, "sound-pop": 1, "pattern-party": 1, "tap-a-tune": 1, "feelings-friends": 1 };
  function faWeight() { var p = (location.pathname || "").toLowerCase(); for (var k in FA_WEIGHTS) { if (p.indexOf(k) !== -1) return FA_WEIGHTS[k]; } return 1; }
  function faGet(k) { try { return parseInt(localStorage.getItem(k) || "0", 10) || 0; } catch (_) { return 0; } }
  function faSet(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }
  function faUnlocked() { return Date.now() < faGet(FA_UNTIL); }
  function faMinsLeft() { return Math.max(0, Math.ceil((faGet(FA_UNTIL) - Date.now()) / 60000)); }
  function faToast(msg) {
    try {
      var tt = document.createElement("div");
      tt.textContent = msg;
      tt.style.cssText = "position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147483600;background:#2f9e5e;color:#fff;font-weight:800;font-size:16px;padding:11px 20px;border-radius:999px;box-shadow:0 10px 26px rgba(0,0,0,.4);max-width:92vw;text-align:center;pointer-events:none;font-family:inherit";
      (document.body || root).appendChild(tt);
      setTimeout(function () { tt.style.transition = "opacity .6s"; tt.style.opacity = "0"; setTimeout(function () { try { tt.remove(); } catch (_) {} }, 650); }, 3400);
    } catch (_) {}
  }
  function faCelebrate() {
    // Big, unmissable unlock moment (in the game that earned the 3rd star), with a direct Play-David button + spoken cheer.
    try {
      var ov = document.createElement("div");
      ov.id = "faWin";
      ov.style.cssText = "position:fixed;inset:0;z-index:2147483640;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;background:radial-gradient(120% 120% at 50% 30%,rgba(26,39,64,.97),rgba(11,23,38,.98));color:#f4ecda;font-family:inherit";
      ov.innerHTML =
        '<div style="font-size:72px;line-height:1;margin-bottom:6px">🎉🐑⚔️</div>' +
        '<div style="font-weight:900;font-size:clamp(26px,6vw,44px);color:#ffe27a">You unlocked David!</div>' +
        '<div style="font-size:clamp(16px,3.6vw,22px);margin:12px 0 22px;max-width:28ch;line-height:1.5">You collected <b>3 ⭐</b> — play David Co-op Quest for <b>30 minutes</b>!</div>';
      var go = document.createElement("a");
      go.href = "../david/";
      go.innerHTML = "🐑 Play David ▶️";
      go.style.cssText = "font:900 22px inherit;color:#241a12;background:linear-gradient(180deg,#f7d271,#e0a92e);border-radius:14px;padding:16px 34px;text-decoration:none;box-shadow:0 7px 0 #9c7318;margin-bottom:16px";
      var stay = document.createElement("button");
      stay.type = "button";
      stay.textContent = "Keep playing here";
      stay.style.cssText = "font:800 15px inherit;color:#cdd6e6;background:transparent;border:0;cursor:pointer;text-decoration:underline";
      stay.onclick = function () { try { ov.remove(); } catch (_) {} };
      ov.appendChild(go); ov.appendChild(stay);
      (document.body || root).appendChild(ov);
      try { if (window.speechSynthesis) { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance("You unlocked David! Great job! You can play for thirty minutes."); u.rate = 0.95; speechSynthesis.speak(u); } } catch (_) {}
    } catch (_) {}
  }
  if (isHub) {
    // paint the David tile's lock / unlock state and keep it fresh
    var faPaintTile = function () {
      var tile = document.querySelector('a.game[href="./david/"], a.game[href="./david/index.html"], a.game[href="./david"]');
      if (!tile) return;
      var play = tile.querySelector(".play");
      var badge = tile.querySelector(".fa-lockbadge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "fa-lockbadge";
        badge.style.cssText = "position:absolute;top:-13px;right:16px;font-size:12px;font-weight:800;color:#fff;border-radius:999px;padding:3px 11px;box-shadow:0 4px 7px rgba(0,0,0,.18)";
        tile.appendChild(badge);
      }
      if (faUnlocked()) {
        badge.textContent = "✓ Unlocked · " + faMinsLeft() + "m";
        badge.style.background = "#17a673";
        badge.style.animation = "faGlow 1.8s ease-out infinite";
        if (play) play.textContent = "Play David ▶️";
      } else {
        var done = faGet(FA_DONE);
        badge.textContent = "🔒 " + done + " / " + FA_NEED + " ⭐";
        badge.style.background = "#8a7fb0";
        badge.style.animation = "";
        if (play) play.textContent = "Collect " + (FA_NEED - done) + " ⭐";
      }
    };
    faPaintTile();
    setInterval(faPaintTile, 20000);
    window.addEventListener("focus", faPaintTile);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) faPaintTile(); });
  } else {
    // a learning game: count ONE completion the first time its win screen appears
    var faCounted = false;
    var faCheckWin = function () {
      if (faCounted) return;
      var a = document.querySelector(".screen.active");
      if (!a || (a.id || "").toLowerCase().indexOf("win") === -1) return;
      faCounted = true;
      if (faUnlocked()) return;              // already inside a reward window; don't re-count
      var w = faWeight();
      var done = faGet(FA_DONE) + w;
      if (done >= FA_NEED) {
        faSet(FA_DONE, 0);
        faSet(FA_UNTIL, Date.now() + FA_REWARD_MS);
        faCelebrate();
      } else {
        faSet(FA_DONE, done);
        faToast("⭐ +" + w + " — " + done + " of " + FA_NEED + " stars, " + (FA_NEED - done) + " more to unlock David!");
      }
    };
    try {
      var faScreens = document.querySelectorAll(".screen");
      var faWinMo = new MutationObserver(faCheckWin);
      for (var fi = 0; fi < faScreens.length; fi++) faWinMo.observe(faScreens[fi], { attributes: true, attributeFilter: ["class"] });
    } catch (_) {}
    faCheckWin();
  }

  /* ---------------- test / debug API ---------------- */
  window.__arcadeTV = {
    nav: nav, activate: activate, back: goBack, focusFirst: focusFirst,
    setTV: setTV, setPadNav: setPadNav,
    get current() { return cur; }, focusables: focusables,
    state: function () { return { tvOn: tvOn, padNav: padNav, gamepad: gamepadPresent(), current: cur && (cur.textContent || cur.getAttribute("href") || cur.tagName).slice(0, 40), count: focusables().length }; }
  };
})();
