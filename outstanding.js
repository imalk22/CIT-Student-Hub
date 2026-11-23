/* CIT Student Hub — Student outstanding: one list of every student who owes money.
   Combines unpaid Xero invoices (course fees, exam fees … whatever is invoiced) with overdue student renewals
   worked out from the renewal files. Click a student to open their profile. */
"use strict";
let outF = "all", outLevel = "All", outSort = "due";

function studentDues() {
  const today = new Date(), d90 = new Date(today - 90 * 864e5).toISOString().slice(0, 10);
  const out = [];
  for (const s of DB.students) {
    const x = typeof xeroFor === "function" ? xeroFor("student", s.id) : null;
    const r = DB.renewals?.length && typeof studentRenewal === "function" ? studentRenewal(s) : null;
    const ren = r && r.state === "overdue" && r.amount > 0 ? r : null;
    const xd = x?.due || 0, rd = ren?.amount || 0;
    if (!xd && !rd) continue;
    out.push({ s, x, ren, xd, rd, total: xd + rd, late90: x ? x.invoices.filter(i => i.dueDate && i.dueDate < d90).reduce((a, i) => a + i.due, 0) : 0,
      oldest: x?.oldest || "", level: (typeof currentLevel === "function" ? currentLevel(s)?.level : "") || "" });
  }
  return out;
}

