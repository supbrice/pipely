// Browser check: per-column search on the Board (fake 255-record fixture). 390/768/1440, light + dark.
// node tests/boardsearch.check.js [siteRootOrURL]   (needs playwright-core and Chrome)
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs"), { spawn } = require("child_process");
const ARG = process.argv[2] || path.join(__dirname, "..");
const LIVE = /^https?:/.test(ARG), PORT = 8825, KEY = "brice-job-apps-v1";
const BASE = (LIVE ? ARG : "http://127.0.0.1:" + PORT + "/").replace(/#.*$/, "");
const DATA = fs.readFileSync(path.join(__dirname, "fixtures/apps-255.json"), "utf8");
const J = require(path.join(__dirname, "../js/data.js"));
const APPS = J.prepareImport(JSON.parse(DATA)).unique;
const expect = (status, q) => J.boardColumn(APPS, status).filter((a) => (a.company + " " + a.role).toLowerCase().includes(q.toLowerCase())).length;
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = LIVE ? null : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ARG, stdio: "ignore" });
  if (srv) await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  for (const [w, hgt] of [[390, 844], [768, 1024], [1440, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, reducedMotion: "reduce", hasTouch: w < 1000 });
    const p = await ctx.newPage(); const errs = [], L = w + "px: ";
    p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await p.goto(BASE); await p.evaluate(([k, d]) => { localStorage.clear(); localStorage.setItem(k, d); localStorage.setItem("brice-job-apps-sync", JSON.stringify({ gistId: "", token: "", autoPull: false, autoPush: false })); }, [KEY, DATA]);
    await p.goto("about:blank"); await p.goto(BASE + "#/board"); await p.waitForTimeout(400);
    // compare parsed records (the app writes compact JSON; the fixture file is indented)
    const recs = async () => JSON.stringify(JSON.parse(await p.evaluate((k) => localStorage.getItem(k), KEY)));
    const start = await recs();
    const col = (s) => '.kcol[data-status="' + s + '"]';
    const st = (s) => p.evaluate((sel) => { const c = document.querySelector(sel); const vis = [...c.querySelectorAll(".kcard")].filter((k) => !k.hidden);
      return { count: c.querySelector(".kcount").textContent, vis: vis.length, texts: vis.map((k) => (k.querySelector(".co").textContent + " " + k.querySelector(".ro").textContent).toLowerCase()), none: !c.querySelector(".knone").hidden,
        open: !c.querySelector(".ksearch").hidden, exp: c.querySelector(".ksearch-btn").getAttribute("aria-expanded"), focus: document.activeElement && document.activeElement.id, val: c.querySelector(".ksearch-in").value }; }, col(s));
    // every column header has a 44px magnifier button
    const btns = await p.$$eval(".kcol .ksearch-btn", (n) => n.map((x) => { const r = x.getBoundingClientRect(); return { l: x.getAttribute("aria-label"), w: r.width, h: r.height, s: x.closest(".kcol").dataset.status }; }));
    ok(btns.length === 7 && btns.every((x) => x.w >= 44 && x.h >= 44 && x.l === "Search " + x.s), L + "magnifier in all 7 column headers, ≥44px, labelled (" + btns.map((x) => x.s).join(",") + ")");
    const headH = await p.$eval(col("Applied") + " .khead", (e) => e.getBoundingClientRect().height);
    ok(headH <= 44, L + "header height unchanged by the button (" + headH + "px)");
    // open → autofocus
    await p.click(col("Applied") + " .ksearch-btn");
    let s = await st("Applied");
    ok(s.open && s.exp === "true" && s.focus === "ks-Applied", L + "tap opens the field with focus");
    const fit = await p.$eval(col("Applied"), (c) => { const cr = c.getBoundingClientRect(), x = c.querySelector(".ksearch-x").getBoundingClientRect(), i = c.querySelector(".ksearch-in").getBoundingClientRect(); return { inside: i.left >= cr.left && x.right <= cr.right, xw: x.width, xh: x.height, ih: i.height }; });
    ok(fit.inside && fit.xw >= 44 && fit.xh >= 44 && fit.ih >= 44, L + "field and × fit inside the column, 44px targets");
    // company, case-insensitive
    await p.keyboard.type("LABS"); await p.waitForTimeout(50); s = await st("Applied");
    const nLabs = expect("Applied", "labs");
    ok(s.count === nLabs + " / 203" && s.vis === nLabs && s.texts.every((t) => t.includes("labs")), L + "'LABS' filters company, case-insensitive: " + s.count);
    // role
    await p.fill(col("Applied") + " .ksearch-in", "network"); await p.waitForTimeout(50); s = await st("Applied");
    const nNet = expect("Applied", "network");
    ok(nNet > 0 && s.count === nNet + " / 203" && s.texts.every((t) => t.includes("network")), L + "'network' filters by role: " + s.count);
    // no matches
    await p.fill(col("Applied") + " .ksearch-in", "zzzz"); await p.waitForTimeout(50); s = await st("Applied");
    ok(s.count === "0 / 203" && s.vis === 0 && s.none, L + "no matches shows 'No matches' and 0 / 203");
    // clear ×
    await p.click(col("Applied") + " .ksearch-x"); s = await st("Applied");
    ok(s.count === "203" && s.vis === 203 && s.open && s.focus === "ks-Applied" && !s.none, L + "× clears, field stays open with focus");
    // Esc closes
    await p.keyboard.type("labs"); await p.keyboard.press("Escape"); s = await st("Applied");
    ok(!s.open && s.exp === "false" && s.count === "203" && s.vis === 203 && s.focus !== "ks-Applied", L + "Esc closes and shows all cards");
    // drag a filtered card, filter survives the re-render, undo
    await p.click(col("Applied") + " .ksearch-btn"); await p.keyboard.type("labs"); await p.waitForTimeout(50);
    const id = await p.$eval(col("Applied") + " .kcard:not([hidden])", (c) => c.dataset.id);
    await p.evaluate(([id]) => { const card = document.querySelector('.kcard[data-id="' + id + '"]'), to = document.querySelector('.kcol[data-status="Screening"]'); const dt = new DataTransfer(); const r = to.getBoundingClientRect();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
      to.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + r.height / 2 }));
      to.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + r.height / 2 }));
      card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt })); }, [id]);
    await p.waitForTimeout(150);
    let after = JSON.parse(await recs()), before = JSON.parse(start);
    let diff = after.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i]));
    s = await st("Applied");
    ok(diff.length === 1 && diff[0].id === id && diff[0].status === "Screening", L + "drag a filtered card → Screening changed exactly that record");
    ok(s.open && s.val === "labs" && s.count === (nLabs - 1) + " / 202", L + "filter kept after the move: " + s.count);
    await p.click("#toast-undo"); await p.waitForTimeout(150); s = await st("Applied");
    ok((await recs()) === start && s.count === nLabs + " / 203", L + "undo restores data exactly, count back to " + s.count);
    // card menu on a filtered card, undo
    const id2 = await p.$eval(col("Applied") + " .kcard:not([hidden])", (c) => c.dataset.id);
    await p.selectOption('.kcard[data-id="' + id2 + '"] select', "Interview"); await p.waitForTimeout(150);
    after = JSON.parse(await recs()); diff = after.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i]));
    ok(diff.length === 1 && diff[0].id === id2 && diff[0].status === "Interview" && (await st("Applied")).count === (nLabs - 1) + " / 202", L + "card menu works on a filtered card");
    await p.click("#toast-undo"); await p.waitForTimeout(150);
    ok((await recs()) === start, L + "undo after menu restores data exactly");
    // sticky header with the search open while scrolled
    const sticky = await p.evaluate((sel) => { const c = document.querySelector(sel); c.querySelector(".ksearch-in").value = ""; c.querySelector(".ksearch-in").dispatchEvent(new Event("input"));
      c.scrollIntoView({ block: "center", inline: "center" }); c.scrollTop = 800; const hd = c.querySelector(".khead").getBoundingClientRect(), cr = c.getBoundingClientRect(); return Math.round(hd.top - cr.top); }, col("Applied"));
    ok(Math.abs(sticky) <= 3, L + "header + search stay at the top while the column scrolls (" + sticky + ")");
    // closed-row column (Rejected)
    await p.click(col("Rejected") + " .ksearch-btn"); await p.keyboard.type("Engineer"); await p.waitForTimeout(50);
    const nRe = expect("Rejected", "engineer"); s = await st("Rejected");
    ok(s.count === nRe + " / 46" && s.texts.every((t) => t.includes("engineer")), L + "Rejected column search: " + s.count);
    // other columns unaffected
    ok((await st("Applied")).count === "203", L + "each column filters on its own");
    // dark mode
    await p.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const dark = await p.$eval(col("Rejected") + " .ksearch-in", (e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]);
    ok(dark[0] !== "rgb(255, 255, 255)" && dark[1] !== "rgb(20, 20, 20)", L + "dark mode field colours " + dark.join(" / "));
    await (await p.$("#board-closed")).screenshot({ path: "/tmp/bsearch-dark-" + w + ".png" });
    await p.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
    await p.$eval(col("Applied"), (c) => { c.scrollTop = 0; c.scrollIntoView({ block: "start" }); });
    await p.click(col("Applied") + " .ksearch-btn"); await p.keyboard.type("labs");
    await (await p.$("#board-cols")).screenshot({ path: "/tmp/bsearch-light-" + w + ".png" });
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, L + "no horizontal overflow");
    ok((await recs()) === start, L + "stored data unchanged (search is view-only)");
    ok(errs.length === 0, L + "no console errors " + errs.join(" | "));
    await ctx.close();
  }
  await b.close(); if (srv) srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
