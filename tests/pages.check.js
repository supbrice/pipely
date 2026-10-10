// Browser check: one page per section (hash routes) at 390/768/1440: each route renders, sticky nav, current tab,
// scroll to top, back/forward, deep links, old anchors, one-tap links, no overflow, no console errors. Fake data only.
// node tests/pages.check.js [siteRootOrURL]   (needs playwright-core and Chrome)
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs"), { spawn } = require("child_process");
const SITE = {
  name: "bj", port: 8824,
  seed: () => ({ "brice-job-apps-v1": fs.readFileSync(path.join(__dirname, "fixtures/apps-255.json"), "utf8"), "brice-job-apps-sync": JSON.stringify({ gistId: "", token: "", autoPull: false, autoPush: false }) }),
  routes: [{ id: "overview", sections: ["hero", "overview", "activity"] }, { id: "applications", sections: ["pipeline"] }, { id: "board", sections: ["board"] }, { id: "calendar", sections: ["jcal"] },
    { id: "followups", sections: ["interviews", "followups"] }, { id: "insights", sections: ["insights"] }, { id: "rejected", sections: ["rejected"] }, { id: "sync", sections: ["data"] }],
  allSections: ["hero", "overview", "pipeline", "board", "jcal", "insights", "interviews", "followups", "rejected", "activity", "data"],
  oldAnchors: [["pipeline", "applications"], ["board", "board"], ["insights", "insights"], ["followups", "followups"], ["rejected", "rejected"], ["data", "sync"], ["activity", "overview"]],
  extra: async (p, ok, L, BASE, w) => {
    // KPI card links still jump to their page
    await p.goto("about:blank"); await p.goto(BASE); await p.waitForTimeout(200);
    await p.click("#kpis .kpi >> nth=1"); await p.waitForTimeout(300);
    ok((await p.evaluate(() => location.hash)) === "#/applications", L + "KPI card opens the Applications page (" + (await p.evaluate(() => location.hash)) + ")");
    // one-tap gist link still works (network blocked here), lands on Overview with the hash cleared
    await p.goto("about:blank"); await p.goto(BASE + "#pipely-gist=0123456789abcdef0123456789abcdef"); await p.waitForTimeout(500);
    const cfg = JSON.parse(await p.evaluate(() => localStorage.getItem("brice-job-apps-sync")));
    ok(cfg.gistId === "0123456789abcdef0123456789abcdef" && cfg.autoPull === true && (await p.evaluate(() => location.hash)) === "", L + "#pipely-gist= link saves the gist id and clears the hash");
    ok((await p.$eval('#pagenav [aria-current="page"]', (a) => a.dataset.route)) === "overview", L + "after the gist link you're on Overview");
    // Calendar page with fake dated records (relative to this month)
    const n = new Date(), ym = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-";
    const d = (x) => ym + String(x).padStart(2, "0");
    const apps = [
      { id: "c1", company: "Applied One", role: "Tech", status: "Applied", dateApplied: d(3), notes: "" },
      { id: "c2", company: "Applied Two", role: "Tech", status: "Applied", dateApplied: d(3), notes: "" },
      { id: "c3", company: "Nope Inc", role: "Tech", status: "Rejected", dateApplied: d(1), notes: "x | Rejection email " + d(5) },
      { id: "c4", company: "Screen Co", role: "Tech", status: "Screening", dateApplied: d(2), notes: "", log: [{ id: "l1", date: d(6), type: "Screen", note: "phone" }] },
      { id: "c5", company: "Offer Co", role: "Tech", status: "Offer", dateApplied: d(2), notes: "Zoom interview + offer " + d(7) },
      { id: "c6", company: "No Date Co", role: "Tech", status: "Rejected", dateApplied: "", notes: "rejected" },
    ];
    const raw = JSON.stringify(apps);
    await p.evaluate((r) => { localStorage.setItem("brice-job-apps-v1", r); localStorage.setItem("brice-job-apps-sync", JSON.stringify({ gistId: "", token: "", autoPull: false, autoPush: false })); }, raw);
    await p.goto("about:blank"); await p.goto(BASE + "#/calendar"); await p.waitForTimeout(300);
    const cell = (x, k) => p.$eval('#jcal-grid [data-key="' + d(x) + '"]', (c, k) => { const s = c.querySelector(".j-" + k); return s ? s.textContent : ""; }, k);
    ok((await cell(3, "applied")) === "2" && (await cell(1, "applied")) === "1" && (await cell(2, "applied")) === "2", L + "calendar: applied counts per day");
    ok((await cell(5, "rejected")) === "1" && (await cell(6, "interview")) === "1" && (await cell(7, "interview")) === "1" && (await cell(7, "offer")) === "1", L + "calendar: rejection, screen, interview + offer on their days");
    const tot = await p.textContent("#jcal-total"), foot = await p.textContent("#jcal-foot");
    ok(/^5 applied · 2 interviews \/ screens · 1 rejected · 1 offer$/.test(tot), L + "month totals: " + tot);
    ok(/1 application without an applied date/.test(foot) && /1 rejection without a rejection date/.test(foot), L + "undated items noted: " + foot);
    const colors = await p.evaluate(() => ["applied", "interview", "rejected", "offer"].map((k) => getComputedStyle(document.querySelector(".jcal-legend .k-" + k)).backgroundColor));
    ok(new Set(colors).size === 4, L + "legend has 4 distinct colours " + colors.join(" "));
    await p.click('#jcal-grid [data-key="' + d(3) + '"]'); await p.waitForTimeout(150);
    const dl = await p.$eval("#jday-dlg", (e) => ({ open: e.open, text: e.textContent }));
    ok(dl.open && /Applied \(2\)/.test(dl.text) && /Applied One/.test(dl.text) && /Applied Two/.test(dl.text), L + "tapping a day lists those applications");
    await p.click('#jday-body button:has-text("Applied One")'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => document.getElementById("detail-dlg").open && !document.getElementById("jday-dlg").open), L + "an item opens its application details");
    await p.keyboard.press("Escape");
    const title0 = await p.textContent("#jcal-title");
    await p.click("#jcal-prev"); const tPrev = await p.textContent("#jcal-title");
    await p.click("#jcal-next"); await p.click("#jcal-next"); const tNext = await p.textContent("#jcal-title");
    await p.click("#jcal-today");
    ok(tPrev !== title0 && tNext !== title0 && (await p.textContent("#jcal-title")) === title0, L + "month navigation + Today (" + [tPrev, title0, tNext].join(" / ") + ")");
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, L + "calendar: no overflow");
    ok((await p.evaluate(() => localStorage.getItem("brice-job-apps-v1"))) === raw, L + "calendar changed no stored data");
    await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await (await p.$(".jcal-card")).screenshot({ path: "/tmp/jcal-dark-" + w + ".png" });
    await p.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await (await p.$(".jcal-card")).screenshot({ path: "/tmp/jcal-light-" + w + ".png" });
  }
};
const ARG = process.argv[2] || path.join(__dirname, "..");
const LIVE = /^https?:/.test(ARG), PORT = SITE.port;
const BASE = (LIVE ? ARG : "http://127.0.0.1:" + PORT + "/").replace(/#.*$/, "");
const ORIGIN = new URL(BASE).origin;
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = LIVE ? null : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ARG, stdio: "ignore" });
  if (srv) await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  for (const w of [390, 768, 1440]) {
    const ctx = await b.newContext({ viewport: { width: w, height: w === 768 ? 1024 : w === 390 ? 844 : 900 }, reducedMotion: "reduce", timezoneId: "America/Chicago" });
    await ctx.route("**/*", (r) => (r.request().url().startsWith(ORIGIN) ? r.continue() : r.abort()));
    const p = await ctx.newPage(); const errs = [], L = w + "px: ";
    p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await p.goto(BASE); await p.evaluate((seed) => { localStorage.clear(); Object.keys(seed).forEach((k) => localStorage.setItem(k, seed[k])); }, SITE.seed());
    const snap = () => p.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o, Object.keys(o).sort()); });
    const start = await snap();
    const state = () => p.evaluate((ids) => ({
      hash: location.hash, title: document.title, y: Math.round(scrollY),
      visible: ids.filter((id) => { const e = document.getElementById(id); return e && !e.hidden && e.getClientRects().length > 0; }),
      current: [...document.querySelectorAll('#pagenav [aria-current="page"]')].map((a) => a.dataset.route),
      overflow: document.documentElement.scrollWidth - innerWidth,
      nav: (() => { const n = document.querySelector(".pagenav"), r = n.getBoundingClientRect(), cs = getComputedStyle(n); return { pos: cs.position, top: Math.round(r.top), h: Math.round(r.height), sw: document.getElementById("pagenav").scrollWidth, cw: document.getElementById("pagenav").clientWidth }; })()
    }), SITE.allSections);
    // every route via deep link
    for (const r of SITE.routes) {
      await p.goto("about:blank"); await p.goto(BASE + "#/" + (r.id === SITE.routes[0].id ? "" : r.id)); await p.waitForTimeout(250);
      const s = await state();
      ok(JSON.stringify(s.visible) === JSON.stringify(r.sections) && JSON.stringify(s.current) === JSON.stringify([r.id]), L + "deep link #/" + r.id + " shows " + s.visible.join("+") + ", tab '" + s.current + "' highlighted");
      ok(s.overflow <= 0, L + r.id + ": no horizontal overflow (" + s.overflow + ")");
      // sticky nav after scrolling down
      await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(80);
      const s2 = await state();
      if (s2.y > 200) ok(s2.nav.pos === "sticky" && s2.nav.top === 0, L + r.id + ": nav stays stuck at the top while scrolled (top " + s2.nav.top + ")");
      await p.screenshot({ path: "/tmp/pages-" + SITE.name + "-" + w + "-" + r.id + ".png" });
    }
    // nav click: scrolls to top, highlights tab, back/forward
    await p.goto("about:blank"); await p.goto(BASE); await p.waitForTimeout(200);
    const seq = SITE.routes.slice(1, 4).map((r) => r.id);
    for (const id of seq) {
      await p.evaluate(() => scrollTo(0, document.body.scrollHeight));
      await p.click('#pagenav a[data-route="' + id + '"]'); await p.waitForTimeout(200);
      const s = await state();
      ok(s.hash === "#/" + id && s.y === 0 && s.current[0] === id, L + "tab " + id + ": opens at the top (y " + s.y + "), highlighted");
    }
    await p.goBack(); await p.waitForTimeout(200);
    ok((await state()).current[0] === seq[1], L + "Back → " + seq[1]);
    await p.goBack(); await p.waitForTimeout(200);
    ok((await state()).current[0] === seq[0], L + "Back → " + seq[0]);
    await p.goForward(); await p.waitForTimeout(200);
    ok((await state()).current[0] === seq[1], L + "Forward → " + seq[1]);
    if (w === 390) { const s = await state(); ok(s.nav.sw > s.nav.cw, L + "phone: compact scrollable tab row (" + s.nav.sw + " > " + s.nav.cw + ")"); }
    // old in-page anchors map to their page
    for (const [anchor, id] of SITE.oldAnchors) {
      await p.goto("about:blank"); await p.goto(BASE + "#" + anchor); await p.waitForTimeout(250);
      const s = await state();
      ok(s.current[0] === id && s.hash === "#/" + (id === SITE.routes[0].id ? "" : id), L + "old link #" + anchor + " → #/" + id + " (" + s.hash + ")");
    }
    await p.goto("about:blank"); await p.goto(BASE + "#/no-such-page"); await p.waitForTimeout(200);
    ok((await state()).current[0] === SITE.routes[0].id, L + "unknown route falls back to " + SITE.routes[0].id);
    ok((await snap()) === start, L + "browsing pages changed no stored data");
    if (SITE.extra) await SITE.extra(p, ok, L, BASE, w);
    ok(errs.length === 0, L + "no console errors " + errs.join(" | "));
    await ctx.close();
  }
  await b.close(); if (srv) srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
