/* CIT Student Hub — Members tab: fellows & associates, yearly membership fees, outstanding, photos from citsl.lk */
"use strict";
const MC = window.MembersCore;
const rs = n => "Rs " + Math.round(n || 0).toLocaleString("en-LK");
const CUR_YEAR = () => DB.members?.years?.includes(MC.fiscalYear()) ? MC.fiscalYear() : (DB.members?.years?.at(-1) || MC.fiscalYear());
const yLabel = y => y.before ? `${y.year} & before` : y.year;
const MSTATE = {
  paid: ["Paid up", "green"], current: [`This year due`, "orange"], arrears: ["Arrears", "red"], waived: ["W/O · no fee", "gray"],
  deceased: ["Deceased", "gray"], new: ["New member", "blue"],
};
let WEB = null;   // website directory {members:[{type,no,name,photo}]}
let mFilter = "all", mType = "All", mSort = "due", mProfileNo = null;

async function loadWeb(force) {
  try { const r = await fetch("/api/citsl-members" + (force ? "?refresh=1" : ""), { cache: "no-store" }); if (r.ok) { WEB = await r.json(); return WEB; } } catch { }
  try { WEB = await fetch("assets/citsl-members.json").then(r => r.json()); WEB.live = false; } catch { WEB = { members: [] }; }
  return WEB;
}
function webFor(m) {
  if (!WEB) return null;
  const last = s => MC.normNo ? String(s).toLowerCase().replace(/^(mr|mrs|ms|miss|dr|prof|rev)\.?\s*/i, "").replace(/[^a-z]/g, "") : s;
  return WEB.members.find(w => w.no && w.no === m.no) || (m.assocNo && WEB.members.find(w => w.no === m.assocNo))
    || WEB.members.find(w => !w.no && w.type === m.type && last(w.name) === last(m.name)) || null;
}
function avatarHtml(m, size = 44) {
  const w = webFor(m), ini = initials(m.name.replace(/[^A-Za-z\s.]/g, " ").replace(/\./g, " ")) || "?";
  const fb = `<span class="mav-ini" style="background:${color(m.name)}">${esc(ini)}</span>`;
  return `<span class="mav" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .36)}px">${w?.photo ? `<img src="${esc(w.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}${fb}</span>`;
}
/* fee-report members + details from the Members' Details / Last renewal / Fellow↔Associate files.
   Honorary Fellows and anyone missing from the fee report are added without a fee record. */
