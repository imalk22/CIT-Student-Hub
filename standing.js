/* CIT Student Hub — member standing: Suspended (2+ unpaid years, no membership slip / receipt until arrears are
   cleared) and Terminated (5+ unpaid years). Rules live in DB.settings.standing and can be changed on the page. */
"use strict";
let standTab = "terminated";

function standingLists() {
  const all = MEMBERS().map(m => ({ m, a: acct(m) }));
  return { suspended: all.filter(x => x.a.standing.state === "suspended"), terminated: all.filter(x => x.a.standing.state === "terminated") };
}

/* card on the Members dashboard */
function standingCard() {
  const L = standingLists(), R = standingRules();
  const sum = xs => xs.reduce((s, x) => s + x.a.total, 0);
  return `<div class="card standcard"><div class="sec-h"><h2>Member standing</h2><span class="muted">${R.suspendAt}+ unpaid years = suspended · ${R.terminateAt}+ = terminated</span></div>
    <div class="stand2">
      <button class="stbox sus" data-stand="suspended"><small>Suspended</small><b>${L.suspended.length}</b><span>${rs(sum(L.suspended))} owed · no slip until cleared</span></button>
      <button class="stbox ter" data-stand="terminated"><small>Terminated</small><b>${L.terminated.length}</b><span>${rs(sum(L.terminated))} owed · ${R.terminateAt}+ years unpaid</span></button>
    </div></div>`;
}

/* banner on a member's page */
function standingBanner(m, a) {
  const st = a.standing, R = standingRules();
  if (st.state === "terminated") return `<div class="standban ter"><b>Terminated</b><span>${st.count} membership years unpaid (${esc(st.unpaid.join(", "))}). ${R.terminateAt} or more unpaid years ends the membership. Do not issue a slip or receipt as an active member.</span></div>`;
  if (st.state === "suspended") return `<div class="standban sus"><b>Suspended — do not issue a slip</b><span>${st.count} membership years unpaid (${esc(st.unpaid.join(", "))}). No membership slip / receipt until ${rs(a.total)} is cleared. At ${R.terminateAt} unpaid years the membership is terminated${R.terminateAt - st.count === 1 ? " — one more unpaid year" : ""}.</span></div>`;
  return "";
}

function openStanding(which) { if (which) standTab = which; tab("mstand"); }

