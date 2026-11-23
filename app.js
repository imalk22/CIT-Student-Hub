/* CIT Student Hub — student results + admission cards. No build step. */
"use strict";

/* ---------------- helpers ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const norm = s => String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const tight = s => norm(s).replace(/ /g, "");
const initials = n => String(n).split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const COLORS = ["#2f6fed", "#5b5bd6", "#0e8fc4", "#7c4dce", "#13958a", "#3d5a9c", "#c0587e", "#b7791f"];   // calm, professional avatar tones
const color = s => COLORS[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtMonth = d => { if (!d) return ""; const [y, m] = d.split("-"); return `${MONTHS[+m - 1]?.slice(0, 3) || ""} ${y}`; };
const pad = (n, w = 3) => String(n).padStart(w, "0");
const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2400); };
// Chrome ignores a download name that has characters like "–", so keep names to plain characters
const safeFileName = n => String(n || "download").replace(/[–—]/g, "-").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "download";
const download = (name, blob) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = safeFileName(name); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

/* ---------------- motion helpers ---------------- */
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
function countUp(el, target, { dec = 0, suf = "", dur = 1100 } = {}) {
  const fmt = v => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString()) + suf;
  if (REDUCED) { el.textContent = fmt(target); return; }
  const t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4); el.textContent = fmt(target * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
// stagger cards (--i) and rows (--n) inside a freshly rendered container
function fx(root, rowSel = ".row, .cand") {
  if (!root) return;
  $$(".card", root).forEach((c, i) => {
    c.style.setProperty("--i", Math.min(i, 10));
    if (!c.querySelector("input, select, textarea, details") && !c.classList.contains("list") && !c.id && !c.closest(".sheet") && !c.classList.contains("pass")) c.classList.add("tilt");
  });
  $$(rowSel, root).forEach((r, i) => { if (i < 40) { r.style.setProperty("--n", i); r.classList.add("fxrow"); } });
}
// 3D tilt + glare follows the pointer (desktop only)
if (matchMedia("(hover: hover) and (pointer: fine)").matches && !REDUCED) {
  let last = null;
  document.addEventListener("pointermove", e => {
    const c = e.target.closest(".tilt");
    if (last && last !== c) { last.style.transform = ""; }
    last = c; if (!c) return;
    if (e.target.closest("input, select, textarea, .list, .scrollx, #cands")) { c.style.transform = ""; return; }
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    const k = Math.min(1, 320 / Math.max(r.width, r.height));   // big cards tilt less
    c.style.transform = `perspective(1000px) rotateX(${(-y * 4 * k).toFixed(2)}deg) rotateY(${(x * 5 * k).toFixed(2)}deg) translateY(-3px)`;
    c.style.setProperty("--mx", (x + 0.5) * 100 + "%"); c.style.setProperty("--my", (y + 0.5) * 100 + "%");
  }, { passive: true });
  document.addEventListener("pointerleave", () => { if (last) last.style.transform = ""; });
}
function moveGlider() {
  const on = $(".tabbar button.on"), g = $(".tabbar .glider"); if (!on || !g) return;
  g.style.width = on.offsetWidth + "px"; g.style.transform = `translateX(${on.offsetLeft}px)`;
}
addEventListener("resize", moveGlider);
const busy = on => document.body.classList.toggle("loading", on);

const LEVELS = ["Application", "Analyst 1", "Analyst 2", "Advisory"];
const LEVEL_TITLE = { "Application": "APPLICATION LEVEL", "Analyst 1": "ANALYST LEVEL 1", "Analyst 2": "ANALYST LEVEL 2", "Advisory": "ADVISORY LEVEL" };
const LEVEL_CODE = { "Application": "AP", "Analyst 1": "AN1", "Analyst 2": "AN2", "Advisory": "AD" };
const LEVEL_SUBJECTS = {
  "Application": ["Business Environment", "Direct Taxation", "Fundamentals of Accounting", "Indirect Taxation"],
  "Analyst 1": ["Direct Taxation", "Indirect Taxation", "Compliance Management", "Accounting for Taxation", "Business Law"],
  "Analyst 2": ["Corporate Taxation", "Value Added Tax", "Conceptual Framework of Tax Adjudication", "Audit & Assurance for Taxation", "Corporate Law"],
  "Advisory": ["International Taxation & Transfer Pricing", "Contemporary Issues in Taxation", "Application of Tax Adjudication", "Compliance Risk Management & Validation", "Strategic Management & Entrepreneurship"],
};
const SUBJECT_CODES = {
  "Analyst 1": { "Direct Taxation": "TX 211", "Indirect Taxation": "TX 212", "Compliance Management": "CP 211", "Accounting for Taxation": "BS 211", "Business Law": "BS 212" },
  "Advisory": { "International Taxation & Transfer Pricing": "TX 311", "Contemporary Issues in Taxation": "CP 311", "Application of Tax Adjudication": "TX 312", "Compliance Risk Management & Validation": "CP 312", "Strategic Management & Entrepreneurship": "BS 311" },
};
const DONE = new Set(["Pass", "Previously Completed", "Exempted", "Exempted (TA)", "Completed"]);
const chipFor = s => ({ Pass: "green", Completed: "green", Fail: "red", Referred: "orange", "Re-Referred": "orange", Absent: "gray", Exempted: "blue", "Exempted (TA)": "blue", "Previously Completed": "blue", Skipped: "gray", Skip: "gray" }[s] || "gray");
const DEFAULT_VENUES = [
  { code: "CIT", name: "Chartered Institute of Taxation of Sri Lanka", address: "No. 484, Havelock Road,\nColombo 06." },
  { code: "UOC", name: "University of Colombo (UOC)", address: "Faculty of Graduate Studies\nExam Hall (5th Floor)\nNo. 35/30, Prof. Stanley Wijesundara Mawatha,\nColombo 07." },
];

/* ---------------- store ---------------- */
const KEY = "cit-hub-db-v1";
let DB = null;      // {students, exams, venues, imports}
let ORIGINAL = null;

function normalizeStudents(list) {
  for (const s of list) {
    s.index_nos ||= [];
    if (!String(s.name || "").trim() || s.missingName) { s.name = "Name missing"; s.missingName = true; }
    for (const x of s.sittings || []) x.session = String(x.session).replace(/^Results of /i, "").trim();
    s.sittings ||= [];
    delete s.summary;
  }
  return list;
}
/* Storage: IndexedDB (hundreds of MB) instead of localStorage (~5 MB). Falls back to localStorage if IndexedDB is unavailable. */
const IDB_NAME = "cit-student-hub", IDB_STORE = "kv";
let idbP = null, STORE_KIND = "indexeddb";
function idb() {
  return idbP ||= new Promise((ok, bad) => {
    if (!window.indexedDB) return bad(new Error("IndexedDB not available"));
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); r.onblocked = () => bad(new Error("Storage is blocked by another tab"));
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((ok, bad) => { const q = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(k); q.onsuccess = () => ok(q.result); q.onerror = () => bad(q.error); });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((ok, bad) => { const t = db.transaction(IDB_STORE, "readwrite"); t.objectStore(IDB_STORE).put(v, k); t.oncomplete = () => ok(); t.onerror = () => bad(t.error); t.onabort = () => bad(t.error); });
}
const serialize = () => JSON.stringify(DB, (k, v) => k === "summary" ? undefined : v);
let saving = false, dirty = false;
function save() { dirty = true; if (!saving) flushSave(); }
async function flushSave() {
  saving = true;
  while (dirty) {
    dirty = false;
    const json = serialize();
    try {
      if (STORE_KIND === "indexeddb") await idbSet(KEY, json); else localStorage.setItem(KEY, json);
    } catch (e) {
      console.error(e);
      try { localStorage.setItem(KEY, json); STORE_KIND = "localstorage"; }
      catch { toast("Could not save in this browser. Download a backup."); }
    }
  }
  saving = false;
}
async function readSaved() {
  let raw = null, migrated = false;
  try { raw = await idbGet(KEY); } catch (e) { console.warn("IndexedDB unavailable, using localStorage", e); STORE_KIND = "localstorage"; }
  if (!raw) { try { raw = localStorage.getItem(KEY); migrated = !!raw && STORE_KIND === "indexeddb"; } catch { } }
  let saved = null; try { saved = raw ? JSON.parse(raw) : null; } catch { }
  return { saved, migrated, raw };
}
async function storageUsage() {
  try { const e = await navigator.storage?.estimate?.(); return e ? { used: e.usage || 0, quota: e.quota || 0 } : null; } catch { return null; }
}
async function load() {
  busy(true);
  const res = await fetch("data.json"); ORIGINAL = await res.json();
  const { saved, migrated, raw } = await readSaved();
  if (migrated) {   // move the old localStorage copy into IndexedDB, then free localStorage
    try { await idbSet(KEY, raw); if (await idbGet(KEY) === raw) { localStorage.removeItem(KEY); setTimeout(() => toast("Your data was moved to the larger browser storage"), 1200); } }
    catch (e) { console.error(e); STORE_KIND = "localstorage"; }
  }
  try { navigator.storage?.persist?.(); } catch { }   // ask the browser not to clear it under storage pressure
  if (saved && saved.students) DB = saved;
  else DB = { students: normalizeStudents(structuredClone(ORIGINAL.students)), exams: [], venues: structuredClone(DEFAULT_VENUES), imports: [] };
  DB.exams ||= []; DB.venues ||= structuredClone(DEFAULT_VENUES); DB.imports ||= [];
  DB.settings ||= { supervisor: "", pin: "" };
  DB.exams.forEach(e => e.candidates.forEach(c => { c.state ||= "draft"; }));
  normalizeStudents(DB.students);
  if (typeof indexDocs === "function") indexDocs();
  derive(); busy(false);
}

/* ---------------- derived data ---------------- */
let SESSIONS = [], STATS = {}, SUBJ = [];
function summarize(s) {
  const levels = [...new Set(s.sittings.map(x => x.level))].sort((a, b) => LEVELS.indexOf(a) - LEVELS.indexOf(b));
  s.summary = levels.map(level => {
    const sits = s.sittings.filter(x => x.level === level).sort((a, b) => a.date.localeCompare(b.date));
    const done = new Set();
    sits.forEach(x => x.results.forEach(r => DONE.has(r.status) && done.add(r.subject)));
    const overall = sits.at(-1)?.overall || "";
    const all = LEVEL_SUBJECTS[level] || [...new Set(sits.flatMap(x => x.results.map(r => r.subject)))];
    const outstanding = overall === "Completed" ? [] : all.filter(x => !done.has(x)).sort();
    return { level, overall, attempts: sits.length, done: [...done].sort(), outstanding };
  });
}
function derive() {
  const sess = new Map(), pf = new Map();
  let sittings = 0, completed = 0;
  for (const s of DB.students) {
    summarize(s);
    for (const x of s.sittings) {
      sittings++; if (x.overall === "Completed") completed++;
      let e = sess.get(x.session);
      if (!e) sess.set(x.session, e = { session: x.session, level: x.level, date: x.date, total: 0, completed: 0, referred: 0, other: 0 });
      e.total++;
      if (x.overall === "Completed") e.completed++; else if (/referred/i.test(x.overall)) e.referred++; else e.other++;
      for (const r of x.results) {
        const k = x.level + "|" + r.subject;
        if (!pf.has(k)) pf.set(k, { level: x.level, subject: r.subject, pass: 0, fail: 0 });
        if (r.status === "Pass") pf.get(k).pass++; else if (r.status === "Fail") pf.get(k).fail++;
      }
    }
  }
  SESSIONS = [...sess.values()].sort((a, b) => a.date.localeCompare(b.date) || a.session.localeCompare(b.session));
  SUBJ = [...pf.values()].sort((a, b) => a.subject.localeCompare(b.subject));
  STATS = { students: DB.students.length, sittings, exams: SESSIONS.length, completion: sittings ? +(100 * completed / sittings).toFixed(1) : 0 };
}

/* ---------------- navigation ---------------- */
let currentTab = "home";
function tab(name) {
  if (name === "profile") name = "home";
  currentTab = name;
  for (const v of ["home", "profile", "dash", "search", "adm", "data"]) $("#v-" + v).classList.toggle("hide", v !== name);
  const navName = name === "search" ? "home" : name;
  $$(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === navName));
  moveGlider();
  scrollTo({ top: 0 });
  if (name === "home") renderHome();
  if (name === "dash") renderDash();
  if (name === "search") { renderList(); if (matchMedia("(pointer:fine)").matches) $("#q").focus({ preventScroll: true }); }
  if (name === "adm") renderAdmissions();
  if (name === "data") renderData();
  try { sessionStorage.setItem("tab", name); } catch { }
}
$$(".tabbar button").forEach(b => b.onclick = () => tab(b.dataset.tab));

/* theme */
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
try { applyTheme(localStorage.getItem("theme")); } catch { }
$("#themeBtn").onclick = () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  applyTheme(next); try { localStorage.setItem("theme", next); } catch { }
};