function MEMBERS() {
  const base = DB.members?.members || [], info = DB.memberInfo || { details: {}, lastRenewal: {}, fellowAssoc: {} };
  const seen = new Set(), out = [], rates = memberRates(), fillBlank = DB.settings?.fillBlankRates !== false;
  const enrich = m => {
    const d = info.details[m.no] || {};
    seen.add(m.no);
    m = MC.applyRates(m, rates, { fillBlank });
    return { ...m, fullName: d.fullName || m.fullName || "", email: m.email || d.email || "", phone: m.phone || d.phone || "",
      title: m.title || d.title || "", remark: [d.remark, d.comment].filter(Boolean).join(" · "), lastFY: info.lastRenewal[m.no] || "",
      assocNo: m.assocNo || info.fellowAssoc[m.no] || "" };
  };
  for (const m of base) out.push(enrich(m));
  for (const d of Object.values(info.details)) {
    if (seen.has(d.no) || !/^[FA]\d/.test(d.no)) continue;   // CIT members are Fellows and Associates only (HF rows are not shown)
    const type = d.no[0] === "F" ? "Fellow" : "Associate";
    out.push(enrich({ no: d.no, type, name: d.name || d.fullName, title: d.title, phone: "", email: "", assocNo: "", admitted: "",
      status: "active", honorary: type === "Honorary", noFeeRecord: type !== "Honorary", years: [], sheetTotal: null }));
  }
  return out;
}
function memberRates() { return DB.settings?.memberRates || MC.DEFAULT_RATES; }
function ratesCard() {
  const R = memberRates(), ms = MEMBERS(), CY = CUR_YEAR();
  const applied = ms.filter(m => m.years.some(y => y.rateApplied && y.year === CY));
  const carried = ms.filter(m => m.years.some(y => y.woCarried && y.year === CY)).length;
  const diff = ms.filter(m => m.years.some(y => y.rateDiff)).length;
  const af = applied.filter(m => m.type === "Fellow").length, aa = applied.length - af;
  return `<div class="card rates"><div class="sec-h"><h2>Fee rates by year</h2><button class="link" id="editRates">Edit</button></div>
    <table class="rtable"><tr><th>Membership year</th><th>Associate</th><th>Fellow</th><th></th></tr>
      ${Object.keys(R).sort().reverse().map(y => `<tr class="${y === CY ? "cur" : ""}"><td><b>${y}</b>${y === CY ? ` <span class="chip c-blue" style="font-size:10.5px">this year</span>` : ""}</td><td>${rs(R[y].Associate)}</td><td>${rs(R[y].Fellow)}</td>
        <td class="muted" style="font-size:11.5px">${R[y].src === "official" ? "official" : R[y].src === "report" ? "from fee report" : "edited"}</td></tr>`).join("")}</table>
    ${applied.length || carried || diff ? `<div class="note" style="margin:10px 0 0">
      ${applied.length ? `<b>${af} fellow${af === 1 ? "" : "s"}${aa ? ` and ${aa} associate${aa === 1 ? "" : "s"}` : ""}</b> have no ${CY} fee in the sheet — charged at the official rate. ` : ""}
      ${carried ? `<b>${carried}</b> were W/O last year, so the waiver carries over. ` : ""}
      ${diff ? `<b>${diff}</b> member${diff === 1 ? " has" : "s have"} a year charged differently from the rate — shown on their page.` : ""}
      ${DB.settings?.fillBlankRates === false ? "<br><b>Charging blank years is switched off.</b>" : ""}</div>` : ""}
  </div>`;
}
function editRates() {
  const R = structuredClone(memberRates()), years = Object.keys(R).sort();
  const nextYear = (() => { const l = years.at(-1); const s = +l.slice(0, 4) + 1; return `${s}/${String(s + 1).slice(-2)}`; })();
  openSheet(`<div class="bar-top"><b style="font-size:17px">Membership fee rates</b>${closeBtn}</div>
    <p class="sub" style="margin:0 0 10px">Annual subscription for each membership year (April – March).</p>
    <div class="card" style="padding:8px 14px"><table class="rtable" id="rtEdit"><tr><th>Year</th><th>Associate (Rs)</th><th>Fellow (Rs)</th></tr>
      ${years.slice().reverse().map(y => `<tr data-y="${y}"><td><b>${y}</b></td><td><input class="inp" type="number" data-t="Associate" value="${R[y].Associate}"></td><td><input class="inp" type="number" data-t="Fellow" value="${R[y].Fellow}"></td></tr>`).join("")}</table>
      <button class="link" id="rtAdd" style="margin:8px 0 6px">+ Add ${nextYear}</button></div>
    <label class="card form" style="display:flex;align-items:center;gap:12px;padding:14px 16px;margin-top:12px;cursor:pointer"><input type="checkbox" id="rtFill" ${DB.settings?.fillBlankRates === false ? "" : "checked"} style="width:20px;height:20px">
      <span><b>Charge the rate when the sheet has no fee</b><br><span class="muted">For years after a member joined. A W/O from the previous year carries over.</span></span></label>
    <div class="actions" style="justify-content:space-between"><button class="btn" id="rtReset">Reset to default</button><button class="btn primary" id="rtSave">Save</button></div>`);
  $("#rtAdd").onclick = () => { $("#rtEdit tr:nth-child(1)").insertAdjacentHTML("afterend", `<tr data-y="${nextYear}"><td><b>${nextYear}</b></td><td><input class="inp" type="number" data-t="Associate" value="${R[years.at(-1)].Associate}"></td><td><input class="inp" type="number" data-t="Fellow" value="${R[years.at(-1)].Fellow}"></td></tr>`); $("#rtAdd").remove(); };
  $("#rtReset").onclick = () => { DB.settings.memberRates = null; DB.settings.fillBlankRates = true; save(); closeSheet(); renderMembers(); toast("Rates reset to the default table"); };
  $("#rtSave").onclick = () => {
    const out = {};
    $$("#rtEdit tr[data-y]").forEach(tr => { const y = tr.dataset.y, a = +tr.querySelector('[data-t="Associate"]').value, f = +tr.querySelector('[data-t="Fellow"]').value;
      if (a && f) out[y] = { Associate: a, Fellow: f, src: R[y] && R[y].Associate === a && R[y].Fellow === f ? R[y].src : "edited" }; });
    DB.settings.memberRates = out; DB.settings.fillBlankRates = $("#rtFill").checked; save(); closeSheet(); renderMembers(); toast("Fee rates saved");
  };
}
MSTATE.honorary =["Honorary · no fee", "purple"]; MSTATE.norecord = ["Not in fee report", "gray"];
const standingRules = () => ({ ...MC.DEFAULT_STANDING, ...(DB.settings?.standing || {}) });
const acct = m => {
  const a = MC.account(m, CUR_YEAR());
  if (m.honorary) a.status = "honorary"; else if (m.noFeeRecord) a.status = "norecord";
  a.standing = MC.standing(m, CUR_YEAR(), standingRules());
  return a;
};
function memberStatusChip(m) {
  const a = acct(m);
  if (a.standing.state === "terminated") return `<span class="chip c-red" title="${a.standing.count} unpaid years">Terminated</span>`;
  if (a.standing.state === "suspended") return `<span class="chip c-orange" title="${a.standing.count} unpaid years — no slip until cleared">Suspended · ${a.standing.count} yrs</span>`;
  const [t, c] = MSTATE[a.status]; return `<span class="chip c-${c}">${a.status === "current" ? CUR_YEAR() + " due" : t}</span>`;
}
function yearDots(m) {
  return `<span class="ydots">${m.years.map(y => `<i class="yd ${y.state}" title="${esc(yLabel(y))}: ${y.state === "waived" ? "W/O" : y.state === "none" ? "—" : y.due ? "due " + rs(y.due) : "paid"}"></i>`).join("")}</span>`;
}

