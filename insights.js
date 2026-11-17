/* CIT Student Hub — Insights, rebuilt to answer plain questions:
 *   How many students? · Where are they in the course? · How did the latest exam go?
 *   Which subjects are hard? · What needs attention? · Every exam so far.
 * Every number links to the students behind it. */
"use strict";
let insLevel = null;
const pc = (a, b) => b ? Math.round(100 * a / b) : 0;
const LVL_NAME = { "Application": "Application", "Analyst 1": "Analyst I", "Analyst 2": "Analyst II", "Advisory": "Advisory" };
const plural = (n, w, p = w + "s") => `${n.toLocaleString()} ${n === 1 ? w : p}`;

function insightsData() {
  const S = DB.students, sat = S.filter(s => s.sittings.length);
  const levels = LEVELS.map(l => {
    const st = S.filter(s => s.summary.some(m => m.level === l)), m = s => s.summary.find(x => x.level === l);
    const done = st.filter(s => m(s).overall === "Completed").length;
    const referred = st.filter(s => /referred/i.test(m(s).overall)).length;
    const away = st.length - done - referred;
    const sess = SESSIONS.filter(x => x.level === l);
    return { level: l, studied: st.length, done, referred, away, sessions: sess, latest: sess.at(-1), prev: sess.at(-2) };
  });
  const finishedAny = S.filter(s => s.summary.some(m => m.overall === "Completed")).length;
  const finishedCourse = S.filter(s => s.summary.some(m => m.level === "Advisory" && m.overall === "Completed")).length;
  const working = S.filter(s => { const m = s.summary.at(-1); return m && m.overall !== "Completed"; }).length;
  const latestOverall = s => s.summary.at(-1)?.overall || "";
  const referredNow = S.filter(s => /referred/i.test(latestOverall(s))).length;
  const absentNow = S.filter(s => /^(absent|fail)$/i.test(latestOverall(s))).length;
  const regOnly = S.filter(s => s.registeredOnly).length;
  let renewOverdue = 0, renewAmt = 0;
  if (typeof studentRenewal === "function" && DB.renewals?.length) for (const s of S) { const r = studentRenewal(s); if (r.state === "overdue") { renewOverdue++; renewAmt += r.amount; } }
  const subjects = SUBJ.map(x => ({ ...x, n: x.pass + x.fail, rate: pc(x.pass, x.pass + x.fail) })).filter(x => x.n >= 15);
  return { total: S.length, sat: sat.length, regOnly, finishedAny, finishedCourse, working, levels, referredNow, absentNow, renewOverdue, renewAmt, subjects, latest: SESSIONS.at(-1) };
}

function goStudents(level, state) { fLevel = level || "All"; fState = state || "Any"; $("#q") && ($("#q").value = ""); tab("search"); }