/* ---------------- sheet ---------------- */
function openSheet(html) {
  const sh = $("#sheet"); sh.innerHTML = `<div class="grab"></div>` + html;
  sh.classList.add("on"); $("#scrim").classList.add("on"); sh.scrollTop = 0; document.body.style.overflow = "hidden";
  document.body.classList.add("sheet-open"); fx(sh);
}
function closeSheet() { $("#sheet").classList.remove("on"); $("#scrim").classList.remove("on"); document.body.style.overflow = ""; document.body.classList.remove("sheet-open"); }
$("#scrim").onclick = closeSheet;
$("#sheet").addEventListener("click", e => { if (e.target.closest(".close")) closeSheet(); });
addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
const closeBtn = `<button class="close" aria-label="Close">✕</button>`;

/* ================= OVERVIEW ================= */
let dashLevel = LEVELS[1];
function renderDash() {
  const s = STATS;
  $("#asof").textContent = `${s.exams} exam sessions across ${new Set(SESSIONS.map(x => x.level)).size} levels`;
  const ic = d => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const tiles = [["Students", s.students.toLocaleString(), "var(--blue)", ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>')],
  ["Exam sittings", s.sittings.toLocaleString(), "var(--purple)", ic('<path d="M6 3h9l4 4v14H6z"/><path d="M9 13h7M9 17h7"/>')],
  ["Exam sessions", s.exams, "var(--orange)", ic('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>')],
  ["Completion", s.completion + "%", "var(--green)", ic('<path d="m5 12 5 5 9-10"/>')]];
  $("#stats").innerHTML = tiles.map(([l, n, c, i]) => `<div class="card stat" style="--ac:${c}"><div class="dot" style="background-color:${c}">${i}</div><div class="n">0</div><div class="l">${l}</div></div>`).join("");
  const nums = [s.students, s.sittings, s.exams, s.completion];
  $$("#stats .n").forEach((el, k) => countUp(el, nums[k], k === 3 ? { dec: 1, suf: "%" } : {}));
  renderHero();
  $("#sessions").innerHTML = SESSIONS.map(x => {
    const p = n => (100 * n / x.total).toFixed(1);
    return `<div class="row" style="cursor:pointer" data-sess="${esc(x.session)}"><div class="t"><b>${esc(x.session)}</b><span>${x.total} students · ${x.level}</span>
      <div class="bar"><i style="width:${p(x.completed)}%;background:var(--green)"></i><i style="width:${p(x.referred)}%;background:var(--orange)"></i></div></div>
      <div class="pct">${Math.round(p(x.completed))}%</div></div>`;
  }).join("") || `<div class="empty">No results yet</div>`;
  $("#sessions").onclick = e => { const r = e.target.closest("[data-sess]"); if (r) openSession(r.dataset.sess); };
  $("#lvlseg").onclick = e => { if (e.target.dataset.l) { dashLevel = e.target.dataset.l; renderSubjects(); } };
  renderSubjects();
  $("#levels").innerHTML = LEVELS.map(l => {
    const st = DB.students.filter(s => s.summary.some(m => m.level === l));
    const done = st.filter(s => s.summary.find(m => m.level === l).overall === "Completed").length;
    const p = st.length ? Math.round(100 * done / st.length) : 0;
    return `<div class="row"><div class="t"><b>${l}</b><span>${st.length} students · ${done} completed · ${st.length - done} still to finish</span>
      <div class="bar"><i style="width:${p}%;background:var(--blue)"></i></div></div><div class="pct">${p}%</div></div>`;
  }).join("");
  fx($("#v-dash"));
}
function renderSubjects() {
  $("#lvlseg").innerHTML = LEVELS.map(l => `<button class="${l === dashLevel ? "on" : ""}" data-l="${l}">${l}</button>`).join("");
  const rows = SUBJ.filter(x => x.level === dashLevel);
  $("#subjects").innerHTML = rows.length ? rows.map(x => {
    const t = x.pass + x.fail, p = t ? Math.round(100 * x.pass / t) : 0;
    return `<div class="row"><div class="t"><b>${esc(x.subject)}</b><span>${x.pass} passed · ${x.fail} failed</span>
      <div class="bar"><i style="width:${p}%;background:${p >= 50 ? "var(--green)" : "var(--orange)"}"></i></div></div><div class="pct">${p}%</div></div>`;
  }).join("") : `<div class="empty">No data</div>`;
  $$("#subjects .row").forEach((r, i) => { r.style.setProperty("--n", i); r.classList.add("fxrow"); });
}
function renderHero() {
  let res = 0, pass = 0, sat = 0, absent = 0;
  for (const s of DB.students) for (const x of s.sittings) for (const r of x.results) {
    if (r.status === "Pass" || r.status === "Fail") { res++; if (r.status === "Pass") pass++; }
    if (r.status === "Pass" || r.status === "Fail" || r.status === "Absent") { sat++; if (r.status === "Absent") absent++; }
  }
  const passRate = res ? 100 * pass / res : 0, attend = sat ? 100 * (sat - absent) / sat : 0;
  const finished = DB.students.filter(s => s.summary.some(m => m.overall === "Completed")).length;
  const levelPct = STATS.students ? 100 * finished / STATS.students : 0;
  const last = SESSIONS.at(-1), first = SESSIONS[0];
  const outstanding = DB.students.reduce((n, s) => n + s.summary.reduce((k, m) => k + m.outstanding.length, 0), 0);
  const rings = [[passRate, "var(--green)", "Subject pass rate"], [attend, "var(--orange)", "Attendance"], [levelPct, "var(--blue)", "Finished a level"]];
  const R = [60, 45, 30];
  $("#hero").innerHTML = `<div class="card hero"><div style="flex:1;min-width:0">
      <div class="kicker">Overview${last ? " · " + esc(fmtMonth(last.date)) : ""}</div>
      <h3>Cohort performance</h3>
      <p>${Math.round(passRate)}% of graded papers were passed across ${STATS.exams} exam sessions. ${outstanding.toLocaleString()} subject passes are still outstanding across ${STATS.students.toLocaleString()} students.</p>
      <div class="hchips"><span>${STATS.students.toLocaleString()} students</span><span>${SUBJ.length} subjects</span><span>${STATS.exams} sessions</span>${first ? `<span>${esc(fmtMonth(first.date))} → ${esc(fmtMonth(last.date))}</span>` : ""}</div>
    </div>
    <div class="rings"><svg viewBox="0 0 150 150">${rings.map(([p, c], k) => {
      const circ = 2 * Math.PI * R[k], off = circ * (1 - p / 100);
      return `<circle class="rtrack" cx="75" cy="75" r="${R[k]}" stroke="${c}" stroke-width="12"/><circle class="ring" cx="75" cy="75" r="${R[k]}" stroke="${c}" stroke-width="12" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="--c:${circ.toFixed(1)};animation-delay:${0.25 + k * 0.12}s"/>`;
    }).join("")}</svg>
    <div class="rlegend">${rings.map(([p, c, l]) => `<div><i style="background:${c}"></i>${l}<b data-p="${p}">0%</b></div>`).join("")}</div></div></div>`;
  $$("#hero [data-p]").forEach(b => countUp(b, +b.dataset.p, { suf: "%", dur: 1500 }));
}
function openSession(name) {
  const x = SESSIONS.find(s => s.session === name); if (!x) return;
  const rows = DB.students.flatMap(s => s.sittings.filter(t => t.session === name).map(t => ({ s, t }))).sort((a, b) => a.s.name.localeCompare(b.s.name));
  openSheet(`<div class="bar-top"><b style="font-size:17px">${esc(name)}</b>${closeBtn}</div>
    <p class="sub" style="margin:0 0 12px">${x.total} students · ${x.completed} completed · ${x.referred} referred · ${x.other} absent / other</p>
    <div class="card list">${rows.map(({ s, t }) => `<div class="row" data-id="${esc(s.id)}"><div class="av" style="background:${color(s.name)};width:34px;height:34px;font-size:13px">${initials(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><span>${esc(s.id)}</span></div><span class="chip c-${chipFor(t.overall)}">${esc(t.overall || "—")}</span><span class="chev">›</span></div>`).join("")}</div>`);
  $("#sheet .list").onclick = e => { const r = e.target.closest("[data-id]"); if (r) openProfile(r.dataset.id); };
}

/* ================= STUDENTS ================= */
let fLevel = "All", fState = "Any";
function filtered() {
  const q = $("#q").value.trim(), ql = q.toLowerCase(), toks = norm(q).split(" ").filter(Boolean);
  let hits = DB.students;
  if (fLevel !== "All") hits = hits.filter(s => s.summary.some(m => m.level === fLevel));
  if (fState !== "Any") hits = hits.filter(s => {
    const m = fLevel !== "All" ? s.summary.find(m => m.level === fLevel) : s.summary.at(-1);
    if (!m) return false;
    if (fState === "Completed") return m.overall === "Completed";
    if (fState === "Referred") return /referred/i.test(m.overall);
    if (fState === "Absent") return m.overall === "Absent" || m.overall === "Fail";
    return true;
  });
  if (q) hits = hits.filter(s => s.id.toLowerCase().includes(ql) || s.index_nos.some(i => i.toLowerCase().includes(ql)) || toks.every(t => norm(s.name).includes(t)));
  return hits;
}
function renderFilters() {
  const a = ["All", ...LEVELS].map(l => `<button data-l="${l}" class="${fLevel === l ? "on" : ""}">${l}</button>`).join("");
  const b = ["Completed", "Referred", "Absent"].map(l => `<button data-s="${l}" class="${fState === l ? "on" : ""}">${l === "Absent" ? "Absent / fail" : l}</button>`).join("");
  $("#filters").innerHTML = a + `<span style="width:1px;background:var(--line);flex:none;margin:4px 2px"></span>` + b;
}
$("#filters").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.l) fLevel = b.dataset.l;
  if (b.dataset.s) fState = fState === b.dataset.s ? "Any" : b.dataset.s;
  renderList();
};
function renderList() {
  renderFilters();
  const hits = filtered(), shown = hits.slice(0, 80);
  $("#count").textContent = `${hits.length.toLocaleString()} student${hits.length === 1 ? "" : "s"}`;
  $("#results").innerHTML = shown.length ? shown.map(s => {
    const last = s.summary.at(-1);
    return `<div class="row" data-id="${esc(s.id)}"><div class="av" style="background:${color(s.name)}">${initials(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><span>${esc(s.id)} · ${s.summary.map(x => x.level).join(", ") || "No results"}</span></div>
      ${last?.overall ? `<span class="chip c-${chipFor(last.overall)}">${esc(last.overall)}</span>` : ""}<span class="chev">›</span></div>`;
  }).join("") + (hits.length > 80 ? `<div class="empty" style="padding:14px">${hits.length - 80} more. Type to narrow down.</div>` : "")
    : `<div class="empty">No students found</div>`;
  fx($("#results"));
}
$("#q").oninput = renderList;
$("#results").onclick = e => { const r = e.target.closest("[data-id]"); if (r) openProfile(r.dataset.id); };
$("#exportList").onclick = () => {
  const rows = filtered().flatMap(s => (s.summary.length ? s.summary : [{}]).map(m => ({
    "Student No": s.id, "Name": s.name, "Index Numbers": s.index_nos.join(", "), "Level": m.level || "", "Latest result": m.overall || "",
    "Attempts": m.attempts || 0, "Subjects done": (m.done || []).join(", "), "Still to pass": (m.outstanding || []).join(", "),
  })));
  xlsxDownload(rows, "Students", `students-${new Date().toISOString().slice(0, 10)}.xlsx`);
};
function xlsxDownload(rows, sheet, file) {
  if (!window.XLSX) return toast("Excel library did not load. Check the internet connection.");
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = Object.keys(rows[0] || {});
  ws["!cols"] = keys.map(k => ({ wch: Math.min(48, Math.max(k.length, ...rows.slice(0, 300).map(r => String(r[k] ?? "").length)) + 2) }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, file); toast(`Exported ${rows.length} rows`);
}

/* profile: see lookup.js (openProfile) */
function pickExamFor(s) {
  openSheet(`<div class="bar-top"><b style="font-size:17px">Add ${esc(s.name.split(" ")[0])} to…</b>${closeBtn}</div>
    <div class="card list">${DB.exams.map(e => `<div class="row" data-e="${e.id}"><div class="t"><b>${esc(e.heading)}</b><span>${e.level} · ${e.candidates.length} candidates</span></div><span class="chev">›</span></div>`).join("")}</div>`);
  $("#sheet .list").onclick = ev => {
    const r = ev.target.closest("[data-e]"); if (!r) return;
    const ex = DB.exams.find(e => e.id === r.dataset.e);
    if (ex.candidates.some(c => c.sid === s.id)) { toast("Already in this exam"); return; }
    ex.candidates.push(candidateFrom(ex, s)); save(); closeSheet(); toast("Added to " + ex.level + " admissions");
    if (currentTab === "home" && typeof refreshProfile === "function") refreshProfile();
  };
}
function profilePage(s) {
  const lv = s.summary.map(l => {
    const sits = s.sittings.filter(x => x.level === l.level).sort((a, b) => a.date.localeCompare(b.date));
    return `<div class="lv"><h2><span>${l.level}</span><span>${esc(l.overall)}</span></h2>
      <div>Subjects done: ${esc(l.done.join(", ") || "None")}</div>
      ${l.outstanding.length ? `<div>Still to pass: <b>${esc(l.outstanding.join(", "))}</b></div>` : ""}
      ${sits.map(x => `<div class="sess">${esc(x.session)} — ${esc(x.overall)}</div><table><tr><th>Subject</th><th style="width:22mm">Marks</th><th style="width:40mm">Status</th></tr>
      ${x.results.map(r => `<tr><td>${esc(r.subject)}</td><td>${r.marks ?? ""}</td><td>${esc(r.status)}</td></tr>`).join("")}</table>`).join("")}</div>`;
  }).join("");
  return `<div class="page profile"><div class="phead"><img src="assets/logo.png" alt=""><div class="r">Student academic record<br>Printed ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div></div>
    <h1>${esc(s.name)}</h1><div class="ids">Student No ${esc(s.id)}${s.index_nos.length ? " · Index " + esc(s.index_nos.join(", ")) : ""}</div>${lv}</div>`;
}

/* ================= ADMISSIONS ================= */
let cur = null; // exam being edited
const venueBy = code => DB.venues.find(v => v.code === code);
function defaultHeading(level, date) {
  const d = date ? new Date(date + "-01") : new Date();
  const y = d.getFullYear(), m = MONTHS[d.getMonth()].toUpperCase();
  return `${LEVEL_TITLE[level]} (${y} BATCH 01) - FINAL EXAMINATION – ${m} ${y}`;
}
function makeSubjects(level) {
  return (LEVEL_SUBJECTS[level] || []).map(n => ({ id: uid(), code: SUBJECT_CODES[level]?.[n] || "", name: n.replace(/ & /g, " and "), match: n, date: "", from: "09:00", to: "12:00", venue: "CIT" }));
}
function newExam(type) {
  const level = "Analyst 1", y = new Date().getFullYear();
  return {
    id: uid(), type, level, heading: defaultHeading(level), headingAuto: true, place: "CIT",
    indexPrefix: `${y}/${LEVEL_CODE[level]}/E1/`, subjects: makeSubjects(level), candidates: [],
    options: { attestation: true, guidelines: true }, created: Date.now(),
  };
}
function subjectKey(ex, sub) { return sub.match || sub.name; }
function candidateFrom(ex, s) {
  const sum = s?.summary.find(m => m.level === ex.level);
  const status = {};
  for (const sub of ex.subjects) {
    const k = norm(subjectKey(ex, sub));
    const done = sum?.done.some(d => norm(d) === k);
    status[sub.id] = done ? "Exempted" : "X";
  }
  const ct = s?.contact || {};
  return { id: uid(), sid: s?.id || "", name: s && !s.missingName ? s.name : "", index: "", status, state: "draft",
    email: ct.email || "", title: ct.title || "", initials: ct.initials || "", phone: ct.phone || "", nic: ct.nic || "" };
}
function eligible(ex) {
  return DB.students.filter(s => {
    const m = s.summary.find(m => m.level === ex.level);
    return m && m.overall !== "Completed" && m.outstanding.length;
  }).sort((a, b) => (a.missingName - b.missingName) || a.name.localeCompare(b.name));
}

function renderAdmissions() {
  if (cur) { $("#adm-list").classList.add("hide"); $("#adm-edit").classList.remove("hide"); renderEditor(); return; }
  $("#adm-list").classList.remove("hide"); $("#adm-edit").classList.add("hide");
  $("#exams").innerHTML = DB.exams.length ? DB.exams.slice().sort((a, b) => b.created - a.created).map(e => {
    const applied = e.candidates.reduce((n, c) => n + Object.values(c.status).filter(v => v === "X").length, 0);
    const dates = e.subjects.map(s => s.date).filter(Boolean).sort();
    return `<button class="card exam" data-e="${e.id}"><div class="top"><div><b>${esc(e.heading)}</b>
      <div class="meta">${e.type === "external" ? "Outside venue" : "Internal · " + esc(venueBy(e.place)?.name || e.place)}${dates.length ? " · " + fmtDate(dates[0], "short") + (dates.length > 1 ? " – " + fmtDate(dates.at(-1), "short") : "") : ""}</div></div>
      <span class="chip ${e.type === "external" ? "c-purple" : "c-blue"}">${e.type === "external" ? "External" : "Internal"}</span></div>
      <div class="kpis"><div><b>${e.candidates.length}</b><br>Candidates</div><div><b>${applied}</b><br>Papers applied</div><div><b>${countState(e, "approved") + countState(e, "sent")}</b><br>Approved</div><div><b>${countState(e, "sent")}</b><br>Emailed</div></div>
      ${miniProgress(e)}</button>`;
  }).join("") : `<div class="card empty" style="padding:36px 16px">No exams yet.<br><span style="font-size:13.5px">Tap <b>New exam</b> to set one up from the internal or outside-venue template.</span></div>`;
  $("#venues").innerHTML = DB.venues.map(v => `<div class="row" data-v="${esc(v.code)}"><span class="ic" style="background:${color(v.code)};color:#fff;font-size:11px;font-weight:700;width:38px;height:30px">${esc(v.code)}</span>
    <div class="t"><b>${esc(v.name)}</b><span>${esc(v.address.replace(/\n/g, " "))}</span></div><span class="chev">›</span></div>`).join("");
  fx($("#adm-list"));
}
$("#exams").onclick = e => { const b = e.target.closest("[data-e]"); if (b) { cur = DB.exams.find(x => x.id === b.dataset.e); renderAdmissions(); scrollTo({ top: 0 }); } };
$("#venues").onclick = e => { const r = e.target.closest("[data-v]"); if (r) editVenue(venueBy(r.dataset.v)); };
$("#addVenue").onclick = () => editVenue(null);
$("#newExam").onclick = () => {
  openSheet(`<div class="bar-top"><b style="font-size:17px">New exam</b>${closeBtn}</div>
    <p class="sub" style="margin:0 0 14px">Choose the admission card template.</p>
    <div class="typecards">
      <button class="typecard" data-t="internal"><span class="ic" style="background:var(--blue)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/></svg></span>
        <b>Internal exam</b><span>Held at one place. Card shows the place of examination, attestation and the signature form with From / To times.</span></button>
      <button class="typecard" data-t="external"><span class="ic" style="background:var(--purple)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
        <b>Outside venue</b><span>Each subject can be at a different venue. Card adds an Exam Venue column and the examination locations.</span></button>
    </div>`);
  $("#sheet .typecards").onclick = e => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    cur = newExam(b.dataset.t); if (cur.type === "external") cur.subjects.forEach((s, i) => s.venue = i < 3 ? "UOC" : "CIT");
    DB.exams.push(cur); save(); closeSheet(); renderAdmissions(); scrollTo({ top: 0 });
  };
};
function editVenue(v) {
  const isNew = !v; v ||= { code: "", name: "", address: "" };
  openSheet(`<div class="bar-top"><b style="font-size:17px">${isNew ? "New venue" : "Edit venue"}</b>${closeBtn}</div>
    <div class="card form">
      <div class="field"><label>Short code</label><input id="vc" value="${esc(v.code)}" placeholder="e.g. UOC" maxlength="10"></div>
      <div class="field"><label>Name</label><input id="vn" value="${esc(v.name)}" placeholder="University of Colombo (UOC)"></div>
      <div class="field stack"><label>Address (one line per row)</label><textarea id="va" rows="4">${esc(v.address)}</textarea></div>
    </div>
    <div class="actions" style="justify-content:space-between">${!isNew ? `<button class="btn danger" id="vdel">Delete</button>` : "<span></span>"}<button class="btn primary" id="vsave">Save</button></div>`);
  $("#vsave").onclick = () => {
    const code = $("#vc").value.trim().toUpperCase(), name = $("#vn").value.trim();
    if (!code || !name) return toast("Add a code and a name");
    if (DB.venues.some(x => x.code === code && x !== v)) return toast("That code is already used");
    if (!isNew && v.code !== code) DB.exams.forEach(e => { if (e.place === v.code) e.place = code; e.subjects.forEach(s => { if (s.venue === v.code) s.venue = code; }); });
    Object.assign(v, { code, name, address: $("#va").value.trim() });
    if (isNew) DB.venues.push(v);
    save(); closeSheet(); cur ? renderEditor() : renderAdmissions(); toast("Venue saved");
  };
  if ($("#vdel")) $("#vdel").onclick = () => {
    if (DB.venues.length < 2) return toast("Keep at least one venue");
    if (!confirm(`Delete venue ${v.code}?`)) return;
    DB.venues = DB.venues.filter(x => x !== v); save(); closeSheet(); renderAdmissions();
  };
}

const venueOptions = sel => DB.venues.map(v => `<option value="${esc(v.code)}" ${v.code === sel ? "selected" : ""}>${esc(v.code)}</option>`).join("");
let saveT;
const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(save, 300); };

