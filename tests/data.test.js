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
  assert.deepEqual(J.STATUSES, ["Applied", "Screening", "Interview", "Offer", "Rejected", "Withdrawn"]);
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
  const bad = J.validateInput({ company: "", role: "", status: "Interested", dateApplied: "2026-02-30", nextFollowUp: "x", link: "javascript:alert(1)" });
  assert.equal(bad.ok, false);
  for (const k of ["company", "role", "status", "dateApplied", "nextFollowUp", "link"]) assert.ok(bad.errors[k], k);
  assert.equal(J.validateInput({ company: "A", role: "B", status: "Applied", dateApplied: T, source: "Other" }).ok, true);
});

test("prepareImport matches previous behaviour (drops bad rows, dedupes ids, keeps logs)", () => {
  const p = J.prepareImport([rowShape, rowShape, withLog, { company: "x" }, Object.assign({}, rowShape, { id: "z", status: "Interested" })]);
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
