/* Bryz Jobs UI. Data: localStorage "brice-job-apps-v1" (same as before). Network: GitHub Gist sync only. */
(function () {
  "use strict";
  const J = window.BryzJobs;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const today = () => J.toISO(new Date());
  const PAGE = 40;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v; // static icon markup only
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const ICON = {
    stack: '<rect x="4" y="5" width="16" height="4" rx="1"/><rect x="4" y="11" width="16" height="4" rx="1"/><path d="M4 19h16"/>',
    send: '<path d="M4 12l16-8-6 16-2-7z"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  };
  const svg = (name) => h("span", { class: "ic", "aria-hidden": "true", html: '<svg viewBox="0 0 24 24">' + ICON[name] + "</svg>" });

  function fmtDate(iso, opts) {
    if (!J.isRealISO(iso)) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", opts || { month: "short", day: "numeric" });
  }
  function relDay(iso) {
    const t = today();
    if (iso === t) return "Today";
    if (iso === J.addDays(t, 1)) return "Tomorrow";
    if (iso === J.addDays(t, -1)) return "Yesterday";
    return fmtDate(iso, { weekday: "short", month: "short", day: "numeric" });
  }
  function daysBetween(a, b) {
    const pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((new Date(pb[0], pb[1] - 1, pb[2]) - new Date(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  /* ---------- state + storage ---------- */
  let apps = [];
  let storageOk = true;
  let filter = { q: "", status: "All" }, shown = PAGE, fuAll = false, rejShown = PAGE;
  const boardOpen = new Set();
  const BOARD_CAP = 20;
  let undoSnapshot = null;

  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  function load() {
    let raw;
    try { raw = localStorage.getItem(J.KEY); }
    catch (e) { storageOk = false; showStorageWarn("This browser blocked saved data. Nothing will be written."); return; }
    const r = J.readStored(raw);
    if (r.ok) { apps = r.apps; return; }
    // Unreadable: keep the original key untouched, keep a dated copy, and block writes.
    storageOk = false;
    apps = [];
    let copied = false;
    try {
      let exists = false;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(J.UNREADABLE_PREFIX) === 0 && localStorage.getItem(k) === raw) { exists = true; break; }
      }
      if (!exists) localStorage.setItem(J.UNREADABLE_PREFIX + Date.now(), raw);
      copied = true;
    } catch (e) { copied = false; }
    showStorageWarn("Saved applications could not be read. Nothing new will be written, and the stored copy was left as-is" + (copied ? " (a backup copy was also kept in this browser)." : "."));
  }
  function showStorageWarn(text) { const w = $("#storage-warn"); w.textContent = text; w.hidden = false; }

  function save() {
    if (!storageOk) { toast("Not saved. Your stored list couldn't be read, so it was left untouched."); return false; }
    try { localStorage.setItem(J.KEY, JSON.stringify(apps)); }
    catch (e) { toast("Couldn't save. Browser storage is full or blocked."); return false; }
    queueAutoPush();
    return true;
  }
  // Apply a change; roll back if it can't be saved. Returns true when saved.
  function commit(next, msg, opts) {
    const previous = apps;
    apps = next;
    if (!save()) { apps = previous; render(); return false; }
    if (opts && opts.undo) undoSnapshot = previous; else undoSnapshot = null;
    render();
    if (msg) toast(msg, !!(opts && opts.undo));
    return true;
  }
  function replaceApp(updated, msg, opts) { return commit(apps.map((a) => (a.id === updated.id ? updated : a)), msg, opts); }

  let toastTimer;
  function toast(msg, withUndo) {
    const t = $("#toast");
    $("#toast-text").textContent = msg;
    $("#toast-undo").hidden = !withUndo;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove("show"); $("#toast-undo").hidden = true; }, withUndo ? 7000 : 2800);
  }
  $("#toast-undo").addEventListener("click", () => {
    if (!undoSnapshot) return;
    const snap = undoSnapshot; undoSnapshot = null;
    commit(snap, "Undone.");
  });

  function confirmBox(message, okLabel, title) {
    return new Promise((resolve) => {
      const d = $("#confirm-dlg");
      $("#c-title").textContent = title || "Are you sure?";
      $("#c-msg").textContent = message;
      $("#c-ok").textContent = okLabel || "Delete";
      d.returnValue = "";
      d.addEventListener("close", () => resolve(d.returnValue === "ok"), { once: true });
      d.showModal();
    });
  }

  /* ---------- render ---------- */
  function render() {
    renderHero(); renderKpis(); renderChips(); renderList(); renderBoard(); renderInsights(); renderInterviews(); renderFollowUps(); renderRejected(); renderActivity(); renderSamples();
    const open = $("#detail-dlg");
    if (open.open && open.dataset.id) renderDetail(open.dataset.id, true);
  }
  function renderHero() {
    $("#today-label").textContent = fmtDate(today(), { weekday: "long", month: "short", day: "numeric" });
    $("#hero-count").textContent = apps.length === 1 ? "1 application" : apps.length + " applications";
    const cfg = getSyncConfig();
    $("#sync-fine").textContent = cfg.gistId ? "Saved on this device · Synced with your private Gist" + (cfg.autoPush && cfg.token ? " (auto-push on)" : "") : "Saved on this device · Cloud sync is off";
    const overdue = apps.filter((a) => J.followState(a, today()) === "overdue").length;
    document.title = overdue ? "(" + overdue + " overdue) Bryz Jobs" : "Bryz Jobs";
  }

  function renderKpis() {
    const k = J.kpis(apps, today());
    const rs = k.response;
    const card = (icon, label, value, sub, hl, onOpen) => h("button", { class: "card kpi" + (hl ? " hl" : ""), type: "button", onclick: onOpen, "aria-label": label + ": " + value + ". " + sub },
      svg(icon), h("div", { class: "k", text: label }), h("div", { class: "v", text: value }), h("div", { class: "s", text: sub }));
    $("#kpis").replaceChildren(
      card("stack", "Applications", String(k.total), k.addedThisMonth ? k.addedThisMonth + " added this month." : "None added this month.", false, () => goTo("All")),
      card("send", "In progress", String(k.inProgress), "Screening or interviewing." + (k.interested ? " " + k.interested + " interested, not applied yet." : ""), false, () => goTo("Screening")),
      card("chat", "Interviews", String(k.interviews), "At the interview stage.", false, () => goTo("Interview")),
      card("star", "Offers", String(k.offers), k.offers ? "A good step forward." : "None yet.", k.offers > 0, () => goTo("Offer")),
      card("pulse", "Response rate", rs.rate == null ? "—" : rs.rate + "%", rs.pool ? rs.heard + " of " + rs.pool + " heard back (sent " + J.RESPONSE_DAYS + "+ days ago) · " + k.rejected + " rejected in total." : "Shows up " + J.RESPONSE_DAYS + " days after you apply.", false, () => goToSection("rejected")),
    );
  }
  function goToSection(id) { $("#" + id).scrollIntoView({ behavior: "smooth", block: "start" }); }
  function goTo(status) {
    filter.status = status; shown = PAGE; renderChips(); renderList();
    $("#pipeline").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderChips() {
    const counts = J.statusCounts(apps);
    const all = ["All"].concat(J.STATUSES);
    $("#chips").replaceChildren(...all.map((s) => h("button", {
      class: "chip" + (s !== "All" ? " st-" + s : ""), type: "button", "aria-pressed": String(filter.status === s),
      onclick: () => { filter.status = s; shown = PAGE; renderChips(); renderList(); },
    }, s !== "All" ? h("span", { class: "dot", "aria-hidden": "true" }) : null, s, h("b", { text: String(s === "All" ? apps.length : counts[s]) }))));
    const total = apps.length || 1;
    $("#stagebar").replaceChildren(...J.STATUSES.filter((s) => counts[s]).map((s) => {
      const el = h("span", { class: "st-" + s, title: s + ": " + counts[s] });
      el.style.width = (counts[s] / total) * 100 + "%"; el.style.background = "var(--c)";
      return el;
    }));
    $("#stagebar").setAttribute("aria-label", J.STATUSES.map((s) => s + " " + counts[s]).join(", "));
  }

  function sampleTag(a) { return J.isSample(a) ? h("span", { class: "ex", text: "Sample" }) : null; }

  function statusSelect(a, idPrefix) {
    const id = (idPrefix || "st-") + a.id;
    const cur = J.statusOf(a);
    return h("div", { class: "stage-wrap" },
      h("label", { class: "sr-only", for: id, text: "Status for " + a.company }),
      h("select", { class: "stage st-" + cur, id, onchange: (e) => setStatus(a.id, e.target.value) },
        J.STATUSES.map((s) => h("option", { value: s, selected: s === cur }, s))));
  }
  function setStatus(id, status) {
    const a = apps.find((x) => x.id === id);
    if (!a || !J.STATUSES.includes(status) || a.status === status) return;
    replaceApp(Object.assign({}, a, { status }), a.company + " → " + status, { undo: true });
  }

  function renderList() {
    const list = J.sortByApplied(J.filterApps(apps, filter.q, filter.status));
    const box = $("#job-list");
    $("#more-row").hidden = list.length <= shown;
    if (!list.length) {
      box.replaceChildren(h("div", { class: "empty", text: apps.length ? "No applications match that search or status." : "No applications yet. Add your first one, import a backup, or turn on Cloud sync to pull your list." }));
      return;
    }
    box.replaceChildren(...list.slice(0, shown).map((a) => h("div", { class: "item" },
      h("div", { class: "who" }, h("div", { class: "co" }, String(a.company || "—"), sampleTag(a)), h("div", { class: "ro", text: String(a.role || "") })),
      h("div", { class: "wh" }, h("div", { text: a.source || "—" }), h("div", { text: (a.pay ? a.pay + " · " : "") + "Applied " + fmtDate(a.dateApplied) })),
      statusSelect(a),
      h("div", { class: "acts" },
        h("button", { class: "btn sec xs", type: "button", onclick: () => openDetail(a.id), "aria-label": "Details for " + a.company }, "Details"),
        h("button", { class: "btn ghost xs", type: "button", onclick: () => openJobForm(a.id), "aria-label": "Edit " + a.company }, "Edit"),
      ),
    )));
    $("#more-btn").textContent = "Show more (" + (list.length - shown) + " left)";
  }
  $("#more-btn").addEventListener("click", () => { shown += PAGE * 2; renderList(); });

  function renderInterviews() {
    const ivs = J.upcomingInterviews(apps, today());
    const box = $("#iv-list");
    if (!ivs.length) {
      const atStage = apps.filter((a) => a.status === "Interview").length;
      box.replaceChildren(h("div", { class: "card empty", text: "No upcoming interviews logged." + (atStage ? " " + atStage + " application" + (atStage === 1 ? " is" : "s are") + " at the interview stage." : "") + " Open an application and log an Interview or Screen with its date." }));
      return;
    }
    box.replaceChildren(...ivs.map(({ app: a, entry: e }) => h("article", { class: "card ev" },
      h("div", { class: "date", "aria-hidden": "true" }, h("div", null, h("small", { text: fmtDate(e.date, { month: "short" }) }), h("b", { text: fmtDate(e.date, { day: "numeric" }) }))),
      h("div", { class: "info" },
        h("div", { class: "t" }, String(a.company), sampleTag(a)),
        h("div", { class: "s", text: String(a.role || "") }),
        h("div", { class: "s" }, h("b", { text: relDay(e.date) + " · " + e.type }), " · " + e.note),
      ),
      h("button", { class: "btn sec xs", type: "button", onclick: () => openDetail(a.id), "aria-label": "Open " + a.company }, "Open"),
    )));
  }

  const FU_LABEL = { overdue: "Overdue", due: "Due today", soon: "This week" };
  function renderFollowUps() {
    const t = today();
    const items = J.followUpsDue(apps, t);
    const box = $("#fu-list");
    const limit = fuAll ? items.length : 12;
    $("#fu-more-row").hidden = items.length <= 12 || fuAll;
    $("#fu-more-btn").textContent = "Show all " + items.length;
    const nOver = items.filter((a) => J.followState(a, t) === "overdue").length, nDue = items.filter((a) => J.followState(a, t) === "due").length;
    $("#fu-sub").textContent = items.length ? nOver + " overdue · " + nDue + " due today · " + (items.length - nOver - nDue) + " this week" : "Overdue first";
    if (!items.length) { box.replaceChildren(h("div", { class: "empty", text: "You're all caught up. Nothing due in the next 7 days." })); return; }
    box.replaceChildren(...items.slice(0, limit).map((a) => {
      const st = J.followState(a, t), due = J.followUpOf(a);
      const late = daysBetween(due, t);
      const when = late > 0 ? (late === 1 ? "1 day overdue" : late + " days overdue") : relDay(due);
      return h("div", { class: "fu" },
        h("div", { class: "info" },
          h("div", { class: "t" }, h("b", { text: String(a.company) }), " — " + (a.role || "")),
          h("div", { class: "s", text: when + " · " + J.statusOf(a) })),
        h("span", { class: "pill p-" + st, text: FU_LABEL[st] }),
        h("div", { class: "fu-acts" },
          h("button", { class: "btn pri xs", type: "button", title: "Log a follow-up today and set the next one 7 days out", onclick: () => replaceApp(J.markFollowedUp(a, today()), "Logged a follow-up for " + a.company + ".", { undo: true }) }, "Followed up"),
          h("button", { class: "btn ghost xs", type: "button", onclick: () => replaceApp(Object.assign({}, a, { nextFollowUp: J.addDays(today(), 3) }), a.company + " moved 3 days out.", { undo: true }) }, "Snooze 3d")));
    }));
  }
  $("#fu-more-btn").addEventListener("click", () => { fuAll = true; renderFollowUps(); });

  /* ---------- board (drag between stages) ---------- */
  let dragId = null;
  function boardCard(a) {
    const card = h("article", { class: "kcard", draggable: "true", "data-id": a.id },
      h("div", { class: "co" }, String(a.company || "—"), sampleTag(a)),
      h("div", { class: "ro", text: String(a.role || "") }),
      h("div", { class: "km" }, h("span", { text: "Applied " + fmtDate(a.dateApplied) }), h("button", { class: "btn ghost xs", type: "button", onclick: () => openDetail(a.id), "aria-label": "Details for " + a.company }, "Open")),
      statusSelect(a, "bd-"));
    card.addEventListener("dragstart", (e) => {
      if (e.target.closest && e.target.closest("select, button, a")) { e.preventDefault(); return; }
      dragId = a.id; card.classList.add("dragging");
      if (e.dataTransfer) { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", a.id); }
    });
    card.addEventListener("dragend", () => { dragId = null; card.classList.remove("dragging"); });
    return card;
  }
  function boardCol(status) {
    const items = J.boardColumn(apps, status);
    const open = boardOpen.has(status);
    const shownItems = open ? items : items.slice(0, BOARD_CAP);
    const col = h("section", { class: "kcol st-" + status, "data-status": status, "aria-label": status + ", " + items.length },
      h("div", { class: "khead" }, h("strong", null, h("span", { class: "dot", "aria-hidden": "true" }), status), h("span", { class: "kcount", text: String(items.length) })),
      items.length ? shownItems.map(boardCard) : h("div", { class: "kplace", text: "Drop a card here" }),
      items.length > shownItems.length ? h("button", { class: "btn sec xs kmore", type: "button", onclick: () => { boardOpen.add(status); renderBoard(); } }, "Show all " + items.length) : null);
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
    col.addEventListener("dragleave", (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove("over"); });
    col.addEventListener("drop", (e) => {
      e.preventDefault(); col.classList.remove("over");
      const id = (e.dataTransfer && e.dataTransfer.getData("text/plain")) || dragId;
      if (id) setStatus(id, status);
    });
    return col;
  }
  function renderBoard() {
    $("#board-cols").replaceChildren(...J.PIPE.map(boardCol));
    $("#board-closed").replaceChildren(...J.CLOSED.map(boardCol));
  }

  /* ---------- insights (charts + heatmap) ---------- */
  const SRC_CLASS = { "Company site": "src-co", "Easy Apply": "src-easy", LinkedIn: "src-li", Indeed: "src-indeed", Other: "src-ot" };
  function renderInsights() {
    const t = today();
    // weekly stacked bars
    const weeks = J.weekly(apps, t, 8);
    const peak = Math.max(1, ...weeks.map((w) => w.n));
    const totals = {}; J.CHART_SOURCES.forEach((s) => (totals[s] = weeks.reduce((n, w) => n + w.counts[s], 0)));
    $("#chart-weekly").replaceChildren(
      h("div", { class: "wk-n", "aria-hidden": "true" }, weeks.map((w) => h("span", { text: String(w.n) }))),
      h("div", { class: "wk", role: "img", "aria-label": "Applications per week: " + weeks.map((w) => fmtDate(w.start) + " " + w.n).join(", ") },
        weeks.map((w) => {
          const col = h("div", { class: "col", title: "Week of " + fmtDate(w.start) + ": " + w.n });
          J.CHART_SOURCES.forEach((s) => { if (!w.counts[s]) return; const seg = h("span", { class: SRC_CLASS[s] }); seg.style.height = (w.counts[s] / peak) * 100 + "%"; col.append(seg); });
          return col;
        })),
      h("div", { class: "wk-x", "aria-hidden": "true" }, weeks.map((w) => h("span", { text: fmtDate(w.start) }))),
      h("div", { class: "legend" }, J.CHART_SOURCES.map((s) => h("span", null, h("i", { class: "sw " + SRC_CLASS[s] }), s + " ", h("b", { text: String(totals[s]) })))));
    // by stage
    const counts = J.statusCounts(apps);
    const max = Math.max(1, ...J.STATUSES.map((s) => counts[s]));
    $("#chart-funnel").replaceChildren(...J.STATUSES.map((s) => {
      const fill = h("div", { class: "fill" }); fill.style.width = (counts[s] ? Math.max(3, counts[s] / max * 100) : 0) + "%";
      return h("div", { class: "frow st-" + s, "data-status": s }, h("span", { text: s }), h("div", { class: "track" }, fill), h("b", { text: String(counts[s]) }));
    }));
    // sources donut
    const sc = J.sourceCounts(apps);
    const total = J.CHART_SOURCES.reduce((n, s) => n + sc[s], 0);
    const donut = h("div", { class: "donut", role: "img", "aria-label": "Sources: " + J.CHART_SOURCES.map((s) => s + " " + sc[s]).join(", ") },
      h("div", { class: "donut-c" }, h("div", null, h("b", { text: String(total) }), h("small", { text: total === 1 ? "application" : "applications" }))));
    if (total) {
      let at = 0;
      const css = getComputedStyle(document.documentElement);
      const stops = J.CHART_SOURCES.filter((s) => sc[s]).map((s) => { const a0 = at / total * 100; at += sc[s]; return css.getPropertyValue("--" + SRC_CLASS[s]).trim() + " " + a0 + "% " + (at / total * 100) + "%"; });
      donut.style.background = "conic-gradient(" + stops.join(",") + ")";
    }
    $("#chart-sources").replaceChildren(h("div", { class: "donut-wrap" }, donut,
      h("div", { class: "slist" }, J.CHART_SOURCES.map((s) => h("div", null, h("span", null, h("i", { class: "sw " + SRC_CLASS[s] }), s), h("b", { text: String(sc[s]) }))))));
    // daily heatmap (12 weeks, Monday first)
    const hm = J.heatmap(apps, t, 12);
    const sum = hm.days.reduce((n, d) => n + d.n, 0);
    const active = hm.days.filter((d) => d.n).length;
    $("#chart-heat").replaceChildren(
      h("div", { class: "heat", role: "img", "aria-label": sum + " applications on " + active + " days in the last 12 weeks" },
        hm.days.map((d) => h("i", { class: "l" + J.heatLevel(d.n, hm.max) + (d.future ? " fut" : ""), title: fmtDate(d.date, { weekday: "short", month: "short", day: "numeric" }) + ": " + d.n }))),
      h("div", { class: "heat-foot" }, h("span", { text: sum + " applications on " + active + " days · last 12 weeks" + (hm.max ? " · busiest day " + hm.max : "") }),
        h("span", { class: "heat-key", "aria-hidden": "true" }, "Less ", [0, 1, 2, 3, 4].map((l) => h("i", { class: "heat-l l" + l })), " More")));
    document.querySelectorAll(".heat-key i").forEach((i) => { const l = i.className.match(/l(\d)$/)[1]; i.style.background = "var(--heat" + l + ")"; });
  }

  /* ---------- rejected ---------- */
  function renderRejected() {
    const t = today();
    const st = J.rejectedStats(apps, t);
    const stat = (n, label) => h("div", { class: "card" }, h("div", { class: "v", text: String(n) }), h("div", { class: "s", text: label }));
    $("#rej-stats").replaceChildren(
      stat(st.count, st.share + "% of " + apps.length + " tracked applications"),
      stat(st.median === null ? "—" : st.median + "d", "median time to a no (" + st.withDates + " with a date in notes or log)"),
      stat(st.top ? st.top[1] : 0, st.top ? "from " + st.top[0] : "no source yet"));
    const srcSel = $("#rej-source"), wanted = srcSel.value || "all";
    const withdrawn = $("#rej-withdrawn").checked;
    const pool = J.rejectedList(apps, { withdrawn });
    const sources = Array.from(new Set(pool.map((a) => a.source || "Other"))).sort();
    srcSel.replaceChildren(h("option", { value: "all" }, "All sources"), ...sources.map((x) => h("option", { value: x }, x)));
    srcSel.value = sources.includes(wanted) ? wanted : "all";
    const rows = J.rejectedList(apps, { withdrawn, q: $("#rej-q").value, source: srcSel.value, sort: $("#rej-sort").value });
    const nW = pool.length - st.count;
    $("#rej-sub").textContent = rows.length + " shown · " + st.count + " rejected" + (withdrawn ? " + " + nW + " withdrawn" : "");
    $("#rej-more-row").hidden = rows.length <= rejShown;
    $("#rej-more-btn").textContent = "Show more (" + (rows.length - rejShown) + " left)";
    const box = $("#rej-list");
    if (!rows.length) { box.replaceChildren(h("div", { class: "empty", text: st.count || withdrawn ? "Nothing matches that search." : "No rejections. Keep going." })); return; }
    box.replaceChildren(...rows.slice(0, rejShown).map((a) => {
      const r = J.rejectedOn(a), n = J.daysToNo(a);
      return h("div", { class: "item rej-row" },
        h("div", { class: "who" }, h("div", { class: "co" }, String(a.company || "—"), sampleTag(a)), h("div", { class: "ro", text: String(a.role || "") }),
          h("span", { class: "chip rej", text: J.statusOf(a) === "Rejected" ? (r ? "No on " + fmtDate(r) + (n !== null ? " · " + n + "d" : "") : "Date of the no unknown") : "Withdrawn" })),
        h("div", { class: "wh" }, h("div", { text: (a.source || "—") + " · Applied " + fmtDate(a.dateApplied) })),
        statusSelect(a, "rj-"),
        h("div", { class: "acts" }, h("button", { class: "btn sec xs", type: "button", onclick: () => openDetail(a.id), "aria-label": "Details for " + a.company }, "Details")));
    }));
  }
  ["#rej-q", "#rej-source", "#rej-sort", "#rej-withdrawn"].forEach((sel) => $(sel).addEventListener(sel === "#rej-q" ? "input" : "change", () => { rejShown = PAGE; renderRejected(); }));
  $("#rej-more-btn").addEventListener("click", () => { rejShown += PAGE * 2; renderRejected(); });

  /* ---------- theme (opt-in dark; light stays the default) ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    const b = $("#theme-btn");
    b.setAttribute("aria-pressed", String(t === "dark"));
    b.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }
  $("#theme-btn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    try { localStorage.setItem(J.THEME_KEY, next); } catch (e) { /* private mode: still switch for this visit */ }
    applyTheme(next);
    renderInsights();
  });
  applyTheme(J.themeFrom(storageGet(J.THEME_KEY)));

  function renderActivity() {
    const items = J.recentActivity(apps, 12);
    const box = $("#activity-list");
    if (!items.length) { box.replaceChildren(h("div", { class: "card empty", text: "Nothing logged yet. Open an application to log a call, email, interview or note." })); return; }
    box.replaceChildren(...items.map(({ app: a, entry: e }) => h("article", { class: "note" },
      h("p", null, h("b", { text: e.type + " · " + a.company }), "\n" + e.note),
      h("div", { class: "foot" }, h("span", { text: fmtDate(e.date, { month: "short", day: "numeric", year: "numeric" }) }),
        h("button", { class: "btn ghost xs", type: "button", onclick: () => openDetail(a.id), "aria-label": "Open " + a.company }, "Open")))));
  }

  function renderSamples() {
    const n = apps.filter(J.isSample).length;
    $("#sample-banner").hidden = !n;
    if (n) $("#sample-banner-text").textContent = n + " sample application" + (n === 1 ? " from the old version is" : "s from the old version are") + " still in your list.";
  }
  $("#sample-remove").addEventListener("click", async () => {
    const n = apps.filter(J.isSample).length;
    if (!n) return;
    if (await confirmBox("Remove " + n + " sample application" + (n === 1 ? "" : "s") + "? Applications you added stay.", "Remove")) {
      commit(apps.filter((a) => !J.isSample(a)), "Samples removed.", { undo: true });
    }
  });

  /* ---------- add / edit ---------- */
  const FIELDS = ["company", "role", "status", "source", "dateApplied", "nextFollowUp", "pay", "link", "notes"];
  function openJobForm(id) {
    const d = $("#job-dlg"), f = $("#job-form");
    const a = id ? apps.find((x) => x.id === id) : null;
    f.dataset.id = id || "";
    $("#job-dlg-title").textContent = a ? "Edit application." : "Add an application.";
    $("#job-submit").textContent = a ? "Save changes" : "Save application";
    $("#f-status").replaceChildren(...J.STATUSES.map((s) => h("option", { value: s }, s)));
    $("#f-source").replaceChildren(...J.SOURCES.map((s) => h("option", { value: s }, s)));
    const defaults = { status: "Applied", source: "Company site", dateApplied: today(), nextFollowUp: J.addDays(today(), 7) };
    FIELDS.forEach((k) => {
      let v = a ? a[k] : defaults[k];
      if (a && k === "status") v = J.statusOf(a);
      if (a && k === "source") v = J.SOURCES.includes(a.source) ? a.source : J.sourceBucket(a.source);
      if (a && k === "nextFollowUp") v = J.followUpOf(a) || "";
      f.elements[k].value = v == null ? "" : String(v);
    });
    showErrors({});
    updateDup();
    d.showModal();
    f.elements.company.focus();
  }
  function showErrors(errors) {
    FIELDS.forEach((k) => {
      const inp = $("#f-" + k), e = $("#e-" + k);
      e.textContent = errors[k] || "";
      if (errors[k]) inp.setAttribute("aria-invalid", "true"); else inp.removeAttribute("aria-invalid");
    });
    const sum = $("#job-summary");
    const msgs = Object.values(errors);
    if (!msgs.length) { sum.replaceChildren(); return; }
    sum.replaceChildren(h("strong", { text: "Please fix " + (msgs.length === 1 ? "1 thing" : msgs.length + " things") + ":" }), h("ul", null, msgs.map((m) => h("li", { text: m }))));
  }
  function activeAt(company, excludeId) {
    const key = J.companyKey(company);
    if (!key) return [];
    return apps.filter((a) => a.id !== excludeId && J.companyKey(a.company) === key && !J.CLOSED.includes(a.status));
  }
  function updateDup() {
    const f = $("#job-form");
    const list = activeAt(f.elements.company.value, f.dataset.id || null);
    const w = $("#dup-warn");
    w.hidden = !list.length;
    if (list.length) w.textContent = "Heads up: you already have " + list.length + " active application" + (list.length === 1 ? "" : "s") + " at " + list[0].company + " (" + list.slice(0, 3).map((a) => a.role + ", " + a.status).join("; ") + ").";
  }
  $("#f-company").addEventListener("input", updateDup);
  $("#job-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, input = {};
    FIELDS.forEach((k) => (input[k] = f.elements[k].value));
    const id = f.dataset.id;
    const v = J.validateInput(input);
    if (!v.ok) {
      showErrors(v.errors);
      const first = FIELDS.find((k) => v.errors[k]);
      (first ? $("#f-" + first) : $("#job-summary")).focus();
      return;
    }
    const existing = id ? apps.find((a) => a.id === id) : null;
    if (!existing) {
      const key = (input.company.trim() + "\n" + input.role.trim()).toLowerCase();
      if (apps.some((a) => (String(a.company) + "\n" + String(a.role)).toLowerCase() === key)) {
        if (!(await confirmBox("You already have " + input.company.trim() + " — " + input.role.trim() + ". Save another copy?", "Save copy", "Possible duplicate"))) return;
      }
    }
    const rec = J.buildRecord(input, existing);
    const next = existing ? apps.map((a) => (a.id === id ? rec : a)) : [rec].concat(apps);
    if (commit(next, existing ? "Application updated." : "Application added.")) $("#job-dlg").close();
  });

  async function removeApp(a) {
    if (await confirmBox("Delete " + a.company + " — " + a.role + "? Its log goes with it. You can undo right after.")) {
      const d = $("#detail-dlg"); if (d.open && d.dataset.id === a.id) d.close();
      commit(apps.filter((x) => x.id !== a.id), a.company + " deleted.", { undo: true });
    }
  }

  /* ---------- details ---------- */
  function openDetail(id) { const d = $("#detail-dlg"); d.dataset.id = id; renderDetail(id); d.showModal(); }
  function renderDetail(id, keepFocus) {
    const a = apps.find((x) => x.id === id);
    const body = $("#detail-body");
    if (!a) { $("#detail-dlg").close(); return; }
    const active = keepFocus && document.activeElement && document.activeElement.id;
    const href = J.safeHref(a.link);
    const link = href ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, "Open posting ↗") : null;
    const fu = J.followUpOf(a);
    const fuInput = h("input", { class: "inp", type: "date", id: "d-fu", value: fu || "" });
    const logDate = h("input", { class: "inp", type: "date", id: "d-log-date", value: today() });
    const logType = h("select", { class: "inp", id: "d-log-type" }, J.LOG_TYPES.map((t) => h("option", { value: t }, t)));
    const logNote = h("input", { class: "inp", id: "d-log-note", maxlength: "500", "aria-describedby": "d-log-err" });
    const logErr = h("span", { class: "err", id: "d-log-err" });
    const log = J.logOf(a).slice().reverse();
    body.replaceChildren(
      h("button", { class: "btn ghost xs dlg-x", type: "button", onclick: () => $("#detail-dlg").close(), "aria-label": "Close details" }, "Close"),
      h("span", { class: "badge" }, h("i", { text: J.statusOf(a) }), " · applied " + fmtDate(a.dateApplied, { month: "short", day: "numeric", year: "numeric" })),
      h("h2", { id: "d-title" }, String(a.company), sampleTag(a)),
      h("p", { class: "lead" }, [a.role, a.source, a.pay].filter(Boolean).join(" · "), link ? " · " : "", link),
      h("div", { class: "toolbar" },
        h("div", { class: "field" }, h("label", { class: "lbl", for: "st-d-" + a.id, text: "Status" }), statusSelect(a, "st-d-")),
        h("button", { class: "btn sec sm", type: "button", onclick: () => { $("#detail-dlg").close(); openJobForm(id); } }, "Edit"),
        h("button", { class: "btn danger sm", type: "button", onclick: () => removeApp(a) }, "Delete"),
      ),
      a.notes ? h("div", { class: "sub" }, h("h3", { text: "Notes" }), h("p", { class: "notes-text", text: String(a.notes) })) : null,
      h("div", { class: "sub" }, h("h3", { text: "Next follow-up" }),
        h("form", { class: "inline two", novalidate: true, onsubmit: (e) => {
          e.preventDefault();
          const v = fuInput.value;
          if (v && !J.isRealISO(v)) { toast("Pick a real date."); return; }
          replaceApp(Object.assign({}, a, { nextFollowUp: v || null }), v ? "Follow-up set for " + fmtDate(v) + "." : "Follow-up cleared.");
        } },
          h("div", { class: "field" }, h("label", { for: "d-fu", text: "Date" }), fuInput),
          h("button", { class: "btn pri sm", type: "submit" }, "Save date"),
          J.ACTIVE.includes(a.status) ? h("button", { class: "btn sec sm", type: "button", onclick: () => replaceApp(J.markFollowedUp(a, today()), "Logged a follow-up.") }, "Followed up today") : null)),
      h("div", { class: "sub" }, h("h3", { text: "Log" }),
        h("form", { class: "inline", novalidate: true, onsubmit: (e) => {
          e.preventDefault();
          const r = J.addLogEntry(a, { date: logDate.value, type: logType.value, note: logNote.value });
          if (!r.ok) { logErr.textContent = r.errors.note || r.errors.date; logNote.focus(); return; }
          replaceApp(r.app, logType.value + " logged.");
        } },
          h("div", { class: "field" }, h("label", { for: "d-log-date", text: "Date" }), logDate),
          h("div", { class: "field" }, h("label", { for: "d-log-type", text: "Type" }), logType),
          h("div", { class: "field" }, h("label", { for: "d-log-note", text: "What happened" }), logNote, logErr),
          h("button", { class: "btn pri sm", type: "submit" }, "Add")),
        log.length ? h("ul", { class: "mini" }, log.map((e) => h("li", null,
          h("span", { text: fmtDate(e.date, { month: "short", day: "numeric", year: "numeric" }) + " · " + e.type + " · " + e.note }),
          h("button", { class: "btn ghost xs", type: "button", "aria-label": "Remove log entry", onclick: async () => {
            if (await confirmBox("Remove this log entry?", "Remove")) replaceApp(J.removeLogEntry(a, e.id), "Log entry removed.");
          } }, "Remove")))) : h("p", { class: "s", text: "Nothing logged yet." })),
    );
    if (active && document.getElementById(active)) document.getElementById(active).focus();
  }

  /* ---------- import / export ---------- */
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h("a", { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportJson() { download(JSON.stringify(apps, null, 2), "bryz-jobs-backup-" + today() + ".json", "application/json"); toast("Backup downloaded (" + apps.length + " applications)."); }
  function exportCsv() { download(J.toCsv(apps), "bryz-jobs-" + today() + ".csv", "text/csv"); toast("CSV downloaded."); }

  let pendingImport = null;
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast("That file is too large (max 5 MB)."); return; }
    const parsed = J.parseImportText(await file.text(), file.name);
    if (parsed.error) { await confirmBox(parsed.error, "OK", "Can't import that file."); return; }
    showImportPreview(parsed.list, "from " + file.name);
  });
  function showImportPreview(list, label) {
    const prepared = J.prepareImport(list);
    if (!prepared.unique.length) {
      confirmBox("No usable applications " + label + ". Each needs a company, a role, a real date applied and a known status. Nothing was changed.", "OK", "Nothing to import.");
      return;
    }
    pendingImport = prepared.unique;
    const bits = [prepared.unique.length + " application" + (prepared.unique.length === 1 ? "" : "s") + " ready " + label + "."];
    if (prepared.skipped) bits.push(prepared.skipped + " skipped.");
    if (prepared.duplicateIds) bits.push(prepared.duplicateIds + " duplicate id" + (prepared.duplicateIds === 1 ? "" : "s") + " ignored (first one kept).");
    bits.push("This browser has " + apps.length + " now. Merge updates matches by id and adds the rest (your logs and later follow-up dates are kept). Replace overwrites everything here. You can undo right after.");
    $("#import-summary").textContent = bits.join(" ");
    const d = $("#import-dlg");
    d.returnValue = "";
    d.showModal();
  }
  $("#import-dlg").addEventListener("close", () => {
    const choice = $("#import-dlg").returnValue;
    const list = pendingImport; pendingImport = null;
    if (!list || (choice !== "merge" && choice !== "replace")) return;
    const before = apps.length;
    if (choice === "merge") commit(J.mergeInto(apps, list), "Merged import: " + before + " → " + J.mergeInto(apps, list).length + " applications.", { undo: true });
    else commit(list.slice(), "Replaced " + before + " applications with " + list.length + ".", { undo: true });
  });

  /* ---------- cloud sync (same Gist, file, keys and rules as before) ---------- */
  function getSyncConfig() { return J.readSyncConfig(storageGet(J.SYNC_KEY)); }
  function setSyncConfig(cfg) {
    const next = J.syncConfigValue(cfg);
    try { localStorage.setItem(J.SYNC_KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
    return next;
  }
  function setSyncStatus(msg) { $("#sync-status").textContent = msg || ""; }
  function gistRawUrl(gistId) {
    return "https://gist.githubusercontent.com/supbrice/" + encodeURIComponent(gistId) + "/raw/" + J.GIST_FILENAME + "?t=" + Date.now();
  }
  async function fetchCloudApps(cfg) {
    const gistId = (cfg && cfg.gistId) || J.DEFAULT_GIST_ID;
    if (!gistId) throw new Error("No Gist ID configured.");
    let list = null, errRaw = null;
    try {
      const res = await fetch(gistRawUrl(gistId), { cache: "no-store" });
      if (!res.ok) throw new Error("Raw fetch HTTP " + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Gist JSON is not an array.");
      list = data;
    } catch (err) { errRaw = err; }
    if (!list && cfg && cfg.token) {
      const res = await fetch("https://api.github.com/gists/" + encodeURIComponent(gistId), { headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + cfg.token } });
      if (!res.ok) throw new Error("GitHub API HTTP " + res.status);
      const gist = await res.json();
      const file = (gist.files && (gist.files[J.GIST_FILENAME] || Object.values(gist.files)[0])) || null;
      if (!file || !file.content) throw new Error("Gist has no " + J.GIST_FILENAME);
      let data;
      if (file.truncated && file.raw_url) {
        const rawRes = await fetch(file.raw_url + (file.raw_url.includes("?") ? "&" : "?") + "t=" + Date.now(), { headers: { Authorization: "Bearer " + cfg.token } });
        if (!rawRes.ok) throw new Error("Truncated file raw HTTP " + rawRes.status);
        data = await rawRes.json();
      } else data = JSON.parse(file.content);
      if (!Array.isArray(data)) throw new Error("Gist JSON is not an array.");
      list = data;
    }
    if (!list) throw errRaw || new Error("Could not read Gist.");
    const prepared = J.prepareImport(list);
    if (!prepared.unique.length) throw new Error("Gist had no valid applications.");
    return prepared;
  }
  async function pullFromCloud(opts) {
    const options = opts || {};
    const cfg = getSyncConfig();
    setSyncStatus("Pulling from Gist…");
    try {
      if (!storageOk) throw new Error("Your stored list couldn't be read, so nothing was changed.");
      const cloud = (await fetchCloudApps(cfg)).unique;
      const localReal = J.realCount(apps), cloudReal = J.realCount(cloud);
      if (options.silent && J.onlySamples(apps) && cloudReal > 0) {
        if (!commit(cloud.slice(), null)) throw new Error("Could not save pulled apps.");
        setSyncStatus("Pulled " + cloud.length + " applications from cloud.");
        $("#cloud-banner").hidden = true;
        toast("Pulled " + cloud.length + " applications from your Gist.");
        return { ok: true, count: cloud.length, mode: "auto-replace" };
      }
      if (options.silent) {
        if (cloudReal > localReal && localReal > 0) {
          $("#cloud-banner-text").textContent = "Cloud has " + cloud.length + " applications (this browser has " + apps.length + "). Pull to update.";
          $("#cloud-banner").hidden = false;
        }
        setSyncStatus("Cloud has " + cloud.length + " applications.");
        return { ok: true, count: cloud.length, mode: "check" };
      }
      let chosen = options.mode || (J.onlySamples(apps) ? "replace" : null);
      if (!chosen) {
        chosen = (await confirmBox("Cloud has " + cloud.length + " applications. This browser has " + apps.length + ". Replace this browser's list with the cloud copy, or cancel to merge the cloud into it.", "Replace", "Pull from cloud")) ? "replace" : "merge";
      }
      const next = chosen === "replace" ? cloud.slice() : J.mergeCloud(apps, cloud);
      if (!commit(next, (chosen === "replace" ? "Replaced with " : "Merged ") + cloud.length + " from cloud.", { undo: true })) throw new Error("Could not save after pull.");
      setSyncStatus((chosen === "replace" ? "Replaced with " : "Merged ") + cloud.length + " from cloud.");
      $("#cloud-banner").hidden = true;
      return { ok: true, count: cloud.length, mode: chosen };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      setSyncStatus("Pull failed: " + msg);
      if (!options.silent) toast("Pull failed: " + msg);
      return { ok: false, error: msg };
    }
  }
  async function pushToCloud() {
    const cfg = getSyncConfig();
    if (!cfg.token) { setSyncStatus("Add a GitHub token with the gist scope to Push."); toast("Push needs a GitHub token with the gist scope. Add it in Cloud sync."); return { ok: false }; }
    if (!cfg.gistId) { setSyncStatus("Set a Gist ID first."); return { ok: false }; }
    if (!storageOk) { setSyncStatus("Push blocked: your stored list couldn't be read."); return { ok: false }; }
    setSyncStatus("Pushing " + apps.length + " applications…");
    try {
      const body = { files: { [J.GIST_FILENAME]: { content: JSON.stringify(apps, null, 1) } } };
      const res = await fetch("https://api.github.com/gists/" + encodeURIComponent(cfg.gistId), {
        method: "PATCH",
        headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + cfg.token, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) { const t = await res.text(); throw new Error("HTTP " + res.status + (t ? ": " + t.slice(0, 180) : "")); }
      setSyncStatus("Pushed " + apps.length + " applications to Gist.");
      return { ok: true };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      setSyncStatus("Push failed: " + msg);
      toast("Push failed: " + msg);
      return { ok: false, error: msg };
    }
  }
  let autoPushTimer = null;
  function queueAutoPush() {
    const cfg = getSyncConfig();
    if (!cfg.autoPush || !cfg.token || !cfg.gistId) return;
    clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(() => { pushToCloud(); }, 1200);
  }
  function openPrefs() {
    const cfg = getSyncConfig();
    $("#sync-gist").value = cfg.gistId || "";
    $("#sync-token").value = cfg.token || "";
    $("#sync-autopull").checked = cfg.autoPull !== false;
    $("#sync-autopush").checked = !!cfg.autoPush;
    setSyncStatus(cfg.gistId ? "Gist " + cfg.gistId.slice(0, 8) + "… · " + (cfg.token ? "token set" : "no token (pull only)") : "Cloud sync is off. Paste your Gist ID to turn it on.");
    $("#prefs-dlg").showModal();
  }
  function savePrefs() {
    const next = setSyncConfig({ gistId: $("#sync-gist").value, token: $("#sync-token").value, autoPull: $("#sync-autopull").checked, autoPush: $("#sync-autopush").checked });
    setSyncStatus("Saved. " + (next.gistId ? "Gist " + next.gistId.slice(0, 8) + "…" : "No Gist") + " · auto-pull " + (next.autoPull ? "on" : "off") + " · auto-push " + (next.autoPush ? "on" : "off") + (next.token ? " · token set" : " · no token"));
    renderHero();
    return next;
  }
  $("#sync-save").addEventListener("click", savePrefs);
  $("#sync-pull").addEventListener("click", () => { savePrefs(); pullFromCloud({ silent: false }); });
  $("#sync-push").addEventListener("click", () => { savePrefs(); pushToCloud(); });
  $("#cloud-banner-pull").addEventListener("click", () => pullFromCloud({ silent: false, mode: "replace" }));

  /* ---------- wiring ---------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) ({ add: () => openJobForm(), export: exportJson, "export-csv": exportCsv, import: () => $("#import-file").click(), prefs: openPrefs })[b.dataset.act]();
    if (e.target.closest("[data-close]")) e.target.closest("dialog").close();
  });
  ["#job-dlg", "#detail-dlg", "#prefs-dlg"].forEach((s) => $(s).addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }));
  $("#detail-dlg").addEventListener("close", (e) => { e.currentTarget.dataset.id = ""; });
  $("#q").addEventListener("input", (e) => { filter.q = e.target.value; shown = PAGE; renderList(); });

  load();
  // First visit: store an empty sync config (token never auto-filled), like before.
  try { if (!localStorage.getItem(J.SYNC_KEY)) setSyncConfig({ gistId: "", token: "", autoPull: false, autoPush: false }); } catch (e) { /* ignore */ }
  // One-tap link: #pipely-gist=<id> (also #pipely-sync=, #bryz-jobs-gist=, #bryz-jobs-sync=).
  try {
    const id = J.gistHashId(location.hash);
    if (id) {
      const cfg = getSyncConfig();
      setSyncConfig({ gistId: id, token: cfg.token, autoPull: true, autoPush: cfg.autoPush });
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) { /* ignore */ }
  render();
  (async function bootCloudSync() {
    const cfg = getSyncConfig();
    if (cfg.gistId === J.RETIRED_GIST_ID) {
      setSyncConfig({ gistId: "", token: cfg.token || "", autoPull: false, autoPush: false });
      renderHero();
      return;
    }
    if (!cfg.gistId || cfg.autoPull === false) return;
    await pullFromCloud({ silent: true });
  })();
})();
