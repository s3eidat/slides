/* Slides editor: filmstrip, canvas interaction (select, move, resize, rotate, snap), text editing with bullet
   levels, insert menus, format panel, themes/layouts, dialogs and keyboard shortcuts.
   The canvas interaction is adapted from Design Studio's editor. */
(function () {
  "use strict";
  const SL = window.SL, C = SL.core, R = SL.render, IO = SL.io, $ = S3.$, $$ = S3.$$, h = S3.h;
  const ED = SL.ed = {
    deck: null, si: 0, sel: [], zoom: 1, panX: 0, panY: 0, hist: new C.History(150), editing: null, hover: null,
    guides: [], marquee: null, label: null, clip: null, fonts: ["Inter"], snap: S3.store("sl.snap") !== false
  };
  const stage = $("#stage"), cv = $("#cv"), ctx = cv.getContext("2d"), ta = $("#textEdit"), notesEl = $("#notes");
  let dpr = 1, vw = 300, vh = 300;
  const slide = () => ED.deck.slides[ED.si];
  const D = () => C.dims(ED.deck);
  const baseTheme = () => C.theme(ED.deck);
  const th = () => SL.themeFor(baseTheme(), slide().layout);
  const selObjs = () => ED.sel.map(id => C.find(slide(), id)).filter(Boolean);
  const isTyping = el => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r1 = v => Math.round(v * 10) / 10;
  const SVGNS = "http://www.w3.org/2000/svg";
  function svgEl(attrs, inner) { const el = document.createElementNS(SVGNS, "svg"); for (const k in attrs) el.setAttribute(k, attrs[k]); if (inner) el.appendChild(inner); return el; }
  function icon(id) { const u = document.createElementNS(SVGNS, "use"); u.setAttribute("href", "#" + id); return svgEl({ "class": "i", "aria-hidden": "true" }, u); }
  function pathIcon(d) { const p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", d); return svgEl({ viewBox: "0 0 24 24", "aria-hidden": "true" }, p); }
  const fit1 = o => R.fitObj(o, th());

  // ================= view =================
  function resizeCanvas() {
    const r = stage.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1; vw = Math.max(50, r.width); vh = Math.max(50, r.height);
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); cv.style.width = vw + "px"; cv.style.height = vh + "px";
    if (!ED.userZoom && ED.deck) fit(); else { placeText(); draw(); }
  }
  function fit() {
    if (!ED.deck) return;
    const pad = vw < 500 ? 10 : 28, d = D();
    ED.zoom = clamp(Math.min((vw - pad * 2) / d.w, (vh - pad * 2) / d.h), 0.02, 8);
    ED.panX = (vw - d.w * ED.zoom) / 2; ED.panY = (vh - d.h * ED.zoom) / 2;
    ED.userZoom = false; zoomLabel(); placeText(); draw();
  }
  function toPage(sx, sy) { return { x: (sx - ED.panX) / ED.zoom, y: (sy - ED.panY) / ED.zoom }; }
  function toScreen(x, y) { return { x: x * ED.zoom + ED.panX, y: y * ED.zoom + ED.panY }; }
  function zoomAt(z, sx, sy) { z = clamp(z, 0.02, 8); const p = toPage(sx, sy); ED.userZoom = true; ED.zoom = z; ED.panX = sx - p.x * z; ED.panY = sy - p.y * z; zoomLabel(); placeText(); draw(); }
  function zoomLabel() { $("#zLabel").textContent = Math.round(ED.zoom * 100) + "%"; }
  function local(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(paint); }
  R.onImage = () => { draw(); thumbCache = {}; thumbsSoon(); };
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function paint() {
    raf = 0;
    const d = ED.deck; if (!d) return;
    const z = ED.zoom, accent = css("--accent") || "#3dd6d0", dd = D();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, vw, vh);
    ctx.save(); ctx.translate(ED.panX, ED.panY); ctx.scale(z, z);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 20; ctx.shadowOffsetY = 5; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dd.w, dd.h); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, dd.w, dd.h); ctx.clip();
    R.drawSlide(ctx, d, slide(), { editor: true, skip: ED.editing, zoom: z });
    ctx.restore(); ctx.restore();
    overlays(accent);
  }
  function screenPoly(o) { return C.corners(o).map(p => toScreen(p.x, p.y)); }
  function strokePoly(pts, color, w, dash) {
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.setLineDash(dash || []); ctx.lineWidth = w; ctx.strokeStyle = color; ctx.stroke(); ctx.setLineDash([]);
  }
  function lineBox(o) { return o.type === "line" ? { x: o.x, y: o.y + o.h / 2 - Math.max(o.h, 4 / ED.zoom) / 2, w: o.w, h: Math.max(o.h, 4 / ED.zoom), rot: o.rot } : o; }
  function overlays(accent) {
    const sel = selObjs();
    if (ED.hover && ED.sel.indexOf(ED.hover) < 0 && !ED.drag) { const o = C.find(slide(), ED.hover); if (o) strokePoly(screenPoly(lineBox(o)), accent, 1.5); }
    sel.forEach(o => strokePoly(screenPoly(lineBox(o)), o.locked ? "#9aa3ad" : accent, sel.length > 1 ? 1 : 1.5, o.locked ? [4, 3] : null));
    // animation order badges
    const st = C.steps(slide());
    if (st.count) slide().objects.forEach(o => {
      const g = st.map[o.id]; if (g == null) return;
      const p = toScreen(o.x, o.y), t = String(g + 1);
      ctx.fillStyle = accent; ctx.beginPath(); R.rrect(ctx, p.x - 2, p.y - 20, 18, 18, 4); ctx.fill();
      ctx.fillStyle = "#04201f"; ctx.font = "700 11px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(t, p.x + 7, p.y - 10.5);
    });
    if (ED.editing) return;
    if (sel.length > 1) strokePoly(screenPoly(C.unionBox(sel)), accent, 1, [5, 4]);
    handles().forEach(hd => {
      ctx.beginPath();
      if (hd.k === "rot") {
        ctx.arc(hd.x, hd.y, 7, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = accent; ctx.stroke();
        ctx.beginPath(); ctx.arc(hd.x, hd.y, 3.2, -2.4, 1.6); ctx.stroke();
      } else if (hd.k.length === 1) {
        ctx.save(); ctx.translate(hd.x, hd.y); ctx.rotate(hd.rot * Math.PI / 180);
        const vert = hd.k === "e" || hd.k === "w"; R.rrect(ctx, vert ? -3.5 : -9, vert ? -9 : -3.5, vert ? 7 : 18, vert ? 18 : 7, 3.5);
        ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.stroke(); ctx.restore();
      } else { ctx.arc(hd.x, hd.y, 6, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.stroke(); }
    });
    ctx.strokeStyle = "#ff3d8b"; ctx.lineWidth = 1;
    ED.guides.forEach(g => {
      ctx.beginPath();
      if (g.axis === "x") { const s = toScreen(g.at, 0); ctx.moveTo(Math.round(s.x) + 0.5, 0); ctx.lineTo(Math.round(s.x) + 0.5, vh); }
      else { const s = toScreen(0, g.at); ctx.moveTo(0, Math.round(s.y) + 0.5); ctx.lineTo(vw, Math.round(s.y) + 0.5); }
      ctx.stroke();
    });
    if (ED.marquee) {
      const m = ED.marquee, a = toScreen(m.x, m.y);
      ctx.fillStyle = "rgba(61,214,208,0.10)"; ctx.fillRect(a.x, a.y, m.w * ED.zoom, m.h * ED.zoom);
      ctx.strokeStyle = accent; ctx.strokeRect(a.x + 0.5, a.y + 0.5, m.w * ED.zoom, m.h * ED.zoom);
    }
    if (ED.label) {
      ctx.font = "600 12px Inter, system-ui, sans-serif"; const tw = ctx.measureText(ED.label.t).width + 14;
      const x = clamp(ED.label.x - tw / 2, 4, vw - tw - 4), y = clamp(ED.label.y, 4, vh - 26);
      ctx.fillStyle = "rgba(20,23,27,0.92)"; ctx.beginPath(); R.rrect(ctx, x, y, tw, 22, 6); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(ED.label.t, x + 7, y + 11.5);
    }
  }
  function kindsFor(o) {
    if (o.type === "line") return ["e", "w"];
    if ((o.type === "text" && o.autoH) || o.type === "table") return ["nw", "ne", "se", "sw", "e", "w"];
    return ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  }
  function handles() {
    const sel = selObjs().filter(o => !o.locked);
    if (!sel.length || sel.length !== ED.sel.length) return [];
    let o, kinds;
    if (sel.length === 1) {
      o = lineBox(sel[0]); kinds = kindsFor(sel[0]);
      if (sel[0].type !== "line" && (o.w * ED.zoom < 28 || o.h * ED.zoom < 28)) kinds = kinds.filter(k => k.length === 2);
    } else { o = C.unionBox(sel); o.rot = 0; kinds = ["nw", "ne", "se", "sw"]; }
    const c = C.center(o), r = o.rot || 0, P = { n: [0.5, 0], s: [0.5, 1], e: [1, 0.5], w: [0, 0.5], nw: [0, 0], ne: [1, 0], se: [1, 1], sw: [0, 1] };
    const out = kinds.map(k => { const p = C.rotPt(o.x + o.w * P[k][0], o.y + o.h * P[k][1], c.x, c.y, r), s = toScreen(p.x, p.y); return { k: k, x: s.x, y: s.y, rot: r }; });
    const top = C.rotPt(c.x, o.y, c.x, c.y, r), st = toScreen(top.x, top.y), ux = Math.sin(r * Math.PI / 180), uy = -Math.cos(r * Math.PI / 180);
    out.push({ k: "rot", x: st.x + ux * 28, y: st.y + uy * 28, rot: r });
    return out;
  }
  function handleAt(sx, sy) { const hs = handles(); for (let i = hs.length - 1; i >= 0; i--) if (Math.hypot(hs[i].x - sx, hs[i].y - sy) <= 11) return hs[i]; return null; }
  const CURS = ["ns-resize", "nesw-resize", "ew-resize", "nwse-resize"];
  function cursorFor(k, rot) { if (k === "rot") return "grab"; const b = { n: 0, ne: 1, e: 2, se: 3, s: 0, sw: 1, w: 2, nw: 3 }[k]; return CURS[(b + Math.round(((rot % 180) + 180) % 180 / 45)) % 4]; }

  // ================= history / saving =================
  let commitT = 0, saveT = 0;
  function commit() { clearTimeout(commitT); if (ED.hist.commit(ED.deck)) { dirty(); thumbsSoon(); } undoButtons(); }
  function commitSoon() { clearTimeout(commitT); commitT = setTimeout(commit, 400); }
  function undoButtons() { $("#btnUndo").disabled = !ED.hist.canUndo(); $("#btnRedo").disabled = !ED.hist.canRedo(); }
  function saveState(t, kind) { const s = $("#saveState"); s.textContent = t; s.className = "chip sl-save" + (kind ? " " + kind : ""); }
  function dirty() { saveState("Saving…"); clearTimeout(saveT); saveT = setTimeout(autosave, 700); }
  function thumbData(d) { try { const c = R.slideCanvas(d, d.slides[0], 240 / C.dims(d).w, {}); return c.toDataURL("image/jpeg", 0.7); } catch (e) { return ""; } }
  function autosave() {
    const d = ED.deck;
    return IO.store.put({ id: d.id, name: d.name, updated: Date.now(), count: d.slides.length, ratio: d.ratio, thumb: thumbData(d), deck: d })
      .then(() => { saveState("Saved on this device", "ok"); S3.store("sl.last", d.id); })
      .catch(() => saveState("Not saved: browser storage blocked", "warn"));
  }
  function undo() { finishText(); if (ED.hist.undo(ED.deck)) afterHistory(); }
  function redo() { finishText(); if (ED.hist.redo(ED.deck)) afterHistory(); }
  function afterHistory() {
    R.fitAll(ED.deck);
    ED.si = Math.min(ED.si, ED.deck.slides.length - 1);
    ED.sel = ED.sel.filter(id => C.find(slide(), id));
    $("#deckName").value = ED.deck.name;
    undoButtons(); dirty(); fitIfSizeChanged(); slideChanged();
  }
  let lastRatio = "";
  function fitIfSizeChanged() { if (ED.deck.ratio !== lastRatio) { lastRatio = ED.deck.ratio; fit(); } }

  // ================= open / new =================
  function openDeck(deck, opts) {
    finishText(); if (SL.present.active) SL.present.stop();
    ED.deck = deck; ED.si = 0; ED.sel = []; ED.hover = null; thumbCache = {};
    R.fitAll(deck); ED.hist.reset(deck); undoButtons();
    $("#deckName").value = deck.name; lastRatio = deck.ratio; fit();
    slideChanged();
    S3.store("sl.last", deck.id);
    if (!opts || !opts.quiet) saveState(opts && opts.saved ? "Saved on this device" : "Not saved yet", opts && opts.saved ? "ok" : "");
    if (opts && opts.save) autosave();
  }

  // ================= selection / slide change =================
  function select(ids) { ED.sel = ids; buildProps(); draw(); }
  function slideChanged() { notesEl.value = slide().notes || ""; renderStrip(); buildProps(); draw(); }
  function goSlide(i) {
    finishText();
    const n = clamp(i, 0, ED.deck.slides.length - 1); if (n === ED.si && ED.sel.length === 0) { renderStrip(); return; }
    ED.si = n; ED.sel = []; slideChanged(); scrollStrip();
  }

  // ================= pointer interaction =================
  const pointers = new Map();
  let spaceDown = false;
  cv.addEventListener("pointerdown", e => {
    stage.focus({ preventScroll: true });
    if (ED.editing) finishText();
    const s = local(e); pointers.set(e.pointerId, s);
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* fine */ }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      revertDrag(); ED.drag = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: ED.zoom, pa: toPage(mx, my) }; return;
    }
    if (e.button === 1 || spaceDown) { e.preventDefault(); ED.drag = { type: "pan", sx: s.x, sy: s.y, px: ED.panX, py: ED.panY }; cv.style.cursor = "grabbing"; return; }
    if (e.button !== 0) return;
    const p = toPage(s.x, s.y), hd = handleAt(s.x, s.y);
    if (hd) { startTransform(hd, p); return; }
    const o = C.hitTest(slide().objects, p.x, p.y, 3 / ED.zoom), multi = e.shiftKey || e.ctrlKey || e.metaKey;
    if (o) {
      const was = ED.sel.indexOf(o.id) >= 0;
      if (multi) { select(was ? ED.sel.filter(id => id !== o.id) : ED.sel.concat(o.id)); if (was) return; }
      else if (!was) select([o.id]);
      const items = selObjs().filter(x => !x.locked);
      ED.drag = { type: "move", start: p, was: was && !multi, id: o.id, moved: false, items: items.map(x => ({ o: x, x: x.x, y: x.y })),
        box: items.length ? C.unionBox(items) : null, targets: C.snapTargets(slide(), D().w, D().h, ED.sel) };
    } else {
      if (!multi && ED.sel.length) select([]);
      ED.drag = { type: "marquee", start: p, base: multi ? ED.sel.slice() : [] };
    }
  });
  function revertDrag() { const d = ED.drag; if (!d || !d.orig) return; d.orig.forEach(it => Object.assign(it.o, C.clone(it.state))); }
  function startTransform(hd, p) {
    const sel = selObjs();
    ED.drag = { type: hd.k === "rot" ? "rotate" : "resize", hd: hd.k, start: p, moved: false, orig: sel.map(o => ({ o: o, state: C.clone(o) })), box: sel.length > 1 ? C.unionBox(sel) : null };
    if (hd.k === "rot") { const b = sel.length > 1 ? ED.drag.box : sel[0], c = C.center(b); ED.drag.c = c; ED.drag.a0 = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI; }
  }
  cv.addEventListener("pointermove", e => {
    const s = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, s);
    const d = ED.drag;
    if (!d) { hover(s); return; }
    const p = toPage(s.x, s.y);
    if (d.type === "pinch") {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ED.zoom = clamp(d.z0 * dist / d.d0, 0.02, 8); ED.userZoom = true; ED.panX = mx - d.pa.x * ED.zoom; ED.panY = my - d.pa.y * ED.zoom; zoomLabel(); draw(); return;
    }
    if (d.type === "pan") { ED.userZoom = true; ED.panX = d.px + s.x - d.sx; ED.panY = d.py + s.y - d.sy; placeText(); draw(); return; }
    if (d.type === "marquee") {
      const m = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      ED.marquee = m;
      const hits = slide().objects.filter(o => !o.hidden && !o.locked && C.boxesIntersect(C.aabb(o), m)).map(o => o.id);
      ED.sel = d.base.concat(hits.filter(id => d.base.indexOf(id) < 0)); draw(); return;
    }
    if (d.type === "move") {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) * ED.zoom < 3) return;
      if (!d.box) return;
      d.moved = true;
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      ED.guides = [];
      if (ED.snap && !e.altKey) { const sn = C.snapBox({ x: d.box.x + dx, y: d.box.y + dy, w: d.box.w, h: d.box.h }, d.targets, 6 / ED.zoom); dx += sn.dx; dy += sn.dy; ED.guides = sn.guides; }
      d.items.forEach(it => { it.o.x = it.x + dx; it.o.y = it.y + dy; });
      ED.label = { t: "X " + Math.round(d.box.x + dx) + "  Y " + Math.round(d.box.y + dy), x: s.x, y: s.y + 22 };
      draw(); geomFields(); return;
    }
    d.moved = true;
    if (d.type === "resize") doResize(d, p, e.shiftKey, s);
    if (d.type === "rotate") doRotate(d, p, e.shiftKey, e.altKey, s);
    draw(); geomFields();
  });
  function scaleProps(o, k) {
    if (o.type === "text" || o.type === "table" || o.type === "chart") o.size = Math.max(1, o.size * k);
    if (o.type === "shape") { o.strokeW = (o.strokeW || 0) * k; o.radius = (o.radius || 0) * k; o.tsize = Math.max(1, (o.tsize || 36) * k); }
    if (o.type === "line") o.h = Math.max(0.5, o.h * k);
  }
  function doResize(d, p, shift, s) {
    if (d.orig.length === 1) {
      const o = d.orig[0].o, st = d.orig[0].state, corner = d.hd.length === 2;
      const flowing = (o.type === "text" && o.autoH) || o.type === "table";
      const keepDefault = o.type === "image" || o.type === "icon";
      const keep = corner && (flowing || keepDefault !== shift);
      const nb = C.resizeBox(st, d.hd, p, keep, 2);
      if (flowing) {
        if (corner) { const k = nb.w / st.w; o.size = Math.max(1, st.size * k); Object.assign(o, nb); fit1(o); }
        else { o.w = nb.w; o.x = nb.x; fit1(o); if (!st.rot) o.y = st.y; else { const c = C.center(nb); o.y = c.y - o.h / 2; o.x = c.x - o.w / 2; } }
      } else if (o.type === "line") { o.x = nb.x; o.y = nb.y; o.w = nb.w; }
      else Object.assign(o, nb);
      ED.label = { t: Math.round(o.w) + " × " + Math.round(o.h), x: s.x, y: s.y + 22 };
    } else {
      const B = d.box, nb = C.resizeBox({ x: B.x, y: B.y, w: B.w, h: B.h, rot: 0 }, d.hd, p, true, 4), k = nb.w / B.w;
      const ax = d.hd.indexOf("w") >= 0 ? B.x + B.w : B.x, ay = d.hd.indexOf("n") >= 0 ? B.y + B.h : B.y;
      const nax = d.hd.indexOf("w") >= 0 ? nb.x + nb.w : nb.x, nay = d.hd.indexOf("n") >= 0 ? nb.y + nb.h : nb.y;
      d.orig.forEach(it => {
        const o = it.o, st = it.state; Object.assign(o, C.clone(st));
        const c = C.center(st), ncx = nax + (c.x - ax) * k, ncy = nay + (c.y - ay) * k;
        o.w = st.w * k; if (o.type !== "line") o.h = st.h * k;
        scaleProps(o, k); o.x = ncx - o.w / 2; o.y = ncy - o.h / 2;
        fit1(o); o.y = ncy - o.h / 2;
      });
      ED.label = { t: Math.round(nb.w) + " × " + Math.round(nb.h), x: s.x, y: s.y + 22 };
    }
  }
  function doRotate(d, p, shift, alt, s) {
    const a = Math.atan2(p.y - d.c.y, p.x - d.c.x) * 180 / Math.PI;
    if (d.orig.length === 1) {
      const o = d.orig[0].o; o.rot = C.snapAngle(a + 90, shift, alt); if (o.rot > 180) o.rot -= 360;
      ED.label = { t: r1(o.rot) + "°", x: s.x, y: s.y + 26 };
    } else {
      let da = a - d.a0; if (shift) da = Math.round(da / 15) * 15;
      d.orig.forEach(it => { const o = it.o, st = it.state, c = C.center(st), nc = C.rotPt(c.x, c.y, d.c.x, d.c.y, da); o.x = nc.x - st.w / 2; o.y = nc.y - st.h / 2; o.rot = ((st.rot || 0) + da) % 360; });
      ED.label = { t: Math.round(da) + "°", x: s.x, y: s.y + 26 };
    }
  }
  function endPointer(e) {
    pointers.delete(e.pointerId);
    const d = ED.drag; if (!d) return;
    if (d.type === "pinch") { if (pointers.size === 0) ED.drag = null; return; }
    ED.drag = null; ED.guides = []; ED.marquee = null; ED.label = null; cv.style.cursor = "";
    if (d.type === "marquee") buildProps();
    else if (d.moved && d.type !== "pan") { commit(); geomFields(); }
    else if (d.type === "move" && e.type === "pointerup" && ED.sel.length === 1) {
      const o = C.find(slide(), d.id);
      if (o && o.type === "text" && (d.was || (o.ph && !o.text.trim()))) startText(o);
    }
    draw();
  }
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);
  cv.addEventListener("pointerleave", () => { if (!ED.drag && ED.hover) { ED.hover = null; draw(); } });
  function hover(s) {
    if (spaceDown) { cv.style.cursor = "grab"; return; }
    const hd = handleAt(s.x, s.y);
    if (hd) { cv.style.cursor = cursorFor(hd.k, hd.rot); if (ED.hover) { ED.hover = null; draw(); } return; }
    const p = toPage(s.x, s.y), o = C.hitTest(slide().objects, p.x, p.y, 3 / ED.zoom), id = o ? o.id : null;
    cv.style.cursor = o ? (o.locked ? "default" : o.type === "text" && ED.sel.indexOf(o.id) >= 0 ? "text" : "move") : "default";
    if (id !== ED.hover) { ED.hover = id; draw(); }
  }
  cv.addEventListener("dblclick", e => {
    const s = local(e), p = toPage(s.x, s.y), o = C.hitTest(slide().objects, p.x, p.y, 3 / ED.zoom);
    if (!o) return;
    if (o.type === "text") startText(o);
    else if (o.type === "image" && !o.locked) pickImageFor(o.id);
    else if (o.type === "table" || o.type === "chart") { const f = $("#props .sl-grid input"); if (f) f.focus(); }
  });
  stage.addEventListener("wheel", e => {
    e.preventDefault();
    const s = local(e), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1;
    if (e.ctrlKey || e.metaKey) zoomAt(ED.zoom * Math.exp(-e.deltaY * unit * 0.0022), s.x, s.y);
    else if (ED.userZoom) { ED.panX -= (e.shiftKey ? e.deltaY : e.deltaX) * unit; ED.panY -= (e.shiftKey ? 0 : e.deltaY) * unit; placeText(); draw(); }
  }, { passive: false });
  stage.addEventListener("dragover", e => { if (e.dataTransfer && [...e.dataTransfer.types].indexOf("Files") >= 0) { e.preventDefault(); stage.classList.add("is-over"); } });
  stage.addEventListener("dragleave", () => stage.classList.remove("is-over"));
  stage.addEventListener("drop", e => {
    e.preventDefault(); stage.classList.remove("is-over");
    const files = [...(e.dataTransfer && e.dataTransfer.files || [])], s = local(e), p = toPage(s.x, s.y);
    const proj = files.find(f => /\.(s3slides|json)$/i.test(f.name));
    if (proj) { openFile(proj); return; }
    const imgs = files.filter(f => /^image\//.test(f.type) || /\.svg$/i.test(f.name)); if (!imgs.length) return;
    const t = C.hitTest(slide().objects, p.x, p.y, 0);
    addImageFiles(imgs, t && t.type === "image" && !t.locked ? t.id : null, p);
  });

  // ================= text editing: a textarea over the text box; Tab / Shift+Tab change the bullet level =================
  function startText(o) {
    if (!o || o.locked) return;
    ED.editing = o.id; ta.hidden = false; ta.value = o.text; placeText();
    ta.focus();
    if (o.ph && !o.text) ta.setSelectionRange(0, 0); else ta.select();
    draw();
  }
  function placeText() {
    if (!ED.editing) return;
    const o = C.find(slide(), ED.editing); if (!o) { finishText(); return; }
    const t = th(), z = ED.zoom, lay = R.layoutText(Object.assign({}, o, { text: o.text || " " }), t), top = o.autoH ? 0 : R.textTop(o, lay);
    const s = toScreen(o.x, o.y + top), col = C.resolve(t, o.color), bw = o.bullets === "bullet" ? lay.size * 0.95 : o.bullets === "number" ? lay.size * 1.55 : 0;
    Object.assign(ta.style, {
      left: s.x + "px", top: s.y + "px", width: Math.max(20, o.w * z) + "px", height: Math.max(lay.h, lay.lineH) * z + 4 + "px",
      font: R.fontCss(o, lay.size * z, t), lineHeight: String(o.lh || 1.2), letterSpacing: (o.ls || 0) * z + "px",
      color: typeof col === "string" ? col : col.c[0], textAlign: o.align, direction: lay.dir, tabSize: String(lay.size * 1.15 * z) + "px",
      paddingInlineStart: bw * z + "px", transformOrigin: (o.w * z / 2) + "px " + ((o.h / 2 - top) * z) + "px",
      transform: "rotate(" + (o.rot || 0) + "deg)", textDecoration: o.underline ? "underline" : "none"
    });
  }
  ta.addEventListener("input", () => {
    const o = C.find(slide(), ED.editing); if (!o) return;
    o.text = ta.value; fit1(o); placeText();
    const pt = $("#pText"); if (pt) pt.value = o.text;
  });
  function indentLines(dir) {
    const v = ta.value, a = ta.selectionStart, b = ta.selectionEnd;
    const start = v.lastIndexOf("\n", a - 1) + 1;
    let end = v.indexOf("\n", b); if (end < 0) end = v.length;
    let na = a, nb = b;
    const lines = v.slice(start, end).split("\n").map((ln, i) => {
      if (dir > 0) { if (/^\t{4}/.test(ln)) return ln; if (i === 0) na++; nb++; return "\t" + ln; }
      if (ln.charAt(0) !== "\t") return ln; if (i === 0) na = Math.max(start, na - 1); nb--; return ln.slice(1);
    });
    ta.value = v.slice(0, start) + lines.join("\n") + v.slice(end);
    ta.setSelectionRange(na, Math.max(na, nb));
    ta.dispatchEvent(new Event("input"));
  }
  ta.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Tab") { e.preventDefault(); indentLines(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); finishText(); stage.focus(); }
  });
  ta.addEventListener("blur", () => finishText());
  function finishText() {
    if (!ED.editing) return;
    const id = ED.editing; ED.editing = null; ta.hidden = true;
    const o = C.find(slide(), id);
    if (o && !o.ph && !o.text.trim()) { slide().objects = slide().objects.filter(x => x.id !== id); ED.sel = ED.sel.filter(x => x !== id); }
    commit(); buildProps(); draw();
  }

  // ================= object commands =================
  function addObject(o, opts) {
    slide().objects.push(o); fit1(o);
    if (!opts || !opts.keepPos) { o.x = (D().w - o.w) / 2; o.y = (D().h - o.h) / 2; }
    select([o.id]); commit(); return o;
  }
  function addText() {
    const t = th(), o = C.make("text", { text: "Text", size: (t.type && t.type.body) || 40, w: D().w * 0.4, color: "@text", font: "@body", dir: baseTheme().rtl ? "rtl" : "auto", align: baseTheme().rtl ? "right" : "left" });
    addObject(o); startText(o);
  }
  function addShape(shape) {
    const b = D().h * 0.3;
    addObject(C.make("shape", { shape: shape, w: shape === "arrow" ? b * 1.5 : b, h: shape === "arrow" ? b * 0.7 : b, fill: "@accent", tcolor: "@onaccent", tsize: Math.round(D().h * 0.035), radius: shape === "rect" ? Math.round(b * 0.08) : 0 }));
  }
  function addLine(kind) {
    const o = C.make("line", { w: D().w * 0.3, h: 6, stroke: "@text" });
    if (kind === "dash") o.dash = "dash"; if (kind === "dot") o.dash = "dot"; if (kind === "arrow" || kind === "double") o.end = "arrow"; if (kind === "double") o.start = "arrow";
    if (kind === "arrow" || kind === "double") o.stroke = "@accent";
    addObject(o);
  }
  function addIcon(name) { const b = D().h * 0.16; addObject(C.make("icon", { icon: name, w: b, h: b, color: "@accent", sw: 2 })); }
  function addTable(rows, cols) {
    const r = []; for (let i = 0; i < rows; i++) { const row = []; for (let j = 0; j < cols; j++) row.push(i === 0 ? "Column " + (j + 1) : ""); r.push(row); }
    addObject(C.make("table", { rows: r, w: Math.min(D().w * 0.86, cols * D().w * 0.2), size: Math.round(D().h * 0.026), header: true, band: true }));
  }
  function addChart(kind) {
    const data = kind === "pie" ? { labels: ["Product", "Services", "Support", "Other"], series: [{ name: "Share", values: [45, 25, 20, 10] }] }
      : { labels: ["Q1", "Q2", "Q3", "Q4"], series: [{ name: "2025", values: [12, 19, 15, 24] }, { name: "2026", values: [16, 22, 21, 30] }] };
    addObject(C.make("chart", { kind: kind, data: data, w: D().w * 0.62, h: D().h * 0.6, size: Math.round(D().h * 0.024), legend: true, values: kind !== "line" }));
  }
  function deleteSel() {
    const ids = selObjs().filter(o => !o.locked).map(o => o.id); if (!ids.length) return;
    slide().objects = slide().objects.filter(o => ids.indexOf(o.id) < 0); C.renumberAnims(slide()); select([]); commit();
  }
  function duplicateSel() {
    const sel = selObjs(); if (!sel.length) return;
    const off = D().h * 0.02, out = sel.map(o => { const c = C.cloneWithIds(o); c.x += off; c.y += off; c.locked = false; c.ph = ""; if (c.anim) c.anim.n = 1e4; return c; });
    slide().objects = slide().objects.concat(out); C.renumberAnims(slide()); select(out.map(o => o.id)); commit();
  }
  function copySel(cut) {
    const sel = selObjs(); if (!sel.length) return;
    const assets = {}; sel.forEach(o => { if (o.type === "image" && o.src && ED.deck.assets[o.src]) assets[o.src] = ED.deck.assets[o.src]; });
    ED.clip = { objs: C.clone(sel), assets: assets, n: 0 };
    if (cut) deleteSel(); else S3.toast(sel.length + (sel.length > 1 ? " objects" : " object") + " copied");
  }
  function paste() {
    if (!ED.clip) return;
    Object.keys(ED.clip.assets).forEach(k => { if (!ED.deck.assets[k]) ED.deck.assets[k] = ED.clip.assets[k]; });
    ED.clip.n++;
    const off = ED.clip.n * D().h * 0.02, out = ED.clip.objs.map(o => { const c = C.cloneWithIds(o); c.x += off; c.y += off; c.ph = ""; if (c.anim) c.anim.n = 1e4; return c; });
    slide().objects = slide().objects.concat(out); C.renumberAnims(slide()); out.forEach(fit1); select(out.map(o => o.id)); commit();
  }
  function order(dir) { if (!ED.sel.length) return; C.reorder(slide(), ED.sel, dir); commit(); draw(); }
  function toggleLock() { const sel = selObjs(); if (!sel.length) return; const lock = !sel.every(o => o.locked); sel.forEach(o => { o.locked = lock; }); commit(); buildProps(); draw(); }
  function nudge(dx, dy) { const sel = selObjs().filter(o => !o.locked); if (!sel.length) return; sel.forEach(o => { o.x += dx; o.y += dy; }); draw(); geomFields(); commitSoon(); }
  function alignSel(how) { const sel = selObjs().filter(o => !o.locked); if (!sel.length) return; C.align(sel, how, D().w, D().h); commit(); draw(); geomFields(); }
  function distributeSel(ax) { C.distribute(selObjs().filter(o => !o.locked), ax); commit(); draw(); }

  // ================= images =================
  const RASTER = /^image\/(png|jpeg|webp|gif)$/;
  function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Could not read this image")); im.src = src; }); }
  async function prepImage(file) {
    if (file.size > 60e6) throw new Error(file.name + " is larger than 60 MB");
    let url = await S3.readFile(file, "dataurl");
    const svg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
    if (!svg && !RASTER.test(file.type)) throw new Error(file.name + ": use PNG, JPG, WebP, GIF or SVG");
    if (svg) url = "data:image/svg+xml;base64," + url.split(",")[1];
    const im = await loadImg(url);
    let w = im.naturalWidth || 800, hh = im.naturalHeight || 600;
    const k = Math.min(1, 3000 / Math.max(w, hh)) * (svg ? Math.min(4, Math.max(1, 2000 / Math.max(w, hh))) : 1);
    if (svg || k < 1) {
      const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(hh * k);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      url = file.type === "image/jpeg" ? c.toDataURL("image/jpeg", 0.92) : c.toDataURL("image/png"); w = c.width; hh = c.height;
    }
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(url)) throw new Error("Unsupported image");
    return { url: url, w: w, h: hh };
  }
  async function addImageFiles(files, targetId, at) {
    let added = 0, last = null;
    for (const f of files) {
      try {
        const im = await prepImage(f), id = C.uid("a");
        ED.deck.assets[id] = im.url;
        const t = targetId ? C.find(slide(), targetId) : (added === 0 ? slide().objects.filter(o => o.type === "image" && o.ph && !o.src)[0] : null);
        if (t && added === 0) { t.src = id; last = t; }
        else {
          const k = Math.min(D().w * 0.5 / im.w, D().h * 0.6 / im.h), o = C.make("image", { src: id, w: im.w * k, h: im.h * k });
          const cx = at ? at.x : D().w / 2, cy = at ? at.y : D().h / 2;
          o.x = cx - o.w / 2 + added * 24; o.y = cy - o.h / 2 + added * 24; slide().objects.push(o); last = o;
        }
        added++;
      } catch (err) { S3.toast(err.message || String(err), "error"); }
    }
    if (last) { select([last.id]); commit(); draw(); }
  }
  let imgTarget = null;
  const imgInput = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg", hidden: true });
  document.body.appendChild(imgInput);
  imgInput.addEventListener("change", () => { const f = [...imgInput.files]; imgInput.value = ""; if (f.length) addImageFiles(f.slice(0, 1), imgTarget); });
  function pickImageFor(id) { imgTarget = id; imgInput.click(); }

  // ================= small form builders (format panel) =================
  const PAL = ["#111111", "#ffffff", "#6b7280", "#ef4444", "#f97316", "#ffd23f", "#22c55e", "#0e9f9a", "#3b82f6", "#8b5cf6", "#e0457b"];
  const ROLES = [["@text", "Text"], ["@head", "Heading"], ["@accent", "Accent 1"], ["@accent2", "Accent 2"], ["@accent3", "Accent 3"], ["@muted", "Muted"], ["@bg", "Background"], ["@bg2", "Background 2"], ["@onaccent", "On accent"]];
  function hex6(c) {
    c = C.resolve(th(), c); if (c && typeof c === "object") c = c.c[0];
    if (typeof c !== "string") return "#000000"; c = c.trim();
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
    if (/^#[0-9a-f]{6}/i.test(c)) return c.slice(0, 7).toLowerCase();
    if (m) return ("#" + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toLowerCase();
    m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(c);
    if (m) return "#" + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, "0")).join("");
    return "#000000";
  }
  function live(fn, now) { selObjs().forEach(o => { fn(o); fit1(o); }); draw(); geomFields(); if (now) commit(); else commitSoon(); }
  function fieldWrap(label, el, cls) { return h("label", { "class": "field sl-f" + (cls ? " " + cls : "") }, [h("span", { text: label }), el]); }
  function numIn(label, val, onSet, o) {
    o = o || {};
    const el = h("input", { "class": "input", type: "number", step: o.step || 1, value: r1(val), "data-geo": o.geo || null, inputmode: "decimal" });
    if (o.min != null) el.min = o.min; if (o.max != null) el.max = o.max;
    el.addEventListener("input", () => { const v = parseFloat(el.value); if (isFinite(v)) onSet(o.min != null ? Math.max(o.min, v) : v); });
    el.addEventListener("change", commit);
    return fieldWrap(label, el, "sl-num");
  }
  function rangeIn(label, val, min, max, step, onSet, fmt) {
    const out = h("output", { text: fmt ? fmt(val) : String(r1(val)) });
    const el = h("input", { type: "range", min: min, max: max, step: step, value: val, "aria-label": label });
    el.addEventListener("input", () => { const v = parseFloat(el.value); out.textContent = fmt ? fmt(v) : String(r1(v)); onSet(v); });
    el.addEventListener("change", commit);
    return h("label", { "class": "field sl-f sl-range" }, [h("span", { "class": "row between" }, [h("span", { text: label }), out]), el]);
  }
  function colorIn(label, val, onSet, opts) {
    opts = opts || {};
    const role = typeof val === "string" && val.charAt(0) === "@" ? ROLES.filter(r => r[0] === val)[0] : null;
    const pick = h("input", { type: "color", value: hex6(val), "aria-label": label });
    const txt = h("input", { "class": "input mono", value: role ? "Theme · " + role[1] : (typeof val === "string" ? val : ""), maxlength: 32, "aria-label": label + " (hex)", spellcheck: "false" });
    pick.addEventListener("input", () => { txt.value = pick.value; onSet(pick.value); });
    pick.addEventListener("change", commit);
    txt.addEventListener("change", () => { const v = txt.value.trim(); if (C.isColor(v)) { pick.value = hex6(v); onSet(v); commit(); } else if (opts.none && !v) { onSet(""); commit(); } else S3.toast("Use a colour like #ff8800", "error"); });
    const sw = h("div", { "class": "sl-sw" });
    const swatch = (c, title) => {
      const b = h("button", { type: "button", title: title, "aria-label": "Use " + title, style: "background:" + hex6(c), "class": c === val ? "on" : null });
      b.addEventListener("click", () => { pick.value = hex6(c); txt.value = c.charAt(0) === "@" ? "Theme · " + title.replace(/^Theme /, "") : c; onSet(c); commit(); $$("button", sw).forEach(x => x.classList.toggle("on", x === b)); });
      sw.appendChild(b);
    };
    if (opts.none) { const b = h("button", { type: "button", "class": "sl-none", title: "None", "aria-label": "No colour" }); b.addEventListener("click", () => { txt.value = ""; onSet(""); commit(); }); sw.appendChild(b); }
    ROLES.forEach(r => swatch(r[0], "Theme " + r[1]));
    sw.appendChild(h("i", { "class": "sl-swsep" }));
    PAL.forEach(c => swatch(c, c));
    return h("div", { "class": "sl-f" }, [h("span", { "class": "sl-flabel", text: label }), h("div", { "class": "sl-color" }, [pick, txt]), sw]);
  }
  function fillIn(label, val, onSet, allowNone) {
    const wrap = h("div", { "class": "stack sl-fill" });
    const mode = !val ? "none" : typeof val === "object" ? "grad" : "solid";
    const opts = [["solid", "Solid"], ["grad", "Gradient"]].concat(allowNone ? [["none", "None"]] : []);
    const inner = h("div", { "class": "stack" });
    const s = segIn(label, opts, mode, v => {
      const cur = typeof val === "object" && val ? val : null, c0 = cur ? cur.c[0] : (val || "@accent");
      val = v === "none" ? "" : v === "grad" ? { t: "lin", a: 135, c: [c0, cur ? cur.c[1] : "@accent2"] } : (cur ? cur.c[0] : c0);
      onSet(C.clone(val)); commit(); body();
    });
    function body() {
      inner.innerHTML = "";
      if (val && typeof val === "object") {
        inner.appendChild(colorIn("From", val.c[0], c => { val.c[0] = c; onSet(C.clone(val)); }));
        inner.appendChild(colorIn("To", val.c[1], c => { val.c[1] = c; onSet(C.clone(val)); }));
        inner.appendChild(rangeIn("Angle", val.a, 0, 360, 5, a => { val.a = a; onSet(C.clone(val)); }, v => Math.round(v) + "°"));
      } else if (val) inner.appendChild(colorIn("Colour", val, c => { val = c; onSet(c); }));
    }
    body(); wrap.appendChild(s); wrap.appendChild(inner);
    return wrap;
  }
  function segIn(label, opts, val, onSet) {
    const g = h("div", { "class": "seg sl-seg", role: "group", "aria-label": label || "Options" });
    opts.forEach(o => {
      const b = h("button", { type: "button", "aria-pressed": String(o[0] === val), title: o[2] || o[1] }, [o[3] ? icon(o[3]) : o[1]]);
      if (o[3]) b.setAttribute("aria-label", o[1]);
      b.addEventListener("click", () => { $$("button", g).forEach(x => x.setAttribute("aria-pressed", String(x === b))); onSet(o[0]); });
      g.appendChild(b);
    });
    return h("div", { "class": "sl-f" }, [label ? h("span", { "class": "sl-flabel", text: label }) : null, g]);
  }
  function selectIn(label, opts, val, onSet) {
    const el = h("select", { "class": "select" });
    opts.forEach(o => {
      if (o.group) { const og = h("optgroup", { label: o.group }); o.items.forEach(it => og.appendChild(h("option", { value: it[0], text: it[1], style: it[2] || null }))); el.appendChild(og); }
      else el.appendChild(h("option", { value: o[0], text: o[1] }));
    });
    el.value = val;
    el.addEventListener("change", () => { onSet(el.value); commit(); });
    return fieldWrap(label, el);
  }
  function toggleBtn(label, on, onSet, txt, cls) {
    const b = h("button", { type: "button", "class": "btn small sl-tg " + (cls || ""), "aria-pressed": String(!!on), title: label, "aria-label": label }, [h("b", { text: txt })]);
    b.addEventListener("click", () => { const v = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(v)); onSet(v); commit(); });
    return b;
  }
  function act(label, iconId, fn, disabled) {
    const b = h("button", { type: "button", "class": "btn ghost icon small", title: label, "aria-label": label, disabled: !!disabled }, [icon(iconId)]);
    b.addEventListener("click", fn); return b;
  }
  function textBtn(label, fn, cls, iconId) { const b = h("button", { type: "button", "class": "btn small " + (cls || "") }, [iconId ? icon(iconId) : null, label]); b.addEventListener("click", fn); return b; }
  function section(title, kids) { return h("section", { "class": "sl-sec" }, [title ? h("h3", { text: title }) : null].concat(kids)); }
  function geomFields() {
    const o = selObjs()[0]; if (!o || ED.sel.length !== 1) return;
    $$("[data-geo]").forEach(el => { if (document.activeElement === el) return; el.value = r1(o[el.getAttribute("data-geo")] || 0); });
  }

  // ================= format panel =================
  function buildProps() {
    const P = $("#props"); if (!P || !ED.deck) return;
    const keep = P.scrollTop;
    P.innerHTML = "";
    const sel = selObjs();
    if (!sel.length) { slideProps(P); P.scrollTop = keep; return; }
    const o = sel[0], one = sel.length === 1, same = sel.every(x => x.type === o.type);
    const names = { text: o.ph ? "Placeholder" : "Text box", shape: "Shape", line: "Line", icon: "Icon", image: "Picture", table: "Table", chart: "Chart" };
    const locked = sel.every(x => x.locked);
    P.appendChild(h("div", { "class": "row between sl-phead" }, [h("h2", { text: one ? names[o.type] : sel.length + " selected" }), h("div", { "class": "row sl-acts" }, [
      act("Duplicate (Ctrl+D)", "i-copy", duplicateSel), act(locked ? "Unlock" : "Lock (Ctrl+Shift+L)", locked ? "i-lock" : "d-unlock", toggleLock),
      act("Delete (Del)", "i-trash", deleteSel, locked)])]));
    if (locked) { P.appendChild(h("p", { "class": "faint sl-p", text: "Locked. Unlock it to move or edit." })); return; }
    if (same && o.type === "text") textProps(P, o);
    if (same && o.type === "shape") shapeProps(P, o);
    if (same && o.type === "line") lineProps(P, o);
    if (same && o.type === "icon") iconProps(P, o);
    if (same && o.type === "image") imageProps(P, o, one);
    if (one && o.type === "table") tableProps(P, o);
    if (one && o.type === "chart") chartProps(P, o);
    animProps(P, sel);
    const arr = [act("Bring forward (Ctrl+])", "d-up", () => order("up")), act("Send backward (Ctrl+[)", "d-down", () => order("down")),
      act("Bring to front (Ctrl+Shift+])", "d-front", () => order("top")), act("Send to back (Ctrl+Shift+[)", "d-back", () => order("bottom"))];
    const al = [["left", "d-al-l", "Align left"], ["hcenter", "d-al-c", "Align centre"], ["right", "d-al-r", "Align right"], ["top", "d-al-t", "Align top"], ["vcenter", "d-al-m", "Align middle"], ["bottom", "d-al-b", "Align bottom"]]
      .map(a => act(a[2] + (one ? " (to slide)" : ""), a[1], () => alignSel(a[0])));
    if (sel.length >= 3) { al.push(act("Distribute horizontally", "d-dist-h", () => distributeSel("h"))); al.push(act("Distribute vertically", "d-dist-v", () => distributeSel("v"))); }
    P.appendChild(section("Arrange", [h("div", { "class": "sl-btnrow" }, arr.concat(al))]));
    if (one) {
      const flowing = (o.type === "text" && o.autoH) || o.type === "table";
      P.appendChild(section("Position and size", [h("div", { "class": "sl-geo" }, [
        numIn("X", o.x, v => live(x => { x.x = v; }), { geo: "x" }), numIn("Y", o.y, v => live(x => { x.y = v; }), { geo: "y" }),
        numIn("W", o.w, v => live(x => { x.w = Math.max(1, v); }), { geo: "w", min: 1 }),
        flowing ? numIn("H", o.h, () => {}, { geo: "h" }) : numIn(o.type === "line" ? "Thick" : "H", o.h, v => live(x => { x.h = Math.max(0.5, v); }), { geo: "h", min: 0.5 }),
        numIn("Rotate°", o.rot || 0, v => live(x => { x.rot = v % 360; }), { geo: "rot", step: 0.1 }),
        h("div", { "class": "sl-f" }, [])
      ])]));
      if (flowing) { const hIn = $("[data-geo=h]", P); if (hIn) { hIn.disabled = true; hIn.title = "Height follows the content"; } }
    }
    P.appendChild(section("Opacity", [rangeIn("Transparency", Math.round((1 - (o.op == null ? 1 : o.op)) * 100), 0, 100, 1, v => live(x => { x.op = 1 - v / 100; }), v => Math.round(v) + "%")]));
    P.scrollTop = keep;
  }
  function fontOptions(cur) {
    const t = baseTheme(), dev = ED.fonts.slice();
    if (cur && cur.charAt(0) !== "@" && dev.indexOf(cur) < 0) dev.unshift(cur);
    return [{ group: "Theme fonts", items: [["@head", "Heading · " + t.fonts.head], ["@body", "Body · " + t.fonts.body]] },
      { group: "On this device", items: dev.map(f => [f, f, "font-family:" + R.fontStack(f)]) }];
  }
  function textProps(P, o) {
    const area = h("textarea", { "class": "textarea prose", id: "pText", dir: "auto", rows: 4, "aria-label": "Text", spellcheck: "true" });
    area.value = o.text;
    area.addEventListener("input", () => live(x => { x.text = area.value; }));
    area.addEventListener("change", commit);
    const tg = h("div", { "class": "sl-btnrow" }, [
      toggleBtn("Bold (Ctrl+B)", o.weight >= 600, v => live(x => { x.weight = v ? 700 : 400; }), "B"),
      toggleBtn("Italic (Ctrl+I)", o.italic, v => live(x => { x.italic = v; }), "I", "sl-it"),
      toggleBtn("Underline (Ctrl+U)", o.underline, v => live(x => { x.underline = v; }), "U", "sl-ul"),
      act("Decrease level (Shift+Tab)", "d-outdent", () => { live(x => { x.text = x.text.split("\n").map(l => l.charAt(0) === "\t" ? l.slice(1) : l).join("\n"); }, true); buildProps(); }),
      act("Increase level (Tab)", "d-indent", () => { live(x => { x.text = x.text.split("\n").map(l => /^\t{4}/.test(l) ? l : "\t" + l).join("\n"); }, true); buildProps(); })
    ]);
    P.appendChild(section("Text", [area,
      h("p", { "class": "faint sl-p", text: "While typing on the slide: Tab / Shift+Tab change a line's level." }),
      selectIn("Font", fontOptions(o.font), o.font, v => live(x => { x.font = v; })),
      h("div", { "class": "sl-geo" }, [
        numIn("Size", o.size, v => live(x => { x.size = Math.max(1, v); }), { min: 1 }),
        selectIn("Weight", [300, 400, 500, 600, 700, 800, 900].map(w => [String(w), { 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" }[w]]), String(o.weight), v => live(x => { x.weight = +v; })),
        selectIn("Fit", [["grow", "Box grows"], ["shrink", "Shrink text"], ["fixed", "Fixed"]], o.autoH ? "grow" : o.fit === "shrink" ? "shrink" : "fixed", v => live(x => { x.autoH = v === "grow"; x.fit = v === "shrink" ? "shrink" : "none"; }))
      ]),
      tg,
      segIn("Bullets", [["none", "None", "No bullets", "d-none"], ["bullet", "Bullets", "Bulleted list", "d-bullets"], ["number", "Numbers", "Numbered list", "d-numbers"]], o.bullets, v => live(x => { x.bullets = v; if (v !== "none" && !x.ps) x.ps = 0.4; }, true)),
      segIn("Align", [["left", "Left", "Align left", "d-al-l"], ["center", "Centre", "Align centre", "d-al-c"], ["right", "Right", "Align right", "d-al-r"]], o.align, v => live(x => { x.align = v; }, true)),
      o.autoH ? null : segIn("Vertical", [["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]], o.valign, v => live(x => { x.valign = v; }, true)),
      segIn("Direction", [["auto", "Auto"], ["ltr", "LTR"], ["rtl", "RTL"]], o.dir || "auto", v => live(x => { x.dir = v; }, true)),
      colorIn("Colour", o.color, c => live(x => { x.color = c || "@text"; })),
      rangeIn("Line spacing", o.lh, 0.7, 3, 0.05, v => live(x => { x.lh = v; }), v => v.toFixed(2)),
      rangeIn("Space between paragraphs", o.ps || 0, 0, 2, 0.05, v => live(x => { x.ps = v; }), v => v.toFixed(2))
    ].filter(Boolean)));
  }
  function shapeProps(P, o) {
    const area = h("textarea", { "class": "textarea prose", dir: "auto", rows: 2, "aria-label": "Text in shape", placeholder: "Text inside the shape" });
    area.value = o.text || "";
    area.addEventListener("input", () => live(x => { x.text = area.value; }));
    P.appendChild(section("Shape", [
      selectIn("Type", C.SHAPES.map(s => [s, s.charAt(0).toUpperCase() + s.slice(1)]), o.shape, v => live(x => { x.shape = v; })),
      fillIn("Fill", o.fill, v => live(x => { x.fill = v; }), true),
      rangeIn("Border", o.strokeW || 0, 0, 40, 0.5, v => live(x => { x.strokeW = v; })),
      colorIn("Border colour", o.stroke, c => live(x => { x.stroke = c; })),
      o.shape === "rect" ? rangeIn("Corner radius", o.radius || 0, 0, Math.round(Math.min(o.w, o.h) / 2), 1, v => live(x => { x.radius = v; })) : null
    ].filter(Boolean)));
    P.appendChild(section("Text in shape", [area, numIn("Text size", o.tsize || 36, v => live(x => { x.tsize = Math.max(1, v); }), { min: 1 }), colorIn("Text colour", o.tcolor, c => live(x => { x.tcolor = c; }))]));
  }
  function lineProps(P, o) {
    const caps = [["none", "None"], ["arrow", "Arrow"], ["dot", "Dot"]];
    P.appendChild(section("Line", [
      colorIn("Colour", o.stroke, c => live(x => { x.stroke = c; })),
      rangeIn("Thickness", o.h, 1, 40, 0.5, v => live(x => { const c = x.y + x.h / 2; x.h = v; x.y = c - v / 2; })),
      segIn("Style", [["solid", "Solid"], ["dash", "Dashed"], ["dot", "Dotted"]], o.dash, v => live(x => { x.dash = v; }, true)),
      h("div", { "class": "sl-geo2" }, [selectIn("Start", caps, o.start, v => live(x => { x.start = v; })), selectIn("End", caps, o.end, v => live(x => { x.end = v; }))])
    ]));
  }
  function iconProps(P, o) {
    P.appendChild(section("Icon", [
      selectIn("Icon", Object.keys(SL.ICONS).map(k => [k, k.replace(/-/g, " ")]), o.icon, v => live(x => { x.icon = v; })),
      colorIn("Colour", o.color, c => live(x => { x.color = c; })),
      segIn("Style", [["stroke", "Outline"], ["fill", "Filled"]], o.style, v => live(x => { x.style = v; }, true)),
      rangeIn("Line width", o.sw || 2, 0.5, 4, 0.25, v => live(x => { x.sw = v; }))
    ]));
  }
  function imageProps(P, o, one) {
    const rep = textBtn(o.src ? "Replace picture" : "Choose picture", () => pickImageFor(o.id), "", "i-image");
    P.appendChild(section("Picture", [one ? rep : null,
      segIn("Fit", [["cover", "Fill frame"], ["contain", "Fit"], ["stretch", "Stretch"]], o.fit, v => live(x => { x.fit = v; }, true)),
      rangeIn("Corner radius", o.radius || 0, 0, Math.round(Math.min(o.w, o.h) / 2), 1, v => live(x => { x.radius = v; }))
    ].filter(Boolean)));
  }
  function gridEditor(rows, onCell, opts) {
    const tb = h("tbody");
    rows.forEach((r, ri) => {
      const tr = h("tr");
      r.forEach((v, ci) => {
        const inp = h("input", { "class": "input", value: v, dir: "auto", "aria-label": (opts.rowName ? opts.rowName(ri) : "Row " + (ri + 1)) + ", " + (opts.colName ? opts.colName(ci) : "column " + (ci + 1)), inputmode: opts.numeric && opts.numeric(ri, ci) ? "decimal" : null });
        if (opts.head && opts.head(ri, ci)) inp.classList.add("sl-gh");
        inp.addEventListener("input", () => onCell(ri, ci, inp.value));
        inp.addEventListener("change", commit);
        inp.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); const nr = ri + (e.key === "ArrowUp" ? -1 : 1), nxt = tb.rows[nr] && tb.rows[nr].cells[ci]; if (nxt) nxt.firstChild.focus();
          }
        });
        tr.appendChild(h("td", {}, [inp]));
      });
      tb.appendChild(tr);
    });
    return h("div", { "class": "tbl-wrap sl-grid" }, [h("table", { "class": "sl-gtable" }, [tb])]);
  }
  function tableProps(P, o) {
    const re = () => { fit1(o); commit(); draw(); buildProps(); };
    const rows = o.rows.length, cols = o.rows[0].length;
    P.appendChild(section("Table", [
      gridEditor(o.rows, (ri, ci, v) => { o.rows[ri][ci] = v; fit1(o); draw(); commitSoon(); }, { head: ri => o.header && ri === 0 }),
      h("div", { "class": "sl-btnrow" }, [
        textBtn("+ Row", () => { if (rows < C.LIMITS.rows) { o.rows.push(o.rows[0].map(() => "")); re(); } }, "ghost"),
        textBtn("− Row", () => { if (rows > 1) { o.rows.pop(); re(); } }, "ghost"),
        textBtn("+ Column", () => { if (cols < C.LIMITS.cols) { o.rows.forEach((r, i) => r.push(i === 0 && o.header ? "Column " + (cols + 1) : "")); re(); } }, "ghost"),
        textBtn("− Column", () => { if (cols > 1) { o.rows.forEach(r => r.pop()); re(); } }, "ghost")
      ]),
      h("div", { "class": "row" }, [chk("Header row", o.header, v => { o.header = v; re(); }), chk("Banded rows", o.band, v => { o.band = v; re(); })]),
      numIn("Text size", o.size, v => live(x => { x.size = Math.max(4, v); }), { min: 4 }),
      colorIn("Header fill", o.headFill, c => live(x => { x.headFill = c; })),
      colorIn("Text colour", o.color, c => live(x => { x.color = c; })),
      colorIn("Lines", o.border, c => live(x => { x.border = c; }))
    ]));
  }
  function chk(label, on, onSet) {
    const c = h("input", { type: "checkbox" }); c.checked = !!on;
    c.addEventListener("change", () => onSet(c.checked));
    return h("label", { "class": "check" }, [c, " " + label]);
  }
  function chartProps(P, o) {
    const d = o.data, re = () => { commit(); draw(); buildProps(); };
    const grid = [["Category"].concat(d.series.map(s => s.name))].concat(d.labels.map((l, i) => [l].concat(d.series.map(s => String(s.values[i])))));
    P.appendChild(section("Chart", [
      segIn("Type", [["bar", "Bar"], ["line", "Line"], ["pie", "Pie"]], o.kind, v => { o.kind = v; re(); }),
      h("p", { "class": "faint sl-p", text: o.kind === "pie" ? "A pie uses the first series. Negative values count as 0." : "First row: series names. First column: categories." }),
      gridEditor(grid, (ri, ci, v) => {
        if (ri === 0 && ci > 0) d.series[ci - 1].name = v.slice(0, 80);
        else if (ri > 0 && ci === 0) d.labels[ri - 1] = v.slice(0, 80);
        else if (ri > 0) { const n = parseFloat(String(v).replace(/,/g, "")); d.series[ci - 1].values[ri - 1] = isFinite(n) ? n : 0; }
        draw(); commitSoon();
      }, { head: (ri, ci) => ri === 0 || ci === 0, numeric: (ri, ci) => ri > 0 && ci > 0 }),
      h("div", { "class": "sl-btnrow" }, [
        textBtn("+ Category", () => { if (d.labels.length < C.LIMITS.labels) { d.labels.push("New"); d.series.forEach(s => s.values.push(0)); re(); } }, "ghost"),
        textBtn("− Category", () => { if (d.labels.length > 1) { d.labels.pop(); d.series.forEach(s => s.values.pop()); re(); } }, "ghost"),
        textBtn("+ Series", () => { if (d.series.length < C.LIMITS.series) { d.series.push({ name: "Series " + (d.series.length + 1), values: d.labels.map(() => 0) }); re(); } }, "ghost"),
        textBtn("− Series", () => { if (d.series.length > 1) { d.series.pop(); re(); } }, "ghost")
      ]),
      h("div", { "class": "row" }, [chk("Legend", o.legend, v => { o.legend = v; re(); }), chk("Value labels", o.values, v => { o.values = v; re(); })]),
      numIn("Text size", o.size, v => live(x => { x.size = Math.max(4, v); }), { min: 4 })
    ]));
  }
  function animProps(P, sel) {
    const o = sel[0], an = o.anim, list = C.animated(slide()), idx = list.indexOf(o);
    const kids = [selectIn("Entrance effect", [["none", "None"]].concat(C.ANIMS), an ? an.t : "none", v => {
      let n = list.length ? Math.max.apply(null, list.map(x => x.anim.n || 0)) : 0;
      sel.forEach(x => { if (v === "none") x.anim = null; else if (x.anim) x.anim.t = v; else x.anim = { t: v, with: false, n: ++n }; });
      C.renumberAnims(slide()); commit(); buildProps(); draw();
    })];
    if (an) {
      kids.push(segIn("Start", [["click", "On click"], ["with", "With previous"]], an.with ? "with" : "click", v => { sel.forEach(x => { if (x.anim) x.anim.with = v === "with"; }); commit(); draw(); }));
      if (sel.length === 1) kids.push(h("div", { "class": "row between" }, [h("span", { "class": "faint", text: "Order " + (idx + 1) + " of " + list.length }),
        h("div", { "class": "row" }, [act("Earlier", "d-up", () => { if (C.moveAnim(slide(), o.id, -1)) { commit(); buildProps(); draw(); } }, idx <= 0),
          act("Later", "d-down", () => { if (C.moveAnim(slide(), o.id, 1)) { commit(); buildProps(); draw(); } }, idx >= list.length - 1)])]));
    }
    P.appendChild(section("Animation", kids));
  }

  // ----- slide + theme panel (nothing selected) -----
  const thumbs = {};
  function layoutThumb(layoutId, w) {
    const key = ED.deck.theme + "|" + ED.deck.ratio + "|" + layoutId + "|" + w;
    if (thumbs[key]) return thumbs[key].cloneNode ? copyCanvas(thumbs[key]) : null;
    const tmp = { format: "s3slides", ratio: ED.deck.ratio, theme: ED.deck.theme, slides: [], assets: {} }, s = C.newSlide(layoutId);
    C.applyLayout(tmp, s, layoutId); tmp.slides.push(s); R.fitAll(tmp);
    const c = R.slideCanvas(tmp, s, w * (window.devicePixelRatio || 1) / C.dims(tmp).w, { editor: true, zoom: 0.08 });
    thumbs[key] = c; return copyCanvas(c);
  }
  function copyCanvas(c) { const n = document.createElement("canvas"); n.width = c.width; n.height = c.height; n.getContext("2d").drawImage(c, 0, 0); return n; }
  function themeThumb(t, ratio, w) {
    const key = "theme|" + t.id + "|" + ratio + "|" + w;
    if (!thumbs[key]) {
      const tmp = { format: "s3slides", ratio: ratio, theme: t.id, slides: [], assets: {} }, s = C.newSlide("title");
      C.applyLayout(tmp, s, "title"); s.objects[0].text = t.rtl ? "عرض تقديمي" : t.name.replace(/ \(.*\)$/, ""); s.objects[1].text = t.rtl ? "Noor · من اليمين إلى اليسار" : "Aa  Heading & body";
      s.objects[0].size *= 1.6; s.objects[1].size *= 1.5;
      tmp.slides.push(s); R.fitAll(tmp);
      thumbs[key] = R.slideCanvas(tmp, s, w * (window.devicePixelRatio || 1) / C.dims(tmp).w, {});
    }
    return copyCanvas(thumbs[key]);
  }
  function slideProps(P) {
    const d = ED.deck, s = slide();
    P.appendChild(h("div", { "class": "row between sl-phead" }, [h("h2", { text: "Slide " + (ED.si + 1) + " of " + d.slides.length })]));
    const lay = h("div", { "class": "sl-lays" });
    C.LAYOUTS.forEach(l => {
      const b = h("button", { type: "button", "class": "sl-lay", "aria-pressed": String(s.layout === l.id), title: "Use layout: " + l.name }, [layoutThumb(l.id, 78), h("span", { text: l.name })]);
      b.addEventListener("click", () => { C.applyLayout(d, slide(), l.id); R.fitAll(d); ED.sel = []; commit(); slideChanged(); });
      lay.appendChild(b);
    });
    P.appendChild(section("Layout", [lay]));
    const bgReset = textBtn("Use theme background", () => { slide().bg = null; commit(); draw(); buildProps(); }, "ghost");
    const bgAll = textBtn("Apply to all slides", () => { const bg = slide().bg; d.slides.forEach(x => { x.bg = bg ? C.clone(bg) : null; }); commit(); draw(); S3.toast("Background applied to every slide"); }, "ghost");
    P.appendChild(section("Background", [fillIn("Background", s.bg || SL.slideBg(th(), s), v => { slide().bg = v || null; draw(); commitSoon(); }), h("div", { "class": "sl-btnrow" }, [s.bg ? bgReset : null, bgAll].filter(Boolean))]));
    const tr = s.transition || { type: "none", dur: 0.6 };
    P.appendChild(section("Transition", [
      selectIn("When this slide appears", [["none", "None"], ["fade", "Fade"], ["slide", "Slide in"], ["push", "Push"], ["zoom", "Zoom"]], tr.type, v => { slide().transition = { type: v, dur: tr.dur || 0.6 }; commit(); buildProps(); }),
      tr.type !== "none" ? rangeIn("Duration", tr.dur || 0.6, 0.2, 2, 0.1, v => { slide().transition.dur = v; commitSoon(); }, v => v.toFixed(1) + " s") : null,
      textBtn("Apply to all slides", () => { d.slides.forEach(x => { x.transition = C.clone(slide().transition); }); commit(); S3.toast("Transition applied to every slide"); }, "ghost")
    ].filter(Boolean)));
    P.appendChild(section("Show", [chk("Hide this slide in the slide show", s.hidden, v => { slide().hidden = v; commit(); renderStrip(); })]));
    const tg = h("div", { "class": "sl-themes" });
    SL.THEMES.forEach(t => {
      const b = h("button", { type: "button", "class": "sl-theme", "aria-pressed": String(d.theme === t.id), title: "Theme: " + t.name }, [themeThumb(t, d.ratio, 120), h("span", { text: t.name })]);
      b.addEventListener("click", () => { if (d.theme === t.id) return; C.applyTheme(d, t.id); R.fitAll(d); thumbCache = {}; commit(); slideChanged(); S3.toast("Theme “" + t.name + "” applied to every slide"); });
      tg.appendChild(b);
    });
    P.appendChild(section("Theme (whole presentation)", [tg]));
    P.appendChild(section("Slide size", [segIn("", [["16:9", "Widescreen 16:9"], ["4:3", "Standard 4:3"]], d.ratio, v => { if (C.setRatio(d, v)) { R.fitAll(d); thumbCache = {}; commit(); fitIfSizeChanged(); slideChanged(); } })]));
    const snap = h("input", { type: "checkbox" }); snap.checked = ED.snap;
    snap.addEventListener("change", () => { ED.snap = snap.checked; S3.store("sl.snap", ED.snap); });
    P.appendChild(section("Editor", [h("label", { "class": "check" }, [snap, " Snap to slide and objects (hold Alt to skip)"]),
      h("p", { "class": "faint sl-p", text: "Click to select, double-click text to type, drag on empty space to select several. Ctrl + scroll zooms. Press ? for all shortcuts." })]));
  }

  // ================= filmstrip =================
  let thumbCache = {}, thumbsT = 0;
  function thumbsSoon() { clearTimeout(thumbsT); thumbsT = setTimeout(renderStrip, 200); }
  function slideThumb(s, w) {
    const key = ED.deck.theme + ED.deck.ratio + w + JSON.stringify(s);
    if (thumbCache[s.id] && thumbCache[s.id].key === key) return copyCanvas(thumbCache[s.id].c);
    const c = R.slideCanvas(ED.deck, s, w * (window.devicePixelRatio || 1) / D().w, {});
    thumbCache[s.id] = { key: key, c: c }; return copyCanvas(c);
  }
  function stripItem(s, i, w, inSorter, dlg) {
    const c = slideThumb(s, w);
    c.style.width = w + "px"; c.style.height = Math.round(w * D().h / D().w) + "px";
    const b = h("div", { "class": "sl-thumb" + (i === ED.si ? " on" : "") + (s.hidden ? " off" : ""), draggable: "true", role: "button", tabindex: inSorter ? "0" : "-1",
      "aria-label": "Slide " + (i + 1) + (s.hidden ? " (hidden)" : ""), "aria-current": i === ED.si ? "true" : null }, [
      h("span", { "class": "sl-tn", text: String(i + 1) }), h("span", { "class": "sl-tc" }, [c, s.hidden ? h("span", { "class": "sl-thid" }, [icon("d-eyeoff")]) : null])]);
    const ops = h("span", { "class": "sl-tops" }, [
      act("Duplicate slide", "i-copy", e => { e.stopPropagation(); dupSlide(i); if (dlg) dlg.refresh(); }),
      act(s.hidden ? "Show in slide show" : "Hide in slide show", s.hidden ? "d-eye" : "d-eyeoff", e => { e.stopPropagation(); s.hidden = !s.hidden; commit(); renderStrip(); buildProps(); if (dlg) dlg.refresh(); }),
      act("Delete slide", "i-trash", e => { e.stopPropagation(); delSlide(i); if (dlg) dlg.refresh(); }, ED.deck.slides.length < 2)
    ]);
    b.appendChild(ops);
    b.addEventListener("click", () => { goSlide(i); if (dlg) dlg.close(); });
    b.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); b.click(); } });
    b.addEventListener("dragstart", e => { e.dataTransfer.setData("text/x-sl-slide", String(i)); e.dataTransfer.effectAllowed = "move"; b.classList.add("drag"); });
    b.addEventListener("dragend", () => b.classList.remove("drag"));
    b.addEventListener("dragover", e => { if ([...e.dataTransfer.types].indexOf("text/x-sl-slide") >= 0) { e.preventDefault(); b.classList.add("over"); } });
    b.addEventListener("dragleave", () => b.classList.remove("over"));
    b.addEventListener("drop", e => {
      e.preventDefault(); b.classList.remove("over");
      const from = parseInt(e.dataTransfer.getData("text/x-sl-slide"), 10); if (!isFinite(from) || from === i) return;
      moveSlideTo(from, i); if (dlg) dlg.refresh();
    });
    return b;
  }
  function renderStrip() {
    const strip = $("#strip"); if (!strip || !ED.deck) return;
    const keep = strip.scrollTop, keepL = strip.scrollLeft;
    strip.innerHTML = "";
    const w = window.innerWidth < 760 ? 112 : 150;
    ED.deck.slides.forEach((s, i) => strip.appendChild(stripItem(s, i, w)));
    const add = h("button", { type: "button", "class": "sl-addslide", title: "New slide (Ctrl+M)" }, [icon("i-plus"), "New slide"]);
    add.addEventListener("click", () => newSlide());
    strip.appendChild(add);
    strip.scrollTop = keep; strip.scrollLeft = keepL;
  }
  function scrollStrip() { const on = $("#strip .sl-thumb.on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  function newSlide(layout) {
    finishText();
    const cur = slide(), lay = layout || (cur.layout === "title" || cur.layout === "section" ? "content" : cur.layout === "blank" ? "blank" : cur.layout);
    C.addSlide(ED.deck, ED.si + 1, lay); R.fitAll(ED.deck); commit(); goSlide(ED.si + 1);
  }
  function dupSlide(i) { C.duplicateSlide(ED.deck, i); commit(); goSlide(i + 1); }
  function delSlide(i) {
    if (ED.deck.slides.length < 2) return;
    C.deleteSlide(ED.deck, i); commit(); ED.si = Math.min(ED.si > i ? ED.si - 1 : ED.si, ED.deck.slides.length - 1); ED.sel = []; slideChanged();
    S3.toast("Slide deleted. Ctrl+Z brings it back.");
  }
  function moveSlideTo(from, to) {
    const cur = ED.deck.slides[ED.si];
    if (!C.moveSlide(ED.deck, from, to)) return;
    ED.si = ED.deck.slides.indexOf(cur); commit(); slideChanged();
  }
  $("#strip").addEventListener("keydown", e => {
    if (isTyping(e.target)) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); if (e.ctrlKey || e.metaKey) moveSlideTo(ED.si, ED.si + 1); else goSlide(ED.si + 1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); if (e.ctrlKey || e.metaKey) moveSlideTo(ED.si, ED.si - 1); else goSlide(ED.si - 1); }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delSlide(ED.si); }
    else if (e.key === "Home") { e.preventDefault(); goSlide(0); }
    else if (e.key === "End") { e.preventDefault(); goSlide(ED.deck.slides.length - 1); }
  });

  // ================= menus =================
  let openMenu = null;
  function menu(anchor, content, cls) {
    closeMenu();
    const m = h("div", { "class": "sl-menu " + (cls || ""), role: "menu" }, [content]);
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left)) + "px";
    m.style.top = (r.bottom + mh + 8 > window.innerHeight && r.top > mh ? r.top - mh - 6 + window.scrollY : r.bottom + 6 + window.scrollY) + "px";
    openMenu = { el: m, anchor: anchor };
    anchor.setAttribute("aria-expanded", "true");
    const f = m.querySelector("button, input"); if (f) f.focus({ preventScroll: true });
    return m;
  }
  function closeMenu() { if (!openMenu) return; openMenu.anchor.setAttribute("aria-expanded", "false"); openMenu.el.remove(); openMenu = null; }
  document.addEventListener("pointerdown", e => { if (openMenu && !openMenu.el.contains(e.target) && !openMenu.anchor.contains(e.target)) closeMenu(); }, true);
  document.addEventListener("keydown", e => { if (openMenu && e.key === "Escape") { e.stopPropagation(); const a = openMenu.anchor; closeMenu(); a.focus(); } }, true);
  function menuItem(label, kid, fn, cls) {
    const b = h("button", { type: "button", role: "menuitem", "class": "sl-mi " + (cls || ""), title: label }, [kid, h("span", { text: label })]);
    b.addEventListener("click", () => { closeMenu(); fn(); }); return b;
  }
  function thumbCanvas(fn) { const c = document.createElement("canvas"), k = 2; c.width = 48 * k; c.height = 48 * k; const x = c.getContext("2d"); x.scale(k, k); fn(x); return c; }
  function layoutMenu(anchor) {
    const g = h("div", { "class": "sl-mgrid sl-mlay" });
    C.LAYOUTS.forEach(l => g.appendChild(menuItem(l.name, layoutThumb(l.id, 96), () => newSlide(l.id))));
    menu(anchor, h("div", {}, [h("b", { "class": "sl-mt", text: "New slide with layout" }), g]));
  }
  function shapeMenu(anchor) {
    const g = h("div", { "class": "sl-mgrid" }), col = css("--accent") || "#3dd6d0";
    C.SHAPES.forEach(s => g.appendChild(menuItem(s.charAt(0).toUpperCase() + s.slice(1), thumbCanvas(x => { x.translate(24, 24); x.fillStyle = col; x.fill(R.shapePath({ shape: s, w: s === "arrow" ? 38 : 32, h: s === "arrow" ? 20 : 32, radius: 4 })); }), () => addShape(s), "sl-mi-sq")));
    menu(anchor, h("div", {}, [h("b", { "class": "sl-mt", text: "Shapes" }), g]));
  }
  function lineMenu(anchor) {
    const g = h("div", { "class": "stack sl-mlist" });
    [["solid", "Line"], ["arrow", "Arrow"], ["double", "Double arrow"], ["dash", "Dashed line"], ["dot", "Dotted line"]].forEach(l => g.appendChild(menuItem(l[1], thumbCanvas(x => {
      const o = C.make("line", { x: 4, y: 22.5, w: 40, h: 3, stroke: "#9aa3ad", dash: l[0] === "dash" || l[0] === "dot" ? l[0] : "solid", end: l[0] === "arrow" || l[0] === "double" ? "arrow" : "none", start: l[0] === "double" ? "arrow" : "none" });
      R.drawObject(x, o, { deck: ED.deck, theme: th() });
    }), () => addLine(l[0]), "sl-mi-row")));
    menu(anchor, g);
  }
  function iconMenu(anchor) {
    const q = h("input", { "class": "input", placeholder: "Search icons", "aria-label": "Search icons", autocomplete: "off" });
    const g = h("div", { "class": "sl-mgrid sl-micons" });
    Object.keys(SL.ICONS).forEach(k => { const b = menuItem(k.replace(/-/g, " "), pathIcon(SL.ICONS[k]), () => addIcon(k), "sl-mi-ic"); b.dataset.k = k; g.appendChild(b); });
    q.addEventListener("input", () => { const s = q.value.trim().toLowerCase(); $$(".sl-mi-ic", g).forEach(b => { b.hidden = !!s && b.dataset.k.indexOf(s) < 0; }); });
    menu(anchor, h("div", { "class": "stack" }, [q, g]));
  }
  function tableMenu(anchor) {
    const R0 = 7, C0 = 8, g = h("div", { "class": "sl-tpick" }), lab = h("b", { "class": "sl-mt", text: "Table: 3 × 3" });
    for (let r = 1; r <= R0; r++) for (let c = 1; c <= C0; c++) {
      const b = h("button", { type: "button", "class": "sl-tcell", "aria-label": r + " rows by " + c + " columns", "data-r": r, "data-c": c });
      const hi = () => { lab.textContent = "Table: " + r + " × " + c; $$(".sl-tcell", g).forEach(x => x.classList.toggle("on", +x.dataset.r <= r && +x.dataset.c <= c)); };
      b.addEventListener("pointerenter", hi); b.addEventListener("focus", hi);
      b.addEventListener("click", () => { closeMenu(); addTable(r, c); });
      g.appendChild(b);
    }
    menu(anchor, h("div", {}, [lab, g]));
  }
  function chartMenu(anchor) {
    const g = h("div", { "class": "stack sl-mlist" });
    [["bar", "Bar chart", "chart"], ["line", "Line chart", "trend"], ["pie", "Pie chart", "pie"]].forEach(c => g.appendChild(menuItem(c[1], pathIcon(SL.ICONS[c[2]]), () => addChart(c[0]), "sl-mi-row")));
    menu(anchor, g);
  }
  function presentMenu(anchor) {
    const g = h("div", { "class": "stack sl-mlist" });
    g.appendChild(menuItem("From the beginning (F5)", icon("d-present"), () => present(0, false), "sl-mi-row"));
    g.appendChild(menuItem("From this slide (Shift+F5)", icon("d-right"), () => present(ED.si, false), "sl-mi-row"));
    g.appendChild(menuItem("Presenter view (notes, next, timer)", icon("d-window"), () => present(0, true), "sl-mi-row"));
    g.appendChild(menuItem("Presenter view + audience window", icon("d-window"), () => present(0, true, true), "sl-mi-row"));
    menu(anchor, g, "sl-mright");
  }
  function present(from, presenter, win) {
    finishText(); closeMenu();
    SL.present.start(ED.deck, { from: from, presenter: presenter, window: win, onEnd: last => { if (ED.deck.slides[last]) goSlide(last); stage.focus({ preventScroll: true }); } });
  }

  // ================= dialogs =================
  function modal(title, body, foot, cls) {
    const m = h("div", { "class": "s3-modal sl-modal", role: "dialog", "aria-modal": "true", "aria-label": title });
    const x = h("button", { type: "button", "class": "btn ghost icon", "aria-label": "Close" }, [icon("i-x")]);
    const sheet = h("div", { "class": "s3-sheet sl-sheet " + (cls || "") }, [h("div", { "class": "row between" }, [h("h2", { text: title }), x]), body, foot ? h("div", { "class": "row sl-foot" }, foot) : null]);
    m.appendChild(sheet);
    function close() { m.remove(); document.removeEventListener("keydown", onKey, true); stage.focus({ preventScroll: true }); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    m.addEventListener("click", e => { if (e.target === m) close(); });
    x.addEventListener("click", close);
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(m);
    const f = sheet.querySelector("button.primary") || x; f.focus({ preventScroll: true }); sheet.scrollTop = 0;
    return { el: m, close: close };
  }
  const modalOpen = () => !!document.querySelector(".s3-modal");
  function newDialog() {
    let theme = ED.deck ? ED.deck.theme : "paper", ratio = ED.deck ? ED.deck.ratio : "16:9", start = "outline";
    const grid = h("div", { "class": "sl-themes sl-themes-big" });
    function paintGrid() {
      grid.innerHTML = "";
      SL.THEMES.forEach(t => {
        const b = h("button", { type: "button", "class": "sl-theme", "aria-pressed": String(theme === t.id) }, [themeThumb(t, ratio, 200), h("span", { text: t.name })]);
        b.addEventListener("click", () => { theme = t.id; $$(".sl-theme", grid).forEach(x => x.setAttribute("aria-pressed", String(x === b))); });
        b.addEventListener("dblclick", go);
        grid.appendChild(b);
      });
    }
    paintGrid();
    const body = h("div", { "class": "stack" }, [grid,
      h("div", { "class": "sl-geo2" }, [segIn("Slide size", [["16:9", "16:9"], ["4:3", "4:3"]], ratio, v => { ratio = v; paintGrid(); }),
        segIn("Start with", [["outline", "Sample outline"], ["blank", "Title slide only"]], start, v => { start = v; })]),
      h("p", { "class": "faint sl-p", text: "Your current presentation stays in Open. You can change the theme and size later." })]);
    function go() {
      dlg.close();
      const d = start === "outline" ? SL.sampleDeck(theme, ratio, false) : C.newDeck(theme, ratio);
      openDeck(d, { save: true }); S3.toast("New presentation created");
    }
    const create = h("button", { type: "button", "class": "btn primary", text: "Create" }); create.addEventListener("click", go);
    const dlg = modal("New presentation", body, [h("span", { "class": "grow" }), create], "sl-wide");
  }
  function sorterDialog() {
    finishText();
    const grid = h("div", { "class": "sl-sorter" });
    const dlg = modal("Slide sorter", h("div", { "class": "stack" }, [h("p", { "class": "faint sl-p", text: "Drag slides to reorder. Click one to edit it. Hidden slides are skipped in the show." }), grid]), null, "sl-wide");
    dlg.refresh = () => { grid.innerHTML = ""; ED.deck.slides.forEach((s, i) => grid.appendChild(stripItem(s, i, window.innerWidth < 760 ? 150 : 220, true, dlg))); };
    dlg.refresh();
  }
  function decksDialog() {
    finishText();
    const list = h("div", { "class": "stack" });
    const fileBtn = h("label", { "class": "btn" }, [icon("i-upload"), "Open a .s3slides file", h("input", { type: "file", accept: ".s3slides,.json,application/json", hidden: true })]);
    fileBtn.querySelector("input").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) { dlg.close(); openFile(f); } });
    const dlg = modal("Your presentations", h("div", { "class": "stack" }, [h("p", { "class": "faint sl-p", text: "Saved automatically in this browser only. Use Save file to keep a copy or move a deck to another device." }), fileBtn, list]), null, "sl-wide");
    function refresh() {
      IO.store.list().then(items => {
        list.innerHTML = "";
        if (!items.length) { list.appendChild(h("p", { "class": "faint sl-p", text: "Nothing saved yet. Presentations save themselves as you work." })); return; }
        items.forEach(it => {
          const open = h("button", { type: "button", "class": "sl-dthumb", "aria-label": "Open " + it.name }, [it.thumb ? h("img", { src: it.thumb, alt: "" }) : null]);
          open.addEventListener("click", () => { dlg.close(); openStored(it.id); });
          const del = act("Delete from this browser", "i-trash", () => {
            if (!confirm("Delete “" + it.name + "” from this browser? This cannot be undone.")) return;
            IO.store.del(it.id).then(() => { if (it.id === ED.deck.id) saveState("Deleted from this browser (still open)", "warn"); refresh(); });
          });
          const dup = act("Duplicate", "i-copy", () => IO.store.get(it.id).then(rec => { if (!rec) return; const d = IO.openDeck(JSON.stringify(rec.deck)); d.id = C.uid("d"); d.name = rec.name + " (copy)"; dlg.close(); openDeck(d, { save: true }); }));
          const when = new Date(it.updated);
          list.appendChild(h("div", { "class": "sl-deck" + (it.id === ED.deck.id ? " on" : "") }, [open, h("div", { "class": "grow sl-dmeta" }, [
            h("b", { text: it.name, dir: "auto" }), h("span", { "class": "faint", text: (it.count || 1) + (it.count === 1 ? " slide · " : " slides · ") + (it.ratio || "16:9") }),
            h("span", { "class": "faint", text: when.toLocaleDateString() + " " + when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })]), h("div", { "class": "sl-dacts" }, [dup, del])]));
        });
      }).catch(() => { list.innerHTML = ""; list.appendChild(h("p", { "class": "faint sl-p", text: "Browser storage is blocked (private mode?). Use Save file to keep your work." })); });
    }
    refresh();
  }
  function openStored(id) {
    return IO.store.get(id).then(rec => {
      if (!rec) { S3.toast("That presentation is gone", "error"); return; }
      const d = IO.openDeck(JSON.stringify(rec.deck)); d.id = rec.id; openDeck(d, { saved: true });
    });
  }
  function exportDialog() {
    finishText();
    const d = ED.deck, hiddenN = d.slides.filter(s => s.hidden).length;
    const st = Object.assign({ fmt: "pptx", hidden: false, which: "all", scale: 1 }, S3.store("sl.export") || {});
    const info = h("p", { "class": "sl-p sl-info" }), body = h("div", { "class": "stack" });
    function render() {
      body.innerHTML = "";
      body.appendChild(segIn("File type", [["pptx", "PowerPoint .pptx"], ["pdf", "PDF"], ["png", "PNG images"]], st.fmt, v => { st.fmt = v; render(); }));
      if (st.fmt === "png") {
        body.appendChild(segIn("Slides", [["all", "All slides (.zip)"], ["one", "Only slide " + (ED.si + 1)]], st.which, v => { st.which = v; upd(); }));
        body.appendChild(segIn("Size", [["0.5", "960 px"], ["1", (D().w) + " px"], ["2", (D().w * 2) + " px"]], String(st.scale), v => { st.scale = +v; upd(); }));
      }
      if (st.fmt !== "pptx" && hiddenN) body.appendChild(chk("Include " + hiddenN + " hidden slide" + (hiddenN > 1 ? "s" : ""), st.hidden, v => { st.hidden = v; upd(); }));
      body.appendChild(info); upd();
    }
    function count() { return st.fmt === "png" && st.which === "one" ? 1 : st.fmt === "pptx" || st.hidden ? d.slides.length : d.slides.length - hiddenN; }
    function upd() {
      const n = count();
      info.textContent = st.fmt === "pptx" ? n + " slides with editable text, bullets, shapes, lines, tables and speaker notes. Backgrounds, icons and charts become pictures; hidden slides stay hidden; transitions and animations are not included."
        : st.fmt === "pdf" ? n + (n === 1 ? " page" : " pages") + " (" + (d.ratio === "4:3" ? "10 × 7.5" : "10 × 5.63") + " in), one per slide. Latin text stays selectable."
        : n === 1 ? "One PNG, " + Math.round(D().w * st.scale) + " × " + Math.round(D().h * st.scale) + " px." : n + " PNGs of " + Math.round(D().w * st.scale) + " × " + Math.round(D().h * st.scale) + " px in a .zip.";
    }
    render();
    const go = h("button", { type: "button", "class": "btn primary" }, [icon("i-download"), "Download"]);
    go.addEventListener("click", () => {
      S3.store("sl.export", st); go.disabled = true; go.lastChild.textContent = "Working…";
      runExport(st).then(() => { dlg.close(); S3.done(); }).catch(err => { S3.toast(err.message || String(err), "error"); go.disabled = false; go.lastChild.textContent = "Download"; });
    });
    const dlg = modal("Download", body, [h("span", { "class": "grow" }), go]);
  }
  async function runExport(st) {
    const d = ED.deck, name = IO.slug(d.name);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await R.ensureImages(d);
    if (st.fmt === "pptx") { const blob = await IO.pptxBlob(d); S3.download(blob, name + ".pptx"); S3.toast(".pptx downloaded"); return; }
    const slides = st.fmt === "png" && st.which === "one" ? [slide()] : d.slides.filter(s => st.hidden || !s.hidden);
    if (!slides.length) throw new Error("Every slide is hidden. Tick “Include hidden slides”.");
    if (st.fmt === "pdf") { const bytes = await IO.pdfBytes(d, slides, { scale: 1, quality: 0.92 }); S3.download(new Blob([bytes], { type: "application/pdf" }), name + ".pdf"); S3.toast("PDF downloaded"); return; }
    if (slides.length === 1) { S3.download(new Blob([await IO.slidePng(d, slides[0], st.scale)], { type: "image/png" }), name + "-" + (d.slides.indexOf(slides[0]) + 1) + ".png"); }
    else {
      const files = [];
      for (const s of slides) files.push({ name: name + "-" + String(d.slides.indexOf(s) + 1).padStart(2, "0") + ".png", data: await IO.slidePng(d, s, st.scale) });
      S3.download(S3.zip(files), name + "-slides.zip");
    }
    S3.toast("Downloaded");
  }
  function shortcutsDialog() {
    const rows = [["F5 / Shift + F5", "Present from the start / this slide"], ["Ctrl + M", "New slide"], ["Ctrl + Shift + D", "Duplicate slide"],
      ["Page Up / Page Down", "Previous / next slide"], ["Tab / Shift + Tab (while typing)", "Bullet level down / up"], ["Ctrl + B / I / U", "Bold / italic / underline"],
      ["Ctrl + Z / Ctrl + Shift + Z", "Undo / redo"], ["Ctrl + C / X / V", "Copy / cut / paste (images too)"], ["Ctrl + D", "Duplicate object"], ["Delete", "Delete object (or slide in the slide list)"],
      ["Ctrl + A", "Select all"], ["Ctrl + ] / [", "Forward / backward (Shift: front / back)"], ["Ctrl + Shift + L", "Lock / unlock"], ["Arrows (Shift = 10)", "Nudge"],
      ["Enter or double-click", "Edit text"], ["Esc", "Finish editing / deselect"], ["T", "New text box"], ["Shift while resizing / rotating", "Free ratio / 15° steps"],
      ["Alt while dragging or rotating", "No snapping"], ["Ctrl + scroll, Ctrl + = / - / 0", "Zoom / fit"], ["Ctrl + S / Ctrl + E", "Save file / download"],
      ["In the show: → Space PgDn / ← PgUp", "Next / previous"], ["In the show: number + Enter", "Go to slide"], ["In the show: B / W", "Black / white screen"], ["In the show: Esc", "End"]];
    const tb = h("table", { "class": "tbl" }, [h("tbody", {}, rows.map(r => h("tr", {}, [h("td", {}, [h("kbd", { text: r[0] })]), h("td", { text: r[1] })])))]);
    modal("Keyboard shortcuts", h("div", { "class": "tbl-wrap" }, [tb]));
  }

  // ================= files =================
  function saveFile() { finishText(); S3.download(IO.deckJson(ED.deck), IO.slug(ED.deck.name) + ".s3slides", "application/json"); S3.toast("Presentation file saved. Open it here any time."); S3.done(); }
  function openFile(f) {
    if (f.size > 150e6) { S3.toast("That file is too large", "error"); return; }
    S3.readFile(f, "text").then(t => { const d = IO.openDeck(t); d.id = C.uid("d"); openDeck(d, { save: true }); S3.toast("Opened “" + d.name + "”"); })
      .catch(err => S3.toast(err.message || "Could not open that file", "error"));
  }

  // ================= fonts on this device =================
  const CANDIDATES = ["Inter", "Arial", "Helvetica", "Segoe UI", "Roboto", "Open Sans", "Noto Sans", "Ubuntu", "Verdana", "Tahoma", "Trebuchet MS", "Calibri", "Candara",
    "Gill Sans", "Futura", "Avenir", "Century Gothic", "Arial Black", "Impact", "Georgia", "Times New Roman", "Cambria", "Palatino Linotype", "Palatino", "Garamond",
    "Baskerville", "Rockwell", "Noto Serif", "Courier New", "Consolas", "Menlo", "Cascadia Code", "Comic Sans MS", "Segoe Print", "Brush Script MT",
    "Noto Sans Arabic", "Noto Naskh Arabic", "Noto Kufi Arabic", "Traditional Arabic", "Simplified Arabic", "Sakkal Majalla", "Arabic Typesetting", "Geeza Pro", "Al Bayan", "Amiri", "Cairo", "Tajawal", "Dubai"];
  function detectFonts() {
    const c = document.createElement("canvas").getContext("2d"), probe = "mmmmmmmmmmlli WQ@#0 أبجد هوز";
    const w = f => { c.font = "64px " + f; return c.measureText(probe).width; }, base = { m: w("monospace"), s: w("serif"), ss: w("sans-serif") };
    return CANDIDATES.filter(f => { if (f === "Inter") return true; const q = '"' + f + '", '; return w(q + "monospace") !== base.m || w(q + "serif") !== base.s || w(q + "sans-serif") !== base.ss; });
  }

  // ================= keyboard =================
  document.addEventListener("keydown", e => {
    if (modalOpen() || SL.present.active || openMenu) return;
    if (e.key === " " && !isTyping(e.target)) { if (!spaceDown) { spaceDown = true; cv.style.cursor = "grab"; } if (e.target === stage || e.target === document.body) e.preventDefault(); }
    if (e.key === "F5") { e.preventDefault(); present(e.shiftKey ? ED.si : 0, false); return; }
    if (isTyping(e.target)) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey, inApp = e.target === document.body || e.target.closest && e.target.closest(".sl-app");
    if (!inApp) return;
    if (mod && !e.altKey) {
      const lk = k.toLowerCase();
      if (lk === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((lk === "z" && e.shiftKey) || lk === "y") { e.preventDefault(); redo(); }
      else if (lk === "c") copySel(false);
      else if (lk === "x") copySel(true);
      else if (lk === "d" && e.shiftKey) { e.preventDefault(); dupSlide(ED.si); }
      else if (lk === "d") { e.preventDefault(); if (ED.sel.length) duplicateSel(); else dupSlide(ED.si); }
      else if (lk === "m") { e.preventDefault(); newSlide(); }
      else if (lk === "a") { e.preventDefault(); select(slide().objects.filter(o => !o.hidden && !o.locked).map(o => o.id)); }
      else if (lk === "l" && e.shiftKey) { e.preventDefault(); toggleLock(); }
      else if ((lk === "b" || lk === "i" || lk === "u") && selObjs().some(o => o.type === "text")) {
        e.preventDefault(); const t = selObjs().filter(o => o.type === "text");
        if (lk === "b") { const on = !t.every(o => o.weight >= 600); t.forEach(o => { o.weight = on ? 700 : 400; fit1(o); }); }
        if (lk === "i") { const on = !t.every(o => o.italic); t.forEach(o => { o.italic = on; fit1(o); }); }
        if (lk === "u") { const on = !t.every(o => o.underline); t.forEach(o => { o.underline = on; }); }
        commit(); buildProps(); draw();
      }
      else if (e.code === "BracketRight") { e.preventDefault(); order(e.shiftKey ? "top" : "up"); }
      else if (e.code === "BracketLeft") { e.preventDefault(); order(e.shiftKey ? "bottom" : "down"); }
      else if (k === "=" || k === "+") { e.preventDefault(); zoomAt(ED.zoom * 1.25, vw / 2, vh / 2); }
      else if (k === "-") { e.preventDefault(); zoomAt(ED.zoom / 1.25, vw / 2, vh / 2); }
      else if (k === "0") { e.preventDefault(); fit(); }
      else if (lk === "s") { e.preventDefault(); saveFile(); }
      else if (lk === "e") { e.preventDefault(); exportDialog(); }
      return;
    }
    if (e.target.closest && e.target.closest("#strip")) return;
    if (k === "Delete" || k === "Backspace") { if (ED.sel.length) { e.preventDefault(); deleteSel(); } }
    else if (k === "Escape") { if (ED.sel.length) select([]); }
    else if (k === "Enter" && (e.target === stage || e.target === document.body)) { const o = selObjs()[0]; if (o && o.type === "text" && ED.sel.length === 1) { e.preventDefault(); startText(o); } }
    else if (k.indexOf("Arrow") === 0) {
      if (!ED.sel.length) { if (e.target === stage && (k === "ArrowDown" || k === "ArrowRight")) { e.preventDefault(); goSlide(ED.si + 1); } else if (e.target === stage) { e.preventDefault(); goSlide(ED.si - 1); } return; }
      e.preventDefault(); const st = e.shiftKey ? 10 : 1;
      nudge(k === "ArrowLeft" ? -st : k === "ArrowRight" ? st : 0, k === "ArrowUp" ? -st : k === "ArrowDown" ? st : 0);
    }
    else if (k === "PageDown") { e.preventDefault(); goSlide(ED.si + 1); }
    else if (k === "PageUp") { e.preventDefault(); goSlide(ED.si - 1); }
    else if (!e.altKey && (k === "t" || k === "T")) { e.preventDefault(); addText(); }
    else if (k === "?") shortcutsDialog();
  });
  document.addEventListener("keyup", e => { if (e.key === " ") { spaceDown = false; cv.style.cursor = ""; } });
  document.addEventListener("paste", e => {
    if (isTyping(e.target) || modalOpen() || SL.present.active) return;
    const files = [...(e.clipboardData && e.clipboardData.files || [])].filter(f => /^image\//.test(f.type));
    if (files.length) { e.preventDefault(); addImageFiles(files); return; }
    const txt = e.clipboardData && e.clipboardData.getData("text/plain");
    if (ED.clip) { e.preventDefault(); paste(); }
    else if (txt && txt.trim()) { e.preventDefault(); addObject(C.make("text", { text: txt.slice(0, 5000).replace(/\r/g, ""), size: 36, w: D().w * 0.6, color: "@text", font: "@body" })); }
  });
  document.addEventListener("copy", e => { if (!isTyping(e.target) && !modalOpen() && ED.sel.length && !window.getSelection().toString()) { e.preventDefault(); copySel(false); } });

  // ================= wiring =================
  $("#btnUndo").addEventListener("click", undo);
  $("#btnRedo").addEventListener("click", redo);
  $("#btnNew").addEventListener("click", newDialog);
  $("#btnDecks").addEventListener("click", decksDialog);
  $("#btnSave").addEventListener("click", saveFile);
  $("#btnExport").addEventListener("click", exportDialog);
  $("#btnKeys").addEventListener("click", shortcutsDialog);
  $("#btnPresent").addEventListener("click", () => present(0, false));
  $("#btnPresentMenu").addEventListener("click", e => presentMenu(e.currentTarget));
  $("#btnNewSlide").addEventListener("click", () => newSlide());
  $("#btnLayouts").addEventListener("click", e => layoutMenu(e.currentTarget));
  $("#btnSorter").addEventListener("click", sorterDialog);
  $("#insText").addEventListener("click", addText);
  $("#insImage input").addEventListener("change", e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) addImageFiles(f, null); });
  $("#insShape").addEventListener("click", e => shapeMenu(e.currentTarget));
  $("#insLine").addEventListener("click", e => lineMenu(e.currentTarget));
  $("#insIcon").addEventListener("click", e => iconMenu(e.currentTarget));
  $("#insTable").addEventListener("click", e => tableMenu(e.currentTarget));
  $("#insChart").addEventListener("click", e => chartMenu(e.currentTarget));
  $("#deckName").addEventListener("input", () => { ED.deck.name = $("#deckName").value.slice(0, 120) || "Untitled presentation"; commitSoon(); });
  $("#zIn").addEventListener("click", () => zoomAt(ED.zoom * 1.25, vw / 2, vh / 2));
  $("#zOut").addEventListener("click", () => zoomAt(ED.zoom / 1.25, vw / 2, vh / 2));
  $("#zLabel").addEventListener("click", fit);
  notesEl.addEventListener("input", () => { slide().notes = notesEl.value.slice(0, C.LIMITS.text); commitSoon(); });
  new ResizeObserver(resizeCanvas).observe(stage);
  window.addEventListener("resize", () => { closeMenu(); });
  window.addEventListener("beforeunload", () => { if ($("#saveState").textContent === "Saving…") { clearTimeout(saveT); autosave(); } });

  async function boot() {
    ED.fonts = detectFonts();
    let opened = false;
    const last = S3.store("sl.last");
    if (last) { try { const rec = await IO.store.get(last); if (rec) { const d = IO.openDeck(JSON.stringify(rec.deck)); d.id = rec.id; openDeck(d, { saved: true }); opened = true; } } catch (e) { /* fall through */ } }
    if (!opened) openDeck(SL.sampleDeck("paper", "16:9", false), { quiet: true });
    resizeCanvas();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { R.clearCache(); R.fitAll(ED.deck); thumbCache = {}; for (const k in thumbs) delete thumbs[k]; draw(); renderStrip(); buildProps(); });
  }
  ED.ready = boot();
  Object.assign(ED, { openDeck: openDeck, select: select, commit: commit, undo: undo, redo: redo, fit: fit, slide: slide, goSlide: goSlide, newSlide: newSlide,
    buildProps: buildProps, renderStrip: renderStrip, addTable: addTable, addChart: addChart, present: present, startText: startText, finishText: finishText });
})();
