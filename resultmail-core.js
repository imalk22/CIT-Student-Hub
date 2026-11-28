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
    question: "If you have any questions about your results, please reply to this email.",
    signoff: "Best wishes,",
    signName: "Examinations Division",
    signOrg: "Chartered Institute of Taxation of Sri Lanka",
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
    const v = {
      name: row.name, initials: row.initials || row.name, studentNo: row.sid, index: row.index, level: batch.level || "examination", exam: batch.exam || batch.title,
      result: overallLabel(row),
    };
    const subject = fill(P.subject, v), para = fill(P.message, v), question = fill(P.question, v);
    const signoff = fill(P.signoff, v), signName = fill(P.signName, v), signOrg = fill(P.signOrg, v);
    // plain text — same order as the HTML
    const text = [`Dear ${row.name},`, "", para, "", `Student No: ${row.sid || "—"}`, `Index No:   ${row.index || "—"}`, "", "SUBJECT RESULTS",
      ...row.results.map(r => `  ${r.code ? r.code + "  " : ""}${r.name} — ${r.status || "—"}`), "",
      `OVERALL RESULT: ${v.result.toUpperCase()}`, "", question, "", signoff, signName, signOrg].join("\n");

    /* HTML — table layout + inline styles + Arial, so it looks the same in Outlook, Gmail and phones */
    const F = "font-family:Arial,Helvetica,sans-serif;";
    const BLUE = "#0b4aa2", INK = "#1f2937", MUTED = "#6b7280", LINE = "#e5e7eb";
    const tone = s => /^pass$/i.test(s) ? ["#e6f4ea", "#137333"] : /fail/i.test(s) ? ["#fce8e6", "#c5221f"] : /absent|not taken/i.test(s) ? ["#f1f3f4", "#5f6368"] : DONE.test(s) ? ["#e8f0fe", "#1a56b0"] : ["#f1f3f4", "#3c4043"];
    const pill = s => { const [bg, fg] = tone(s); return `<span style="${F}display:inline-block;padding:4px 12px;border-radius:12px;background-color:${bg};color:${fg};font-size:12px;font-weight:bold;white-space:nowrap">${esc(s || "—")}</span>`; };
    const big = { completed: ["#137333", "#e6f4ea"], absent: ["#5f6368", "#f1f3f4"], referred: /fail/i.test(v.result) ? ["#c5221f", "#fce8e6"] : ["#b45309", "#fef3e2"] }[kind];
    const rows = row.results.map((r, i) => `
              <tr>
                <td style="${F}padding:11px 14px;border-bottom:1px solid ${LINE};background-color:${i % 2 ? "#fafbfd" : "#ffffff"}">
                  ${r.code ? `<div style="${F}font-size:11px;letter-spacing:1px;font-weight:bold;color:${BLUE}">${esc(r.code)}</div>` : ""}
                  <div style="${F}font-size:14px;line-height:19px;color:${INK};margin-top:2px">${esc(r.name)}</div></td>
                <td style="${F}padding:11px 14px;border-bottom:1px solid ${LINE};background-color:${i % 2 ? "#fafbfd" : "#ffffff"}" align="right" valign="middle">${pill(r.status)}</td>
              </tr>`).join("");
    const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eef2f7">
  <tr><td align="center" style="padding:20px 8px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid ${LINE};border-radius:12px">

      <!-- header -->
      <tr><td style="background-color:${BLUE};padding:24px 24px 20px">
        <div style="${F}font-size:11px;letter-spacing:2px;color:#c7d7f5;font-weight:bold">CHARTERED INSTITUTE OF TAXATION OF SRI LANKA</div>
        <div style="${F}font-size:24px;line-height:30px;color:#ffffff;font-weight:bold;margin-top:8px">Examination Results</div>
        <div style="${F}font-size:14px;line-height:20px;color:#dbe6fb;margin-top:4px">${esc(batch.exam || batch.title)}</div>
      </td></tr>
      <tr><td style="background-color:#d4a537;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>

      <!-- greeting + message -->
      <tr><td style="padding:24px 24px 6px">
        <div style="${F}font-size:16px;line-height:24px;color:${INK}">Dear <b>${esc(row.name)}</b>,</div>
        <div style="${F}font-size:14px;line-height:22px;color:${INK};margin-top:12px">${esc(para)}</div>
      </td></tr>

      <!-- student no / index no -->
      <tr><td style="padding:16px 24px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="50%" style="background-color:#f5f7fb;border-left:4px solid ${BLUE};padding:11px 12px">
              <div style="${F}font-size:11px;letter-spacing:1px;color:${MUTED};font-weight:bold">STUDENT NO</div>
              <div style="${F}font-size:15px;color:${INK};font-weight:bold;margin-top:4px">${esc(row.sid || "—")}</div></td>
            <td width="12" style="font-size:0">&nbsp;</td>
            <td width="50%" style="background-color:#f5f7fb;border-left:4px solid ${BLUE};padding:11px 12px">
              <div style="${F}font-size:11px;letter-spacing:1px;color:${MUTED};font-weight:bold">INDEX NO</div>
              <div style="${F}font-size:15px;color:${INK};font-weight:bold;margin-top:4px">${esc(row.index || "—")}</div></td>
          </tr>
        </table>
      </td></tr>

      <!-- subject results -->
      <tr><td style="padding:20px 24px 0">
        <div style="${F}font-size:12px;letter-spacing:1.5px;color:${BLUE};font-weight:bold;margin-bottom:10px">SUBJECT RESULTS</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:8px;border-collapse:separate;overflow:hidden">
          <tr>
            <td style="${F}padding:10px 14px;font-size:11px;letter-spacing:1px;color:${MUTED};font-weight:bold;background-color:#f3f6fb;border-bottom:1px solid ${LINE}">SUBJECT</td>
            <td style="${F}padding:10px 14px;font-size:11px;letter-spacing:1px;color:${MUTED};font-weight:bold;background-color:#f3f6fb;border-bottom:1px solid ${LINE}" align="right">RESULT</td>
          </tr>${rows}
        </table>
      </td></tr>

      <!-- overall result (after the subjects) -->
      <tr><td style="padding:18px 24px 4px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background-color:${big[1]};border:2px solid ${big[0]};border-radius:10px;padding:16px">
            <div style="${F}font-size:11px;letter-spacing:2px;color:${big[0]};font-weight:bold">OVERALL RESULT</div>
            <div style="${F}font-size:26px;line-height:32px;color:${big[0]};font-weight:bold;margin-top:4px">${esc(v.result.toUpperCase())}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- questions -->
      <tr><td style="padding:22px 24px 0">
        <div style="${F}font-size:14px;line-height:22px;color:${INK}">${esc(question)}</div>
      </td></tr>

      <!-- sign-off, each on its own line -->
      <tr><td style="padding:20px 24px 26px">
        <div style="${F}font-size:14px;line-height:22px;color:${INK}">${esc(signoff)}</div>
        <div style="${F}font-size:15px;line-height:22px;color:${BLUE};font-weight:bold;margin-top:10px">${esc(signName)}</div>
        <div style="${F}font-size:13px;line-height:20px;color:${MUTED}">${esc(signOrg)}</div>
      </td></tr>

      <!-- footer -->
      <tr><td style="background-color:#f5f7fb;border-top:1px solid ${LINE};padding:14px 24px">
        <div style="${F}font-size:12px;line-height:18px;color:${MUTED}">Chartered Institute of Taxation of Sri Lanka · No. 484, Havelock Road, Colombo 06</div>
        <div style="${F}font-size:11px;line-height:17px;color:#9ca3af;margin-top:4px">This email was sent to ${esc(row.email || "you")} with your personal examination results.</div>
      </td></tr>

    </table>
  </td></tr>
</table>`;
    return { subject, text, html, kind, result: v.result };
  }

  const api = { parseWorkbook, parseSheet, compose, outcome, overallLabel, DEFAULT_TPL, isEmail };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ResultMail = api;
})(typeof window !== "undefined" ? window : globalThis);
