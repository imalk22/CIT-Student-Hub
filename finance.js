/* CIT Student Hub — Finance: outstanding invoices from Xero, matched to students and members.
   Syncing needs the local server (npm start) and a connected Xero organisation; the last synced copy is kept
   in this browser's database so it still shows when the server isn't running. */
"use strict";
const XC = window.XeroCore;
let finSeg = "student", XSTATUS = null, _finIdx = null;

const fmtDay = d => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

function finIndex() {
  const X = DB.xero; if (!X?.invoices) return null;
  const ms = typeof MEMBERS === "function" ? MEMBERS() : [];
  const sig = `${X.syncedAt}|${DB.students.length}|${ms.length}`;
  if (_finIdx?.sig !== sig) _finIdx = { sig, ...XC.summarize(X.invoices, { students: DB.students, members: ms }) };
  return _finIdx;
}
/* used by profiles and the admission check */
function xeroFor(kind, key) { const F = finIndex(); return F ? F.byKey.get(kind + ":" + key) || null : null; }

async function xeroStatus() {
  try { const r = await fetch("/api/xero/status", { cache: "no-store" }); XSTATUS = r.ok ? await r.json() : { offline: true }; }
  catch { XSTATUS = { offline: true }; }
  return XSTATUS;
}
async function xeroSync(quiet) {
  try {
    busy(true);
    const r = await fetch("/api/xero/outstanding?refresh=1", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Xero sync failed");
    DB.xero = j; _finIdx = null; save();
    const F = finIndex();
    if (!quiet) toast(`Xero synced · ${j.invoices.length} unpaid invoices · ${F.unmatched.length} not matched`);
  } catch (e) { toast(e.message); }
  finally { busy(false); }
  if (currentTab === "fin") renderFinance();
}

/* live updates: the local server re-reads Xero on its own; every 2 minutes this browser quietly picks up the
   newest copy and redraws whatever finance view is open. */
async function xeroPoll() {
  if (document.hidden) return;
  const S = await xeroStatus();
  if (S.offline || !S.connected) return;
  try {
    const r = await fetch("/api/xero/outstanding", { cache: "no-store" }); if (!r.ok) return;
    const j = await r.json();
    if (DB.xero && j.syncedAt === DB.xero.syncedAt) return;
    const before = DB.xero ? finIndex()?.total : null;
    DB.xero = j; _finIdx = null; save();
    const after = finIndex().total;
    if (before != null && Math.round(before) !== Math.round(after)) toast(`Xero updated · outstanding now ${rs(after)}`);
    if (currentTab === "fin") renderFinance();
    else if (currentTab === "out" && typeof renderOutstanding === "function") renderOutstanding();
    else if (!$("#v-mprof").classList.contains("hide") && mProfileNo) { const m = MEMBERS().find(x => x.no === mProfileNo); if (m) renderMemberProfile(m); }
  } catch { }
}
(async () => { while (!DB) await new Promise(r => setTimeout(r, 200)); setTimeout(xeroPoll, 4000); setInterval(xeroPoll, 120e3); })();
document.addEventListener("visibilitychange", () => { if (!document.hidden) xeroPoll(); });

function finPeople() {
  const F = finIndex(); if (!F) return [];
  const stu = new Map(DB.students.map(s => [s.id, s])), mem = new Map((typeof MEMBERS === "function" ? MEMBERS() : []).map(m => [m.no, m]));
  return [...F.byKey.values()].map(g => {
    const p = g.kind === "student" ? stu.get(g.key) : mem.get(g.key);
    return { ...g, name: p ? ((p.title ? p.title + " " : "") + p.name) : (g.contactName || g.key) + (g.unknown ? " (not in records)" : ""), label: g.kind === "student" ? g.key : MC.prettyNo(g.key) + " · " + (p?.type || "Member"),
      standing: g.kind === "member" && p ? acct(p).standing.state : "" };
  });
}

function renderFinance() {
  const keepQ = $("#finq")?.value || "";
  $$("main > .view").forEach(v => v.classList.add("hide"));
  const box = $("#v-fin"); box.classList.remove("hide");
  const X = DB.xero, F = finIndex(), S = XSTATUS || {};
  const people = finPeople(), sum = xs => xs.reduce((s, x) => s + x.due, 0);
  const stu = people.filter(p => p.kind === "student"), mem = people.filter(p => p.kind === "member");
  const conn = S.offline ? `<div class="note">Xero syncing works when the app is opened with <b>npm start</b> on the office computer (not on the website).${X ? ` Showing the copy synced ${ago(X.syncedAt)}.` : ""}</div>`
    : !S.configured ? `<div class="note"><b>Xero isn't set up yet.</b> Create a Xero app and add <code>XERO_CLIENT_ID</code> / <code>XERO_CLIENT_SECRET</code> to <code>.env</code> — see README → <i>Xero setup</i>. Redirect URI to register: <code>${esc(S.redirect || "")}</code></div>`
    : !S.connected ? `<div class="xconn"><span>Xero is set up but not connected.</span><a class="btn primary small" href="/xero/connect">Connect to Xero</a></div>`
    : `<div class="xconn"><span>Connected to <b>${esc(S.tenant)}</b> · read-only · updates automatically every ${S.autoEveryMin || 10} min${X ? ` · last ${ago(X.syncedAt)}` : ""}${S.lastError ? ` · <span class="owe">last try failed: ${esc(S.lastError)}</span>` : ""}</span><span style="display:flex;gap:8px"><button class="btn small primary" id="xSync">Sync now</button><button class="btn small" id="xOff">Disconnect</button></span></div>`;
  const list = finSeg === "student" ? stu : finSeg === "member" ? mem : null;
  box.innerHTML = `
    <div class="titlebar"><h1>Finance</h1>${X ? `<button class="link" id="xExport">Export to Excel</button>` : ""}</div>
    <p class="sub">Outstanding invoices from Xero${X ? ` · ${esc(X.tenant || "")} · synced ${new Date(X.syncedAt).toLocaleString("en-GB")}` : ""}</p>
    ${conn}
    ${F ? `<div class="kpi4" style="margin-top:14px">
      <div class="card kpi" style="--ac:var(--red)"><div class="kl">Total outstanding</div><div class="kr"><div class="kv">${rs(F.total)}</div></div><div class="kn">${X.invoices.length} unpaid invoices</div></div>
      <div class="card kpi" style="--ac:var(--orange)"><div class="kl">Overdue</div><div class="kr"><div class="kv">${rs(F.overdue)}</div></div><div class="kn">past the due date</div></div>
      <div class="card kpi" style="--ac:var(--blue)"><div class="kl">Students owing</div><div class="kr"><div class="kv">${stu.length}</div><span class="kd">${rs(sum(stu))}</span></div><div class="kn">matched by student / index no</div></div>
      <div class="card kpi" style="--ac:#d4a537"><div class="kl">Members owing</div><div class="kr"><div class="kv">${mem.length}</div><span class="kd">${rs(sum(mem))}</span></div><div class="kn">${F.unmatched.length} invoice${F.unmatched.length === 1 ? "" : "s"} not matched · ${rs(sum(F.unmatched))}</div></div>
    </div>
    <div class="seg" id="finSeg" style="margin-top:14px">${[["student", "Students", stu.length], ["member", "Members", mem.length], ["none", "Not matched", F.unmatched.length]].map(([k, t, n]) => `<button data-s="${k}" class="${k === finSeg ? "on" : ""}">${t} <span class="muted">${n}</span></button>`).join("")}</div>
    <div class="search" style="margin-top:12px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="finq" type="search" placeholder="Filter by name, number or invoice" autocomplete="off"></div>
    <div class="listhead"><span id="finCount"></span></div>
    <div class="card list" id="finList"></div>` : !S.offline && S.connected ? `<div class="card empty-hero" style="margin-top:14px"><b>Not synced yet</b><span>Press Sync now to read the outstanding invoices.</span></div>` : ""}`;
  const invRow = i => `<div class="xinv ${i.late ? "late" : ""}"><span><b>${esc(i.number || "Invoice")}</b>${i.reference ? " · " + esc(i.reference) : ""}<small>${esc(i.lines?.[0] || "")}</small></span>
    <span class="muted">${fmtDay(i.date)}${i.dueDate ? ` · due ${fmtDay(i.dueDate)}` : ""}</span><b class="${i.late ? "owe" : ""}">${rs(i.due)}</b></div>`;
  const draw = () => {
    if (!F) return;
    const q = norm($("#finq").value);
    if (list) {
      const rows = list.filter(p => !q || norm(p.name + " " + p.key + " " + p.label + " " + p.invoices.map(i => i.number + " " + i.reference).join(" ")).includes(q)).sort((a, b) => b.due - a.due);
      $("#finCount").textContent = `${rows.length} ${finSeg === "student" ? "student" : "member"}${rows.length === 1 ? "" : "s"} · ${rs(sum(rows))}`;
      $("#finList").innerHTML = rows.slice(0, 300).map(p => `<details class="acrow"><summary><span class="t"><b>${esc(p.name)}</b><span>${esc(p.label)} · ${p.count} invoice${p.count === 1 ? "" : "s"}${p.oldest ? ` · oldest due ${fmtDay(p.oldest)}` : ""}</span></span>
        ${p.standing === "terminated" ? `<span class="chip c-red">Terminated</span>` : p.standing === "suspended" ? `<span class="chip c-orange">Suspended</span>` : ""}${p.overdue ? `<span class="chip c-orange">${rs(p.overdue)} overdue</span>` : ""}<span class="stamt">${rs(p.due)}</span></summary>
        <div class="acdet">${p.invoices.map(invRow).join("")}${p.kind === "member" ? `<button class="link" data-key="${esc(p.key)}">Open member ›</button>` : ""}</div></details>`).join("") || `<div class="empty">Nothing outstanding.</div>`;
      $$("#finList [data-key]").forEach(b => b.onclick = () => openMember(b.dataset.key));
    } else {
      const rows = F.unmatched.filter(i => !q || norm(i.contact.name + " " + i.number + " " + i.reference + " " + i.contact.accountNumber).includes(q)).sort((a, b) => b.due - a.due);
      $("#finCount").textContent = `${rows.length} invoice${rows.length === 1 ? "" : "s"} · ${rs(sum(rows))} — add the student / membership no to the Xero contact's account number to match them`;
      $("#finList").innerHTML = rows.slice(0, 300).map(i => `<div class="row"><span class="t"><b>${esc(i.contact.name || "No contact")}</b><span>${esc([i.contact.accountNumber, i.contact.email].filter(Boolean).join(" · ") || "no account number")}</span></span></div>${invRow(i)}`).join("") || `<div class="empty">Every invoice is matched.</div>`;
    }
  };
  if ($("#finq")) $("#finq").value = keepQ;
  draw();
  if ($("#finq")) $("#finq").oninput = draw;
  if ($("#finSeg")) $("#finSeg").onclick = e => { const b = e.target.closest("[data-s]"); if (b) { finSeg = b.dataset.s; renderFinance(); } };
  if ($("#xSync")) $("#xSync").onclick = () => xeroSync();
  if ($("#xOff")) $("#xOff").onclick = async () => {
    if (!confirm("Disconnect from Xero? The last synced copy stays in this browser.")) return;
    await fetch("/api/xero/disconnect", { method: "POST" }).catch(() => { }); await xeroStatus(); renderFinance();
  };
  if ($("#xExport")) $("#xExport").onclick = () => {
    const P = new Map(finPeople().flatMap(p => p.invoices.map(i => [i.id, p])));
    const rows = X.invoices.map(i => { const p = P.get(i.id); return {
      "Matched to": p ? (p.kind === "student" ? "Student" : "Member") : "Not matched", "Student / member no": p ? (p.kind === "member" ? MC.prettyNo(p.key) : p.key) : "", Name: p?.name || "",
      "Xero contact": i.contact.name, "Account no": i.contact.accountNumber, Invoice: i.number, Reference: i.reference, Date: i.date, "Due date": i.dueDate,
      Total: i.total, Paid: i.paid, "Amount due": i.due, Description: (i.lines || []).join("; ") }; });
    xlsxDownload(rows, "Outstanding", `xero-outstanding-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  fx(box, ".none");
}

/* a "Finance · Xero" card on student and member pages */
function financeCard(kind, key) {
  if (!DB.xero) return "";
  const g = xeroFor(kind, key);
  return `<div class="card xcard"><div class="sec-h"><h2>Finance · Xero</h2><span class="muted">synced ${ago(DB.xero.syncedAt)}</span></div>
    ${g ? `<div class="xtot"><b class="owe">${rs(g.due)}</b><span>outstanding on ${g.count} invoice${g.count === 1 ? "" : "s"}${g.overdue ? ` · ${rs(g.overdue)} overdue` : ""}</span></div>
      ${g.invoices.map(i => `<div class="xinv ${i.late ? "late" : ""}"><span><b>${esc(i.number || "Invoice")}</b>${i.reference ? " · " + esc(i.reference) : ""}<small>${esc(i.lines?.[0] || "")}</small></span><span class="muted">${i.dueDate ? "due " + fmtDay(i.dueDate) : fmtDay(i.date)}</span><b class="${i.late ? "owe" : ""}">${rs(i.due)}</b></div>`).join("")}`
      : `<div class="xtot"><b class="ok">Rs 0</b><span>no unpaid invoices in Xero</span></div>`}</div>`;
}
// Student money is kept on the Dues tab only — the student profile is for exam results and is not mixed with dues.
const _renderMemberProfileF = renderMemberProfile;
renderMemberProfile = function (m) {
  _renderMemberProfileF(m);
  const html = financeCard("member", m.no);
  if (html) $("#v-mprof .mmoney")?.insertAdjacentHTML("afterend", html);
};

/* navigation */
$("#rulesBtn")?.insertAdjacentHTML("beforebegin", `<button class="iconbtn" id="finBtn" aria-label="Finance" title="Finance (Xero)" style="margin-left:auto;margin-right:8px"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="13" rx="2.5"/><path d="M2 10h20M6 15h4"/></svg></button>`);
$("#finBtn")?.addEventListener("click", () => tab("fin"));
if ($("#finBtn") && $("#rulesBtn")) $("#rulesBtn").style.marginLeft = "0";
const _tabF = tab;
tab = function (name) {
  if (name !== "fin") { $("#v-fin").classList.add("hide"); return _tabF(name); }
  currentTab = "fin"; $$(".tabbar button").forEach(b => b.classList.remove("on")); moveGlider(); $(".tabbar .glider").style.width = "0px";
  scrollTo({ top: 0 }); try { sessionStorage.setItem("tab", "fin"); } catch { }
  renderFinance();
  xeroStatus().then(() => { if (currentTab === "fin") renderFinance(); });
};
$$(".tabbar button").forEach(b => b.onclick = () => tab(b.dataset.tab));

/* back from the Xero sign-in page */
(async () => {
  const p = new URLSearchParams(location.search).get("xero"); if (!p) return;
  history.replaceState(null, "", location.pathname);
  while (!DB) await new Promise(r => setTimeout(r, 50));
  await xeroStatus();
  if (p === "connected") { tab("fin"); toast("Connected to Xero — syncing…"); xeroSync(); }
  else { tab("fin"); toast(p.replace(/^error:/, "Xero: ")); }
})();
