/* CIT Student Hub — Student outstanding (Dues): student COURSE FEES OVERDUE, read from Xero only.
   Nothing here comes from Excel files, and nothing is mixed with exam results — Xero is the single source.
   Overdue = an unpaid (Awaiting Payment) Xero invoice whose due date has passed. */
"use strict";
let outF = "overdue", outSort = "due";

function studentDues() {
  const F = typeof finIndex === "function" ? finIndex() : null;
  if (!F) return [];
  const today = new Date().toISOString().slice(0, 10), d90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const byId = new Map(DB.students.map(s => [s.id, s]));
  const out = [];
  for (const g of F.byKey.values()) {
    if (g.kind !== "student") continue;
    const s = byId.get(g.key);
    const inv = g.invoices.slice().sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
    const overdue = inv.filter(i => i.dueDate && i.dueDate < today), notDue = inv.filter(i => !(i.dueDate && i.dueDate < today));
    const sum = xs => xs.reduce((a, i) => a + i.due, 0);
    out.push({
      id: g.key, name: s ? s.name : (g.contactName || g.key), contact: s?.contact || {}, unknown: !s, inv,
      overdue: sum(overdue), overdueCount: overdue.length, notDue: sum(notDue), total: g.due,
      late90: sum(inv.filter(i => i.dueDate && i.dueDate < d90)), oldest: overdue[0]?.dueDate || "",
      daysLate: overdue[0] ? Math.floor((Date.now() - new Date(overdue[0].dueDate + "T00:00:00")) / 864e5) : 0,
    });
  }
  return out;
}

