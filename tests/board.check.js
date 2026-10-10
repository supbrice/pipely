// Browser check: compact, height-capped board with per-column scrolling (fake 255-record fixture).
// node tests/board.check.js [siteRootOrURL]   (needs playwright-core and Chrome)
const { chromium } = require("playwright-core");
const path = require("path"), fs = require("fs"), { spawn } = require("child_process");
const ARG = process.argv[2] || path.join(__dirname, "..");
const LIVE = /^https?:/.test(ARG), PORT = 8818, KEY = "brice-job-apps-v1";
const BASE = LIVE ? ARG : "http://127.0.0.1:" + PORT + "/";
const DATA = fs.readFileSync(path.join(__dirname, "fixtures/apps-255.json"), "utf8");
const BOARD_URL = BASE.replace(/#.*$/, "") + "#/board";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const drag = (p, id, to) => p.evaluate(([id, to]) => {
  const card = document.querySelector('.kcard[data-id="' + id + '"]'), col = document.querySelector('.kcol[data-status="' + to + '"]');
  const dt = new DataTransfer(); const r = col.getBoundingClientRect();
  card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
  col.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  col.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
  card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
}, [id, to]);
(async () => {
  const srv = LIVE ? null : spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ARG, stdio: "ignore" });
  if (srv) await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    const p = await ctx.newPage(); const errs = [], L = w + "px: ";
    p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await p.goto(BASE); await p.evaluate(([k, d]) => { localStorage.clear(); localStorage.setItem(k, d); }, [KEY, DATA]);
    await p.goto("about:blank"); await p.goto(BOARD_URL); await p.waitForTimeout(500);
    const recs = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    ok((await p.evaluate((k) => localStorage.getItem(k), KEY)) === DATA, L + "loading the board writes nothing");
    const m = await p.evaluate(() => {
      const cols = [...document.querySelectorAll(".kcol")].map((c) => ({ s: c.dataset.status, h: c.getBoundingClientRect().height, sh: c.scrollHeight, ch: c.clientHeight, cards: c.querySelectorAll(".kcard").length, count: +c.querySelector(".kcount").textContent }));
      return { section: document.getElementById("board").getBoundingClientRect().height, vh: innerHeight, cols, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    const cap = m.vh * (w <= 700 ? 0.58 : 0.62) + 2, ap = m.cols.find((c) => c.s === "Applied");
    ok(m.cols.every((c) => c.h <= cap), L + "every column capped at ≤" + Math.round(cap) + "px (max " + Math.round(Math.max(...m.cols.map((c) => c.h))) + ")");
    ok(m.section < 2 * cap + 700, L + "board section height " + Math.round(m.section) + "px");
    ok(ap.cards === ap.count && ap.count === 203 && ap.sh > ap.ch + 100, L + "Applied renders all 203 cards and scrolls (" + ap.sh + " > " + ap.ch + ")");
    ok(m.overflow <= 0, L + "no horizontal page overflow (" + m.overflow + ")");
    // sticky header + fade while scrolling
    const sc = await p.evaluate(() => {
      const c = document.querySelector('.kcol[data-status="Applied"]'); c.scrollIntoView({ block: "center", inline: "center" }); const fade0 = c.classList.contains("fade");
      c.scrollTop = 900; c.dispatchEvent(new Event("scroll"));
      const hd = c.querySelector(".khead").getBoundingClientRect(), cr = c.getBoundingClientRect(); const hit = document.elementFromPoint(hd.left + 30, hd.top + hd.height / 2);
      const st = getComputedStyle(c);
      const res = { fade0, headTop: hd.top - cr.top, headVisible: hd.height > 20 && !!hit && hit.closest(".khead") !== null, scrolled: c.scrollTop, osb: st.overscrollBehaviorY, sbw: st.scrollbarWidth };
      c.scrollTop = c.scrollHeight; c.dispatchEvent(new Event("scroll")); res.fadeEnd = c.classList.contains("fade"); c.scrollTop = 900; c.dispatchEvent(new Event("scroll")); return res;
    });
    ok(sc.scrolled === 900 && sc.headVisible && Math.abs(sc.headTop) <= 3, L + "column scrolls and its header + count stay visible at the top (" + sc.headTop + ")");
    ok(sc.fade0 && !sc.fadeEnd, L + "bottom fade shows while there's more, hides at the end");
    ok(sc.osb === "contain" && sc.sbw === "thin", L + "overscroll contained, slim scrollbar");
    // compact cards: date + menu on one row where it fits
    const card = await p.$eval('.kcol[data-status="Applied"] .kcard', (c) => { const d = c.querySelector(".kdate").getBoundingClientRect(), s = c.querySelector(".stage-wrap").getBoundingClientRect(); return { h: c.offsetHeight, one: Math.abs(d.top - s.top) < 14 }; });
    ok(card.one && card.h <= 96, L + "compact card " + card.h + "px, date and stage menu on one row");
    // drag from a scrolled column into another; Applied keeps its scroll position after re-render
    const before = await recs();
    const id = await p.evaluate(() => { const c = document.querySelector('.kcol[data-status="Applied"]'); const cr = c.getBoundingClientRect(); return [...c.querySelectorAll(".kcard")].find((k) => k.getBoundingClientRect().top > cr.top + 60).dataset.id; });
    await drag(p, id, "Screening"); await p.waitForTimeout(150);
    let after = await recs(); let diff = after.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i]));
    ok(diff.length === 1 && diff[0].id === id && diff[0].status === "Screening", L + "drag from scrolled Applied → Screening changed exactly that record");
    ok(Math.abs((await p.$eval('.kcol[data-status="Applied"]', (c) => c.scrollTop)) - 900) < 200, L + "Applied keeps its scroll position after the drop");
    // undo
    await p.click("#toast-undo"); await p.waitForTimeout(150);
    ok(JSON.stringify(await recs()) === JSON.stringify(before), L + "undo restores the stored data exactly");
    // drop into a scrolled column (Rejected scrolled down)
    await p.$eval('.kcol[data-status="Rejected"]', (c) => { c.scrollTop = 600; });
    const id2 = await p.$eval('.kcol[data-status="Applied"] .kcard', (c) => c.dataset.id);
    await drag(p, id2, "Rejected"); await p.waitForTimeout(150);
    after = await recs(); diff = after.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i]));
    ok(diff.length === 1 && diff[0].status === "Rejected" && (await p.$eval('.kcol[data-status="Rejected"] .kcount', (n) => n.textContent)) === "47", L + "drop into a scrolled Rejected column works (count 47)");
    await p.click("#toast-undo"); await p.waitForTimeout(150);
    // auto-scroll near the bottom edge while dragging
    const auto = await p.evaluate(() => {
      const c = document.querySelector('.kcol[data-status="Applied"]'); c.scrollTop = 0; const card = c.querySelector(".kcard"); const dt = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
      const r = c.getBoundingClientRect(); for (let i = 0; i < 10; i++) c.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.bottom - 6 }));
      const down = c.scrollTop;
      for (let i = 0; i < 4; i++) c.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 20, clientY: r.top + 6 }));
      const up = c.scrollTop; card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt })); c.classList.remove("over"); return { down, up };
    });
    ok(auto.down > 50 && auto.up < auto.down, L + "auto-scrolls while dragging near the edges (down " + auto.down + ", back up to " + auto.up + ")");
    // card menu
    const id3 = await p.$eval('.kcol[data-status="Applied"] .kcard', (c) => c.dataset.id);
    await p.selectOption('.kcard[data-id="' + id3 + '"] select', "Interview"); await p.waitForTimeout(150);
    after = await recs(); diff = after.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i]));
    ok(diff.length === 1 && diff[0].id === id3 && diff[0].status === "Interview" && (await p.$eval('.kcol[data-status="Interview"] .kcount', (n) => n.textContent)) === "1", L + "card menu moves the card");
    await p.click("#toast-undo"); await p.waitForTimeout(150);
    ok(JSON.stringify(await recs()) === JSON.stringify(before), L + "undo after menu restores the data");
    // "Open" still opens the detail dialog
    await p.click('.kcard[data-id="' + id3 + '"] .kopen'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => !!document.querySelector("dialog[open]")), L + "Open shows the details"); await p.keyboard.press("Escape");
    ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, L + "still no overflow");
    ok(errs.length === 0, L + "no console errors " + errs.join(" | "));
    await ctx.close();
  }
  await b.close(); if (srv) srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
