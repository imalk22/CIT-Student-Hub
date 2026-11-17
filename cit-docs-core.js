/* CIT Student Hub — readers for the CIT document set (no DOM; testable in Node).
 * Recognises: Course Registration Masters, Student Renewal payments (with/without "Renewed Upto"),
 * Members' Details, Membership Last Renewal year, Fellow↔Associate number list,
 * plus the files other parts of the app already handle (results sheets, membership fee report). */
(function (root) {
  "use strict";
  const T = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const low = v => T(v).toLowerCase();
  const REG = /\b(\d{4}\/[A-Z0-9]{1,4}\/\d{3,5})\b/i;
  const normReg = s => { const m = T(s).match(REG); return m ? m[1].toUpperCase() : ""; };
  const normMem = s => {
    const m = T(s).toUpperCase().match(/^(HF|F|A)\s*[-–.]?\s*0*(\d{1,4})$/);
    return m ? m[1] + String(+m[2]).padStart(3, "0") : "";
  };
  // SheetJS turns Sri Lanka dates into 23:59:28 of the previous day — nudge forward a minute, keep the local date
  const toDate = v => {
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 60000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
    const t = T(v); let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return "";
  };
  const phone = v => { const t = typeof v === "number" ? String(v) : T(v); if (!t) return ""; const d = t.replace(/\D/g, ""); return d.length === 9 ? "0" + d : t; };
  const emailOf = v => (T(v).match(/[^\s@,;/]+@[^\s@,;/]+\.[^\s@,;/]+/) || [""])[0];
  const levelOf = s => { const t = low(s);
    return /applic/.test(t) ? "Application" : /advis/.test(t) ? "Advisory" : /analy\w*\s*(level\s*)?(2|ii)\b|analyst\s*level\s*2/.test(t) ? "Analyst 2" : /analy/.test(t) ? "Analyst 1" : ""; };

  function headerRow(rows, need, maxRow = 12) {
    for (let i = 0; i < Math.min(rows.length, maxRow); i++) { const h = rows[i].map(low).join(" | "); if (need.every(re => re.test(h))) return i; }
    return -1;
  }
  const colIdx = (H, re, not) => H.findIndex(h => re.test(h) && !(not && not.test(h)));

  /* ---------- Course Registration Master ---------- */
  function parseRegistrations(rows, sheet, file) {
    const hi = headerRow(rows, [/name/, /reg|student\s*(no|number)|ref/, /phone|mobile|contact|email|e\s*mail/]);
    if (hi < 0) return [];
    const H = rows[hi].map(low);
    // the reg column: whichever header-matching column holds the most reg-like values
    const regCands = H.map((h, i) => /reg|student\s*(no|num)|student number|ref/.test(h) && !/name/.test(h) ? i : -1).filter(i => i >= 0);
    const body = rows.slice(hi + 1);
    const regCol = regCands.map(i => [i, body.filter(r => normReg(r[i])).length]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1;
    const C = {
      name: (() => { let i = colIdx(H, /full name|student name/); if (i < 0) i = colIdx(H, /name/, /initial|reg/); return i; })(),
      initials: colIdx(H, /initial/), nic: colIdx(H, /nic|passport/), email: colIdx(H, /e\s*-?\s*mail|aderss/),
      mobile: colIdx(H, /mobile|phone|contact|telephone/, /whats/), whatsapp: colIdx(H, /whats/), address: colIdx(H, /address/, /mail|aderss/),
      mode: colIdx(H, /learning mode/), joined: colIdx(H, /join|invoiced date|^date$|registered date/), status: colIdx(H, /stetus|status/),
    };
    const level = levelOf(sheet) || levelOf(file);
    const ym = (T(sheet).match(/20\d\d/) || T(file).match(/20\d\d/) || [""])[0];
    const out = [];
    for (const r of body) {
      const name = T(r[C.name]); const reg = regCol >= 0 ? normReg(r[regCol]) : "";
      if (!name || /^name$/i.test(name)) continue;
      if (!reg && !emailOf(r[C.email]) && !T(r[C.mobile])) continue;
      out.push({
        reg, fullName: name, initials: C.initials >= 0 ? T(r[C.initials]) : "", nic: C.nic >= 0 ? T(r[C.nic]).toUpperCase() : "",
        email: C.email >= 0 ? emailOf(r[C.email]) : "", mobile: C.mobile >= 0 ? phone(r[C.mobile]) : "", whatsapp: C.whatsapp >= 0 ? phone(r[C.whatsapp]) : "",
        address: C.address >= 0 ? T(r[C.address]) : "", mode: C.mode >= 0 ? T(r[C.mode]) : "", joined: C.joined >= 0 ? toDate(r[C.joined]) : "",
        prevStatus: C.status >= 0 ? T(r[C.status]) : "", level, batch: T(sheet), year: ym,
      });
    }
    return out;
  }

  /* ---------- Student renewal payments ---------- */
  function parseRenewals(rows) {
    const hi = headerRow(rows, [/date/, /description/, /amount/]);
    if (hi < 0) return [];
    const H = rows[hi].map(low);
    const C = { date: colIdx(H, /date/), desc: colIdx(H, /description/), ref: colIdx(H, /reference/), amount: colIdx(H, /amount/), upto: colIdx(H, /renewed\s*up/) };
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const desc = T(r[C.desc]), amount = +String(r[C.amount]).replace(/[^\d.]/g, "") || 0;
      if (!desc || !amount) continue;
      const reg = normReg(desc) || normReg(r[C.ref]);
      const name = T(desc.replace(REG, "").replace(/^\s*[-–]\s*/, "").replace(/\s*[-–]\s*(student\s*)?renewal.*$/i, ""));
      const yrs = (desc + " " + T(r[C.ref])).match(/20\d\d/g) || [];
      const up = C.upto >= 0 ? +String(r[C.upto]).replace(/\D/g, "") || null : null;
      out.push({ date: toDate(r[C.date]), reg, name, ref: T(r[C.ref]), amount, upto: up, years: [...new Set(yrs.map(Number))] });
    }
    return out;
  }

  /* ---------- Members' details ---------- */
  function parseMemberDetails(rows) {
    let H = null, section = "", out = [];
    for (const r of rows) {
      const cells = r.map(T), l = cells.map(c => c.toLowerCase());
      if (l.some(c => /^(member no|m\/ship)$/.test(c))) { H = l; continue; }
      const sec = cells.filter(Boolean); if (sec.length === 1 && /members?$/i.test(sec[0])) { section = sec[0]; continue; }
      const noI = cells.findIndex(c => normMem(c)); if (noI < 0 || !H) continue;
      const g = re => { const i = H.findIndex(h => re.test(h)); return i >= 0 ? cells[i] : ""; };
      const no = normMem(cells[noI]);
      out.push({ no, title: g(/^title$/), name: g(/^name$/), fullName: g(/full name/), email: emailOf(g(/e\s*-?\s*mail/)),
        phone: phone(r[H.findIndex(h => /contact/.test(h))] ?? ""), remark: g(/remark/), comment: g(/comment/),
        honorary: no.startsWith("HF") || /honorary/i.test(section) });
    }
    return out;
  }
  /* ---------- Last renewal FY ---------- */
  function parseLastRenewal(rows) {
    const hi = headerRow(rows, [/membership no/, /renew last/], 15); if (hi < 0) return [];
    const H = rows[hi].map(low), no = colIdx(H, /membership no/), fy = colIdx(H, /renew last/);
    return rows.slice(hi + 1).map(r => ({ no: normMem(r[no]), lastFY: T(r[fy]) })).filter(x => x.no && x.lastFY);
  }
  /* ---------- Fellow ↔ Associate numbers ---------- */
  function parseFellowAssoc(rows) {
    const hi = headerRow(rows, [/associate membership no/, /fellow membership no/], 15); if (hi < 0) return [];
    const H = rows[hi].map(low), a = colIdx(H, /associate/), f = colIdx(H, /fellow/), n = colIdx(H, /^name$/);
    return rows.slice(hi + 1).map(r => ({ fellow: normMem(r[f]), assoc: normMem(r[a]), name: T(r[n]) })).filter(x => x.fellow);
  }

  /* ---------- classify a workbook ---------- */
  function classify(XLSX, wb, file) {
    const res = { file, kind: "unknown", sheets: [] };
    const all = wb.SheetNames.map(n => ({ n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true, blankrows: false }) }));
    const txt = all.map(s => s.rows.slice(0, 12).map(r => r.map(low).join("|")).join("\n")).join("\n");
    if (/balance due/.test(txt) && /membership fee/.test(txt)) return { ...res, kind: "memberFees" };
    if (/renew last/.test(txt)) return { ...res, kind: "lastRenewal", data: all.flatMap(s => parseLastRenewal(s.rows)) };
    if (/associate membership no/.test(txt) && /fellow membership no/.test(txt)) return { ...res, kind: "fellowAssoc", data: all.flatMap(s => parseFellowAssoc(s.rows)) };
    if (/m\/ship|honorary members/.test(txt)) return { ...res, kind: "memberDetails", data: all.flatMap(s => parseMemberDetails(s.rows)) };
    if (/description/.test(txt) && /amount/.test(txt) && /renewal/.test(all.map(s => s.rows.slice(0, 30).map(r => r.map(low).join("|")).join("\n")).join("\n")))
      return { ...res, kind: "renewals", data: all.flatMap(s => parseRenewals(s.rows)) };
    if (/overall result|council evaluation|final total marks|average marks|subject stetus|(sub\.?|final) result/.test(txt)) return { ...res, kind: "results" };
    const regs = all.flatMap(s => parseRegistrations(s.rows, s.n, file));
    if (regs.length) return { ...res, kind: "registrations", data: regs, sheets: all.map(s => s.n) };
    if (/re ?joining|batch tra/.test(txt)) return { ...res, kind: "policy" };
    return res;
  }

  /* ---------- student renewal status ---------- */
  const RENEWAL_FEE = y => y < 2023 ? 1000 : 2000;          // Re-joining policy: Rs 1,000/yr before 2023, Rs 2,000/yr from 1.1.2023
  function renewalStatus({ reg, regYear, payments, completed, now = new Date() }) {
    const thisYear = now.getFullYear();
    if (completed) return { state: "done", upto: null, due: [], amount: 0 };
    const ups = payments.map(p => p.upto || Math.max(0, ...p.years.filter(y => y <= thisYear + 1))).filter(Boolean);
    const upto = ups.length ? Math.max(...ups) : null;
    const base = upto || regYear || null;
    if (!base) return { state: "unknown", upto: null, due: [], amount: 0 };
    const due = []; for (let y = base + 1; y <= thisYear; y++) due.push(y);
    const amount = due.reduce((s, y) => s + RENEWAL_FEE(y), 0);
    return { state: due.length ? (upto ? "overdue" : "never") : "ok", upto, base, due, amount, lastPaid: payments.map(p => p.date).sort().at(-1) || "" };
  }
  // Re-joining (batch transfer) estimate — from the Re-joining policy & IMS answers
  function rejoinEstimate({ renewalDue, startDate, now = new Date(), oldCourseFee = 0, newCourseFee = 0 }) {
    const yrs = startDate ? (now - new Date(startDate)) / (365.25 * 864e5) : null;
    const rejoinFee = yrs == null ? null : yrs <= 1 ? 5000 : yrs <= 2 ? 7000 : 10000;
    const rate = yrs == null ? null : yrs <= 2 ? 0.9 : yrs <= 5 ? 0.7 : yrs <= 10 ? 0.5 : 0;
    const courseDiff = oldCourseFee && newCourseFee && rate != null ? Math.max(0, newCourseFee - oldCourseFee * rate) : null;
    return { years: yrs, rejoinFee, renewal: renewalDue, redemptionRate: rate, courseDiff, total: (rejoinFee || 0) + (renewalDue || 0) + (courseDiff || 0) };
  }

  const api = { classify, parseRegistrations, parseRenewals, parseMemberDetails, parseLastRenewal, parseFellowAssoc, renewalStatus, rejoinEstimate, normReg, normMem, RENEWAL_FEE };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.CitDocs = api;
})(typeof window !== "undefined" ? window : globalThis);
