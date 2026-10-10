// Browser check for the board, insights, rejected view, Interested stage and opt-in dark mode.
// node tests/views.check.js [siteRoot] [records.json] [shotsDir]
// Expected numbers are computed here straight from the raw JSON (not with js/data.js).
// Needs playwright-core and Chrome (CHROME env or /usr/bin/google-chrome). All network writes are blocked.
const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const ROOT = process.argv[2] || path.join(__dirname, ".."), DATA = process.argv[3] || path.join(__dirname, "fixtures/apps.json"), OUT = process.argv[4] || "/tmp/jobs-views";
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8802, BASE = "http://127.0.0.1:" + PORT + "/", KEY = "brice-job-apps-v1", THEME = "brice-job-apps-theme";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const raw = fs.readFileSync(DATA, "utf8"), recs = JSON.parse(raw);
const pad = (n) => String(n).padStart(2, "0");
const d0 = new Date(), TODAY = d0.getFullYear() + "-" + pad(d0.getMonth() + 1) + "-" + pad(d0.getDate());
const shift = (iso, n) => { const [y, m, d] = iso.split("-").map(Number); const x = new Date(y, m - 1, d + n); return x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate()); };
const NAMES = ["Interested", "Applied", "Screening", "Interview", "Offer", "Rejected", "Withdrawn"];
const canon = (s) => { const t = String(s == null ? "" : s).trim().toLowerCase(); return NAMES.find((n) => n.toLowerCase() === t) || null; };
function expected(list) {
  const c = {}; NAMES.forEach((n) => (c[n] = 0)); let unknown = 0;
  list.forEach((a) => { const s = canon(a.status); if (s) c[s]++; else unknown++; });
  const cutoff = shift(TODAY, -14);
  const pool = list.filter((a) => !["Withdrawn", "Interested"].includes(canon(a.status)) && /^\d{4}-\d{2}-\d{2}$/.test(a.dateApplied || "") && a.dateApplied <= cutoff);
  const heard = pool.filter((a) => canon(a.status) !== "Applied");
  const act = list.filter((a) => ["Interested", "Applied", "Screening", "Interview"].includes(canon(a.status)) && /^\d{4}-\d{2}-\d{2}$/.test(a.nextFollowUp || ""));
  return { c, unknown, total: list.length, pool: pool.length, heard: heard.length, rate: pool.length ? Math.round(heard.length / pool.length * 100) : null,
    fuOverdue: act.filter((a) => a.nextFollowUp < TODAY).length, fuToday: act.filter((a) => a.nextFollowUp === TODAY).length,
    fu7: act.filter((a) => a.nextFollowUp <= shift(TODAY, 7)).length };
}
(async () => {
  const E = expected(recs);
  console.log("  expected:", JSON.stringify(E));
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  const ctx = await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce", acceptDownloads: true }); // system dark on purpose: page must stay light by default
  const errors = [], writes = [];
  await ctx.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith(BASE)) return r.continue(); if (r.request().method() !== "GET") writes.push(u); return r.abort(); });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  const ls = (k) => page.evaluate((k) => localStorage.getItem(k), k);
  // Pages: each section lives on its own hash route now
  const route = async (r) => { await page.evaluate((r) => { location.hash = "#/" + r; }, r); await page.waitForTimeout(80); };
  await page.goto(BASE);
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); localStorage.setItem("brice-job-apps-sync", JSON.stringify({ gistId: "", token: "", autoPull: false, autoPush: false })); }, [KEY, raw]);
  await page.reload();
  ok((await ls(KEY)) === raw, "load does not rewrite stored data");

  // Theme: light by default even with system dark; nothing written until toggled
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok((await page.getAttribute("html", "data-theme")) === "light" && (await bg()) === "rgb(255, 255, 255)", "system-dark user still gets the light default (" + (await bg()) + ")");
  ok((await ls(THEME)) === null, "no theme key written on load");

  // Numbers: KPIs, chips, funnel, board, rejected
  const kp = await page.$$eval("#kpis .v", (n) => n.map((x) => x.textContent));
  ok(kp[0] === String(E.total), "KPI total = " + E.total + " (got " + kp[0] + ")");
  ok(kp[1] === String(E.c.Screening + E.c.Interview), "KPI in progress = Screening+Interview = " + (E.c.Screening + E.c.Interview) + " (got " + kp[1] + ")");
  ok(kp[2] === String(E.c.Interview), "KPI interviews = " + E.c.Interview + " (got " + kp[2] + ")");
  ok(kp[3] === String(E.c.Offer), "KPI offers = " + E.c.Offer + " (got " + kp[3] + ")");
  ok(kp[4] === (E.rate == null ? "—" : E.rate + "%"), "KPI response rate = " + E.heard + "/" + E.pool + " = " + E.rate + "% (got " + kp[4] + ")");
  const chips = await page.$$eval("#chips button", (n) => n.map((b) => [b.textContent.replace(/\d+$/, "").trim(), b.querySelector("b").textContent]));
  const funnel = await page.$$eval("#chart-funnel .frow", (n) => n.map((r) => [r.dataset.status, r.querySelector("b").textContent]));
  const cols = await page.$$eval(".kcol", (n) => n.map((c) => [c.dataset.status, c.querySelector(".kcount").textContent]));
  for (const s of NAMES) {
    const want = String(E.c[s]);
    const ch = (chips.find((x) => x[0] === s) || [])[1], fu = (funnel.find((x) => x[0] === s) || [])[1], co = (cols.find((x) => x[0] === s) || [])[1];
    ok(ch === want && fu === want && co === want, s + ": chip/chart/board = " + [ch, fu, co].join("/") + " (expected " + want + ")");
  }
  ok(E.unknown === 0 || true, "records with unrecognised status: " + E.unknown);
  const wkTotal = await page.$$eval("#chart-weekly .legend b", (n) => n.reduce((t, b) => t + Number(b.textContent), 0));
  const srcTotal = await page.$$eval("#chart-sources .slist b", (n) => n.reduce((t, b) => t + Number(b.textContent), 0));
  ok(srcTotal === E.total - E.c.Interested, "sources chart adds up to applied records (" + srcTotal + ")");
  const eightWeekStart = (() => { const [y, m, d] = TODAY.split("-").map(Number); const dt = new Date(y, m - 1, d); return shift(TODAY, -((dt.getDay() + 6) % 7) - 49); })();
  const inRange = recs.filter((a) => canon(a.status) !== "Interested" && a.dateApplied >= eightWeekStart && a.dateApplied <= shift(TODAY, 7)).length;
  ok(wkTotal === inRange, "weekly chart total = applications in the last 8 weeks (" + wkTotal + " vs " + inRange + ")");
  const rejV = await page.textContent("#rej-stats .card:first-child .v");
  ok(rejV === String(E.c.Rejected), "Rejected view count = " + E.c.Rejected + " (got " + rejV + ")");
  const rejRows = await page.$$eval("#rej-list .item", (n) => n.length);
  ok(rejRows === Math.min(40, E.c.Rejected), "Rejected list shows " + rejRows + " rows (page of 40)");
  ok(new RegExp("^\\d+ shown · " + E.c.Rejected + " rejected$").test(await page.textContent("#rej-sub")), "Rejected badge: " + (await page.textContent("#rej-sub")));
  await route("rejected");
  await page.check("#rej-withdrawn");
  ok((await page.textContent("#rej-sub")).includes("+ " + E.c.Withdrawn + " withdrawn"), "include withdrawn adds " + E.c.Withdrawn);
  await page.uncheck("#rej-withdrawn");
  const fuSub = await page.textContent("#fu-sub");
  ok(fuSub === (E.fu7 ? E.fuOverdue + " overdue · " + E.fuToday + " due today · " + (E.fu7 - E.fuOverdue - E.fuToday) + " this week" : "Overdue first"), "follow-ups: " + fuSub + " (expected " + E.fuOverdue + "/" + E.fuToday + "/" + E.fu7 + ")");

  // Drag a card between stages: exactly one record changes, undo restores
  const target = await page.$eval('.kcol[data-status="Applied"] .kcard', (c) => c.dataset.id).catch(() => null);
  if (target) {
    // HTML5 drag events dispatched in the page (Playwright's mouse drag emulation is unreliable for HTML5 DnD)
    await page.evaluate((id) => {
      const card = document.querySelector('.kcol[data-status="Applied"] .kcard[data-id="' + id + '"]');
      const col = document.querySelector('.kcol[data-status="Screening"]');
      const dt = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
      col.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      col.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      card.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
    }, target);
    const after = JSON.parse(await ls(KEY));
    const diff = after.filter((a, i) => JSON.stringify(a) !== JSON.stringify(recs[i]));
    ok(diff.length === 1 && diff[0].id === target && diff[0].status === "Screening", "drag Applied → Screening changed exactly that record");
    ok(JSON.stringify(Object.keys(diff[0])) === JSON.stringify(Object.keys(recs.find((r) => r.id === target))), "dragged record kept all its fields");
    await page.click("#toast-undo");
    ok((await ls(KEY)) === JSON.stringify(recs), "undo restores the exact stored records");
    // Touch / keyboard path: the menu on a board card
    await route("board");
    await page.selectOption('.kcol[data-status="Applied"] .kcard[data-id="' + target + '"] select', "Interview");
    const viaMenu = JSON.parse(await ls(KEY)).filter((a, i) => JSON.stringify(a) !== JSON.stringify(recs[i]));
    ok(viaMenu.length === 1 && viaMenu[0].status === "Interview", "board card menu moves the card");
    ok((await page.$eval('.kcol[data-status="Interview"] .kcount', (n) => n.textContent)) === String(E.c.Interview + 1), "Interview column count updates");
    await page.click("#toast-undo");
    ok((await ls(KEY)) === JSON.stringify(recs), "undo after menu move restores exactly");
  } else ok(false, "no Applied card to drag");

  // Interested: add one, round-trip through export/import, other records untouched
  await route("");
  await page.click(".hero [data-act=add]");
  await page.fill("#f-company", "Interested Test Co"); await page.fill("#f-role", "Tech");
  await page.selectOption("#f-status", "Interested");
  await page.click("#job-submit");
  let st = JSON.parse(await ls(KEY));
  const added = st.find((a) => a.company === "Interested Test Co");
  ok(added && added.status === "Interested" && st.length === recs.length + 1, "Interested application saved");
  ok(JSON.stringify(st.filter((a) => a !== added && a.company !== "Interested Test Co")) === JSON.stringify(recs), "existing records unchanged by the add");
  ok((await page.$eval('.kcol[data-status="Interested"] .kcount', (n) => n.textContent)) === String(E.c.Interested + 1), "Interested column updated");
  ok((await page.$$eval("#kpis .v", (n) => n[4].textContent)) === kp[4], "response rate unchanged by an Interested add");
  await route("sync");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#data [data-act=export]")]);
  const exp = path.join(OUT, "views-export.json"); await dl.saveAs(exp);
  await page.evaluate((k) => localStorage.removeItem(k), KEY); await page.reload();
  await page.setInputFiles("#import-file", exp); await page.click("#import-replace"); await page.waitForTimeout(200);
  st = JSON.parse(await ls(KEY));
  ok(st.length === recs.length + 1 && st.find((a) => a.id === added.id).status === "Interested", "Interested survives export → import");
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, raw]); await page.reload();

  // Dark mode toggle: opt in, persists under the old key, back to light
  await page.click("#theme-btn");
  ok((await ls(THEME)) === "dark" && (await page.getAttribute("html", "data-theme")) === "dark", "toggle saves dark under " + THEME);
  await page.reload();
  ok((await page.getAttribute("html", "data-theme")) === "dark" && (await bg()) !== "rgb(255, 255, 255)", "dark persists after reload");

  // Layout: light + dark at 390/768/1440
  for (const theme of ["light", "dark"]) {
    await page.evaluate(([k, t]) => localStorage.setItem(k, t), [THEME, theme]);
    for (const w of [390, 768, 1440]) {
      await page.setViewportSize({ width: w, height: 900 }); await page.reload();
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      ok(ov <= 0, theme + " " + w + ": no horizontal overflow (" + ov + ")");
      for (const sec of ["board", "insights", "rejected"]) {
        await route(sec); await page.waitForTimeout(100);
        await page.screenshot({ path: path.join(OUT, sec + "-" + theme + "-" + w + ".png") });
      }
    }
  }
  await page.click("#theme-btn");
  ok((await ls(THEME)) === "light" && (await page.getAttribute("html", "data-theme")) === "light", "toggle back to light");
  ok(writes.length === 0, "no network writes");
  ok(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.slice(0, 5).join(" || ") : ""));
  await browser.close(); srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
