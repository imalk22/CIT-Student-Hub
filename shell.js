/* CIT Student Hub — app shell: desktop glass sidebar, theme switch, shared sparkline helper */
"use strict";

function syncNav() {
  const t = currentTab === "search" ? "home" : currentTab;
  $$("#sidebar .sb-nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  const dark = (document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";
  $("#sbTheme")?.classList.toggle("on", dark);
  if (DB) {
    const ms = typeof MEMBERS === "function" ? MEMBERS().length : 0;
    $("#sbMeta").innerHTML = `${DB.students.length.toLocaleString()} students · ${ms.toLocaleString()} members<br>${SESSIONS.length} exam sessions${DB.registrations?.length ? ` · ${DB.registrations.length.toLocaleString()} registrations` : ""}`;
  }
}
$$("#sidebar .sb-nav button").forEach(b => b.onclick = () => tab(b.dataset.tab));
$("#sbTheme").onclick = () => { $("#themeBtn").click(); syncNav(); };
for (const fn of ["tab", "openProfile", "openMember"]) {
  const orig = window[fn];
  window[fn] = function (...a) { const r = orig.apply(this, a); syncNav(); return r; };
}
// rebind the bottom bar to the final tab()
$$(".tabbar button").forEach(b => b.onclick = () => tab(b.dataset.tab));
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", syncNav);
(async () => { while (!DB) await new Promise(r => setTimeout(r, 50)); syncNav(); })();

/* sparkline: area + line that draws itself (ExamLens style) */
function spark(values, colorVar = "var(--blue)", h = 40) {
  const v = values.map(x => +x || 0); if (v.length < 2) return "";
  const W = 200, max = Math.max(...v), min = Math.min(...v), span = max - min || 1;
  const pts = v.map((x, i) => [i * W / (v.length - 1), h - 4 - (x - min) / span * (h - 10)]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const id = "sg" + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colorVar}" stop-opacity=".35"/><stop offset="1" stop-color="${colorVar}" stop-opacity="0"/></linearGradient></defs>
    <path class="sa" d="${line} L${W} ${h} L0 ${h} Z" fill="url(#${id})"/><path class="sl" d="${line}" stroke="${colorVar}" pathLength="1"/></svg>`;
}

/* ---------- profile header stat rings ---------- */
function ringStat(pct, color, value, label) {
  const r = 25, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="pst"><svg viewBox="0 0 62 62"><circle class="rtrack" cx="31" cy="31" r="${r}" stroke="${color}" stroke-width="6"/>
    <circle class="ring" cx="31" cy="31" r="${r}" stroke="${color}" stroke-width="6" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="--c:${c.toFixed(1)}"/></svg>
    <b>${value}</b><small>${label}</small></div>`;
}
const _renderProfileS = renderProfile;
renderProfile = function (s) {
  _renderProfileS(s);
  const main = $("#v-profile .pass-main"); if (!main) return;
  const m = currentLevel(s), subs = m ? (LEVEL_SUBJECTS[m.level] || []).length : 0;
  const done = m ? (m.overall === "Completed" ? subs : m.done.length) : 0;
  const lvDone = s.summary.filter(x => x.overall === "Completed").length;
  main.insertAdjacentHTML("beforeend", `<div class="pass-stats">
    ${ringStat(subs ? 100 * done / subs : 0, "var(--green)", subs ? `${done}/${subs}` : "—", m ? `${LVL_NAME[m.level] || m.level} subjects` : "No level yet")}
    ${ringStat(25 * lvDone, "var(--blue)", `${lvDone}/4`, "Levels finished")}
    ${ringStat(Math.min(100, 20 * s.sittings.length), "var(--purple)", String(s.sittings.length), s.sittings.length === 1 ? "Exam sat" : "Exams sat")}
  </div>`);
};
const _renderMemberProfileS = renderMemberProfile;
renderMemberProfile = function (m) {
  _renderMemberProfileS(m);
  const main = $("#v-mprof .pass-main"); if (!main) return;
  const a = acct(m), charged = m.years.filter(y => y.state !== "none" && y.state !== "waived");
  const paidYears = charged.filter(y => y.state === "paid").length;
  const totalFee = charged.reduce((s, y) => s + (y.fee || 0), 0), paidAmt = charged.reduce((s, y) => s + (y.paid || 0), 0);
  const active = m.years.filter(y => y.state !== "none").length;
  main.insertAdjacentHTML("beforeend", `<div class="pass-stats">
    ${ringStat(charged.length ? 100 * paidYears / charged.length : 100, "var(--green)", charged.length ? `${paidYears}/${charged.length}` : "—", "Years paid")}
    ${ringStat(totalFee ? 100 * paidAmt / totalFee : 100, "var(--blue)", totalFee ? Math.round(100 * paidAmt / totalFee) + "%" : "—", "Fees paid")}
    ${ringStat(Math.min(100, 10 * active), "var(--orange)", String(active), "Years as member")}
  </div>`);
};
