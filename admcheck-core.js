/* CIT Student Hub — admission details check (no DOM; testable in Node).
 * Checks ONLY what is in the admission Excel — nothing is compared with other records.
 * "error" = must be fixed before the card can be approved; "warn" = worth a second look.
 * Each issue names the column it's about, so the screen can highlight that cell.
 *
 * candidateIssues(exam, candidate) → [{ level: "error"|"warn", code, field, text }]
 *   exam: { level, subjects: [{ id, name }], candidates: [...] }
 *   candidate: { name, index, sid, email, phone, nic, status: { [subjectId]: "X"|"Exempted"|"" }, dupRows }
 */
(function (root) {
  "use strict";
  const T = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const isEmail = s => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(T(s));
  const digits = s => String(s ?? "").replace(/\D+/g, "");
  const LEVEL_OF_CODE = { AP: "Application", AN1: "Analyst 1", AL1: "Analyst 1", A1: "Analyst 1", AN2: "Analyst 2", AL2: "Analyst 2", AD: "Advisory" };
  const indexLevel = idx => { const m = T(idx).toUpperCase().match(/\/(AP|AN1|AN2|AL1|AL2|AD|A1)\//); return m ? LEVEL_OF_CODE[m[1]] : ""; };
  const prefixOf = idx => T(idx).replace(/[^/]+$/, "").toUpperCase();
  const nicOk = s => { const t = T(s).toUpperCase().replace(/\s+/g, ""); return /^\d{9}[VX]$/.test(t) || /^\d{12}$/.test(t); };
  const phoneOk = s => { const d = digits(s); return d.length === 10 && d[0] === "0" || d.length === 11 && d.startsWith("94") || d.length === 9 && d[0] !== "0"; };
  const same = (a, b) => T(a).toLowerCase() === T(b).toLowerCase();

  function candidateIssues(e, c) {
    const out = [], add = (level, code, field, text) => out.push({ level, code, field, text });
    const others = e.candidates.filter(o => o !== c);

    // must fix
    if (!T(c.name)) add("error", "noName", "name", "Name is empty");
    if (!T(c.email)) add("error", "badEmail", "email", "Email is empty");
    else if (!isEmail(c.email)) add("error", "badEmail", "email", "Email is not written correctly");
    if (!T(c.index)) add("error", "noIndex", "index", "Index number is empty");
    else if (others.some(o => same(o.index, c.index))) add("error", "dupIndex", "index", "Same index number as another student");
    const lv = indexLevel(c.index);
    if (lv && e.level && lv !== e.level) add("error", "level", "index", `Index number is for ${lv}, but this exam is ${e.level}`);
    if (c.dupRows > 1) add("error", "dupRow", "name", `This student is in the Excel ${c.dupRows} times — only the last row was kept`);
    if (T(c.sid) && others.some(o => same(o.sid, c.sid))) add("error", "dupSid", "sid", "Same student number as another student");
    if (!e.subjects.some(s => c.status?.[s.id] === "X")) add("error", "noPaper", "papers", "No subject marked ×");

    // worth a second look
    if (!T(c.sid)) add("warn", "noSid", "sid", "Student number is empty");
    if (T(c.nic) && !nicOk(c.nic)) add("warn", "nicFormat", "nic", "NIC doesn't look right");
    if (T(c.phone) && !phoneOk(c.phone)) add("warn", "phoneFormat", "phone", "Phone number doesn't look right");
    if (isEmail(c.email) && others.some(o => same(o.email, c.email))) add("warn", "dupEmail", "email", "Same email as another student");
    if (T(c.index)) {
      const counts = {}; for (const o of e.candidates) if (T(o.index)) { const p = prefixOf(o.index); counts[p] = (counts[p] || 0) + 1; }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 1 && prefixOf(c.index) !== top[0] && !out.some(i => i.code === "level")) add("warn", "prefix", "index", `Index number starts differently from the others (${top[0]}…)`);
    }
    return out;
  }

  function examReport(e) {
    const rows = e.candidates.map(c => ({ c, issues: candidateIssues(e, c) }));
    const errors = rows.filter(r => r.issues.some(i => i.level === "error")).length;
    const warns = rows.filter(r => !r.issues.some(i => i.level === "error") && r.issues.length).length;
    return { rows, errors, warns, clean: rows.length - errors - warns };
  }

  const api = { candidateIssues, examReport, nicOk, phoneOk, indexLevel };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.AdmCheck = api;
})(typeof window !== "undefined" ? window : globalThis);
