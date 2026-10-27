/* Slides charts: our own bar / line / pie renderer. geom() is pure maths (data -> boxes, points, angles)
   so it can be tested; draw() paints it with the theme's colours. */
(function () {
  "use strict";
  var SL = window.SL = window.SL || {};

  function niceStep(raw) {
    if (!(raw > 0)) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / e;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  }
  function scale(values) {
    var lo = Math.min(0, Math.min.apply(null, values)), hi = Math.max(0, Math.max.apply(null, values));
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi === lo) hi = lo + 1;
    var step = niceStep((hi - lo) / 5);
    lo = Math.floor(lo / step + 1e-9) * step; hi = Math.ceil(hi / step - 1e-9) * step;
    var ticks = []; for (var v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { lo: lo, hi: hi, step: step, ticks: ticks };
  }
  function fmt(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return +(v / 1e9).toFixed(1) + "B"; if (a >= 1e6) return +(v / 1e6).toFixed(1) + "M"; if (a >= 1e4) return +(v / 1e3).toFixed(1) + "k";
    return String(+v.toFixed(2));
  }
  function textW(s, size) { return String(s).length * size * 0.56; }

  // Geometry in the chart's own box (0,0)-(w,h).
  function geom(o) {
    var W = o.w, H = o.h, S = o.size || 22, d = o.data, n = d.labels.length, ns = d.series.length;
    var out = { kind: o.kind, S: S, legend: [] };
    if (o.kind === "pie") {
      var vals = d.series[0].values.map(function (v) { return Math.max(0, v); }), total = vals.reduce(function (a, b) { return a + b; }, 0);
      var legW = o.legend ? Math.min(W * 0.42, S * 1.6 + Math.max.apply(null, d.labels.map(function (l) { return textW(l + " 100%", S); }))) : 0;
      var r = Math.max(4, Math.min((W - legW) / 2, H / 2) * 0.9), cx = (W - legW) / 2, cy = H / 2, a = -Math.PI / 2;
      out.pie = { cx: cx, cy: cy, r: r, total: total };
      out.slices = vals.map(function (v, i) { var da = total > 0 ? v / total * Math.PI * 2 : 0, s = { i: i, a0: a, a1: a + da, v: v, pct: total > 0 ? v / total : 0 }; a += da; return s; });
      if (o.legend) d.labels.forEach(function (l, i) { out.legend.push({ i: i, s: l, x: W - legW + S * 0.2, y: cy - n * S * 1.5 / 2 + S * 1.5 * (i + 0.5) }); });
      return out;
    }
    var all = []; d.series.forEach(function (s) { all = all.concat(s.values); });
    var sc = scale(all.length ? all : [0]), legH = o.legend && ns > 0 ? S * 1.9 : 0;
    var axisW = S * 0.7 + Math.max.apply(null, sc.ticks.map(function (t) { return textW(fmt(t), S * 0.85); }));
    var plot = { x: axisW, y: legH + S * 0.9, w: Math.max(4, W - axisW - S * 0.4), h: Math.max(4, H - legH - S * 0.9 - S * 1.9) };
    function y(v) { return plot.y + plot.h * (sc.hi - v) / (sc.hi - sc.lo); }
    var band = plot.w / Math.max(1, n);
    out.plot = plot; out.scale = sc; out.y0 = y(0); out.band = band;
    out.ticks = sc.ticks.map(function (t) { return { v: t, y: y(t), s: fmt(t) }; });
    out.labels = d.labels.map(function (l, i) { return { s: l, x: plot.x + band * (i + 0.5) }; });
    if (o.kind === "bar") {
      var gw = band * 0.74, bw = gw / Math.max(1, ns);
      out.bars = [];
      d.series.forEach(function (s, si) {
        s.values.forEach(function (v, ci) {
          var x = plot.x + ci * band + (band - gw) / 2 + si * bw, y0 = y(0), y1 = y(v);
          out.bars.push({ si: si, ci: ci, v: v, x: x + bw * 0.06, w: bw * 0.88, y: Math.min(y0, y1), h: Math.abs(y1 - y0) });
        });
      });
    } else {
      out.lines = d.series.map(function (s, si) { return { si: si, pts: s.values.map(function (v, ci) { return { x: plot.x + band * (ci + 0.5), y: y(v), v: v }; }) }; });
    }
    if (o.legend) {
      var x = plot.x;
      d.series.forEach(function (s, si) { out.legend.push({ i: si, s: s.name, x: x, y: S * 0.8 }); x += S * 1.6 + textW(s.name, S * 0.9) + S; });
    }
    return out;
  }

  function palette(th) {
    var c = th.colors || {};
    return [c.accent, c.accent2, c.accent3, c.head, c.muted, "#8b5cf6", "#22c55e", "#ef4444", "#0ea5e9", "#f59e0b"].filter(Boolean);
  }
  function draw(ctx, o, th) {
    var g = geom(o), P = palette(th), S = g.S, text = SL.core.resolve(th, "@text"), muted = SL.core.resolve(th, "@muted");
    var font = SL.render.fontStack(SL.core.resolveFont(th, o.font));
    function label(s, x, y, size, color, al, weight) { ctx.font = (weight || 400) + " " + size + "px " + font; ctx.fillStyle = color; ctx.textAlign = al; ctx.textBaseline = "middle"; ctx.fillText(s, x, y); }
    ctx.save();
    if (g.kind === "pie") {
      var p = g.pie;
      g.slices.forEach(function (s) {
        if (s.a1 - s.a0 <= 0) return;
        ctx.beginPath(); ctx.moveTo(p.cx, p.cy); ctx.arc(p.cx, p.cy, p.r, s.a0, s.a1); ctx.closePath();
        ctx.fillStyle = P[s.i % P.length]; ctx.fill();
        ctx.lineWidth = Math.max(1.5, S / 10); ctx.strokeStyle = SL.core.resolve(th, "@bg"); ctx.stroke();
        if (o.values && s.pct >= 0.04) {
          var m = (s.a0 + s.a1) / 2, col = SL.render.lum(P[s.i % P.length]) > 0.6 ? "#111111" : "#ffffff";
          label(Math.round(s.pct * 100) + "%", p.cx + Math.cos(m) * p.r * 0.64, p.cy + Math.sin(m) * p.r * 0.64, S * 0.95, col, "center", 700);
        }
      });
      g.legend.forEach(function (l) {
        ctx.fillStyle = P[l.i % P.length]; ctx.fillRect(l.x, l.y - S * 0.4, S * 0.8, S * 0.8);
        label(l.s, l.x + S * 1.2, l.y, S * 0.9, text, "left");
      });
      ctx.restore(); return;
    }
    var pl = g.plot;
    ctx.fillStyle = muted;
    g.ticks.forEach(function (t) {
      ctx.globalAlpha = t.v === 0 ? 0.7 : 0.22; ctx.fillRect(pl.x, t.y - 0.75, pl.w, 1.5); ctx.globalAlpha = 1;
      label(t.s, pl.x - S * 0.4, t.y, S * 0.85, muted, "right");
    });
    var maxLab = g.band * 0.95;
    g.labels.forEach(function (l) {
      var s = l.s; ctx.font = S * 0.85 + "px " + font;
      while (s.length > 1 && ctx.measureText(s).width > maxLab) s = s.slice(0, -1);
      label(s === l.s ? s : s.slice(0, -1) + "…", l.x, pl.y + pl.h + S * 0.95, S * 0.85, text, "center");
    });
    if (g.bars) g.bars.forEach(function (b) {
      ctx.fillStyle = P[b.si % P.length];
      var r = Math.min(S * 0.25, b.w / 3, b.h), path = new Path2D();
      if (b.v >= 0) SL.render.rrect(path, b.x, b.y, b.w, b.h + r, r); else SL.render.rrect(path, b.x, b.y - r, b.w, b.h + r, r);
      ctx.save(); ctx.beginPath(); ctx.rect(b.x - 1, Math.min(b.y, g.y0) - 1, b.w + 2, b.h + 2); ctx.clip(); ctx.fill(path); ctx.restore();
      if (o.values) label(fmt(b.v), b.x + b.w / 2, b.v >= 0 ? b.y - S * 0.5 : b.y + b.h + S * 0.5, S * 0.8, text, "center", 600);
    });
    if (g.lines) g.lines.forEach(function (ln) {
      var col = P[ln.si % P.length];
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, S * 0.16); ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath(); ln.pts.forEach(function (q, i) { if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.stroke();
      ln.pts.forEach(function (q) {
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(3, S * 0.28), 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = Math.max(1.5, S * 0.08); ctx.strokeStyle = SL.core.resolve(th, "@bg"); ctx.stroke();
        if (o.values) label(fmt(q.v), q.x, q.y - S * 0.75, S * 0.8, text, "center", 600);
      });
    });
    g.legend.forEach(function (l) {
      ctx.fillStyle = P[l.i % P.length]; ctx.fillRect(l.x, l.y - S * 0.38, S * 0.76, S * 0.76);
      label(l.s, l.x + S * 1.1, l.y, S * 0.9, text, "left");
    });
    ctx.restore();
  }
  SL.chart = { geom: geom, draw: draw, scale: scale, niceStep: niceStep, fmt: fmt, palette: palette };
})();
