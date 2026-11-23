/* CIT Student Hub — front-desk lookup (home) and the student profile page. */
"use strict";

/* ---------------- contacts ---------------- */
const isEmail = s => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || "").trim());
const digits = s => String(s ?? "").replace(/\D+/g, "");
const phoneKey = s => { const d = digits(s); return d.length >= 9 ? d.slice(-9) : d; };   // 0771234567 / 94771234567 / 771234567
function fmtPhone(p) { const d = phoneKey(p); return d.length === 9 ? `0${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : String(p || ""); }
function setContact(s, obj) {
  if (!s) return;
  s.contact ||= {};
  for (const [k, v] of Object.entries(obj)) { const t = String(v ?? "").trim(); if (t) s.contact[k] = t; }
  HAY.delete(s);
}
function rememberContact(c) {
  const s = DB.students.find(x => x.id === c.sid);
  if (s && isEmail(c.email)) setContact(s, { email: c.email.trim() });
}

/* ---------------- search ---------------- */
const HAY = new WeakMap();
function hay(s) {
  let h = HAY.get(s);
  if (!h) {
    const ct = s.contact || {};
    h = { name: norm(s.name), ids: [s.id, ...s.index_nos].map(x => x.toLowerCase()), nic: String(ct.nic || "").toLowerCase(),
      email: String(ct.email || "").toLowerCase(), phones: [ct.phone, ct.whatsapp].filter(Boolean).map(phoneKey), initials: norm(ct.initials || "") };
    HAY.set(s, h);
  }
  return h;
}
function searchStudents(q, limit = 8) {
  q = q.trim(); if (!q) return [];
  const ql = q.toLowerCase(), toks = norm(q).split(" ").filter(Boolean), dq = digits(q);
  const out = [];
  for (const s of DB.students) {
    const h = hay(s); let score = 0, why = "";
    if (h.ids.includes(ql)) { score = 100; why = "Exact number"; }
    else if (h.nic && h.nic === ql) { score = 100; why = "NIC"; }
    else if (h.email && h.email === ql) { score = 100; why = "Email"; }
    else if (dq.length >= 9 && h.phones.includes(phoneKey(dq))) { score = 95; why = "Phone"; }
    else if (h.ids.some(i => i.includes(ql)) && ql.length >= 3) { score = 70; why = "Number"; }
    else if (toks.length && toks.every(t => h.name.includes(t) || h.initials.includes(t))) {
      score = h.name.startsWith(toks[0]) ? 58 : 48 + (toks.length > 1 ? 4 : 0);
      if (toks.every(t => h.name.split(" ").some(w => w.startsWith(t)))) score += 6;
    }
    else if (h.nic && ql.length >= 5 && h.nic.includes(ql)) { score = 45; why = "NIC"; }
    else if (h.email && ql.length >= 3 && h.email.includes(ql)) { score = 42; why = "Email"; }
    else if (dq.length >= 5 && dq.length === q.replace(/[\s-]/g, "").length && h.phones.some(p => p.includes(dq.slice(-9)))) { score = 40; why = "Phone"; }
    if (score) out.push({ s, score, why });
  }
  out.sort((a, b) => b.score - a.score || (a.s.missingName - b.s.missingName) || a.s.name.localeCompare(b.s.name));
  return { hits: out.slice(0, limit), total: out.length };
}

/* ---------------- quick facts used by home + profile ---------------- */
function currentLevel(s) {
  if (!s.summary.length) return null;
  const open = s.summary.filter(m => m.overall !== "Completed");
  return open.at(-1) || s.summary.at(-1);
}
function admissionsFor(s) {
  const out = [];
  for (const e of DB.exams) for (const c of e.candidates) if (c.sid === s.id) out.push({ e, c });
  return out.sort((a, b) => b.e.created - a.e.created);
}
function answerLine(s) {
  const m = currentLevel(s);
  if (!m) return "No exam results yet.";
  if (m.overall === "Completed") return `Completed ${m.level}.`;
  return `${m.level} · ${m.overall || "In progress"} — ${m.outstanding.length ? "still to pass " + m.outstanding.join(", ") : "all subjects done"}.`;
}
function replyText(s) {
  const lines = [`${s.name} (${s.id})`];
  for (const m of s.summary) {
    lines.push(`• ${m.level}: ${m.overall || "In progress"}${m.done.length ? ` — passed/exempted: ${m.done.join(", ")}` : ""}${m.outstanding.length ? ` — to pass: ${m.outstanding.join(", ")}` : ""}`);
  }
  const ad = admissionsFor(s)[0];
  if (ad) lines.push(`• Admission: ${ad.e.heading}${ad.c.index ? ", index " + ad.c.index : ""}${ad.c.state === "sent" ? " (emailed " + new Date(ad.c.sentAt).toLocaleDateString("en-GB") + ")" : ""}`);
  return lines.join("\n");
}
async function copyText(t, msg = "Copied") {
  try { await navigator.clipboard.writeText(t); toast(msg); }
  catch { const a = document.createElement("textarea"); a.value = t; document.body.append(a); a.select(); document.execCommand("copy"); a.remove(); toast(msg); }
}

/* ---------------- recent ---------------- */
const RECENT_KEY = "cit-hub-recent";
const getRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; } };
function pushRecent(id) { const r = [id, ...getRecent().filter(x => x !== id)].slice(0, 8); try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch { } }

/* ================= HOME ================= */
const I = {
  mail: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
  phone: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2"/></svg>',
  wa: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.6-2-.9-.8.8a4 4 0 0 1-2-2l.8-.8-.9-2z"/></svg>',
  id: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M15 10h3M15 13h3"/></svg>',
  copy: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  edit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  back: '<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg>',
};
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }
function hl(text, q) {
  const toks = norm(q).split(" ").filter(t => t.length > 1); let out = esc(text);
  for (const t of toks) out = out.replace(new RegExp(`(^|\\s)(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"), "$1<mark>$2</mark>");
  return out;
}
function resultCard(s, q, why, i) {
  const m = currentLevel(s), ct = s.contact || {}, ad = admissionsFor(s)[0];
  const next = m && m.overall !== "Completed" ? m.outstanding : [];
  return `<button class="card hit" data-id="${esc(s.id)}" style="--i:${i}">
    <div class="hit-top"><div class="av" style="background:${color(s.name)}">${initials(s.name)}</div>
      <div class="hit-id"><b>${hl(s.name, q)}</b><span>${esc(s.id)}${s.index_nos.length ? " · " + esc(s.index_nos.at(-1)) : ""}${why && why !== "Number" ? ` · <em>matched ${esc(why.toLowerCase())}</em>` : ""}</span></div>
      ${m ? `<span class="chip c-${chipFor(m.overall)}">${esc(m.overall || "In progress")}</span>` : `<span class="chip c-gray">No results</span>`}</div>
    <div class="hit-answer">${m ? `<span class="lvl-tag">${esc(m.level)}</span>` : ""}${next.length ? `Still to pass <b>${next.map(esc).join(", ")}</b>` : m?.overall === "Completed" ? `<b>Completed this level</b>` : "No results recorded yet"}</div>
    <div class="hit-meta">${ct.email ? `<span>${I.mail}${esc(ct.email)}</span>` : ""}${ct.phone ? `<span>${I.phone}${esc(fmtPhone(ct.phone))}</span>` : ""}${ad ? `<span>${I.id}${esc(ad.c.index || "Admission")} · ${esc(stateLabel(ad.c))}</span>` : ""}</div>
  </button>`;
}
function renderHome() {
  $("#greet").textContent = `${greeting()} · ${new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`;
  $("#hhint").innerHTML = `Search ${DB.students.length.toLocaleString()} students · press <kbd>/</kbd> anywhere to search · <button class="link" id="browseAll">Browse all</button>`;
  $("#browseAll").onclick = () => tab("search");
  renderHomeResults();
  if (matchMedia("(pointer:fine)").matches) setTimeout(() => $("#hq").focus({ preventScroll: true }), 60);
}
let homeSel = 0;
function renderHomeResults() {
  const q = $("#hq").value;
  $("#spotbox").classList.toggle("typing", !!q.trim());
  if (!q.trim()) { $("#hres").innerHTML = ""; renderIdle(); return; }
  $("#hidle").innerHTML = "";
  const { hits, total } = searchStudents(q, 12);
  homeSel = 0;
  $("#hres").innerHTML = hits.length
    ? `<div class="hres-head">${total} match${total === 1 ? "" : "es"}${total > hits.length ? ` · showing the best ${hits.length}` : ""} <span>↵ opens the first</span></div><div class="hits">${hits.map((h, i) => resultCard(h.s, q, h.why, i)).join("")}</div>`
    : `<div class="card empty-hero"><div class="eh-ic">?</div><b>No student matches “${esc(q)}”</b><span>Try part of the name, the student number (e.g. 2026/01/3856), an index number, NIC, phone or email.</span></div>`;
  $$("#hres .hit").forEach(h => h.classList.add("tilt"));
  markSel();
}
function markSel() { $$("#hres .hit").forEach((h, i) => h.classList.toggle("sel", i === homeSel)); }
function renderIdle() {
  const recent = getRecent().map(id => DB.students.find(s => s.id === id)).filter(Boolean);
  const tasks = [];
  for (const e of DB.exams) {
    const pend = countState(e, "draft") + countState(e, "flagged"), ready = countState(e, "approved"), failed = countState(e, "failed");
    if (pend) tasks.push({ e, ic: "var(--orange)", t: `${pend} card${pend === 1 ? "" : "s"} waiting for supervisor review`, a: "review" });
    if (ready) tasks.push({ e, ic: "var(--blue)", t: `${ready} approved card${ready === 1 ? "" : "s"} ready to email`, a: "send" });
    if (failed) tasks.push({ e, ic: "var(--red)", t: `${failed} email${failed === 1 ? "" : "s"} failed — retry`, a: "send" });
  }
  const s = STATS;
  $("#hidle").innerHTML = `
    ${recent.length ? `<div class="h2row"><h2>Recently viewed</h2><button class="link" id="clrRecent">Clear</button></div>
      <div class="recent">${recent.map((r, i) => `<button class="rchip" data-id="${esc(r.id)}" style="--n:${i}"><span class="av" style="background:${color(r.name)}">${initials(r.name)}</span><span><b>${esc(r.name.split(" ").slice(-2).join(" "))}</b><small>${esc(r.id)}</small></span></button>`).join("")}</div>` : ""}
    ${tasks.length ? `<div class="h2row"><h2>To do</h2></div><div class="card list" id="tasks">${tasks.map(t => `<div class="row" data-e="${t.e.id}" data-a="${t.a}"><span class="ic" style="background:${t.ic}">${t.a === "review" ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>' : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>'}</span>
      <div class="t"><b>${esc(t.t)}</b><span>${esc(t.e.heading)}</span></div><span class="chev">›</span></div>`).join("")}</div>` : ""}
    <div class="h2row"><h2>At a glance</h2><button class="link" id="toInsights">Insights ›</button></div>
    <div class="glance">
      <div class="card g"><b data-v="${s.students}">0</b><span>Students</span></div>
      <div class="card g"><b data-v="${s.exams}">0</b><span>Exam sessions</span></div>
      <div class="card g"><b data-v="${DB.students.filter(x => x.contact?.email).length}">0</b><span>With email</span></div>
      <div class="card g"><b data-v="${DB.exams.reduce((n, e) => n + countState(e, "sent"), 0)}">0</b><span>Cards emailed</span></div>
    </div>`;
  $$("#hidle .glance b").forEach(b => countUp(b, +b.dataset.v));
  fx($("#hidle"), ".rchip, #tasks .row");
  $("#toInsights").onclick = () => tab("dash");
  if ($("#clrRecent")) $("#clrRecent").onclick = () => { try { localStorage.removeItem(RECENT_KEY); } catch { } renderIdle(); };
  $$("#hidle .rchip").forEach(b => b.onclick = () => openProfile(b.dataset.id));
  if ($("#tasks")) $("#tasks").onclick = ev => {
    const r = ev.target.closest("[data-e]"); if (!r) return;
    cur = DB.exams.find(x => x.id === r.dataset.e); tab("adm");
    setTimeout(() => r.dataset.a === "review" ? openReview(cur) : openSend(cur), 120);
  };
}
$("#hq").addEventListener("input", renderHomeResults);
$("#hq").addEventListener("keydown", e => {
  const n = $$("#hres .hit").length;
  if (e.key === "ArrowDown" && n) { e.preventDefault(); homeSel = (homeSel + 1) % n; markSel(); }
  else if (e.key === "ArrowUp" && n) { e.preventDefault(); homeSel = (homeSel - 1 + n) % n; markSel(); }
  else if (e.key === "Enter" && n) { e.preventDefault(); openProfile($$("#hres .hit")[homeSel].dataset.id); }
  else if (e.key === "Escape") { $("#hq").value = ""; renderHomeResults(); }
});
$("#hres").addEventListener("click", e => { const h = e.target.closest(".hit"); if (h) openProfile(h.dataset.id); });
addEventListener("keydown", e => {
  if (e.key === "/" && !e.target.closest("input, textarea, select, [contenteditable]") && !$("#sheet").classList.contains("on")) {
    e.preventDefault(); if (currentTab !== "home" || !$("#v-profile").classList.contains("hide")) tab("home"); $("#hq").focus(); $("#hq").select();
  }
});

/* ================= PROFILE ================= */
let profileId = null;
function openProfile(id) {
  const s = DB.students.find(x => x.id === id); if (!s) return;
  if ($("#sheet").classList.contains("on")) closeSheet();
  profileId = id; pushRecent(id);
  $$("main > .view").forEach(v => v.classList.add("hide"));
  const pv = $("#v-profile"); pv.classList.remove("hide");
  currentTab = "home"; $$(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === "home")); moveGlider();
  renderProfile(s); scrollTo({ top: 0 });
}
function refreshProfile() { const s = DB.students.find(x => x.id === profileId); if (s && !$("#v-profile").classList.contains("hide")) renderProfile(s); }
function subjectState(s, level, subject) {
  const rs = s.sittings.filter(x => x.level === level).sort((a, b) => a.date.localeCompare(b.date)).flatMap(x => x.results.filter(r => r.subject === subject).map(r => ({ ...r, session: x.session })));
  const marks = rs.map(r => r.marks).filter(v => v != null);
  const best = marks.length ? Math.max(...marks) : null;
  const passed = rs.find(r => r.status === "Pass" || r.status === "Completed");
  const ex = rs.find(r => /Exempted/.test(r.status));
  const pc = rs.find(r => r.status === "Previously Completed");
  const tries = rs.filter(r => r.status === "Pass" || r.status === "Fail").length;
  let st = "todo", label = rs.at(-1)?.status || "Not attempted";
  if (passed) { st = "pass"; label = "Passed"; } else if (ex) { st = "ex"; label = ex.status; } else if (pc) { st = "pass"; label = "Completed"; }
  return { st, label, best, tries, last: rs.at(-1) };
}
/* "Exam index · Analyst 1 · Jan 2025" — which exam an index number belongs to.
   Uses the exam it was saved with (results imports / admission cards), otherwise reads level + year from the number. */