function renderEditor() {
  const e = cur, ext = e.type === "external";
  $("#adm-edit").innerHTML = `
    <button class="back" id="eBack"><svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg>Admissions</button>
    <div class="titlebar"><h1 style="font-size:28px">${ext ? "Outside venue exam" : "Internal exam"}</h1></div>
    <p class="sub">${ext ? "Template: venue per subject (UOC / CIT …)" : "Template: one place of examination"}</p>
    ${pipelineHtml(e)}

    <div class="card form">
      <div class="field"><label>Level</label><select id="eLevel">${LEVELS.map(l => `<option ${l === e.level ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field stack"><label>Exam heading (printed under the title)</label><input class="inp" id="eHead" value="${esc(e.heading)}"></div>
      ${ext ? "" : `<div class="field"><label>Place of exam</label><select id="ePlace">${venueOptions(e.place)}</select></div>`}
      <div class="field"><label>Index prefix</label><input id="ePrefix" value="${esc(e.indexPrefix)}" placeholder="2026/AN1/E2/"></div>
      <div class="field"><label>Attestation page</label><input type="checkbox" id="oAtt" ${e.options.attestation ? "checked" : ""} style="flex:none;width:20px;height:20px"></div>
      <div class="field"><label>Guidelines page</label><input type="checkbox" id="oGuide" ${e.options.guidelines ? "checked" : ""} style="flex:none;width:20px;height:20px"></div>
    </div>

    <div class="h2row"><h2>Timetable</h2><button class="link" id="addSub">Add subject</button></div>
    <div class="card"><div class="scrollx"><table class="subtable"><thead><tr><th style="width:84px">Code</th><th>Subject</th><th style="width:150px">Date</th><th style="width:108px">From</th><th style="width:108px">To</th>${ext ? `<th style="width:90px">Venue</th>` : ""}<th style="width:28px"></th></tr></thead>
      <tbody id="subs">${e.subjects.map(s => `<tr data-s="${s.id}">
        <td><input class="inp" data-k="code" value="${esc(s.code)}" placeholder="TX 211"></td>
        <td><input class="inp" data-k="name" value="${esc(s.name)}"></td>
        <td><input class="inp" type="date" data-k="date" value="${esc(s.date)}"></td>
        <td><input class="inp" type="time" data-k="from" value="${esc(s.from)}"></td>
        <td><input class="inp" type="time" data-k="to" value="${esc(s.to)}"></td>
        ${ext ? `<td><select class="inp" data-k="venue">${venueOptions(s.venue)}</select></td>` : ""}
        <td><button class="rm" title="Remove subject">−</button></td></tr>`).join("")}</tbody></table></div></div>

    <div class="h2row"><h2>Candidates <span style="color:var(--muted);font-weight:500">${e.candidates.length}</span></h2></div>
    <div class="toolbar">
      <button class="btn small primary" id="cAuto"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/></svg>Auto-add eligible</button>
      <button class="btn small" id="cFind">Add student</button>
      <label class="btn small">Import Excel<input type="file" id="cFile" accept=".xlsx,.xls,.csv" hidden></label>
      <button class="btn small" id="cBlank">Add blank</button>
      <span class="grow"></span>
      <button class="btn small" id="cNum" title="Give everyone an index number using the prefix">Number all</button>
      <button class="btn small" id="cExport">Export</button>
    </div>
    ${e.candidates.length > 6 ? `<div class="search" style="margin-bottom:10px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="cq" type="search" placeholder="Filter candidates"></div>` : ""}
    <div class="card" id="cands"></div>
    <p class="foot">Tap a subject pill to switch between <b>×</b> applied, Exempted and blank.</p>

    <div class="stickyfoot">
      <button class="btn danger" id="eDel">Delete</button><span style="flex:1"></span>
      <button class="btn" id="eZip" ${e.candidates.length ? "" : "disabled"} title="One PDF per student, named by student number, in one ZIP"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>Download all (${e.candidates.length})</button>
      <button class="btn" id="ePrint" ${e.candidates.length ? "" : "disabled"} title="All cards in one PDF">One PDF</button>
      <button class="btn" id="eReview" ${e.candidates.length ? "" : "disabled"}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>Review</button>
      <button class="btn primary" id="eSend" ${countState(e, "approved") ? "" : "disabled"}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>Send ${countState(e, "approved") || ""}</button>
    </div>`;
  renderCands();
  bindEditor();
  fx($("#adm-edit"), ".none");
}
function renderCands() {
  const e = cur, q = norm($("#cq")?.value || "");
  const list = e.candidates.filter(c => !q || norm(c.name + " " + c.index + " " + c.sid).includes(q));
  $("#cands").innerHTML = list.length ? list.map(c => `<div class="cand" data-c="${c.id}">
    <div class="av" style="background:${color(c.name || "?")};width:36px;height:36px;font-size:13px">${initials(c.name || "?") || "?"}</div>
    <div class="t"><div style="display:flex;align-items:center;gap:8px"><input class="inp" data-k="name" value="${esc(c.name)}" placeholder="Full name" style="font-weight:600;background:none;padding:2px 0">${stateChip(c)}</div>
      <input class="inp mail ${c.email && !isEmail(c.email) ? "bad" : ""}" data-k="email" value="${esc(c.email || "")}" placeholder="email address" type="email">
      <div class="pills">${e.subjects.map(s => { const v = c.status[s.id] || ""; return `<button class="pill ${v === "X" ? "x" : v ? "ex" : ""}" data-sub="${s.id}" title="${esc(s.name)}">${esc(s.code || abbr(s.name))} ${v === "X" ? "×" : v ? "Ex" : "–"}</button>`; }).join("")}</div></div>
    <input class="inp ix" data-k="index" value="${esc(c.index)}" placeholder="Index number">
    <div class="acts"><button data-a="view" title="Preview card"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button>
      <button data-a="print" title="PDF"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z"/></svg></button>
      <button data-a="del" class="del" title="Remove"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>
  </div>`).join("") : `<div class="empty">${e.candidates.length ? "No match" : "No candidates yet. Use <b>Auto-add eligible</b> to bring in every student who still has subjects to pass at this level."}</div>`;
}
const abbr = n => n.split(/\s+/).filter(w => !/^(and|for|of|&|in)$/i.test(w)).map(w => w[0]).join("").toUpperCase();
function bindEditor() {
  const e = cur;
  $("#eBack").onclick = () => { save(); cur = null; renderAdmissions(); scrollTo({ top: 0 }); };
  $("#eLevel").onchange = ev => {
    const lv = ev.target.value;
    if (e.candidates.length && !confirm("Changing the level resets the timetable and the subject choices of every candidate. Continue?")) { ev.target.value = e.level; return; }
    e.level = lv; const old = e.subjects; e.subjects = makeSubjects(lv);
    if (e.type === "external") e.subjects.forEach((s, i) => s.venue = old[i]?.venue || "CIT");
    e.subjects.forEach((s, i) => { if (old[i]) { s.date = old[i].date; s.from = old[i].from; s.to = old[i].to; } });
    if (e.headingAuto) e.heading = defaultHeading(lv, e.subjects.find(s => s.date)?.date?.slice(0, 7));
    e.indexPrefix = e.indexPrefix.replace(/\/(AP|AN1|AN2|AD)\//, `/${LEVEL_CODE[lv]}/`);
    e.candidates = e.candidates.map(c => { const s = DB.students.find(x => x.id === c.sid); const n = candidateFrom(e, s); n.name = c.name; n.index = c.index; n.id = c.id; return n; });
    save(); renderEditor();
  };
  $("#eHead").oninput = ev => { e.heading = ev.target.value; e.headingAuto = false; saveSoon(); cardChanged(e); };
  if ($("#ePlace")) $("#ePlace").onchange = ev => { e.place = ev.target.value; save(); cardChanged(e); };
  $("#ePrefix").oninput = ev => { e.indexPrefix = ev.target.value; saveSoon(); };
  $("#oAtt").onchange = ev => { e.options.attestation = ev.target.checked; save(); cardChanged(e); };
  $("#oGuide").onchange = ev => { e.options.guidelines = ev.target.checked; save(); cardChanged(e); };
  $("#eReview").onclick = () => openReview(e);
  $("#eSend").onclick = () => openSend(e);
  $$("#adm-edit [data-step]").forEach(b => b.onclick = () => {
    const s = b.dataset.step;
    if (s === "review") openReview(e); else if (s === "send") openSend(e);
    else $(s === "time" ? "#subs" : "#cands")?.closest(".card")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#subs").oninput = $("#subs").onchange = ev => {
    const tr = ev.target.closest("[data-s]"), k = ev.target.dataset.k; if (!tr || !k) return;
    const s = e.subjects.find(x => x.id === tr.dataset.s); s[k] = ev.target.value;
    if (k === "date" && e.headingAuto && s.date) { e.heading = defaultHeading(e.level, e.subjects.map(x => x.date).filter(Boolean).sort()[0].slice(0, 7)); $("#eHead").value = e.heading; }
    saveSoon(); if (k === "code" || k === "name") renderCands();
    cardChanged(e);
  };
  $("#subs").onclick = ev => {
    if (!ev.target.classList.contains("rm")) return;
    const id = ev.target.closest("[data-s]").dataset.s;
    e.subjects = e.subjects.filter(s => s.id !== id); e.candidates.forEach(c => delete c.status[id]); cardChanged(e, true); save(); renderEditor();
  };
  $("#addSub").onclick = () => {
    const s = { id: uid(), code: "", name: "", match: "", date: "", from: "13:30", to: "16:30", venue: "CIT" };
    e.subjects.push(s); e.candidates.forEach(c => c.status[s.id] = ""); cardChanged(e, true); save(); renderEditor();
  };
  $("#cands").oninput = ev => {
    const row = ev.target.closest("[data-c]"), k = ev.target.dataset.k; if (!row || !k) return;
    const c = e.candidates.find(c => c.id === row.dataset.c);
    c[k] = ev.target.value; saveSoon();
    if (k === "email") { ev.target.classList.toggle("bad", !!c.email && !isEmail(c.email)); rememberContact(c); }
    if (touched(c)) { const chip = row.querySelector(".st"); if (chip) chip.outerHTML = stateChip(c); refreshPipeline(); }
  };
  $("#cands").onclick = ev => {
    const row = ev.target.closest("[data-c]"); if (!row) return;
    const c = e.candidates.find(c => c.id === row.dataset.c);
    const pill = ev.target.closest("[data-sub]");
    if (pill) { const v = c.status[pill.dataset.sub] || ""; c.status[pill.dataset.sub] = v === "X" ? "Exempted" : v === "Exempted" ? "" : "X"; touched(c); save(); renderCands(); refreshPipeline(); return; }
    const a = ev.target.closest("[data-a]")?.dataset.a;
    if (a === "del") { e.candidates = e.candidates.filter(x => x !== c); save(); renderEditor(); }
    if (a === "view") previewCards([c]);
    if (a === "print") pdfDownload(cardPages(e, c), `${c.index || c.name} Admission Card.pdf`);
  };
  if ($("#cq")) $("#cq").oninput = renderCands;
  $("#cAuto").onclick = () => autoAdd();
  $("#cFind").onclick = () => findStudent();
  $("#cBlank").onclick = () => { const c = candidateFrom(e, null); e.candidates.push(c); save(); renderEditor(); setTimeout(() => $(`[data-c="${c.id}"] input`)?.focus(), 30); };
  $("#cNum").onclick = () => {
    if (!e.indexPrefix) return toast("Set an index prefix first");
    if (e.candidates.some(c => c.index) && !confirm("Replace existing index numbers? Candidates are numbered in alphabetical order.")) return;
    e.candidates.sort((a, b) => (!a.name - !b.name) || a.name.localeCompare(b.name)).forEach((c, i) => c.index = e.indexPrefix + pad(i + 1));
    save(); renderEditor(); toast("Numbered " + e.candidates.length + " candidates");
  };
  $("#cExport").onclick = () => {
    if (!e.candidates.length) return toast("No candidates yet");
    xlsxDownload(e.candidates.map(c => {
      const r = { "Student No": c.sid, "Name_in_full": c.name, "Index_Number": c.index };
      e.subjects.forEach(s => r[(s.code ? s.code + " " : "") + s.name] = c.status[s.id] === "X" ? "X" : c.status[s.id] || "");
      return r;
    }), "Candidates", `admission-${e.level.replace(/ /g, "")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  $("#cFile").onchange = ev => { const f = ev.target.files[0]; ev.target.value = ""; if (f) importCandidates(f); };
  $("#eDel").onclick = () => {
    if (!confirm("Delete this exam and its candidate list?")) return;
    DB.exams = DB.exams.filter(x => x !== e); cur = null; save(); renderAdmissions();
  };
  $("#ePrint").onclick = () => pdfDownload(e.candidates.flatMap(c => cardPages(e, c)), `Admission cards - ${e.level}.pdf`);
  $("#eZip").onclick = () => downloadAllCards(e);
}
function autoAdd() {
  const e = cur, have = new Set(e.candidates.map(c => c.sid));
  const list = eligible(e).filter(s => !have.has(s.id));
  if (!list.length) return toast(`No more ${e.level} students with subjects outstanding`);
  const sessions = [...new Set(list.map(s => s.sittings.filter(x => x.level === e.level).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.session))].filter(Boolean);
  openSheet(`<div class="bar-top"><b style="font-size:17px">Eligible · ${e.level}</b>${closeBtn}</div>
    <p class="sub" style="margin:0 0 10px">Students with subjects still to pass. Subjects already passed are marked Exempted, the rest are marked × (applied).</p>
    <div class="toolbar"><select class="inp" id="aSess" style="flex:1"><option value="">Any last sitting</option>${sessions.map(s => `<option>${esc(s)}</option>`).join("")}</select>
      <button class="btn small" id="aAll">Select all</button></div>
    <div class="card list" id="aList"></div>
    <div class="actions" style="justify-content:flex-end;position:sticky;bottom:0;background:var(--sheet);padding:10px 0 0"><button class="btn primary" id="aGo">Add</button></div>`);
  const draw = () => {
    const ss = $("#aSess").value;
    const rows = list.filter(s => !ss || s.sittings.filter(x => x.level === e.level).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.session === ss);
    $("#aList").innerHTML = rows.map(s => { const m = s.summary.find(m => m.level === e.level);
      return `<label class="row" style="cursor:pointer"><input type="checkbox" checked data-id="${esc(s.id)}" style="width:20px;height:20px;accent-color:var(--blue)">
      <div class="t"><b>${esc(s.name)}</b><span>${esc(s.id)} · to pass: ${esc(m.outstanding.join(", "))}</span></div><span class="chip c-${chipFor(m.overall)}">${esc(m.overall)}</span></label>`; }).join("");
    count();
  };
  const count = () => { $("#aGo").textContent = `Add ${$$("#aList input:checked").length} students`; };
  $("#aSess").onchange = draw; $("#aList").onchange = count;
  $("#aAll").onclick = () => { const all = $$("#aList input"); const on = all.some(i => !i.checked); all.forEach(i => i.checked = on); count(); };
  $("#aGo").onclick = () => {
    const ids = new Set($$("#aList input:checked").map(i => i.dataset.id));
    list.filter(s => ids.has(s.id)).forEach(s => e.candidates.push(candidateFrom(e, s)));
    save(); closeSheet(); renderEditor(); toast(`Added ${ids.size} candidates`);
  };
  draw();
}
function findStudent() {
  const e = cur;
  openSheet(`<div class="bar-top"><b style="font-size:17px">Add student</b>${closeBtn}</div>
    <div class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="fq" type="search" placeholder="Name, student or index number" autocomplete="off"></div>
    <div class="card list" id="fList" style="margin-top:12px"></div>`);
  const draw = () => {
    const q = $("#fq").value.trim(), ql = q.toLowerCase(), toks = norm(q).split(" ").filter(Boolean);
    const hits = q ? DB.students.filter(s => s.id.toLowerCase().includes(ql) || s.index_nos.some(i => i.toLowerCase().includes(ql)) || toks.every(t => norm(s.name).includes(t))).slice(0, 30) : [];
    $("#fList").innerHTML = hits.map(s => { const m = s.summary.find(m => m.level === e.level);
      return `<div class="row" data-id="${esc(s.id)}"><div class="av" style="background:${color(s.name)};width:34px;height:34px;font-size:13px">${initials(s.name)}</div>
      <div class="t"><b>${esc(s.name)}</b><span>${esc(s.id)} · ${m ? e.level + ": " + esc(m.overall) : "No " + e.level + " results"}</span></div><span class="chev">+</span></div>`; }).join("") || `<div class="empty">${q ? "No students found" : "Start typing to search"}</div>`;
  };
  $("#fq").oninput = draw; draw(); setTimeout(() => $("#fq").focus(), 350);
  $("#fList").onclick = ev => {
    const r = ev.target.closest("[data-id]"); if (!r) return;
    if (e.candidates.some(c => c.sid === r.dataset.id)) return toast("Already added");
    e.candidates.push(candidateFrom(e, DB.students.find(s => s.id === r.dataset.id))); save(); renderEditor(); toast("Added");
    r.style.opacity = .4;
  };
}

/* ---------- read any spreadsheet into rows ---------- */
async function readSheetFile(file) {
  if (!window.XLSX) throw new Error("Excel library did not load. Check the internet connection.");
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array", cellDates: true });
}
function sheetRows(wb, name) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true, blankrows: false });
  let h = rows.findIndex((r, i) => i < 25 && r.filter(c => String(c).trim()).length >= 2 && r.some(c => /name/i.test(String(c))));
  if (h < 0) h = rows.findIndex(r => r.filter(c => String(c).trim()).length >= 3);
  if (h < 0) h = 0;
  const header = (rows[h] || []).map((c, i) => String(c).replace(/\s+/g, " ").trim() || `Column ${i + 1}`);
  const body = rows.slice(h + 1).filter(r => r.some(c => String(c).trim()));
  return { header, body };
}
const findCol = (header, re, not) => header.findIndex(h => re.test(h) && !(not && not.test(h)));
function matchSubjectCol(header, sub, used) {
  const keys = [norm(sub.match || sub.name), norm(sub.name)].filter(Boolean);
  const code = tight(sub.code), ab = abbr(sub.match || sub.name);
  let i = header.findIndex((h, j) => !used.has(j) && keys.some(k => norm(h).includes(k)));
  if (i < 0 && code) i = header.findIndex((h, j) => !used.has(j) && tight(h).includes(code));
  if (i < 0 && ab.length > 1) i = header.findIndex((h, j) => !used.has(j) && h.replace(/[^a-z]/gi, "").toUpperCase() === ab);
  return i;
}
/* importCandidates: see workflow.js */

