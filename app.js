/* Slides — self-test and demo. The editor lives in js/ (core, themes, render, chart, io, present, editor). */
(function () {
  "use strict";
  const SL = window.SL;

  window.S3_DEMO = async function () {
    await SL.ed.ready;
    const d = SL.sampleDeck("midnight", "16:9", true);
    SL.ed.openDeck(d, { quiet: true });
    SL.ed.goSlide(3);
    const chart = SL.ed.slide().objects.filter(o => o.type === "chart")[0];
    if (chart) SL.ed.select([chart.id]);
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise(r => setTimeout(r, 200));
  };

  // Read the file names in a zip's central directory (no decompression needed).
  function zipNames(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let e = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) return null;
    const n = dv.getUint16(e + 10, true), names = [];
    let p = dv.getUint32(e + 16, true);
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) return null;
      const ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true);
      names.push(new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + ln))); p += 46 + ln + lx + lc;
    }
    return names;
  }

  window.S3_SELFTEST = async function () {
    const C = SL.core, R = SL.render, IO = SL.io, fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
    const roles = d => d.slides.map(s => s.objects.filter(o => o.ph).map(o => o.ph).join(","));

    // 1. deck model: add / move / duplicate / delete slides + undo / redo
    const d = C.newDeck("paper", "16:9", "t"), H = new C.History();
    H.reset(d);
    ok(d.slides.length === 1 && d.slides[0].layout === "title" && C.dims(d).w === 1920, "new deck has a title slide");
    const s2 = C.addSlide(d, 1, "content"); s2.objects[0].text = "Second"; H.commit(d);
    const s3 = C.addSlide(d, 2, "two"); s3.objects[0].text = "Third"; H.commit(d);
    ok(d.slides.length === 3 && d.slides[1].id === s2.id, "add slide at index");
    ok(C.moveSlide(d, 2, 0) && d.slides[0].id === s3.id && d.slides[2].id === s2.id, "move slide");
    H.commit(d);
    const dup = C.duplicateSlide(d, 0);
    ok(d.slides.length === 4 && d.slides[1] === dup && dup.id !== s3.id && dup.objects[0].id !== s3.objects[0].id && dup.objects[0].text === "Third", "duplicate slide with new ids");
    H.commit(d);
    ok(C.deleteSlide(d, 1) && d.slides.length === 3, "delete slide");
    const one = C.newDeck("paper"); ok(!C.deleteSlide(one, 0) && one.slides.length === 1, "last slide cannot be deleted");
    H.commit(d);
    H.undo(d); ok(d.slides.length === 4, "undo delete");
    H.undo(d); H.undo(d); ok(d.slides.length === 3 && d.slides[2].objects[0].text === "Third", "undo move");
    H.redo(d); H.redo(d); H.redo(d); ok(d.slides.length === 3 && d.slides[0].objects[0].text === "Third", "redo");
    ok(!H.commit(d), "no-op commit ignored");

    // 2. layouts: placeholders by role, text kept when the layout changes, nothing lost
    const L = C.newDeck("paper", "16:9");
    const want = { title: "title,subtitle", content: "title,body", two: "title,body,body2", section: "title,subtitle", image: "title,image,caption", titleonly: "title", big: "number,caption", blank: "" };
    Object.keys(want).forEach(id => { const s = C.addSlide(L, L.slides.length, id); ok(roles({ slides: [s] })[0] === want[id], "layout " + id + " placeholders"); });
    ok(C.LAYOUTS.length >= 6, "at least 6 layouts");
    const ls = C.addSlide(L, 1, "two"); ls.objects[0].text = "Keep me"; ls.objects[2].text = "Right column";
    C.applyLayout(L, ls, "content");
    ok(ls.objects[0].ph === "title" && ls.objects[0].text === "Keep me", "title text kept on layout change");
    ok(ls.objects.some(o => !o.ph && o.text === "Right column"), "filled placeholder without a slot becomes a normal box");
    ok(ls.objects.filter(o => o.ph === "body").length === 1, "new body placeholder");
    const body = C.layoutBoxes("content", 1920, 1080, SL.THEMES[0])[1];
    ok(body.bullets === "bullet" && body.fit === "shrink" && body.x > 0 && body.y > 200, "body placeholder geometry");

    // 3. themes: roles resolve per theme, RTL mirrors placeholders, title colours
    ok(SL.THEMES.length >= 8 && SL.THEMES.filter(t => t.rtl).length >= 1, "8+ themes incl. RTL");
    const KEYS = ["bg", "bg2", "text", "head", "accent", "accent2", "accent3", "muted", "onaccent"];
    ok(SL.THEMES.every(t => KEYS.every(k => C.isColor(t.colors[k]) && t.colors[k].charAt(0) === "#") && t.fonts.head && t.fonts.body), "every theme defines every colour role");
    const T = C.newDeck("paper", "16:9"); const tt = T.slides[0].objects[0]; tt.text = "Hello";
    const plain = C.addSlide(T, 1, "blank"); plain.objects.push(C.make("text", { text: "Box", x: 100, y: 100, w: 300, align: "left" }));
    ok(C.resolve(C.theme(T), "@accent") === "#c4572f", "role resolves in paper");
    C.applyTheme(T, "noor");
    const nt = T.slides[0].objects[0], D = C.dims(T), lb = C.layoutBoxes("title", D.w, D.h, C.theme(T))[0];
    ok(T.theme === "noor" && nt.text === "Hello" && nt.dir === "rtl" && nt.align === "right" && near(nt.x, D.w - lb.x - lb.w), "RTL theme mirrors placeholders");
    ok(near(plain.objects[0].x, 1920 - 400) && plain.objects[0].align === "right", "RTL theme mirrors free objects");
    ok(C.resolve(C.theme(T), "@accent") === "#c8963e", "role resolves in new theme");
    ok(!C.applyTheme(T, "nope") && T.theme === "noor", "unknown theme refused");
    const mint = SL.THEMES.filter(t => t.id === "mint")[0];
    ok(SL.themeFor(mint, "title").colors.head === "#ffffff" && SL.themeFor(mint, "content").colors.head === "#0b3b3a", "title slides can use their own colours");
    C.setRatio(T, "4:3"); ok(C.dims(T).w === 1440 && T.slides[0].objects[0].w < lb.w, "4:3 re-lays placeholders");

    // 4. slide show state machine: hidden slides, animation steps, back, goto, end, blank
    const P = C.newDeck("paper");
    const a1 = C.addSlide(P, 1, "blank"), a2 = C.addSlide(P, 2, "blank"), a3 = C.addSlide(P, 3, "blank");
    a2.hidden = true;
    const o1 = C.make("shape", { anim: { t: "fade", with: false, n: 1 } }), o2 = C.make("shape", { anim: { t: "rise", with: true, n: 2 } }), o3 = C.make("shape", { anim: { t: "zoom", with: false, n: 3 } });
    a1.objects.push(o1, o2, o3);
    const st = C.steps(a1); ok(st.count === 2 && st.map[o1.id] === 0 && st.map[o2.id] === 0 && st.map[o3.id] === 1, "with-previous joins a step");
    const S = new C.Show(P, 0);
    ok(S.order.join() === "0,1,3", "hidden slide skipped");
    const seq = [];
    for (let i = 0; i < 7; i++) { const r = S.next(); seq.push(r + ":" + S.slideIndex() + "." + S.step); }
    ok(seq.join(" ") === "slide:1.0 step:1.1 step:1.2 slide:3.0 end:3.0 null:3.0 null:3.0", "next sequence " + seq.join(" "));
    ok(S.prev() === "slide" && !S.state().ended, "back from the end");
    ok(S.prev() === "back" && S.slideIndex() === 1 && S.step === 2, "back to previous slide fully built");
    ok(S.prev() === "stepback" && S.step === 1, "step back");
    ok(S.peek().slide === 1 && S.peek().step === 2, "peek next step");
    ok(S.gotoNumber(3) === "slide" && S.slideIndex() === 3 && S.step === 0, "go to slide number");
    ok(S.toggleBlank("black") === "blank" && S.state().blank === "black" && S.next() === "blank" && !S.state().blank && S.slideIndex() === 3, "black screen then resume");
    ok(S.first() === "slide" && S.prev() === null, "nothing before the first slide");
    ok(new C.Show(P, 2).slideIndex() === 3, "start on a hidden slide jumps forward");
    const allHidden = C.newDeck("paper"); allHidden.slides[0].hidden = true; ok(new C.Show(allHidden).order.length === 1, "all hidden still shows");
    ok(C.moveAnim(a1, o3.id, -1) && C.animated(a1)[1].id === o3.id, "reorder animation");

    // 5. charts: data -> geometry
    const bar = C.make("chart", { kind: "bar", w: 600, h: 400, size: 20, legend: false, values: false, data: { labels: ["A", "B"], series: [{ name: "s", values: [10, 20] }] } });
    const g = SL.chart.geom(bar), b0 = g.bars[0], b1 = g.bars[1];
    ok(g.scale.lo === 0 && g.scale.hi === 20 && g.ticks.length === 5, "nice axis 0..20 step 5");
    ok(near(b1.h, g.plot.h, 1e-6) && near(b0.h * 2, b1.h, 1e-6) && near(b0.y + b0.h, g.y0) && near(b1.y, g.plot.y), "bar heights follow values");
    ok(b0.x < b1.x && b0.x >= g.plot.x && b1.x + b1.w <= g.plot.x + g.plot.w, "bars inside the plot");
    const neg = SL.chart.geom(Object.assign({}, bar, { data: { labels: ["A", "B"], series: [{ name: "s", values: [-5, 15] }] } }));
    ok(neg.scale.lo < 0 && near(neg.bars[0].y, neg.y0) && neg.bars[1].y + neg.bars[1].h <= neg.y0 + 1e-6, "negative bars go down from zero");
    const two = SL.chart.geom(Object.assign({}, bar, { legend: true, data: { labels: ["A"], series: [{ name: "x", values: [1] }, { name: "y", values: [2] }] } }));
    ok(two.bars.length === 2 && near(two.bars[1].x - two.bars[0].x, two.bars[0].w / 0.88) && two.legend.length === 2, "grouped bars + legend");
    const ln = SL.chart.geom(Object.assign({}, bar, { kind: "line", data: { labels: ["A", "B", "C"], series: [{ name: "s", values: [1, 3, 2] }] } }));
    ok(ln.lines[0].pts.length === 3 && ln.lines[0].pts[1].y < ln.lines[0].pts[2].y && ln.lines[0].pts[2].y < ln.lines[0].pts[0].y, "line points");
    const pie = SL.chart.geom(Object.assign({}, bar, { kind: "pie", data: { labels: ["a", "b", "c"], series: [{ name: "s", values: [1, 1, 2] }] } }));
    const deg = pie.slices.map(s => Math.round((s.a1 - s.a0) * 180 / Math.PI));
    ok(deg.join() === "90,90,180" && near(pie.slices[0].a0, -Math.PI / 2) && near(pie.slices[2].a1, Math.PI * 1.5), "pie angles");
    ok(SL.chart.niceStep(7) === 10 && SL.chart.niceStep(0.3) === 0.5 && SL.chart.fmt(12500) === "12.5k", "nice steps and labels");

    // 6. text layout: bullet levels, numbering, shrink-to-fit, RTL
    const th0 = SL.THEMES[0];
    const tx = C.make("text", { text: "One\n\tTwo\n\t\tThree\nFour", bullets: "number", size: 20, w: 800, font: "Arial" });
    const lay = R.layoutText(tx, th0);
    ok(lay.lines.length === 4 && lay.lines[1].ind > lay.lines[0].ind && lay.lines[2].ind > lay.lines[1].ind, "levels indent");
    ok(lay.lines.map(l => l.b).join("|") === "1.|a.|i.|2.", "numbering per level " + lay.lines.map(l => l.b).join("|"));
    const big = C.make("text", { text: "A long title that cannot possibly fit in this tiny box at this size", size: 80, w: 400, h: 100, autoH: false, fit: "shrink", font: "Arial" });
    const bl = R.layoutText(big, th0); ok(bl.size < 80 && bl.h <= 100.5, "shrink to fit");
    const ar = C.make("text", { text: "مرحبا بكم", size: 30, w: 500, align: "right", font: "Tahoma" }), al = R.layoutText(ar, th0);
    ok(al.dir === "rtl" && near(R.lineX(ar, al, al.lines[0]).x, 500), "RTL text aligns right");
    const arb = C.make("text", { text: "نقطة", size: 30, w: 500, bullets: "bullet", align: "right", font: "Tahoma" }), abl = R.layoutText(arb, th0);
    ok(R.lineX(arb, abl, abl.lines[0]).x < 500 && R.lineX(arb, abl, abl.lines[0]).bx === 500, "RTL bullets on the right");

    // 7. rendering: pixels, animations hidden before their step, placeholders hidden outside the editor
    const rd = C.newDeck("mono", "16:9"), rs = C.addSlide(rd, 1, "blank");
    rs.objects.push(C.make("shape", { x: 100, y: 100, w: 200, h: 200, fill: "#ff0000" }), C.make("shape", { x: 600, y: 100, w: 200, h: 200, fill: "#0000ff", anim: { t: "fade", with: false, n: 1 } }));
    const px = (c, x, y) => c.getContext("2d").getImageData(x, y, 1, 1).data;
    let cvs = R.slideCanvas(rd, rs, 0.5, {}); ok(px(cvs, 100, 100)[0] > 250 && px(cvs, 350, 100)[2] > 250, "rendered pixels");
    cvs = R.slideCanvas(rd, rs, 0.5, { step: 0 }); ok(px(cvs, 350, 100)[2] > 250 && px(cvs, 350, 100)[0] > 250, "animated object hidden before its click");
    cvs = R.slideCanvas(rd, rs, 0.5, { step: 1, p: 1 }); ok(px(cvs, 350, 100)[2] > 250 && px(cvs, 350, 100)[0] < 5, "animated object shown after its click");
    cvs = R.slideCanvas(rd, rd.slides[0], 0.25, {}); const e1 = px(cvs, 240, 110);
    cvs = R.slideCanvas(rd, rd.slides[0], 0.25, { editor: true }); ok(e1[0] > 250 && e1[1] > 250, "empty placeholder not drawn in the show");
    SL.THEMES.forEach(t => { const td = SL.sampleDeck(t.id, "16:9", false); try { td.slides.forEach(s => R.slideCanvas(td, s, 0.05, { editor: true })); } catch (e) { ok(false, "theme " + t.id + " renders: " + e.message); } });

    // 8. .s3slides round trip
    const sd = SL.sampleDeck("forest", "4:3", true), tiny = document.createElement("canvas"); tiny.width = tiny.height = 2;
    sd.assets.a1 = tiny.toDataURL("image/png");
    const im = C.addSlide(sd, 6, "image"); im.objects.filter(o => o.type === "image")[0].src = "a1"; im.bg = { t: "lin", a: 45, c: ["@accent", "#123456"] }; im.hidden = true;
    sd.slides[1].objects.push(C.make("line", { stroke: "@accent", end: "arrow", dash: "dash", h: 4 }), C.make("icon", { icon: "rocket" }), C.make("shape", { shape: "star", text: "Hi", fill: "", stroke: "#ff00aa", strokeW: 3 }));
    R.fitAll(sd);
    const back = IO.openDeck(IO.deckJson(sd));
    ok(C.stable(back) === C.stable(sd), "s3slides round trip is lossless");

    // 9. hostile files are rejected or neutralised
    const evil = { format: "s3slides", version: 1, name: "<img src=x onerror=alert(1)>", ratio: "99:1", theme: "../../x",
      assets: { good: tiny.toDataURL("image/png"), svg: "data:image/svg+xml;base64,PHN2Zz4=", js: "javascript:alert(1)", "../x": "data:image/png;base64,AAAA" },
      slides: [{ layout: "<script>", bg: "url(javascript:alert(1))", notes: "<b>n</b>", hidden: "yes", transition: { type: "explode", dur: 1e9 }, objects: [
        { type: "script", x: 1 },
        { type: "text", text: "<b>hi</b>", font: 'Arial"; background:url(//evil.example/x)', size: -5, color: "expression(alert(1))", x: "NaN", weight: 950, ph: "evil", bullets: "<li>", anim: { t: "explode" } },
        { type: "image", src: "js" }, { type: "image", src: "svg" }, { type: "image", src: "good" },
        JSON.parse('{"type":"shape","__proto__":{"polluted":1},"shape":"<svg>","fill":{"t":"lin","c":["red","#fff"]},"onclick":"alert(1)"}'),
        { type: "table", rows: [["a", "b", "c"], ["only one"], "not a row", [1, { x: 1 }]], size: "big" },
        { type: "chart", kind: "donut", data: { labels: ["a", "b"], series: [{ name: "<i>", values: ["1e999", "x", 5, 7] }], extra: 1 } }
      ] }] };
    const sv = C.sanitizeDeck(JSON.stringify(evil)), ob = sv.slides[0].objects;
    ok(sv.ratio === "16:9" && sv.theme === SL.THEMES[0].id && sv.name === "<img src=x onerror=alert(1)>", "deck fields defaulted (name kept as plain text)");
    ok(Object.keys(sv.assets).join() === "good", "only raster data: images kept");
    ok(sv.slides[0].layout === "blank" && sv.slides[0].bg === null && sv.slides[0].hidden === false && sv.slides[0].transition.type === "none" && sv.slides[0].transition.dur === 3, "slide fields checked");
    ok(ob.length === 7, "unknown object types dropped");
    const t0 = ob[0];
    ok(t0.text === "<b>hi</b>" && !/["();:\/]/.test(t0.font) && t0.size === 1 && t0.color === "@text" && t0.x === 0 && t0.weight === 900 && t0.ph === "" && t0.bullets === "none" && t0.anim === null, "text fields sanitised");
    ok(ob[1].src === "" && ob[2].src === "" && ob[3].src === "good", "image sources checked");
    ok(ob[4].shape === "rect" && ob[4].fill === "#cccccc" && !("onclick" in ob[4]) && ({}).polluted === undefined, "shape fields whitelisted");
    ok(ob[5].rows.length === 3 && ob[5].rows.every(r => r.length === 3 && r.every(c => typeof c === "string")) && ob[5].size === 26, "table made rectangular, strings only");
    ok(ob[6].kind === "bar" && ob[6].data.series[0].values.join() === "0,0" && ob[6].data.series[0].name === "<i>" && !("extra" in ob[6].data), "chart data checked");
    const span = S3.h("span", { text: t0.text }); ok(span.innerHTML === "&lt;b&gt;hi&lt;/b&gt;", "text shown as text, never HTML");
    ["not json", "[]", "{}", '{"format":"s3design"}', '{"format":"s3slides","version":99}'].forEach(bad => { let threw = false; try { C.sanitizeDeck(bad); } catch (e) { threw = true; } ok(threw, "rejects " + bad); });
    let big2 = false; try { C.sanitizeDeck({ format: "s3slides", slides: [{ objects: new Array(C.LIMITS.objects + 5).fill({ type: "shape" }) }] }); } catch (e) { big2 = true; } ok(big2, "object limit enforced");

    // 10. .pptx: a real zip with one slide part per slide, notes, a table, hidden flag
    const xd = SL.sampleDeck("mint", "16:9", true); xd.slides[2].hidden = true;
    xd.assets.p = tiny.toDataURL("image/png"); const xi = C.addSlide(xd, 6, "image"); xi.objects.filter(o => o.type === "image")[0].src = "p"; xi.notes = "";
    let blob = null;
    try { blob = await IO.pptxBlob(xd); } catch (e) { ok(false, "pptx export threw: " + (e && e.message)); }
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer()), names = zipNames(bytes) || [];
      ok(bytes[0] === 0x50 && bytes[1] === 0x4B, "pptx is a zip");
      ok(names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length === xd.slides.length, "one slide part per slide (" + names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length + ")");
      ok(names.indexOf("[Content_Types].xml") >= 0 && names.indexOf("ppt/presentation.xml") >= 0, "pptx core parts");
      ok(names.filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n)).length >= 6, "speaker notes parts");
      ok(names.some(n => /^ppt\/media\//.test(n)), "pictures embedded");
      if (window.JSZip) {
        const z = await window.JSZip.loadAsync(bytes), x1 = await z.file("ppt/slides/slide1.xml").async("string"), x3 = await z.file("ppt/slides/slide3.xml").async("string"), x5 = await z.file("ppt/slides/slide5.xml").async("string");
        const x2 = await z.file("ppt/slides/slide2.xml").async("string");
        ok(x1.indexOf("Project Orbit") >= 0, "title text in slide 1");
        ok(/show="0"/.test(x3) && !/show="0"/.test(x1), "hidden slide stays hidden");
        ok(x5.indexOf("<a:tbl>") >= 0 && x5.indexOf("Offline mode") >= 0, "table is a real table");
        ok(/<a:buChar/.test(x2) && /lvl="1"/.test(x2), "bullets with levels");
      } else ok(false, "JSZip (inside PptxGenJS) not available");
    }

    // 11. PDF page count and size; PNG size
    const pd = SL.sampleDeck("sunset", "16:9", false); pd.slides[1].hidden = true;
    const vis = pd.slides.filter(s => !s.hidden), pb = await IO.pdfBytes(pd, vis, { scale: 0.25, quality: 0.7 });
    const PL = await PDFLib.PDFDocument.load(pb), psz = PL.getPage(0).getSize();
    ok(PL.getPageCount() === 5 && near(psz.width, 720, 0.01) && near(psz.height, 405, 0.01), "PDF: one 16:9 page per visible slide");
    const p43 = C.newDeck("paper", "4:3"), pb2 = await PDFLib.PDFDocument.load(await IO.pdfBytes(p43, p43.slides, { scale: 0.1 }));
    ok(near(pb2.getPage(0).getSize().height, 540, 0.01), "PDF 4:3 size");
    const png = await IO.slidePng(pd, pd.slides[0], 0.25), pz = IO.pngSize(png);
    ok(png[1] === 0x50 && pz.w === 480 && pz.h === 270, "PNG size");
    ok(IO.hexA("rgba(255,0,0,0.5)").hex === "FF0000" && IO.hexA("rgba(255,0,0,0.5)").t === 50 && IO.hexA("#abc").hex === "AABBCC", "colour conversion for pptx");

    // 12. every layout in every theme survives the validator
    SL.THEMES.forEach(t => {
      const td = C.newDeck(t.id); C.LAYOUTS.forEach(l => C.addSlide(td, td.slides.length, l.id));
      const back2 = C.sanitizeDeck(IO.deckJson(td));
      ok(back2.slides.length === td.slides.length && back2.slides.every((s, i) => s.objects.length === td.slides[i].objects.length), "theme " + t.id + " layouts round trip");
    });
    ok(Object.keys(SL.ICONS).every(k => { try { return !!new Path2D(SL.ICONS[k]); } catch (e) { return false; } }), "icons parse");
    ok(C.snapAngle(359.2, false, false) === 359.2 && C.snapAngle(359, false, false) === 359 && C.snapAngle(89.5, false, false) === 90 && C.snapAngle(37, true) === 30 && C.snapAngle(0.6, false, true) === 0.6, "rotation snapping keeps 359°");

    return fails.length ? fails : true;
  };
})();
