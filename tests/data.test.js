/* node --test tests/ */
const test = require("node:test");
const assert = require("node:assert/strict");
const J = require("../js/data.js");

const T = "2026-10-10";
const rowShape = { id: "rec-9d0d618de206", company: "FamilyWell", role: "IT Systems Administrator", status: "Applied", dateApplied: "2026-09-24", nextFollowUp: "2026-10-08", source: "Company site", pay: "$80-104k", link: "https://job-boards.greenhouse.io/familywell/jobs/1", notes: "Source: Company site | Location: Remote US", isSample: false };
const withLog = { id: "a2", company: "Acme", role: "Help Desk", status: "Interview", dateApplied: "2026-09-01", nextFollowUp: null, source: "LinkedIn", pay: "", link: "", notes: "", isSample: false, log: [{ id: "l1", date: "2026-10-12", type: "Interview", note: "Panel at 10am" }, { id: "l2", date: "2026-09-20", type: "Call", note: "Recruiter call" }] };
const legacy = { company: "Old Co", role: "Tech", status: "Screening", dateApplied: "2026-08-01", interviewNotes: "kept", customField: { a: 1 } };

test("storage key and gist settings match the previous app", () => {
  assert.equal(J.KEY, "brice-job-apps-v1");
  assert.equal(J.SYNC_KEY, "brice-job-apps-sync");
  assert.equal(J.GIST_FILENAME, "pipely-apps.json");
  assert.deepEqual(J.STATUSES, ["Interested", "Applied", "Screening", "Interview", "Offer", "Rejected", "Withdrawn"]);
  assert.equal(J.THEME_KEY, "brice-job-apps-theme");
  assert.equal(J.gistHashId("#pipely-gist=0123456789abcdef0123456789abcdef"), "0123456789abcdef0123456789abcdef");
  assert.equal(J.gistHashId("#pipely-sync=abc123"), "abc123");
  assert.equal(J.gistHashId("#bryz-jobs-gist=abc123"), "abc123");
  assert.equal(J.gistHashId("#other"), "");
});

test("readStored keeps records exactly as stored (no rewrite, unknown fields kept)", () => {
  const list = [rowShape, withLog, Object.assign({ id: "x3" }, legacy)];
  const raw = JSON.stringify(list);
  const r = J.readStored(raw);
  assert.equal(r.ok, true);
  assert.equal(r.apps.length, 3);
  assert.equal(JSON.stringify(r.apps), raw);
  assert.equal(r.apps[2].interviewNotes, "kept");
});

test("readStored: missing ids get an in-memory id without touching other fields", () => {
  const r = J.readStored(JSON.stringify([legacy]));
  assert.equal(r.ok, true);
  assert.ok(r.apps[0].id);
  assert.deepEqual(Object.assign({}, r.apps[0], { id: undefined }), Object.assign({}, legacy, { id: undefined }));
});

test("readStored: empty storage is an empty list, unreadable data is reported (not replaced)", () => {
  assert.deepEqual(J.readStored(null), { ok: true, apps: [], empty: true });
  assert.equal(J.readStored("{oops").ok, false);
  assert.equal(J.readStored('{"a":1}').ok, false);
  assert.equal(J.readStored("[1,2]").ok, false);
  assert.equal(J.readStored("[]").ok, true);
});

test("buildRecord on edit keeps log and unknown fields", () => {
  const existing = Object.assign({}, withLog, { extra: "keep me" });
  const rec = J.buildRecord({ company: "Acme", role: "Help Desk II", status: "Offer", source: "LinkedIn", dateApplied: "2026-09-01", nextFollowUp: "", pay: "$60k", link: "https://x.test/j", notes: "n" }, existing);
  assert.equal(rec.extra, "keep me");
  assert.deepEqual(rec.log, withLog.log);
  assert.equal(rec.status, "Offer");
  assert.equal(rec.nextFollowUp, null);
  assert.equal(rec.id, "a2");
});

test("new records use the previous app's shape", () => {
  const rec = J.buildRecord({ company: " New ", role: "Role", status: "Applied", source: "Indeed", dateApplied: T, nextFollowUp: "2026-10-17", pay: "", link: "", notes: "" }, null, "fixed");
  assert.deepEqual(Object.keys(rec), ["id", "company", "role", "status", "dateApplied", "nextFollowUp", "source", "pay", "link", "notes", "isSample"]);
  assert.equal(rec.company, "New");
  assert.equal(rec.isSample, false);
});

test("validation", () => {
  const bad = J.validateInput({ company: "", role: "", status: "Bogus", dateApplied: "2026-02-30", nextFollowUp: "x", link: "javascript:alert(1)" });
  assert.equal(bad.ok, false);
  for (const k of ["company", "role", "status", "dateApplied", "nextFollowUp", "link"]) assert.ok(bad.errors[k], k);
  assert.equal(J.validateInput({ company: "A", role: "B", status: "Applied", dateApplied: T, source: "Other" }).ok, true);
});