function renderOutstanding() {
  $$("main > .view").forEach(v => v.classList.add("hide"));
  const box = $("#v-out"); box.classList.remove("hide");
  const keepQ = $("#outq")?.value || "";
  const all = studentDues(), X = DB.xero, S = XSTATUS || {};
  const sum = (xs, k) => xs.reduce((a, x) => a + x[k], 0);
  const withX = all.filter(d => d.xd), withR = all.filter(d => d.rd), late = all.filter(d => d.late90);
  const levels = ["All", ...LEVELS.filter(l => all.some(d => d.level === l))];
  const src = [
    X ? `Xero synced ${ago(X.syncedAt)}` : "Xero not synced yet",
    DB.renewals?.length ? "renewals from the renewal files" : "no renewal files imported",
  ].join(" · ");
  box.innerHTML = `
    <div class="titlebar"><h1>Student outstanding</h1><span style="display:flex;gap:8px;align-items:center">${S.connected && !S.offline ? `<button class="btn small" id="outSync">Sync Xero</button>` : ""}<button class="link" id="outExport">Export</button></span></div>
    <p class="sub">Everything students owe in one place — ${esc(src)}.</p>
    ${!X && !DB.renewals?.length ? `<div class="note">Nothing to show yet. Connect Xero on the <button class="link" id="outFin">Finance</button> page, or import the student renewal files on the Data tab.</div>` : ""}
    <div class="kpi4" style="margin-top:12px">
      <div class="card kpi" style="--ac:var(--red)"><div class="kl">Total owed by students</div><div class="kr"><div class="kv">${rs(sum(all, "total"))}</div></div><div class="kn">${all.length} student${all.length === 1 ? "" : "s"}</div></div>
      <div class="card kpi" style="--ac:var(--blue)"><div class="kl">Xero invoices</div><div class="kr"><div class="kv">${rs(sum(withX, "xd"))}</div></div><div class="kn">${plural(withX.length, "student")} · course / exam fees</div></div>
      <div class="card kpi" style="--ac:var(--purple)"><div class="kl">Renewals overdue</div><div class="kr"><div class="kv">${rs(sum(withR, "rd"))}</div></div><div class="kn">${plural(withR.length, "student")}</div></div>
      <div class="card kpi" style="--ac:var(--orange)"><div class="kl">Over 90 days late</div><div class="kr"><div class="kv">${rs(sum(late, "late90"))}</div></div><div class="kn">${plural(late.length, "student")} · Xero invoices</div></div>
    </div>
    <div class="spotbox mspot" style="margin-top:14px"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="outq" type="search" placeholder="Find a student — name, student no, index no or invoice" autocomplete="off" spellcheck="false"></div>
    <div class="chips-row" id="outChips" style="margin-top:12px">${[["all", "All owing"], ["xero", "Xero invoices"], ["renewal", "Renewal overdue"], ["late", "Over 90 days"]].map(([k, t]) => `<button data-f="${k}" class="${k === outF ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="listhead"><span id="outCount"></span><span style="display:flex;gap:8px">
      <select class="inp" id="outLevel" style="width:auto">${levels.map(l => `<option ${l === outLevel ? "selected" : ""} value="${l}">${l === "All" ? "All levels" : l}</option>`).join("")}</select>
      <select class="inp" id="outSort" style="width:auto"><option value="due">Highest owed</option><option value="oldest">Oldest due first</option><option value="name">Name</option></select></span></div>
    <div class="card list" id="outList"></div>`;
  $("#outSort").value = outSort; $("#outq").value = keepQ;
  const filtered = () => {
    const q = norm($("#outq").value);
    return all.filter(d => (outF === "all" || (outF === "xero" && d.xd) || (outF === "renewal" && d.rd) || (outF === "late" && d.late90))
      && (outLevel === "All" || d.level === outLevel)
      && (!q || norm(d.s.name + " " + d.s.id + " " + d.s.index_nos.join(" ") + " " + (d.x?.invoices || []).map(i => i.number + " " + i.reference).join(" ")).includes(q)))
      .sort({ due: (a, b) => b.total - a.total, oldest: (a, b) => (a.oldest || "9") .localeCompare(b.oldest || "9") || b.total - a.total, name: (a, b) => a.s.name.localeCompare(b.s.name) }[outSort]);
  };
  const draw = () => {
    const rows = filtered();
    $("#outCount").textContent = `${rows.length} student${rows.length === 1 ? "" : "s"} · ${rs(sum(rows, "total"))}`;
    $("#outList").innerHTML = rows.slice(0, 300).map(d => `<button class="row action outrow" data-id="${esc(d.s.id)}">
      <span class="t"><b>${esc(d.s.name)}</b><span>${esc(d.s.id)}${d.level ? " · " + esc(d.level) : ""}${d.oldest ? ` · oldest due ${fmtDay(d.oldest)}` : ""}</span>
        <span class="outchips">${d.xd ? `<span class="chip c-blue">Xero ${rs(d.xd)} · ${d.x.count} inv</span>` : ""}${d.late90 ? `<span class="chip c-orange">${rs(d.late90)} 90+ days</span>` : ""}${d.rd ? `<span class="chip c-purple">Renewal ${rs(d.rd)} · ${esc(d.ren.due.join(", "))}</span>` : ""}</span></span>
      <span class="stamt">${rs(d.total)}</span><span class="chev">›</span></button>`).join("")
      + (rows.length > 300 ? `<div class="empty">${rows.length - 300} more — search to narrow down</div>` : "") || `<div class="empty">No students owe anything${outF !== "all" || outLevel !== "All" ? " with these filters" : ""}.</div>`;
    $$("#outList [data-id]").forEach(b => b.onclick = () => openProfile(b.dataset.id));
  };
  draw();
  $("#outq").oninput = draw;
  $("#outq").onkeydown = e => { if (e.key === "Enter") { const f = $("#outList [data-id]"); if (f) openProfile(f.dataset.id); } };
  $("#outChips").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { outF = b.dataset.f; $$("#outChips button").forEach(x => x.classList.toggle("on", x === b)); draw(); } };
  $("#outLevel").onchange = e => { outLevel = e.target.value; draw(); };
  $("#outSort").onchange = e => { outSort = e.target.value; draw(); };
  if ($("#outFin")) $("#outFin").onclick = () => tab("fin");
  if ($("#outSync")) $("#outSync").onclick = async () => { await xeroSync(); if (currentTab === "out") renderOutstanding(); };
  $("#outExport").onclick = () => {
    const rows = filtered().map(d => ({ "Student no": d.s.id, Name: d.s.name, Level: d.level, Email: d.s.contact?.email || "", Phone: d.s.contact?.phone || "",
      "Xero due": d.xd, "Xero invoices": (d.x?.invoices || []).map(i => i.number).join(", "), "Oldest due date": d.oldest, "Over 90 days": d.late90,
      "Renewal due": d.rd, "Renewal years": d.ren ? d.ren.due.join(", ") : "", "Total owed": d.total }));
    if (!rows.length) return toast("Nothing to export");
    xlsxDownload(rows, "Student outstanding", `student-outstanding-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
