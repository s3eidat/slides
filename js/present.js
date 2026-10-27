/* Slides show: full-screen audience view, presenter view (current, next, notes, timer) and an optional
   audience window (same origin, opened from a click) for a projector. All three follow one SL.core.Show
   state machine, so they can never disagree. Transitions are CSS; entrance animations are drawn per frame. */
(function () {
  "use strict";
  const SL = window.SL, C = SL.core, R = SL.render, h = S3.h;
  const PR = SL.present = { active: false };
  let show = null, deck = null, mode = "", aud = null, ext = null, pres = null, onEnd = null, digits = "", tick = 0, wasFull = false;
  const timer = { start: 0, acc: 0, running: false };

  // ---------- a screen: two stacked canvases (for transitions) + a blank/end overlay, letterboxed in a host ----------
  function Screen(doc, host) {
    this.doc = doc; this.host = host; this.win = doc.defaultView || window;
    const S = (el, css) => { Object.assign(el.style, css); return el; };
    this.wrap = S(doc.createElement("div"), { position: "absolute", inset: "0", background: "#000", overflow: "hidden" });
    this.cv = [0, 1].map(() => S(doc.createElement("canvas"), { position: "absolute", left: "0", top: "0", display: "block", willChange: "transform, opacity" }));
    this.cover = S(doc.createElement("div"), { position: "absolute", inset: "0", display: "none", zIndex: "5", color: "#bbb", font: "500 18px Inter, system-ui, sans-serif",
      alignItems: "center", justifyContent: "center", textAlign: "center", padding: "20px" });
    this.cv.forEach(c => this.wrap.appendChild(c)); this.wrap.appendChild(this.cover); host.appendChild(this.wrap);
    this.front = 0; this.raf = 0; this.box = { x: 0, y: 0, w: 1, h: 1 };
    this.layout();
  }
  Screen.prototype.layout = function () {
    const r = this.host.getBoundingClientRect(), D = C.dims(deck), k = Math.min(r.width / D.w, r.height / D.h) || 0.1;
    const w = Math.floor(D.w * k), hh = Math.floor(D.h * k), dpr = this.win.devicePixelRatio || 1;
    this.box = { x: Math.floor((r.width - w) / 2), y: Math.floor((r.height - hh) / 2), w: w, h: hh };
    this.cv.forEach(c => { c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(hh * dpr)); Object.assign(c.style, { left: this.box.x + "px", top: this.box.y + "px", width: w + "px", height: hh + "px" }); });
  };
  Screen.prototype.paint = function (c, st, p) { R.paintInto(c, deck, deck.slides[st.slide], { step: st.step, p: p == null ? 1 : p }); };
  Screen.prototype.overlay = function (st) {
    const c = this.cover;
    if (st.blank) { c.style.display = "flex"; c.style.background = st.blank === "white" ? "#fff" : "#000"; c.textContent = ""; }
    else if (st.ended) { c.style.display = "flex"; c.style.background = "#000"; c.textContent = "End of slide show. Press Esc to exit."; }
    else c.style.display = "none";
  };
  // how: "slide" (forward, with the incoming slide's transition), "step" (animate the newest group), else instant
  Screen.prototype.render = function (st, how) {
    cancelAnimationFrame(this.raf);
    this.overlay(st);
    if (st.ended) return;
    const sl = deck.slides[st.slide], tr = sl.transition || { type: "none" };
    if (how === "slide" && tr.type !== "none") {
      const old = this.cv[this.front], nw = this.cv[1 - this.front]; this.front = 1 - this.front;
      this.paint(nw, st, 1);
      const d = Math.max(0.1, tr.dur || 0.6) + "s";
      [old, nw].forEach(c => { c.style.transition = "none"; c.style.transform = "none"; c.style.opacity = "1"; });
      old.style.zIndex = "1"; nw.style.zIndex = "2";
      if (tr.type === "fade") nw.style.opacity = "0";
      if (tr.type === "slide" || tr.type === "push") nw.style.transform = "translateX(100%)";
      if (tr.type === "zoom") { nw.style.transform = "scale(0.82)"; nw.style.opacity = "0"; }
      void nw.offsetWidth;
      const ease = "cubic-bezier(.2,.75,.2,1)";
      nw.style.transition = "opacity " + d + " " + ease + ", transform " + d + " " + ease; nw.style.opacity = "1"; nw.style.transform = "none";
      if (tr.type === "push") { old.style.transition = "transform " + d + " " + ease; old.style.transform = "translateX(-100%)"; }
      return;
    }
    const c = this.cv[this.front];
    this.cv.forEach(x => { x.style.transition = "none"; x.style.transform = "none"; x.style.opacity = "1"; x.style.zIndex = x === c ? "2" : "1"; });
    if (how === "step") {
      const t0 = performance.now(), dur = 560, frame = now => {
        const p = Math.min(1, (now - t0) / dur); this.paint(c, st, p);
        if (p < 1) this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame); this.paint(c, st, 0);
    } else this.paint(c, st, 1);
  };

  // ---------- navigation ----------
  function update(how) {
    const st = show.state();
    if (aud) aud.render(st, how);
    if (ext && !ext.win.closed) ext.scr.render(st, how);
    if (pres) renderPresenter(st);
  }
  function act(kind) {
    let r = null;
    if (kind === "next") r = show.next();
    else if (kind === "prev") r = show.prev();
    else if (kind === "first") r = show.first();
    else if (kind === "last") r = show.last();
    else if (kind === "black" || kind === "white") r = show.toggleBlank(kind);
    if (r) update(r === "slide" ? "slide" : r === "step" ? "step" : "instant");
  }
  function onKey(e) {
    if (!PR.active) return;
    const k = e.key, tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let used = true;
    if (/^[0-9]$/.test(k)) { digits = (digits + k).slice(-4); }
    else if (k === "Enter" && digits) { const n = parseInt(digits, 10); digits = ""; if (n > 0 && show.gotoNumber(n)) update("instant"); }
    else if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " " || k === "Enter" || k === "n" || k === "N") act("next");
    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "Backspace" || k === "p" || k === "P") act("prev");
    else if (k === "Home") act("first");
    else if (k === "End") act("last");
    else if (k === "b" || k === "B" || k === ".") act("black");
    else if (k === "w" || k === "W" || k === ",") act("white");
    else if (k === "Escape") stop();
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); if (!/^[0-9]$/.test(k)) digits = ""; }
  }
  function pointerNav(el) {
    let sx = 0, sy = 0, down = false;
    el.addEventListener("pointerdown", e => { down = true; sx = e.clientX; sy = e.clientY; });
    el.addEventListener("pointerup", e => {
      if (!down) return; down = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? "next" : "prev");
      else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) act(e.button === 2 ? "prev" : "next");
    });
    el.addEventListener("contextmenu", e => { e.preventDefault(); });
  }
  function hideCursorOn(el, win) {
    let t = 0;
    const wake = () => { el.style.cursor = "default"; win.clearTimeout(t); t = win.setTimeout(() => { el.style.cursor = "none"; }, 1800); };
    el.addEventListener("pointermove", wake); wake();
  }

  // ---------- start / stop ----------
  function start(d, opts) {
    if (PR.active) stop();
    deck = d; opts = opts || {}; onEnd = opts.onEnd || null; digits = "";
    show = new C.Show(deck, opts.from || 0); mode = opts.presenter ? "presenter" : "audience"; PR.active = true; PR.show = show;
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", relayout);
    document.addEventListener("fullscreenchange", onFs);
    if (mode === "audience") {
      const host = h("div", { "class": "sl-show", role: "dialog", "aria-label": "Slide show. Arrows to move, Esc to exit." });
      document.body.appendChild(host);
      aud = new Screen(document, host); pointerNav(host); hideCursorOn(host, window);
      host.appendChild(hud());
      fullscreen(host);
      aud.layout(); update("instant");
    } else {
      buildPresenter(); timer.start = Date.now(); timer.acc = 0; timer.running = true;
      tick = setInterval(clock, 500); update("instant");
      if (opts.window) openAudience();
    }
    return show;
  }
  function fullscreen(el) {
    wasFull = false;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(() => { wasFull = true; }).catch(() => {});
  }
  function onFs() { if (!document.fullscreenElement && wasFull && mode === "audience") stop(); setTimeout(relayout, 60); }
  function relayout() { if (aud) aud.layout(); if (pres) { pres.cur.layout(); } if (PR.active) update("instant"); }
  function stop() {
    if (!PR.active) return;
    const last = show ? show.slideIndex() : 0;
    PR.active = false;
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", relayout);
    document.removeEventListener("fullscreenchange", onFs);
    clearInterval(tick);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    if (aud) { aud.host.remove(); aud = null; }
    if (pres) { pres.root.remove(); pres = null; }
    if (ext && !ext.win.closed) { try { ext.win.close(); } catch (e) { /* already gone */ } }
    ext = null; wasFull = false;
    if (onEnd) onEnd(last);
  }
  function hud() {
    const b = (label, icon, fn) => { const x = h("button", { type: "button", "class": "sl-hudb", title: label, "aria-label": label }); x.appendChild(svgIcon(icon)); x.addEventListener("click", e => { e.stopPropagation(); fn(); }); x.addEventListener("pointerup", e => e.stopPropagation()); x.addEventListener("pointerdown", e => e.stopPropagation()); return x; };
    return h("div", { "class": "sl-hud" }, [b("Previous (Left arrow)", "d-left", () => act("prev")), b("Next (Right arrow)", "d-right", () => act("next")),
      b("Black screen (B)", "d-black", () => act("black")), b("End show (Esc)", "i-x", stop)]);
  }
  function svgIcon(id) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"), u = document.createElementNS("http://www.w3.org/2000/svg", "use");
    s.setAttribute("class", "i"); s.setAttribute("aria-hidden", "true"); u.setAttribute("href", "#" + id); s.appendChild(u); return s;
  }

  // ---------- presenter view ----------
  function fmtTime(ms) { const s = Math.floor(ms / 1000), m = Math.floor(s / 60); return (m >= 60 ? Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0") : String(m).padStart(2, "0")) + ":" + String(s % 60).padStart(2, "0"); }
  function elapsed() { return timer.acc + (timer.running ? Date.now() - timer.start : 0); }
  function clock() {
    if (!pres) return;
    pres.time.textContent = fmtTime(elapsed());
    pres.clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (ext && ext.win.closed) { ext = null; pres.winBtn.lastChild.textContent = "Audience window"; }
  }
  function buildPresenter() {
    const btn = (label, icon, fn, cls, title) => { const b = h("button", { type: "button", "class": "btn small " + (cls || ""), title: title || label }); if (icon) b.appendChild(svgIcon(icon)); b.appendChild(h("span", { text: label })); b.addEventListener("click", fn); return b; };
    const time = h("b", { "class": "sl-time", text: "00:00", "aria-label": "Elapsed time" }), clockEl = h("span", { "class": "sl-clock faint" }), count = h("span", { "class": "sl-count" });
    const pause = btn("Pause", "i-pause", () => {
      if (timer.running) { timer.acc += Date.now() - timer.start; timer.running = false; pause.lastChild.textContent = "Resume"; }
      else { timer.start = Date.now(); timer.running = true; pause.lastChild.textContent = "Pause"; }
      clock();
    }, "ghost");
    const reset = btn("Reset", "i-refresh", () => { timer.acc = 0; timer.start = Date.now(); clock(); }, "ghost");
    const winBtn = btn("Audience window", "d-window", openAudience, "", "Open the slides in a second window for the projector");
    const fsBtn = btn("Full screen", "d-fit", () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else root.requestFullscreen().catch(() => {}); }, "ghost");
    const end = btn("End show", "i-x", stop, "primary", "End show (Esc)");
    const curHost = h("div", { "class": "sl-cur" }), nextHost = h("div", { "class": "sl-nextc" }), nextCv = document.createElement("canvas"); nextHost.appendChild(nextCv);
    const nextLabel = h("span", { "class": "sl-plabel", text: "Next" });
    let fs = S3.store("sl.notesize") || 20;
    const notes = h("div", { "class": "sl-pnotes", dir: "auto", tabindex: "0", "aria-label": "Speaker notes" });
    notes.style.fontSize = fs + "px";
    const size = d => { fs = Math.max(12, Math.min(48, fs + d)); notes.style.fontSize = fs + "px"; S3.store("sl.notesize", fs); };
    const nav = [btn("Previous", "d-left", () => act("prev"), "", "Previous (Left arrow / Page Up)"), btn("Next", "d-right", () => act("next"), "primary", "Next (Right arrow / Space / Page Down)"),
      btn("Black", "d-black", () => act("black"), "ghost", "Black screen (B)"), btn("White", "d-white", () => act("white"), "ghost", "White screen (W)")];
    const root = h("div", { "class": "sl-pres", role: "dialog", "aria-label": "Presenter view" }, [
      h("div", { "class": "sl-ptop" }, [time, pause, reset, clockEl, h("span", { "class": "grow" }), count, winBtn, fsBtn, end]),
      h("div", { "class": "sl-pbody" }, [
        h("div", { "class": "sl-pmain" }, [h("span", { "class": "sl-plabel", text: "Now" }), curHost]),
        h("div", { "class": "sl-pside" }, [nextLabel, nextHost,
          h("div", { "class": "row between sl-nhead" }, [h("span", { "class": "sl-plabel", text: "Notes" }), h("span", { "class": "row" }, [btn("A−", null, () => size(-2), "ghost", "Smaller notes"), btn("A+", null, () => size(2), "ghost", "Bigger notes")])]),
          notes])
      ]),
      h("div", { "class": "sl-pfoot" }, nav.concat([h("span", { "class": "grow" }), h("span", { "class": "faint sl-keys", text: "Arrows / Space / clicker · type a number + Enter to jump · B / W blank · Esc ends" })]))
    ]);
    document.body.appendChild(root);
    pres = { root: root, time: time, clock: clockEl, count: count, notes: notes, nextCv: nextCv, nextHost: nextHost, winBtn: winBtn, cur: new Screen(document, curHost) };
    pointerNav(curHost);
    clock();
  }
  function renderPresenter(st) {
    pres.cur.render(st, "instant");
    const sl = deck.slides[st.slide];
    pres.count.textContent = st.ended ? "End" : "Slide " + (st.pos + 1) + " / " + st.total + (show.stepCount() ? " · step " + st.step + " / " + show.stepCount() : "");
    pres.notes.textContent = st.ended ? "" : (sl.notes || "No notes for this slide.");
    pres.notes.classList.toggle("faint", !sl.notes);
    const nx = show.peek(), r = pres.nextHost.getBoundingClientRect(), D = C.dims(deck), k = Math.min(r.width / D.w, r.height / D.h) || 0.1, dpr = window.devicePixelRatio || 1, c = pres.nextCv;
    c.width = Math.max(1, Math.round(D.w * k * dpr)); c.height = Math.max(1, Math.round(D.h * k * dpr));
    c.style.width = Math.floor(D.w * k) + "px"; c.style.height = Math.floor(D.h * k) + "px";
    const x = c.getContext("2d");
    if (!nx || nx.end) { x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#000"; x.fillRect(0, 0, c.width, c.height); x.fillStyle = "#999"; x.font = (14 * dpr) + "px Inter, system-ui, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("End of slide show", c.width / 2, c.height / 2); }
    else R.paintInto(c, deck, deck.slides[nx.slide], { step: nx.step, p: 1 });
  }

  // ---------- audience window (for a projector): a same-origin blank window driven from here ----------
  function openAudience() {
    if (ext && !ext.win.closed) { ext.win.focus(); return; }
    const w = window.open("", "s3slides_audience", "popup=yes,width=1024,height=640");
    if (!w) { S3.toast("The browser blocked the new window. Allow pop-ups for this page and try again.", "error"); return; }
    const d = w.document;
    d.title = "Audience · " + deck.name;
    while (d.body.firstChild) d.body.removeChild(d.body.firstChild);
    Object.assign(d.body.style, { margin: "0", background: "#000", overflow: "hidden" });
    const host = d.createElement("div"); Object.assign(host.style, { position: "fixed", inset: "0" });
    const tip = d.createElement("div");
    Object.assign(tip.style, { position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: "9", padding: "8px 14px", borderRadius: "10px",
      background: "rgba(20,23,27,.85)", color: "#fff", font: "500 14px Inter, system-ui, sans-serif", pointerEvents: "none" });
    tip.textContent = "Move this window to the projector, then click it to go full screen.";
    d.body.appendChild(host); d.body.appendChild(tip);
    ext = { win: w, scr: new Screen(d, host) };
    d.addEventListener("keydown", onKey, true);
    host.addEventListener("click", () => {
      if (!d.fullscreenElement && d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().then(() => { tip.style.display = "none"; }).catch(() => {});
      else act("next");
    });
    hideCursorOn(host, w);
    w.addEventListener("resize", () => { if (ext) { ext.scr.layout(); ext.scr.render(show.state(), "instant"); } });
    w.addEventListener("pagehide", () => { ext = null; if (pres) pres.winBtn.lastChild.textContent = "Audience window"; });
    setTimeout(() => { if (ext) { ext.scr.layout(); ext.scr.render(show.state(), "instant"); } }, 60);
    if (pres) pres.winBtn.lastChild.textContent = "Focus audience window";
  }

  PR.start = start; PR.stop = stop; PR.act = act; PR.state = () => show && show.state();
})();
