const { chromium } = require("playwright-core");
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
// Browser check: node tests/browser.check.js [siteRoot] [records.json] [shotsDir]
// Needs playwright-core and Chrome (CHROME env or /usr/bin/google-chrome). Uses fixture data; all network writes are blocked.
const ROOT = process.argv[2] || path.join(__dirname, ".."), REAL = process.argv[3] || path.join(__dirname, "fixtures/apps.json"), OUT = process.argv[4] || "/tmp/jobs-shots";
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8801, BASE = "http://127.0.0.1:" + PORT + "/";
const KEY = "brice-job-apps-v1";
let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 800));
  const realRaw = fs.readFileSync(REAL, "utf8");
  const real = JSON.parse(realRaw);
  const N = real.length;
  // add an unknown field + log to one record to prove round-trip
  const realPlus = JSON.parse(realRaw);
  realPlus[5].extraField = { keep: true }; realPlus[5].log = [{ id: "lg1", date: "2026-10-20", type: "Interview", note: "Panel" }];
  const browser = await chromium.launch({ executablePath: process.env.CHROME || "/usr/bin/google-chrome", headless: true });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const errors = [], patches = [], gets = [];
  await ctx.route("**/*", async (route) => {
    const u = route.request().url(), m = route.request().method();
    if (u.startsWith(BASE)) return route.continue();
    if (u.includes("gist.githubusercontent.com")) { gets.push(u); return route.fulfill({ status: 200, contentType: "application/json", body: realRaw, headers: { "access-control-allow-origin": "*" } }); }
    if (u.includes("api.github.com") && m !== "GET") { patches.push(u); return route.fulfill({ status: 500, body: "blocked in test" }); }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  const ls = (k) => page.evaluate((k) => localStorage.getItem(k), k);

  // 1) Fresh browser: empty state, nothing written
  // Pages: each section lives on its own hash route now
  const route = async (r) => { await page.evaluate((r) => { location.hash = "#/" + r; }, r); await page.waitForTimeout(80); };
  await page.goto(BASE);
  ok((await ls(KEY)) === null, "fresh load writes nothing to " + KEY);
  ok(/No applications yet/.test(await page.textContent("#job-list")), "empty state shown");
  const body0 = await page.textContent("body");
  ok(!/LAB|example|Example|concept/.test(body0), "no LAB/example/concept text in page");

  // 2) Stored payload
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(realPlus)]);
  const before = await ls(KEY);
  await page.reload();
  ok((await ls(KEY)) === before, "load does not rewrite stored data");
  ok((await page.textContent("#hero-count")) === N + " applications", "hero shows N applications");
  const allChip = await page.textContent("#chips button:first-child b");
  ok(allChip === String(N), "All chip = N (got " + allChip + ")");
  const kp = await page.$$eval("#kpis .v", (n) => n.map((x) => x.textContent));
  console.log("  KPIs:", kp.join(" | "));
  ok(kp[0] === String(N), "Applications KPI = N");
  ok((await page.$$("#job-list .item")).length === 40, "list paginates at 40");
  const ivText = await page.textContent("#iv-list");
  ok(/Panel/.test(ivText), "logged interview appears in Interviews");
  // spot check: search for a record and open details
  const probe = real[17];
  await route("applications");
  await page.fill("#q", probe.company);
  await page.click("#job-list .item:first-child button:has-text('Details')");
  ok((await page.textContent("#d-title")).includes(probe.company), "details open for " + probe.company);
  await page.click("#detail-dlg .dlg-x");
  await page.fill("#q", "");

  // 3) Status change touches only that record; unknown fields kept
  const target = realPlus[5];
  await page.fill("#q", target.company);
  const newStatus = target.status === "Screening" ? "Interview" : "Screening";
  await page.selectOption("#job-list .item:first-child select", newStatus);
  let after = JSON.parse(await ls(KEY));
  const changed = after.filter((a, i) => JSON.stringify(a) !== JSON.stringify(realPlus[i]));
  ok(changed.length === 1 && changed[0].status === newStatus, "status change modified exactly 1 record (" + changed.map((c) => c.company + ":" + c.status).join(",") + " target " + target.company + ")");
  ok(JSON.stringify(after[5].extraField) === '{"keep":true}' && after[5].log.length === 1, "unknown field + log preserved");
  ok(after.length === N, "still N after edit");
  await page.click("#toast-undo");
  after = JSON.parse(await ls(KEY));
  ok(JSON.stringify(after) === JSON.stringify(realPlus), "undo restores exact original records");
  await page.fill("#q", "");

  // 4) CRUD + reload persistence
  await route("");
  await page.click(".hero [data-act=add]");
  await page.fill("#f-company", "Playwright Test Co");
  await page.fill("#f-role", "QA Tech");
  await page.click("#job-submit");
  ok(JSON.parse(await ls(KEY)).length === N + 1, "add -> N+1");
  await page.reload();
  ok((await page.textContent("#hero-count")) === (N + 1) + " applications", "add persisted across reload");
  await route("applications");
  await page.fill("#q", "Playwright Test Co");
  await page.click("#job-list .item:first-child button:has-text('Edit')");
  await page.fill("#f-role", "QA Tech II");
  await page.click("#job-submit");
  ok(JSON.parse(await ls(KEY)).find((a) => a.company === "Playwright Test Co").role === "QA Tech II", "edit saved");
  await page.click("#job-list .item:first-child button:has-text('Details')");
  await page.fill("#d-log-note", "Phone screen booked");
  await page.selectOption("#d-log-type", "Screen");
  await page.click("#detail-body form.inline:not(.two) button[type=submit]");
  ok(JSON.parse(await ls(KEY)).find((a) => a.company === "Playwright Test Co").log.length === 1, "log entry saved");
  await page.click("#detail-body .btn.danger");
  await page.click("#c-ok");
  await page.waitForTimeout(200);
  ok(JSON.parse(await ls(KEY)).length === N, "delete -> N (got " + JSON.parse(await ls(KEY)).length + ")");
  await page.fill("#q", "");
  after = JSON.parse(await ls(KEY));
  ok(JSON.stringify(after) === JSON.stringify(realPlus), "after add/edit/delete the original records are byte-identical");

  // 5) Export / import
  await route("sync");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#data [data-act=export]")]);
  const exp = path.join(OUT, "export.json"); await dl.saveAs(exp);
  const exported = JSON.parse(fs.readFileSync(exp, "utf8"));
  ok(JSON.stringify(exported) === JSON.stringify(after), "export JSON = stored records (" + exported.length + ")");
  await page.setInputFiles("#import-file", exp);
  await page.click("#import-merge");
  ok(JSON.parse(await ls(KEY)).length === N, "import merge of own export keeps N");
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("#data [data-act=export-csv]")]);
  const csvp = path.join(OUT, "export.csv"); await dl2.saveAs(csvp);
  ok(fs.readFileSync(csvp, "utf8").split(/\r\n/).length === N + 1, "CSV export has N rows + header");

  // 6) Gist one-tap link + auto pull on empty browser (gist mocked with the fixture payload; writes blocked)
  await page.evaluate(() => localStorage.clear());
  await page.goto("about:blank");
  await page.goto(BASE + "#pipely-gist=0123456789abcdef0123456789abcdef");
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem("brice-job-apps-v1") || "[]")).length > 0, null, { timeout: 5000 }).catch(() => {});
  const cfg = JSON.parse(await ls("brice-job-apps-sync"));
  ok(cfg.gistId === "0123456789abcdef0123456789abcdef" && cfg.autoPull === true, "#pipely-gist link saves gist id + auto-pull");
  ok(!(await page.evaluate(() => location.hash)), "hash cleared");
  const pulled = JSON.parse((await ls(KEY)) || "[]");
  ok(pulled.length === N, "auto-pull filled empty browser with N from gist");
  const prepared = require(path.join(ROOT, "js/data.js")).prepareImport(real).unique;
  ok(JSON.stringify(pulled) === JSON.stringify(prepared), "pulled records equal the gist records (same normalisation as before)");
  ok(gets.length >= 1 && gets[0].includes("/supbrice/0123456789abcdef0123456789abcdef/raw/pipely-apps.json"), "pull used raw gist URL with pipely-apps.json");
  ok(patches.length === 0, "no push/PATCH attempted");

  // 7) Unreadable data is kept, copied, and writes are blocked
  await page.evaluate((k) => { localStorage.clear(); localStorage.setItem(k, "{not json"); }, KEY);
  await page.reload();
  ok(await page.isVisible("#storage-warn"), "unreadable banner visible");
  const keys = await page.evaluate(() => Object.keys(localStorage));
  ok(keys.some((k) => k.startsWith("brice-job-apps-v1-unreadable-")), "unreadable copy saved");
  await route("");
  await page.click(".hero [data-act=add]");
  await page.fill("#f-company", "X"); await page.fill("#f-role", "Y"); await page.click("#job-submit");
  ok((await ls(KEY)) === "{not json", "original unreadable value untouched after attempted save");
  await page.reload();
  ok((await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("brice-job-apps-v1-unreadable-")).length)) === 1, "reload does not pile up extra copies");

  // 8) Layout at 390/768/1440 with stored data
  await page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); localStorage.setItem("brice-job-apps-sync", JSON.stringify({ gistId: "", token: "", autoPull: false, autoPush: false })); }, [KEY, realRaw]);
  for (const w of [390, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.reload();
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(ov <= 0, "no horizontal overflow at " + w + " (" + ov + ")");
    await page.screenshot({ path: path.join(OUT, "jobs-" + w + ".png"), fullPage: false });
    await route("applications");
    await page.click("#job-list .item:first-child button:has-text('Details')");
    const dov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(dov <= 0, "details dialog no overflow at " + w);
    await page.keyboard.press("Escape");
  }
  ok(errors.length === 0, "no console errors" + (errors.length ? ": " + errors.slice(0, 5).join(" || ") : ""));
  await browser.close(); srv.kill();
  console.log(fails ? fails + " FAILED" : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
