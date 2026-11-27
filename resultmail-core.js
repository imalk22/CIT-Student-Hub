/* CIT Student Hub — exam results → one personal email per student (no DOM; testable in Node).
 * Reads the results Excel the Examinations Division produces (e.g. the "Summary" sheet: Name in full, Student No,
 * E mail Address, Index Number, then Marks/Status per subject, Final Total Marks, Average, Overall Result)
 * and writes a friendly email for each student with their own results. */
(function (root) {
  "use strict";
  const T = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const low = v => T(v).toLowerCase();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const isEmail = s => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(T(s));

  /* ---------- reading the Excel ---------- */
  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const h = rows[i].map(low);
      if (h.some(c => /name/.test(c)) && h.some(c => /index/.test(c))) return i;
    }
    return -1;
  }
  function parseSheet(rows, sheetName) {
    const hi = findHeader(rows); if (hi < 0) return null;
    const H = rows[hi].map(T), H1 = (rows[hi + 1] || []).map(T), H2 = (rows[hi + 2] || []).map(T);
    const col = (re, not) => H.findIndex(h => re.test(h) && !(not && not.test(h)));
    const C = {
      name: (() => { let i = col(/name in full|full name/i); if (i < 0) i = col(/name/i, /initial/i); return i; })(),
      initials: col(/initial/i), sid: col(/student\s*no|student\s*number|reg/i, /name/i), nic: col(/\bnic\b/i),
      email: col(/e\s*-?\s*mail/i), phone: col(/contact|mobile|phone/i, /whats/i), index: col(/index/i),
      total: col(/total/i), average: col(/average/i), overall: col(/overall/i),
    };
    // subjects: a "Marks" / "Status" pair two rows under the header, subject code on the header row, name under it
    const subjects = [];
    const end = [C.total, C.average, C.overall].filter(i => i >= 0).sort((a, b) => a - b)[0] ?? H.length;
    for (let c = Math.max(C.index, C.email, C.sid) + 1; c < end; c++) {
      if (/marks/i.test(H2[c]) && /status/i.test(H2[c + 1] || "")) subjects.push({ code: H[c] || H1[c], name: H1[c] || H[c], m: c, s: c + 1 });
    }
    if (!subjects.length || C.name < 0) return null;
    const title = rows.slice(0, hi).map(r => r.map(T).filter(Boolean).join(" ")).filter(Boolean).find(t => /result|exam/i.test(t)) || T(sheetName);
    const out = [];
    for (const r of rows.slice(hi + 3)) {
      const name = T(r[C.name]); if (!name || /^(total|average)/i.test(name)) continue;
      // summary tables under the list ("SUBJECT-WISE SUMMARY", "Pass", "Fail"…) have no student / index number
      if ((C.sid < 0 || !T(r[C.sid])) && (C.index < 0 || !T(r[C.index]))) continue;
      const results = subjects.map(s => {
        const mv = r[s.m]; const marks = typeof mv === "number" ? mv : /^\d+(\.\d+)?$/.test(T(mv)) ? +T(mv) : null;
        let status = T(r[s.s]) || (marks != null ? "" : "—");
        if (/^ab$/i.test(status)) status = "Absent"; else if (/^skip(ped)?$/i.test(status)) status = "Not taken";
        return { code: s.code, name: s.name, marks, status };
      });
      const num = v => typeof v === "number" ? v : /^\d+(\.\d+)?$/.test(T(v)) ? +T(v) : null;
      out.push({
        n: out.length + 1, name, initials: C.initials >= 0 ? T(r[C.initials]) : "", sid: C.sid >= 0 ? T(r[C.sid]).toUpperCase() : "",
        nic: C.nic >= 0 ? T(r[C.nic]) : "", email: C.email >= 0 ? T(r[C.email]).replace(/\s+/g, "").replace(/[;,]+$/, "") : "",
        index: C.index >= 0 ? T(r[C.index]) : "", total: C.total >= 0 ? num(r[C.total]) : null, average: C.average >= 0 ? num(r[C.average]) : null,
        overall: C.overall >= 0 ? T(r[C.overall]) : "", results,
      });
    }
    return { title, sheet: sheetName, subjects: subjects.map(({ code, name }) => ({ code, name })), rows: out, hasEmail: C.email >= 0 };
  }
  const LEVELS = [[/application/i, "Application"], [/analyst\s*(level)?\s*(1|i)\b|\ban1\b/i, "Analyst Level 1"], [/analyst\s*(level)?\s*(2|ii)\b|\ban2\b/i, "Analyst Level 2"], [/advisory|\bad\b/i, "Advisory Level"]];
  function parseWorkbook(XLSX, wb, file) {
    let best = null;
    for (const n of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true, blankrows: false });
      const p = parseSheet(rows, n); if (!p) continue;
      // prefer the sheet that has email addresses, then the one with the most students
      if (!best || (p.hasEmail && !best.hasEmail) || (p.hasEmail === best.hasEmail && p.rows.length > best.rows.length)) best = p;
    }
    if (!best) throw new Error("Couldn't find a results table (Name, Index Number and Marks/Status columns) in this Excel");
    const probe = best.title + " " + file + " " + (best.rows[0]?.index || "");
    best.level = (LEVELS.find(([re]) => re.test(probe)) || [null, ""])[1];
    best.exam = best.title.replace(/\s*exam(ination)?\s*results?\s*$/i, "").trim() || best.title;
    best.file = file;
    return best;
  }

  /* ---------- the email ---------- */
  const DEFAULT_TPL = {
    subject: "Your results – {exam}",
    message: "Please find your results for the {exam} examination below.",
    closing: "If you have any questions about your results, please reply to this email.\n\nBest wishes,\nExaminations Division\nChartered Institute of Taxation of Sri Lanka",
  };
  const DONE = /^(pass|exempted|exempted \(ta\)|previously completed|completed)$/i;
  function outcome(row) {
    const o = low(row.overall);
    if (/complet/.test(o)) return "completed";
    if (/absent/.test(o) || (!o && row.results.length && !row.results.some(r => /pass|fail/i.test(r.status)))) return "absent";
    return "referred";
  }
  const listWords = xs => xs.length <= 1 ? (xs[0] || "") : xs.slice(0, -1).join(", ") + " and " + xs.at(-1);
  // the sheet's own word (Completed / Referred / Re-referred / Fail / Absent), in normal capitals
  const overallLabel = row => { const o = T(row.overall); if (o) return o.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/-Referred/, "-referred"); return { completed: "Completed", absent: "Absent", referred: "Referred" }[outcome(row)]; };
  function fill(t, v) { return String(t || "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)); }

  function compose(batch, row, tpl = {}) {
    const P = { ...DEFAULT_TPL, ...tpl }, kind = outcome(row);
    const passed = row.results.filter(r => /^pass$/i.test(r.status)), toSit = row.results.filter(r => /fail|absent|not taken/i.test(r.status));
    const subj = r => `${r.name}${r.code ? ` (${r.code})` : ""}`;
    const v = {
      name: row.name, initials: row.initials || row.name, studentNo: row.sid, index: row.index, level: batch.level || "examination", exam: batch.exam || batch.title,
      result: overallLabel(row), passed: listWords(passed.map(subj)), toSit: listWords(toSit.map(subj)) || "the remaining subjects",
      passedLine: passed.length ? ` Well done on passing ${listWords(passed.map(subj))}.` : "",
    };
    const subject = fill(P.subject, v), para = fill(P.message, v), closing = fill(P.closing, v);   // results only — one message for everyone
    const mk = m => m == null ? "–" : (Math.round(m * 100) / 100).toString();
    const avg = row.average != null ? (Math.round(row.average * 100) / 100).toFixed(2) : "";
    // plain text
    const text = [`Dear ${row.name},`, "", para, "", `${batch.title}`, `Student No: ${row.sid || "—"}    Index No: ${row.index || "—"}`, "",
      ...row.results.map(r => `• ${r.code ? r.code + " " : ""}${r.name}: ${r.marks != null ? mk(r.marks) + " – " : ""}${r.status || "—"}`),
      ...(row.total != null ? ["", `Total marks: ${mk(row.total)}${avg ? `    Average: ${avg}` : ""}`] : []),
      `Overall result: ${v.result}`, "", closing].join("\n");
    // HTML (inline styles so it looks right in Outlook and Gmail)
    const pill = s => {
      const k = /^pass$/i.test(s) ? ["#e7f6ec", "#1b7f3b"] : /fail/i.test(s) ? ["#fde8e7", "#c62828"] : /absent|not taken/i.test(s) ? ["#eeeeef", "#5f6368"] : DONE.test(s) ? ["#e8f0fe", "#1a56b0"] : ["#f1f1f3", "#444"];
      return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${k[0]};color:${k[1]};font-weight:600;font-size:12px;white-space:nowrap">${esc(s || "—")}</span>`;
    };
    const band = { completed: ["#1b7f3b", "#e7f6ec", v.result], referred: [/fail/i.test(v.result) ? "#c62828" : "#b25e00", /fail/i.test(v.result) ? "#fde8e7" : "#fff4e5", v.result], absent: ["#5f6368", "#f1f1f3", "Absent"] }[kind];
    const html = `<div style="font-family:Segoe UI,Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1c1c1e;max-width:640px">
  <div style="background:#0b4aa2;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
    <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.85">Chartered Institute of Taxation of Sri Lanka</div>
    <div style="font-size:18px;font-weight:700;margin-top:4px">${esc(batch.title)}</div>
  </div>
  <div style="border:1px solid #e3e5ea;border-top:0;border-radius:0 0 10px 10px;padding:20px">
    <p style="margin:0 0 12px">Dear ${esc(row.name)},</p>
    <div style="background:${band[1]};color:${band[0]};border-radius:8px;padding:10px 14px;font-weight:700;margin:0 0 12px">Overall result: ${esc(band[2])}</div>
    <p style="margin:0 0 16px">${esc(para)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13.5px;margin:0 0 6px">
      <tr><td style="color:#6b6f76;padding:2px 0">Student No</td><td style="padding:2px 0"><b>${esc(row.sid || "—")}</b></td><td style="color:#6b6f76;padding:2px 0">Index No</td><td style="padding:2px 0"><b>${esc(row.index || "—")}</b></td></tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:13.5px;margin:10px 0 14px">
      <tr style="background:#f4f6fa"><th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e3e5ea">Subject</th><th style="text-align:right;padding:8px 10px;border-bottom:1px solid #e3e5ea">Marks</th><th style="text-align:left;padding:8px 10px;border-bottom:1px solid #e3e5ea">Result</th></tr>
      ${row.results.map(r => `<tr><td style="padding:8px 10px;border-bottom:1px solid #eef0f3">${r.code ? `<b>${esc(r.code)}</b> · ` : ""}${esc(r.name)}</td><td style="padding:8px 10px;border-bottom:1px solid #eef0f3;text-align:right">${esc(mk(r.marks))}</td><td style="padding:8px 10px;border-bottom:1px solid #eef0f3">${pill(r.status)}</td></tr>`).join("")}
      ${row.total != null ? `<tr><td style="padding:8px 10px"><b>Total marks</b>${avg ? ` <span style="color:#6b6f76">· average ${esc(avg)}</span>` : ""}</td><td style="padding:8px 10px;text-align:right"><b>${esc(mk(row.total))}</b></td><td></td></tr>` : ""}
    </table>
    <p style="margin:0;white-space:pre-line">${esc(closing)}</p>
  </div>
</div>`;
    return { subject, text, html, kind, result: v.result };
  }

  const api = { parseWorkbook, parseSheet, compose, outcome, overallLabel, DEFAULT_TPL, isEmail };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ResultMail = api;
})(typeof window !== "undefined" ? window : globalThis);
