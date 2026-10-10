/* Bryz Jobs: data/logic module (pure, no DOM).
 * Reads and writes the SAME records the previous Bryz Jobs used:
 *   localStorage "brice-job-apps-v1" = JSON array of
 *   { id, company, role, status, dateApplied, nextFollowUp, source, pay, link, notes, isSample, log?[] , ...anything else }
 * Unknown fields are kept untouched. Nothing is rewritten on load.
 * Works in the browser (window.BryzJobs) and in Node (module.exports) for tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BryzJobs = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const KEY = "brice-job-apps-v1";
  const SYNC_KEY = "brice-job-apps-sync";
  const UNREADABLE_PREFIX = KEY + "-unreadable-";
  const GIST_FILENAME = "pipely-apps.json";
  const RETIRED_GIST_ID = "7532d2540c1f892127b57bd7aa17e93e";
  const DEFAULT_GIST_ID = "";
  const STATUSES = ["Applied", "Screening", "Interview", "Offer", "Rejected", "Withdrawn"];
  const ACTIVE = ["Applied", "Screening", "Interview"];
  const CLOSED = ["Rejected", "Withdrawn"];
  const SOURCES = ["Easy Apply", "LinkedIn", "Indeed", "Company site", "Referral", "Other"];
  const LOG_TYPES = ["Interview", "Screen", "Call", "Email", "Follow-up", "Note"];
  const SAMPLE_IDS = new Set(["sample-offer", "sample-helpdesk", "sample-desktop", "sample-sysadmin", "sample-servicedesk", "sample-rejected"]);
  const RESPONSE_DAYS = 14;
  const LIMITS = { company: 120, role: 160, pay: 60, link: 1000, notes: 4000, logNote: 500 };

  function uid() {
    const c = typeof crypto !== "undefined" ? crypto : null;
    return (c && c.randomUUID && c.randomUUID()) || ("id-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  }
  function isRealISO(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const p = value.split("-").map(Number);
    const dt = new Date(p[0], p[1] - 1, p[2]);
    return dt.getFullYear() === p[0] && dt.getMonth() === p[1] - 1 && dt.getDate() === p[2];
  }
  function cleanFollowUp(value) { return isRealISO(value) ? value : null; }
  function safeHref(raw) {
    const value = String(raw || "").trim();
    if (!/^https?:\/\//i.test(value)) return "";
    try { const url = new URL(value); if (url.protocol === "http:" || url.protocol === "https:") return url.href; } catch (e) { /* ignore */ }
    return "";
  }
  function toISO(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(iso, n) {
    const p = iso.split("-").map(Number);
    return toISO(new Date(p[0], p[1] - 1, p[2] + n));
  }
  function sourceBucket(raw) {
    const s = String(raw || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (s.includes("easy apply") || s.includes("easyapply")) return "Easy Apply";
    if (s.includes("indeed")) return "Indeed";
    if (s.includes("company site") || s.includes("company website") || s.includes("company page")) return "Company site";
    if (s.includes("linkedin")) return "LinkedIn";
    return "Other";
  }
  function cleanLog(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    raw.forEach((e) => {
      if (!e || typeof e !== "object") return;
      const note = String(e.note || "").trim().slice(0, LIMITS.logNote);
      if (!isRealISO(e.date) || !note) return;
      out.push({ id: typeof e.id === "string" && e.id ? e.id : uid(), date: e.date, type: LOG_TYPES.includes(e.type) ? e.type : "Note", note });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  function mergeLogs(a, b) {
    const seen = new Set();
    const out = [];
    cleanLog([].concat(a || [], b || [])).forEach((e) => {
      const key = e.id + "|" + e.date + "|" + e.note;
      if (seen.has(e.id) || seen.has(key)) return;
      seen.add(e.id); seen.add(key);
      out.push(e);
    });
    return out;
  }

  /* ---------- reading storage (never writes) ---------- */
  // Returns { ok:true, apps } or { ok:false, reason }. Records are the stored objects as-is;
  // a record with no usable id gets one in memory only (it is written only when you next save a change).
  function readStored(raw) {
    if (raw === null || raw === undefined) return { ok: true, apps: [], empty: true };
    let data;
    try { data = JSON.parse(raw); } catch (e) { return { ok: false, reason: "not-json" }; }
    if (!Array.isArray(data)) return { ok: false, reason: "not-array" };
    const apps = [];
    const seen = new Set();
    for (const item of data) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, reason: "bad-record" };
      let rec = item;
      if (typeof rec.id !== "string" || !rec.id || seen.has(rec.id)) rec = Object.assign({}, rec, { id: uid() });
      seen.add(rec.id);
      apps.push(rec);
    }
    return { ok: true, apps };
  }
  // Display helpers: tolerate legacy/odd values without changing the record.
  function statusOf(a) { return STATUSES.includes(a && a.status) ? a.status : "Applied"; }
  function isSample(a) { return !!(a && a.isSample && SAMPLE_IDS.has(a.id)); }
  function followUpOf(a) { return cleanFollowUp(a && a.nextFollowUp); }
  function logOf(a) { return cleanLog(a && a.log); }

  /* ---------- import normalisation (identical to the previous app) ---------- */
  function normalizeImported(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const company = String(item.company || "").trim();
    const role = String(item.role || "").trim();
    if (!company || !role) return null;
    if (!isRealISO(item.dateApplied)) return null;
    if (!STATUSES.includes(item.status)) return null;
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : uid();
    const linkRaw = String(item.link || "").trim();
    const out = {
      id, company, role,
      status: item.status,
      dateApplied: item.dateApplied,
      nextFollowUp: cleanFollowUp(item.nextFollowUp),
      source: SOURCES.includes(item.source) ? item.source : sourceBucket(item.source),
      pay: String(item.pay || "").trim(),
      link: linkRaw ? safeHref(linkRaw) : "",
      notes: String(item.notes || "").trim(),
      isSample: SAMPLE_IDS.has(id) && item.isSample !== false,
      log: cleanLog(item.log)
    };
    if (!out.log.length) delete out.log;
    return out;
  }
  function prepareImport(list) {
    const mapped = [];
    let skipped = 0;
    (Array.isArray(list) ? list : []).forEach((item) => {
      const next = normalizeImported(item);
      if (!next) skipped += 1; else mapped.push(next);
    });
    const seen = new Set();
    const unique = [];
    let duplicateIds = 0;
    mapped.forEach((item) => {
      if (seen.has(item.id)) { duplicateIds += 1; return; }
      seen.add(item.id);
      unique.push(item);
    });
    return { unique, skipped, duplicateIds };
  }
  function mergeRecord(current, item) {
    const out = Object.assign({}, current, item);
    const log = mergeLogs(current.log, item.log);
    if (log.length || current.log) out.log = log; else delete out.log;
    if (current.nextFollowUp && item.nextFollowUp && current.nextFollowUp > item.nextFollowUp) out.nextFollowUp = current.nextFollowUp;
    return out;
  }
  function mergeInto(apps, incoming) {
    const byId = new Map(apps.map((a) => [a.id, a]));
    incoming.forEach((item) => { const cur = byId.get(item.id); byId.set(item.id, cur ? mergeRecord(cur, item) : item); });
    return Array.from(byId.values());
  }
  // Pull "merge" semantics from the previous app's cloud sync.
  function mergeCloud(apps, cloud) {
    const out = apps.slice();
    const idx = new Map(out.map((a, i) => [a.id, i]));
    cloud.forEach((item) => {
      if (!idx.has(item.id)) { idx.set(item.id, out.length); out.push(item); return; }
      const cur = out[idx.get(item.id)];
      const next = Object.assign({}, cur, {
        company: item.company, role: item.role, status: item.status, dateApplied: item.dateApplied,
        nextFollowUp: item.nextFollowUp || cur.nextFollowUp || null,
        source: item.source, pay: item.pay, link: item.link, notes: item.notes, isSample: item.isSample,
        log: mergeLogs(cur.log, item.log)
      });
      if (!next.log || !next.log.length) delete next.log;
      out[idx.get(item.id)] = next;
    });
    return out;
  }
  function onlySamples(list) { return !list.length || list.every((a) => a && a.isSample); }
  function realCount(list) { return list.filter((a) => a && !a.isSample).length; }

  /* ---------- form validation + record building ---------- */
  function validateInput(input) {
    const e = {};
    const company = String(input.company || "").trim(), role = String(input.role || "").trim();
    if (!company) e.company = "Enter a company name.";
    else if (company.length > LIMITS.company) e.company = "Company must be " + LIMITS.company + " characters or fewer.";
    if (!role) e.role = "Enter a role or job title.";
    else if (role.length > LIMITS.role) e.role = "Role must be " + LIMITS.role + " characters or fewer.";
    if (!STATUSES.includes(input.status)) e.status = "Pick a status.";
    if (!isRealISO(String(input.dateApplied || "").trim())) e.dateApplied = "Date applied needs a real calendar date.";
    const fu = String(input.nextFollowUp || "").trim();
    if (fu && !isRealISO(fu)) e.nextFollowUp = "Follow-up needs a real date, or leave it blank.";
    if (input.source && !SOURCES.includes(input.source)) e.source = "Pick a source.";
    const link = String(input.link || "").trim();
    if (link && !safeHref(link)) e.link = "Link must start with http:// or https://.";
    if (String(input.pay || "").trim().length > LIMITS.pay) e.pay = "Pay must be " + LIMITS.pay + " characters or fewer.";
    if (String(input.notes || "").trim().length > LIMITS.notes) e.notes = "Notes must be " + LIMITS.notes + " characters or fewer.";
    return { ok: Object.keys(e).length === 0, errors: e };
  }
  // Build the saved record. Existing fields we don't edit (log, unknown extras) are kept.
  function buildRecord(input, existing, newId) {
    const fields = {
      company: String(input.company || "").trim(),
      role: String(input.role || "").trim(),
      status: input.status,
      dateApplied: String(input.dateApplied || "").trim(),
      nextFollowUp: cleanFollowUp(String(input.nextFollowUp || "").trim()),
      source: SOURCES.includes(input.source) ? input.source : "Other",
      pay: String(input.pay || "").trim(),
      link: safeHref(input.link),
      notes: String(input.notes || "").trim()
    };
    if (existing) return Object.assign({}, existing, fields);
    return Object.assign({ id: newId || uid() }, fields, { isSample: false });
  }
  function companyKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(inc|llc|ltd|corp|co|company|the)\b/g, "").trim();
  }

  /* ---------- derived numbers ---------- */
  // Same definition as the previous app: applications sent RESPONSE_DAYS+ days ago (withdrawn left out);
  // heard back = anything other than Applied.
  function responseStats(apps, today) {
    const cutoff = addDays(today, -RESPONSE_DAYS);
    const real = apps.filter((a) => !a.isSample);
    const base = real.length ? real : apps;
    const pool = base.filter((a) => a.status !== "Withdrawn" && isRealISO(a.dateApplied) && a.dateApplied <= cutoff);
    const heard = pool.filter((a) => a.status !== "Applied");
    const positive = pool.filter((a) => ["Screening", "Interview", "Offer"].includes(a.status));
    const rejected = pool.filter((a) => a.status === "Rejected");
    return {
      pool: pool.length, heard: heard.length, positive: positive.length, rejected: rejected.length,
      waiting: pool.length - heard.length,
      rate: pool.length ? Math.round(heard.length / pool.length * 100) : null
    };
  }
  function statusCounts(apps) {
    const c = {}; STATUSES.forEach((s) => (c[s] = 0));
    apps.forEach((a) => { c[statusOf(a)] += 1; });
    return c;
  }
  function kpis(apps, today) {
    const c = statusCounts(apps);
    const month = today.slice(0, 7);
    return {
      total: apps.length,
      inProgress: c.Screening + c.Interview,
      interviews: c.Interview,
      offers: c.Offer,
      rejected: c.Rejected,
      addedThisMonth: apps.filter((a) => String(a.dateApplied || "").startsWith(month)).length,
      response: responseStats(apps, today)
    };
  }
  // 'overdue' | 'due' | 'soon' (within 7 days) | null. Only for active applications.
  function followState(a, today) {
    if (!a || !ACTIVE.includes(a.status)) return null;
    const due = followUpOf(a);
    if (!due) return null;
    if (due < today) return "overdue";
    if (due === today) return "due";
    if (due <= addDays(today, 7)) return "soon";
    return null;
  }
  function followUpsDue(apps, today) {
    return apps.filter((a) => followState(a, today)).sort((a, b) => followUpOf(a).localeCompare(followUpOf(b)));
  }
  function upcomingInterviews(apps, today) {
    const out = [];
    apps.forEach((a) => logOf(a).forEach((e) => { if ((e.type === "Interview" || e.type === "Screen") && e.date >= today) out.push({ app: a, entry: e }); }));
    return out.sort((x, y) => x.entry.date.localeCompare(y.entry.date));
  }
  function recentActivity(apps, limit) {
    const out = [];
    apps.forEach((a) => logOf(a).forEach((e) => out.push({ app: a, entry: e })));
    return out.sort((x, y) => y.entry.date.localeCompare(x.entry.date)).slice(0, limit || 12);
  }
  function filterApps(apps, query, status) {
    const q = String(query || "").trim().toLowerCase();
    return apps.filter((a) => {
      if (status && status !== "All" && statusOf(a) !== status) return false;
      if (!q) return true;
      return [a.company, a.role, a.notes, a.pay, a.source].join(" ").toLowerCase().includes(q);
    });
  }
  function sortByApplied(apps) {
    return apps.slice().sort((a, b) => String(b.dateApplied || "").localeCompare(String(a.dateApplied || "")));
  }
  // Previous app's "Followed up" button: log it today and set the next one 7 days out.
  function markFollowedUp(a, today) {
    const copy = Object.assign({}, a);
    copy.log = mergeLogs(a.log, [{ id: uid(), date: today, type: "Follow-up", note: "Followed up" }]);
    copy.nextFollowUp = addDays(today, 7);
    return copy;
  }
  function addLogEntry(a, entry) {
    const note = String(entry.note || "").trim();
    if (!isRealISO(entry.date)) return { ok: false, errors: { date: "Pick a real date." } };
    if (!note) return { ok: false, errors: { note: "Write a short note." } };
    if (note.length > LIMITS.logNote) return { ok: false, errors: { note: "Keep it under " + LIMITS.logNote + " characters." } };
    const copy = Object.assign({}, a);
    copy.log = mergeLogs(a.log, [{ id: uid(), date: entry.date, type: LOG_TYPES.includes(entry.type) ? entry.type : "Note", note }]);
    return { ok: true, app: copy };
  }
  function removeLogEntry(a, entryId) {
    const copy = Object.assign({}, a);
    copy.log = cleanLog(a.log).filter((e) => e.id !== entryId);
    return copy;
  }

  /* ---------- CSV (import + export, same columns as the previous app) ---------- */
  function sha1Hex(str) {
    const bytes = new TextEncoder().encode(str);
    const ml = bytes.length * 8;
    const withPad = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
    withPad.set(bytes);
    withPad[bytes.length] = 0x80;
    const dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 4, ml >>> 0);
    dv.setUint32(withPad.length - 8, Math.floor(ml / 4294967296));
    let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0;
    const w = new Uint32Array(80);
    for (let off = 0; off < withPad.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
        else { f = b ^ c ^ d; k = 0xCA62C1D6; }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
        e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    return [h0, h1, h2, h3, h4].map((n) => n.toString(16).padStart(8, "0")).join("");
  }
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    text = String(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
  }
  function mapCsvStatus(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "Applied";
    const exact = STATUSES.find((x) => x.toLowerCase() === s);
    if (exact) return exact;
    if (/offer/.test(s)) return "Offer";
    if (/reject|declin|not selected|turned down|no longer/.test(s)) return "Rejected";
    if (/interview/.test(s)) return "Interview";
    if (/screen|replied|response|responded|phone|recruiter/.test(s)) return "Screening";
    if (/withdr|closed|skip|cancel|expired|filled/.test(s)) return "Withdrawn";
    return "Applied";
  }
  function mapCsvSource(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "Other";
    const exact = SOURCES.find((x) => x.toLowerCase() === s);
    if (exact) return exact;
    if (/easy ?apply/.test(s)) return /indeed/.test(s) ? "Indeed" : "Easy Apply";
    if (/indeed/.test(s)) return "Indeed";
    if (/referr/.test(s)) return "Referral";
    if (/linkedin/.test(s)) return "LinkedIn";
    if (/^recruiter|sorce|staffing|dice|agency|ziprecruiter|glassdoor|monster|handshake|^other/.test(s)) return "Other";
    return "Company site";
  }
  function csvDate(raw) {
    const v = String(raw || "").trim();
    if (isRealISO(v)) return v;
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      const y = m[3].length === 2 ? "20" + m[3] : m[3];
      const out = y + "-" + m[1].padStart(2, "0") + "-" + m[2].padStart(2, "0");
      if (isRealISO(out)) return out;
    }
    return "";
  }
  function payFromNotes(notes) {
    const m = String(notes || "").match(/\$\s?[\d][\d.,]*\s?k?(?:\s?(?:–|-|to)\s?\$?\s?[\d][\d.,]*\s?k?)?(?:\s?\/\s?(?:hr|hour|yr|year))?/i);
    return m ? m[0].replace(/\s+/g, "").replace(/\/hour/i, "/hr").replace(/[.,]$/, "") : "";
  }
  function csvToApps(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return null;
    const head = rows[0].map((h) => String(h).trim().toLowerCase());
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i !== -1) return i; } return -1; };
    const C = {
      id: col("id"), date: col("date applied", "applied", "date", "applied on"), company: col("company", "employer"),
      role: col("role", "role / title", "title", "job title", "position"), location: col("location"), source: col("source"),
      status: col("status"), next: col("next step", "next"),
      follow: col("follow-up date", "follow up date", "next follow-up", "next follow up", "followup", "follow-up"),
      url: col("apply url", "link", "url", "job url"), jobId: col("job id", "req id", "requisition id"),
      cover: col("cover letter"), notes: col("notes"), pay: col("pay", "salary")
    };
    if (C.company === -1 || C.role === -1) return null;
    const ownCsv = C.id !== -1;
    return rows.slice(1).map((r) => {
      const g = (k) => (C[k] === -1 ? "" : String(r[C[k]] || "").trim());
      const company = g("company"), role = g("role");
      const notesRaw = g("notes");
      let date = csvDate(g("date"));
      let dateNote = "";
      if (!date) {
        const found = (notesRaw.match(/\b(\d{4}-\d{2}-\d{2})\b/) || [])[1];
        if (found && isRealISO(found)) { date = found; dateNote = "Date shown = first date in notes (original apply date not in tracker)"; }
        else if (csvDate(g("follow"))) { date = csvDate(g("follow")); dateNote = "Date shown = follow-up date (original apply date not in tracker)"; }
      }
      const rawStatus = g("status");
      const status = mapCsvStatus(rawStatus);
      const rawSource = g("source");
      const url = g("url"), jobId = g("jobId");
      const id = g("id") || ("rec-" + sha1Hex([jobId || url, company, role, date].join("|")).slice(0, 12));
      let notes = notesRaw;
      if (!ownCsv) {
        const parts = [];
        if (dateNote) parts.push(dateNote);
        if (rawStatus && rawStatus.toLowerCase() !== status.toLowerCase()) parts.push("Tracker status: " + rawStatus);
        if (rawSource) parts.push("Source: " + rawSource);
        if (g("location")) parts.push("Location: " + g("location"));
        if (g("next")) parts.push("Next: " + g("next"));
        if (jobId) parts.push("Job ID: " + jobId);
        if (g("cover")) parts.push("Cover letter: " + g("cover"));
        notes = parts.join(" | ") + (parts.length && notesRaw ? "\n" : "") + notesRaw;
      }
      return {
        id, company, role, status, dateApplied: date,
        nextFollowUp: CLOSED.includes(status) ? null : (csvDate(g("follow")) || null),
        source: mapCsvSource(rawSource), pay: g("pay") || payFromNotes(notesRaw), link: url, notes, isSample: false
      };
    });
  }
  function csvCell(v) {
    const s = String(v === null || v === undefined ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(apps) {
    const head = ["ID", "Company", "Role", "Status", "Date applied", "Next follow-up", "Source", "Pay", "Link", "Notes", "Interview log"];
    const lines = [head.join(",")];
    apps.forEach((a) => {
      const log = cleanLog(a.log).map((e) => e.date + " " + e.type + ": " + e.note).join(" || ");
      lines.push([a.id, a.company, a.role, a.status, a.dateApplied, a.nextFollowUp || "", a.source, a.pay || "", a.link || "", a.notes || "", log].map(csvCell).join(","));
    });
    return "\uFEFF" + lines.join("\r\n");
  }
  // Accepts the previous app's JSON (array, or { apps: [...] }) or a CSV. Returns { list } or { error }.
  function parseImportText(text, fileName) {
    const t = String(text || "");
    const looksCsv = /\.csv$/i.test(fileName || "") || !/^\s*[\[{]/.test(t.replace(/^\uFEFF/, ""));
    if (looksCsv) {
      const list = csvToApps(t);
      return list ? { list } : { error: "That CSV needs a header row with at least Company and Role columns. Nothing was changed." };
    }
    let parsed;
    try { parsed = JSON.parse(t); } catch (e) { return { error: "That file isn't valid JSON or CSV. Nothing was changed." }; }
    const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.apps) ? parsed.apps : null);
    return list ? { list } : { error: "Expected a JSON array of applications, or an object with an apps array. Nothing was changed." };
  }

  /* ---------- sync config (same key + shape as the previous app) ---------- */
  function readSyncConfig(raw) {
    const cfg = { gistId: DEFAULT_GIST_ID, token: "", autoPull: true, autoPush: false };
    try {
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          if (typeof p.gistId === "string" && p.gistId.trim()) cfg.gistId = p.gistId.trim();
          if (typeof p.token === "string") cfg.token = p.token.trim();
          if (p.autoPull === false) cfg.autoPull = false;
          if (p.autoPush === true) cfg.autoPush = true;
        }
      }
    } catch (e) { /* ignore */ }
    return cfg;
  }
  function syncConfigValue(cfg) {
    return {
      gistId: String(cfg.gistId || DEFAULT_GIST_ID).trim() || DEFAULT_GIST_ID,
      token: String(cfg.token || "").trim(),
      autoPull: cfg.autoPull !== false,
      autoPush: !!cfg.autoPush
    };
  }
  function gistHashId(hash) {
    const m = String(hash || "").match(/^#(?:pipely|bryz-jobs)-(?:gist|sync)=([a-f0-9]+)/i);
    return m ? m[1] : "";
  }

  return {
    KEY, SYNC_KEY, UNREADABLE_PREFIX, GIST_FILENAME, RETIRED_GIST_ID, DEFAULT_GIST_ID,
    STATUSES, ACTIVE, CLOSED, SOURCES, LOG_TYPES, SAMPLE_IDS, RESPONSE_DAYS, LIMITS,
    uid, isRealISO, cleanFollowUp, safeHref, toISO, addDays, sourceBucket, cleanLog, mergeLogs,
    readStored, statusOf, isSample, followUpOf, logOf,
    normalizeImported, prepareImport, mergeRecord, mergeInto, mergeCloud, onlySamples, realCount,
    validateInput, buildRecord, companyKey,
    responseStats, statusCounts, kpis, followState, followUpsDue, upcomingInterviews, recentActivity,
    filterApps, sortByApplied, markFollowedUp, addLogEntry, removeLogEntry,
    sha1Hex, parseCSV, csvToApps, toCsv, parseImportText,
    readSyncConfig, syncConfigValue, gistHashId
  };
});