test("prepareImport matches previous behaviour (drops bad rows, dedupes ids, keeps logs)", () => {
  const p = J.prepareImport([rowShape, rowShape, withLog, { company: "x" }, Object.assign({}, rowShape, { id: "z", status: "Bogus" })]);
  assert.equal(p.unique.length, 2);
  assert.equal(p.skipped, 2);
  assert.equal(p.duplicateIds, 1);
  assert.deepEqual(p.unique[0], rowShape);
  assert.equal(p.unique[1].log.length, 2);
});

test("mergeInto / mergeCloud keep local logs and later follow-ups", () => {
  const local = [Object.assign({}, withLog, { nextFollowUp: "2026-10-20" })];
  const incoming = [Object.assign({}, withLog, { status: "Offer", nextFollowUp: "2026-10-15", log: [{ id: "l9", date: "2026-10-01", type: "Email", note: "Offer email" }] })];
  const m = J.mergeInto(local, incoming);
  assert.equal(m[0].status, "Offer");
  assert.equal(m[0].nextFollowUp, "2026-10-20");
  assert.equal(m[0].log.length, 3);
  const c = J.mergeCloud(local, incoming.concat([rowShape]));
  assert.equal(c.length, 2);
  assert.equal(c[0].log.length, 3);
});

test("response rate uses the previous 14-day definition", () => {
  const apps = [
    Object.assign({}, rowShape, { id: "1", dateApplied: "2026-09-01", status: "Applied" }),
    Object.assign({}, rowShape, { id: "2", dateApplied: "2026-09-01", status: "Rejected" }),
    Object.assign({}, rowShape, { id: "3", dateApplied: "2026-09-01", status: "Withdrawn" }),
    Object.assign({}, rowShape, { id: "4", dateApplied: "2026-10-05", status: "Screening" }),
  ];
  const r = J.responseStats(apps, T);
  assert.equal(r.pool, 2);
  assert.equal(r.heard, 1);
  assert.equal(r.rate, 50);
  assert.equal(J.responseStats([], T).rate, null);
});

test("follow-ups, interviews and activity come from real fields", () => {
  const apps = [rowShape, withLog, Object.assign({}, rowShape, { id: "r", status: "Rejected" })];
  assert.equal(J.followState(rowShape, T), "overdue");
  assert.equal(J.followUpsDue(apps, T).length, 1);
  const iv = J.upcomingInterviews(apps, T);
  assert.equal(iv.length, 1);
  assert.equal(iv[0].entry.note, "Panel at 10am");
  assert.equal(J.recentActivity(apps)[0].entry.id, "l1");
  const done = J.markFollowedUp(rowShape, T);
  assert.equal(done.nextFollowUp, "2026-10-17");
  assert.equal(done.log[0].type, "Follow-up");
  assert.equal(done.pay, rowShape.pay);
});

test("CSV export/import round trip with the previous columns", () => {
  const csv = J.toCsv([rowShape, withLog]);
  assert.ok(csv.startsWith("\uFEFFID,Company,Role,Status,Date applied,Next follow-up,Source,Pay,Link,Notes,Interview log"));
  const back = J.parseImportText(csv, "x.csv").list;
  assert.equal(back.length, 2);
  assert.equal(back[0].id, rowShape.id);
  assert.equal(back[0].notes, rowShape.notes);
  assert.equal(J.prepareImport(back).unique.length, 2);
});

test("parseImportText accepts the old JSON backup formats", () => {
  assert.equal(J.parseImportText(JSON.stringify([rowShape]), "b.json").list.length, 1);
  assert.equal(J.parseImportText(JSON.stringify({ apps: [rowShape] }), "b.json").list.length, 1);
  assert.ok(J.parseImportText("{bad", "b.json").error);
});

test("sync config reads the previous shape", () => {
  const cfg = J.readSyncConfig(JSON.stringify({ gistId: " abc ", token: "t", autoPull: false, autoPush: true }));
  assert.deepEqual(cfg, { gistId: "abc", token: "t", autoPull: false, autoPush: true });
  assert.deepEqual(J.readSyncConfig(null), { gistId: "", token: "", autoPull: true, autoPush: false });
});

