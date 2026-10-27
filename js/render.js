/* Slides renderer: draws a slide (theme background, decorations, objects) onto any 2D canvas.
   The same code draws the editor, thumbnails, the slide show and every export, so what you see is what you get.
   Text layout supports paragraphs, bullet / numbered levels (leading tabs), wrapping, shrink-to-fit and RTL. */
(function () {
  "use strict";
  var SL = window.SL = window.SL || {};
  var C = function () { return SL.core; };
  var RAD = Math.PI / 180;
  var SERIF = /georgia|times|garamond|serif|palatino|baskerville|didot|cambria|constantia|bookman|naskh|amiri|traditional arabic|scheherazade/i;
  var MONO = /mono|courier|consolas|menlo/i;
  function fontStack(f) {
    f = String(f || "Inter").replace(/["\\]/g, "");
    var fb = SERIF.test(f) ? 'Georgia, "Times New Roman", "Noto Naskh Arabic", "Traditional Arabic", serif'
      : MONO.test(f) ? 'ui-monospace, Consolas, "Courier New", monospace'
      : 'Inter, "Segoe UI", Tahoma, "Noto Sans Arabic", "Geeza Pro", system-ui, sans-serif';
    return '"' + f + '", ' + fb;
  }
  function fontCss(o, size, th) { return (o.italic ? "italic " : "") + (o.weight || 400) + " " + size + "px " + fontStack(C().resolveFont(th, o.font)); }
  var RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/, LTR = /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/;
  function textDir(o) {
    if (o.dir === "rtl" || o.dir === "ltr") return o.dir;
    var s = o.text || "";
    for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (RTL.test(ch)) return "rtl"; if (LTR.test(ch)) return "ltr"; }
    return "ltr";
  }
  var mctx = null;
  function measureCtx() { if (!mctx) mctx = document.createElement("canvas").getContext("2d"); return mctx; }
  var HAS_LS = (function () { try { return "letterSpacing" in document.createElement("canvas").getContext("2d"); } catch (e) { return false; } })();
  function setLS(ctx, px) { if (HAS_LS) ctx.letterSpacing = (px || 0) + "px"; }

  // ---------- text layout ----------
  var BULLETS = ["\u2022", "\u2013", "\u25E6", "\u25AA", "\u00B7"];
  function roman(n) { var v = [10, 9, 5, 4, 1], s = ["x", "ix", "v", "iv", "i"], out = ""; for (var i = 0; i < v.length; i++) while (n >= v[i]) { out += s[i]; n -= v[i]; } return out; }
  function numLabel(n, lvl) { return (lvl % 3 === 0 ? String(n) : lvl % 3 === 1 ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : roman(n)) + "."; }
  function levelOf(raw) { var m = /^\t*/.exec(raw)[0].length; return { lvl: Math.min(4, m), s: raw.slice(m) }; }
  var cache = {}, cacheN = 0;
  function layoutAt(o, th, size) {
    var dir = textDir(o), font = fontCss(o, size, th), text = String(o.text || "");
    var key = [text, font, Math.round(o.w * 10), o.ls, o.lh, dir, o.bullets, o.ps].join("\u0001");
    if (cache[key]) return cache[key];
    var ctx = measureCtx(); ctx.font = font; setLS(ctx, o.ls); ctx.direction = dir;
    function width(s) { return ctx.measureText(s).width; }
    var maxW = Math.max(1, o.w), bullets = o.bullets || "none", unit = size * 1.15, bw = bullets === "bullet" ? size * 0.95 : bullets === "number" ? size * 1.55 : 0;
    var lineH = size * (o.lh || 1.2), gap = size * (o.ps || 0), y = 0, lines = [], counters = [0, 0, 0, 0, 0];
    text.split("\n").forEach(function (raw, pi) {
      var p = levelOf(raw), lvl = p.lvl, s = p.s;
      if (s) { counters[lvl]++; for (var j = lvl + 1; j < 5; j++) counters[j] = 0; }
      var ind = lvl * unit + (bullets !== "none" ? bw : 0), avail = Math.max(size, maxW - ind), rows = [], line = "";
      s.split(" ").forEach(function (word) {
        var test = line ? line + " " + word : word;
        if (width(test) <= avail + 0.5 || (!line && width(word) <= avail + 0.5)) { line = test; return; }
        if (line) { rows.push(line); line = ""; }
        if (width(word) <= avail + 0.5) { line = word; return; }
        var part = "";
        Array.from(word).forEach(function (c) { if (part && width(part + c) > avail + 0.5) { rows.push(part); part = c; } else part += c; });
        line = part;
      });
      rows.push(line);
      if (pi > 0) y += gap;
      var glyph = !s || bullets === "none" ? "" : bullets === "bullet" ? BULLETS[lvl] : numLabel(counters[lvl], lvl);
      rows.forEach(function (r, i) { lines.push({ s: r, w: width(r), ind: ind, bx: lvl * unit, b: i === 0 ? glyph : "", y: y + lineH / 2, lvl: lvl }); y += lineH; });
    });
    var res = { lines: lines, lineH: lineH, h: Math.max(lineH, y), size: size, dir: dir };
    if (++cacheN > 1500) { cache = {}; cacheN = 0; }
    cache[key] = res;
    return res;
  }
  var kcache = {};
  function shrinkK(o, th) {
    var key = [o.text, C().resolveFont(th, o.font), o.size, o.weight, Math.round(o.w), Math.round(o.h), o.lh, o.bullets, o.ps].join("\u0001");
    if (kcache[key] != null) return kcache[key];
    var k = 1;
    while (k > 0.35 && layoutAt(o, th, o.size * k).h > o.h + 0.5) k *= 0.93;
    if (Object.keys(kcache).length > 800) kcache = {};
    return (kcache[key] = k);
  }
  function layoutText(o, th) { return layoutAt(o, th, o.size * (o.fit === "shrink" && !o.autoH ? shrinkK(o, th) : 1)); }
  // x of a laid-out line inside its box (0..w) with the canvas textAlign to use; same maths for PDF/editor.
  function lineX(o, lay, ln) {
    var rtl = lay.dir === "rtl", left = rtl ? 0 : ln.ind, right = rtl ? o.w - ln.ind : o.w, al = o.align || "left";
    if (al === "center") return { x: (left + right) / 2, a: "center", bx: rtl ? o.w - ln.bx : ln.bx, ba: rtl ? "right" : "left" };
    return { x: al === "right" ? right : left, a: al, bx: rtl ? o.w - ln.bx : ln.bx, ba: rtl ? "right" : "left" };
  }
  function textTop(o, lay) { return o.valign === "middle" ? (o.h - lay.h) / 2 : o.valign === "bottom" ? o.h - lay.h : 0; }

  // ---------- tables ----------
  var tcache = {};
  function tableLayout(o, th) {
    var key = JSON.stringify([o.rows, Math.round(o.w), o.size, C().resolveFont(th, o.font), o.header]);
    if (tcache[key]) return tcache[key];
    var cols = o.rows[0].length, colW = o.w / cols, pad = o.size * 0.42, rowH = [], cells = [];
    o.rows.forEach(function (r, ri) {
      var hmax = o.size * 1.2, row = [];
      r.forEach(function (txt) {
        var cell = { text: txt, font: o.font, size: o.size, weight: o.header && ri === 0 ? 700 : 400, w: Math.max(4, colW - pad * 2), lh: 1.2, ls: 0, dir: "auto", bullets: "none", ps: 0 };
        var lay = layoutAt(cell, th, o.size); hmax = Math.max(hmax, lay.h); row.push({ o: cell, lay: lay });
      });
      rowH.push(hmax + pad * 2); cells.push(row);
    });
    var res = { colW: colW, rowH: rowH, cells: cells, pad: pad, h: rowH.reduce(function (a, b) { return a + b; }, 0) };
    if (Object.keys(tcache).length > 200) tcache = {};
    return (tcache[key] = res);
  }

  function fitObj(o, th) {
    if (o.type === "text" && o.autoH) o.h = layoutText(o, th).h;
    if (o.type === "table") o.h = tableLayout(o, th).h;
  }
  function fitAll(deck) {
    var base = C().theme(deck);
    deck.slides.forEach(function (s) { var th = SL.themeFor(base, s.layout); s.objects.forEach(function (o) { fitObj(o, th); }); });
  }

  // ---------- fills ----------
  function paint(ctx, f, x, y, w, h, th) {
    f = C().resolve(th, f);
    if (!f) return null;
    if (typeof f === "string") return f;
    if (f.t === "lin") {
      var a = (f.a || 0) * RAD, vx = Math.sin(a), vy = -Math.cos(a), L = Math.abs(w / 2 * vx) + Math.abs(h / 2 * vy);
      var cx = x + w / 2, cy = y + h / 2, g = ctx.createLinearGradient(cx - vx * L, cy - vy * L, cx + vx * L, cy + vy * L);
      g.addColorStop(0, f.c[0]); g.addColorStop(1, f.c[1]); return g;
    }
    return null;
  }

  // ---------- shapes ----------
  function rrect(p, x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); if (r) p.arcTo(x + w, y, x + w, y + r, r);
    p.lineTo(x + w, y + h - r); if (r) p.arcTo(x + w, y + h, x + w - r, y + h, r);
    p.lineTo(x + r, y + h); if (r) p.arcTo(x, y + h, x, y + h - r, r);
    p.lineTo(x, y + r); if (r) p.arcTo(x, y, x + r, y, r);
    p.closePath(); return p;
  }
  function poly(p, pts, w, h) {
    var x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    pts.forEach(function (q) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
    pts.forEach(function (q, i) { var X = -w / 2 + (q[0] - x0) / (x1 - x0) * w, Y = -h / 2 + (q[1] - y0) / (y1 - y0) * h; if (i) p.lineTo(X, Y); else p.moveTo(X, Y); });
    p.closePath(); return p;
  }
  function regular(n, inner) {
    var pts = [], k = inner ? 2 * n : n;
    for (var i = 0; i < k; i++) { var a = (-90 + i * 360 / k) * RAD, r = inner && i % 2 ? inner : 1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return pts;
  }
  function shapePath(o) {
    var p = new Path2D(), w = o.w, h = o.h;
    switch (o.shape) {
      case "ellipse": p.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); return p;
      case "triangle": return poly(p, [[0, 0], [1, 1], [-1, 1]], w, h);
      case "diamond": return poly(p, [[0, -1], [1, 0], [0, 1], [-1, 0]], w, h);
      case "pentagon": return poly(p, regular(5), w, h);
      case "hexagon": return poly(p, regular(6).map(function (q) { return [q[1], q[0]]; }), w, h);
      case "star": return poly(p, regular(5, 0.45), w, h);
      case "arrow": return poly(p, [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]], w, h);
      case "heart": var q = new Path2D(); q.addPath(new Path2D(SL.ICONS.heart), new DOMMatrix().translate(-w / 2, -h / 2).scale(w / 20.8, h / 16).translate(-1.6, -4.5)); return q;
      default: return rrect(p, -w / 2, -h / 2, w, h, o.radius);
    }
  }
  var iconCache = {};
  function iconPath(name) { var d = SL.ICONS[name] || SL.ICONS.star; return iconCache[name] || (iconCache[name] = new Path2D(d)); }

  // ---------- images ----------
  var imgs = {};
  function getImg(deck, id) {
    if (!id || !deck.assets[id]) return null;
    var rec = imgs[id];
    if (!rec || rec.src !== deck.assets[id]) {
      var im = new Image();
      rec = imgs[id] = { src: deck.assets[id], img: im, ok: false };
      im.onload = function () { rec.ok = true; if (SL.render.onImage) SL.render.onImage(); };
      im.src = rec.src;
    }
    return rec.ok ? rec.img : null;
  }
  function ensureImages(deck) {
    return Promise.all(Object.keys(deck.assets).map(function (id) {
      getImg(deck, id); var rec = imgs[id];
      return rec.ok ? null : (rec.img.decode ? rec.img.decode().then(function () { rec.ok = true; }, function () {}) : null);
    }));
  }

  // ---------- drawing (all in the object's local frame: origin at its centre) ----------
  function drawTextBlock(ctx, o, th, lay, color, top) {
    var w = o.w, h = o.h;
    ctx.font = fontCss(o, lay.size, th); setLS(ctx, o.ls * lay.size / (o.size || 1)); ctx.direction = lay.dir; ctx.textBaseline = "middle";
    ctx.fillStyle = paint(ctx, color, -w / 2, -h / 2, w, h, th) || "#000";
    lay.lines.forEach(function (ln) {
      var px = lineX(o, lay, ln), y = -h / 2 + top + ln.y;
      if (ln.b) { ctx.textAlign = px.ba; ctx.fillText(ln.b, -w / 2 + px.bx, y); }
      ctx.textAlign = px.a; ctx.fillText(ln.s, -w / 2 + px.x, y);
      if (o.underline && ln.s) {
        var lx = px.a === "left" ? px.x : px.a === "right" ? px.x - ln.w : px.x - ln.w / 2;
        ctx.fillRect(-w / 2 + lx, y + lay.size * 0.36, ln.w, Math.max(1, lay.size / 16));
      }
    });
    setLS(ctx, 0);
  }
  function drawText(ctx, o, opt) {
    var th = opt.theme, empty = !String(o.text || "").trim();
    if (empty && o.ph) {
      if (!opt.editor) return;
      var hint = Object.assign({}, o, { text: C().PH_HINT[o.ph] || "Click to add text", bullets: o.bullets === "number" ? "bullet" : o.bullets, fit: "shrink" });
      ctx.save(); ctx.globalAlpha *= 0.5;
      var hl = layoutText(hint, th); drawTextBlock(ctx, hint, th, hl, "@muted", textTop(hint, hl)); ctx.restore();
      ctx.save(); ctx.setLineDash([10, 8]); ctx.lineWidth = 2 / (opt.zoom || 1); ctx.strokeStyle = "rgba(128,128,128,0.55)";
      ctx.strokeRect(-o.w / 2, -o.h / 2, o.w, o.h); ctx.restore();
      return;
    }
    if (empty) return;
    var lay = layoutText(o, th); drawTextBlock(ctx, o, th, lay, o.color, textTop(o, lay));
  }
  function drawShape(ctx, o, opt) {
    var th = opt.theme, p = shapePath(o), f = paint(ctx, o.fill, -o.w / 2, -o.h / 2, o.w, o.h, th);
    if (f) { ctx.fillStyle = f; ctx.fill(p); }
    if (o.strokeW > 0) { ctx.lineWidth = o.strokeW; ctx.strokeStyle = C().resolve(th, o.stroke); ctx.lineJoin = "round"; ctx.stroke(p); }
    if (o.text && o.text.trim()) {
      var t = { text: o.text, font: "@body", size: o.tsize || 36, weight: 600, w: o.w * 0.84, h: o.h, align: "center", valign: "middle", lh: 1.15, ls: 0, dir: "auto", bullets: "none", ps: 0, fit: "shrink", autoH: false };
      var lay = layoutText(t, th);
      ctx.save(); ctx.translate(0, 0);
      drawTextBlock(ctx, t, th, lay, o.tcolor, textTop(t, lay)); ctx.restore();
    }
  }
  function drawLine(ctx, o, opt) {
    var col = C().resolve(opt.theme, o.stroke), w = o.w, t = Math.max(0.5, o.h), ah = t * 3.2, x0 = -w / 2, x1 = w / 2;
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = t;
    ctx.lineCap = o.dash === "dot" ? "round" : "butt";
    ctx.setLineDash(o.dash === "dash" ? [t * 3, t * 2] : o.dash === "dot" ? [0.01, t * 2] : []);
    var s = o.start === "arrow" ? x0 + ah * 0.8 : x0, e = o.end === "arrow" ? x1 - ah * 0.8 : x1;
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(e, 0); ctx.stroke(); ctx.setLineDash([]);
    function cap(kind, x, d) {
      if (kind === "arrow") { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - d * ah, -ah * 0.6); ctx.lineTo(x - d * ah, ah * 0.6); ctx.closePath(); ctx.fill(); }
      if (kind === "dot") { ctx.beginPath(); ctx.arc(x, 0, t * 1.6, 0, Math.PI * 2); ctx.fill(); }
    }
    cap(o.start, x0, -1); cap(o.end, x1, 1);
  }
  function drawIcon(ctx, o, opt) {
    var p = iconPath(o.icon), col = C().resolve(opt.theme, o.color);
    ctx.save(); ctx.translate(-o.w / 2, -o.h / 2); ctx.scale(o.w / 24, o.h / 24);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = o.sw || 2;
    if (o.style === "fill") { ctx.fill(p, "evenodd"); ctx.lineWidth = 1; }
    ctx.stroke(p); ctx.restore();
  }
  function drawImage(ctx, o, opt) {
    var w = o.w, h = o.h, frame = rrect(new Path2D(), -w / 2, -h / 2, w, h, o.radius), img = getImg(opt.deck, o.src);
    if (!img) {
      if (!opt.editor) return;
      ctx.fillStyle = "rgba(127,140,155,0.22)"; ctx.fill(frame);
      ctx.save(); ctx.setLineDash([10, 8]); ctx.lineWidth = 2 / (opt.zoom || 1); ctx.strokeStyle = "rgba(128,128,128,0.6)"; ctx.stroke(frame); ctx.restore();
      ctx.save(); var k = Math.min(w, h) * 0.22; ctx.translate(-k / 2, -k / 2 - k * 0.25); ctx.scale(k / 24, k / 24);
      ctx.strokeStyle = "rgba(110,120,135,0.9)"; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke(new Path2D("M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-.01M21 15.5l-5-5L5 19")); ctx.restore();
      ctx.fillStyle = "rgba(110,120,135,0.95)"; ctx.font = "600 " + Math.max(12, k * 0.2) + "px Inter, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Double-click to add a picture", 0, k * 0.55);
      return;
    }
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, dw = w, dh = h;
    if (o.fit !== "stretch") { var k2 = o.fit === "contain" ? Math.min(w / iw, h / ih) : Math.max(w / iw, h / ih); dw = iw * k2; dh = ih * k2; }
    ctx.save(); ctx.clip(frame); ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); ctx.restore();
  }
  function lum(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(hex)); if (!m) return 0.5;
    return (0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16)) / 255;
  }
  // Right-to-left tables put the first column on the right.
  function tableRtl(o) { return textDir({ text: o.rows.map(function (r) { return r.join(" "); }).join(" ") }) === "rtl"; }
  function drawTable(ctx, o, opt) {
    var th = opt.theme, L = tableLayout(o, th), x0 = -o.w / 2, y = -o.h / 2, cols = o.rows[0].length;
    var band = C().resolve(th, "@bg2"), border = C().resolve(th, o.border), lw = Math.max(1, o.size / 18);
    var rtl = tableRtl(o);
    o.rows.forEach(function (r, ri) {
      var rh = L.rowH[ri], head = o.header && ri === 0, dataRow = o.header ? ri - 1 : ri;
      if (head) { ctx.fillStyle = paint(ctx, o.headFill, x0, y, o.w, rh, th); ctx.fillRect(x0, y, o.w, rh); }
      else if (o.band && dataRow % 2 === 1) { ctx.fillStyle = band; ctx.fillRect(x0, y, o.w, rh); }
      r.forEach(function (txt, ci) {
        var cell = L.cells[ri][ci]; if (!txt) return;
        var cx = x0 + (rtl ? cols - 1 - ci : ci) * L.colW + L.pad, cy = y + L.pad;
        ctx.save(); ctx.translate(cx + cell.o.w / 2, cy + cell.lay.h / 2);
        var co = Object.assign({}, cell.o, { h: cell.lay.h, align: cell.lay.dir === "rtl" ? "right" : "left" });
        drawTextBlock(ctx, co, th, cell.lay, head ? o.headColor : o.color, 0); ctx.restore();
      });
      y += rh;
      if (ri < o.rows.length - 1) { ctx.fillStyle = border; ctx.globalAlpha *= 0.6; ctx.fillRect(x0, y - lw / 2, o.w, lw); ctx.globalAlpha /= 0.6; }
    });
    ctx.strokeStyle = border; ctx.lineWidth = lw; ctx.strokeRect(x0, -o.h / 2, o.w, o.h);
    ctx.save(); ctx.globalAlpha *= 0.45; ctx.fillStyle = border;
    for (var c = 1; c < cols; c++) ctx.fillRect(x0 + c * L.colW - lw / 2, -o.h / 2 + (o.header ? L.rowH[0] : 0), lw, o.h - (o.header ? L.rowH[0] : 0));
    ctx.restore();
  }

  // Entrance animation of one object: e = eased progress 0..1. W/H = slide size (for fly distances).
  function ease(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }
  function animFx(ctx, o, p, W) {
    var e = ease(p), t = o.anim.t;
    if (t === "appear") return;
    ctx.globalAlpha *= t === "fly-left" || t === "fly-right" ? Math.min(1, e * 1.6) : e;
    if (t === "rise") ctx.translate(0, (1 - e) * 60);
    if (t === "fly-left") ctx.translate(-(1 - e) * (o.x + o.w + 40), 0);
    if (t === "fly-right") ctx.translate((1 - e) * (W - o.x + 40), 0);
    if (t === "zoom") { var s = 0.55 + 0.45 * e; ctx.scale(s, s); }
  }
  function drawObject(ctx, o, opt) {
    if (o.hidden || o.id === opt.skip) return;
    var g = opt.groups && opt.groups.map[o.id];
    if (opt.step != null && g != null) { if (g >= opt.step) return; }
    ctx.save();
    ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
    if (opt.step != null && g === opt.step - 1 && opt.p != null && opt.p < 1) animFx(ctx, o, opt.p, opt.W || 1920);
    if (o.rot) ctx.rotate(o.rot * RAD);
    ctx.globalAlpha *= o.op == null ? 1 : o.op;
    if (o.type === "text") drawText(ctx, o, opt);
    else if (o.type === "shape") drawShape(ctx, o, opt);
    else if (o.type === "line") drawLine(ctx, o, opt);
    else if (o.type === "icon") drawIcon(ctx, o, opt);
    else if (o.type === "image") drawImage(ctx, o, opt);
    else if (o.type === "table") drawTable(ctx, o, opt);
    else if (o.type === "chart") { ctx.translate(-o.w / 2, -o.h / 2); SL.chart.draw(ctx, o, opt.theme); }
    ctx.restore();
  }
  // Draw a slide in slide units (caller sets the transform).
  // opt: {editor, skip, step (animation groups shown), p (progress of the last group), noObjects, zoom}
  function drawSlide(ctx, deck, slide, opt) {
    opt = opt || {};
    var D = C().dims(deck), th = SL.themeFor(C().theme(deck), slide.layout);
    var o2 = Object.assign({ deck: deck, theme: th, W: D.w, H: D.h }, opt);
    if (opt.step != null) o2.groups = C().steps(slide);
    ctx.fillStyle = paint(ctx, SL.slideBg(th, slide), 0, 0, D.w, D.h, th) || "#ffffff"; ctx.fillRect(0, 0, D.w, D.h);
    if (!opt.noDecor) SL.decor(C().theme(deck), slide, D.w, D.h).forEach(function (d) { drawObject(ctx, d, { deck: deck, theme: th, W: D.w }); });
    if (!opt.noObjects) slide.objects.forEach(function (o) { drawObject(ctx, o, o2); });
  }
  function slideCanvas(deck, slide, scale, opt) {
    var D = C().dims(deck), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(D.w * scale)); c.height = Math.max(1, Math.round(D.h * scale));
    var ctx = c.getContext("2d"); ctx.setTransform(c.width / D.w, 0, 0, c.height / D.h, 0, 0);
    drawSlide(ctx, deck, slide, opt); return c;
  }
  // Paint into an existing canvas sized w x h device pixels.
  function paintInto(canvas, deck, slide, opt) {
    var D = C().dims(deck), ctx = canvas.getContext("2d");
    ctx.setTransform(canvas.width / D.w, 0, 0, canvas.height / D.h, 0, 0); drawSlide(ctx, deck, slide, opt);
  }

  SL.render = {
    fontStack: fontStack, fontCss: fontCss, textDir: textDir, layoutText: layoutText, layoutAt: layoutAt, lineX: lineX, textTop: textTop,
    levelOf: levelOf, tableLayout: tableLayout, tableRtl: tableRtl, fitObj: fitObj, fitAll: fitAll, paint: paint, shapePath: shapePath, rrect: rrect,
    drawObject: drawObject, drawSlide: drawSlide, slideCanvas: slideCanvas, paintInto: paintInto, getImg: getImg, ensureImages: ensureImages,
    lum: lum, onImage: null, clearCache: function () { cache = {}; cacheN = 0; kcache = {}; tcache = {}; }
  };
})();
