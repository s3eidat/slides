/* Slides sample outline: a six-slide starter deck (fictional placeholder content written for this project),
   in English or, for the right-to-left theme, in Arabic. Used by "New > Sample outline" and the demo. */
(function () {
  "use strict";
  const SL = window.SL;
  const EN = {
    name: "Project Orbit review",
    title: ["Project Orbit", "Quarterly review · October 2026"],
    agenda: ["Where we are", "Where we are\n\tThree pilots finished, two signed\nWhat we learned\n\tCustomers want it to work offline\n\tSetup must take under ten minutes\nWhat comes next"],
    two: ["What changed this quarter", "Before\n\tWeekly reports by hand\n\tData in five places\n\tTwo-day turnaround", "After\n\tReports build themselves\n\tOne shared source\n\tAnswers the same hour"],
    chart: ["Sign-ups keep growing", ["Q1", "Q2", "Q3", "Q4"], [["2025", [120, 190, 150, 240]], ["2026", [160, 230, 260, 340]]]],
    table: ["Plan for next quarter", [["Goal", "Owner", "Due"], ["Offline mode", "Lena", "Nov 30"], ["Ten-minute setup", "Omar", "Dec 12"], ["Two new regions", "Sam", "Jan 20"]]],
    end: ["Thank you", "Questions and discussion"],
    notes: ["Welcome everyone. This takes about ten minutes, questions at the end.", "Keep this short: three points, then the numbers.",
      "Stress the turnaround time: two days down to the same hour.", "Q4 is a forecast. Mention the two new pilot sites.",
      "Owners have agreed to these dates.", "Open the floor. Note follow-ups in the shared doc."]
  };
  const AR = {
    name: "مراجعة مشروع مدار",
    title: ["مشروع مدار", "المراجعة الربعية · أكتوبر ٢٠٢٦"],
    agenda: ["أين نحن الآن", "أين نحن الآن\n\tأنهينا ثلاث تجارب ووقّعنا اتفاقيتين\nماذا تعلّمنا\n\tالعملاء يريدون العمل دون إنترنت\n\tالإعداد يجب ألا يتجاوز عشر دقائق\nالخطوة التالية"],
    two: ["ما الذي تغيّر هذا الربع", "قبل\n\tتقارير أسبوعية يدوية\n\tالبيانات في خمسة أماكن", "بعد\n\tتقارير تُبنى تلقائيًا\n\tمصدر واحد مشترك"],
    chart: ["التسجيلات في ازدياد", ["الربع ١", "الربع ٢", "الربع ٣", "الربع ٤"], [["٢٠٢٥", [120, 190, 150, 240]], ["٢٠٢٦", [160, 230, 260, 340]]]],
    table: ["خطة الربع القادم", [["الهدف", "المسؤول", "الموعد"], ["العمل دون إنترنت", "لينا", "٣٠ نوفمبر"], ["إعداد في عشر دقائق", "عمر", "١٢ ديسمبر"], ["منطقتان جديدتان", "سامي", "٢٠ يناير"]]],
    end: ["شكرًا لكم", "أسئلة ونقاش"],
    notes: ["مرحبًا بالجميع. العرض نحو عشر دقائق، والأسئلة في النهاية.", "ثلاث نقاط ثم الأرقام.", "ركّز على سرعة الإنجاز.", "الربع الرابع تقديري.", "المسؤولون وافقوا على المواعيد.", "افتح باب النقاش."]
  };
  SL.sampleDeck = function (themeId, ratio, demo) {
    const C = SL.core, th = SL.THEMES.filter(t => t.id === themeId)[0] || SL.THEMES[0], T = th.rtl ? AR : EN;
    const d = C.newDeck(th.id, ratio || "16:9", T.name), D = C.dims(d), ph = (s, role) => s.objects.filter(o => o.ph === role)[0];
    const m = D.w * 0.065, top = D.h * 0.27;
    let s = d.slides[0];
    ph(s, "title").text = T.title[0]; ph(s, "subtitle").text = T.title[1];
    s = C.addSlide(d, 1, "content"); ph(s, "title").text = T.agenda[0]; ph(s, "body").text = T.agenda[1];
    ph(s, "body").anim = { t: "fade", with: false, n: 1 };
    s = C.addSlide(d, 2, "two"); ph(s, "title").text = T.two[0]; ph(s, "body").text = T.two[1]; ph(s, "body2").text = T.two[2];
    s = C.addSlide(d, 3, "titleonly"); ph(s, "title").text = T.chart[0];
    s.objects.push(C.make("chart", { kind: "bar", x: m, y: top, w: D.w - m * 2, h: D.h * 0.64, size: Math.round(D.h * 0.026), legend: true, values: true,
      data: { labels: T.chart[1], series: T.chart[2].map(x => ({ name: x[0], values: x[1] })) }, anim: { t: "rise", with: false, n: 1 } }));
    s = C.addSlide(d, 4, "titleonly"); ph(s, "title").text = T.table[0];
    const rtl = !!th.rtl;
    s.objects.push(C.make("table", { rows: T.table[1].map(r => r.slice()), x: m, y: top + D.h * 0.02, w: D.w - m * 2, size: Math.round(D.h * 0.032), header: true, band: true }));
    s.objects.push(C.make("icon", { icon: "flag", x: rtl ? m + D.h * 0.12 : D.w - m - D.h * 0.1, y: D.h * 0.085, w: D.h * 0.1, h: D.h * 0.1, color: "@accent", sw: 1.8 }));
    s = C.addSlide(d, 5, "section"); ph(s, "title").text = T.end[0]; ph(s, "subtitle").text = T.end[1];
    d.slides.forEach((x, i) => { x.notes = T.notes[i] || ""; x.transition = { type: i ? "fade" : "none", dur: 0.6 }; });
    if (demo) d.slides[5].transition = { type: "zoom", dur: 0.7 };
    SL.render.fitAll(d);
    return d;
  };
})();