test("Interested is backward compatible and round-trips through import / gist pull", () => {
  const old = [rowShape, withLog];
  const before = JSON.stringify(old);
  const r = J.readStored(before);
  assert.equal(JSON.stringify(r.apps), before); // records without Interested load identically
  const interested = Object.assign({}, rowShape, { id: "int1", status: "Interested", extra: { keep: 1 } });
  const round = J.prepareImport(JSON.parse(JSON.stringify([interested])));
  assert.equal(round.unique.length, 1);
  assert.equal(round.unique[0].status, "Interested");
  const merged = J.mergeCloud([interested], round.unique);
  assert.equal(merged[0].status, "Interested");
  assert.deepEqual(merged[0].extra, { keep: 1 });
  // case / whitespace variants import as the canonical name
  assert.equal(J.prepareImport([Object.assign({}, rowShape, { status: " rejected " })]).unique[0].status, "Rejected");
});

test("status counting tolerates case/whitespace variants without changing the record", () => {
  const list = [{ id: "a", status: "Rejected" }, { id: "b", status: " rejected" }, { id: "c", status: "REJECTED " }, { id: "d", status: "interested" }, { id: "e", status: "Closed" }, { id: "f" }];
  const c = J.statusCounts(list);
  assert.equal(c.Rejected, 3); assert.equal(c.Interested, 1); assert.equal(c.Withdrawn, 1); assert.equal(c.Applied, 1);
  assert.equal(list[1].status, " rejected");
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0), list.length);
});

test("response rate leaves out Interested and Withdrawn; matches old 14-day rule", () => {
  const mk = (id, status, d) => ({ id, status, dateApplied: d, company: id, role: "r" });
  const t = "2026-10-10";
  const list = [mk("1", "Applied", "2026-09-01"), mk("2", "Rejected", "2026-09-01"), mk("3", "Screening", "2026-09-01"), mk("4", "Withdrawn", "2026-09-01"),
    mk("5", "Interested", "2026-09-01"), mk("6", "Applied", "2026-10-05")];
  const rs = J.responseStats(list, t);
  assert.equal(rs.pool, 3); assert.equal(rs.heard, 2); assert.equal(rs.rate, 67);
});

test("follow-ups: Interested counts as active, closed stages do not", () => {
  const t = "2026-10-10";
  assert.equal(J.followState({ status: "Interested", nextFollowUp: "2026-10-09" }, t), "overdue");
  assert.equal(J.followState({ status: "Rejected", nextFollowUp: "2026-10-09" }, t), null);
  assert.equal(J.followState({ status: "Applied", nextFollowUp: "2026-10-17" }, t), "soon");
  assert.equal(J.followState({ status: "Applied", nextFollowUp: "2026-10-18" }, t), null);
});

test("charts: weekly, sources and heatmap add up to the applications in range", () => {
  const t = "2026-10-10"; // Saturday
  assert.equal(J.weekStart(t), "2026-10-05");
  const list = [{ id: "1", status: "Applied", dateApplied: "2026-10-05", source: "Easy Apply" }, { id: "2", status: "Rejected", dateApplied: "2026-10-01", source: "Company site" },
    { id: "3", status: "Interested", dateApplied: "2026-10-06", source: "LinkedIn" }, { id: "4", status: "Applied", dateApplied: "2026-10-10", source: "weird" }];
  const w = J.weekly(list, t, 2);
  assert.deepEqual(w.map((x) => x.n), [1, 2]);
  assert.equal(w[1].counts.Other, 1);
  const sc = J.sourceCounts(list);
  assert.equal(Object.values(sc).reduce((a, b) => a + b, 0), 3);
  const hm = J.heatmap(list, t, 2);
  assert.equal(hm.days.length, 14);
  assert.equal(hm.days.reduce((a, d) => a + d.n, 0), 3);
  assert.equal(J.heatLevel(0, 5), 0); assert.equal(J.heatLevel(5, 5), 4);
});

test("rejected view helpers", () => {
  const a = { id: "r", status: "Rejected", company: "X", role: "Y", dateApplied: "2026-09-01", notes: "Rejected 2026-09-08 by email", source: "Company site" };
  assert.equal(J.rejectedOn(a), "2026-09-08");
  assert.equal(J.daysToNo(a), 7);
  const list = [a, { id: "w", status: "Withdrawn", company: "W", role: "Z", dateApplied: "2026-09-02" }, { id: "p", status: "Applied", company: "P", role: "Q", dateApplied: "2026-09-03" }];
  assert.equal(J.rejectedList(list, {}).length, 1);
  assert.equal(J.rejectedList(list, { withdrawn: true }).length, 2);
  const st = J.rejectedStats(list, "2026-09-20");
  assert.equal(st.count, 1); assert.equal(st.median, 7); assert.equal(st.thisMonth, 1);
});

test("theme defaults to light; only an explicit dark choice turns it on", () => {
  assert.equal(J.themeFrom(null), "light");
  assert.equal(J.themeFrom("light"), "light");
  assert.equal(J.themeFrom("dark"), "dark");
  assert.equal(J.themeFrom("system"), "light");
});
