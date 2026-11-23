/* CIT Student Hub — admission details check (UI). Checks only what's in the admission Excel, shown as a simple
   table like the Excel with problem cells highlighted. Opens after an Excel is imported, from the bar in the
   exam, and inside supervisor review ("must fix" problems block approval). */
"use strict";
const AC = window.AdmCheck;
const admIssues = (e, c) => AC.candidateIssues(e, c);

/* supervisor review: Excel problems block approval, "check" items are shown */
const _checksAC = checks;
checks = function (e, c) {
  const base = _checksAC(e, c);
  const BASE = new Set(["noName", "badEmail", "noIndex", "dupIndex", "noPaper"]);   // already in the review's own checks
  const extra = admIssues(e, c).filter(i => !BASE.has(i.code)).map(i => i.level === "error" ? [false, i.text] : [true, i.text, "warn"]);
  return [...base, ...extra];
};

function openAdmCheck(e, opts = {}) {
  if (!e?.candidates?.length) return toast("Add candidates first");
  let filter = "problems";
  const R = () => AC.examReport(e);
  openSheet(`<div class="bar-top"><div><b style="font-size:17px">Check the Excel details</b><div class="muted">${esc(e.source || "Admission Excel")} · ${esc(e.heading || e.level)}${opts.afterImport ? " · just imported" : ""}</div></div>${closeBtn}</div>
    <div id="acSum"></div><div class="seg" id="acSeg" style="margin-top:12px"></div><div id="acBody" style="margin-top:12px"></div>
    <div class="actions" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><button class="btn" id="acExport">Download this list</button>
      <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="acReview">Review one by one</button><button class="btn primary" id="acQuick"></button></span></div>
    <div id="acQuickNote" class="muted" style="font-size:13px;text-align:right;margin-top:-4px"></div>`);
  $("#sheet").classList.add("wide");
  const fromRec = c => c.emailFromRecords && c.emailFromRecords === c.email;
  const papers = c => { const x = e.subjects.filter(s => c.status?.[s.id] === "X").length, ex = e.subjects.filter(s => c.status?.[s.id] === "Exempted").length; return `${x} ×${ex ? ` · ${ex} exempt` : ""}`; };
  const draw = () => {
    const r = R();
    $("#acSum").innerHTML = `<div class="acsum">
        <div><b>${r.rows.length}</b><span>students in the Excel</span></div>
        <div class="ok"><b>${r.clean}</b><span>all correct</span></div>
        <div class="bad"><b>${r.errors}</b><span>need fixing</span></div>
        <div class="warn"><b>${r.warns}</b><span>please check</span></div></div>
      ${(() => { const n = e.candidates.filter(fromRec).length; return n ? `<div class="note fromnote" style="margin-top:10px"><b>${plural(n, "email")}</b> ${n === 1 ? "wasn't" : "weren't"} in the Excel — the app used the email saved in ${n === 1 ? "that student's" : "those students'"} record (from the registration files). They're marked <span class="fromrec">blue</span> below. Add the email to the Excel if you want to use a different one.</div>` : ""; })()}
      <div class="note" style="margin-top:10px">${r.errors ? `<b>Red</b> cells must be fixed before those cards can be approved — correct them in the Excel and import it again, or edit the student in the exam. <b>Orange</b> cells are only worth a quick look.` : r.warns ? "Nothing must be fixed. <b>Orange</b> cells are only worth a quick look." : "Every row in the Excel looks correct."}</div>`;
    const segs = [["problems", "Need fixing", r.errors], ["warn", "Please check", r.warns], ["all", "All students", r.rows.length]];
    $("#acSeg").innerHTML = segs.map(([k, t, n]) => `<button data-f="${k}" class="${k === filter ? "on" : ""}">${t} <span class="muted">${n}</span></button>`).join("");
    const rows = r.rows.map((x, i) => ({ ...x, n: i + 1 })).filter(x => filter === "all" || (filter === "problems" ? x.issues.some(i => i.level === "error") : x.issues.length && !x.issues.some(i => i.level === "error")));
    const cell = (x, field, val, extra = "") => {
      const is = x.issues.filter(i => i.field === field), lv = is.some(i => i.level === "error") ? "bad" : is.length ? "warn" : "";
      const nw = ["sid", "index", "phone", "nic", "papers"].includes(field) ? " nw" : "";
      return `<td class="${lv}${nw}" title="${esc(is.map(i => i.text).join(" · "))}">${esc(val || "—")}${extra}</td>`;
    };
    $("#acBody").innerHTML = rows.length ? `<div class="card acwrap"><table class="actab">
      <thead><tr><th>#</th><th>Name</th><th>Student no</th><th>Index no</th><th>Email</th><th>Phone</th><th>NIC</th><th>Subjects</th><th>Result</th></tr></thead>
      <tbody>${rows.map(x => `<tr>
        <td class="n">${x.n}</td>${cell(x, "name", x.c.name)}${cell(x, "sid", x.c.sid)}${cell(x, "index", x.c.index)}${cell(x, "email", x.c.email, fromRec(x.c) ? `<small class="fromrec">not in the Excel — from student records</small>` : "")}${cell(x, "phone", x.c.phone)}${cell(x, "nic", x.c.nic)}${cell(x, "papers", papers(x.c))}
        <td class="res">${x.issues.length ? x.issues.map(i => `<div class="${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"} ${esc(i.text)}</div>`).join("") : `<div class="ok">✓ Correct</div>`}</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="card empty-hero"><div class="eh-ic ok">✓</div><b>${filter === "problems" ? "Nothing needs fixing" : filter === "warn" ? "Nothing to check" : "No students"}</b></div>`;
  };
  const r0 = R(); if (!r0.errors) filter = r0.warns ? "warn" : "all";
  draw();
  $("#acSeg").onclick = ev => { const b = ev.target.closest("[data-f]"); if (b) { filter = b.dataset.f; draw(); } };
  $("#acReview").onclick = () => { closeSheet(); openReview(e); };
  quickButton(e, $("#acQuick"), $("#acQuickNote"));
  $("#acExport").onclick = () => {
    const rows = R().rows.map(({ c, issues }, i) => ({ "#": i + 1, Name: c.name, "Student no": c.sid, "Index no": c.index, Email: c.email, Phone: c.phone, NIC: c.nic,
      Result: issues.length ? issues.map(x => (x.level === "error" ? "FIX: " : "CHECK: ") + x.text).join("; ") : "Correct" }));
    xlsxDownload(rows, "Check", `admission-check-${(e.level || "exam").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
}

/* one click after creating: approve every card that passes all checks, then open the email step (you press Send).
   Cards with problems stay "To review". The supervisor sign-in still applies. */
function quickState(e) {
  const missing = e.subjects.filter(s => !s.date).length;
  const ready = e.candidates.filter(c => (c.state || "draft") === "draft" && passes(e, c)).length;
  const approved = countState(e, "approved");
  return { missing, ready, approved };
}
function quickButton(e, btn, note) {
  if (!btn) return;
  const q = quickState(e);
  if (q.missing) {
    btn.textContent = "Approve & email…"; btn.disabled = true;
    if (note) note.textContent = `Fill in the timetable first (${q.missing} subject${q.missing === 1 ? "" : "s"} without a date), then email the cards.`;
  } else if (!q.ready && q.approved) {
    btn.textContent = `Email ${q.approved} approved card${q.approved === 1 ? "" : "s"}`; btn.disabled = false;
    btn.onclick = () => { closeSheet(); setTimeout(() => openSend(e), 250); };
  } else {
    btn.textContent = `Approve ${q.ready} & email`; btn.disabled = !q.ready;
    if (note) note.textContent = q.ready ? `Approves the ${q.ready} card${q.ready === 1 ? "" : "s"} that pass every check, then shows the email — nothing is sent until you press Send.` : "No cards pass every check yet.";
    btn.onclick = () => approveAndEmail(e);
  }
}
function approveAndEmail(e) {
  supervisorGate(() => {
    const t = Date.now(), list = e.candidates.filter(c => (c.state || "draft") === "draft" && passes(e, c));
    if (!list.length && !countState(e, "approved")) return toast("No cards pass every check yet");
    list.forEach(c => Object.assign(c, { state: "approved", approvedBy: DB.settings.supervisor, approvedAt: t, note: "", outdated: false }));
    save(); if (cur === e && !$("#adm-edit").classList.contains("hide")) renderEditor();
    if (list.length) toast(`${list.length} card${list.length === 1 ? "" : "s"} approved by ${DB.settings.supervisor}`);
    setTimeout(() => openSend(e), 250);
  });
}

/* exam editor: summary line + "Check details" button */
const _renderEditorAC = renderEditor;
renderEditor = function () {
  _renderEditorAC();
  const e = cur; if (!e?.candidates?.length) return;
  const r = AC.examReport(e);
  const tb = $("#adm-edit .toolbar");
  tb?.insertAdjacentHTML("beforebegin", `<button class="acbanner ${r.errors ? "bad" : r.warns ? "warn" : "ok"}" id="acOpen">
    <b>${r.errors ? `Excel check: ${r.errors} student${r.errors === 1 ? "" : "s"} need fixing` : r.warns ? `Excel check: ${r.warns} to have a quick look at` : "Excel check: every row is correct"}</b>
    <span>${r.clean} of ${r.rows.length} correct${r.errors && r.warns ? ` · ${r.warns} to look at` : ""} · tap to see the list</span></button>`);
  $("#acOpen").onclick = () => openAdmCheck(e);
  // quick "Approve & email" next to the check summary
  $("#acOpen").insertAdjacentHTML("afterend", `<div class="acquick"><button class="btn primary small" id="acQuick2"></button><span class="muted" id="acQuickNote2"></span></div>`);
  quickButton(e, $("#acQuick2"), $("#acQuickNote2"));
};
