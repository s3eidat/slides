/* Slides themes: nine original looks made for this project (colours, fonts, backgrounds, decorations).
   Objects on slides refer to theme roles (@head, @accent, @body font ...), so changing the theme
   restyles the whole deck. Fonts are ones found on most computers so exported files look the same. */
(function () {
  "use strict";
  var SL = window.SL = window.SL || {};
  function lin(a, c1, c2) { return { t: "lin", a: a, c: [c1, c2] }; }
  function R(x, y, w, h, fill, o) { return Object.assign({ type: "shape", shape: "rect", x: x, y: y, w: w, h: h, fill: fill }, o || {}); }
  function E(x, y, w, h, fill, o) { return Object.assign(R(x, y, w, h, fill, o), { shape: "ellipse" }); }
  function L(x, y, w, stroke, t, o) { return Object.assign({ type: "line", x: x, y: y, w: w, h: t || 2, stroke: stroke }, o || {}); }
  function I(icon, x, y, w, color, o) { return Object.assign({ type: "icon", icon: icon, x: x, y: y, w: w, h: w, color: color }, o || {}); }
  var TITLE = { title: 1, section: 1, big: 1 };
  function kind(layout) { return TITLE[layout] ? "title" : "content"; }

  SL.THEMES = [
    { id: "paper", name: "Paper", fonts: { head: "Georgia", body: "Arial" }, titleAlign: "left", type: { head: 70, body: 38, headWeight: 700 },
      colors: { bg: "#f7f3ec", bg2: "#ece4d6", text: "#2b2622", head: "#1d1916", accent: "#c4572f", accent2: "#2f6f73", accent3: "#d9a441", muted: "#7d7268", onaccent: "#ffffff" },
      bg: "#f7f3ec", titleBg: "#f7f3ec",
      decor: function (k, W, H) {
        return k === "title" ? [R(W * 0.091, H * 0.575, W * 0.08, 8, "@accent"), E(W * 0.74, H * 0.62, W * 0.42, W * 0.42, "@accent2", { op: 0.09 }), E(W * 0.83, H * -0.12, W * 0.2, W * 0.2, "@accent3", { op: 0.16 })]
          : [R(W * 0.065, H * 0.245, W * 0.05, 6, "@accent"), R(0, H - 10, W, 10, "@bg2")];
      } },
    { id: "midnight", name: "Midnight", fonts: { head: "Inter", body: "Inter" }, titleAlign: "center", type: { head: 72, body: 38, headWeight: 800 },
      colors: { bg: "#10162c", bg2: "#1e2647", text: "#d5dbf0", head: "#ffffff", accent: "#7aa2ff", accent2: "#ffb86b", accent3: "#6ee7c8", muted: "#8d97b8", onaccent: "#0b1022" },
      bg: lin(160, "#151c38", "#0b1022"), titleBg: lin(150, "#1b2550", "#0a0e1f"),
      decor: function (k, W, H) {
        return k === "title" ? [E(W * 0.62, -H * 0.55, W * 0.7, W * 0.7, "@accent", { op: 0.12 }), E(-W * 0.18, H * 0.55, W * 0.45, W * 0.45, "@accent2", { op: 0.07 }),
          L(W * 0.44, H * 0.575, W * 0.12, "@accent", 4)]
          : [L(W * 0.065, H * 0.245, W * 0.87, "@bg2", 2), E(W * 0.86, -H * 0.2, W * 0.22, W * 0.22, "@accent", { op: 0.07 })];
      } },
    { id: "mint", name: "Mint", fonts: { head: "Calibri", body: "Calibri" }, titleAlign: "left", type: { head: 70, body: 38, headWeight: 700 },
      colors: { bg: "#ffffff", bg2: "#e8f6f5", text: "#23383a", head: "#0b3b3a", accent: "#0e9f9a", accent2: "#f2a65a", accent3: "#5b6ee1", muted: "#6b8486", onaccent: "#ffffff" },
      titleColors: { head: "#ffffff", text: "#e9fbfa", muted: "#c8f1ee", accent: "#ffffff" },
      bg: "#ffffff", titleBg: lin(135, "#0e9f9a", "#0b6f7a"),
      decor: function (k, W, H) {
        return k === "title" ? [E(W * 0.7, H * 0.1, H * 0.95, H * 0.95, "#ffffff", { op: 0.08 }), E(W * 0.8, H * 0.45, H * 0.6, H * 0.6, "#ffffff", { op: 0.08 }), R(W * 0.091, H * 0.575, W * 0.07, 8, "@accent2")]
          : [R(0, 0, W, H * 0.025, "@accent"), R(W * 0.065, H * 0.245, W * 0.05, 6, "@accent2")];
      } },
    { id: "sunset", name: "Sunset", fonts: { head: "Segoe UI", body: "Segoe UI" }, titleAlign: "center", type: { head: 70, body: 34, headWeight: 700 },
      colors: { bg: "#fff8f2", bg2: "#ffe9dc", text: "#4a4a5a", head: "#3d405b", accent: "#e8505b", accent2: "#f9a03f", accent3: "#3d405b", muted: "#8a8090", onaccent: "#ffffff" },
      titleColors: { head: "#ffffff", text: "#fff3ea", muted: "#fff0e6", accent: "#ffffff" },
      bg: "#fff8f2", titleBg: lin(135, "#ff7e5f", "#f7b267"),
      decor: function (k, W, H) {
        return k === "title" ? [E(W * 0.5 - H * 0.55, H * 0.72, H * 1.1, H * 1.1, "#ffffff", { op: 0.14 }), E(W * 0.5 - H * 0.35, H * 0.86, H * 0.7, H * 0.7, "#ffffff", { op: 0.14 })]
          : [R(0, H - H * 0.03, W, H * 0.03, lin(90, "#ff7e5f", "#f7b267")), E(W * 0.92, H * 0.03, H * 0.06, H * 0.06, "@accent2")];
      } },
    { id: "mono", name: "Mono", fonts: { head: "Arial", body: "Arial" }, titleAlign: "left", type: { head: 74, body: 38, headWeight: 800 },
      colors: { bg: "#ffffff", bg2: "#f0f0f0", text: "#1a1a1a", head: "#000000", accent: "#111111", accent2: "#8a8a8a", accent3: "#c9c9c9", muted: "#6b6b6b", onaccent: "#ffffff" },
      bg: "#ffffff", titleBg: "#ffffff",
      decor: function (k, W, H) {
        return k === "title" ? [R(0, 0, W * 0.025, H, "#111111"), R(W * 0.091, H * 0.575, W * 0.14, 10, "#111111")]
          : [R(W * 0.065, H * 0.235, W * 0.87, 5, "#111111")];
      } },
    { id: "forest", name: "Forest", fonts: { head: "Palatino Linotype", body: "Georgia" }, titleAlign: "left", type: { head: 70, body: 36, headWeight: 700 },
      colors: { bg: "#f2f5ee", bg2: "#e2eadb", text: "#2c3a2f", head: "#1f3d2b", accent: "#3c8d5a", accent2: "#c9a227", accent3: "#7a5c3e", muted: "#6d7d6f", onaccent: "#ffffff" },
      bg: "#f2f5ee", titleBg: lin(180, "#f2f5ee", "#dfe8d6"),
      decor: function (k, W, H) {
        return k === "title" ? [E(W * 0.72, H * 0.5, W * 0.36, W * 0.36, "@accent", { op: 0.13 }), E(W * 0.86, H * 0.3, W * 0.2, W * 0.2, "@accent2", { op: 0.16 }),
          I("leaf", W * 0.79, H * 0.12, H * 0.2, "@accent", { sw: 1.5 }), R(W * 0.091, H * 0.575, W * 0.07, 8, "@accent2")]
          : [I("leaf", W * 0.9, H * 0.06, H * 0.09, "@accent", { sw: 1.6 }), R(W * 0.065, H * 0.245, W * 0.05, 6, "@accent")];
      } },
    { id: "neon", name: "Neon", fonts: { head: "Inter", body: "Inter" }, titleAlign: "left", type: { head: 74, body: 38, headWeight: 800 },
      colors: { bg: "#0c0c12", bg2: "#1d1d2b", text: "#e9e9f2", head: "#ffffff", accent: "#ff3d8b", accent2: "#3dd6d0", accent3: "#ffd23f", muted: "#9a9ab0", onaccent: "#0c0c12" },
      bg: "#0c0c12", titleBg: "#0c0c12",
      decor: function (k, W, H) {
        return k === "title" ? [R(-W * 0.1, H * 0.84, W * 1.2, H * 0.06, lin(90, "#ff3d8b", "#3dd6d0"), { rot: -4 }), R(W * 0.091, H * 0.575, W * 0.06, 8, "@accent2"),
          E(W * 0.8, H * 0.1, H * 0.3, H * 0.3, "", { stroke: "@accent", strokeW: 4 })]
          : [R(W * 0.035, H * 0.105, 10, H * 0.1, lin(180, "#ff3d8b", "#3dd6d0"))];
      } },
    { id: "blueprint", name: "Blueprint", fonts: { head: "Courier New", body: "Verdana" }, titleAlign: "left", type: { head: 66, body: 34, headWeight: 700 },
      colors: { bg: "#123a6b", bg2: "#1b4a82", text: "#dce8f7", head: "#ffffff", accent: "#ffd23f", accent2: "#7fd1ff", accent3: "#ff8a65", muted: "#9cb5d3", onaccent: "#123a6b" },
      bg: "#123a6b", titleBg: "#103361",
      decor: function (k, W, H) {
        var out = [], i;
        for (i = 1; i < 16; i++) out.push(L(W * i / 16, H / 2 - 1, H, "rgba(255,255,255,0.07)", 2, { rot: 90, x: W * i / 16 - H / 2 }));
        for (i = 1; i < 9; i++) out.push(L(0, H * i / 9, W, "rgba(255,255,255,0.07)", 2));
        out.push(k === "title" ? R(W * 0.091, H * 0.575, W * 0.07, 8, "@accent") : R(W * 0.065, H * 0.245, W * 0.05, 6, "@accent"));
        return out;
      } },
    { id: "noor", name: "Noor (Arabic, right-to-left)", rtl: true, fonts: { head: "Tahoma", body: "Tahoma" }, titleAlign: "left", type: { head: 70, body: 38, headWeight: 700 },
      colors: { bg: "#fbf7ee", bg2: "#f1e8d6", text: "#2a3238", head: "#0f4c5c", accent: "#c8963e", accent2: "#0f4c5c", accent3: "#7a9e7e", muted: "#7b7468", onaccent: "#ffffff" },
      bg: "#fbf7ee", titleBg: lin(180, "#fbf7ee", "#f3e9d4"),
      decor: function (k, W, H) {
        return k === "title" ? [I("octagram", W * 0.06, H * 0.12, H * 0.3, "@accent", { sw: 1.2 }), I("octagram", W * 0.1, H * 0.6, H * 0.16, "@accent2", { sw: 1.2, op: 0.5 }),
          R(W - W * 0.091 - W * 0.08, H * 0.575, W * 0.08, 8, "@accent"), R(0, H - H * 0.02, W, H * 0.02, "@accent2")]
          : [R(W - W * 0.065 - W * 0.05, H * 0.245, W * 0.05, 6, "@accent"), I("octagram", W * 0.03, H * 0.05, H * 0.08, "@accent", { sw: 1.4, op: 0.8 }), R(0, H - 8, W, 8, "@accent2")];
      } }
  ];
  SL.themeKind = kind;
  // The theme as it applies to one slide: title/section slides can have their own colours (e.g. white on a colour).
  SL.themeFor = function (th, layout) {
    if (kind(layout) !== "title" || !th.titleColors) return th;
    if (!th._title) th._title = Object.assign({}, th, { colors: Object.assign({}, th.colors, th.titleColors) });
    return th._title;
  };
  SL.slideBg = function (th, slide) { return slide.bg || (kind(slide.layout) === "title" ? th.titleBg || th.bg : th.bg); };
  var cache = {};
  SL.decor = function (th, slide, W, H) {
    var key = th.id + "|" + kind(slide.layout) + "|" + W;
    if (!cache[key]) cache[key] = (th.decor ? th.decor(kind(slide.layout), W, H) : []).map(function (d) { return SL.core.make(d.type, d); });
    return cache[key];
  };
})();