function renderOutstanding() {
  $$("main > .view").forEach(v => v.classList.add("hide"));
  const box = $("#v-out"); box.classList.remove("hide");
  const keepQ = $("#outq")?.value || "";
  const all = studentDues(), X = DB.xero, S = XSTATUS || {};
  const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  const od = all.filter(d => d.overdue), late = all.filter(d => d.late90), nd = all.filter(d => d.notDue);
  box.innerHTML = `
    <div class="titlebar"><h1>Student outstanding</h1><span style="display:flex;gap:8px;align-items:center">${S.connected && !S.offline ? `<button class="btn small" id="outSync">Sync Xero</button>` : ""}<button class="link" id="outExport">Export</button></span></div>
    <p class="sub">Course fees overdue — from Xero only${X ? ` · synced ${ago(X.syncedAt)}` : ""}.</p>
    ${!X ? `<div class="note"><b>Xero isn't synced yet</b>, so there's nothing to show. Course fee dues come only from Xero — connect it on the <button class="link" id="outFin">Finance</button> page (or open <code>/xero/connect</code>) and they'll appear here.</div>` : ""}
    <div class="kpi4" style="margin-top:12px">
      <div class="card kpi" style="--ac:var(--red)"><div class="kl">Course fees overdue</div><div class="kr"><div class="kv">${rs(sum(od, "overdue"))}</div></div><div class="kn">${plural(od.length, "student")} · past the due date</div></div>
      <div class="card kpi" style="--ac:var(--orange)"><div class="kl">Over 90 days overdue</div><div class="kr"><div class="kv">${rs(sum(late, "late90"))}</div></div><div class="kn">${plural(late.length, "student")}</div></div>
      <div class="card kpi" style="--ac:var(--blue)"><div class="kl">Not yet due</div><div class="kr"><div class="kv">${rs(sum(nd, "notDue"))}</div></div><div class="kn">${plural(nd.length, "student")} · invoiced, due later</div></div>
      <div class="card kpi" style="--ac:var(--gray)"><div class="kl">All unpaid in Xero</div><div class="kr"><div class="kv">${rs(sum(all, "total"))}</div></div><div class="kn">${plural(all.length, "student")}</div></div>
    </div>
    <div class="spotbox mspot" style="margin-top:14px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="outq" type="search" placeholder="Find a student — name, student no or invoice no" autocomplete="off" spellcheck="false"></div>
    <div class="chips-row" id="outChips" style="margin-top:12px">${[["overdue", "Overdue"], ["late", "Over 90 days"], ["notdue", "Not yet due"], ["all", "All unpaid"]].map(([k, t]) => `<button data-f="${k}" class="${k === outF ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="listhead"><span id="outCount"></span>
      <select class="inp" id="outSort" style="width:auto"><option value="due">Highest overdue</option><option value="oldest">Longest overdue</option><option value="name">Name</option></select></div>
    <div class="card list" id="outList"></div>`;
  $("#outSort").value = outSort; $("#outq").value = keepQ;
  const amt = d => outF === "notdue" ? d.notDue : outF === "all" ? d.total : outF === "late" ? d.late90 : d.overdue;
  const filtered = () => {
    const q = norm($("#outq").value);
    return all.filter(d => amt(d) > 0 && (!q || norm(d.name + " " + d.id + " " + d.inv.map(i => i.number + " " + i.reference).join(" ")).includes(q)))
      .sort({ due: (a, b) => amt(b) - amt(a), oldest: (a, b) => (a.oldest || "9").localeCompare(b.oldest || "9") || amt(b) - amt(a), name: (a, b) => a.name.localeCompare(b.name) }[outSort]);
  };
  const draw = () => {
    const rows = filtered();
    $("#outCount").textContent = `${rows.length} student${rows.length === 1 ? "" : "s"} · ${rs(rows.reduce((a, d) => a + amt(d), 0))}`;
    $("#outList").innerHTML = rows.slice(0, 300).map(d => `<button class="row action outrow" data-id="${esc(d.id)}">
      <span class="t"><b>${esc(d.name)}</b><span>${esc(d.id)}${d.overdue ? ` · overdue since ${fmtDay(d.oldest)} (${d.daysLate} days)` : d.inv[0]?.dueDate ? ` · next due ${fmtDay(d.inv[0].dueDate)}` : ""}</span>
        <span class="outchips">${d.unknown ? `<span class="chip c-gray">Not in student list</span>` : ""}${d.overdue ? `<span class="chip c-red">Overdue ${rs(d.overdue)} · ${d.overdueCount} inv</span>` : ""}${d.late90 ? `<span class="chip c-orange">${rs(d.late90)} over 90 days</span>` : ""}${d.notDue ? `<span class="chip c-blue">Not yet due ${rs(d.notDue)}</span>` : ""}</span></span>
      <span class="stamt">${rs(amt(d))}</span><span class="chev">›</span></button>`).join("")
      + (rows.length > 300 ? `<div class="empty">${rows.length - 300} more — search to narrow down</div>` : "") || ($("#outq").value.trim()
        ? `<div class="empty">No ${outF === "all" ? "unpaid" : outF === "notdue" ? "not-yet-due" : "overdue"} course fees for “${esc($("#outq").value.trim())}” in Xero.<br>If Xero shows one: press <b>Sync Xero</b>, check the invoice is approved (Awaiting Payment, not Draft), and look in Finance → <button class="link" id="outNm">Not matched</button> — the student no may need to go in the contact's Account number.</div>`
        : `<div class="empty">${X ? "No students in this list." : "Connect Xero to see course fee dues."}</div>`);
    if ($("#outNm")) $("#outNm").onclick = () => { finSeg = "none"; tab("fin"); };
    $$("#outList [data-id]").forEach(b => b.onclick = () => openDue(rows.find(d => d.id === b.dataset.id)));
  };
  const openDue = d => {   // course fee dues only — not the exam-results profile
    if (!d) return;
    const today = new Date().toISOString().slice(0, 10);
    openSheet(`<div class="bar-top"><div><b style="font-size:17px">${esc(d.name)}</b><div class="muted">${esc(d.id)} · course fees from Xero</div></div>${closeBtn}</div>
      ${d.unknown ? `<div class="note">This student number is on Xero invoices but isn't in the app's student list. Check the number in Xero.</div>` : ""}
      <div class="imp-sum"><div><b class="owe">${rs(d.overdue)}</b><span>overdue</span></div><div><b>${rs(d.notDue)}</b><span>not yet due</span></div><div><b>${rs(d.total)}</b><span>all unpaid</span></div></div>
      <div class="card xcard"><div class="sec-h"><h2>Xero invoices</h2><span class="muted">${DB.xero ? "synced " + ago(DB.xero.syncedAt) : ""}</span></div>
        ${d.inv.map(i => { const late = i.dueDate && i.dueDate < today; return `<div class="xinv ${late ? "late" : ""}"><span><b>${esc(i.number || "Invoice")}</b>${i.reference ? " · " + esc(i.reference) : ""}<small>${esc(i.lines?.[0] || "")}</small></span><span class="muted">${i.dueDate ? (late ? "overdue · was due " : "due ") + fmtDay(i.dueDate) : fmtDay(i.date)}</span><b class="${late ? "owe" : ""}">${rs(i.due)}</b></div>`; }).join("")}</div>
      ${d.contact.email || d.contact.phone ? `<div class="card xcard"><div class="sec-h"><h2>Contact</h2></div><div class="muted" style="padding:2px 0 8px">${[d.contact.email, d.contact.phone].filter(Boolean).map(esc).join(" · ")}</div></div>` : ""}`);
  };
  draw();
  $("#outq").oninput = draw;
  $("#outq").onkeydown = e => { if (e.key === "Enter") $("#outList [data-id]")?.click(); };
  $("#outChips").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { outF = b.dataset.f; $$("#outChips button").forEach(x => x.classList.toggle("on", x === b)); draw(); } };
  $("#outSort").onchange = e => { outSort = e.target.value; draw(); };
  if ($("#outFin")) $("#outFin").onclick = () => tab("fin");
  if ($("#outSync")) $("#outSync").onclick = async () => { await xeroSync(); if (currentTab === "out") renderOutstanding(); };
  $("#outExport").onclick = () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = filtered().flatMap(d => d.inv.filter(i => outF === "all" || (outF === "notdue" ? !(i.dueDate && i.dueDate < today) : i.dueDate && i.dueDate < today)).map(i => ({
      "Student no": d.id, Name: d.name, Email: d.contact.email || "", Phone: d.contact.phone || "",
      Invoice: i.number, Reference: i.reference, Description: (i.lines || []).join("; "), "Invoice date": i.date, "Due date": i.dueDate,
      "Days overdue": i.dueDate && i.dueDate < today ? Math.floor((Date.now() - new Date(i.dueDate + "T00:00:00")) / 864e5) : 0, Total: i.total, Paid: i.paid, "Amount due": i.due })));
    if (!rows.length) return toast("Nothing to export");
    xlsxDownload(rows, "Course fees overdue", `course-fees-${outF}-${today}.xlsx`);
  };
  if (matchMedia("(pointer:fine)").matches) setTimeout(() => $("#outq")?.focus({ preventScroll: true }), 60);
  fx(box, ".none");
}

