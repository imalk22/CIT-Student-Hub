/* CIT Student Hub — admission details check (no DOM; testable in Node).
 * After an admission Excel is imported, every candidate is checked against the sheet itself and against the
 * student's profile. "error" issues stop the card from being approved; "warn" issues are shown to the supervisor.
 *
 * candidateIssues(exam, candidate, ctx) → [{ level: "error"|"warn", code, text }]
 *   exam: { level, subjects: [{ id, name, match }], candidates: [...] }
 *   candidate: { name, index, sid, sheetSid, email, phone, nic, status: { [subjectId]: "X"|"Exempted"|"" }, prev }
 *   ctx: { student (linked profile or null), renewal (studentRenewal result), finance ({ due, count } or null) }
 */
(function (root) {
  "use strict";
  const T = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const norm = s => T(s).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const isEmail = s => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(T(s));
  const digits = s => String(s ?? "").replace(/\D+/g, "");
  const LEVEL_OF_CODE = { AP: "Application", AN1: "Analyst 1", AL1: "Analyst 1", A1: "Analyst 1", AN2: "Analyst 2", AL2: "Analyst 2", AD: "Advisory" };
  const indexLevel = idx => { const m = T(idx).toUpperCase().match(/\/(AP|AN1|AN2|AL1|AL2|AD|A1)\//); return m ? LEVEL_OF_CODE[m[1]] : ""; };
  const prefixOf = idx => T(idx).replace(/[^/]+$/, "").toUpperCase();
  const nicOk = s => { const t = T(s).toUpperCase().replace(/\s+/g, ""); return /^\d{9}[VX]$/.test(t) || /^\d{12}$/.test(t); };
  const nicKey = s => T(s).toUpperCase().replace(/\s+/g, "");
  const phoneOk = s => { const d = digits(s); return d.length === 10 && d[0] === "0" || d.length === 11 && d.startsWith("94") || d.length === 9 && d[0] !== "0"; };
  const phoneKey = s => { const d = digits(s); return d.length >= 9 ? d.slice(-9) : d; };
  // token overlap: "Wickramage Deepika Sepali Samarawickrama" vs "W.D.S. Samarawickrama" → same person
  function nameSimilar(a, b) {
    const A = norm(a).split(" ").filter(t => t.length > 2), B = norm(b).split(" ").filter(t => t.length > 2);
    if (!A.length || !B.length) return true;
    const common = A.filter(t => B.includes(t)).length;
    return common / Math.min(A.length, B.length) >= 0.5;
  }
  const an = w => /^[aeiou]/i.test(w) ? "an" : "a";
  const rsx = n => "Rs " + Math.round(n || 0).toLocaleString("en-LK");

  function candidateIssues(e, c, ctx = {}) {
    const out = [], add = (level, code, text) => out.push({ level, code, text });
    const st = ctx.student || null, prev = c.prev || null;
    const others = e.candidates.filter(o => o !== c);

    // --- the sheet itself ---
    if (!T(c.name)) add("error", "noName", "Name is missing");
    if (!isEmail(c.email)) add("error", "badEmail", c.email ? `Email “${c.email}” looks wrong` : "No email address");
    if (!T(c.index)) add("error", "noIndex", "No index number");
    else if (others.some(o => T(o.index) === T(c.index))) add("error", "dupIndex", `Index ${c.index} is used twice`);
    if (!e.subjects.some(s => c.status?.[s.id] === "X")) add("error", "noPaper", "No subject marked × (applied)");
    if (c.dupRows > 1) add("error", "dupRow", `Appears ${c.dupRows} times in the Excel — the last row was kept, replacing ${c.dupReplaced?.join("; ") || "the earlier row"}`);
    if (c.sid && others.some(o => o.sid && T(o.sid).toLowerCase() === T(c.sid).toLowerCase())) add("error", "dupSid", `Student no ${c.sid} appears more than once`);
    const lv = indexLevel(c.index);
    if (lv && e.level && lv !== e.level) add("error", "level", `Index ${c.index} is ${an(lv)} ${lv} number, but this is ${an(e.level)} ${e.level} exam`);
    if (c.index) {
      const counts = {}; for (const o of e.candidates) if (o.index) { const p = prefixOf(o.index); counts[p] = (counts[p] || 0) + 1; }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 1 && prefixOf(c.index) !== top[0]) add("warn", "prefix", `Index prefix ${prefixOf(c.index)} differs from the others (${top[0]})`);
    }
    if (c.nic && !nicOk(c.nic)) add("warn", "nicFormat", `NIC "${c.nic}" doesn't look like a Sri Lankan NIC`);
    if (c.phone && !phoneOk(c.phone)) add("warn", "phoneFormat", `Phone "${c.phone}" doesn't look right`);
    if (c.email && isEmail(c.email) && others.some(o => T(o.email).toLowerCase() === T(c.email).toLowerCase())) add("warn", "dupEmail", `Email ${c.email} is used by another candidate`);

    // --- against the profile ---
    if (!st) {
      add("warn", "noProfile", c.sheetSid || c.sid ? `Student no ${c.sheetSid || c.sid} not found in the student records` : "Not matched to a student profile");
    } else {
      if (c.sheetSid && T(c.sheetSid).toLowerCase() !== T(st.id).toLowerCase()) add("warn", "sidDiff", `Sheet says student no ${c.sheetSid}, but the index/name matched ${st.id}`);
      const pname = prev?.name || st.name;
      if (c.name && pname && !nameSimilar(c.name, pname)) add("warn", "name", `Name differs from profile (“${pname}”)`);
      if (prev?.nic && c.nic && nicKey(prev.nic) !== nicKey(c.nic)) add("warn", "nic", `NIC differs from profile (${prev.nic})`);
      if (prev?.email && c.email && T(prev.email).toLowerCase() !== T(c.email).toLowerCase()) add("warn", "email", `Email differs from profile (${prev.email})`);
      if (prev?.phone && c.phone && phoneKey(prev.phone) !== phoneKey(c.phone)) add("warn", "phone", `Phone differs from profile (${prev.phone})`);
      const sum = (st.summary || []).find(m => m.level === e.level);
      if (sum?.overall === "Completed") add("warn", "levelDone", `Already completed ${e.level}`);
      const done = new Set((sum?.done || []).map(norm));
      const passedApplied = e.subjects.filter(s => c.status?.[s.id] === "X" && done.has(norm(s.match || s.name)));
      if (passedApplied.length) add("warn", "passedApplied", `Applied for ${passedApplied.map(s => s.name).join(", ")} — already passed/exempted (should be Exempted)`);
      const exNoRecord = e.subjects.filter(s => c.status?.[s.id] === "Exempted" && !done.has(norm(s.match || s.name)));
      if (exNoRecord.length) add("warn", "exemptNoRecord", `Exempted for ${exNoRecord.map(s => s.name).join(", ")} with no pass/exemption on record`);
      // an earlier level still not completed
      const ORDER = ["Application", "Analyst 1", "Analyst 2", "Advisory"], li = ORDER.indexOf(e.level);
      const below = (st.summary || []).filter(m => ORDER.indexOf(m.level) >= 0 && ORDER.indexOf(m.level) < li && m.overall !== "Completed");
      if (below.length) add("warn", "lowerLevel", `${below.map(m => m.level).join(", ")} not completed yet`);
    }
    // --- money ---
    const r = ctx.renewal;
    if (r && (r.state === "overdue" || r.state === "never") && r.amount > 0) add("warn", "renewal", `Student renewal overdue: ${rsx(r.amount)} (${r.due.join(", ")})`);
    const f = ctx.finance;
    if (f && f.due > 0) add("warn", "xero", `Xero: ${rsx(f.due)} outstanding on ${f.count} invoice${f.count === 1 ? "" : "s"}`);
    return out;
  }

  function examReport(e, ctxFor) {
    const rows = e.candidates.map(c => ({ c, issues: candidateIssues(e, c, ctxFor ? ctxFor(c) : {}) }));
    const errors = rows.filter(r => r.issues.some(i => i.level === "error")).length;
    const warns = rows.filter(r => !r.issues.some(i => i.level === "error") && r.issues.length).length;
    return { rows, errors, warns, clean: rows.length - errors - warns };
  }

  const api = { candidateIssues, examReport, nameSimilar, nicOk, phoneOk, indexLevel };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.AdmCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
