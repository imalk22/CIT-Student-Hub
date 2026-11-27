/* CIT Student Hub — "Email exam results": drop the results Excel, the app writes a personal email for every
   student with their own marks and result, and you send each one (Open in Outlook / email app / automatically).
   The batches are kept (DB.resultMails) so you can come back and see who has been done. */
"use strict";
const RM = window.ResultMail;
const resTpl = () => ({ ...RM.DEFAULT_TPL, ...(DB.settings?.resultTpl || {}) });

/* send / prepare ONE results email (no attachment) */
async function deliverResultEmail(msg, mode) {
  if (mode === "auto") {
    const r = await fetch("/api/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...msg, attachments: [] }) });
    const j = await r.json().catch(() => ({ ok: false, error: r.statusText }));
    if (!r.ok || !j.ok) throw new Error(j.error || "Server error");
    return j.mode || "auto";
  }
  if (mode === "mailto") {
    const q = new URLSearchParams({ subject: msg.subject, body: msg.text.slice(0, 1800) + (msg.text.length > 1800 ? "…" : "") });
    if (msg.cc) q.set("cc", msg.cc);
    location.href = `mailto:${encodeURIComponent(msg.to)}?${q.toString().replace(/\+/g, "%20")}`;
    return "mailto";
  }
  download(`${msg.fileBase} - results email.eml`, emlFile({ to: msg.to, cc: msg.cc, subject: msg.subject, text: msg.text, html: msg.html }));
  return "outlook";
}

async function importResultsForEmail(file) {
  let wb; try { busy(true); wb = await readSheetFile(file); } catch (err) { return toast(err.message); } finally { busy(false); }
  let b; try { b = RM.parseWorkbook(XLSX, wb, file.name); } catch (err) { return toast(err.message); }
  // no email in the Excel → use the one saved in the student's record (and say so)
  const byId = new Map(DB.students.map(s => [s.id.toUpperCase(), s]));
  for (const r of b.rows) {
    r.id = uid(); r.state = "";
    if (!RM.isEmail(r.email)) { const e = byId.get(r.sid)?.contact?.email; if (RM.isEmail(e)) { r.email = e; r.emailFromRecords = e; } }
  }
  const batch = { id: uid(), file: file.name, title: b.title, exam: b.exam, level: b.level, sheet: b.sheet, subjects: b.subjects, rows: b.rows, created: Date.now() };
  DB.resultMails ||= []; DB.resultMails.unshift(batch); save();
  if (currentTab === "adm") renderResultBatches();
  toast(`${b.rows.length} students read from ${b.sheet} — an email is ready for each`);
  openResultMails(batch);
}

function openResultMails(batch) {
  let filter = "all", q = "";
  const busyIds = new Set();
  const mode = () => sendMode();
  const canAuto = () => SERVER && SERVER.mode !== "none";
  const when = t => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const msgFor = r => { const m = RM.compose(batch, r, resTpl()); return { ...m, to: r.email.trim(), cc: batch.cc || undefined, fileBase: String(r.sid || r.index || r.name).replace(/[\\/:*?"<>|]+/g, "-") }; };
  const kindChip = r => { const k = RM.outcome(r), label = RM.overallLabel(r); return `<span class="chip ${k === "completed" ? "c-green" : k === "absent" ? "c-gray" : /fail/i.test(label) ? "c-red" : "c-orange"}">${esc(label)}</span>`; };
  const box = r => {
    const ok = RM.isEmail(r.email), b = busyIds.has(r.id);
    const verb = mode() === "outlook" ? "Open in Outlook" : mode() === "mailto" ? "Open email" : "Send";
    return `<div class="sbox rbox st-${r.state || "draft"}" data-r="${esc(r.id)}">
      <div class="sb-top"><span class="dc-av" style="background:${color(r.name)}">${esc(initials(r.name) || "?")}</span>
        <span class="sb-id"><b>${esc(r.name)}</b><span class="dc-no">${esc(r.sid || "no student no")}</span></span>${kindChip(r)}</div>
      <div class="sb-rows"><div><small>Index no</small><span>${esc(r.index || "—")}</span></div>
        <div><small>Email</small><span class="${ok ? "" : "danger"}">${esc(r.email || "no email")}</span></div>
        ${r.emailFromRecords && r.emailFromRecords === r.email ? `<div><small></small><span class="fromrec">from student records (not in the Excel)</span></div>` : ""}</div>
      <div class="rsubs">${r.results.map(x => `<span class="rs ${/^pass$/i.test(x.status) ? "p" : /fail/i.test(x.status) ? "f" : /absent|not taken/i.test(x.status) ? "a" : "e"}" title="${esc(x.name)}: ${esc(x.status)}">${esc(x.code || x.name)}<b>${x.marks != null ? esc(String(Math.round(x.marks * 100) / 100)) : /^pass$/i.test(x.status) ? "✓" : /fail/i.test(x.status) ? "✕" : /absent/i.test(x.status) ? "AB" : /not taken/i.test(x.status) ? "–" : "EX"}</b></span>`).join("")}</div>
      ${r.state === "sent" ? `<div class="sb-note ok">✓ ${r.sentMode === "manual" ? "Marked as sent" : "Emailed"} ${when(r.sentAt)}</div>` : ""}
      ${r.state === "prepared" ? `<div class="sb-note prep">${r.preparedMode === "mailto" ? "Opened in the email app" : "Outlook email made"} ${when(r.preparedAt)} — press Send there. <button class="link" data-a="mark">Mark as sent</button></div>` : ""}
      ${r.state === "failed" ? `<div class="sb-note bad">! ${esc(r.error || "Failed")}</div>` : ""}
      <div class="sb-acts"><button class="btn small" data-a="view">View email</button><span style="flex:1"></span>
        <button class="btn small primary" data-a="send" ${b || !ok || (mode() === "auto" && !canAuto()) ? "disabled" : ""}>${b ? '<span class="spin"></span> Working…' : (r.state === "sent" || r.state === "prepared") ? (mode() === "auto" ? "Resend" : verb + " again") : verb}</button></div>
    </div>`;
  };
  const counts = () => {
    const k = { completed: 0, referred: 0, absent: 0 }; batch.rows.forEach(r => k[RM.outcome(r)]++);
    return { ...k, done: batch.rows.filter(r => r.state === "sent" || r.state === "prepared").length, noMail: batch.rows.filter(r => !RM.isEmail(r.email)).length,
      todo: batch.rows.filter(r => RM.isEmail(r.email) && r.state !== "sent" && r.state !== "prepared").length };
  };
  const draw = () => {
    const c = counts(), T = resTpl();
    const qq = norm(q);
    const list = batch.rows.filter(r => (filter === "all" || (filter === "done" ? (r.state === "sent" || r.state === "prepared") : filter === "nomail" ? !RM.isEmail(r.email) : RM.outcome(r) === filter))
      && (!qq || norm(r.name + " " + r.sid + " " + r.index + " " + r.email).includes(qq)));
    $("#sheet").innerHTML = `<div class="grab"></div><div class="bar-top"><div><b style="font-size:17px">Email exam results</b><div class="muted">${esc(batch.title)} · ${esc(batch.file)}</div></div>${closeBtn}</div>
      <div class="acsum">
        <div><b>${batch.rows.length}</b><span>students</span></div>
        <div class="ok"><b>${c.completed}</b><span>completed</span></div>
        <div class="warn"><b>${c.referred}</b><span>referred / fail</span></div>
        <div><b>${c.absent}</b><span>absent</span></div></div>
      <div class="sendhow"><small class="k" style="margin:0 0 6px">How to send</small>
        <div class="seg" id="rMode">${Object.entries(SEND_MODES).map(([k, [t]]) => `<button data-m="${k}" class="${k === mode() ? "on" : ""}" ${k === "auto" && !canAuto() ? "disabled" : ""}>${t}${k === "auto" && !canAuto() ? " · not set up" : ""}</button>`).join("")}</div>
        <div class="muted" style="font-size:13px;margin-top:6px">${mode() === "outlook" ? "Makes a ready email for each student with their results. Outlook opens it — check it and press Send." : mode() === "mailto" ? "Opens your email app with the student's results written in. Press Send there." : "Sends straight away from the Microsoft 365 mailbox."}</div></div>
      <details class="mprev msgbox"><summary>Message wording <span class="muted">· the same short message for everyone, followed by their own results</span></summary>
        <div class="card form" style="margin-top:8px">
          <div class="field stack"><label>Subject</label><input class="inp" data-t="subject" value="${esc(T.subject)}"></div>
          <div class="field stack"><label>Message <span class="muted">· shown above the student's results table</span></label><textarea rows="3" data-t="message">${esc(T.message)}</textarea></div>
          <div class="field stack"><label>Closing / signature</label><textarea rows="5" data-t="closing">${esc(T.closing)}</textarea></div>
          <div class="field"><label>Copy to (CC)</label><input id="rCc" type="email" value="${esc(batch.cc || "")}" placeholder="optional, e.g. exams office"></div>
          <div class="field"><span class="muted" style="font-size:12.5px">Words in {brackets} are filled in for each student: {name} {level} {exam} {studentNo} {index} {result}</span><button class="link" id="rReset">Back to the standard wording</button></div>
        </div></details>
      <div class="sbtools">
        <div class="seg" id="rSeg">${[["all", "All", batch.rows.length], ["completed", "Completed", c.completed], ["referred", "Referred / Fail", c.referred], ["absent", "Absent", c.absent], ["done", "Done", c.done], ["nomail", "No email", c.noMail]].map(([k, t, n]) => `<button data-f="${k}" class="${k === filter ? "on" : ""}">${t} <span class="muted">${n}</span></button>`).join("")}</div>
        <div class="search dsearch"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="rQ" type="search" placeholder="Search name, student no, index or email" value="${esc(q)}"></div>
      </div>
      <div class="sgrid" id="rGrid">${list.map(box).join("") || `<div class="card empty dg-full">No students here.</div>`}</div>
      <div id="rLog"></div>
      <div class="actions sendbar"><span class="muted">${c.noMail ? `${plural(c.noMail, "student")} without an email will be skipped · ` : ""}Each student gets only their own results.</span><span style="flex:1"></span>
        <button class="btn danger" id="rDel">Delete this list</button>
        <button class="btn primary" id="rAll" ${c.todo && mode() !== "mailto" && !(mode() === "auto" && !canAuto()) ? "" : "disabled"}>${mode() === "outlook" ? "Make Outlook emails for" : mode() === "mailto" ? "Open email for" : "Send"} all ${c.todo}</button></div>`;
    $("#sheet").dataset.mode = "results";
    $$("#sheet [data-t]").forEach(el => el.oninput = () => { DB.settings.resultTpl = { ...(DB.settings.resultTpl || {}), [el.dataset.t]: el.value }; saveSoon(); });
    $("#rCc").oninput = ev => { batch.cc = ev.target.value.trim(); saveSoon(); };
    $("#rReset").onclick = () => { delete DB.settings.resultTpl; save(); redraw(); toast("Standard wording restored"); };
    $("#rMode").onclick = ev => { const b = ev.target.closest("[data-m]"); if (!b || b.disabled) return; DB.settings.sendMode = b.dataset.m; save(); redraw(); };
    $("#rSeg").onclick = ev => { const b = ev.target.closest("[data-f]"); if (b) { filter = b.dataset.f; redraw(); } };
    $("#rQ").oninput = ev => { q = ev.target.value; const pos = ev.target.selectionStart; redraw(); const i = $("#rQ"); i.focus(); i.setSelectionRange(pos, pos); };
    $("#rDel").onclick = () => { if (!confirm(`Delete this results email list (${batch.rows.length} students)? The Excel itself isn't affected.`)) return; DB.resultMails = DB.resultMails.filter(x => x !== batch); save(); closeSheet(); renderResultBatches(); };
    $("#rAll").onclick = () => runAll();
    $$("#rGrid .rbox").forEach(el => el.onclick = ev => {
      const btn = ev.target.closest("[data-a]"); if (!btn) return;
      const r = batch.rows.find(x => x.id === el.dataset.r); if (!r) return;
      if (btn.dataset.a === "view") return viewEmail(r);
      if (btn.dataset.a === "send") return one(r, true);
      if (btn.dataset.a === "mark") { Object.assign(r, { state: "sent", sentAt: Date.now(), sentMode: "manual" }); save(); redraw(); }
    });
  };
  const redraw = () => { const sh = $("#sheet"), top = sh.scrollTop, log = $("#rLog")?.innerHTML || ""; draw(); $("#rLog").innerHTML = log; sh.scrollTop = top; };
  const viewEmail = r => {
    const m = msgFor(r), ov = document.createElement("div"); ov.className = "cardview";
    ov.innerHTML = `<div class="cv-in"><div class="cv-bar"><div style="min-width:0"><b>${esc(r.name)}</b><div class="muted" style="font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">To: ${esc(r.email || "—")} · Subject: ${esc(m.subject)}</div></div><span style="flex:1"></span><button class="btn small" id="cvX">Close</button></div>
      <div class="cv-pages" style="background:#fff">${m.html}</div></div>`;
    document.body.appendChild(ov);
    ov.onclick = ev => { if (ev.target === ov) ov.remove(); }; $("#cvX", ov).onclick = () => ov.remove();
  };
  const one = async (r, single) => {
    if (!RM.isEmail(r.email)) return toast("This student has no valid email");
    if (single && mode() === "auto" && SERVER?.mode !== "test" && !confirm(`Send the results email to ${r.name} (${r.email})?`)) return;
    busyIds.add(r.id); if (single) redraw();
    try {
      const how = await deliverResultEmail(msgFor(r), mode());
      if (how === "outlook" || how === "mailto") Object.assign(r, { state: "prepared", preparedAt: Date.now(), preparedMode: how, error: "" });
      else Object.assign(r, { state: "sent", sentAt: Date.now(), sentMode: how, error: "" });
      if (single) toast(how === "outlook" ? `Outlook email for ${r.name} downloaded — open it and press Send` : how === "mailto" ? `Email app opened for ${r.name}` : `Sent to ${r.name}`);
    } catch (err) { Object.assign(r, { state: "failed", error: err.message }); if (single) toast("Failed: " + err.message); }
    busyIds.delete(r.id); save();
    if (single && $("#sheet").dataset.mode === "results") redraw();
  };
  let running = false;
  const runAll = async () => {
    const list = batch.rows.filter(r => RM.isEmail(r.email) && r.state !== "sent" && r.state !== "prepared");
    if (!list.length || running) return;
    if (mode() === "outlook" && !confirm(`Make ${list.length} Outlook emails? Each one downloads as a file — open it in Outlook and press Send. If the browser asks to download multiple files, choose Allow.`)) return;
    if (mode() === "auto" && SERVER?.mode !== "test" && !confirm(`Send ${list.length} results emails now? Each student gets only their own results.`)) return;
    running = true; let stop = false, done = 0, bad = 0;
    $("#rLog").innerHTML = `<div class="card sendbox"><div class="sendtop"><b id="rT">${mode() === "auto" ? "Sending…" : "Making emails…"}</b><button class="link danger" id="rStop">Stop</button></div><div class="rvprog"><i id="rBar"></i></div></div>`;
    $("#rStop").onclick = () => { stop = true; };
    $("#rAll").disabled = true;
    for (const r of list) {
      if (stop || $("#sheet").dataset.mode !== "results") break;
      await one(r, false); done++; if (r.state === "failed") bad++;
      if ($("#rBar")) $("#rBar").style.width = (100 * done / list.length) + "%";
      const el = $(`#rGrid .rbox[data-r="${CSS.escape(r.id)}"]`); if (el) el.outerHTML = box(r);
      await new Promise(ok => setTimeout(ok, mode() === "auto" && SERVER?.site === "vercel" ? 2100 : 350));
    }
    running = false;
    const did = mode() === "outlook" ? "Outlook emails made — open each and press Send" : mode() === "auto" ? "sent" : "done";
    if ($("#rT")) { $("#rT").textContent = `${done - bad} ${did}${bad ? ` · ${bad} failed` : ""}${done < list.length ? ` · ${list.length - done} not done (stopped)` : ""}`; $("#rStop")?.remove(); }
    toast(`${done - bad} results email${done - bad === 1 ? "" : "s"} ${mode() === "outlook" ? "made for Outlook" : did}`);
    setTimeout(() => { if ($("#sheet").dataset.mode === "results") redraw(); }, 600);
    renderResultBatches();
  };
  checkServer().then(() => { if (!$("#sheet").classList.contains("on")) openSheet(""); $("#sheet").classList.add("wide"); draw(); });
}

/* Admissions page: drop zone + earlier lists */
function renderResultBatches() {
  const box = $("#resBatches"); if (!box) return;
  const L = DB.resultMails || [];
  box.innerHTML = L.length ? L.map(b => { const done = b.rows.filter(r => r.state === "sent" || r.state === "prepared").length;
    return `<button class="row action" data-b="${esc(b.id)}"><span class="ic" style="background:var(--green)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg></span>
      <span class="t"><b>${esc(b.title)}</b><span>${plural(b.rows.length, "student")} · ${done} of ${b.rows.filter(r => RM.isEmail(r.email)).length} emailed · ${new Date(b.created).toLocaleDateString("en-GB")}</span></span><span class="chev">›</span></button>`; }).join("")
    : `<div class="empty" style="padding:14px 4px">No results emailed yet.</div>`;
  $$("#resBatches [data-b]").forEach(b => b.onclick = () => openResultMails(L.find(x => x.id === b.dataset.b)));
}
(function setupResultsDrop() {
  const anchor = $("#exams"); if (!anchor) return;
  anchor.insertAdjacentHTML("afterend", `<div class="h2row"><h2>Email exam results</h2></div>
    <div class="card drop" id="resDrop"><div class="dropicon" style="color:var(--green)"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/></svg></div>
      <b>Send each student their results</b><span>Drop the results Excel (e.g. <i>Results_Analyst_Level_2…xlsx</i>) — a personal email is written for every student, or <label class="link">choose a file<input type="file" id="resFile" accept=".xlsx,.xls" hidden></label></span></div>
    <div class="card list" id="resBatches" style="margin-top:10px"></div>`);
  const d = $("#resDrop");
  ["dragenter", "dragover"].forEach(t => d.addEventListener(t, e => { e.preventDefault(); d.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => d.addEventListener(t, e => { e.preventDefault(); d.classList.remove("over"); }));
  d.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) importResultsForEmail(f); });
  $("#resFile").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) importResultsForEmail(f); };
})();
const _renderAdmissionsRM = renderAdmissions;
renderAdmissions = function () { _renderAdmissionsRM(); renderResultBatches(); };