/* navigation: its own tab in the sidebar and the bottom bar */
const OUT_IC = '<path d="M12 2v20M17 6.5c-.8-1.5-2.6-2.5-5-2.5-3 0-5 1.5-5 3.8 0 5.2 10 2.7 10 8.2 0 2.3-2.2 4-5 4-2.6 0-4.5-1.1-5.3-2.9"/>';
$('#sidebar .sb-nav [data-tab="home"]')?.insertAdjacentHTML("afterend", `<button data-tab="out"><span class="sb-ic" style="--c:#e11d48"><svg viewBox="0 0 24 24">${OUT_IC}</svg></span>Student outstanding</button>`);
$('.tabbar [data-tab="home"]')?.insertAdjacentHTML("afterend", `<button data-tab="out"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${OUT_IC}</svg>Dues</button>`);
const _tabO = tab;
tab = function (name) {
  if (name !== "out") { $("#v-out").classList.add("hide"); return _tabO(name); }
  currentTab = "out";
  $$(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === "out")); moveGlider();
  scrollTo({ top: 0 }); try { sessionStorage.setItem("tab", "out"); } catch { }
  renderOutstanding();
  xeroStatus().then(() => { if (currentTab === "out") renderOutstanding(); });
};
$$(".tabbar button, #sidebar .sb-nav button").forEach(b => b.onclick = () => tab(b.dataset.tab));
