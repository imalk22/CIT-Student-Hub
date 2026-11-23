/* CIT Student Hub — Student outstanding (Dues): student COURSE FEES OVERDUE, read from Xero only.
   Nothing here comes from Excel files, and nothing is mixed with exam results — Xero is the single source.
   Overdue = an unpaid (Awaiting Payment) Xero invoice whose due date has passed. One card per student. */
"use strict";
let outF = "overdue", outSort = "due";
const OUT_FILTERS = [["overdue", "Overdue", "overdue"], ["late", "Over 90 days", "late90"], ["notdue", "Not yet due", "notDue"], ["all", "All unpaid", "due"]];

function renderOutstanding() {
  $$("main > .view").forEach(v => v.classList.add("hide"));
  const box = $("#v-out"); box.classList.remove("hide");
  const keepQ = $("#outq")?.value || "";
  const all = DB.xero ? dueGroups("student") : [], X = DB.xero, S = XSTATUS || {};
  const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  const od = all.filter(d => d.overdue), late = all.filter(d => d.late90), nd = all.filter(d => d.notDue);
  box.innerHTML = `
    <div class="titlebar"><h1>Student outstanding</h1><span style="display:flex;gap:10px;align-items:center">${S.connected && !S.offline ? `<button class="btn small" id="outSync">Sync Xero</button>` : ""}<button class="link" id="outExport">Export</button></span></div>
    <p class="sub">Course fees from Xero only${X ? ` · synced ${ago(X.syncedAt)}` : ""}.</p>
    ${!X ? `<div class="note"><b>Xero isn't synced yet</b>, so there's nothing to show. Course fee dues come only from Xero — connect it on the <button class="link" id="outFin">Finance</button> page.</div>` : ""}
    <div class="dkpis">
      <button class="dkpi red ${outF === "overdue" ? "on" : ""}" data-f="overdue"><small>Overdue</small><b>${rs(sum(od, "overdue"))}</b><span>${plural(od.length, "student")} past the due date</span></button>
      <button class="dkpi orange ${outF === "late" ? "on" : ""}" data-f="late"><small>Over 90 days</small><b>${rs(sum(late, "late90"))}</b><span>${plural(late.length, "student")}</span></button>
      <button class="dkpi blue ${outF === "notdue" ? "on" : ""}" data-f="notdue"><small>Not yet due</small><b>${rs(sum(nd, "notDue"))}</b><span>${plural(nd.length, "student")} · due later</span></button>
      <button class="dkpi ${outF === "all" ? "on" : ""}" data-f="all"><small>All unpaid</small><b>${rs(sum(all, "due"))}</b><span>${plural(all.length, "student")}</span></button>
    </div>
    <div class="dtools">
      <div class="search dsearch"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="outq" type="search" placeholder="Search name, student no or invoice no" autocomplete="off" spellcheck="false"></div>
      <select class="inp" id="outSort" style="width:auto"><option value="due">Highest amount</option><option value="oldest">Longest overdue</option><option value="name">Name A–Z</option></select>
    </div>
    <div class="listhead"><span id="outCount"></span></div>
    <div class="dgrid" id="outList"></div>`;
  $("#outSort").value = outSort; $("#outq").value = keepQ;
  const amtKey = () => OUT_FILTERS.find(f => f[0] === outF)[2];
  const filtered = () => {
    const q = norm($("#outq").value), k = amtKey();
    return all.filter(d => d[k] > 0 && (!q || norm(d.name + " " + d.key + " " + d.inv.map(i => i.number + " " + i.reference).join(" ")).includes(q)))
      .sort({ due: (a, b) => b[k] - a[k], oldest: (a, b) => b.daysLate - a.daysLate || b[k] - a[k], name: (a, b) => a.name.localeCompare(b.name) }[outSort]);
  };
  const draw = () => {
    const rows = filtered(), k = amtKey();
    $("#outCount").textContent = `${plural(rows.length, "student")} · ${rs(sum(rows, k))}`;
    $("#outList").innerHTML = rows.slice(0, 200).map(d => dueCardHtml(d, { amount: k })).join("")
      + (rows.length > 200 ? `<div class="empty dg-full">${rows.length - 200} more — search to narrow down</div>` : "") || ($("#outq").value.trim()
        ? `<div class="card empty dg-full">Nothing for “${esc($("#outq").value.trim())}” in this list.<br>If Xero shows an unpaid invoice: press <b>Sync Xero</b>, check the invoice is approved (Awaiting Payment, not Draft), and look in Finance → <button class="link" id="outNm">Not matched</button>.</div>`
        : `<div class="card empty dg-full">${X ? "No students in this list." : "Connect Xero to see course fee dues."}</div>`);
    if ($("#outNm")) $("#outNm").onclick = () => { finSeg = "none"; tab("fin"); };
    bindDueCards($("#outList"), rows);
  };
  draw();
  $("#outq").oninput = draw;
  $("#outq").onkeydown = e => { if (e.key === "Enter") $("#outList .dcard")?.click(); };
  $$("#v-out .dkpi").forEach(b => b.onclick = () => { outF = b.dataset.f; $$("#v-out .dkpi").forEach(x => x.classList.toggle("on", x === b)); draw(); });
  $("#outSort").onchange = e => { outSort = e.target.value; draw(); };
  if ($("#outFin")) $("#outFin").onclick = () => tab("fin");
  if ($("#outSync")) $("#outSync").onclick = async () => { await xeroSync(); if (currentTab === "out") renderOutstanding(); };
  $("#outExport").onclick = () => {
    const t = todayISO(), k = amtKey();
    const rows = filtered().flatMap(d => d.inv.filter(i => k === "due" || (k === "notDue" ? !(i.dueDate && i.dueDate < t) : i.dueDate && i.dueDate < t)).map(i => ({
      "Student no": d.key, Name: d.name, Invoice: i.number, Reference: i.reference, Description: (i.lines || []).join("; "), "Invoice date": i.date, "Due date": i.dueDate,
      "Days overdue": i.dueDate && i.dueDate < t ? daysSince(i.dueDate) : 0, Total: i.total, Paid: i.paid, "Amount due": i.due, Email: d.contact.email || "" })));
    if (!rows.length) return toast("Nothing to export");
    xlsxDownload(rows, "Student dues", `student-dues-${outF}-${t}.xlsx`);
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
