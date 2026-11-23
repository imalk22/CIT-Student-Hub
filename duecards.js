/* CIT Student Hub — unpaid Xero invoices shown as clear cards (one box per student / member / Xero contact).
   Used by the Dues tab (students) and the Finance page (students, members, not matched). */
"use strict";
const DAY = 864e5;
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = d => Math.max(0, Math.floor((Date.now() - new Date(d + "T00:00:00")) / DAY));
const initialsOf = n => String(n || "?").replace(/[^A-Za-z\s]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?";

/* one entry per person/contact with everything the card needs */
function dueEntry({ kind, key, name, sub, unknown, invoices, contact = {}, extra = {} }) {
  const t = todayISO(), d90 = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
  const inv = invoices.slice().sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
  const late = inv.filter(i => i.dueDate && i.dueDate < t), soon = inv.filter(i => !(i.dueDate && i.dueDate < t));
  const sum = (xs, k = "due") => xs.reduce((a, i) => a + (+i[k] || 0), 0);
  const oldest = late[0]?.dueDate || "";
  return { kind, key, name, sub, unknown, inv, contact, ...extra,
    due: sum(inv), overdue: sum(late), notDue: sum(soon), late90: sum(inv.filter(i => i.dueDate && i.dueDate < d90)),
    invoiced: sum(inv, "total"), paid: sum(inv, "paid"), lateCount: late.length, oldest, daysLate: oldest ? daysSince(oldest) : 0,
    nextDue: soon[0]?.dueDate || "" };
}

function dueGroups(kind) {
  const F = finIndex(); if (!F) return [];
  const stu = new Map(DB.students.map(s => [s.id, s])), mem = new Map((typeof MEMBERS === "function" ? MEMBERS() : []).map(m => [m.no, m]));
  return [...F.byKey.values()].filter(g => g.kind === kind).map(g => {
    if (kind === "member") {
      const m = mem.get(g.key);
      return dueEntry({ kind, key: g.key, name: m ? (m.title ? m.title + " " : "") + m.name : g.key, sub: MC.prettyNo(g.key) + (m ? " · " + m.type : ""), invoices: g.invoices,
        contact: { email: m?.email, phone: m?.phone }, extra: { standing: m ? acct(m).standing.state : "" } });
    }
    const s = stu.get(g.key), c = g.invoices[0]?.contact || {};
    return dueEntry({ kind, key: g.key, name: s ? s.name : (g.contactName || XeroCore.cleanName(c.name) || g.key), sub: g.key, unknown: !s, invoices: g.invoices,
      contact: { email: s?.contact?.email || c.email, phone: s?.contact?.phone } });
  });
}
function unmatchedGroups() {
  const F = finIndex(); if (!F) return [];
  const by = new Map();
  for (const i of F.unmatched) { const k = i.contact.id || i.contact.name || i.number; if (!by.has(k)) by.set(k, []); by.get(k).push(i); }
  return [...by.entries()].map(([k, inv]) => dueEntry({ kind: "none", key: k, name: inv[0].contact.name || "No contact name", sub: inv[0].contact.accountNumber ? "Account no " + inv[0].contact.accountNumber : "No account number in Xero",
    invoices: inv, contact: { email: inv[0].contact.email } }));
}

/* status shown on the card */
function dueStatus(d) {
  if (d.late90) return ["c-red", `Overdue ${d.daysLate} days`];
  if (d.overdue) return ["c-orange", `Overdue ${d.daysLate} day${d.daysLate === 1 ? "" : "s"}`];
  if (d.nextDue) { const n = Math.ceil((new Date(d.nextDue + "T00:00:00") - Date.now()) / DAY); return n <= 14 ? ["c-blue", n <= 0 ? "Due today" : `Due in ${n} day${n === 1 ? "" : "s"}`] : ["c-gray", "Not yet due"]; }
  return ["c-gray", "Unpaid"];
}

function dueCardHtml(d, { amount = "due" } = {}) {
  const [cls, label] = dueStatus(d), t = todayISO();
  const paidPct = d.invoiced ? Math.min(100, 100 * d.paid / d.invoiced) : 0;
  const big = amount === "overdue" ? d.overdue : amount === "notDue" ? d.notDue : amount === "late90" ? d.late90 : d.due;
  const bigLabel = { overdue: "overdue", notDue: "not yet due", late90: "over 90 days late", due: "unpaid" }[amount];
  const shown = d.inv.slice(0, 3);
  return `<button class="dcard ${d.overdue ? "is-late" : ""}" data-k="${esc(d.kind)}" data-key="${esc(d.key)}">
    <div class="dc-top">
      <span class="dc-av" style="background:${color(d.name)}">${esc(initialsOf(d.name))}</span>
      <span class="dc-id"><b>${esc(d.name)}</b><span class="dc-no">${esc(d.sub)}</span></span>
      <span class="chip ${cls}">${esc(label)}</span>
    </div>
    <div class="dc-amt"><b class="${amount !== "notDue" && big ? "owe" : ""}">${rs(big)}</b><span>${bigLabel}</span></div>
    <div class="dc-bar" title="Paid ${rs(d.paid)} of ${rs(d.invoiced)} invoiced"><i style="width:${paidPct.toFixed(1)}%"></i></div>
    <div class="dc-barl"><span>Paid ${rs(d.paid)}</span><span>of ${rs(d.invoiced)} invoiced</span></div>
    <div class="dc-stats">
      <div><small>Overdue</small><b class="${d.overdue ? "owe" : ""}">${rs(d.overdue)}</b></div>
      <div><small>Not yet due</small><b>${rs(d.notDue)}</b></div>
      <div><small>Invoices</small><b>${d.inv.length}</b></div>
    </div>
    <div class="dc-inv">${shown.map(i => { const late = i.dueDate && i.dueDate < t; return `<div class="${late ? "late" : ""}">
      <span class="dci-n">${esc(i.number || "Invoice")}<small>${esc(i.lines?.[0] || i.reference || "")}</small></span>
      <span class="dci-d">${i.dueDate ? (late ? `${daysSince(i.dueDate)}d late` : "due " + fmtDay(i.dueDate)) : ""}</span>
      <span class="dci-a">${rs(i.due)}</span></div>`; }).join("")}
      ${d.inv.length > shown.length ? `<div class="dc-more">+ ${d.inv.length - shown.length} more invoice${d.inv.length - shown.length === 1 ? "" : "s"}</div>` : ""}</div>
    ${d.standing === "terminated" ? `<div class="dc-flag ter">Terminated member</div>` : d.standing === "suspended" ? `<div class="dc-flag sus">Suspended member</div>` : ""}
    ${d.kind === "none" ? `<div class="dc-flag">Add the student / membership no to this contact's Account number in Xero to match it</div>` : ""}
  </button>`;
}

/* full detail when a card is clicked */
function openDueSheet(d) {
  if (!d) return;
  const t = todayISO(), [cls, label] = dueStatus(d);
  openSheet(`<div class="bar-top"><div style="display:flex;gap:12px;align-items:center"><span class="dc-av" style="background:${color(d.name)};width:44px;height:44px;font-size:16px">${esc(initialsOf(d.name))}</span>
      <div><b style="font-size:18px">${esc(d.name)}</b><div class="muted">${esc(d.sub)} · from Xero${DB.xero ? " · synced " + ago(DB.xero.syncedAt) : ""}</div></div></div>${closeBtn}</div>
    <div style="margin:4px 0 12px"><span class="chip ${cls}">${esc(label)}</span>${d.unknown ? ` <span class="chip c-gray">Not in the student list</span>` : ""}</div>
    <div class="ds-kpis">
      <div class="red"><small>Overdue</small><b>${rs(d.overdue)}</b><span>${d.lateCount} invoice${d.lateCount === 1 ? "" : "s"}${d.oldest ? ` · since ${fmtDay(d.oldest)}` : ""}</span></div>
      <div class="blue"><small>Not yet due</small><b>${rs(d.notDue)}</b><span>${d.nextDue ? "next due " + fmtDay(d.nextDue) : "—"}</span></div>
      <div><small>Total unpaid</small><b>${rs(d.due)}</b><span>paid ${rs(d.paid)} of ${rs(d.invoiced)}</span></div>
    </div>
    <div class="card ds-table"><div class="sec-h"><h2>Invoices</h2><span class="muted">${d.inv.length}</span></div>
      <div class="ds-row ds-head"><span>Invoice</span><span>Due date</span><span>Status</span><span class="r">Total</span><span class="r">Paid</span><span class="r">Due</span></div>
      ${d.inv.map(i => { const late = i.dueDate && i.dueDate < t; return `<div class="ds-row ${late ? "late" : ""}">
        <span><b>${esc(i.number || "Invoice")}</b><small>${esc([i.reference, i.lines?.[0]].filter(Boolean).join(" · "))}</small></span>
        <span>${i.dueDate ? fmtDay(i.dueDate) : "—"}</span>
        <span>${late ? `<span class="chip c-red">${daysSince(i.dueDate)} days late</span>` : `<span class="chip c-gray">Not yet due</span>`}</span>
        <span class="r">${rs(i.total)}</span><span class="r">${rs(i.paid)}</span><span class="r"><b class="${late ? "owe" : ""}">${rs(i.due)}</b></span></div>`; }).join("")}
    </div>
    ${d.contact.email || d.contact.phone ? `<div class="card ds-contact"><div class="sec-h"><h2>Contact</h2></div>
      ${d.contact.email ? `<div><a href="mailto:${esc(d.contact.email)}">${esc(d.contact.email)}</a></div>` : ""}${d.contact.phone ? `<div><a href="tel:${esc(d.contact.phone)}">${esc(d.contact.phone)}</a></div>` : ""}</div>` : ""}
    ${d.kind === "member" ? `<div class="actions"><button class="btn" id="dsMem">Open member page</button></div>` : ""}`);
  $("#sheet").classList.add("wide");
  if ($("#dsMem")) $("#dsMem").onclick = () => openMember(d.key);
}

/* wire clicks on a container of cards to the detail sheet */
function bindDueCards(box, list) {
  $$(".dcard", box).forEach(b => b.onclick = () => openDueSheet(list.find(d => d.kind === b.dataset.k && d.key === b.dataset.key)));
}
