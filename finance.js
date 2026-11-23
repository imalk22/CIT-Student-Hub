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

function renderFinance() {
  const keepQ = $("#finq")?.value || "";
  $$("main > .view").forEach(v => v.classList.add("hide"));
  const box = $("#v-fin"); box.classList.remove("hide");
  const X = DB.xero, F = finIndex(), S = XSTATUS || {};
  const sum = xs => xs.reduce((s, x) => s + x.due, 0);
  const stu = F ? dueGroups("student") : [], mem = F ? dueGroups("member") : [], unm = F ? unmatchedGroups() : [];
  const onVercel = S.site === "vercel";
  const conn = S.offline ? `<div class="note">Can't reach the Xero service right now.${X ? ` Showing the copy synced ${ago(X.syncedAt)}.` : ""}</div>`
    : onVercel && S.storage === false ? `<div class="note"><b>Storage isn't set up yet.</b> In Vercel → Storage, add <b>Upstash for Redis</b> (free), connect it to this project and redeploy — see README → <i>Xero on the Vercel site</i>.</div>`
    : !S.configured ? `<div class="note"><b>Xero isn't set up yet.</b> Add <code>XERO_CLIENT_ID</code> / <code>XERO_CLIENT_SECRET</code> ${onVercel ? "in Vercel → Settings → Environment Variables and redeploy" : "to <code>.env</code> and restart npm start"} — see README. Redirect URI to register in the Xero app: <code>${esc(S.redirect || "")}</code></div>`
    : !S.connected ? `<div class="xconn"><span>Xero is set up but not connected.</span><a class="btn primary small" href="/xero/connect">Connect to Xero</a></div>`
    : `<div class="xconn"><span>Connected to <b>${esc(S.tenant)}</b> · read-only · updates automatically every ${S.autoEveryMin || 10} min${X ? ` · last ${ago(X.syncedAt)}` : ""}${S.lastError ? ` · <span class="owe">last try failed: ${esc(S.lastError)}</span>` : ""}</span><span style="display:flex;gap:8px"><button class="btn small primary" id="xSync">Sync now</button><button class="btn small" id="xOff">Disconnect</button></span></div>`;
  const list = finSeg === "student" ? stu : finSeg === "member" ? mem : unm;
  box.innerHTML = `
    <div class="titlebar"><h1>Finance</h1><span style="display:flex;gap:12px">${X ? `<button class="link" id="xExport">Export to Excel</button>` : ""}${onVercel ? `<a class="link" href="/api/login?logout">Sign out</a>` : ""}</span></div>
    <p class="sub">Outstanding invoices from Xero${X ? ` · ${esc(X.tenant || "")} · synced ${new Date(X.syncedAt).toLocaleString("en-GB")}` : ""}</p>
    ${conn}
    ${F ? `<div class="dkpis">
      <div class="dkpi red"><small>Total unpaid</small><b>${rs(F.total)}</b><span>${X.invoices.length.toLocaleString()} invoices in Xero</span></div>
      <div class="dkpi orange"><small>Overdue</small><b>${rs(F.overdue)}</b><span>past the due date</span></div>
      <div class="dkpi blue"><small>Students</small><b>${rs(sum(stu))}</b><span>${plural(stu.length, "student")} owing</span></div>
      <div class="dkpi"><small>Members</small><b>${rs(sum(mem))}</b><span>${plural(mem.length, "member")} owing</span></div>
    </div>
    ${unm.length ? `<div class="note">${plural(F.unmatched.length, "invoice")} (${rs(sum(F.unmatched))}) from ${plural(unm.length, "Xero contact")} couldn't be linked to a student or member. Put the student / membership no in the contact's <b>Account number</b> (or name) in Xero and they'll match on the next sync.</div>` : ""}
    <div class="seg" id="finSeg" style="margin-top:14px">${[["student", "Students", stu.length], ["member", "Members", mem.length], ["none", "Not matched", unm.length]].map(([k, t, n]) => `<button data-s="${k}" class="${k === finSeg ? "on" : ""}">${t} <span class="muted">${n}</span></button>`).join("")}</div>
    <div class="dtools"><div class="search dsearch"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="finq" type="search" placeholder="Search name, number or invoice" autocomplete="off"></div></div>
    <div class="listhead"><span id="finCount"></span></div>
    <div class="dgrid" id="finList"></div>` : !S.offline && S.connected ? `<div class="card empty-hero" style="margin-top:14px"><b>Not synced yet</b><span>Press Sync now to read the outstanding invoices.</span></div>` : ""}`;
  const draw = () => {
    if (!F) return;
    const q = norm($("#finq").value);
    const rows = list.filter(d => !q || norm(d.name + " " + d.key + " " + d.sub + " " + d.inv.map(i => i.number + " " + i.reference + " " + i.contact.accountNumber).join(" ")).includes(q))
      .sort((a, b) => b.overdue - a.overdue || b.due - a.due);
    const what = finSeg === "student" ? "student" : finSeg === "member" ? "member" : "Xero contact";
    $("#finCount").textContent = `${plural(rows.length, what)} · ${rs(sum(rows))}${rows.length > 200 ? " · showing the first 200 — search to narrow down" : ""}`;
    $("#finList").innerHTML = rows.slice(0, 200).map(d => dueCardHtml(d)).join("") || `<div class="card empty dg-full">${finSeg === "none" ? "Every invoice is matched." : "Nothing outstanding."}</div>`;
    bindDueCards($("#finList"), rows);
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
    const P = new Map([...stu, ...mem].flatMap(d => d.inv.map(i => [i.id, d])));
    const rows = X.invoices.map(i => { const p = P.get(i.id); return {
      "Matched to": p ? (p.kind === "student" ? "Student" : "Member") : "Not matched", "Student / member no": p ? p.sub.split(" · ")[0] : "", Name: p?.name || "",
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