function renderStandingView() {
  $$("main > .view").forEach(v => v.classList.add("hide"));
  const box = $("#v-mstand"); box.classList.remove("hide");
  currentTab = "mem"; $$(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === "mem")); moveGlider(); scrollTo({ top: 0 });
  const L = standingLists(), R = standingRules(), list = L[standTab];
  const total = list.reduce((s, x) => s + x.a.total, 0), fel = list.filter(x => x.m.type === "Fellow").length;
  box.innerHTML = `
    <button class="back" id="stBack">${I.back}Members</button>
    <div class="titlebar"><h1>${standTab === "terminated" ? "Terminated members" : "Suspended members"}</h1><button class="btn small" id="stRules">Rules</button></div>
    <p class="sub">${standTab === "terminated"
      ? `${R.terminateAt} or more membership years unpaid. W/O years are not counted.`
      : `${R.suspendAt}–${R.terminateAt - 1} membership years unpaid — no membership slip / receipt until the arrears are cleared.`}</p>
    <div class="seg" id="stSeg"><button data-t="suspended" class="${standTab === "suspended" ? "on" : ""}">Suspended <span class="muted">${L.suspended.length}</span></button><button data-t="terminated" class="${standTab === "terminated" ? "on" : ""}">Terminated <span class="muted">${L.terminated.length}</span></button></div>
    <div class="kpi4" style="margin-top:14px">
      <div class="card kpi" style="--ac:${standTab === "terminated" ? "var(--red)" : "var(--orange)"}"><div class="kl">Members</div><div class="kr"><div class="kv">${list.length}</div></div><div class="kn">${fel} fellows · ${list.length - fel} associates</div></div>
      <div class="card kpi" style="--ac:var(--red)"><div class="kl">Owed by them</div><div class="kr"><div class="kv">${rs(total)}</div></div><div class="kn">all unpaid years together</div></div>
    </div>
    <div class="search" style="margin-top:14px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="stq" type="search" placeholder="Filter by name or member no" autocomplete="off"></div>
    <div class="listhead"><span id="stCount"></span><button class="link" id="stExport">Export to Excel</button></div>
    <div class="card list" id="stList"></div>`;
  const draw = () => {
    const q = norm($("#stq").value), rows = list.filter(x => !q || norm(x.m.no + " " + MC.prettyNo(x.m.no) + " " + x.m.name + " " + (x.m.fullName || "")).includes(q))
      .sort((x, y) => y.a.standing.count - x.a.standing.count || y.a.total - x.a.total);
    $("#stCount").textContent = `${rows.length} member${rows.length === 1 ? "" : "s"} · ${rs(rows.reduce((s, x) => s + x.a.total, 0))}`;
    $("#stList").innerHTML = rows.map(({ m, a }) => `<button class="row action" data-no="${esc(m.no)}">${avatarHtml(m, 36)}
      <span class="t"><b>${esc((m.title ? m.title + " " : "") + m.name)}</b><span>${esc(MC.prettyNo(m.no))} · ${m.type} · ${a.standing.count} yrs unpaid: ${esc(a.standing.unpaid.join(", "))}</span></span>
      <span class="stamt">${rs(a.total)}</span><span class="chev">›</span></button>`).join("") || `<div class="empty">No ${standTab} members.</div>`;
    $$("#stList [data-no]").forEach(b => b.onclick = () => openMember(b.dataset.no));
  };
  draw();
  $("#stq").oninput = draw;
  $("#stBack").onclick = () => tab("mem");
  $("#stSeg").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { standTab = b.dataset.t; renderStandingView(); } };
  $("#stExport").onclick = () => {
    const rows = list.map(({ m, a }) => ({ "Membership No": MC.prettyNo(m.no), Type: m.type, Title: m.title, Name: m.name, Email: m.email, Phone: m.phone,
      Standing: standTab === "terminated" ? "Terminated" : "Suspended", "Unpaid years": a.standing.count, "Years": a.standing.unpaid.join(", "), "Total outstanding": a.total }));
    if (!rows.length) return toast("Nothing to export");
    xlsxDownload(rows, standTab === "terminated" ? "Terminated" : "Suspended", `members-${standTab}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  $("#stRules").onclick = () => {
    openSheet(`<div class="bar-top"><b style="font-size:17px">Standing rules</b>${closeBtn}</div>
      <p class="muted">Counts membership years up to ${CUR_YEAR()} that still have a balance. W/O years and years with no charge don't count.</p>
      <div class="card form">
        <div class="field"><label>Suspend at (unpaid years)</label><input class="inp" id="stS" type="number" min="1" value="${R.suspendAt}"></div>
        <div class="field"><label>Terminate at (unpaid years)</label><input class="inp" id="stT" type="number" min="2" value="${R.terminateAt}"></div>
      </div>
      <div class="actions" style="justify-content:flex-end"><button class="btn" id="stDef">Defaults (2 / 5)</button><button class="btn primary" id="stSave">Save</button></div>`);
    const put = v => { DB.settings ||= {}; DB.settings.standing = v; save(); closeSheet(); renderStandingView(); toast("Standing rules saved"); };
    $("#stDef").onclick = () => put({ ...MC.DEFAULT_STANDING });
    $("#stSave").onclick = () => {
      const s = Math.max(1, +$("#stS").value | 0), t = +$("#stT").value | 0;
      if (t <= s) return toast("Terminate must be more years than suspend");
      put({ suspendAt: s, terminateAt: t });
    };
  };
  fx(box, ".none");
}