/* ---------- list view ---------- */
function filteredMembers() {
  const q = ($("#mq")?.value || "").trim(), ql = q.toLowerCase(), toks = norm(q).split(" ").filter(Boolean), dq = digits(q);
  let list = MEMBERS().filter(m => mType === "All" || m.type === mType);
  list = list.filter(m => {
    const a = acct(m);
    switch (mFilter) {
      case "owing": return a.total > 0;
      case "current": return a.current > 0;
      case "arrears": return a.arrears > 0;
      case "paid": return a.status === "paid";
      case "waived": return a.status === "waived";
      case "new": return a.status === "new";
      case "deceased": return a.status === "deceased";
      case "honorary": return a.status === "honorary";
      case "suspended": return a.standing.state === "suspended";
      case "terminated": return a.standing.state === "terminated";
      default: return a.status !== "deceased" && a.standing.state !== "terminated";
    }
  });
  if (q) list = list.filter(m => m.no.toLowerCase() === ql.replace(/[\s-]/g, "") || MC.normNo(q) === m.no || m.assocNo === MC.normNo(q) ||
    (m.email && m.email.toLowerCase().includes(ql) && ql.length > 2) || (dq.length >= 6 && digits(m.phone).includes(dq.slice(-9))) ||
    (toks.length && toks.every(t => norm(m.name + " " + (m.fullName || "")).includes(t))));
  const by = { due: (a, b) => acct(b).total - acct(a).total || a.no.localeCompare(b.no), no: (a, b) => a.no.localeCompare(b.no, undefined, { numeric: true }), name: (a, b) => a.name.localeCompare(b.name) }[mSort];
  return list.sort(by);
}
function renderMembers() {
  const box = $("#v-mem");
  if (!MEMBERS().length && window.SEEDING) {
    box.innerHTML = `<h1>Members</h1><div class="card empty-hero" style="margin-top:18px"><span class="spin" style="width:26px;height:26px;border-width:3px"></span><b>Loading member data…</b><span>Reading the membership files kept with the app.</span></div>`;
    return;
  }
  if (!MEMBERS().length) {
    box.innerHTML = `<h1>Members</h1><p class="sub">Fellow and associate members, their yearly fees and what is outstanding.</p>
      <div class="card drop" id="memDrop"><div class="dropicon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3 2.6 3 6"/></svg></div>
        <b>Import the membership fee report</b><span>Drop the Excel with the Fellow and Associate sheets, or <label class="link">choose a file<input type="file" id="memFile" accept=".xlsx,.xls" hidden></label></span></div>`;
    bindMemDrop(); return;
  }
  const CY = CUR_YEAR(), all = MEMBERS().filter(m => mType === "All" || m.type === mType);
  const FR = DB.members || { years: [], payments: [], file: "", importedAt: 0 };
  const S = MC.summary(all.filter(m => !m.honorary && !m.noFeeRecord), CY);
  const pct = S.currentExpected ? 100 * S.currentCollected / S.currentExpected : 0;
  const circ = 2 * Math.PI * 52, off = circ * (1 - pct / 100);
  const years = FR.years.map(y => S.byYear[y]).filter(Boolean);
  const maxExp = Math.max(1, ...years.map(y => y.expected));
  const pays = (FR.payments || []).filter(p => mType === "All" || (p.no[0] === (mType === "Fellow" ? "F" : "A"))).slice().sort((a, b) => b.date.localeCompare(a.date));
  const hon = MEMBERS().filter(m => m.honorary).length;
  const chips = [["all", "All active"], ["owing", "Owing"], ["current", `${CY} unpaid`], ["arrears", "Arrears"], ["paid", "Paid up"], ["waived", "W/O"], ["new", "New"], ["suspended", "Suspended"], ["terminated", "Terminated"], ["deceased", "Deceased"], ...(hon ? [["honorary", "Honorary"]] : [])];
  box.innerHTML = `
    <div class="titlebar"><h1>Members</h1><label class="btn small">Update Excel<input type="file" id="memFile" accept=".xlsx,.xls" hidden></label></div>
    <p class="sub">Membership year <b>${CY}</b>${FR.file ? ` · ${esc(FR.file)} · imported ${new Date(FR.importedAt).toLocaleDateString("en-GB")}` : " · fee report not imported yet"}${WEB ? ` · photos from citsl.lk${WEB.live ? "" : " (saved copy)"}` : ""}</p>
    <div class="spotbox mspot" id="mspot">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="mq" type="search" placeholder="Find a member — name, F 014 / A 352, email or phone" autocomplete="off" autocapitalize="off" spellcheck="false"><kbd>/</kbd>
    </div>
    <div class="seg" id="mTypeSeg" style="margin-top:14px">${["All", "Fellow", "Associate", ...(hon ? ["Honorary"] : [])].map(t => `<button class="${t === mType ? "on" : ""}" data-t="${t}">${t === "All" ? "All members" : t === "Honorary" ? "Honorary" : t + "s"}</button>`).join("")}</div>

    <div id="mDash">
    ${(() => {   // hero with three rings + KPI cards with trend lines
      const ys = FR.years.map(y => S.byYear[y]).filter(Boolean);
      const past = ys.filter(y => y.year !== CY), pastExp = past.reduce((s, y) => s + y.expected, 0), pastCol = past.reduce((s, y) => s + y.collected, 0);
      const active = S.members - S.waived, paidPct = active ? 100 * S.paidUp / active : 0, pastPct = pastExp ? 100 * pastCol / pastExp : 0;
      const rings = [[pct, "var(--green)", `${CY} collected`], [paidPct, "var(--blue)", "Members paid up"], [pastPct, "var(--orange)", "Past years collected"]];
      const R = [60, 45, 30];
      const prev = ys.at(-2), dueTrend = ys.map(y => y.due), colTrend = ys.map(y => y.collected);
      return `<div class="card mhero2"><div class="mh-text"><div class="kicker">Membership · ${CY}</div><h3>Subscription collection</h3>
          <p><b>${rs(S.currentCollected)}</b> collected of ${rs(S.currentExpected)} expected this year — <b>${rs(S.currentExpected - S.currentCollected)}</b> still to come in.
            ${S.owing} of ${S.members} active members owe fees, ${rs(S.outstanding)} in total.</p>
          <div class="hchips"><span>${S.fellows} fellows</span><span>${S.associates} associates</span><span>${S.paidUp} paid up</span><span>${S.waived} W/O</span>${S.deceased ? `<span>${S.deceased} deceased</span>` : ""}</div></div>
        <div class="mh-rings"><svg viewBox="0 0 150 150">${rings.map(([p, c], k) => { const ci = 2 * Math.PI * R[k], of = ci * (1 - Math.min(100, p) / 100);
            return `<circle class="rtrack" cx="75" cy="75" r="${R[k]}" stroke="${c}" stroke-width="12"/><circle class="ring" cx="75" cy="75" r="${R[k]}" stroke="${c}" stroke-width="12" stroke-dasharray="${ci.toFixed(1)}" stroke-dashoffset="${of.toFixed(1)}" style="--c:${ci.toFixed(1)};animation-delay:${.25 + k * .12}s"/>`; }).join("")}</svg>
          <div class="rlegend">${rings.map(([p, c, l]) => `<div><i style="background:${c}"></i>${l}<b data-p="${p}">0%</b></div>`).join("")}</div></div></div>
      <div class="kpi4">
        <div class="card kpi" style="--ac:var(--blue)"><div class="kl">Active members</div><div class="kr"><div class="kv" data-v="${S.members}">0</div><span class="kd">${S.deceased ? S.deceased + " deceased" : "members"}</span></div>
          <div class="kn">${S.fellows} fellows · ${S.associates} associates</div><div class="stack"><i style="width:${(100 * S.fellows / Math.max(1, S.members)).toFixed(1)}%;background:#d4a537"></i><i style="flex:1;background:var(--blue)"></i></div></div>
        <div class="card kpi" style="--ac:var(--red)"><div class="kl">Total outstanding</div><div class="kr"><div class="kv" data-m="${S.outstanding}">0</div><span class="kd bad">${S.owing} owe</span></div>
          <div class="kn">all years together</div>${spark(dueTrend, "var(--red)")}</div>
        <div class="card kpi" style="--ac:var(--orange)"><div class="kl">Arrears · past years</div><div class="kr"><div class="kv" data-m="${S.arrears}">0</div><span class="kd">before ${CY}</span></div>
          <div class="kn">due per year since ${FR.years[0] || ""}</div>${spark(dueTrend.slice(0, -1), "var(--orange)")}</div>
        <div class="card kpi" style="--ac:var(--green)"><div class="kl">Collected · ${CY}</div><div class="kr"><div class="kv" data-m="${S.currentCollected}">0</div><span class="kd good">${Math.round(pct)}%</span></div>
          <div class="kn">${rs(S.currentDue)} still due this year</div>${spark(colTrend, "var(--green)")}</div>
      </div>`;
    })()}

    <div class="mgrid2">
      <div class="card"><div class="sec-h"><h2>Collection by year</h2><span class="muted">collected / expected</span></div>
        <div class="ybars">${years.map(y => { const p = y.expected ? 100 * y.collected / y.expected : 0;
          return `<div class="ybar"><span class="yl">${y.year === FR.years[0] ? y.year + "≤" : y.year}</span><div class="yt"><i style="width:${(100 * y.expected / maxExp).toFixed(1)}%"><b style="width:${p.toFixed(1)}%"></b></i></div>
          <span class="yv">${Math.round(p)}%</span><span class="yd2">${y.due ? rs(y.due) + " due" : "—"}</span></div>`; }).join("")}</div></div>
      <div class="card"><div class="sec-h"><h2>Latest payments</h2><span class="muted">${pays.length} logged</span></div>
        <div class="plist">${pays.slice(0, 7).map(p => `<button class="prow" data-no="${esc(p.no)}"><span class="pd">${esc(p.date ? new Date(p.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "")}</span>
          <span class="pn2"><b>${esc(MC.prettyNo(p.no))} · ${esc(p.name || MEMBERS().find(m => m.no === p.no)?.name || "")}</b><small>${esc(p.remark || p.method)}</small></span><span class="pa">${rs(p.amount)}</span></button>`).join("") || `<div class="empty">No payment log yet.</div>`}</div></div>
    </div>
    ${standingCard(all)}
    ${ratesCard()}
    </div>

    <div class="h2row" id="mDirHead"><h2>Directory</h2><div style="display:flex;gap:8px;align-items:center"><select class="inp" id="mSort" style="width:auto"><option value="due">Highest outstanding</option><option value="no">Member no</option><option value="name">Name</option></select><button class="link" id="mExport">Export</button></div></div>
    <div class="chips-row" id="mChips">${chips.map(([k, t]) => `<button data-f="${k}" class="${k === mFilter ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="listhead"><span id="mCount"></span><span class="ylegend"><i class="yd paid"></i>paid <i class="yd partial"></i>part <i class="yd unpaid"></i>due <i class="yd waived"></i>W/O</span></div>
    <div class="mlist" id="mList"></div>`;
  $("#mSort").value = mSort;
  $$("#v-mem .kpi [data-v]").forEach(b => countUp(b, +b.dataset.v));
  $$("#v-mem .kpi [data-m]").forEach(b => countUpMoney(b, +b.dataset.m));
  $$("#v-mem .mh-rings [data-p]").forEach(b => countUp(b, +b.dataset.p, { suf: "%", dur: 1500 }));
  $("#mTypeSeg").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { mType = b.dataset.t; renderMembers(); } };
  $("#mChips").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { mFilter = b.dataset.f; $$("#mChips button").forEach(x => x.classList.toggle("on", x === b)); renderMemberList(); } };
  $("#mq").oninput = renderMemberList;
  $("#mq").onkeydown = e => {
    if (e.key === "Enter") { const first = $("#mList .mcard"); if (first) openMember(first.dataset.no); }
    if (e.key === "Escape") { $("#mq").value = ""; renderMemberList(); }
  };
  if (matchMedia("(pointer:fine)").matches) setTimeout(() => $("#mq")?.focus({ preventScroll: true }), 60);
  $("#mSort").onchange = e => { mSort = e.target.value; renderMemberList(); };
  $("#mExport").onclick = exportMembers;
  if ($("#editRates")) $("#editRates").onclick = editRates;
  $$("#v-mem [data-stand]").forEach(b => b.onclick = () => openStanding(b.dataset.stand));
  $$("#v-mem .prow").forEach(b => b.onclick = () => openMember(b.dataset.no));
  bindMemDrop();
  fx($("#v-mem"), ".none");
  renderMemberList();
}
function countUpMoney(el, v) {
  if (REDUCED) { el.textContent = rs(v); return; }
  const t0 = performance.now(), step = t => { const p = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - p, 4); el.textContent = rs(v * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderMemberList() {
  const searching = !!$("#mq").value.trim();
  $("#mDash").classList.toggle("hide", searching);
  $("#mspot").classList.toggle("typing", searching);
  const list = filteredMembers(), shown = list.slice(0, 120), total = list.reduce((s, m) => s + acct(m).total, 0);
  $("#mCount").textContent = `${searching ? "Search · " : ""}${list.length} member${list.length === 1 ? "" : "s"}${total ? " · " + rs(total) + " outstanding" : ""}${searching && list.length ? " · ↵ opens the first" : ""}`;
  $("#mList").innerHTML = shown.map((m, i) => { const a = acct(m);
    return `<button class="card mcard" data-no="${esc(m.no)}" style="--i:${Math.min(i, 14)}">
      <div class="mc-top">${avatarHtml(m)}<div class="mc-id"><b>${esc((m.title ? m.title + " " : "") + m.name)}</b><span><span class="mtype ${m.type[0]}">${m.type}</span>${esc(MC.prettyNo(m.no))}${m.phone && searching ? " · " + esc(m.phone) : ""}</span></div>${memberStatusChip(m)}</div>
      <div class="mc-bot">${m.years.length ? yearDots(m) : `<span class="muted" style="font-size:12px">${m.honorary ? "Honorary member" : "No fee record"}</span>`}<span class="mc-amt ${a.total ? "owe" : ""}">${a.status === "deceased" ? "—" : a.total ? rs(a.total) : a.status === "waived" ? "No fee" : a.status === "honorary" || a.status === "norecord" ? "" : "Paid"}</span></div>
    </button>`; }).join("") + (list.length > shown.length ? `<div class="empty">${list.length - shown.length} more — type to narrow down</div>` : "") || `<div class="card empty">No members match.</div>`;
  $$("#mList .mcard").forEach(c => { c.classList.add("tilt"); c.onclick = () => openMember(c.dataset.no); });
}
function exportMembers() {
  const CY = CUR_YEAR(), rows = filteredMembers().map(m => { const a = acct(m), r = {
    "Membership No": MC.prettyNo(m.no), "Type": m.type, "Title": m.title, "Name": m.name, "Email": m.email, "Phone": m.phone,
    "Status": MSTATE[a.status][0], [`${CY} fee`]: a.currentFee, [`${CY} paid`]: a.currentPaid, [`${CY} due`]: a.current, "Arrears": a.arrears, "Total outstanding": a.total,
    "Years unpaid": a.unpaidYears.join(", "), "Standing": { suspended: "Suspended", terminated: "Terminated", good: "Good", na: "" }[a.standing.state] }; return r; });
  if (!rows.length) return toast("Nothing to export");
  xlsxDownload(rows, "Members", `members-${mFilter}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ---------- import ---------- */
function bindMemDrop() {
  const f = $("#memFile"); if (f) f.onchange = e => { const x = e.target.files[0]; e.target.value = ""; if (x) importMembers(x); };
  const d = $("#memDrop"); if (!d) return;
  ["dragenter", "dragover"].forEach(t => d.addEventListener(t, e => { e.preventDefault(); d.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => d.addEventListener(t, e => { e.preventDefault(); d.classList.remove("over"); }));
  d.addEventListener("drop", e => { const x = e.dataTransfer.files[0]; if (x) importMembers(x); });
}
async function importMembers(file, silent) {
  let wb; try { busy(true); wb = await readSheetFile(file); } catch (e) { return silent ? null : toast(e.message); } finally { busy(false); }
  const R = MC.parseWorkbook(XLSX, wb, file.name);
  if (!R.members.length) return silent ? null : toast("No Fellow / Associate sheets found in that file");
  const prev = DB.members?.members?.length;
  DB.members = R; save();
  if (silent) return;
  const f = R.members.filter(m => m.type === "Fellow").length, a = R.members.length - f;
  toast(`${prev ? "Updated" : "Imported"}: ${f} fellows · ${a} associates · ${R.payments.length} payments`);
  renderMembers();
}

/* ---------- member profile ---------- */
function openMember(no) {
  const m = MEMBERS().find(x => x.no === no);
  if (!m) return toast(`${MC.prettyNo(no)} is not in the imported fee report`);
  if ($("#sheet").classList.contains("on")) closeSheet();
  mProfileNo = no;
  $$("main > .view").forEach(v => v.classList.add("hide"));
  $("#v-mprof").classList.remove("hide");
  currentTab = "mem"; $$(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === "mem")); moveGlider();
  renderMemberProfile(m); scrollTo({ top: 0 });
}
function reminderText(m) {
  const a = acct(m), CY = CUR_YEAR();
  const lines = m.years.filter(y => y.due > 0).map(y => `  • ${yLabel(y)}: ${rs(y.due)}`);
  return `Dear ${m.title ? m.title + " " : ""}${m.name},

This is a kind reminder about your ${m.type} Membership subscription with the Chartered Institute of Taxation of Sri Lanka (Membership No ${MC.prettyNo(m.no)}).

Our records show the following outstanding:
${lines.join("\n")}
Total due: ${rs(a.total)}

If you have already paid, please share the payment details so we can update our records. Thank you.

Chartered Institute of Taxation of Sri Lanka`;
}
function renderMemberProfile(m) {
  const a = acct(m), w = webFor(m), CY = CUR_YEAR(), hue = color(m.name);
  const pays = (DB.members?.payments || []).filter(p => p.no === m.no).sort((x, y) => y.date.localeCompare(x.date));
  const emails = [...new Set(m.email.split(/[;,/\s]+/).filter(isEmail))];
  const answer = m.honorary ? "Honorary Fellow — no membership fee." : m.noFeeRecord ? "Not in the membership fee report — check the fee sheet."
    : a.status === "deceased" ? "Deceased member — no fees." : a.status === "waived" ? `Fee waived (W/O) — no payment needed for ${CY}.`
    : a.status === "new" ? "Newly admitted — not in the fee sheet yet." : a.total <= 0 ? `Paid up, including ${CY}.`
      : `Owes ${rs(a.total)} — ${m.years.filter(y => y.due > 0).map(y => `${y.year} (${rs(y.due)})`).join(", ")}.`;
  const sheetNote = m.sheetTotal != null && m.status !== "deceased" && Math.abs(m.sheetTotal - a.total) > .5 && Math.abs(m.sheetTotal - a.arrears) > .5
    ? `<div class="note">The Excel's “Balance Due Total” for this member says ${rs(m.sheetTotal)}, but the year columns add up to ${rs(a.arrears)} in arrears${a.current ? ` + ${rs(a.current)} for ${CY}` : ""}. Worth checking the sheet.</div>` : "";
  const ph = m.phone ? phoneKey(m.phone) : "";
  $("#v-mprof").innerHTML = `
    <button class="back" id="mBack">${I.back}Members</button>
    <div class="card pass" style="--hue:${m.type === "Associate" ? "#0a66c2" : m.honorary ? "#7d3cc8" : "#b8860b"}">
      <div class="pass-band ${m.type === "Fellow" ? "gold" : ""}"></div>
      <div class="pass-main">
        <div class="mphoto">${w?.photo ? `<img src="${esc(w.photo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}<span style="background:${hue}">${esc(initials(m.name.replace(/\./g, " ")) || "?")}</span></div>
        <div class="pass-id">
          <div class="mbadge ${m.type[0]}">${m.type} Member</div>
          <h1 class="pname">${esc((m.title ? m.title + " " : "") + m.name)}</h1>
          ${m.fullName && norm(m.fullName) !== norm(m.name) ? `<div class="pinit">${esc(m.fullName)}</div>` : ""}
          <div class="pnums"><span class="num" data-copy="${esc(MC.prettyNo(m.no))}">${esc(m.no.replace(/^(HF|F|A)/, "$1 "))}</span>${m.assocNo ? `<span class="num ghost" title="Associate membership no">was ${esc(MC.prettyNo(m.assocNo))}</span>` : ""}${m.admitted ? `<span class="num ghost">Admitted ${esc(m.admitted)}</span>` : ""}${m.lastFY ? `<span class="num ghost" title="Last renewal (Membership Last Renewal file)">Last renewed ${esc(m.lastFY)}</span>` : ""}${memberStatusChip(m)}</div>
        </div>
      </div>
      <div class="answer"><div class="ans-k">Membership fees</div><div class="ans-t">${esc(answer)}</div>
        <div class="ans-acts">
          ${a.total > 0 ? `<button class="btn small primary" id="mRem">${I.copy}Copy reminder</button>${emails[0] ? `<a class="btn small" href="mailto:${esc(emails.join(","))}?subject=${encodeURIComponent("Membership subscription reminder – " + MC.prettyNo(m.no))}&body=${encodeURIComponent(reminderText(m))}">${I.mail}Email reminder</a>` : ""}` : ""}
          ${ph ? `<a class="btn small" href="https://wa.me/94${ph}" target="_blank" rel="noopener">${I.wa}WhatsApp</a>` : ""}
          <a class="btn small" href="https://citsl.lk/${m.type === "Fellow" ? "fellow" : "associate"}-members" target="_blank" rel="noopener">citsl.lk ↗</a>
        </div></div>
    </div>
    ${standingBanner(m, a)}
    ${sheetNote}
    <div class="mmoney">
      <div class="card"><small>${CY} fee</small><b>${a.status === "waived" ? "W/O" : rs(a.currentFee)}</b><span>${a.currentPaid ? "paid " + rs(a.currentPaid) : a.status === "waived" ? "waived" : "not paid"}</span></div>
      <div class="card"><small>${CY} due</small><b class="${a.current ? "owe" : ""}">${rs(a.current)}</b><span>this year</span></div>
      <div class="card"><small>Arrears</small><b class="${a.arrears ? "owe" : ""}">${rs(a.arrears)}</b><span>${a.unpaidYears.filter(y => y !== CY).length} past year${a.unpaidYears.filter(y => y !== CY).length === 1 ? "" : "s"}</span></div>
      <div class="card tot"><small>Total outstanding</small><b class="${a.total ? "owe" : "ok"}">${rs(a.total)}</b><span>paid so far ${rs(a.paidTotal)}</span></div>
    </div>
    <div class="pgrid">
      <div class="pcol">
        <div class="card contact"><div class="sec-h"><h2>Contact</h2></div>
          ${emails.map(e => `<div class="crow"><span class="cic">${I.mail}</span><div><small>Email</small><a href="mailto:${esc(e)}">${esc(e)}</a></div><button class="cbtn" data-copy="${esc(e)}">${I.copy}</button></div>`).join("")}
          ${m.phone ? `<div class="crow"><span class="cic">${I.phone}</span><div><small>Phone</small><a href="tel:+94${ph}">${esc(m.phone)}</a></div><button class="cbtn" data-copy="${esc(m.phone)}">${I.copy}</button></div>` : ""}
          ${!emails.length && !m.phone ? `<div class="empty" style="padding:14px 4px">No contact details on file.</div>` : ""}
          ${m.remark ? `<div class="note" style="margin:8px 0 0">${esc(m.remark)}</div>` : ""}
        </div>
        <div class="card"><div class="sec-h"><h2>Payments logged</h2></div>
          ${pays.length ? pays.map(p => `<div class="crow"><span class="cic" style="color:var(--green)">${I.check}</span><div><small>${esc(p.date)} · ${esc(p.method || "")}</small><b>${rs(p.amount)}</b><small>${esc(p.remark)}</small></div></div>`).join("") : `<div class="empty" style="padding:14px 4px">No entries in the payment log.</div>`}
        </div>
      </div>
      <div class="pcol wide">
        <div class="card"><div class="sec-h"><h2>Year by year</h2><span class="muted">${m.years.length} years</span></div>
          <div class="ledger">${m.years.slice().reverse().map((y, i) => `<div class="lg-y ${y.state}${y.year === CY ? " cur" : ""}" style="--n:${i}">
            <div class="lg-h"><b>${esc(yLabel(y))}</b><span>${y.state === "waived" ? "W/O" : y.state === "none" ? "—" : y.state === "paid" ? "Paid" : y.state === "partial" ? "Part paid" : "Unpaid"}</span></div>
            ${y.state === "waived" ? `<div class="lg-n">No fee</div>` : y.state === "none" ? `<div class="lg-n">Not charged</div>` : `<div class="lg-r"><span>Fee</span><b>${rs(y.fee)}</b></div><div class="lg-r"><span>Paid</span><b>${rs(y.paid)}</b></div><div class="lg-r due"><span>Due</span><b>${rs(y.due)}</b></div>`}
            ${y.rateApplied ? `<div class="lg-flag">Not in the sheet — official rate</div>` : ""}${y.woCarried ? `<div class="lg-flag">W/O carried from the previous year</div>` : ""}${y.rateDiff ? `<div class="lg-flag warn">Sheet charged ${rs(y.fee)} · rate is ${rs(y.rateDiff)}</div>` : ""}
            ${y.remark ? `<div class="lg-m" title="${esc(y.remark)}">${esc(y.remark)}</div>` : ""}</div>`).join("") || `<div class="empty">No fee history yet.</div>`}</div></div>
      </div>
    </div>`;
  fx($("#v-mprof"), ".lg-y");
  $("#mBack").onclick = () => tab("mem");
  if ($("#mRem")) $("#mRem").onclick = () => copyText(reminderText(m), "Reminder copied — paste it in email or WhatsApp");
  $$("#v-mprof [data-copy]").forEach(b => b.onclick = e => { e.preventDefault(); copyText(b.dataset.copy, "Copied " + b.dataset.copy); });
}

/* Members have their own lookup (top of the Members tab). "/" there focuses member search, not student search. */
addEventListener("keydown", e => {
  if (e.key !== "/" || e.target.closest("input, textarea, select") || $("#sheet").classList.contains("on")) return;
  if (currentTab !== "mem") return;
  e.stopImmediatePropagation(); e.preventDefault();
  if ($("#v-mem").classList.contains("hide")) tab("mem");
  setTimeout(() => { $("#mq")?.focus(); $("#mq")?.select(); }, 30);
}, true);

/* ---------- wire into navigation ---------- */
const _tab = tab;
tab = function (name) {
  if (name === "mstand") { $("#v-mem").classList.add("hide"); $("#v-mprof").classList.add("hide"); return renderStandingView(); }
  $("#v-mstand").classList.add("hide");
  if (name === "mem" || name === "mprof") {
    $$("main > .view").forEach(v => v.classList.add("hide"));
    $("#v-mem").classList.remove("hide"); currentTab = "mem";
    $$(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === "mem")); moveGlider(); scrollTo({ top: 0 });
    try { sessionStorage.setItem("tab", "mem"); } catch { }
    renderMembers();
    if (!WEB) loadWeb().then(() => { if (currentTab === "mem" && !$("#v-mem").classList.contains("hide")) renderMembers(); });
    return;
  }
  $("#v-mem").classList.add("hide"); $("#v-mprof").classList.add("hide");
  _tab(name);
};
$$(".tabbar button").forEach(b => b.onclick = () => tab(b.dataset.tab));
loadWeb();
