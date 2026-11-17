/* CIT Student Hub — bulk import of the CIT document set + registration & renewal details on students */
"use strict";
const CD = window.CitDocs;
let REGS = new Map(), RENEW = new Map();
function indexDocs() {   // called from load() once DB exists, and after every import
  DB.registrations ||= []; DB.renewals ||= []; DB.memberInfo ||= { details: {}, lastRenewal: {}, fellowAssoc: {} };
  REGS = new Map(); RENEW = new Map();
  for (const r of DB.registrations) { const k = r.reg || "NOSRN:" + norm(r.fullName); if (!REGS.has(k)) REGS.set(k, []); REGS.get(k).push(r); }
  for (const p of DB.renewals) { if (!p.reg) continue; if (!RENEW.has(p.reg)) RENEW.set(p.reg, []); RENEW.get(p.reg).push(p); }
}
const regsFor = s => REGS.get(s.id.toUpperCase()) || REGS.get(s.id) || [];
const renewalsFor = s => RENEW.get(s.id.toUpperCase()) || [];
function studentRenewal(s) {
  if (!/^\d{4}\//.test(s.id)) return { state: "unknown", due: [], amount: 0 };
  const regs = regsFor(s);
  const regYear = +s.id.slice(0, 4) || +(regs.map(r => r.joined).filter(Boolean).sort()[0] || "").slice(0, 4) || null;
  const completed = s.summary?.some(m => m.level === "Advisory" && m.overall === "Completed");
  return CD.renewalStatus({ reg: s.id, regYear, payments: renewalsFor(s), completed });
}

/* apply registrations to the student list: contacts, and new students who have no results yet */
function applyRegistrations() {
  const byId = new Map(DB.students.map(s => [s.id.toUpperCase(), s]));
  let added = 0, enriched = 0;
  const ordered = DB.registrations.slice().sort((a, b) => (a.year || "").localeCompare(b.year || "") || (a.joined || "").localeCompare(b.joined || ""));
  for (const r of ordered) {
    let s = r.reg ? byId.get(r.reg) : DB.students.find(x => x.noSrn && norm(x.name) === norm(r.fullName));
    if (!s) {
      s = { id: r.reg || "NO-SRN-" + uid().slice(0, 5).toUpperCase(), name: r.fullName, index_nos: [], sittings: [], registeredOnly: true, noSrn: !r.reg };
      DB.students.push(s); if (r.reg) byId.set(r.reg, s); added++;
    } else if (s.missingName && r.fullName) { s.name = r.fullName; s.missingName = false; }
    setContact(s, { initials: r.initials, nic: r.nic, email: r.email, phone: r.mobile, whatsapp: r.whatsapp });
    enriched++;
  }
  return { added, enriched };
}

/* ---------- import (many files at once) ---------- */
async function importCitDocs(files, opts = {}) {
  const silent = !!opts.silent;
  files = [...files].filter(f => /\.(xlsx|xls|csv)$/i.test(f.name) && !f.name.startsWith("~$"));
  const skippedDocs = [...arguments[0]].filter(f => /\.(pdf|docx?)$/i.test(f.name)).length;
  if (!files.length) { if (!silent) toast("No Excel files in that selection"); return; }
  busy(true);
  const report = [];
  const newRegs = [], newRen = [];
  try {
    for (const f of files) {
      let wb; try { wb = await readSheetFile(f); } catch (e) { report.push([f.name, "error", e.message]); continue; }
      const r = CD.classify(XLSX, wb, f.name);
      if (r.kind === "registrations") { newRegs.push(...r.data.map(x => ({ ...x, src: f.name }))); report.push([f.name, "Registrations", `${r.data.length} students`]); }
      else if (r.kind === "renewals") { newRen.push(...r.data.map(x => ({ ...x, src: f.name }))); report.push([f.name, "Student renewals", `${r.data.length} payments`]); }
      else if (r.kind === "memberDetails") { for (const d of r.data) DB.memberInfo.details[d.no] = { ...DB.memberInfo.details[d.no], ...d }; report.push([f.name, "Member details", `${r.data.length} members`]); }
      else if (r.kind === "lastRenewal") { for (const d of r.data) DB.memberInfo.lastRenewal[d.no] = d.lastFY; report.push([f.name, "Member last renewal", `${r.data.length} members`]); }
      else if (r.kind === "fellowAssoc") { for (const d of r.data) DB.memberInfo.fellowAssoc[d.fellow] = d.assoc; report.push([f.name, "Fellow ↔ Associate no.", `${r.data.length} pairs`]); }
      else if (r.kind === "memberFees") { await importMembers(f, silent); report.push([f.name, "Membership fees", "loaded in Members"]); }
      else if (r.kind === "results") report.push([f.name, "Exam results", "skipped — use Import a results Excel for a new session"]);
      else if (r.kind === "policy") report.push([f.name, "Policy", "built into Rules & fees"]);
      else report.push([f.name, "Not recognised", "skipped"]);
    }
    if (newRegs.length) {
      const srcs = new Set(newRegs.map(r => r.src));
      DB.registrations = DB.registrations.filter(r => !srcs.has(r.src)).concat(newRegs);
    }
    if (newRen.length) {   // the two renewal files overlap: keep one row per payment, prefer rows that carry "Renewed Upto"
      const key = p => [p.date, p.reg || p.name, p.amount, p.ref].join("|");
      const m = new Map(DB.renewals.map(p => [key(p), p]));
      for (const p of newRen) { const k = key(p), o = m.get(k); if (!o || (!o.upto && p.upto)) m.set(k, p); }
      DB.renewals = [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
    }
    indexDocs();
    const ap = applyRegistrations();
    derive(); save();
    if (!silent) openSheet(`<div class="bar-top"><b style="font-size:17px">CIT documents imported</b>${closeBtn}</div>
      <div class="imp-sum"><div><b>${DB.registrations.length}</b><span>registrations</span></div><div><b>${ap.added}</b><span>new students added</span></div><div><b>${DB.renewals.length}</b><span>renewal payments</span></div><div><b>${Object.keys(DB.memberInfo.details).length}</b><span>member contacts</span></div></div>
      <div class="card list" style="margin-top:12px">${report.map(([f, k, n]) => `<div class="row" style="cursor:default"><div class="t"><b>${esc(k)}</b><span>${esc(f)}</span></div><span class="muted" style="text-align:right;max-width:45%">${esc(n)}</span></div>`).join("")}</div>
      ${skippedDocs ? `<p class="foot">${skippedDocs} PDF / Word documents are not imported — their rules and fees are already in <b>Rules &amp; fees</b>.</p>` : ""}`);
  } catch (e) { console.error(e); toast("Import failed: " + e.message); }
  finally { busy(false); }
  if (!silent) renderData();
}

/* ---------- Data tab card ---------- */
function renderDocsCard() {
  let box = $("#docsCard");
  if (!box) {
    $("#v-data .sub").insertAdjacentHTML("afterend", `<div class="card drop" id="docsCard"></div><div style="height:12px"></div>`);
    box = $("#docsCard");
    ["dragenter", "dragover"].forEach(t => box.addEventListener(t, e => { e.preventDefault(); box.classList.add("over"); }));
    ["dragleave", "drop"].forEach(t => box.addEventListener(t, e => { e.preventDefault(); box.classList.remove("over"); }));
    box.addEventListener("drop", e => { if (e.dataTransfer.files.length) importCitDocs(e.dataTransfer.files); });
  }
  const regN = DB.registrations.length, renN = DB.renewals.length, memN = Object.keys(DB.memberInfo.details).length;
  box.innerHTML = `<div class="dropicon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v5M9.5 13.5 12 11l2.5 2.5"/></svg></div>
    <b>Import CIT documents</b>
    <span>Registration masters, student renewals, members' details, last renewal year, fellow ↔ associate list and the membership fee report — drop many files at once,
      <label class="link">choose files<input type="file" id="docsFiles" accept=".xlsx,.xls" multiple hidden></label> or <label class="link">a whole folder<input type="file" id="docsFolder" webkitdirectory multiple hidden></label></span>
    ${regN || renN || memN ? `<div class="hchips" style="justify-content:center"><span>${regN} registrations</span><span>${renN} renewal payments</span><span>${memN} member contacts</span></div>` : ""}`;
  $("#docsFiles").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) importCitDocs(f); };
  $("#docsFolder").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) importCitDocs(f); };
}
const _renderData2 = renderData;
renderData = function () { _renderData2(); renderDocsCard(); showStorage(); };
async function showStorage() {
  const foot = $("#v-data > .foot"); if (!foot) return;
  const u = await storageUsage(), mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  const where = STORE_KIND === "indexeddb" ? "the browser database" : "browser storage (limited to about 5 MB)";
  foot.innerHTML = `Data is kept in ${where} on this computer${u && u.quota ? ` — using ${mb(u.used)} of ${mb(u.quota)} available` : ""}. Download a backup to move it to another computer.`;
}

