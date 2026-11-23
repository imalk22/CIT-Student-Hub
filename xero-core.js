/* CIT Student Hub — match Xero invoices to students and members (no DOM; testable in Node).
 * An invoice is matched, in this order, by:
 *   1. a student no (2024/A1/3236) or index no (25/AP/01/0117) in the contact's account number, contact number,
 *      name, the invoice reference or the line descriptions;
 *   2. a membership no (F 014, A-352) in the account number, contact number, contact name or reference
 *      (or in a line that mentions membership / subscription);
 *   3. the contact's email address;
 *   4. the contact's name, when exactly one student or member has that name.
 */
(function (root) {
  "use strict";
  const T = v => String(v ?? "").replace(/\s+/g, " ").trim();
  const norm = s => T(s).toLowerCase().replace(/^(mr|mrs|ms|miss|dr|prof|rev)\.?\s+/i, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  // student nos: 2024/A1/3236, 2023/AN1/B1/0123, 2024/A1E/0045 … ; index nos: 25/AP/01/0117
  // Separators inside a number may be "/", "-" or spaced ("2024 / a1 - 3236"); text around it can use dashes too
  // ("2026/01/3035 - Kamal Perera"). Found numbers are normalised and compared without leading zeros in the last part.
  const SEP = "\\s*[/\\-–]\\s*";
  const REG = new RegExp(`(?:^|[^0-9A-Z/])(\\d{4}(?:${SEP}[A-Z0-9]{1,4}){1,2}${SEP}\\d{3,5})(?![0-9])`, "g");
  const IDX = new RegExp(`(?:^|[^0-9A-Z/])(\\d{2}${SEP}[A-Z0-9]{1,4}${SEP}\\d{1,3}${SEP}\\d{2,5})(?![0-9])`, "g");
  const canon = s => T(s).toUpperCase().replace(/\s*[/\-–]\s*/g, "/");
  const findAll = (re, text) => [...T(text).toUpperCase().matchAll(re)].map(m => canon(m[1]));
  const idKey = s => { const p = canon(s).split("/"); if (p.length > 1) p[p.length - 1] = String(+p[p.length - 1] || p[p.length - 1]); return p.join("/"); };
  const MEM = /(?:^|[^A-Z0-9/])(F|A)\s?[-–.]?\s?0*(\d{1,4})(?![\d/])/gi;
  // "2026/01/3035 - Kamal Perera" → "Kamal Perera" (the person's name without the number around it)
  const cleanName = n => {
    const s = T(n).replace(new RegExp(`\\d{4}(?:${SEP}[A-Z0-9]{1,4}){1,2}${SEP}\\d{3,5}`, "gi"), " ").replace(/[()[\]|:]/g, " ").replace(/^[\s\-–,.]+|[\s\-–,.]+$/g, "").replace(/\s+/g, " ").trim();
    return s || T(n);
  };
  const memNo = (l, d) => l.toUpperCase() + String(+d).padStart(3, "0");

  function buildIndex({ students = [], members = [] }) {
    const sid = new Map(), idx = new Map(), mem = new Map(), email = new Map(), name = new Map();
    const addMulti = (map, k, v) => { if (!k) return; if (!map.has(k)) map.set(k, []); const a = map.get(k); if (!a.some(x => x.kind === v.kind && x.key === v.key)) a.push(v); };
    for (const s of students) {
      const ref = { kind: "student", key: s.id };
      sid.set(idKey(s.id), ref);
      for (const i of s.index_nos || []) idx.set(idKey(i), ref);
      for (const e of String(s.contact?.email || s.email || "").toLowerCase().split(/[;,\s]+/).filter(x => x.includes("@"))) addMulti(email, e, ref);
      addMulti(name, norm(s.name), ref);
    }
    for (const m of members) {
      const ref = { kind: "member", key: m.no };
      mem.set(m.no, ref); if (m.assocNo) mem.set(m.assocNo, ref);
      for (const e of String(m.email || "").toLowerCase().split(/[;,/\s]+/).filter(x => x.includes("@"))) addMulti(email, e, ref);
      addMulti(name, norm(m.name), ref);
      if (m.fullName) addMulti(name, norm(m.fullName), ref);
    }
    return { sid, idx, mem, email, name };
  }

  function matchInvoice(inv, I) {
    const c = inv.contact || {};
    const strong = [c.accountNumber, c.contactNumber, c.name, inv.reference].map(T).join(" | ");
    const all = strong + " | " + (inv.lines || []).join(" | ");
    const regs = findAll(REG, all);
    for (const g of regs) { const r = I.sid.get(idKey(g)); if (r) return { ...r, how: "student no" }; }
    for (const g of findAll(IDX, all)) { const r = I.idx.get(idKey(g)); if (r) return { ...r, how: "index no" }; }
    const memText = strong + " | " + (inv.lines || []).filter(l => /member|subscri/i.test(l)).join(" | ");
    for (const m of memText.matchAll(MEM)) { const r = I.mem.get(memNo(m[1], m[2])); if (r) return { ...r, how: "membership no" }; }
    const em = T(c.email).toLowerCase();
    if (em && I.email.get(em)?.length === 1) return { ...I.email.get(em)[0], how: "email" };
    const nm = norm(c.name);
    if (nm && I.name.get(nm)?.length === 1) return { ...I.name.get(nm)[0], how: "name" };
    // a student no that isn't in the app's records yet — still a student who owes, so keep it (no profile to open)
    // (only from the contact / reference, not free-text lines, so dates in descriptions can't pass as numbers)
    const strongRegs = findAll(REG, strong);
    if (strongRegs.length) return { kind: "student", key: strongRegs[0], how: "student no (not in records)", unknown: true, contactName: cleanName(c.name) };
    return null;
  }

  /* → { byKey: Map("student:ID" → summary), unmatched: [inv], total, overdue } */
  function summarize(invoices, people, today = new Date().toISOString().slice(0, 10)) {
    const I = buildIndex(people), byKey = new Map(), unmatched = [];
    let total = 0, overdue = 0;
    for (const inv of invoices || []) {
      total += inv.due; const late = !!inv.dueDate && inv.dueDate < today; if (late) overdue += inv.due;
      const m = matchInvoice(inv, I);
      if (!m) { unmatched.push({ ...inv, late }); continue; }
      const k = m.kind + ":" + m.key;
      const g = byKey.get(k) || { kind: m.kind, key: m.key, unknown: !!m.unknown, contactName: m.contactName || "", due: 0, overdue: 0, count: 0, oldest: "", invoices: [], how: new Set() };
      g.due += inv.due; if (late) g.overdue += inv.due; g.count++; g.how.add(m.how);
      if (inv.dueDate && (!g.oldest || inv.dueDate < g.oldest)) g.oldest = inv.dueDate;
      g.invoices.push({ ...inv, late, how: m.how });
      byKey.set(k, g);
    }
    return { byKey, unmatched, total, overdue };
  }

  const api = { buildIndex, matchInvoice, summarize, cleanName };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.XeroCore = api;
})(typeof window !== "undefined" ? window : globalThis);
