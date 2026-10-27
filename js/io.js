/* Slides I/O: .pptx (PptxGenJS), PDF (pdf-lib), PNG per slide (zip), .s3slides files and IndexedDB autosave.
   Nothing here touches the network: files are built in memory and handed to the browser as downloads.
   PptxGenJS only ever gets data: URIs for pictures, never URLs. */
(function () {
  "use strict";
  var SL = window.SL = window.SL || {};
  function C() { return SL.core; }
  function R() { return SL.render; }

  function slug(s) { return (String(s || "slides").toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)) || "slides"; }
  function toBlob(canvas, type, q) {
    return new Promise(function (res, rej) { canvas.toBlob(function (b) { if (b) res(b); else rej(new Error("The browser could not encode this image (too large?)")); }, type, q); });
  }
  function blobBytes(b) { return b.arrayBuffer().then(function (ab) { return new Uint8Array(ab); }); }
  function pngSize(bytes) { var dv = new DataView(bytes.buffer, bytes.byteOffset); return { w: dv.getUint32(16), h: dv.getUint32(20) }; }

  // ---------- colours for OOXML: "RRGGBB" + transparency 0..100 ----------
  function hexA(c) {
    if (c && typeof c === "object" && c.c) c = c.c[0];
    c = String(c || "#000000").trim();
    var m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
    if (m) return { hex: (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase(), t: 0 };
    m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
    if (m) return { hex: m[1].toUpperCase(), t: m[2] ? Math.round((1 - parseInt(m[2], 16) / 255) * 100) : 0 };
    m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i.exec(c);
    if (m) return { hex: [m[1], m[2], m[3]].map(function (v) { return (+v).toString(16).padStart(2, "0"); }).join("").toUpperCase(), t: m[4] != null ? Math.round((1 - +m[4]) * 100) : 0 };
    return { hex: "000000", t: c === "transparent" ? 100 : 0 };
  }
  var PPT_SHAPE = { rect: "rect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", pentagon: "pentagon", hexagon: "hexagon", star: "star5", arrow: "rightArrow", heart: "heart" };
  function exportFont(f) { return f === "Inter" ? "Arial" : f; }

  // Draw one object on its own canvas (no rotation: the file rotates it), for icons, charts and pictures.
  function objectPng(deck, o, th, maxPx) {
    var k = Math.min(3, (maxPx || 2400) / Math.max(o.w, o.h, 1)), c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(o.w * k)); c.height = Math.max(2, Math.round(o.h * k));
    var ctx = c.getContext("2d"); ctx.scale(c.width / o.w, c.height / o.h);
    var copy = Object.assign({}, o, { x: 0, y: 0, rot: 0, op: 1, anim: null });
    R().drawObject(ctx, copy, { deck: deck, theme: th, W: o.w });
    return c.toDataURL("image/png");
  }
  function bgImage(deck, slide) {
    var c = R().slideCanvas(deck, slide, 1, { noObjects: true });
    var url = c.toDataURL("image/png"); c.width = c.height = 1; return url;     // PNG: the file names it .png
  }

  // ---------- .pptx ----------
  function pptxDeck(deck) {
    if (typeof PptxGenJS !== "function") throw new Error("The .pptx library failed to load");
    var P = new PptxGenJS(), D = C().dims(deck), IN = 10 / D.w, PT = 720 / D.w, base = C().theme(deck);
    P.layout = deck.ratio === "4:3" ? "LAYOUT_4x3" : "LAYOUT_16x9";
    P.title = deck.name; P.company = ""; P.author = "S3eidat Slides";
    if (base.rtl) P.rtlMode = true;
    deck.slides.forEach(function (slide) {
      var s = P.addSlide(), th = SL.themeFor(base, slide.layout);
      if (slide.hidden) s.hidden = true;
      var bg = SL.slideBg(th, slide), decor = SL.decor(base, slide, D.w, D.h);
      if (typeof bg === "string" && !decor.length) s.background = { color: hexA(C().resolve(th, bg)).hex };
      else s.background = { data: bgImage(deck, slide) };
      slide.objects.forEach(function (o) {
        if (o.hidden) return;
        var box = { x: o.x * IN, y: o.y * IN, w: o.w * IN, h: o.h * IN };
        if (o.rot) box.rotate = ((o.rot % 360) + 360) % 360;
        if (o.type === "text") {
          if (!String(o.text || "").trim()) return;
          var lay = R().layoutText(o, th), col = hexA(C().resolve(th, o.color)), paras = String(o.text).split("\n");
          var runs = paras.map(function (raw, i) {
            var p = R().levelOf(raw), op = { breakLine: i < paras.length - 1 };
            if (o.bullets === "bullet") op.bullet = true; else if (o.bullets === "number") op.bullet = { type: "number" };
            if (p.lvl) op.indentLevel = p.lvl;
            if (o.ps) op.paraSpaceAfter = o.size * o.ps * PT * (lay.size / o.size);
            return { text: p.s, options: op };
          });
          s.addText(runs, Object.assign(box, { fontFace: exportFont(C().resolveFont(th, o.font)), fontSize: Math.max(1, Math.round(lay.size * PT * 10) / 10), color: col.hex,
            transparency: Math.max(col.t, Math.round((1 - o.op) * 100)) || undefined, bold: o.weight >= 600, italic: !!o.italic, underline: o.underline ? { style: "sng" } : undefined,
            align: o.align, valign: o.valign === "middle" ? "middle" : o.valign === "bottom" ? "bottom" : "top", margin: 0, lineSpacingMultiple: o.lh || 1.2,
            rtlMode: lay.dir === "rtl", wrap: true }));
        } else if (o.type === "shape") {
          var f = C().resolve(th, o.fill), fc = f ? hexA(f) : null, sc = hexA(C().resolve(th, o.stroke)), opts = Object.assign(box, {
            fill: fc ? { color: fc.hex, transparency: Math.min(100, fc.t + Math.round((1 - o.op) * 100)) } : { type: "none" },
            line: o.strokeW > 0 ? { color: sc.hex, width: o.strokeW * PT } : { type: "none" } });
          var shape = PPT_SHAPE[o.shape] || "rect";
          if (shape === "rect" && o.radius > 0) { shape = "roundRect"; opts.rectRadius = Math.min(0.5, o.radius / Math.max(1, Math.min(o.w, o.h))); }
          opts.shape = shape;
          if (o.text && o.text.trim()) {
            var tc = hexA(C().resolve(th, o.tcolor));
            s.addText(o.text, Object.assign(opts, { fontFace: exportFont(C().resolveFont(th, "@body")), fontSize: Math.round(o.tsize * PT), color: tc.hex, bold: true, align: "center", valign: "middle", margin: 0 }));
          } else s.addShape(shape, opts);
        } else if (o.type === "line") {
          var lc = hexA(C().resolve(th, o.stroke)), arrow = { arrow: "triangle", dot: "oval" };
          var lo = { x: o.x * IN, y: (o.y + o.h / 2) * IN, w: o.w * IN, h: 0, line: { color: lc.hex, width: Math.max(0.25, o.h * PT), transparency: Math.round((1 - o.op) * 100) || undefined,
            dashType: o.dash === "dash" ? "dash" : o.dash === "dot" ? "sysDot" : "solid" } };
          if (o.start !== "none") lo.line.beginArrowType = arrow[o.start];
          if (o.end !== "none") lo.line.endArrowType = arrow[o.end];
          if (o.rot) lo.rotate = box.rotate;
          s.addShape("line", lo);
        } else if (o.type === "table") {
          var L = R().tableLayout(o, th), tcol = hexA(C().resolve(th, o.color)), hf = hexA(C().resolve(th, o.headFill)), hcol = hexA(C().resolve(th, o.headColor));
          var band = hexA(C().resolve(th, "@bg2")), bc = hexA(C().resolve(th, o.border));
          var rows = o.rows.map(function (r, ri) {
            var head = o.header && ri === 0, dataRow = o.header ? ri - 1 : ri;
            return r.map(function (t) {
              var op = { color: head ? hcol.hex : tcol.hex, bold: head };
              if (head) op.fill = { color: hf.hex }; else if (o.band && dataRow % 2 === 1) op.fill = { color: band.hex };
              if (R().textDir({ text: t }) === "rtl") { op.align = "right"; op.rtlMode = true; }
              return { text: t, options: op };
            });
          });
          if (R().tableRtl(o)) rows.forEach(function (r) { r.reverse(); });
          s.addTable(rows, { x: box.x, y: box.y, w: box.w, colW: o.rows[0].map(function () { return L.colW * IN; }), rowH: L.rowH.map(function (h) { return h * IN; }),
            fontFace: exportFont(C().resolveFont(th, o.font)), fontSize: Math.round(o.size * PT * 10) / 10, valign: "top", margin: L.pad * PT,
            border: { type: "solid", pt: Math.max(0.5, o.size / 18 * PT), color: bc.hex } });
        } else if (o.type === "image" && !o.src) {
          return;
        } else {      // icon, chart, image: a picture that looks exactly like the slide
          var img = Object.assign(box, { data: objectPng(deck, o, th) });
          if (o.op < 1) img.transparency = Math.round((1 - o.op) * 100);
          s.addImage(img);
        }
      });
      if (slide.notes && slide.notes.trim()) s.addNotes(slide.notes);
    });
    return P;
  }
  function pptxBlob(deck) {
    return R().ensureImages(deck).then(function () { return pptxDeck(deck).write({ outputType: "blob" }); });
  }

  // ---------- PDF: one page per slide, high-resolution image + invisible selectable Latin text ----------
  var WIN_ANSI = /^[\x20-\x7E -ÿ–—‘’“”•…€]*$/;
  function pageSizePt(deck) { return deck.ratio === "4:3" ? { w: 720, h: 540 } : { w: 720, h: 405 }; }
  function pdfBytes(deck, slides, opts) {
    var L = window.PDFLib; opts = opts || {};
    if (!L) return Promise.reject(new Error("PDF library failed to load"));
    var size = pageSizePt(deck), D = C().dims(deck), k = size.w / D.w, base = C().theme(deck);
    return R().ensureImages(deck).then(function () { return L.PDFDocument.create(); }).then(function (pdf) {
      pdf.setTitle(deck.name); pdf.setCreator("S3eidat Slides"); pdf.setProducer("S3eidat Slides (pdf-lib)");
      return pdf.embedFont(L.StandardFonts.Helvetica).then(function (font) {
        var chain = Promise.resolve();
        slides.forEach(function (slide) {
          chain = chain.then(function () {
            var c = R().slideCanvas(deck, slide, opts.scale || 1, {});
            return toBlob(c, "image/jpeg", opts.quality || 0.92).then(blobBytes).then(function (b) { return pdf.embedJpg(b); }).then(function (img) {
              var pg = pdf.addPage([size.w, size.h]);
              pg.drawImage(img, { x: 0, y: 0, width: size.w, height: size.h });
              if (opts.textLayer !== false) textLayer(pg, slide, SL.themeFor(base, slide.layout), font, k, size.h);
              c.width = c.height = 1;
            });
          });
        });
        return chain.then(function () { return pdf.save(); });
      });
    });
  }
  function textLayer(pg, slide, th, font, k, H) {
    slide.objects.forEach(function (o) {
      if (o.type !== "text" || o.hidden || Math.abs(o.rot || 0) > 0.01 || !String(o.text || "").trim()) return;
      var lay = R().layoutText(o, th); if (lay.dir === "rtl") return;
      var top = o.y + R().textTop(o, lay), size = lay.size * k;
      lay.lines.forEach(function (ln) {
        if (!ln.s || !WIN_ANSI.test(ln.s)) return;
        try {
          var px = R().lineX(o, lay, ln), tw = font.widthOfTextAtSize(ln.s, size), w = ln.w * k;
          var x = (o.x + (px.a === "left" ? px.x : px.a === "right" ? px.x - ln.w : px.x - ln.w / 2)) * k;
          var y = H - (top + ln.y) * k - size * 0.35;
          pg.drawText(ln.s, { x: x, y: y, size: size * (tw > 0 ? Math.min(3, Math.max(0.3, w / tw)) : 1), font: font, opacity: 0 });
        } catch (e) { /* a character the standard font cannot encode: the image still shows it */ }
      });
    });
  }

  // ---------- PNG per slide ----------
  function slidePng(deck, slide, scale) {
    return R().ensureImages(deck).then(function () { return toBlob(R().slideCanvas(deck, slide, scale, {}), "image/png"); }).then(blobBytes);
  }

  // ---------- files ----------
  function deckJson(deck) { return JSON.stringify(deck); }
  function openDeck(text) { var d = C().sanitizeDeck(text); R().fitAll(d); return d; }

  // ---------- IndexedDB ----------
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("No IndexedDB"));
      var rq = indexedDB.open("s3-slides", 1);
      rq.onupgradeneeded = function () { var d = rq.result; if (!d.objectStoreNames.contains("decks")) d.createObjectStore("decks", { keyPath: "id" }); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction("decks", mode), out = fn(t.objectStore("decks"));
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error("Storage aborted")); };
      });
    });
  }
  var store = {
    put: function (rec) { return tx("readwrite", function (s) { s.put(rec); }); },
    get: function (id) { return tx("readonly", function (s) { return s.get(id); }); },
    del: function (id) { return tx("readwrite", function (s) { s.delete(id); }); },
    list: function () {
      return tx("readonly", function (s) { return s.getAll(); }).then(function (all) {
        return (all || []).map(function (r) { return { id: r.id, name: r.name, updated: r.updated, count: r.count, ratio: r.ratio, thumb: r.thumb }; })
          .sort(function (a, b) { return b.updated - a.updated; });
      });
    }
  };

  SL.io = { slug: slug, toBlob: toBlob, blobBytes: blobBytes, pngSize: pngSize, hexA: hexA, pptxDeck: pptxDeck, pptxBlob: pptxBlob,
    pdfBytes: pdfBytes, pageSizePt: pageSizePt, slidePng: slidePng, deckJson: deckJson, openDeck: openDeck, store: store, objectPng: objectPng };
})();