/* ---------- student profile: registration + renewal cards ---------- */
const _renderProfile = renderProfile;
renderProfile = function (s) {
  _renderProfile(s);
  const regs = regsFor(s).slice().sort((a, b) => (b.joined || b.year || "").localeCompare(a.joined || a.year || ""));
  const rn = studentRenewal(s), pays = renewalsFor(s).slice().sort((a, b) => b.date.localeCompare(a.date));
  const col = $("#v-profile .pcol"); if (!col) return;
  const r0 = regs.find(r => r.address || r.mode) || regs[0];
  const stateTxt = { ok: ["Renewed", "green"], overdue: ["Renewal overdue", "red"], never: ["No renewal on record", "orange"], done: ["Course completed", "blue"], unknown: ["—", "gray"] }[rn.state];
  const renewalHtml = `<div class="card renew"><div class="sec-h"><h2>Student renewal</h2><span class="chip c-${stateTxt[1]}">${stateTxt[0]}</span></div>
    ${rn.state === "done" ? `<div class="muted">Completed the Advisory Level — no renewal fee.</div>` : rn.state === "unknown" ? `<div class="muted">No student number, so renewals cannot be checked.</div>` : `
      <div class="rn-big"><div><small>Renewed up to</small><b>${rn.upto || "—"}</b></div><div><small>${rn.due.length ? "Years due" : "Status"}</small><b class="${rn.due.length ? "owe" : "ok"}">${rn.due.length ? rn.due.join(", ") : "Up to date"}</b></div><div><small>Amount due</small><b class="${rn.amount ? "owe" : ""}">${rs(rn.amount)}</b></div></div>
      ${rn.state === "never" ? `<div class="note" style="margin:8px 0 0">No renewal payment found since registering in ${rn.base}. The amount assumes Rs 1,000/yr before 2023 and Rs 2,000/yr from 2023 (Re-joining policy).</div>` : ""}
      ${rn.due.length >= 2 ? `<button class="link" id="pRejoin" style="margin-top:8px">Estimate re-joining (batch transfer) fees ›</button>` : ""}`}
    ${pays.length ? `<small class="k">Payments</small>${pays.slice(0, 6).map(p => `<div class="crow"><span class="cic" style="color:var(--green)">${I.check}</span><div><small>${esc(p.date)}${p.ref ? " · " + esc(p.ref) : ""}</small><b>${rs(p.amount)}${p.upto ? ` <span class="muted">→ up to ${p.upto}</span>` : ""}</b></div></div>`).join("")}` : ""}
  </div>`;
  const regHtml = regs.length ? `<div class="card"><div class="sec-h"><h2>Registration</h2><span class="muted">${regs.length} record${regs.length === 1 ? "" : "s"}</span></div>
    ${regs.map(r => `<div class="crow"><span class="cic">${I.id}</span><div><small>${esc(r.joined ? new Date(r.joined).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : r.year)}${r.mode ? " · " + esc(r.mode) : ""}</small><b>${esc(r.level || "")} — ${esc(r.batch)}</b>${r.prevStatus ? `<small>${esc(r.prevStatus)}</small>` : ""}</div></div>`).join("")}
    ${r0?.address ? `<div class="crow"><span class="cic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span><div><small>Address</small><b style="white-space:normal">${esc(r0.address)}</b></div><button class="cbtn" data-copy2="${esc(r0.address)}">${I.copy}</button></div>` : ""}
  </div>` : "";
  col.insertAdjacentHTML("beforeend", renewalHtml + regHtml);
  $$("#v-profile [data-copy2]").forEach(b => b.onclick = () => copyText(b.dataset.copy2, "Address copied"));
  if (s.registeredOnly) $("#v-profile .ans-t").textContent = `Registered${regs[0] ? " for " + regs[0].level + " (" + regs[0].batch + ")" : ""} — no exam results yet.`;
  if ($("#pRejoin")) $("#pRejoin").onclick = () => openRejoin(s, rn, regs);
};
function openRejoin(s, rn, regs) {
  const start = regs.map(r => r.joined).filter(Boolean).sort().at(-1) || `${rn.upto || rn.base}-01-01`;
  const lv = regs[0]?.level || currentLevel(s)?.level || "Analyst 1";
  const draw = () => {
    const old = +$("#rjOld").value || 0, nw = +$("#rjNew").value || 0;
    const e = CD.rejoinEstimate({ renewalDue: rn.amount, startDate: $("#rjStart").value, oldCourseFee: old, newCourseFee: nw });
    $("#rjOut").innerHTML = `<div class="lg-r"><span>Unpaid renewals (${rn.due.join(", ")})</span><b>${rs(rn.amount)}</b></div>
      <div class="lg-r"><span>Re-joining fee (${e.years == null ? "?" : e.years.toFixed(1) + " years since course start"})</span><b>${rs(e.rejoinFee)}</b></div>
      <div class="lg-r"><span>Course fee difference ${e.redemptionRate != null && old ? `(new − ${Math.round(e.redemptionRate * 100)}% of old)` : "(enter fees)"}</span><b>${e.courseDiff != null ? rs(e.courseDiff) : "—"}</b></div>
      <div class="lg-r due" style="font-size:15px;border-top:.5px solid var(--line);margin-top:6px;padding-top:6px"><span>Estimated total</span><b>${rs(e.total)}</b></div>`;
  };
  openSheet(`<div class="bar-top"><b style="font-size:17px">Re-joining estimate</b>${closeBtn}</div>
    <p class="sub" style="margin:0 0 10px">${esc(s.name)} · from the CIT Re-joining policy. The redemption fee is not defined in the documents, so it is not included.</p>
    <div class="card form"><div class="field"><label>Course started</label><input id="rjStart" type="date" value="${esc(start)}"></div>
      <div class="field"><label>Old course fee paid</label><input id="rjOld" type="number" placeholder="e.g. 40000"></div>
      <div class="field"><label>Current course fee</label><input id="rjNew" type="number" value="${RULES.fees[lv]?.course || ""}"></div></div>
    <div class="card" style="margin-top:12px;padding:14px 16px" id="rjOut"></div>`);
  $$("#rjStart,#rjOld,#rjNew").forEach(i => i.oninput = draw); draw();
}

/* ---------- Insights: renewals card + Students filter ---------- */
const _filtered = filtered;
filtered = function () {
  if (fState !== "Renewal" && fState !== "NoResults") return _filtered();
  const keep = fState, list = (fState = "Any", _filtered()); fState = keep;
  return keep === "Renewal" ? list.filter(s => studentRenewal(s).state === "overdue").sort((a, b) => studentRenewal(b).amount - studentRenewal(a).amount) : list.filter(s => s.registeredOnly);
};
const _renderFilters = renderFilters;
renderFilters = function () {
  _renderFilters();
  if (!DB.renewals.length && !DB.registrations.length) return;
  $("#filters").insertAdjacentHTML("beforeend", `<span style="width:1px;background:var(--line);flex:none;margin:4px 2px"></span><button data-s="Renewal" class="${fState === "Renewal" ? "on" : ""}">Renewal overdue</button><button data-s="NoResults" class="${fState === "NoResults" ? "on" : ""}">Registered only</button>`);
};

/* ---------- always-on data: load the Excel files kept in student-hub/data-files (served only to this computer) ---------- */
window.SEEDING = true;
async function autoSeed() {
  let list = [];
  try { const r = await fetch("/api/seed", { cache: "no-store" }); if (r.ok) list = (await r.json()).files || []; } catch { }
  DB.seeded ||= {};
  const changed = list.filter(f => DB.seeded[f.name] !== f.mtime);
  if (!changed.length) return 0;
  const files = [];
  for (const f of changed) {
    try { const b = await fetch("/api/seed/" + encodeURIComponent(f.name), { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }); files.push(new File([b], f.name)); }
    catch (e) { console.warn("could not load", f.name, e); }
  }
  await importCitDocs(files, { silent: true });
  for (const f of changed) DB.seeded[f.name] = f.mtime;
  save();
  return files.length;
}
(async () => {
  while (!DB) await new Promise(r => setTimeout(r, 40));
  let n = 0;
  try { n = await autoSeed(); } catch (e) { console.error("auto-load failed", e); }
  window.SEEDING = false;
  if (n) {
    toast(`Loaded ${n} data file${n === 1 ? "" : "s"} — members, registrations and renewals are up to date`);
    if ($("#v-profile").classList.contains("hide") && $("#v-mprof").classList.contains("hide")) tab(currentTab || "home");
  } else if (currentTab === "mem" && !MEMBERS().length) renderMembers();
})();
