// Browser check: theme toggle button (sun in light, crescent in dark), at 390/768/1440.
// Light is the default even on system-dark devices; dark is opt-in and persisted.
// node tests/theme.check.js [siteRootOrURL]   (needs playwright-core and Chrome)
const { chromium } = require("playwright-core");
const path = require("path"), { spawn } = require("child_process");
const CFG = { name: "bj", sel: "#theme-btn", key: "brice-job-apps-theme", seed: { "brice-job-apps-v1": require("fs").readFileSync(require("path").join(__dirname, "fixtures/apps.json"), "utf8") } };
const ARG = process.argv[2] || path.join(__dirname, "..");
const LIVE = /^https?:/.test(ARG), PORT = 8814;
const BASE = LIVE ? ARG : "http://127.0.0.1:" + PORT + "/";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = LIVE ? null : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ARG, stdio: "ignore" });
  if (srv) await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  for (const w of [390, 768, 1440]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: "dark", reducedMotion: "reduce", hasTouch: w < 1000 });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    const L = w + "px: ", SEL = CFG.sel;
    await p.goto(BASE); await p.evaluate(() => localStorage.clear());
    await p.evaluate((d) => Object.keys(d).forEach((k) => localStorage.setItem(k, d[k])), CFG.seed || {});
    await p.reload(); await p.waitForTimeout(300);
    const others = () => p.evaluate((key) => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k !== key) o[k] = localStorage.getItem(k); } return JSON.stringify(o); }, CFG.key);
    const before = await others();
    const st = () => p.evaluate((s) => {
      const e = document.querySelector(s), r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      const op = (c) => { const n = e.querySelector(c); return n ? +getComputedStyle(n).opacity : -1; };
      const sz = (c) => { const n = e.querySelector(c); if (!n) return 0; const q = n.getBoundingClientRect(); return Math.min(q.width, q.height); };
      return { theme: document.documentElement.getAttribute("data-theme"), tag: e.tagName, type: e.type, label: e.getAttribute("aria-label"), pressed: e.getAttribute("aria-pressed"),
        w: r.width, h: r.height, x: r.x, y: r.y, radius: parseFloat(cs.borderTopLeftRadius), inHeader: !!e.closest("header"), vis: cs.visibility === "visible" && cs.display !== "none" && +cs.opacity === 1 && r.right <= innerWidth && r.x >= 0,
        sun: op(".i-sun"), moon: op(".i-moon"), sunSize: sz(".i-sun"), moonSize: sz(".i-moon"), border: cs.borderTopWidth + " " + cs.borderTopStyle,
        overflow: document.documentElement.scrollWidth - innerWidth, bg: getComputedStyle(document.body).backgroundColor };
    }, SEL);
    let s = await st();
    ok(s.theme === "light" && s.bg === "rgb(255, 255, 255)", L + "system-dark device still opens in light (" + s.bg + ")");
    ok((await p.evaluate((k) => localStorage.getItem(k), CFG.key)) === null, L + "nothing written on load");
    ok(s.tag === "BUTTON" && s.type === "button" && s.label === "Dark mode" && s.pressed === "false", L + "real <button>, aria-label 'Dark mode', aria-pressed=false");
    ok(s.w >= 44 && s.h >= 44 && s.radius >= s.h / 2 - 1 && s.inHeader && s.vis && s.border !== "0px none", L + "visible circle in header, " + s.w + "×" + s.h + " (≥44)");
    ok(s.sun === 1 && s.moon === 0 && s.sunSize >= 18, L + "light shows the sun icon (" + s.sunSize + "px)");
    await p.click(SEL); await p.waitForTimeout(100); s = await st();
    ok(s.theme === "dark" && s.pressed === "true" && s.moon === 1 && s.sun === 0 && s.moonSize >= 18, L + "click → dark, crescent shown, aria-pressed=true");
    ok((await p.evaluate((k) => localStorage.getItem(k), CFG.key)) === "dark", L + "saved under " + CFG.key);
    await p.reload(); await p.waitForTimeout(300); s = await st();
    ok(s.theme === "dark" && s.moon === 1 && s.pressed === "true", L + "dark + crescent persist after reload");
    // keyboard: Tab to the button, check focus ring, Enter / Space toggle
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    let found = false; for (let i = 0; i < 40 && !found; i++) { await p.keyboard.press("Tab"); found = await p.evaluate((sel) => document.activeElement === document.querySelector(sel), SEL); }
    ok(found, L + "reachable with Tab");
    const ring = await p.evaluate((sel) => { const cs = getComputedStyle(document.querySelector(sel)); return { o: cs.outlineStyle + " " + cs.outlineWidth, bs: cs.boxShadow, fv: document.querySelector(sel).matches(":focus-visible") }; }, SEL);
    ok(ring.fv && (ring.o.indexOf("none") < 0 || ring.bs !== "none"), L + "keyboard focus ring (" + ring.o + " / " + ring.bs.slice(0, 40) + ")");
    await p.keyboard.press("Enter"); await p.waitForTimeout(100); s = await st();
    ok(s.theme === "light" && s.sun === 1 && s.pressed === "false", L + "Enter → light, sun shown");
    await p.keyboard.press("Space"); await p.waitForTimeout(100); s = await st();
    ok(s.theme === "dark" && s.moon === 1, L + "Space → dark, crescent shown");
    await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    ok((await p.evaluate((k) => localStorage.getItem(k), CFG.key)) === "light", L + "back to light is saved");
    s = await st();
    ok(s.overflow <= 0, L + "no horizontal overflow (" + s.overflow + ")");
    ok((await others()) === before, L + "no other stored data changed");
    if (w === 1440) {
      const c2 = await b.newContext({ viewport: { width: w, height: 900 } }); const p2 = await c2.newPage(); await p2.goto(BASE);
      const tr = await p2.evaluate((sel) => getComputedStyle(document.querySelector(sel + " svg")).transitionProperty, SEL);
      ok(/opacity/.test(tr) && /transform/.test(tr), "icon swap has a transition (" + tr + ")"); await c2.close();
    }
    for (const t of ["light", "dark"]) { await p.evaluate((t) => document.documentElement.setAttribute("data-theme", t), t); await (await p.$("header")).screenshot({ path: "/tmp/theme-" + CFG.name + "-" + w + "-" + t + ".png" }); }
    ok(errs.length === 0, L + "no console errors " + errs.join(" | "));
    await ctx.close();
  }
  await b.close(); if (srv) srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