function indexLabel(s, idx) {
  const sit = s.sittings.find(x => x.index === idx);
  if (sit) return `Exam index · ${sit.level} · ${sit.session.replace(/^.*?-\s*/, "") || sit.session}`;
  const ex = (DB.exams || []).find(e => e.candidates.some(c => c.index === idx));
  const t = String(idx).toUpperCase().replace(/\s+/g, "");
  const CODES = { AP: "Application", A1: "Analyst 1", AN1: "Analyst 1", AL1: "Analyst 1", A2: "Analyst 2", AN2: "Analyst 2", AL2: "Analyst 2", AD: "Advisory" };
  let m = t.match(/^(\d{2})\/(AP|AN1|AN2|AL1|AL2|A1|A2|AD)\//) || t.match(/^(AP|AN1|AN2|AL1|AL2|A1|A2|AD)(\d{2})\d+$/);
  let level = "", year = "";
  if (m) { if (/^\d/.test(m[1])) { year = m[1]; level = CODES[m[2]]; } else { level = CODES[m[1]]; year = m[2]; } }
  if (ex) return `Exam index · ${ex.level}${year ? " · 20" + year : ""} · admission card`;
  // the only sitting at that level in that year → name it
  const cand = s.sittings.filter(x => (!level || x.level === level) && (!year || String(x.date || "").startsWith("20" + year)));
  const uniq = [...new Set(cand.map(x => x.session))];
  if (uniq.length === 1) return `Exam index · ${level || cand[0].level} · ${uniq[0].replace(/^.*?-\s*/, "")}`;
  return `Exam index${level ? " · " + level : ""}${year ? " · 20" + year : ""}`;
}
function renderProfile(s) {
  const ct = s.contact || {}, m = currentLevel(s), ads = admissionsFor(s);
  const hue = color(s.name);
  const lvIdx = m ? LEVELS.indexOf(m.level) : -1;
  const journey = LEVELS.map((l, i) => {
    const sm = s.summary.find(x => x.level === l);
    const st = sm?.overall === "Completed" ? "done" : sm ? "now" : i < lvIdx ? "skip" : "next";
    return `<div class="jn ${st}"><span class="dot">${st === "done" ? I.check : i + 1}</span><b>${l}</b><small>${sm ? esc(sm.overall || "In progress") : st === "skip" ? "—" : "Not started"}</small></div>`;
  }).join(`<i class="jl"></i>`);
  const levels = s.summary.slice().reverse().map(sm => {
    const subs = LEVEL_SUBJECTS[sm.level] || [];
    const done = subs.filter(x => sm.done.includes(x)).length;
    return `<div class="card lvcard"><div class="lvhead"><div><h3>${esc(sm.level)}</h3><span>${sm.attempts} sitting${sm.attempts === 1 ? "" : "s"} · ${sm.overall === "Completed" ? subs.length : done} of ${subs.length} subjects done</span></div>
      <span class="chip c-${chipFor(sm.overall)}">${esc(sm.overall || "In progress")}</span></div>
      <div class="lvbar"><i style="width:${sm.overall === "Completed" ? 100 : Math.round(100 * done / (subs.length || 1))}%"></i></div>
      <div class="tiles">${subs.map(sub => { const t = subjectState(s, sm.level, sub); const st = sm.overall === "Completed" && t.st === "todo" ? "pass" : t.st;
        return `<div class="tile ${st}"><span class="tl">${esc(sub)}</span><span class="tv">${t.best != null ? t.best : st === "pass" ? "✓" : st === "ex" ? "EX" : "—"}</span><span class="ts">${esc(st === "todo" ? t.label : st === "ex" ? "Exempted" : "Passed")}${t.tries > 1 ? ` · ${t.tries} tries` : ""}</span></div>`; }).join("")}</div></div>`;
  }).join("");
  const timeline = s.sittings.slice().sort((a, b) => b.date.localeCompare(a.date)).map((x, i) => `
    <details class="tl-item" ${i === 0 ? "open" : ""} style="--n:${i}"><summary><span class="tl-dot" style="background:var(--${chipFor(x.overall) === "gray" ? "gray" : chipFor(x.overall)})"></span>
      <span class="tl-when">${esc(fmtMonth(x.date))}</span><span class="tl-what"><b>${esc(x.session)}</b><small>${esc(x.level)}</small></span><span class="chip c-${chipFor(x.overall)}">${esc(x.overall || "—")}</span></summary>
      <div class="tl-body">${x.results.map(r => `<div class="subj"><span>${esc(r.subject)}</span><span>${r.marks != null ? `<span class="m">${r.marks}</span>` : ""}<span class="chip c-${chipFor(r.status)}">${esc(r.status || "—")}</span></span></div>`).join("")}</div></details>`).join("");
  const contactRow = (ic, label, val, href, cls = "") => val ? `<div class="crow ${cls}"><span class="cic">${ic}</span><div><small>${label}</small>${href ? `<a href="${href}" target="_blank" rel="noopener">${esc(val)}</a>` : `<b>${esc(val)}</b>`}</div><button class="cbtn" data-copy="${esc(val)}" title="Copy">${I.copy}</button></div>` : "";
  const wa = ct.whatsapp || ct.phone;
  $("#v-profile").innerHTML = `
    <button class="back" id="pBack">${I.back}Lookup</button>
    <div class="card pass" style="--hue:${hue}">
      <div class="pass-band"></div>
      <div class="pass-main">
        <div class="av big" style="background:${hue}">${initials(s.name)}</div>
        <div class="pass-id">
          <h1 class="pname">${esc(s.name)}</h1>
          ${ct.initials ? `<div class="pinit">${esc((ct.title ? ct.title + " " : "") + ct.initials)}</div>` : ""}
          <div class="pnums"><span class="num lbl" data-copy="${esc(s.id)}" title="Student number — given at registration, never changes. Click to copy."><small>Student no</small><span>${I.id}${esc(s.id)}</span></span>${s.index_nos.slice().reverse().map(i => `<span class="num ghost lbl" data-copy="${esc(i)}" title="Exam index number — a new one for each exam. Click to copy."><small>${esc(indexLabel(s, i))}</small><span>${esc(i)}</span></span>`).join("")}</div>
        </div>
      </div>
      <div class="answer"><div class="ans-k">Quick answer</div><div class="ans-t">${esc(answerLine(s))}</div>
        <div class="ans-acts"><button class="btn small primary" id="pReply">${I.copy}Copy reply</button>
          <button class="btn small" id="pPdf"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg>Record PDF</button>
          ${DB.exams.length ? `<button class="btn small" id="pAdmit">Add to admission</button>` : ""}</div></div>
    </div>

    <div class="pgrid">
      <div class="pcol">
        <div class="card contact"><div class="sec-h"><h2>Contact</h2><button class="link" id="pEdit">${I.edit} Edit</button></div>
          ${contactRow(I.mail, "Email", ct.email, ct.email ? "mailto:" + ct.email : "")}
          ${contactRow(I.phone, "Phone", ct.phone ? fmtPhone(ct.phone) : "", ct.phone ? "tel:+94" + phoneKey(ct.phone) : "")}
          ${wa ? contactRow(I.wa, "WhatsApp", fmtPhone(wa), "https://wa.me/94" + phoneKey(wa)) : ""}
          ${contactRow(I.id, "NIC", ct.nic, "")}
          ${!ct.email && !ct.phone && !ct.nic ? `<div class="empty" style="padding:16px 4px">No contact details yet. They are filled in automatically when you import an admission Excel, or tap Edit.</div>` : ""}
        </div>
        <div class="card"><div class="sec-h"><h2>Admission cards</h2></div>
          ${ads.length ? ads.map(({ e, c }) => `<div class="adrow" data-e="${e.id}" data-c="${c.id}">
            <div class="t"><b>${esc(e.heading)}</b><span>${esc(c.index || "No index yet")} · ${Object.values(c.status).filter(v => v === "X").length} papers applied</span></div>
            ${stateChip(c)}<div class="acts"><button data-a="view" title="Preview">Preview</button><button data-a="pdf" title="PDF">PDF</button></div></div>`).join("")
            : `<div class="empty" style="padding:16px 4px">Not in any admission list yet.</div>`}
        </div>
      </div>
      <div class="pcol wide">
        <div class="card journey"><div class="sec-h"><h2>Journey</h2></div><div class="jrow">${journey}</div></div>
        ${levels || `<div class="card empty">No exam results recorded.</div>`}
        <div class="card"><div class="sec-h"><h2>Exam history</h2><span class="muted">${s.sittings.length} sitting${s.sittings.length === 1 ? "" : "s"}</span></div><div class="timeline">${timeline || `<div class="empty">Nothing yet</div>`}</div></div>
      </div>
    </div>`;
  fx($("#v-profile"), ".tl-item");
  $("#pBack").onclick = () => { tab("home"); };
  $("#pReply").onclick = () => copyText(replyText(s), "Reply copied — paste it in WhatsApp or email");
  $("#pPdf").onclick = () => pdfDownload([profilePage(s)], `${s.name} - record.pdf`);
  if ($("#pAdmit")) $("#pAdmit").onclick = () => pickExamFor(s);
  $("#pEdit").onclick = () => editContact(s);
  $$("#v-profile [data-copy]").forEach(b => b.onclick = ev => { ev.preventDefault(); copyText(b.dataset.copy, "Copied " + b.dataset.copy); });
  $$("#v-profile .adrow").forEach(r => r.onclick = ev => {
    const a = ev.target.closest("[data-a]")?.dataset.a; if (!a) return;
    const e = DB.exams.find(x => x.id === r.dataset.e), c = e.candidates.find(x => x.id === r.dataset.c);
    cur = e;
    if (a === "view") previewCards([c]);
    if (a === "pdf") pdfDownload(cardPages(e, c), `${c.index || c.name} Admission Card.pdf`);
  });
}
function editContact(s) {
  const ct = s.contact || {};
  const f = (id, label, val, type = "text", ph = "") => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val || "")}" placeholder="${ph}"></div>`;
  openSheet(`<div class="bar-top"><b style="font-size:17px">Contact details</b>${closeBtn}</div>
    <div class="card form">${f("ctT", "Title", ct.title, "text", "Mr / Ms")}${f("ctI", "Name with initials", ct.initials)}${f("ctE", "Email", ct.email, "email", "name@example.com")}
      ${f("ctP", "Phone", ct.phone, "tel", "077 123 4567")}${f("ctW", "WhatsApp", ct.whatsapp, "tel")}${f("ctN", "NIC", ct.nic)}</div>
    <div class="actions" style="justify-content:flex-end"><button class="btn primary" id="ctSave">Save</button></div>`);
  $("#ctSave").onclick = () => {
    const email = $("#ctE").value.trim();
    if (email && !isEmail(email)) return toast("That email address does not look right");
    s.contact = { title: $("#ctT").value.trim(), initials: $("#ctI").value.trim(), email, phone: $("#ctP").value.trim(), whatsapp: $("#ctW").value.trim(), nic: $("#ctN").value.trim() };
    HAY.delete(s);
    for (const e of DB.exams) for (const c of e.candidates) if (c.sid === s.id && c.state !== "sent" && email) c.email = email;
    save(); closeSheet(); renderProfile(s); toast("Contact saved");
  };
}
