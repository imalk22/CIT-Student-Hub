/* CIT Student Hub — admission automation:
 *   admission Excel → exam with candidates → supervisor review → automatic email with the PDF card.
 * Email + real PDF need the local server (npm start). Without it, PDFs fall back to the print dialog. */
"use strict";

/* ---------------- server ---------------- */
let SERVER = null;   // {mode:"smtp"|"test", from, pdf} or null when not running
async function checkServer() {
  try { const r = await fetch("/api/health", { cache: "no-store" }); SERVER = r.ok ? await r.json() : null; }
  catch { SERVER = null; }
  return SERVER;
}
checkServer();

async function pdfDownload(pages, filename) {
  await checkServer();
  if (!SERVER?.pdf) {   // website: make the PDF in the browser
    busy(true); toast(pages.length > 6 ? `Making a ${pages.length}-page PDF…` : "Making PDF…");
    try { download(filename, await pagesToPdf(pages)); toast("PDF downloaded"); }
    catch (e) { toast("PDF failed: " + e.message); printPages(pages); }
    finally { busy(false); }
    return;
  }
  busy(true); toast(pages.length > 6 ? `Making a ${pages.length}-page PDF…` : "Making PDF…");
  try {
    const r = await fetch("/api/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: pages.join(""), filename }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    download(filename, await r.blob()); toast("PDF downloaded");
  } catch (e) { toast("PDF failed: " + e.message); printPages(pages); }
  finally { busy(false); }
}

/* ---------------- candidate states ---------------- */
const STATES = {
  draft: ["To review", "orange"], flagged: ["Flagged", "red"], approved: ["Approved", "blue"],
  sent: ["Emailed", "green"], failed: ["Email failed", "red"], prepared: ["Ready in Outlook", "purple"],
};
const countState = (e, st) => e.candidates.filter(c => (c.state || "draft") === st).length;
const stateLabel = c => STATES[c.state || "draft"][0];
const stateChip = c => `<span class="chip st c-${STATES[c.state || "draft"][1]}" title="${esc(c.note || c.error || "")}">${stateLabel(c)}${c.outdated ? " · changed" : ""}</span>`;
function touched(c) {
  if ((c.state || "draft") === "draft") return false;
  if (c.state === "sent" || c.state === "prepared") c.outdated = true;
  c.state = "draft"; c.approvedBy = c.approvedAt = null; return true;
}
let changedT;
function cardChanged(e, quiet) {
  let n = 0;
  for (const c of e.candidates) {
    if (c.state === "approved" || c.state === "flagged" || c.state === "failed") { c.state = "draft"; c.approvedBy = null; n++; }
    else if (c.state === "sent" || c.state === "prepared") c.outdated = true;
  }
  if (n) { save(); refreshPipeline(); clearTimeout(changedT); if (!quiet) changedT = setTimeout(() => toast(`The card changed — ${n} approval${n === 1 ? "" : "s"} need review again`), 600); }
}
function checks(e, c) {
  const out = [];
  out.push([!!c.name.trim(), c.name.trim() ? "Name present" : "Name is missing"]);
  out.push([isEmail(c.email), isEmail(c.email) ? "Email looks valid" : c.email ? "Email looks wrong" : "No email address"]);
  const dup = c.index && e.candidates.some(o => o !== c && o.index.trim() === c.index.trim());
  out.push([!!c.index.trim() && !dup, !c.index.trim() ? "No index number" : dup ? "Index number is used twice" : "Index number unique"]);
  const applied = e.subjects.filter(s => c.status[s.id] === "X").length;
  out.push([applied > 0, applied ? `${applied} paper${applied === 1 ? "" : "s"} applied` : "No subject marked ×"]);
  const missing = e.subjects.filter(s => !s.date).length;
  out.push([!missing, missing ? `${missing} subject${missing === 1 ? "" : "s"} without a date` : "Timetable complete"]);
  return out;
}
const passes = (e, c) => checks(e, c).every(([ok]) => ok);

/* ---------------- pipeline UI in the editor ---------------- */
function pipelineHtml(e) {
  const n = e.candidates.length, dated = e.subjects.filter(s => s.date).length;
  const appr = countState(e, "approved") + countState(e, "sent") + countState(e, "prepared"), sent = countState(e, "sent") + countState(e, "prepared");
  const steps = [
    ["cands", "Candidates", n ? `${n} added` : "Import or add", n > 0],
    ["time", "Timetable", `${dated}/${e.subjects.length} dated`, dated === e.subjects.length && dated > 0],
    ["review", "Supervisor review", n ? `${appr}/${n} approved` : "—", n > 0 && appr === n],
    ["send", "Email", n ? `${sent}/${n} sent` : "—", n > 0 && sent === n],
  ];
  const curStep = steps.findIndex(s => !s[3]);
  return `<div class="pipe" id="pipe">${steps.map(([k, t, sub, done], i) => `<button class="pstep ${done ? "done" : i === curStep ? "now" : ""}" data-step="${k}">
    <span class="pn">${done ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>' : i + 1}</span>
    <span class="pt"><b>${t}</b><small>${sub}</small></span></button>`).join('<i class="pline"></i>')}</div>`;
}
function refreshPipeline() {
  const p = $("#pipe"); if (!p || !cur) return;
  p.outerHTML = pipelineHtml(cur);
  $$("#adm-edit [data-step]").forEach(b => b.onclick = () => {
    const s = b.dataset.step;
    if (s === "review") openReview(cur); else if (s === "send") openSend(cur);
    else $(s === "time" ? "#subs" : "#cands")?.closest(".card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  const a = countState(cur, "approved"), btn = $("#eSend");
  if (btn) { btn.disabled = !a; btn.lastChild.textContent = `Send ${a || ""}`; }
}
function miniProgress(e) {
  const n = e.candidates.length || 1, w = st => (100 * countState(e, st) / n).toFixed(1);
  return `<div class="mini-prog"><i style="width:${w("sent")}%;background:var(--green)"></i><i style="width:${w("approved")}%;background:var(--blue)"></i><i style="width:${w("flagged") + 0}%;background:var(--red)"></i><i style="width:${w("failed")}%;background:var(--red)"></i></div>`;
}

/* ---------------- reading admission sheets ---------------- */
function admissionColumns(header) {
  const f = (re, not) => header.findIndex(h => re.test(h) && !(not && not.test(h)));
  let name = f(/name in full|full name|name_in_full/i);
  if (name < 0) name = f(/name/i, /initial/i);
  return {
    name, initials: f(/initial/i), title: f(/^(mr\s*\/\s*ms|title|salutation|mr|ms)\b/i),
    sid: f(/student\s*(no|number|id)|^student$|reg(istration)?\s*(no|number)/i, /name/i),
    nic: f(/\bnic\b|national id/i), email: f(/e\s*-?\s*mail/i), phone: f(/contact|phone|mobile|tel/i, /whats/i),
    whatsapp: f(/whats\s*app/i), index: f(/index/i), ref: f(/^ref|^no\.?$|^#$/i),
  };
}
function guessLevel(header, body, ci) {
  const codes = { AP: "Application", AN1: "Analyst 1", AL1: "Analyst 1", A1: "Analyst 1", AN2: "Analyst 2", AL2: "Analyst 2", AD: "Advisory" };
  if (ci.index >= 0) {
    const cnt = {};
    for (const r of body.slice(0, 60)) { const m = String(r[ci.index] || "").toUpperCase().match(/\/(AP|AN1|AN2|AL1|AL2|AD|A1)\//); if (m) cnt[codes[m[1]]] = (cnt[codes[m[1]]] || 0) + 1; }
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; if (best) return best[0];
  }
  let best = ["Analyst 1", -1];
  for (const l of LEVELS) {
    const used = new Set(), n = makeSubjects(l).filter(s => { const i = matchSubjectCol(header, s, used); if (i >= 0) { used.add(i); return true; } }).length;
    if (n > best[1]) best = [l, n];
  }
  return best[0];
}
function readStatus(v) {
  v = String(v ?? "").trim();
  return /^ex/i.test(v) ? "Exempted" : /^(x|×|✓|✔|yes|y|applied|1)$/i.test(v) ? "X" : v ? v : "";
}
function parseCandidates(e, header, body) {
  const ci = admissionColumns(header);
  if (ci.name < 0) throw new Error("Could not find a Name column");
  const used = new Set(Object.values(ci).filter(i => i >= 0));
  const subCols = e.subjects.map(s => { const i = matchSubjectCol(header, s, used); if (i >= 0) used.add(i); return i; });
  const rest = header.map((_, i) => i).filter(i => !used.has(i) && i > Math.max(ci.name, ci.index));
  subCols.forEach((v, k) => { if (v < 0 && rest.length) subCols[k] = rest.shift(); });
  const get = (r, k) => ci[k] >= 0 ? String(r[ci[k]] ?? "").replace(/\s+/g, " ").trim() : "";
  let added = 0, updated = 0, linked = 0, emails = 0, fromRecords = 0;
  const seenNow = new Set();
  for (const r of body) {
    const name = get(r, "name"); if (!name) continue;
    const sid = get(r, "sid"), idx = get(r, "index"), L = x => x.toLowerCase();
    const st = (sid && DB.students.find(s => idKey(s.id) === idKey(sid))) || (idx && DB.students.find(s => s.index_nos.some(i => idKey(i) === idKey(idx)))) || DB.students.find(s => norm(s.name) === norm(name)) || null;
    const info = { title: get(r, "title"), initials: get(r, "initials"), email: get(r, "email").replace(/\s+/g, ""), phone: get(r, "phone"), whatsapp: get(r, "whatsapp"), nic: get(r, "nic") };
    const prev = st ? { name: st.name, email: st.contact?.email || "", phone: st.contact?.phone || "", nic: st.contact?.nic || "" } : null;
    if (st) {
      linked++; setContact(st, info);
      if (idx && !st.index_nos.includes(idx)) { st.index_nos.push(idx); HAY.delete(st); }
    }
    let c = e.candidates.find(x => (st && x.sid === st.id) || (idx && x.index === idx));
    if (c) { touched(c); updated++; } else { c = candidateFrom(e, st); e.candidates.push(c); added++; }
    // the same student twice in one sheet: the later row replaces the earlier one — remember it for the details check
    if (seenNow.has(c)) { c.dupRows = (c.dupRows || 1) + 1; c.dupReplaced = [...(c.dupReplaced || []), [c.name, c.index, c.email].filter(Boolean).join(" · ")]; updated--; }
    else { seenNow.add(c); c.dupRows = 1; c.dupReplaced = []; }
    Object.assign(c, { name, index: idx || c.index, sid: st?.id || sid || c.sid, sheetSid: sid, title: info.title, initials: info.initials, email: info.email || c.email, phone: info.phone, nic: info.nic, prev: c.prev || prev });
    // no email in the Excel → the student's saved email (registration files) is used; remember that so the screens can say so
    c.emailFromRecords = !info.email && c.email ? c.email : "";
    if (isEmail(c.email)) emails++;
    if (c.emailFromRecords) fromRecords++;
    e.subjects.forEach((s, k) => { if (subCols[k] >= 0) c.status[s.id] = readStatus(r[subCols[k]]); });
  }
  return { added, updated, linked, emails, fromRecords, total: added + updated };
}
async function importCandidates(file) {
  const e = cur;
  let wb; try { busy(true); wb = await readSheetFile(file); } catch (err) { return toast(err.message); } finally { busy(false); }
  const { header, body } = sheetRows(wb, wb.SheetNames[0]);
  try {
    const r = parseCandidates(e, header, body);
    if (!e.indexPrefix || /\/E1\/$/.test(e.indexPrefix)) { const first = e.candidates.find(c => c.index)?.index; if (first) e.indexPrefix = first.replace(/[^/]+$/, ""); }
    derive(); save(); renderEditor();
    toast(`${r.added} added · ${r.updated} updated · ${r.linked} linked to profiles · ${r.emails} with email${r.fromRecords ? ` (${r.fromRecords} from student records)` : ""}`);
    if (typeof openAdmCheck === "function") setTimeout(() => openAdmCheck(e, { afterImport: true }), 350);
  } catch (err) { toast(err.message); }
}

/* create a whole exam straight from the admission Excel */
async function importAdmissionExcel(file) {
  let wb; try { busy(true); wb = await readSheetFile(file); } catch (err) { return toast(err.message); } finally { busy(false); }
  const { header, body } = sheetRows(wb, wb.SheetNames[0]);
  const ci = admissionColumns(header);
  if (ci.name < 0) return toast("Could not find a Name column in that sheet");
  const level = guessLevel(header, body, ci);
  const rows = body.filter(r => String(r[ci.name] || "").trim());
  const withEmail = ci.email >= 0 ? rows.filter(r => isEmail(String(r[ci.email]).replace(/\s+/g, ""))).length : 0;
  const L = x => String(x).trim().toLowerCase();
  const matched = rows.filter(r => (ci.sid >= 0 && DB.students.some(s => L(s.id) === L(r[ci.sid]))) || (ci.index >= 0 && DB.students.some(s => s.index_nos.some(i => L(i) === L(r[ci.index]))))).length;
  const found = Object.entries({ "Student no": ci.sid, "Email": ci.email, "Index no": ci.index, "NIC": ci.nic, "Phone": ci.phone, "Initials": ci.initials }).map(([k, v]) => `<span class="chip ${v >= 0 ? "c-green" : "c-gray"}">${v >= 0 ? "✓" : "–"} ${k}</span>`).join(" ");
  let type = "external";
  openSheet(`<div class="bar-top"><b style="font-size:17px">New exam from Excel</b>${closeBtn}</div>
    <div class="imp-sum"><div><b>${rows.length}</b><span>candidates</span></div><div><b>${matched}</b><span>matched to profiles</span></div><div><b>${withEmail}</b><span>with email</span></div></div>
    <div class="note" style="margin-top:12px">${esc(file.name)} · columns found: ${found}</div>
    <small class="k">Admission template</small>
    <div class="typecards">
      <button class="typecard" data-t="internal"><span class="ic" style="background:var(--blue)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></svg></span><b>Internal exam</b><span>One place of examination.</span></button>
      <button class="typecard on" data-t="external"><span class="ic" style="background:var(--purple)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span><b>Outside venue</b><span>Venue per subject (UOC / CIT).</span></button>
    </div>
    <div class="card form" style="margin-top:12px">
      <div class="field"><label>Level</label><select id="ixLevel">${LEVELS.map(l => `<option ${l === level ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field stack"><label>Exam heading</label><input class="inp" id="ixHead" value="${esc(defaultHeading(level))}"></div>
    </div>
    <div class="actions" style="justify-content:flex-end"><button class="btn primary" id="ixGo">Create exam with ${rows.length} candidates</button></div>`);
  $("#sheet .typecards").onclick = ev => { const b = ev.target.closest("[data-t]"); if (!b) return; type = b.dataset.t; $$("#sheet .typecard").forEach(x => x.classList.toggle("on", x === b)); };
  $("#ixLevel").onchange = ev => { $("#ixHead").value = defaultHeading(ev.target.value); };
  $("#ixGo").onclick = () => {
    const e = newExam(type), lv = $("#ixLevel").value;
    e.level = lv; e.subjects = makeSubjects(lv); e.heading = $("#ixHead").value.trim() || defaultHeading(lv); e.headingAuto = false;
    if (type === "external") e.subjects.forEach((s, i) => s.venue = i < 3 ? "UOC" : "CIT");
    try {
      const r = parseCandidates(e, header, body);
      const first = e.candidates.find(c => c.index)?.index; if (first) e.indexPrefix = first.replace(/[^/]+$/, "");
      e.source = file.name; DB.exams.push(e); cur = e; derive(); save(); closeSheet(); tab("adm");
      toast(`Created with ${r.total} candidates — checking the details`);
      setTimeout(() => typeof openAdmCheck === "function" ? openAdmCheck(e, { afterImport: true }) : $("#subs")?.closest(".card")?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
    } catch (err) { toast(err.message); }
  };
}
const admDrop = $("#admDrop");
["dragenter", "dragover"].forEach(t => admDrop.addEventListener(t, e => { e.preventDefault(); admDrop.classList.add("over"); }));
["dragleave", "drop"].forEach(t => admDrop.addEventListener(t, e => { e.preventDefault(); admDrop.classList.remove("over"); }));
admDrop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) importAdmissionExcel(f); });
$("#admFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importAdmissionExcel(f); };

/* ================= SUPERVISOR REVIEW ================= */
function supervisorGate(then) {
  const st = DB.settings;
  let ok = false; try { ok = sessionStorage.getItem("sup-ok") === "1"; } catch { }
  if (st.supervisor && (!st.pin || ok)) return then();
  openSheet(`<div class="bar-top"><b style="font-size:17px">Supervisor sign-in</b>${closeBtn}</div>
    <p class="sub" style="margin:0 0 12px">Approvals are recorded with the supervisor's name.${st.pin ? " Enter the supervisor PIN to continue." : ""}</p>
    <div class="card form"><div class="field"><label>Supervisor</label><input id="supName" value="${esc(st.supervisor)}" placeholder="Full name"></div>
      ${st.pin ? `<div class="field"><label>PIN</label><input id="supPin" type="password" inputmode="numeric" autocomplete="off"></div>` : ""}</div>
    <div class="actions" style="justify-content:flex-end"><button class="btn primary" id="supGo">Continue</button></div>`);
  setTimeout(() => ($("#supPin") || $("#supName")).focus(), 350);
  const go = () => {
    const n = $("#supName").value.trim(); if (!n) return toast("Enter the supervisor's name");
    if (st.pin && $("#supPin").value !== st.pin) { $("#supPin").value = ""; $("#supPin").closest(".card").classList.add("shake"); setTimeout(() => $("#supPin")?.closest(".card")?.classList.remove("shake"), 500); return toast("Wrong PIN"); }
    st.supervisor = n; save(); try { sessionStorage.setItem("sup-ok", "1"); } catch { }
    then();
  };
  $("#supGo").onclick = go; $("#sheet").onkeydown = ev => { if (ev.key === "Enter") go(); };
}
function openReview(e) {
  if (!e.candidates.length) return toast("Add candidates first");
  supervisorGate(() => reviewUI(e));
}
function reviewUI(e) {
  let filter = countState(e, "draft") ? "draft" : countState(e, "flagged") ? "flagged" : "all", i = 0;
  const list = () => e.candidates.filter(c => filter === "all" || (c.state || "draft") === filter || (filter === "approved" && c.state === "sent"));
  openSheet(`<div class="bar-top"><div><b style="font-size:17px">Supervisor review</b><div class="muted" id="rvSub"></div></div>${closeBtn}</div>
    <div class="rvprog"><i id="rvBar"></i></div>
    <div class="seg" id="rvSeg"></div>
    <div id="rvBody"></div>`);
  $("#sheet").dataset.mode = "review"; $("#sheet").classList.add("wide");
  const draw = () => {
    const L = list(); if (i >= L.length) i = Math.max(0, L.length - 1);
    const done = countState(e, "approved") + countState(e, "sent") + countState(e, "prepared");
    $("#rvSub").textContent = `${done} of ${e.candidates.length} approved · signed in as ${DB.settings.supervisor}`;
    $("#rvBar").style.width = (100 * done / e.candidates.length) + "%";
    const segs = [["draft", "To review"], ["flagged", "Flagged"], ["approved", "Approved"], ["all", "All"]];
    $("#rvSeg").innerHTML = segs.map(([k, t]) => `<button class="${k === filter ? "on" : ""}" data-f="${k}">${t} <span class="muted">${k === "all" ? e.candidates.length : k === "approved" ? done : countState(e, k)}</span></button>`).join("");
    const ok = e.candidates.filter(c => (c.state || "draft") === "draft" && passes(e, c)).length;
    if (!L.length) {
      $("#rvBody").innerHTML = `<div class="card empty-hero" style="margin-top:12px"><div class="eh-ic ok">✓</div><b>${filter === "draft" ? "Everything is reviewed" : "Nothing here"}</b>
        <span>${countState(e, "approved") ? `${countState(e, "approved")} approved cards are ready to email.` : ""}</span>
        ${countState(e, "approved") ? `<button class="btn primary" id="rvToSend" style="margin-top:10px">Go to email</button>` : ""}</div>`;
      if ($("#rvToSend")) $("#rvToSend").onclick = () => openSend(e);
      return;
    }
    const c = L[i], ck = checks(e, c), good = ck.every(([o]) => o);
    $("#rvBody").innerHTML = `
      <div class="rvhead card">
        <div class="rvwho"><div class="av" style="background:${color(c.name || "?")}">${initials(c.name || "?")}</div>
          <div><b>${esc(c.name || "No name")}</b><span>${esc(c.index || "no index")} · ${esc(c.email || "no email")}</span></div>${stateChip(c)}</div>
        <div class="checks">${ck.map(([o, t, w]) => `<span class="ck ${w ? "warn" : o ? "ok" : "bad"}">${w ? "⚠" : o ? "✓" : "!"} ${esc(t)}</span>`).join("")}</div>
        ${!isEmail(c.email) ? `<div class="fixmail"><input class="inp" id="rvMail" type="email" value="${esc(c.email || "")}" placeholder="Correct email address"><button class="btn small" id="rvMailGo">Save email</button></div>` : ""}
        ${c.state === "flagged" && c.note ? `<div class="note" style="margin:8px 0 0">Flag: ${esc(c.note)}</div>` : ""}
        ${c.approvedBy ? `<div class="muted" style="margin-top:6px">Approved by ${esc(c.approvedBy)} · ${new Date(c.approvedAt).toLocaleString()}</div>` : ""}
        <div class="rvacts">
          <button class="btn small" id="rvPrev" ${i ? "" : "disabled"}>‹</button><span class="muted">${i + 1} / ${L.length}</span><button class="btn small" id="rvNext" ${i < L.length - 1 ? "" : "disabled"}>›</button>
          <span style="flex:1"></span>
          <button class="btn small danger" id="rvFlag" title="F">Flag</button>
          <button class="btn small primary" id="rvOk" ${good ? "" : "disabled"} title="A">${c.state === "approved" || c.state === "sent" ? "Approved ✓" : "Approve"}</button>
        </div>
        ${filter === "draft" && ok > 1 ? `<button class="link" id="rvAll" style="margin-top:8px">Approve all ${ok} cards that pass every check</button>` : ""}
      </div>
      <div class="paperwrap" id="rvPaper"></div>
      <p class="foot">Keys: <kbd>A</kbd> approve · <kbd>F</kbd> flag · <kbd>←</kbd> <kbd>→</kbd> move</p>`;
    const w = $("#rvPaper").clientWidth - 36, z = Math.min(1, w / 794);
    $("#rvPaper").innerHTML = cardPages(e, c).slice(0, 1).map(p => `<div style="zoom:${z}">${p}</div>`).join("");
    $("#rvPrev").onclick = () => { i--; draw(); };
    $("#rvNext").onclick = () => { i++; draw(); };
    $("#rvOk").onclick = approve; $("#rvFlag").onclick = flag;
    if ($("#rvMail")) {
      const m = String(c.email || "").match(/[^\s@,;/]+@[^\s@,;/]+\.[^\s@,;/]+/); if (m && !c.email.includes(" ")) $("#rvMail").value = m[0];
      const fix = () => { const v = $("#rvMail").value.trim(); if (!isEmail(v)) return toast("That email still looks wrong"); c.email = v; rememberContact(c); save(); draw(); toast("Email saved — you can approve now"); };
      $("#rvMailGo").onclick = fix; $("#rvMail").onkeydown = ev => { if (ev.key === "Enter") fix(); };
    }
    if ($("#rvAll")) $("#rvAll").onclick = () => {
      if (!confirm(`Approve ${ok} cards as ${DB.settings.supervisor}? Cards with problems stay in “To review”.`)) return;
      const t = Date.now();
      e.candidates.forEach(x => { if ((x.state || "draft") === "draft" && passes(e, x)) Object.assign(x, { state: "approved", approvedBy: DB.settings.supervisor, approvedAt: t, note: "", outdated: false }); });
      save(); draw(); toast(`${ok} cards approved`);
    };
  };
  const approve = () => {
    const c = list()[i]; if (!c || !passes(e, c)) return;
    if (c.state !== "sent") Object.assign(c, { state: "approved", approvedBy: DB.settings.supervisor, approvedAt: Date.now(), note: "", outdated: false });
    save(); if (filter === "all" || filter === "approved") i++; draw();
  };
  const flag = () => {
    const c = list()[i]; if (!c) return;
    const note = prompt("What needs to be fixed?", c.note || ""); if (note === null) return;
    Object.assign(c, { state: "flagged", note, approvedBy: null }); save(); if (filter !== "draft") i++; draw();
  };
  $("#rvSeg").onclick = ev => { const b = ev.target.closest("[data-f]"); if (b) { filter = b.dataset.f; i = 0; draw(); } };
  $("#sheet").onkeydown = ev => {
    if (ev.target.closest("input, textarea")) return;
    if (ev.key === "a" || ev.key === "A") approve(); else if (ev.key === "f" || ev.key === "F") flag();
    else if (ev.key === "ArrowRight" && i < list().length - 1) { i++; draw(); } else if (ev.key === "ArrowLeft" && i > 0) { i--; draw(); }
  };
  $("#sheet").tabIndex = -1; $("#sheet").focus();
  draw();
}

/* ================= EMAIL ================= */
const DEFAULT_SUBJECT = "Admission Card – {exam}";
const DEFAULT_BODY = `Dear {title} {name},

Please find attached your Admission Card and Signature Form for the {exam}.

Index Number: {index}
Subjects applied:
{timetable}

Please print the card, have the attestation completed, and bring it to every paper together with your NIC and Student ID. Arrive at the exam venue at least 30 minutes before the start time.

Best regards,
Examinations Division
Chartered Institute of Taxation of Sri Lanka`;
function fillTemplate(t, e, c) {
  const applied = e.subjects.filter(s => c.status[s.id] === "X");
  const tt = applied.map(s => `  • ${(s.code ? s.code + " " : "") + s.name} — ${fmtDate(s.date).replace(/<br>/g, " ") || "date to be announced"}, ${fmtTime(s.from)} to ${fmtTime(s.to)}${e.type === "external" ? " at " + (venueBy(s.venue)?.name || s.venue) : ""}`).join("\n");
  const v = { title: c.title || "", name: c.name, initials: c.initials || c.name, index: c.index, exam: e.heading.replace(/\s+/g, " "), level: e.level,
    subjects: applied.map(s => s.name).join(", "), timetable: tt || "  (none)", studentNo: c.sid || "", venue: e.type === "internal" ? (venueBy(e.place)?.name || "") : "" };
  return t.replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m).replace(/Dear\s+,/g, "Dear Candidate,").replace(/[ \t]{2,}/g, " ");
}
function textToHtml(t) {
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1c1c1e;max-width:620px">
    <div style="font-weight:700;font-size:15px;color:#0b4aa2;border-bottom:2px solid #0b4aa2;padding-bottom:8px;margin-bottom:16px">Chartered Institute of Taxation of Sri Lanka</div>
    ${esc(t).replace(/\n/g, "<br>")}</div>`;
}
let SENDING = null;
/* How "Send" works (Email step):
   outlook — makes an Outlook email for the student, PDF attached; Outlook opens it and YOU press Send (default)
   mailto  — opens the email app with To/Subject/Message filled in; the PDF is downloaded to attach by hand
   auto    — sends straight away through Microsoft 365 (only when it is set up) */
const SEND_MODES = {
  outlook: ["Open in Outlook", "Makes a ready email for each student with their PDF attached. Outlook opens it — check it and press Send."],
  mailto: ["Email app link", "Opens your email app with the student, subject and message filled in. The PDF downloads — attach it, then press Send."],
  auto: ["Send automatically", "Sends straight away from the Microsoft 365 mailbox. Nothing to press in Outlook."],
};
const sendMode = () => { const m = DB.settings.sendMode || "outlook"; return m === "auto" && !(SERVER && SERVER.mode !== "none") ? "outlook" : m; };
const b64utf8 = str => { const bytes = new TextEncoder().encode(str); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
const wrap76 = b => b.replace(/.{1,76}/g, "$&\r\n");
/* an unsent email file: Outlook (Windows) opens it as a new message ready to send, with the PDF attached */
function emlFile({ to, cc, subject, text, html, filename, pdfB64 }) {
  const bd = "=_cit_" + Math.random().toString(36).slice(2), alt = bd + "_alt";
  const L = ["X-Unsent: 1", `To: ${to}`, ...(cc ? [`Cc: ${cc}`] : []), `Subject: =?UTF-8?B?${b64utf8(subject)}?=`, "MIME-Version: 1.0", `Content-Type: multipart/mixed; boundary="${bd}"`, "",
    `--${bd}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "",
    `--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64utf8(text)),
    `--${alt}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(b64utf8(html)),
    `--${alt}--`, "",
    ...(pdfB64 ? [`--${bd}`, `Content-Type: application/pdf; name="${filename}"`, `Content-Disposition: attachment; filename="${filename}"`, "Content-Transfer-Encoding: base64", "", wrap76(pdfB64)] : []),   // no attachment for results emails
    `--${bd}--`, ""];
  return new Blob([L.join("\r\n")], { type: "message/rfc822" });
}
/* prepare the email for the student without sending it (Outlook draft, or email-app link) */
async function prepareEmail(e, c, mode) {
  const text = fillTemplate(e.emailBody, e, c), subject = fillTemplate(e.emailSubject, e, c), filename = cardFileName(c), to = c.email.trim();
  const pdf = await cardPdfBlob(e, c);
  if (mode === "mailto") {
    download(filename, pdf);
    const q = new URLSearchParams({ subject, body: text.slice(0, 1800) + (text.length > 1800 ? "…" : "") });
    if (e.emailCc) q.set("cc", e.emailCc);
    setTimeout(() => { location.href = `mailto:${encodeURIComponent(to)}?${q.toString().replace(/\+/g, "%20")}`; }, 300);
  } else {
    download(filename.replace(/\.pdf$/i, "") + " - email.eml", emlFile({ to, cc: e.emailCc, subject, text, html: textToHtml(text), filename, pdfB64: await blobToBase64(pdf) }));
  }
  Object.assign(c, { state: "prepared", preparedAt: Date.now(), preparedMode: mode, error: "", outdated: false, sentTo: to, sentFile: filename });
  return { ok: true, mode };
}

/* email ONE candidate their card (PDF named by student number). Used by "Send" on each box and by "Send all". */
async function sendOne(e, c) {
  const text = fillTemplate(e.emailBody, e, c), filename = cardFileName(c);
  // office server renders the PDF itself; on the website the browser makes it and sends it along
  const attachment = SERVER.pdf ? { filename, html: cardPages(e, c).join("") } : { filename, base64: await blobToBase64(await cardPdfBlob(e, c)) };
  const r = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
    to: c.email.trim(), cc: e.emailCc || undefined, subject: fillTemplate(e.emailSubject, e, c), text, html: textToHtml(text), attachments: [attachment] }) });
  const j = await r.json().catch(() => ({ ok: false, error: r.statusText }));
  if (!r.ok || !j.ok) throw new Error(j.error || "Server error");
  Object.assign(c, { state: "sent", sentAt: Date.now(), error: "", outdated: false, sentMode: j.mode, sentTo: c.email.trim(), sentFile: filename });
  return j;
}

/* Email step: one box per student (name, student no, email, their PDF, their own Send button) + Send all */
async function openSend(e) {
  await checkServer();
  e.emailSubject ||= DEFAULT_SUBJECT; e.emailBody ||= DEFAULT_BODY;
  let filter = "all", q = "";
  const canAuto = () => SERVER && SERVER.mode !== "none";
  const mode = () => sendMode();
  const canSend = () => mode() !== "auto" || canAuto();
  const live = () => mode() === "auto" && SERVER?.mode !== "test";
  const busyIds = new Set();
  const when = t => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const box = c => {
    const st = c.state || "draft", file = cardFileName(c), b = busyIds.has(c.id), mailOk = isEmail(c.email);
    const verb = mode() === "outlook" ? "Open in Outlook" : mode() === "mailto" ? "Open email" : "Send";
    const sendLbl = (st === "sent" || st === "prepared") ? (mode() === "auto" ? "Resend" : verb + " again") : st === "approved" || st === "failed" ? verb : "Approve & " + verb.toLowerCase();
    return `<div class="sbox st-${st}" data-c="${esc(c.id)}">
      <div class="sb-top"><span class="dc-av" style="background:${color(c.name || "?")}">${esc(initials(c.name || "?") || "?")}</span>
        <span class="sb-id"><b>${esc(c.name || "No name")}</b><span class="dc-no">${esc(c.sid || "no student no")}</span></span>${stateChip(c)}</div>
      <div class="sb-rows">
        <div><small>Index no</small><span>${esc(c.index || "—")}</span></div>
        <div><small>Email</small><span class="${mailOk ? "" : "danger"}">${esc(c.email || "no email")}</span></div>
        ${c.emailFromRecords && c.emailFromRecords === c.email ? `<div><small></small><span class="fromrec">from student records (not in the Excel)</span></div>` : ""}
      </div>
      <div class="sb-file">📄 <span>${esc(file)}</span></div>
      ${st === "sent" ? `<div class="sb-note ok">✓ ${c.sentMode === "manual" ? "Marked as sent" : "Emailed"} ${when(c.sentAt)}${c.sentMode === "test" ? " (test — saved to outbox)" : ""} to ${esc(c.sentTo || c.email)}</div>` : ""}
      ${st === "prepared" ? `<div class="sb-note prep">${c.preparedMode === "mailto" ? "Opened in the email app" : "Outlook email made"} ${when(c.preparedAt)} — press Send there. <button class="link" data-a="mark">Mark as sent</button></div>` : ""}
      ${st === "failed" ? `<div class="sb-note bad">! ${esc(c.error || "Failed")}</div>` : ""}
      ${st === "flagged" ? `<div class="sb-note bad">Flagged${c.note ? ": " + esc(c.note) : ""}</div>` : ""}
      <div class="sb-acts">
        <button class="btn small" data-a="view">View</button>
        <button class="btn small" data-a="pdf">PDF</button>
        <span style="flex:1"></span>
        <button class="btn small primary" data-a="send" ${b || !mailOk || !canSend() || st === "flagged" ? "disabled" : ""}>${b ? `<span class="spin"></span> ${mode() === "auto" ? "Sending…" : "Making…"}` : sendLbl}</button>
      </div>
    </div>`;
  };
  const draw = () => {
    const ready = e.candidates.filter(c => c.state === "approved"), noMail = ready.filter(c => !isEmail(c.email)).length;
    const failed = countState(e, "failed"), sent = countState(e, "sent"), prepared = countState(e, "prepared"), waiting = countState(e, "draft") + countState(e, "flagged");
    const sample = ready[0] || e.candidates[0];
    const srvAuto = SERVER?.site === "vercel" && SERVER.mode === "none" ? `<div class="srv bad"><b>Email isn't set up on the website yet.</b> Add the Microsoft 365 settings (<code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>, <code>MS_CLIENT_SECRET</code>, <code>MS_SENDER</code>) in Vercel → Settings → Environment Variables and redeploy. You can still view and download every PDF.</div>`
      : !SERVER ? `<div class="srv bad"><b>Email server is not running.</b> Open a terminal in the student-hub folder and run <code>npm start</code>, then reopen this page from http://localhost:5173.</div>`
      : SERVER.mode === "test" ? `<div class="srv test"><b>Test mode.</b> Emails are saved to the <code>outbox</code> folder with the PDF attached. Nothing reaches students until email is set up.</div>`
      : `<div class="srv ok"><b>Ready to send</b> from ${esc(SERVER.from)}${SERVER.mode === "graph" ? " via Microsoft 365 — copies are kept in its Sent Items" : ""}.</div>`;
    const how = `<div class="sendhow"><small class="k" style="margin:0 0 6px">How to send</small>
        <div class="seg" id="sMode">${Object.entries(SEND_MODES).map(([k, [t]]) => `<button data-m="${k}" class="${k === mode() ? "on" : ""}" ${k === "auto" && !canAuto() ? 'disabled title="Needs Microsoft 365 set up"' : ""}>${t}${k === "auto" && !canAuto() ? " · not set up" : ""}</button>`).join("")}</div>
        <div class="muted" style="font-size:13px;margin-top:6px">${SEND_MODES[mode()][1]}${mode() === "outlook" ? " Tip: in Chrome, click ⌄ on the download → <b>Always open files of this type</b>, so each email opens in Outlook straight away." : ""}</div></div>
      ${mode() === "auto" ? srvAuto : ""}`;
    const qq = norm(q);
    const list = e.candidates.filter(c => (filter === "all" || (filter === "ready" ? c.state === "approved" : filter === "sent" ? c.state === "sent" || c.state === "prepared" : filter === "failed" ? c.state === "failed" : !c.state || c.state === "draft" || c.state === "flagged"))
      && (!qq || norm(c.name + " " + c.sid + " " + c.index + " " + c.email).includes(qq)));
    $("#sheet").innerHTML = `<div class="grab"></div><div class="bar-top"><div><b style="font-size:17px">Email admission cards</b><div class="muted">${esc(e.heading || e.level)}</div></div>${closeBtn}</div>
      ${how}
      <div class="imp-sum"><div><b>${ready.length}</b><span>approved, ready</span></div><div><b style="color:var(--green)">${sent + prepared}</b><span>${mode() === "auto" ? "emailed" : "done"}</span></div><div><b class="${failed ? "danger" : ""}">${failed}</b><span>failed</span></div><div><b>${waiting}</b><span>not approved yet</span></div></div>
      <details class="mprev msgbox"><summary>Message &amp; subject <span class="muted">· same for everyone, with their own details filled in</span></summary>
        <div class="card form" style="margin-top:8px">
          <div class="field stack"><label>Subject</label><input class="inp" id="mSub" value="${esc(e.emailSubject)}"></div>
          <div class="field stack"><label>Body <span class="muted">· {name} {title} {index} {exam} {level} {subjects} {timetable}</span></label><textarea id="mBody" rows="10">${esc(e.emailBody)}</textarea></div>
          <div class="field"><label>Copy to (CC)</label><input id="mCc" type="email" value="${esc(e.emailCc || "")}" placeholder="optional, e.g. exams office"></div>
        </div>
        ${sample ? `<div class="mbox" style="margin-top:8px"><div class="mto">Preview for ${esc(sample.name)} · To: ${esc(sample.email || "—")}<br>Subject: <b>${esc(fillTemplate(e.emailSubject, e, sample))}</b><br>Attachment: 📎 ${esc(cardFileName(sample))}</div><pre>${esc(fillTemplate(e.emailBody, e, sample))}</pre></div>` : ""}
      </details>
      <div class="sbtools">
        <div class="seg" id="sSeg">${[["all", "All", e.candidates.length], ["ready", "Ready", ready.length], ["todo", "Not approved", waiting], ["sent", "Done", sent + prepared], ["failed", "Failed", failed]].map(([k, t, n]) => `<button data-f="${k}" class="${k === filter ? "on" : ""}">${t} <span class="muted">${n}</span></button>`).join("")}</div>
        <div class="search dsearch"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="sQ" type="search" placeholder="Search name, student no, index or email" value="${esc(q)}"></div>
      </div>
      <div class="sgrid" id="sGrid">${list.map(box).join("") || `<div class="card empty dg-full">No students here.</div>`}</div>
      <div id="sendLog"></div>
      <div class="actions sendbar">
        <span class="muted">${noMail ? `${noMail} approved card${noMail === 1 ? " has" : "s have"} no valid email and will be skipped · ` : ""}Each student gets only their own card.</span>
        <span style="flex:1"></span>
        ${failed ? `<button class="btn" id="mRetry">Retry ${failed} failed</button>` : ""}
        <button class="btn" id="mZip">Download all PDFs</button>
        <button class="btn primary" id="mGo" ${ready.length - noMail && canSend() && mode() !== "mailto" && !SENDING ? "" : "disabled"} ${mode() === "mailto" ? 'title="With the email app link, open each student one by one"' : ""}>${mode() === "outlook" ? "Make Outlook emails for" : mode() === "mailto" ? "Open email for" : live() ? "Send" : "Create"} all ${ready.length - noMail}</button>
      </div>`;
    $("#mSub").oninput = ev => { e.emailSubject = ev.target.value; saveSoon(); };
    $("#mBody").oninput = ev => { e.emailBody = ev.target.value; saveSoon(); };
    $("#mCc").oninput = ev => { e.emailCc = ev.target.value.trim(); saveSoon(); };
    $("#sMode").onclick = ev => { const b = ev.target.closest("[data-m]"); if (!b || b.disabled) return; DB.settings.sendMode = b.dataset.m; save(); redraw(); };
    $("#sSeg").onclick = ev => { const b = ev.target.closest("[data-f]"); if (b) { filter = b.dataset.f; redraw(); } };
    $("#sQ").oninput = ev => { q = ev.target.value; const pos = ev.target.selectionStart; redraw(); const i = $("#sQ"); i.focus(); i.setSelectionRange(pos, pos); };
    $("#mGo").onclick = () => runAll(e.candidates.filter(c => c.state === "approved" && isEmail(c.email)));
    if ($("#mRetry")) $("#mRetry").onclick = () => runAll(e.candidates.filter(c => c.state === "failed" && isEmail(c.email)));
    $("#mZip").onclick = () => downloadAllCards(e);
    $$("#sGrid .sbox").forEach(el => el.onclick = ev => {
      const btn = ev.target.closest("[data-a]"); if (!btn) return;
      const c = e.candidates.find(x => x.id === el.dataset.c); if (!c) return;
      if (btn.dataset.a === "pdf") return downloadOneCard(e, c);
      if (btn.dataset.a === "view") return viewCard(c);
      if (btn.dataset.a === "send") return sendSingle(c);
      if (btn.dataset.a === "mark") { Object.assign(c, { state: "sent", sentAt: Date.now(), sentMode: "manual", sentTo: c.sentTo || c.email }); save(); redraw(); if (cur === e && !$("#adm-edit").classList.contains("hide")) { renderCands(); refreshPipeline(); } }
    });
  };
  // keep the log and scroll position when redrawing
  const redraw = () => { const sh = $("#sheet"), top = sh.scrollTop, log = $("#sendLog")?.innerHTML || ""; draw(); $("#sendLog").innerHTML = log; sh.scrollTop = top; };
  const viewCard = c => {
    const w = Math.min(760, innerWidth - 60), z = Math.min(1, w / 794);
    const ov = document.createElement("div"); ov.className = "cardview";
    ov.innerHTML = `<div class="cv-in"><div class="cv-bar"><b>${esc(c.name)} · ${esc(c.sid || c.index || "")}</b><span style="flex:1"></span><button class="btn small" id="cvPdf">Download PDF</button><button class="btn small" id="cvX">Close</button></div>
      <div class="cv-pages">${cardPages(e, c).map(p => `<div style="zoom:${z}">${p}</div>`).join("")}</div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.onclick = ev => { if (ev.target === ov) close(); };
    $("#cvX", ov).onclick = close; $("#cvPdf", ov).onclick = () => downloadOneCard(e, c);
  };
  const sendSingle = async c => {
    if (!canSend()) return toast("Email isn't set up yet");
    if (!isEmail(c.email)) return toast("This student has no valid email");
    const doIt = async () => {
      if (!c.state || c.state === "draft") {   // approve this one card first (same rules as review)
        if (!passes(e, c)) return toast("This card doesn't pass every check yet — open the review to see why");
        Object.assign(c, { state: "approved", approvedBy: DB.settings.supervisor, approvedAt: Date.now(), note: "", outdated: false });
      }
      if (live() && !confirm(`${c.state === "sent" ? "Resend" : "Send"} the admission card to ${c.name} (${c.email})?`)) return;
      busyIds.add(c.id); redraw();
      try {
        const j = mode() === "auto" ? await sendOne(e, c) : await prepareEmail(e, c, mode());
        toast(j.mode === "outlook" ? `Outlook email for ${c.name} downloaded — open it and press Send` : j.mode === "mailto" ? `Email app opened for ${c.name} — attach the downloaded PDF` : j.mode === "test" ? `Saved to outbox for ${c.name}` : `Sent to ${c.name}`);
      }
      catch (err) { Object.assign(c, { state: "failed", error: err.message }); toast("Failed: " + err.message); }
      busyIds.delete(c.id); save();
      if ($("#sheet").classList.contains("on") && $("#sheet").dataset.mode === "send") redraw();
      if (cur === e && !$("#adm-edit").classList.contains("hide")) { renderCands(); refreshPipeline(); }
    };
    if (!c.state || c.state === "draft") supervisorGateKeep(doIt); else doIt();
  };
  // supervisor sign-in without losing this screen
  const supervisorGateKeep = then => {
    const st = DB.settings; let ok = false; try { ok = sessionStorage.getItem("sup-ok") === "1"; } catch { }
    if (st.supervisor && (!st.pin || ok)) return then();
    supervisorGate(() => { openSend(e).then(then); });
  };
  const runAll = async (list) => {
    if (!list.length || SENDING) return;
    if (live() && !confirm(`Send ${list.length} emails to students now? Each student gets only their own card.`)) return;
    if (mode() === "outlook" && !confirm(`Make ${list.length} Outlook emails? Each one downloads as a file — open it in Outlook and press Send. If the browser asks to download multiple files, choose Allow.`)) return;
    SENDING = { stop: false };
    $("#mGo").disabled = true;
    $("#sendLog").innerHTML = `<div class="card sendbox"><div class="sendtop"><b id="sgT">${mode() === "auto" ? "Sending…" : "Making emails…"}</b><button class="link danger" id="sgStop">Stop</button></div><div class="rvprog"><i id="sgBar"></i></div><div class="sglist" id="sgList"></div></div>`;
    $("#sgStop").onclick = () => { SENDING.stop = true; $("#sgT").textContent = "Stopping after the current email…"; };
    $("#sendLog").scrollIntoView({ behavior: "smooth", block: "start" });
    let done = 0, ok = 0, bad = 0; busy(true);
    const one = async (c) => {
      const row = document.createElement("div"); row.className = "sgrow"; row.innerHTML = `<span class="spin"></span><b>${esc(c.name)}</b><span class="muted">${esc(c.sid || "")} · ${esc(c.email)}</span>`; $("#sgList")?.prepend(row);
      busyIds.add(c.id);
      try {
        const j = mode() === "auto" ? await sendOne(e, c) : await prepareEmail(e, c, mode()); ok++;
        if (j.mode === "outlook") await new Promise(r => setTimeout(r, 350));   // a short gap so the browser keeps every file
        row.innerHTML = `<span class="okdot">✓</span><b>${esc(c.name)}</b><span class="muted">${esc(c.sid || "")} · ${j.mode === "outlook" ? "Outlook email made" : j.mode === "test" ? "saved to " + esc(j.saved) : esc(c.email)}</span>`;
      } catch (err) {
        Object.assign(c, { state: "failed", error: err.message }); bad++;
        row.innerHTML = `<span class="baddot">!</span><b>${esc(c.name)}</b><span class="danger">${esc(err.message)}</span>`;
      }
      busyIds.delete(c.id); done++; if ($("#sgBar")) $("#sgBar").style.width = (100 * done / list.length) + "%"; save();
      const el = $(`#sGrid .sbox[data-c="${CSS.escape(c.id)}"]`); if (el) el.outerHTML = box(c);
    };
    const queue = list.slice();
    const lanes = mode() !== "auto" || SERVER.site === "vercel" ? [0] : [0, 1];   // website: one at a time, ~2 s apart (Microsoft allows ~30 a minute)
    await Promise.all(lanes.map(async () => { while (queue.length && !SENDING.stop) { await one(queue.shift()); if (mode() === "auto" && SERVER.site === "vercel" && queue.length) await new Promise(r => setTimeout(r, 2100)); } }));
    busy(false); SENDING = null;
    const did = mode() === "outlook" ? "Outlook emails made — open each and press Send" : live() ? "sent" : "created in outbox";
    if ($("#sgT")) { $("#sgT").textContent = `${ok} ${did}${bad ? ` · ${bad} failed` : ""}${done < list.length ? ` · ${list.length - done} not sent (stopped)` : ""}`; $("#sgStop")?.remove(); }
    toast(`${ok} email${ok === 1 ? "" : "s"} ${mode() === "outlook" ? "made for Outlook" : live() ? "sent" : "saved to outbox"}${bad ? ` · ${bad} failed` : ""}`);
    if (cur === e && !$("#adm-edit").classList.contains("hide")) { renderCands(); refreshPipeline(); }
    setTimeout(() => { if ($("#sheet").classList.contains("on") && $("#sheet").dataset.mode === "send" && !SENDING) redraw(); }, 900);
  };
  if (!$("#sheet").classList.contains("on")) openSheet(""); else $("#sheet").scrollTop = 0;
  $("#sheet").dataset.mode = "send"; $("#sheet").classList.add("wide");
  draw();
}

/* keep the editor in sync when sheets close */
const _closeSheet = closeSheet;
closeSheet = function () {
  const mode = $("#sheet").dataset.mode;
  $("#sheet").dataset.mode = ""; $("#sheet").classList.remove("wide"); $("#sheet").onkeydown = null;
  _closeSheet();
  if ((mode === "review" || mode === "send") && cur && !$("#adm-edit").classList.contains("hide")) renderEditor();
  if (currentTab === "home" && !$("#v-profile").classList.contains("hide")) refreshProfile();
};
$("#scrim").onclick = () => closeSheet();

/* ================= SETTINGS (Data tab) ================= */
async function renderMailSettings() {
  const box = $("#mailSettings"); if (!box) return;
  await checkServer();
  const st = DB.settings;
  const none = SERVER?.mode === "none";
  const status = !SERVER ? `<span class="chip c-red">Not running</span>` : none ? `<span class="chip c-red">Not set up on the website</span>` : SERVER.mode === "test" ? `<span class="chip c-orange">Test mode · outbox</span>`
    : `<span class="chip c-green">${SERVER.mode === "graph" ? "Microsoft 365" : "SMTP"} · ${esc(SERVER.from)}</span>`;
  box.innerHTML = `
    <div class="field"><span class="lab">Email server</span><span style="flex:1;text-align:right">${status}</span>${SERVER?.mode === "graph" ? `<button class="btn small" id="sCheck">Check sign-in</button>` : ""}</div>
    <div class="field"><label for="sSup">Supervisor</label><input id="sSup" value="${esc(st.supervisor)}" placeholder="Name used on approvals"></div>
    <div class="field"><label for="sPin">Supervisor PIN</label><input id="sPin" type="password" value="${esc(st.pin)}" placeholder="optional" autocomplete="new-password"></div>
    <div class="field"><label for="sTest">Send a test to</label><input id="sTest" type="email" placeholder="you@example.com"><button class="btn small" id="sTestGo" ${SERVER && !none ? "" : "disabled"}>Test</button></div>
    <div class="note" style="margin:8px 0 12px">${none ? "To email admission cards from the website, add the four Microsoft 365 settings (<code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code>, <code>MS_CLIENT_SECRET</code>, <code>MS_SENDER</code>) in Vercel → Settings → Environment Variables and redeploy. PDFs and <b>Download all</b> work without it." : SERVER ? (SERVER.mode === "test" ? "Running in test mode: emails are written to the <code>outbox</code> folder. To send from Microsoft 365, copy <code>.env.example</code> to <code>.env</code>, fill in the four <code>MS_</code> values from your IT admin and restart <code>npm start</code>." : SERVER.mode === "graph" ? "Emails are sent from the Microsoft 365 mailbox above and saved in its Sent Items." : "Emails are sent through SMTP.") : "Start the app with <code>npm start</code> in the student-hub folder to enable PDF files and email."} The PIN only stops casual approvals in this browser.</div>`;
  if ($("#sCheck")) $("#sCheck").onclick = async () => {
    busy(true);
    try { const j = await fetch("/api/mail-check").then(r => r.json()); if (!j.ok) throw new Error(j.error); toast(j.note); }
    catch (e) { toast(e.message); } finally { busy(false); }
  };
  $("#sSup").oninput = ev => { st.supervisor = ev.target.value.trim(); saveSoon(); };
  $("#sPin").oninput = ev => { st.pin = ev.target.value; try { sessionStorage.removeItem("sup-ok"); } catch { } saveSoon(); };
  $("#sTestGo").onclick = async () => {
    const to = $("#sTest").value.trim(); if (!isEmail(to)) return toast("Enter a valid email");
    busy(true);
    try { const r = await fetch("/api/test-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }); const j = await r.json(); if (!j.ok) throw new Error(j.error); toast(j.mode === "test" ? "Test saved to " + j.saved : "Test email sent"); }
    catch (e) { toast("Failed: " + e.message); } finally { busy(false); }
  };
}
const _renderData = renderData;
renderData = function () { _renderData(); renderMailSettings(); };