renderDash = function () {
  const D = insightsData();
  if (!insLevel || !D.levels.find(l => l.level === insLevel)?.latest) insLevel = D.latest?.level || "Analyst 1";
  const L = D.levels.find(l => l.level === insLevel), ex = L.latest;
  const hard = D.subjects.slice().sort((a, b) => a.rate - b.rate).slice(0, 4);
  const easy = D.subjects.slice().sort((a, b) => b.rate - a.rate).slice(0, 4);
  const trend = ex && L.prev ? pc(ex.completed, ex.total) - pc(L.prev.completed, L.prev.total) : null;
  const icon = p => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const todo = [
    D.referredNow && { ic: "var(--orange)", p: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>', t: `<b>${plural(D.referredNow, "student")}</b> were referred in their latest exam`, s: "They passed some subjects and still need to pass the rest.", go: () => goStudents("All", "Referred") },
    D.absentNow && { ic: "var(--red)", p: '<path d="M6 6l12 12M18 6 6 18"/>', t: `<b>${plural(D.absentNow, "student")}</b> were absent or failed their latest exam`, s: "Worth a follow-up call before the next exam.", go: () => goStudents("All", "Absent") },
    D.renewOverdue && { ic: "var(--purple)", p: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>', t: `<b>${plural(D.renewOverdue, "student")}</b> have an overdue student renewal`, s: `${rs(D.renewAmt)} in renewal fees to collect.`, go: () => goStudents("All", "Renewal") },
    D.regOnly && { ic: "var(--blue)", p: '<path d="M12 5v14M5 12h14"/>', t: `<b>${plural(D.regOnly, "student")}</b> registered but haven't sat an exam yet`, s: "New registrations from the course registration lists.", go: () => goStudents("All", "NoResults") },
  ].filter(Boolean);

  $("#v-dash").innerHTML = `
    <h1>Insights</h1>
    <p class="sub">A simple picture of how students are doing. Tap any number to see the students behind it.</p>

    <!-- 1. at a glance -->
    <div class="ins-glance">
      <button class="card ig" data-go="all"><span class="ig-ic" style="background:var(--blue)">${icon('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>')}</span>
        <b data-v="${D.total}">0</b><span class="ig-l">students on record</span><small>${D.sat.toLocaleString()} have sat an exam${D.regOnly ? ` · ${D.regOnly.toLocaleString()} not yet` : ""}</small></button>
      <button class="card ig" data-go="done"><span class="ig-ic" style="background:var(--green)">${icon('<path d="m5 12 5 5 9-10"/>')}</span>
        <b data-v="${D.finishedAny}">0</b><span class="ig-l">have finished a level</span><small>${D.finishedCourse} finished the whole course (Advisory)</small></button>
      <button class="card ig" data-go="working"><span class="ig-ic" style="background:var(--orange)">${icon('<path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/>')}</span>
        <b data-v="${D.working}">0</b><span class="ig-l">are still working on a level</span><small>they have subjects left to pass</small></button>
      <button class="card ig" data-go="latest"><span class="ig-ic" style="background:var(--purple)">${icon('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>')}</span>
        <b>${D.latest ? pc(D.latest.completed, D.latest.total) + "%" : "—"}</b><span class="ig-l">completed the latest exam</span><small>${D.latest ? esc(LVL_NAME[D.latest.level] + " · " + fmtMonth(D.latest.date)) : ""}</small></button>
    </div>

    <!-- 2. where are students in the course -->
    <div class="h2row"><h2>Where students are in the course</h2></div>
    <div class="ins-path">${D.levels.map((l, i) => `
      ${i ? `<span class="ip-arrow" aria-hidden="true">›</span>` : ""}
      <button class="card ip" data-level="${l.level}" style="--i:${i}">
        <span class="ip-step">${i + 1}</span><b class="ip-name">${LVL_NAME[l.level]}</b>
        <div class="ip-big"><b>${pc(l.done, l.studied)}%</b><span>finished</span></div>
        <div class="ip-bar"><i style="width:${pc(l.done, l.studied)}%;background:var(--green)"></i><i style="width:${pc(l.referred, l.studied)}%;background:var(--orange)"></i><i style="width:${pc(l.away, l.studied)}%;background:var(--gray)"></i></div>
        <div class="ip-rows"><span><i style="background:var(--green)"></i>${l.done} finished</span><span><i style="background:var(--orange)"></i>${l.referred} still passing subjects</span><span><i style="background:var(--gray)"></i>${l.away} absent / failed</span></div>
        <small>${plural(l.studied, "student")} studied this level</small>
      </button>`).join("")}</div>

    <!-- 3. latest exam -->
    <div class="h2row"><h2>How the latest exam went</h2></div>
    <div class="seg" id="insSeg">${D.levels.filter(l => l.latest).map(l => `<button class="${l.level === insLevel ? "on" : ""}" data-l="${l.level}">${LVL_NAME[l.level]}</button>`).join("")}</div>
    ${ex ? `<div class="card ins-exam">
      <div class="ie-head"><div><div class="kicker">${esc(LVL_NAME[ex.level])} · ${esc(fmtMonth(ex.date))}</div><h3>${esc(ex.session)}</h3></div>
        ${trend != null ? `<span class="ie-trend ${trend >= 0 ? "up" : "down"}">${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend)} pts vs previous</span>` : ""}</div>
      <p class="ie-sentence"><b>${ex.completed} of ${ex.total}</b> candidates (${pc(ex.completed, ex.total)}%) passed every subject and completed the level.
        ${ex.referred ? `<b>${ex.referred}</b> passed some subjects and must resit the rest.` : ""} ${ex.other ? `<b>${ex.other}</b> were absent or failed.` : ""}</p>
      <div class="ie-bar">
        ${[["completed", "Completed", "var(--green)"], ["referred", "Referred", "var(--orange)"], ["other", "Absent / failed", "var(--gray)"]].map(([k, t, c]) => ex[k] ? `<div style="flex:${ex[k]};background:${c}" title="${t}: ${ex[k]}"><span>${pc(ex[k], ex.total) >= 10 ? `${t} ${pc(ex[k], ex.total)}%` : ""}</span></div>` : "").join("")}
      </div>
      ${trend != null ? `<p class="ie-note">${trend > 0 ? "Better" : trend < 0 ? "Lower" : "The same"} than the previous ${LVL_NAME[ex.level]} exam (${esc(fmtMonth(L.prev.date))}: ${pc(L.prev.completed, L.prev.total)}% completed).</p>` : ""}
      ${L.sessions.length > 1 ? `<div class="ie-hist"><small class="k">Completion rate, every ${LVL_NAME[ex.level]} exam</small><div class="ie-cols">${L.sessions.map(x => `<button class="ie-col" data-sess="${esc(x.session)}" title="${esc(x.session)}"><span class="ie-v">${pc(x.completed, x.total)}%</span><i style="height:${Math.max(4, Math.round(85 * pc(x.completed, x.total) / Math.max(1, ...L.sessions.map(y => pc(y.completed, y.total)))))}%"></i><span class="ie-d">${esc(fmtMonth(x.date))}</span></button>`).join("")}</div></div>` : ""}
      <div class="ie-acts"><button class="btn small" data-sess="${esc(ex.session)}">See all ${ex.total} candidates</button><button class="btn small" id="insRef">Who still has subjects to pass</button></div>
    </div>` : `<div class="card empty">No exam results yet.</div>`}

    <!-- 4. subjects -->
    <div class="h2row"><h2>Subjects</h2><span class="muted">pass rate across all exams</span></div>
    <div class="ins-subj">
      <div class="card"><div class="sec-h"><h2 style="font-size:16px">Hardest to pass</h2></div>${hard.map((x, i) => subjRow(x, i)).join("")}</div>
      <div class="card"><div class="sec-h"><h2 style="font-size:16px">Easiest to pass</h2></div>${easy.map((x, i) => subjRow(x, i)).join("")}</div>
    </div>

    <!-- 5. needs attention -->
    ${todo.length ? `<div class="h2row"><h2>Needs attention</h2></div>
    <div class="card list ins-todo">${todo.map((t, i) => `<div class="row" data-todo="${i}"><span class="ic" style="background:${t.ic};width:34px;height:34px;border-radius:10px">${icon(t.p)}</span><div class="t"><b style="white-space:normal;font-weight:500">${t.t}</b><span style="white-space:normal">${t.s}</span></div><span class="chev">›</span></div>`).join("")}</div>` : ""}

    <!-- 6. every exam -->
    <details class="ins-all"><summary><h2>All ${SESSIONS.length} exams</h2><span class="muted">tap to open</span></summary>
      <div class="card list">${SESSIONS.slice().reverse().map(x => `<div class="row" data-sess="${esc(x.session)}"><div class="t"><b>${esc(x.session)}</b><span>${x.total} candidates · ${x.completed} completed · ${x.referred} referred · ${x.other} absent / failed</span>
        <div class="bar"><i style="width:${(100 * x.completed / x.total).toFixed(1)}%;background:var(--green)"></i><i style="width:${(100 * x.referred / x.total).toFixed(1)}%;background:var(--orange)"></i></div></div><div class="pct">${pc(x.completed, x.total)}%</div></div>`).join("")}</div>
    </details>

    <div class="ins-key card"><b>What the words mean</b>
      <span><i style="background:var(--green)"></i><b>Completed / finished</b> — passed every subject of the level.</span>
      <span><i style="background:var(--orange)"></i><b>Referred</b> — passed some subjects; must pass the rest (up to two) at a later exam. <em>Re-referred</em> = referred again.</span>
      <span><i style="background:var(--gray)"></i><b>Absent / failed</b> — didn't sit, or didn't pass enough subjects to be referred.</span>
      <span><i style="background:var(--blue)"></i><b>Pass rate</b> — out of the candidates who actually sat that subject.</span>
    </div>`;

  // numbers count up
  $$("#v-dash .ig b[data-v]").forEach(b => countUp(b, +b.dataset.v));
  // clicks
  $$("#v-dash .ig").forEach(b => b.onclick = () => {
    const g = b.dataset.go;
    if (g === "done") goStudents("All", "Finished");
    else if (g === "working") goStudents("All", "Working");
    else if (g === "latest" && D.latest) openSession(D.latest.session);
    else goStudents("All", "Any");
  });
  $$("#v-dash .ip").forEach(b => b.onclick = () => goStudents(b.dataset.level, "Any"));
  $("#insSeg").onclick = e => { const b = e.target.closest("[data-l]"); if (b) { insLevel = b.dataset.l; renderDash(); requestAnimationFrame(() => $("#insSeg").scrollIntoView({ block: "start", behavior: "instant" })); scrollBy(0, -80); } };
  $$("#v-dash [data-sess]").forEach(b => b.onclick = () => openSession(b.dataset.sess));
  if ($("#insRef")) $("#insRef").onclick = () => goStudents(insLevel, "Referred");
  $$("#v-dash [data-todo]").forEach(r => r.onclick = () => todo[+r.dataset.todo].go());
  $$("#v-dash .srow").forEach(r => r.onclick = () => goStudents(r.dataset.level, "Any"));
  fx($("#v-dash"), ".ins-all .row, .ins-todo .row, .srow");
};
function subjRow(x, i) {
  const c = x.rate >= 70 ? "var(--green)" : x.rate >= 50 ? "var(--orange)" : "var(--red)";
  return `<div class="srow" data-level="${esc(x.level)}"><div class="t"><b>${esc(x.subject)}</b><span>${esc(LVL_NAME[x.level])} · ${x.pass} of ${x.n} passed</span>
    <div class="bar"><i style="width:${x.rate}%;background:${c}"></i></div></div><div class="pct" style="color:${c}">${x.rate}%</div></div>`;
}

/* the "finished a level" / "still working" cards open exactly those students */
const INS_STATES = {
  Finished: ["Finished a level", s => s.summary.some(m => m.overall === "Completed")],
  Working: ["Still working on a level", s => { const m = s.summary.at(-1); return !!m && m.overall !== "Completed"; }],
};
const _filteredI = filtered;
filtered = function () {
  if (!INS_STATES[fState]) return _filteredI();
  const keep = fState; fState = "Any"; const list = _filteredI(); fState = keep;
  return list.filter(INS_STATES[keep][1]);
};
const _renderFiltersI = renderFilters;
renderFilters = function () {
  _renderFiltersI();
  if (INS_STATES[fState]) $("#filters").insertAdjacentHTML("afterbegin", `<button data-s="${fState}" class="on">${INS_STATES[fState][0]} ✕</button>`);
};