/* ---------- admission card pages ---------- */
function fmtDate(d, style) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00"); if (isNaN(dt)) return d;
  if (style === "short") return `${dt.getDate()} ${MONTHS[dt.getMonth()].slice(0, 3)}`;
  if (style === "ad") return `${MONTHS[dt.getMonth()].slice(0, 3)} ${pad(dt.getDate(), 2)},<br>${DAYS[dt.getDay()]}`;
  return `${DAYS[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
function fmtTime(t) {
  if (!t) return "";
  let [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; h = h % 12 || 12;
  return `${h}.${pad(m, 2)} ${ap}`;
}
const statusCell = v => v === "X" ? `<span class="x">×</span>` : esc(v || "");
const DOTS = n => ".".repeat(n);
const GUIDE = [
  ["1. Examination Attendance &amp; Identification", ["Arrive at the exam venue at least 30 minutes before the scheduled time.", "Carry a valid identification document - NIC &amp; Student ID is Compulsory.", "Follow <b>seating arrangements</b> as directed by the invigilators."]],
  ["2. Examination Conduct &amp; Discipline", ["Maintain professional behavior throughout the exam.", "Strictly avoid any form of misconduct (cheating, plagiarism, talking).", "Follow the <b>instructions given by invigilators</b> without dispute."]],
  ["3. Use of Examination Materials", ["Only bring approved materials (e.g., pens, pencils, permitted calculators).", "Using unauthorized electronic devices such as mobile phones &amp; smartwatches is strictly prohibited during the examination.", "Write answers <b>legibly</b> and adhere to the provided format."]],
  ["4. Timing &amp; Submission", ["Monitor your time carefully and manage answers accordingly.", "Submit your answer scripts before leaving the examination hall.", "Remain seated until the exam is officially declared closed."]],
  ["5. Consequences of Misconduct", ["Any form of cheating, impersonation, or rule violation may lead to disqualification.", "Exam results may be withheld if misconduct is detected."]],
  ["6. Results", ["Results will <b>be announced as per the official timeline.</b>", "Certificates will be issued to <b>successful candidates</b> upon completion."]],
];
const guidePage = (serif) => `<div class="page${serif ? " serif" : ""}"><div class="frame"></div><img class="logo" src="assets/logo.png" alt="">
  <h1 class="ct" style="font-size:13.5pt;margin-bottom:5mm">General Guidelines for Examination Candidates</h1>
  <div class="guide">${GUIDE.map(([h, items]) => `<h3>${h}</h3><ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`).join("")}</div></div>`;
const attestBlock = (big) => `<div class="att${big ? "" : " tight"}">
  <div class="center" style="text-decoration:${big ? "none" : "underline"};font-size:11.5pt;margin-bottom:${big ? 2 : 1}mm">ATTESTATION</div>
  <div class="center" style="font-weight:${big ? 700 : 400};margin-bottom:${big ? 7 : 1.5}mm;line-height:${big ? 1.6 : 1.3}">This should be done by any Employer/Executive Officer/Justice of Peace /Member of the Chartered Institute of Taxation of Sri Lanka)</div>
  ${big ? "" : `<hr class="rule" style="border-top-width:1.5pt;margin:0 0 2mm">`}
  <p>Mr./Ms ${DOTS(78)} bearing NIC No ${DOTS(30)} is known to me, for last ${DOTS(26)} years/ is employed under me and his/her signature appears below.</p>
  <p>Signature of the Student: ${DOTS(42)} <span style="float:right">Date: ......../......../ ${DOTS(16)}</span></p>
  <p>Name of the Attester: ${DOTS(96)}</p>
  <p>Designation of the Attester: ${DOTS(86)}</p>
  <p>Address of the Attester: ${big ? "<br>" + DOTS(124) : DOTS(92)}<br>${DOTS(124)}</p>
  ${big ? "<br>" : ""}<p>Signature of the Attester: ${DOTS(42)}</p>
  ${big ? "<br>" : ""}<p>Date: ........./........../ ${DOTS(18)}</p>
  <div class="seal">Official seal of the Attester</div></div>`;

function cardPages(e, c) {
  const pages = [];
  const subs = e.subjects;
  if (e.type === "external") {
    const used = [...new Set(subs.map(s => s.venue))].map(venueBy).filter(Boolean);
    pages.push(`<div class="page"><div class="frame"></div><img class="logo" src="assets/logo.png" alt="">
      <h1 class="ct">ADMISSION CARD AND SIGNATURE FORM</h1><h2 class="cs">${esc(e.heading)}</h2>
      <hr class="rule" style="margin-top:4mm">
      <table class="info" style="margin-left:14mm"><tr><td>1.&nbsp;&nbsp; Name of Student</td><td>: &nbsp;${esc(c.name)}</td></tr><tr><td>2.&nbsp;&nbsp; Index Number</td><td>: &nbsp;${esc(c.index)}</td></tr></table>
      <hr class="rule">
      <div class="sec">SIGNATURE FORM</div>
      <table class="sf"><thead><tr><th style="width:23%">Subject</th><th style="width:11%">Subject Status</th><th style="width:22%">Date</th><th style="width:10%">Exam Venue</th><th>Signature of Candidate</th><th>Signature of Invigilator</th></tr></thead>
      <tbody>${subs.map(s => `<tr class="r"><td class="sj">${esc((s.code ? s.code + " " : "") + s.name)}</td><td>${statusCell(c.status[s.id])}</td>
        <td>${fmtDate(s.date)}<br><b>${fmtTime(s.from)}${s.to ? " to " + fmtTime(s.to) : ""}</b></td><td><b>${esc(s.venue)}</b></td><td></td><td></td></tr>`).join("")}</tbody></table>
      <div class="denote">“X” denotes applied subjects by candidate</div>
      <hr class="rule">
      <div style="text-align:center;font-weight:700;font-size:11pt;margin-bottom:3mm">Examination Location</div>
      <div class="loc">${used.map(v => `<p><b>${esc(v.code)}</b> – ${esc(v.name)}\n${esc(v.address)}</p>`).join("")}</div>
    </div>`);
    if (e.options.attestation) pages.push(`<div class="page"><div class="frame"></div><img class="logo" src="assets/logo.png" alt="" style="margin-bottom:8mm">${attestBlock(true)}</div>`);
    if (e.options.guidelines) pages.push(guidePage(false));
  } else {
    const v = venueBy(e.place) || { name: e.place, address: "" };
    pages.push(`<div class="page serif"><div class="frame"></div><img class="logo" src="assets/logo.png" alt="" style="height:24mm">
      <h1 class="ct" style="font-size:14pt">ADMISSION CARD AND SIGNATURE FORM</h1><h2 class="cs" style="font-size:11.5pt">${esc(e.heading)}</h2>
      <hr class="rule" style="margin:3mm 0 2mm">
      <table class="info" style="margin:0 0 1mm 2mm"><tr><td>1.&nbsp; Name of Student</td><td>: &nbsp;${esc(c.name)}</td></tr><tr><td>2.&nbsp; Index Number</td><td>: &nbsp;${esc(c.index)}</td></tr>
        <tr><td>3.&nbsp; Place of Examination</td><td>: &nbsp;${esc(v.name)}${v.address ? "<br>&nbsp;&nbsp;&nbsp;" + esc(v.address).replace(/\n/g, "<br>&nbsp;&nbsp;&nbsp;") : ""}</td></tr></table>
      <hr class="rule" style="margin:1mm 0 2mm">
      ${e.options.attestation ? attestBlock(false) : ""}
      <hr class="rule" style="margin:2mm 0 1mm">
      <div class="sec" style="margin:1mm 0 2mm">SIGNATURE FORM</div>
      <table class="sf ad"><thead><tr><th rowspan="2" style="width:10%">Code</th><th rowspan="2" style="width:24%">Subject</th><th rowspan="2" style="width:11%">Subject Status</th><th rowspan="2" style="width:9%">Date</th><th colspan="2">Time</th><th rowspan="2">Signature of Student</th><th rowspan="2">Signature of Invigilator</th></tr><tr><th style="width:9%">From</th><th style="width:9%">To</th></tr></thead>
      <tbody>${subs.map(s => `<tr><td class="code">${esc(s.code)}</td><td class="sj">${esc(s.name)}</td><td><b>${statusCell(c.status[s.id])}</b></td><td>${fmtDate(s.date, "ad")}</td><td>${fmtTime(s.from)}</td><td>${fmtTime(s.to)}</td><td></td><td></td></tr>`).join("")}</tbody></table>
      <div class="denote">“X” denotes applied subjects by candidate</div>
      <hr class="rule" style="margin-top:1.5mm">
    </div>`);
    if (e.options.guidelines) pages.push(guidePage(true));
  }
  return pages;
}

function previewCards(cands) {
  const e = cur; let i = 0;
  openSheet(`<div class="bar-top"><div style="display:flex;align-items:center;gap:6px"><button class="btn small" id="pv-prev">‹</button><b id="pv-t" style="font-size:15px"></b><button class="btn small" id="pv-next">›</button></div>
    <div style="display:flex;gap:8px"><button class="btn small primary" id="pv-print">PDF</button>${closeBtn}</div></div>
    <div class="paperwrap" id="pv"></div>`);
  const draw = () => {
    const c = cands[i]; $("#pv-t").textContent = `${i + 1} / ${cands.length} · ${c.name || "Unnamed"}`;
    const w = $("#pv").clientWidth - 36, z = Math.min(1, w / 794);
    $("#pv").innerHTML = cardPages(e, c).map(p => `<div style="zoom:${z}">${p}</div>`).join("");
    $("#pv-prev").disabled = i === 0; $("#pv-next").disabled = i === cands.length - 1;
  };
  $("#pv-prev").onclick = () => { if (i > 0) { i--; draw(); } };
  $("#pv-next").onclick = () => { if (i < cands.length - 1) { i++; draw(); } };
  $("#pv-print").onclick = () => downloadOneCard(e, cands[i]);
  requestAnimationFrame(draw);
}

/* ---------- printing (Save as PDF) ---------- */
async function printPages(pages) {
  const root = $("#print-root");
  root.innerHTML = pages.join("");
  await Promise.all($$("img", root).map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
  toast(pages.length > 3 ? `Preparing ${pages.length} pages… choose “Save as PDF”` : "Choose “Save as PDF” to download");
  setTimeout(() => { window.print(); }, 150);
}
addEventListener("afterprint", () => { $("#print-root").innerHTML = ""; });

/* ================= DATA / IMPORT ================= */
function renderData() {
  setTimeout(() => fx($("#v-data"), "#history .row"));
  $("#history").innerHTML = DB.imports.length ? DB.imports.slice().reverse().map(h => `<div class="row" style="cursor:default"><span class="ic" style="background:var(--green)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="m5 12 5 5 9-10"/></svg></span>
    <div class="t"><b>${esc(h.session)}</b><span>${esc(h.file)} · ${h.rows} rows · ${h.matched} matched · ${h.created} new · ${new Date(h.at).toLocaleDateString()}</span></div>
    <button class="btn small danger" data-undo="${h.id}">Undo</button></div>`).join("")
    : `<div class="empty" style="padding:20px">Nothing imported yet. Built-in data: ${ORIGINAL.students.length} students from ${ORIGINAL.sessions.length} exam sessions.</div>`;
}
$("#history").onclick = e => {
  const b = e.target.closest("[data-undo]"); if (!b) return;
  const h = DB.imports.find(x => x.id === b.dataset.undo);
  if (!confirm(`Remove everything imported from “${h.file}”?`)) return;
  for (const s of DB.students) s.sittings = s.sittings.filter(x => x.src !== h.id);
  DB.students = DB.students.filter(s => !(s.src === h.id && !s.sittings.length));
  DB.imports = DB.imports.filter(x => x !== h); derive(); save(); renderData(); toast("Import removed");
};
const drop = $("#drop");
["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) startImport(f); });
$("#fileIn").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) startImport(f); };

function parseStatus(v, passMark) {
  if (v instanceof Date) return null;
  const s = String(v ?? "").trim(); if (!s) return null;
  const num = typeof v === "number" ? v : (/^\d+(\.\d+)?/.test(s) ? parseFloat(s) : null);
  const t = s.toLowerCase().replace(/[^a-z() ]/g, " ").replace(/\s+/g, " ").trim();
  let status = null;
  if (/^ab|absent/.test(t)) status = "Absent";
  else if (/ta\)?$|\(ta/.test(t) && /ex/.test(t)) status = "Exempted (TA)";
  else if (/^ex|exempt/.test(t)) status = "Exempted";
  else if (/^pc$|previous/.test(t)) status = "Previously Completed";
  else if (/^skip/.test(t) || s === "-") status = "Skipped";
  else if (/^(p|pass|passed)$/.test(t) || /\bpass\b/.test(t)) status = "Pass";
  else if (/^(f|fail|failed)$/.test(t) || /\bfail\b/.test(t)) status = "Fail";
  else if (/^c$|completed/.test(t)) status = "Previously Completed";
  if (!status && num != null) status = num >= passMark ? "Pass" : "Fail";
  if (!status) return null;
  return { marks: num, status };
}
function parseOverall(v) {
  const t = String(v ?? "").toLowerCase().trim(); if (!t) return "";
  if (/re.?refer/.test(t)) return "Re-Referred";
  if (/refer/.test(t)) return "Referred";
  if (/complet|pass/.test(t)) return "Completed";
  if (/absent|^ab/.test(t)) return "Absent";
  if (/fail/.test(t)) return "Fail";
  return String(v).trim();
}
let IMP = null;
async function startImport(file) {
  busy(true);
  let wb; try { wb = await readSheetFile(file); } catch (err) { busy(false); return toast(err.message); }
  busy(false);
  const base = file.name.replace(/\.[^.]+$/, "");
  const guessLevel = (txt) => { const t = norm(txt); return /advis/.test(t) ? "Advisory" : /applic/.test(t) ? "Application" : /analyst\s*(level\s*)?2|an2|al2/.test(t) ? "Analyst 2" : /analyst|an1|al1/.test(t) ? "Analyst 1" : "Analyst 1"; };
  const mm = base.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\D{0,3}(20\d\d)/i);
  const date = mm ? `${mm[2]}-${pad(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(mm[1].toLowerCase()) + 1, 2)}` : new Date().toISOString().slice(0, 7);
  IMP = { file: file.name, wb, sheet: wb.SheetNames[0], level: guessLevel(base + " " + wb.SheetNames[0]), session: base.replace(/^results? of /i, "").replace(/[_]+/g, " "), date, passMark: 50 };
  prepImport(); renderImporter();
}
function prepImport() {
  const { header, body } = sheetRows(IMP.wb, IMP.sheet);
  IMP.header = header; IMP.body = body;
  IMP.map = {
    id: findCol(header, /student\s*(no|id|number|#)|reg(istration)?\s*(no|number)|membership|^id$/i, /name/i),
    name: findCol(header, /name/i),
    index: findCol(header, /index/i),
    overall: findCol(header, /overall|final result|^result$|^status$|grade/i),
    subjects: {},
  };
  const used = new Set([IMP.map.id, IMP.map.name, IMP.map.index, IMP.map.overall].filter(i => i >= 0));
  for (const sub of LEVEL_SUBJECTS[IMP.level]) {
    const i = matchSubjectCol(header, { name: sub, match: sub, code: SUBJECT_CODES[IMP.level]?.[sub] || "" }, used);
    IMP.map.subjects[sub] = i; if (i >= 0) used.add(i);
  }
}
function colSelect(key, val) {
  return `<select class="inp" data-map="${esc(key)}"><option value="-1">— not in file —</option>${IMP.header.map((h, i) => `<option value="${i}" ${i === val ? "selected" : ""}>${esc(h)}</option>`).join("")}</select>`;
}
function buildRecords() {
  const m = IMP.map, out = [];
  for (const r of IMP.body) {
    const name = m.name >= 0 ? String(r[m.name] ?? "").replace(/\s+/g, " ").trim() : "";
    const id = m.id >= 0 ? String(r[m.id] ?? "").trim() : "";
    const index = m.index >= 0 ? String(r[m.index] ?? "").trim() : "";
    if (!name && !id && !index) continue;
    if (/^(total|no\.?|#)$/i.test(name)) continue;
    const results = [];
    for (const sub of LEVEL_SUBJECTS[IMP.level]) {
      const i = m.subjects[sub]; if (i == null || i < 0) continue;
      const p = parseStatus(r[i], IMP.passMark); if (p) results.push({ subject: sub, marks: p.marks, status: p.status });
    }
    if (!results.length && m.overall < 0) continue;
    out.push({ name, id, index, results, overall: m.overall >= 0 ? parseOverall(r[m.overall]) : "" });
  }
  return out;
}
function locate(rec) {
  const L = s => s.toLowerCase();
  return (rec.id && DB.students.find(s => L(s.id) === L(rec.id)))
    || (rec.index && DB.students.find(s => s.index_nos.some(i => L(i) === L(rec.index))))
    || (rec.name && DB.students.find(s => norm(s.name) === norm(rec.name))) || null;
}
function renderImporter() {
  if (!IMP) { $("#importer").innerHTML = ""; return; }
  const recs = buildRecords(), matched = recs.filter(locate).length;
  const m = IMP.map;
  $("#importer").innerHTML = `<div class="card" style="margin-top:14px;padding:14px 16px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><b style="font-size:17px">${esc(IMP.file)}</b><button class="close" id="impX" style="width:30px;height:30px;border-radius:50%;border:0;background:var(--fill);color:var(--muted)">✕</button></div>
    <div class="mapgrid">
      ${IMP.wb.SheetNames.length > 1 ? `<label>Sheet<select class="inp" id="impSheet">${IMP.wb.SheetNames.map(n => `<option ${n === IMP.sheet ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>` : ""}
      <label>Level<select class="inp" id="impLevel">${LEVELS.map(l => `<option ${l === IMP.level ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Exam session name<input class="inp" id="impSess" value="${esc(IMP.session)}"></label>
      <label>Exam month<input class="inp" type="month" id="impDate" value="${esc(IMP.date)}"></label>
      <label>Pass mark<input class="inp" type="number" id="impPass" value="${IMP.passMark}" min="0" max="100"></label>
    </div>
    <small class="k" style="margin-top:2px">Match the columns</small>
    <div class="mapgrid" style="padding-top:4px">
      <label>Student number${colSelect("id", m.id)}</label>
      <label>Name${colSelect("name", m.name)}</label>
      <label>Index number${colSelect("index", m.index)}</label>
      <label>Overall result${colSelect("overall", m.overall)}</label>
      ${LEVEL_SUBJECTS[IMP.level].map(s => `<label>${esc(s)}${colSelect("s:" + s, m.subjects[s])}</label>`).join("")}
    </div>
    <div class="note">${recs.length} students found · <b style="color:var(--text)">${matched}</b> match existing profiles · ${recs.length - matched} will be added as new. Marks are read as Pass / Fail using the pass mark; text such as AB, Exempted or PC is understood.</div>
    <div class="scrollx"><table class="preview-table"><tr><th>Name</th><th>Student / Index</th><th>Match</th>${LEVEL_SUBJECTS[IMP.level].map(s => `<th>${esc(abbr(s))}</th>`).join("")}<th>Overall</th></tr>
      ${recs.slice(0, 6).map(r => { const st = locate(r); return `<tr><td>${esc(r.name)}</td><td>${esc(r.id || r.index)}</td><td>${st ? `<span class="chip c-green">Existing</span>` : `<span class="chip c-blue">New</span>`}</td>
        ${LEVEL_SUBJECTS[IMP.level].map(s => { const x = r.results.find(z => z.subject === s); return `<td>${x ? `<span class="chip c-${chipFor(x.status)}">${x.marks ?? ""} ${esc(x.status === "Previously Completed" ? "PC" : x.status)}</span>` : ""}</td>`; }).join("")}
        <td>${esc(r.overall || "auto")}</td></tr>`; }).join("")}</table></div>
    <div class="actions" style="justify-content:flex-end"><button class="btn" id="impCancel">Cancel</button><button class="btn primary" id="impGo" ${recs.length && IMP.session.trim() ? "" : "disabled"}>Import ${recs.length} students</button></div>
  </div>`;
  const re = () => renderImporter();
  $("#impX").onclick = $("#impCancel").onclick = () => { IMP = null; renderImporter(); };
  if ($("#impSheet")) $("#impSheet").onchange = e => { IMP.sheet = e.target.value; prepImport(); re(); };
  $("#impLevel").onchange = e => { IMP.level = e.target.value; prepImport(); re(); };
  $("#impSess").onchange = e => { IMP.session = e.target.value.trim(); re(); };
  $("#impDate").onchange = e => { IMP.date = e.target.value; };
  $("#impPass").onchange = e => { IMP.passMark = +e.target.value || 50; re(); };
  $$("#importer [data-map]").forEach(sel => sel.onchange = e => {
    const k = e.target.dataset.map, v = +e.target.value;
    if (k.startsWith("s:")) IMP.map.subjects[k.slice(2)] = v; else IMP.map[k] = v; re();
  });
  $("#impGo").onclick = commitImport;
}
function commitImport() {
  const recs = buildRecords(), hid = uid(), session = IMP.session.trim();
  if (DB.students.some(s => s.sittings.some(x => x.session === session)) && !confirm(`“${session}” already exists. Results for the same students will be replaced. Continue?`)) return;
  let matched = 0, created = 0;
  for (const r of recs) {
    let s = locate(r);
    if (s) matched++;
    else { s = { id: r.id || r.index || "NEW-" + uid().slice(0, 6).toUpperCase(), name: r.name || r.id, index_nos: [], sittings: [], src: hid }; DB.students.push(s); created++; }
    if (r.index && !s.index_nos.includes(r.index)) s.index_nos.push(r.index);
    const prev = s.sittings.filter(x => x.level === IMP.level && x.session !== session);
    let overall = r.overall;
    if (!overall) {
      const st = r.results.map(x => x.status);
      const doneAll = LEVEL_SUBJECTS[IMP.level].every(sub => r.results.some(x => x.subject === sub && DONE.has(x.status)) || prev.some(p => p.results.some(x => x.subject === sub && DONE.has(x.status))));
      overall = doneAll ? "Completed" : st.length && st.every(x => x === "Absent" || x === "Skipped" || DONE.has(x)) && !st.includes("Pass") ? "Absent"
        : prev.some(p => /referred/i.test(p.overall)) ? "Re-Referred" : "Referred";
    }
    s.sittings = s.sittings.filter(x => x.session !== session);
    s.sittings.push({ level: IMP.level, session, date: IMP.date || new Date().toISOString().slice(0, 7), overall, results: r.results, src: hid, index: r.index || "" });
  }
  DB.imports.push({ id: hid, file: IMP.file, session, level: IMP.level, rows: recs.length, matched, created, at: Date.now() });
  IMP = null; derive(); save(); renderImporter(); renderData();
  toast(`Imported ${recs.length} · ${matched} matched · ${created} new`);
}

$("#exportAll").onclick = () => {
  const rows = [];
  for (const s of DB.students) for (const x of s.sittings) for (const r of x.results)
    rows.push({ "Student No": s.id, "Name": s.name, "Index Numbers": s.index_nos.join(", "), "Level": x.level, "Exam session": x.session, "Month": x.date, "Subject": r.subject, "Marks": r.marks ?? "", "Status": r.status, "Overall": x.overall });
  xlsxDownload(rows, "All results", `cit-all-results-${new Date().toISOString().slice(0, 10)}.xlsx`);
};
$("#backup").onclick = () => {
  const out = { ...DB, students: DB.students.map(({ summary, ...s }) => s), exported: new Date().toISOString() };
  download(`cit-student-hub-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(out)], { type: "application/json" }));
};
$("#restoreIn").onchange = async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (!Array.isArray(d.students)) throw 0;
    if (!confirm(`Replace current data with ${d.students.length} students from this backup?`)) return;
    DB = { students: normalizeStudents(d.students), exams: d.exams || [], venues: d.venues || structuredClone(DEFAULT_VENUES), imports: d.imports || [], settings: d.settings || { supervisor: "", pin: "" }, members: d.members || DB.members };
    derive(); save(); renderData(); toast("Backup restored");
  } catch { toast("That file is not a Student Hub backup"); }
};
$("#reset").onclick = () => {
  if (!confirm("Remove all imported results and go back to the original data? Exams and venues are kept.")) return;
  DB.students = normalizeStudents(structuredClone(ORIGINAL.students)); DB.imports = [];
  derive(); save(); renderData(); toast("Original data restored");
};

/* ---------------- boot ---------------- */
load().then(() => {
  let t = "home"; try { t = sessionStorage.getItem("tab") || "home"; } catch { }
  tab(t);
}).catch(err => { console.error(err); document.querySelector("main").innerHTML = `<div class="card empty" style="margin-top:40px">Could not load data.json. Open this site through a web server (not as a file).</div>`; });
