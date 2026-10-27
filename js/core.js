/* Slides core: deck model, slide operations, layouts, geometry, snapping, history, file validation and the
   slide-show navigation state machine. Pure logic (no DOM drawing): shared by the editor, the show, the
   exporters and the self-test. Geometry and history are adapted from Design Studio's core. */
(function () {
  "use strict";
  var SL = window.SL = window.SL || {};

  // ---------- ids ----------
  var seq = 0;
  function uid(p) { seq = (seq + 1) % 1e6; return (p || "o") + Date.now().toString(36) + seq.toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  // ---------- geometry ----------
  var RAD = Math.PI / 180;
  function rotPt(x, y, cx, cy, deg) {
    var a = deg * RAD, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }
  function center(o) { return { x: o.x + o.w / 2, y: o.y + o.h / 2 }; }
  function corners(o) {
    var c = center(o), r = o.rot || 0;
    return [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map(function (p) { return rotPt(p[0], p[1], c.x, c.y, r); });
  }
  function aabb(o) {
    var cs = corners(o), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    cs.forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function unionBox(list) {
    if (!list.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (o) { var b = aabb(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function hit(o, px, py, pad) {
    pad = pad || 0;
    var c = center(o), p = rotPt(px, py, c.x, c.y, -(o.rot || 0));
    return p.x >= o.x - pad && p.x <= o.x + o.w + pad && p.y >= o.y - pad && p.y <= o.y + o.h + pad;
  }
  function hitTest(objects, px, py, pad) {
    for (var i = objects.length - 1; i >= 0; i--) {
      var o = objects[i];
      if (o.hidden) continue;
      if (hit(o, px, py, o.type === "line" ? (pad || 0) * 2.5 : (pad || 0))) return o;
    }
    return null;
  }
  function boxesIntersect(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  // Resize a (rotated) box by dragging handle hd to page point p; the opposite side stays put.
  function resizeBox(o, hd, p, keep, min) {
    min = min || 4;
    var r = o.rot || 0, c = center(o), lp = rotPt(p.x, p.y, c.x, c.y, -r);
    var sx = hd.indexOf("w") >= 0 ? -1 : hd.indexOf("e") >= 0 ? 1 : 0, sy = hd.indexOf("n") >= 0 ? -1 : hd.indexOf("s") >= 0 ? 1 : 0;
    var ax = sx === 0 ? c.x : (sx < 0 ? o.x + o.w : o.x), ay = sy === 0 ? c.y : (sy < 0 ? o.y + o.h : o.y);
    var w = o.w, h = o.h;
    if (sx) w = Math.max(min, (lp.x - ax) * sx);
    if (sy) h = Math.max(min, (lp.y - ay) * sy);
    if (keep && sx && sy) { var k = Math.max(w / o.w, h / o.h); w = Math.max(min, o.w * k); h = Math.max(min, o.h * k); }
    else if (keep && sx && !sy) h = Math.max(min, o.h * w / o.w);
    else if (keep && sy && !sx) w = Math.max(min, o.w * h / o.h);
    var ncx = sx === 0 ? c.x : ax + sx * w / 2, ncy = sy === 0 ? c.y : ay + sy * h / 2, wc = rotPt(ncx, ncy, c.x, c.y, r);
    return { x: wc.x - w / 2, y: wc.y - h / 2, w: w, h: h };
  }

  // ---------- snapping ----------
  function snapTargets(slide, W, H, excludeIds) {
    var xs = [0, W / 2, W, W * 0.06, W * 0.94], ys = [0, H / 2, H, H * 0.08, H * 0.92];
    slide.objects.forEach(function (o) {
      if (o.hidden || excludeIds.indexOf(o.id) >= 0) return;
      var b = aabb(o); xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    });
    return { xs: xs, ys: ys };
  }
  function snapBox(box, t, thr) {
    function best(vals, lines) {
      var b = null;
      vals.forEach(function (v) { lines.forEach(function (l) { var d = l - v; if (Math.abs(d) <= thr && (!b || Math.abs(d) < Math.abs(b.d))) b = { d: d, at: l }; }); });
      return b;
    }
    var bx = best([box.x, box.x + box.w / 2, box.x + box.w], t.xs), by = best([box.y, box.y + box.h / 2, box.y + box.h], t.ys), g = [];
    if (bx) g.push({ axis: "x", at: bx.at });
    if (by) g.push({ axis: "y", at: by.at });
    return { dx: bx ? bx.d : 0, dy: by ? by.d : 0, guides: g };
  }
  // Rotation: Shift = 15° steps; otherwise only a 0.75° pull towards 0/90/180/270, so 359° stays 359°. free = no snap at all.
  function snapAngle(deg, steps, free) {
    deg = ((deg % 360) + 360) % 360;
    if (steps) return Math.round(deg / 15) * 15 % 360;
    if (!free) for (var a = 0; a <= 360; a += 90) if (Math.abs(deg - a) < 0.75) return a % 360;
    return Math.round(deg * 10) / 10 % 360;
  }

  // ---------- deck model ----------
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  var RATIOS = { "16:9": [1920, 1080], "4:3": [1440, 1080] };
  function dims(deck) { var r = RATIOS[deck.ratio] || RATIOS["16:9"]; return { w: r[0], h: r[1] }; }
  var DEFAULTS = {
    text: { text: "", font: "@body", size: 40, weight: 400, italic: false, underline: false, color: "@text", align: "left", valign: "top",
      lh: 1.2, ls: 0, dir: "auto", bullets: "none", ps: 0, autoH: true, fit: "none", ph: "" },
    shape: { shape: "rect", fill: "@accent", stroke: "@text", strokeW: 0, radius: 0, text: "", tcolor: "@onaccent", tsize: 36 },
    line: { stroke: "@text", dash: "solid", start: "none", end: "none" },
    icon: { icon: "star", color: "@accent", sw: 2, style: "stroke" },
    image: { src: "", fit: "cover", radius: 0, ph: "" },
    table: { rows: [["Header", "Header"], ["", ""]], header: true, band: true, size: 26, font: "@body", color: "@text", headFill: "@accent", headColor: "@onaccent", border: "@muted" },
    chart: { kind: "bar", data: { labels: ["A", "B", "C"], series: [{ name: "Series 1", values: [3, 5, 4] }] }, legend: true, values: true, size: 22, font: "@body" }
  };
  function make(type, props) {
    var o = { id: uid(), type: type, x: 0, y: 0, w: 100, h: 100, rot: 0, op: 1, locked: false, hidden: false, name: "", anim: null };
    var d = DEFAULTS[type] || {};
    for (var k in d) o[k] = clone(d[k]);
    for (var j in props || {}) o[j] = props[j];
    if (type === "line") o.h = Math.max(1, o.h);
    return o;
  }
  function newSlide(layout) {
    return { id: uid("s"), layout: layout || "blank", bg: null, hidden: false, notes: "", transition: { type: "none", dur: 0.6 }, objects: [] };
  }
  function newDeck(themeId, ratio, name) {
    var d = { format: "s3slides", version: 1, id: uid("d"), name: name || "Untitled presentation", ratio: RATIOS[ratio] ? ratio : "16:9",
      theme: themeId || "paper", slides: [], assets: {} };
    var s = newSlide("title"); d.slides.push(s); applyLayout(d, s, "title");
    return d;
  }
  function find(slide, id) { for (var i = 0; i < slide.objects.length; i++) if (slide.objects[i].id === id) return slide.objects[i]; return null; }
  function indexOf(slide, id) { for (var i = 0; i < slide.objects.length; i++) if (slide.objects[i].id === id) return i; return -1; }
  function cloneWithIds(o) { var c = clone(o); c.id = uid(); return c; }

  // ---------- slide operations ----------
  function addSlide(deck, at, layout) {
    var s = newSlide(layout || "content"), prev = deck.slides[Math.max(0, Math.min(at - 1, deck.slides.length - 1))];
    if (prev && prev.transition) s.transition = clone(prev.transition);
    at = at == null ? deck.slides.length : Math.max(0, Math.min(at, deck.slides.length));
    deck.slides.splice(at, 0, s); applyLayout(deck, s, s.layout);
    return s;
  }
  function moveSlide(deck, from, to) {
    var n = deck.slides.length; if (from < 0 || from >= n) return false;
    to = Math.max(0, Math.min(to, n - 1)); if (to === from) return false;
    var s = deck.slides.splice(from, 1)[0]; deck.slides.splice(to, 0, s); return true;
  }
  function duplicateSlide(deck, i) {
    var src = deck.slides[i]; if (!src) return null;
    var s = clone(src); s.id = uid("s"); s.objects = s.objects.map(cloneWithIds);
    deck.slides.splice(i + 1, 0, s); return s;
  }
  function deleteSlide(deck, i) {
    if (deck.slides.length < 2 || !deck.slides[i]) return false;
    deck.slides.splice(i, 1); return true;
  }

  // ---------- layouts: placeholder geometry depends on the theme (title alignment, right-to-left) ----------
  var LAYOUTS = [
    { id: "title", name: "Title slide" }, { id: "content", name: "Title and content" }, { id: "two", name: "Two columns" },
    { id: "section", name: "Section header" }, { id: "image", name: "Image and caption" }, { id: "titleonly", name: "Title only" },
    { id: "big", name: "Big number" }, { id: "blank", name: "Blank" }
  ];
  var PH_HINT = { title: "Click to add title", subtitle: "Click to add subtitle", body: "Click to add text", body2: "Click to add text",
    caption: "Click to add a caption", number: "42%", image: "" };
  var PH_ROLES = ["title", "subtitle", "body", "body2", "caption", "number", "image"];
  function theme(deck) { return (SL.THEMES && SL.THEMES.filter(function (t) { return t.id === deck.theme; })[0]) || (SL.THEMES && SL.THEMES[0]) || { colors: {}, fonts: {} }; }
  function layoutBoxes(layout, W, H, th) {
    var m = W * 0.065, top = H * 0.07, tH = H * 0.16, bodyY = top + tH + H * 0.04, bodyH = H - bodyY - H * 0.08, cw = (W - m * 2 - W * 0.04) / 2;
    var center = th.titleAlign === "center", T = th.type || {};
    var head = T.head || 72, body = T.body || 40;
    function t(ph, x, y, w, h, size, o) {
      o = o || {};
      return Object.assign({ ph: ph, x: x, y: y, w: w, h: h, size: size, font: ph === "title" || ph === "number" ? "@head" : "@body",
        color: ph === "title" || ph === "number" ? "@head" : ph === "subtitle" || ph === "caption" ? "@muted" : "@text",
        weight: ph === "title" ? (T.headWeight || 700) : ph === "number" ? 800 : 400, align: center && (ph === "title" || ph === "subtitle") ? "center" : "left",
        valign: "top", autoH: false, fit: "shrink", bullets: ph === "body" || ph === "body2" ? "bullet" : "none", ps: ph === "body" || ph === "body2" ? 0.45 : 0, lh: ph === "title" ? 1.1 : 1.25 }, o);
    }
    switch (layout) {
      case "title": return [t("title", m * 1.4, H * 0.3, W - m * 2.8, H * 0.26, head * 1.35, { valign: "bottom" }),
        t("subtitle", m * 1.4, H * 0.6, W - m * 2.8, H * 0.14, body * 1.05)];
      case "section": return [t("title", m * 1.4, H * 0.36, W - m * 2.8, H * 0.2, head * 1.2, { valign: "bottom" }),
        t("subtitle", m * 1.4, H * 0.6, W - m * 2.8, H * 0.12, body)];
      case "content": return [t("title", m, top, W - m * 2, tH, head, { valign: "middle" }), t("body", m, bodyY, W - m * 2, bodyH, body)];
      case "two": return [t("title", m, top, W - m * 2, tH, head, { valign: "middle" }), t("body", m, bodyY, cw, bodyH, body * 0.92),
        t("body2", m + cw + W * 0.04, bodyY, cw, bodyH, body * 0.92)];
      case "image": return [t("title", m, top, W - m * 2, tH, head * 0.9, { valign: "middle" }),
        { type: "image", ph: "image", x: m, y: bodyY, w: W * 0.56, h: bodyH },
        t("caption", m + W * 0.56 + W * 0.04, bodyY, W - m * 2 - W * 0.6, bodyH, body * 0.9, { valign: "middle", align: "left", color: "@text" })];
      case "titleonly": return [t("title", m, top, W - m * 2, tH, head, { valign: "middle" })];
      case "big": return [t("number", m, H * 0.2, W - m * 2, H * 0.36, head * 3, { valign: "bottom", align: "center", color: "@accent" }),
        t("caption", m * 2, H * 0.6, W - m * 4, H * 0.18, body * 1.1, { align: "center" })];
      default: return [];
    }
  }
  function mirror(o, W, th) {
    if (!th.rtl) return o;
    o.x = W - o.x - o.w;
    if (o.type !== "image") { o.dir = "rtl"; if (o.align === "left") o.align = "right"; }
    return o;
  }
  // Put a layout's placeholders on a slide. Text already typed into a placeholder with the same role is
  // kept; filled placeholders the new layout doesn't have become normal objects (nothing is lost).
  function applyLayout(deck, slide, layout) {
    var th = theme(deck), D = dims(deck), old = {}, keep = [];
    slide.objects.forEach(function (o) {
      if (!o.ph) { keep.push(o); return; }
      var filled = o.type === "image" ? !!o.src : !!(o.text && o.text.trim());
      if (filled) old[o.ph] = o;
    });
    var fresh = layoutBoxes(layout, D.w, D.h, th).map(function (b) {
      var o = make(b.type || "text", b); delete o.type; o.type = b.type || "text";
      mirror(o, D.w, th);
      var prev = old[b.ph] || (b.ph === "body" && old.body2 && !old.body ? null : null);
      if (prev && prev.type === o.type) {
        if (o.type === "image") { o.src = prev.src; o.fit = prev.fit; }
        else { o.text = prev.text; ["bold", "italic", "underline"].forEach(function (k) { if (prev[k] != null) o[k] = prev[k]; }); if (prev.bullets !== o.bullets && o.ph !== "body" && o.ph !== "body2") o.bullets = prev.bullets; }
        o.id = prev.id; o.anim = prev.anim; delete old[b.ph];
      }
      return o;
    });
    Object.keys(old).forEach(function (k) { var o = old[k]; o.ph = ""; keep.push(o); });
    slide.layout = LAYOUTS.some(function (l) { return l.id === layout; }) ? layout : "blank";
    slide.objects = fresh.concat(keep);
    return slide;
  }
  // Change the theme of a whole deck: colours and fonts follow automatically (objects use theme roles);
  // placeholders move to the new theme's layout geometry (e.g. right-to-left).
  function applyTheme(deck, themeId) {
    if (!SL.THEMES.some(function (t) { return t.id === themeId; })) return false;
    var was = theme(deck); deck.theme = themeId;
    var now = theme(deck), D = dims(deck);
    deck.slides.forEach(function (s) {
      if (was.rtl !== now.rtl) s.objects.forEach(function (o) {
        if (o.ph) return;
        o.x = D.w - o.x - o.w;
        if (o.type === "text") { if (o.align === "left") o.align = "right"; else if (o.align === "right") o.align = "left"; o.dir = now.rtl ? "rtl" : "auto"; }
      });
      applyLayout(deck, s, s.layout);
    });
    return true;
  }
  // 16:9 <-> 4:3: placeholders are laid out again; other objects are scaled uniformly and centred.
  function setRatio(deck, ratio) {
    if (!RATIOS[ratio] || ratio === deck.ratio) return false;
    var a = dims(deck); deck.ratio = ratio; var b = dims(deck);
    var k = Math.min(b.w / a.w, b.h / a.h), ox = (b.w - a.w * k) / 2, oy = (b.h - a.h * k) / 2;
    deck.slides.forEach(function (s) {
      s.objects.forEach(function (o) {
        if (o.ph) return;
        o.x = o.x * k + ox; o.y = o.y * k + oy; o.w *= k; if (o.type !== "line") o.h *= k; else o.h = Math.max(1, o.h * k);
        if (o.type === "text") o.size = Math.max(4, o.size * k);
        if (o.type === "table" || o.type === "chart") o.size = Math.max(4, o.size * k);
        if (o.type === "shape") { o.strokeW *= k; o.radius *= k; o.tsize = Math.max(4, o.tsize * k); }
      });
      applyLayout(deck, s, s.layout);
    });
    return true;
  }

  // ---------- z-order, align, distribute ----------
  function reorder(slide, ids, dir) {
    var objs = slide.objects, sel = objs.filter(function (o) { return ids.indexOf(o.id) >= 0; }), rest = objs.filter(function (o) { return ids.indexOf(o.id) < 0; });
    if (dir === "top") slide.objects = rest.concat(sel);
    else if (dir === "bottom") slide.objects = sel.concat(rest);
    else {
      var arr = objs.slice(), step = dir === "up" ? 1 : -1, order = arr.map(function (o, i) { return i; });
      if (dir === "up") order.reverse();
      order.forEach(function (i) { var j = i + step; if (ids.indexOf(arr[i].id) >= 0 && j >= 0 && j < arr.length && ids.indexOf(arr[j].id) < 0) { var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } });
      slide.objects = arr;
    }
  }
  function align(objs, how, W, H) {
    var ref = objs.length > 1 ? unionBox(objs) : { x: 0, y: 0, w: W, h: H };
    objs.forEach(function (o) {
      var b = aabb(o), dx = 0, dy = 0;
      if (how === "left") dx = ref.x - b.x; if (how === "hcenter") dx = ref.x + ref.w / 2 - (b.x + b.w / 2); if (how === "right") dx = ref.x + ref.w - (b.x + b.w);
      if (how === "top") dy = ref.y - b.y; if (how === "vcenter") dy = ref.y + ref.h / 2 - (b.y + b.h / 2); if (how === "bottom") dy = ref.y + ref.h - (b.y + b.h);
      o.x += dx; o.y += dy;
    });
  }
  function distribute(objs, axis) {
    if (objs.length < 3) return;
    var items = objs.map(function (o) { return { o: o, b: aabb(o) }; }), k = axis === "h" ? "x" : "y", s = axis === "h" ? "w" : "h";
    items.sort(function (a, b) { return a.b[k] - b.b[k]; });
    var first = items[0].b, last = items[items.length - 1].b, total = items.reduce(function (t, i) { return t + i.b[s]; }, 0);
    var gap = (last[k] + last[s] - first[k] - total) / (items.length - 1), pos = first[k];
    items.forEach(function (i) { i.o[k] += pos - i.b[k]; pos += i.b[s] + gap; });
  }

  // ---------- entrance animations: steps in a slide ----------
  var ANIMS = [["appear", "Appear"], ["fade", "Fade in"], ["rise", "Rise up"], ["fly-left", "Fly in from left"], ["fly-right", "Fly in from right"], ["zoom", "Zoom in"]];
  function animated(slide) {
    return slide.objects.filter(function (o) { return o.anim && !o.hidden; }).sort(function (a, b) { return (a.anim.n || 0) - (b.anim.n || 0); });
  }
  // Groups of objects that appear together, one group per click. "with previous" joins the group before.
  function steps(slide) {
    var groups = [], map = {};
    animated(slide).forEach(function (o) {
      if (!groups.length || !o.anim.with) groups.push([]);
      groups[groups.length - 1].push(o.id); map[o.id] = groups.length - 1;
    });
    return { groups: groups, map: map, count: groups.length };
  }
  function renumberAnims(slide) { animated(slide).forEach(function (o, i) { o.anim.n = i + 1; }); }
  function moveAnim(slide, id, dir) {
    var list = animated(slide), i = list.map(function (o) { return o.id; }).indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    list.forEach(function (o, k) { o.anim.n = k + 1; }); return true;
  }

  // ---------- slide show navigation (one state machine drives the audience screen and presenter view) ----------
  function Show(deck, startIndex) {
    this.deck = deck;
    var order = []; deck.slides.forEach(function (s, i) { if (!s.hidden) order.push(i); });
    if (!order.length) order = deck.slides.map(function (s, i) { return i; });
    this.order = order; this.pos = 0; this.step = 0; this.ended = false; this.blank = null;
    if (startIndex != null) { var p = order.indexOf(startIndex); if (p < 0) p = order.filter(function (i) { return i < startIndex; }).length; this.pos = Math.min(p, order.length - 1); }
  }
  Show.prototype.slideIndex = function () { return this.order[this.pos]; };
  Show.prototype.slide = function () { return this.deck.slides[this.slideIndex()]; };
  Show.prototype.stepCount = function (pos) { return steps(this.deck.slides[this.order[pos == null ? this.pos : pos]]).count; };
  Show.prototype.state = function () { return { pos: this.pos, slide: this.slideIndex(), step: this.step, ended: this.ended, blank: this.blank, total: this.order.length }; };
  // Each move returns what changed: "step" (an animation), "slide", "end", "blank" or null (nothing to do).
  Show.prototype.next = function () {
    if (this.blank) { this.blank = null; return "blank"; }
    if (this.ended) return null;
    if (this.step < this.stepCount()) { this.step++; return "step"; }
    if (this.pos < this.order.length - 1) { this.pos++; this.step = 0; return "slide"; }
    this.ended = true; return "end";
  };
  Show.prototype.prev = function () {
    if (this.blank) { this.blank = null; return "blank"; }
    if (this.ended) { this.ended = false; this.step = this.stepCount(); return "slide"; }
    if (this.step > 0) { this.step--; return "stepback"; }
    if (this.pos > 0) { this.pos--; this.step = this.stepCount(); return "back"; }
    return null;
  };
  Show.prototype.go = function (pos, built) {
    pos = Math.max(0, Math.min(this.order.length - 1, pos | 0));
    var changed = pos !== this.pos || this.ended;
    this.pos = pos; this.ended = false; this.blank = null; this.step = built ? this.stepCount() : 0;
    return changed ? "slide" : null;
  };
  Show.prototype.gotoNumber = function (n) { return this.go(n - 1, false); };      // the number shown as "n / total"
  Show.prototype.first = function () { return this.go(0, false); };
  Show.prototype.last = function () { return this.go(this.order.length - 1, false); };
  Show.prototype.toggleBlank = function (kind) { this.blank = this.blank === kind ? null : kind; return "blank"; };
  // What the next click will show (for the presenter's "next" preview).
  Show.prototype.peek = function () {
    if (this.ended) return null;
    if (this.step < this.stepCount()) return { slide: this.slideIndex(), step: this.step + 1 };
    if (this.pos < this.order.length - 1) return { slide: this.order[this.pos + 1], step: 0 };
    return { end: true };
  };

  // ---------- history (snapshots of everything except image data, which never changes once added) ----------
  function History(limit) { this.stack = []; this.i = -1; this.limit = limit || 150; }
  History.prototype.snap = function (d) { return JSON.stringify({ name: d.name, ratio: d.ratio, theme: d.theme, slides: d.slides }); };
  History.prototype.reset = function (d) { this.stack = [this.snap(d)]; this.i = 0; };
  History.prototype.commit = function (d) {
    var s = this.snap(d); if (this.stack[this.i] === s) return false;
    this.stack = this.stack.slice(0, this.i + 1); this.stack.push(s);
    if (this.stack.length > this.limit) this.stack.shift();
    this.i = this.stack.length - 1; return true;
  };
  History.prototype.apply = function (d, s) { var v = JSON.parse(s); d.name = v.name; d.ratio = v.ratio; d.theme = v.theme; d.slides = v.slides; };
  History.prototype.undo = function (d) { if (this.i <= 0) return false; this.i--; this.apply(d, this.stack[this.i]); return true; };
  History.prototype.redo = function (d) { if (this.i >= this.stack.length - 1) return false; this.i++; this.apply(d, this.stack[this.i]); return true; };
  History.prototype.canUndo = function () { return this.i > 0; };
  History.prototype.canRedo = function () { return this.i < this.stack.length - 1; };

  // ---------- colours: "#hex", "rgba(...)", a theme role "@accent", or a gradient {t:"lin", a, c:[c1, c2]} ----------
  var COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)|transparent)$/;
  var ROLE = /^@(bg|bg2|text|head|accent|accent2|accent3|muted|onaccent)$/;
  function isColor(c) { return typeof c === "string" && (COLOR.test(c.trim()) || ROLE.test(c)); }
  function resolve(th, c) {
    if (typeof c === "string" && c.charAt(0) === "@") return (th.colors && th.colors[c.slice(1)]) || "#888888";
    if (c && typeof c === "object" && c.c) return { t: "lin", a: c.a, c: [resolve(th, c.c[0]), resolve(th, c.c[1])] };
    return c;
  }
  function resolveFont(th, f) { return f === "@head" ? (th.fonts && th.fonts.head) || "Inter" : f === "@body" ? (th.fonts && th.fonts.body) || "Inter" : f || "Inter"; }

  // ---------- .s3slides validation: every field rebuilt from a whitelist ----------
  var LIMITS = { slides: 500, objects: 6000, text: 20000, assetBytes: 60e6, rows: 40, cols: 12, labels: 60, series: 10 };
  var SHAPES = ["rect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star", "arrow", "heart"];
  var IMG_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;
  var TRANSITIONS = ["none", "fade", "slide", "push", "zoom"];
  function num(v, lo, hi, d) { v = Number(v); if (!isFinite(v)) return d; return Math.min(hi, Math.max(lo, v)); }
  function str(v, max, d) { return typeof v === "string" ? v.slice(0, max) : (d == null ? "" : d); }
  function pick(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
  function bool(v) { return v === true; }
  function color(v, d) { return isColor(v) ? v.trim() : d; }
  function cleanId(v) { return typeof v === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(v) ? v : uid(); }
  function cleanFont(v) {
    if (v === "@head" || v === "@body") return v;
    var f = str(v, 80, "@body").replace(/["'`;:{}()<>\\\/@!]/g, "").replace(/\s+/g, " ").trim();
    return f || "@body";
  }
  function fill(v, d) {
    if (v === "") return "";
    if (v && typeof v === "object" && v.t === "lin" && Array.isArray(v.c) && v.c.length >= 2 && isColor(v.c[0]) && isColor(v.c[1]))
      return { t: "lin", a: num(v.a, -360, 360, 90), c: [v.c[0].trim(), v.c[1].trim()] };
    return color(v, d);
  }
  var MAXC = 1e5;
  function cleanObj(o, assets, count) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    var type = pick(o.type, ["text", "shape", "line", "icon", "image", "table", "chart"], null);
    if (!type) return null;
    if (++count.n > LIMITS.objects) throw new Error("Too many objects in this file");
    var c = make(type);
    c.id = cleanId(o.id); c.x = num(o.x, -MAXC, MAXC, 0); c.y = num(o.y, -MAXC, MAXC, 0);
    c.w = num(o.w, 0.5, MAXC, 100); c.h = num(o.h, 0.5, MAXC, 100); c.rot = num(o.rot, -360, 360, 0); c.op = num(o.op, 0, 1, 1);
    c.locked = bool(o.locked); c.hidden = bool(o.hidden); c.name = str(o.name, 120);
    c.anim = o.anim && typeof o.anim === "object" && pick(o.anim.t, ANIMS.map(function (a) { return a[0]; }), null)
      ? { t: o.anim.t, with: bool(o.anim.with), n: num(o.anim.n, 0, 1e5, 0) } : null;
    if (type === "text" || type === "image") c.ph = pick(o.ph, PH_ROLES, "");
    if (type === "text") {
      c.text = str(o.text, LIMITS.text, ""); c.font = cleanFont(o.font); c.size = num(o.size, 1, 2000, 40);
      c.weight = Math.round(num(o.weight, 100, 900, 400) / 100) * 100; c.italic = bool(o.italic); c.underline = bool(o.underline);
      c.color = color(o.color, "@text"); c.align = pick(o.align, ["left", "center", "right"], "left"); c.valign = pick(o.valign, ["top", "middle", "bottom"], "top");
      c.lh = num(o.lh, 0.5, 4, 1.2); c.ls = num(o.ls, -200, 2000, 0); c.dir = pick(o.dir, ["auto", "ltr", "rtl"], "auto");
      c.bullets = pick(o.bullets, ["none", "bullet", "number"], "none"); c.ps = num(o.ps, 0, 4, 0);
      c.autoH = o.autoH !== false; c.fit = pick(o.fit, ["none", "shrink"], "none");
    } else if (type === "shape") {
      c.shape = pick(o.shape, SHAPES, "rect"); c.fill = fill(o.fill, "#cccccc"); c.stroke = color(o.stroke, "@text");
      c.strokeW = num(o.strokeW, 0, 2000, 0); c.radius = num(o.radius, 0, MAXC, 0);
      c.text = str(o.text, 2000, ""); c.tcolor = color(o.tcolor, "@onaccent"); c.tsize = num(o.tsize, 1, 1000, 36);
    } else if (type === "line") {
      c.stroke = color(o.stroke, "@text"); c.dash = pick(o.dash, ["solid", "dash", "dot"], "solid");
      c.start = pick(o.start, ["none", "arrow", "dot"], "none"); c.end = pick(o.end, ["none", "arrow", "dot"], "none"); c.h = num(o.h, 0.5, 400, 4);
    } else if (type === "icon") {
      c.icon = SL.ICONS && SL.ICONS[o.icon] ? o.icon : "star"; c.color = color(o.color, "@accent");
      c.style = pick(o.style, ["stroke", "fill"], "stroke"); c.sw = num(o.sw, 0.25, 8, 2);
    } else if (type === "image") {
      c.src = typeof o.src === "string" && Object.prototype.hasOwnProperty.call(assets, o.src) ? o.src : "";
      c.fit = pick(o.fit, ["cover", "contain", "stretch"], "cover"); c.radius = num(o.radius, 0, MAXC, 0);
    } else if (type === "table") {
      var rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, LIMITS.rows).filter(Array.isArray);
      var cols = Math.max(1, Math.min(LIMITS.cols, rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0)));
      c.rows = rows.length ? rows.map(function (r) { var out = []; for (var i = 0; i < cols; i++) out.push(str(r[i], 2000, "")); return out; }) : [[""]];
      c.header = bool(o.header); c.band = bool(o.band); c.size = num(o.size, 4, 400, 26); c.font = cleanFont(o.font);
      c.color = color(o.color, "@text"); c.headFill = color(o.headFill, "@accent"); c.headColor = color(o.headColor, "@onaccent"); c.border = color(o.border, "@muted");
    } else if (type === "chart") {
      c.kind = pick(o.kind, ["bar", "line", "pie"], "bar");
      var d = o.data && typeof o.data === "object" ? o.data : {};
      var labels = (Array.isArray(d.labels) ? d.labels : []).slice(0, LIMITS.labels).map(function (s) { return str(String(s == null ? "" : s), 80, ""); });
      if (!labels.length) labels = [""];
      var series = (Array.isArray(d.series) ? d.series : []).slice(0, LIMITS.series).filter(function (s) { return s && typeof s === "object"; }).map(function (s, i) {
        var vals = Array.isArray(s.values) ? s.values : [];
        return { name: str(s.name, 80, "Series " + (i + 1)), values: labels.map(function (_, j) { return num(vals[j], -1e12, 1e12, 0); }) };
      });
      if (!series.length) series = [{ name: "Series 1", values: labels.map(function () { return 0; }) }];
      c.data = { labels: labels, series: series }; c.legend = bool(o.legend); c.values = bool(o.values);
      c.size = num(o.size, 4, 400, 22); c.font = cleanFont(o.font);
    }
    return c;
  }
  function sanitizeDeck(input) {
    var data = input;
    if (typeof input === "string") { try { data = JSON.parse(input); } catch (e) { throw new Error("This is not a valid presentation file (bad JSON)"); } }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("This is not a Slides presentation");
    if (data.format !== "s3slides") throw new Error("This is not a Slides presentation (.s3slides)");
    if (num(data.version, 0, 1e6, 0) > 1) throw new Error("This presentation was made by a newer version");
    var assets = {}, total = 0, src = data.assets && typeof data.assets === "object" && !Array.isArray(data.assets) ? data.assets : {};
    Object.keys(src).slice(0, 800).forEach(function (k) {
      var v = src[k];
      if (!/^[A-Za-z0-9_-]{1,48}$/.test(k) || typeof v !== "string" || !IMG_URL.test(v)) return;
      total += v.length; if (total > LIMITS.assetBytes * 1.37) throw new Error("Images in this file are too large");
      assets[k] = v;
    });
    var ids = (SL.THEMES || []).map(function (t) { return t.id; });
    var deck = { format: "s3slides", version: 1, id: cleanId(data.id), name: str(data.name, 120, "Untitled presentation").trim() || "Untitled presentation",
      ratio: pick(data.ratio, Object.keys(RATIOS), "16:9"), theme: pick(data.theme, ids, ids[0] || "paper"), slides: [], assets: assets };
    var count = { n: 0 };
    deck.slides = (Array.isArray(data.slides) ? data.slides.slice(0, LIMITS.slides) : []).map(function (s) {
      if (!s || typeof s !== "object" || Array.isArray(s)) return null;
      var tr = s.transition && typeof s.transition === "object" ? s.transition : {};
      return { id: cleanId(s.id), layout: pick(s.layout, LAYOUTS.map(function (l) { return l.id; }), "blank"), bg: s.bg == null ? null : fill(s.bg, null),
        hidden: bool(s.hidden), notes: str(s.notes, LIMITS.text, ""), transition: { type: pick(tr.type, TRANSITIONS, "none"), dur: num(tr.dur, 0.1, 3, 0.6) },
        objects: (Array.isArray(s.objects) ? s.objects : []).map(function (o) { return cleanObj(o, assets, count); }).filter(Boolean) };
    }).filter(Boolean);
    if (!deck.slides.length) deck.slides = [newSlide("blank")];
    return deck;
  }
  function stable(v) {
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }

  SL.core = {
    uid: uid, rotPt: rotPt, center: center, corners: corners, aabb: aabb, unionBox: unionBox, hit: hit, hitTest: hitTest, boxesIntersect: boxesIntersect,
    resizeBox: resizeBox, snapTargets: snapTargets, snapBox: snapBox, snapAngle: snapAngle, clone: clone, RATIOS: RATIOS, dims: dims, make: make,
    newSlide: newSlide, newDeck: newDeck, find: find, indexOf: indexOf, cloneWithIds: cloneWithIds, addSlide: addSlide, moveSlide: moveSlide,
    duplicateSlide: duplicateSlide, deleteSlide: deleteSlide, LAYOUTS: LAYOUTS, PH_HINT: PH_HINT, theme: theme, layoutBoxes: layoutBoxes,
    applyLayout: applyLayout, applyTheme: applyTheme, setRatio: setRatio, reorder: reorder, align: align, distribute: distribute,
    ANIMS: ANIMS, animated: animated, steps: steps, renumberAnims: renumberAnims, moveAnim: moveAnim, Show: Show, History: History,
    isColor: isColor, resolve: resolve, resolveFont: resolveFont, sanitizeDeck: sanitizeDeck, stable: stable, SHAPES: SHAPES,
    TRANSITIONS: TRANSITIONS, LIMITS: LIMITS
  };
})();
