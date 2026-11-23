/* CIT Student Hub — admission details check (UI). Runs automatically after an admission Excel is imported,
   from "Check details" in the exam editor, and inside supervisor review (errors block approval). */
"use strict";
const AC = window.AdmCheck;

let _acIdx = null;
function admCtx() {
  if (!_acIdx || _acIdx.arr !== DB.students || _acIdx.n !== DB.students.length) _acIdx = { arr: DB.students, n: DB.students.length, map: new Map(DB.students.map(s => [s.id.toLowerCase(), s])) };
  const byId = _acIdx.map;
  return c => {
    const st = c.sid ? byId.get(String(c.sid).toLowerCase()) || null : null;
    return {
      student: st,
      finance: st && typeof xeroFor === "function" ? xeroFor("student", st.id) : null,
    };
  };
}
const admIssues = (e, c) => AC.candidateIssues(e, c, admCtx()(c));

/* supervisor review: details errors block approval, warnings are shown */
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
  const ctx = admCtx();
  const R = () => AC.examReport(e, ctx);
  openSheet(`<div class="bar-top"><div><b style="font-size:17px">Check admission details</b><div class="muted">${esc(e.heading || e.level)}${opts.afterImport ? " · just imported" : ""}</div></div>${closeBtn}</div>
    <div id="acSum"></div><div class="seg" id="acSeg" style="margin-top:12px"></div><div id="acBody" style="margin-top:12px"></div>
    <div class="actions" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><button class="btn" id="acExport">Export issues</button>
      <span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="acReview">Review one by one</button><button class="btn primary" id="acQuick"></button></span></div>
    <div id="acQuickNote" class="muted" style="font-size:13px;text-align:right;margin-top:-4px"></div>`);
  $("#sheet").classList.add("wide");
  const draw = () => {
    const r = R();
    $("#acSum").innerHTML = `<div class="imp-sum"><div><b>${r.rows.length}</b><span>candidates</span></div><div><b style="color:var(--green)">${r.clean}</b><span>all good</span></div>
      <div><b style="color:var(--orange)">${r.warns}</b><span>to double-check</span></div><div><b style="color:var(--red)">${r.errors}</b><span>must fix</span></div></div>
      ${r.errors ? `<div class="note" style="margin-top:10px">Cards with <b>must fix</b> problems can't be approved until they're corrected.</div>` : !r.warns ? `<div class="note" style="margin-top:10px">Every candidate matches their profile and the sheet looks consistent.</div>` : ""}`;
    const segs = [["problems", "Must fix", r.errors], ["warn", "Double-check", r.warns], ["all", "All", r.rows.length]];
    $("#acSeg").innerHTML = segs.map(([k, t, n]) => `<button data-f="${k}" class="${k === filter ? "on" : ""}">${t} <span class="muted">${n}</span></button>`).join("");
    const list = r.rows.filter(x => filter === "all" || (filter === "problems" ? x.issues.some(i => i.level === "error") : x.issues.length && !x.issues.some(i => i.level === "error")));
    $("#acBody").innerHTML = list.length ? `<div class="card list">${list.map(({ c, issues }) => {
      const st = ctx(c).student, p = c.prev || {};
      const cmp = st ? `<table class="actable"><tr><th></th><th>Excel</th><th>Profile</th></tr>
        ${[["Name", c.name, p.name || st.name], ["Student no", c.sheetSid || c.sid, st.id], ["Email", c.email, p.email], ["Phone", c.phone, p.phone], ["NIC", c.nic, p.nic]]
          .map(([k, a, b]) => `<tr class="${a && b && norm(a) !== norm(b) ? "diff" : ""}"><td>${k}</td><td>${esc(a || "—")}</td><td>${esc(b || "—")}</td></tr>`).join("")}</table>
        ${st ? `<button class="link" data-open="${esc(st.id)}">Open profile ›</button>` : ""}` : "";
      return `<details class="acrow"><summary><span class="t"><b>${esc(c.name || "No name")}</b><span>${esc(c.index || "no index")} · ${esc(c.sid || "no student no")}</span></span>
        <span class="acchips">${issues.length ? issues.map(i => `<span class="ck ${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "!" : "⚠"} ${esc(i.text)}</span>`).join("") : `<span class="ck ok">✓ All good</span>`}</span></summary>
        <div class="acdet">${cmp || `<div class="muted">No matching student profile to compare with.</div>`}</div></details>`;
    }).join("")}</div>` : `<div class="card empty-hero"><div class="eh-ic ok">✓</div><b>${filter === "problems" ? "Nothing that must be fixed" : "Nothing here"}</b></div>`;
    $$("#acBody [data-open]").forEach(b => b.onclick = ev => { ev.preventDefault(); openProfile(b.dataset.open); });
  };
  const r0 = R(); if (!r0.errors) filter = r0.warns ? "warn" : "all";
  draw();
  $("#acSeg").onclick = ev => { const b = ev.target.closest("[data-f]"); if (b) { filter = b.dataset.f; draw(); } };
  $("#acReview").onclick = () => { closeSheet(); openReview(e); };
  quickButton(e, $("#acQuick"), $("#acQuickNote"));
  $("#acExport").onclick = () => {
    const rows = R().rows.flatMap(({ c, issues }) => (issues.length ? issues : [{ level: "ok", text: "All good" }]).map(i => ({
      Name: c.name, "Student no": c.sid, "Index no": c.index, Email: c.email, Phone: c.phone, NIC: c.nic,
      Severity: i.level === "error" ? "Must fix" : i.level === "warn" ? "Double-check" : "OK", Issue: i.text })));
    xlsxDownload(rows, "Checks", `admission-check-${(e.level || "exam").replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
  const r = AC.examReport(e, admCtx());
  const tb = $("#adm-edit .toolbar");
  tb?.insertAdjacentHTML("beforebegin", `<button class="acbanner ${r.errors ? "bad" : r.warns ? "warn" : "ok"}" id="acOpen">
    <b>${r.errors ? `${r.errors} candidate${r.errors === 1 ? "" : "s"} must be fixed` : r.warns ? `${r.warns} candidate${r.warns === 1 ? "" : "s"} to double-check` : "All admission details checked"}</b>
    <span>${r.clean} of ${r.rows.length} all good${r.errors && r.warns ? ` · ${r.warns} to double-check` : ""} · tap to see the check</span></button>`);
  $("#acOpen").onclick = () => openAdmCheck(e);
  // quick "Approve & email" next to the check summary
  $("#acOpen").insertAdjacentHTML("afterend", `<div class="acquick"><button class="btn primary small" id="acQuick2"></button><span class="muted" id="acQuickNote2"></span></div>`);
  quickButton(e, $("#acQuick2"), $("#acQuickNote2"));
};
