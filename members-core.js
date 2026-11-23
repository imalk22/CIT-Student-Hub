/* CIT Student Hub — membership fee engine (no DOM). Reads the "Membership fee report" Excel layout:
 * a header block with "Name / Membership No / Emails", a row of year labels (2017/2018 & Before … 2026/2027),
 * and under each year: fee · paid amount · method/remark · [date] · balance due.  "W/O" = waived (nothing to pay).
 * Works in the browser (global MembersCore) and in Node (module.exports) so it can be tested. */
(function (root) {
  "use strict";
  const T = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const isWO = v => /^w\s*\/?\s*o$/i.test(T(v)) || /waiv|write\s*off/i.test(T(v));
  const num = v => {
    if (typeof v === "number") return v;
    const t = T(v).replace(/[,\s]|rs\.?|\/=|\/-/gi, "");
    return /^-?\d+(\.\d+)?$/.test(t) ? +t : null;
  };
  const normNo = s => {   // "F 003", "F-003", "F003", "A-005 " → "F003" / "A005"
    const m = T(s).toUpperCase().match(/^([FA])\s*[-–]?\s*0*(\d{1,4})$/);
    return m ? m[1] + String(+m[2]).padStart(3, "0") : T(s).toUpperCase().replace(/\s+/g, "");
  };
  const prettyNo = n => /^[FA]\d+$/.test(n) ? n[0] + " " + n.slice(1) : n;
  const yearKey = s => { const m = T(s).match(/(20\d\d)\s*\/\s*(\d{2,4})/); return m ? `${m[1]}/${m[2].slice(-2)}` : null; };
  const yearStart = k => +k.slice(0, 4);
  function fiscalYear(d = new Date()) {   // CIT membership year runs April → March
    const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${y}/${String(y + 1).slice(-2)}`;
  }

  /* ---------- parse one sheet (rows = array of arrays) ---------- */
  function parseSheet(rows, sheetName) {
    const type = /assoc/i.test(sheetName) ? "Associate" : /fellow/i.test(sheetName) ? "Fellow" : null;
    // header row: the one containing "Name" and "Membership No"
    const hi = rows.findIndex((r, i) => i < 30 && r.some(c => /^name$/i.test(T(c))) && r.some(c => /membership\s*no/i.test(T(c))));
    if (hi < 0 || !type) return null;
    const H = rows[hi].map(T);
    const col = (re, not) => H.findIndex(h => re.test(h) && !(not && not.test(h)));
    const C = {
      admitted: col(/year of adm/i), ser: col(/^ser/i), name: col(/^name$/i),
      no: col(/^membership\s*no/i), assocNo: col(/associate\s*membership\s*no/i), email: col(/e-?\s*mails?/i),
      total: col(/balance due\s*total|^total$/i),
    };
    // year blocks: scan the next 3 rows for "20xx/20xx" labels
    const blocks = [];
    for (let r = hi; r < Math.min(rows.length, hi + 3); r++) {
      rows[r].forEach((c, i) => { const k = yearKey(c); if (k && !/fee|balance|paid/i.test(T(c)) && !blocks.some(b => b.col === i)) blocks.push({ key: k, col: i, before: /before/i.test(T(c)) }); });
    }
    blocks.sort((a, b) => a.col - b.col);
    const sub = rows.slice(hi, hi + 4);
    const label = i => sub.map(r => T(r[i])).join(" ");
    blocks.forEach((b, k) => {
      let end = k + 1 < blocks.length ? blocks[k + 1].col : b.col + 7;
      b.fee = b.col; b.paid = b.remark = b.date = b.bal = -1;
      for (let i = b.col + 1; i < end; i++) {
        const L = label(i);
        if (/total/i.test(L)) break;                       // the sheet-wide "Balance Due Total" column ends the last block
        if (/paid/i.test(L) && b.paid < 0) b.paid = i; else if (/method|remark/i.test(L) && b.remark < 0) b.remark = i;
        else if (/\bdate\b/i.test(L) && !/fee/i.test(L) && b.date < 0) b.date = i; else if (/balance/i.test(L) && b.bal < 0) b.bal = i;
      }
    });
    // whole-sheet "Total" can sit in the sub-header rows
    if (C.total < 0) { const last = blocks.at(-1); for (let i = last ? last.col : 0; i < (rows[hi + 2] || []).length; i++) if (/^total$/i.test(T(rows[hi + 2][i]))) C.total = i; }

    const members = []; let section = "active";
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r], name = T(row[C.name]);
      const first = T(row[0]) + " " + name;
      if (/diad|deceased|passed away|late members/i.test(first) && !T(row[C.no])) { section = "deceased"; continue; }
      if (!name || /^total/i.test(T(row[0]))) continue;
      if (blocks.length && rows.slice(hi + 1, hi + 4).includes(row)) { if (!T(row[C.no]) && !/[a-z]/i.test(name)) continue; }
      const no = normNo(row[C.no]);
      if (!no && !name) continue;
      // detect phone / title columns without headers
      let phone = "", title = "";
      row.slice(0, blocks[0]?.col ?? row.length).forEach((v, i) => {
        const t = T(v);
        if (!title && /^(mr|mrs|ms|miss|dr|prof|rev|hon)\.?$/i.test(t)) title = t.replace(/\.?$/, ".");
        if (!phone && i !== C.ser && i !== C.admitted && (/^0\d{2,3}[-\s]?\d{3}[-\s]?\d{3,4}/.test(t) || (typeof v === "number" && String(v).length >= 9 && String(v).length <= 11))) phone = typeof v === "number" ? "0" + v : t;
      });
      const years = blocks.map(b => {
        const fee = row[b.fee], paid = row[b.paid], bal = row[b.bal];
        const remark = b.remark >= 0 ? T(row[b.remark]) : "", dateV = b.date >= 0 ? row[b.date] : "";
        const wo = isWO(fee) || isWO(bal) || isWO(paid);
        const feeN = num(fee), paidN = num(paid) || 0, balN = num(bal);
        let due = 0, state;
        if (wo) { state = "waived"; }
        else if (feeN == null || feeN === 0) { state = balN ? "unpaid" : "none"; due = balN || 0; }
        else {
          due = balN != null ? balN : Math.max(0, feeN - paidN);
          state = due <= 0 ? "paid" : paidN > 0 ? "partial" : "unpaid";
          if (due < 0) due = 0;
        }
        const date = dateV instanceof Date ? dateV.toISOString().slice(0, 10) : T(dateV);
        return { year: b.key, before: b.before, fee: feeN, paid: wo ? 0 : paidN, due, state, remark: [remark, date].filter(Boolean).join(" · ") };
      });
      const totalCell = C.total >= 0 ? num(row[C.total]) : null;
      members.push({
        no, type, name: name.replace(/\s*\((diad|passed away)\)\s*/i, " ").replace(/\s*-\s*\(passed away\)/i, "").trim(),
        title, phone, email: T(row[C.email]).replace(/;\s*$/, ""),
        assocNo: C.assocNo >= 0 ? normNo(row[C.assocNo]) : "",
        admitted: T(row[C.admitted]) && !(row[C.admitted] instanceof Date) ? T(row[C.admitted]) : "",
        status: section === "deceased" || /\((diad|passed away)\)/i.test(name) ? "deceased" : "active",
        years, sheetTotal: totalCell,
      });
    }
    return { type, members, years: blocks.map(b => b.key) };
  }

  /* payment log sheet: "Ser No · PaymentDate · Membership No & Member Name · Method · Amount · Remark" */
  function parsePayments(rows) {
    const hi = rows.findIndex((r, i) => i < 15 && r.some(c => /payment\s*date/i.test(T(c))) && r.some(c => /amou?n?t/i.test(T(c))));
    if (hi < 0) return [];
    const H = rows[hi].map(T), f = re => H.findIndex(h => re.test(h));
    const c = { date: f(/date/i), who: f(/member/i), method: f(/method/i), amount: f(/amou?n?t/i), remark: f(/remark/i) };
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const who = T(r[c.who]), amount = num(r[c.amount]); if (!who || amount == null) continue;
      const m = who.match(/^([FA])\s*[-–]?\s*(\d{1,4})\s*[-–]?\s*(.*)$/i);
      const d = r[c.date];
      out.push({ no: m ? normNo(m[1] + m[2]) : "", name: m ? T(m[3]) : who, amount, method: T(r[c.method]), remark: T(r[c.remark]),
        date: d instanceof Date ? d.toISOString().slice(0, 10) : T(d) });
    }
    return out;
  }
  /* extra list sheet (e.g. newly admitted fellows): Title · Name · Phone · Associate No · Membership No */
  function parseList(rows) {
    const out = [];
    for (const r of rows) {
      const cells = r.map(T), noI = cells.findIndex(c => /^[FA]\s*[-–]?\s*\d{1,4}$/i.test(c));
      if (noI < 0) continue;
      const fNo = cells.filter(c => /^[FA]\s*[-–]?\s*\d{1,4}$/i.test(c)).map(normNo);
      const no = fNo.find(n => n[0] === "F") || fNo[0], assoc = fNo.find(n => n[0] === "A" && n !== no) || "";
      const title = cells.find(c => /^(mr|mrs|ms|miss|dr|prof|rev)\.?$/i.test(c)) || "";
      const name = cells.find(c => /[a-z]{2}/i.test(c) && !/^(mr|mrs|ms|miss|dr|prof|rev)\.?$/i.test(c) && !/^[FA]\s*[-–]?\s*\d/.test(c)) || "";
      const phone = cells.find(c => /^0\d{2,3}[-\s]?\d{3}/.test(c)) || "";
      if (name) out.push({ no, assocNo: assoc, title: title.replace(/\.?$/, "."), name, phone });
    }
    return out;
  }

  /* ---------- whole workbook (SheetJS) ---------- */
  function parseWorkbook(XLSX, wb, fileName) {
    const members = [], payments = [], extras = [];
    let years = [];
    for (const n of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "", raw: true });
      const p = parseSheet(rows, n);
      if (p && p.members.length) { members.push(...p.members); if (p.years.length > years.length) years = p.years; continue; }
      const pay = parsePayments(rows);
      if (pay.length) { payments.push(...pay); continue; }
      extras.push(...parseList(rows));
    }
    // newly admitted members listed only on a side sheet
    for (const x of extras) {
      if (!x.no || members.some(m => m.no === x.no)) continue;
      members.push({ no: x.no, type: x.no[0] === "F" ? "Fellow" : "Associate", name: x.name, title: x.title, phone: x.phone, email: "", assocNo: x.assocNo,
        admitted: "", status: "active", newMember: true, years: [], sheetTotal: null });
    }
    return { members, payments, years, file: fileName, importedAt: Date.now() };
  }

  /* ---------- money ---------- */
  function account(m, currentYear) {
    const cur = m.years.find(y => y.year === currentYear) || null;
    const arrears = m.years.filter(y => y.year !== currentYear && yearStart(y.year) < yearStart(currentYear)).reduce((s, y) => s + (y.due || 0), 0);
    const current = cur ? cur.due || 0 : 0;
    const waivedNow = !!cur && cur.state === "waived";
    const paidTotal = m.years.reduce((s, y) => s + (y.paid || 0), 0);
    let status;
    if (m.status === "deceased") status = "deceased";
    else if (waivedNow) status = "waived";
    else if (m.newMember && !m.years.length) status = "new";
    else if (arrears + current <= 0) status = "paid";
    else if (current > 0 && arrears <= 0) status = "current";
    else status = "arrears";
    const unpaidYears = m.years.filter(y => y.due > 0).map(y => y.year);
    return { current, currentState: cur?.state || "none", currentFee: cur?.fee || 0, currentPaid: cur?.paid || 0, arrears,
      total: m.status === "deceased" ? 0 : arrears + current, paidTotal, status, unpaidYears };
  }
  function summary(members, currentYear) {
    const S = { members: 0, fellows: 0, associates: 0, deceased: 0, waived: 0, paidUp: 0, owing: 0, outstanding: 0, arrears: 0,
      currentExpected: 0, currentCollected: 0, currentDue: 0, byYear: {} };
    for (const m of members) {
      if (m.status === "deceased") { S.deceased++; continue; }
      const a = account(m, currentYear);
      S.members++; m.type === "Fellow" ? S.fellows++ : S.associates++;
      if (a.status === "waived") S.waived++;
      if (a.status === "paid") S.paidUp++;
      if (a.total > 0) { S.owing++; S.outstanding += a.total; S.arrears += a.arrears; S.currentDue += a.current; }
      for (const y of m.years) {
        const b = S.byYear[y.year] ||= { year: y.year, expected: 0, collected: 0, due: 0, waived: 0 };
        if (y.state === "waived") { b.waived++; continue; }
        if (y.fee) b.expected += y.fee;
        b.collected += y.paid || 0; b.due += y.due || 0;
      }
    }
    const c = S.byYear[currentYear]; if (c) { S.currentExpected = c.expected; S.currentCollected = c.collected; }
    return S;
  }

  /* ---------- official fee rates by membership year ---------- */
  const DEFAULT_RATES = {   // Associate / Fellow. 2024/25 – 2026/27 confirmed by CITSL; earlier years = what the fee report charges most
    "2017/18": { Associate: 1500, Fellow: 2000, src: "report" }, "2018/19": { Associate: 2500, Fellow: 3000, src: "report" },
    "2019/20": { Associate: 2500, Fellow: 3000, src: "report" }, "2020/21": { Associate: 2500, Fellow: 3000, src: "report" },
    "2021/22": { Associate: 2500, Fellow: 3000, src: "report" }, "2022/23": { Associate: 2500, Fellow: 3000, src: "report" },
    "2023/24": { Associate: 5000, Fellow: 6000, src: "report" }, "2024/25": { Associate: 5000, Fellow: 6000, src: "official" },
    "2025/26": { Associate: 6000, Fellow: 9000, src: "official" }, "2026/27": { Associate: 7000, Fellow: 10000, src: "official" },
  };
  /* Returns a copy of the member with:
     - blank fee cells after the member's first charged year filled at the official rate (rateApplied), unless
       the previous year was W/O, in which case the waiver carries over (woCarried);
     - years whose sheet fee differs from the rate marked with rateDiff. */
  function applyRates(m, rates, { fillBlank = true } = {}) {
    if (!rates || m.status === "deceased" || !m.years?.length || (m.type !== "Fellow" && m.type !== "Associate")) return m;
    const first = m.years.findIndex(y => y.state !== "none");
    if (first < 0) return m;
    const years = [];
    m.years.forEach((y, i) => {
      const r = rates[y.year]?.[m.type], prev = years[i - 1];
      if (r && y.state === "none" && i > first && fillBlank) {
        if (prev && prev.state === "waived") years.push({ ...y, state: "waived", woCarried: true });
        else years.push({ ...y, fee: r, paid: 0, due: r, state: "unpaid", rateApplied: true });
      } else if (r && y.fee && y.state !== "waived" && y.fee !== r) years.push({ ...y, rateDiff: r });
      else years.push(y);
    });
    return { ...m, years };
  }

  /* ---------- standing: suspended / terminated ----------
     Counts the membership years (up to and including the current one) that still have something due.
     W/O years and years with no charge never count. "2017/18 & before" counts as one year.
     2+ unpaid years → suspended (no slip / receipt until cleared); 5+ → terminated. */
  const DEFAULT_STANDING = { suspendAt: 2, terminateAt: 5 };
  function standing(m, currentYear, rules = DEFAULT_STANDING) {
    const r = { ...DEFAULT_STANDING, ...(rules || {}) };
    if (m.status === "deceased" || m.honorary || m.noFeeRecord || !m.years?.length) return { state: "na", unpaid: [], count: 0 };
    const cy = yearStart(currentYear);
    const unpaid = m.years.filter(y => y.state !== "waived" && (y.due || 0) > 0 && yearStart(y.year) <= cy).map(y => y.year);
    const count = unpaid.length;
    const state = count >= r.terminateAt ? "terminated" : count >= r.suspendAt ? "suspended" : "good";
    return { state, unpaid, count };
  }

  const api = { DEFAULT_RATES, DEFAULT_STANDING, standing, applyRates, parseWorkbook, parseSheet, parsePayments, account, summary, fiscalYear, normNo, prettyNo, yearStart };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MembersCore = api;
})(typeof window !== "undefined" ? window : globalThis);
