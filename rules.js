/* CIT Student Hub — Rules & fees: everything from the CIT documents in one place, with calculators.
 * Sources: Basic course details, Additional Information (charges & fees), Student Payment Procedure (17.07.26),
 * Exemption Criteria (Curriculum 2025), Transitional Provision to Syllabus 2025, Re-joining Policy,
 * IMS queries answered for Senska (07.04.26), Membership Details, Exam & Membership application forms, Course brochure. */
"use strict";
const RULES = {
  levels: [
    { level: "Application", months: 4, medium: "Sinhala & English", cert: "Certificate in Taxation",
      subjects: [["TX 111", "Principles of Direct Taxation"], ["TX 112", "Principles of Indirect Taxation"], ["BS 111", "Fundamentals of Accounting"], ["BS 112", "Business Environment for Taxation"]],
      entry: ["G.C.E. A/L with a minimum of three ‘S’ passes in any stream at a single sitting", "or O/L with another professional qualification (brochure)"] },
    { level: "Analyst 1", months: 5, medium: "English", cert: "Business Tax Associate (BTA)",
      subjects: [["TX 211", "Direct Taxation Management"], ["TX 212", "Indirect Taxation Management (VAT 40%, other 60%)"], ["CP 211", "Compliance Management"], ["BS 211", "Accounting for Taxation"], ["BS 212", "Business Law"]],
      entry: ["CIT Application Level completed", "or Application Level exempted under the exemption criteria (AAT, ICASL Business Level II, CMA Level 2, CIMA Operational, ACCA Applied Skills, ICASL CTA, HNDA/HNDBF 2nd year, UGC-approved graduates, Attorney-at-Law)"] },
    { level: "Analyst 2", months: 7, medium: "English", cert: "Certified Tax Analyst (CTA)",
      subjects: [["TX 221", "Corporate Taxation"], ["TX 222", "Practical Application of Value Added Tax"], ["CP 221", "Conceptual Framework of Tax Adjudication"], ["BS 221", "Audit & Assurance for Taxation"], ["BS 222", "Corporate Law"]],
      entry: ["CIT Analyst Level 1 completed", "or ICASL past finalists / members, or ICASL Certified / Chartered Tax Advisor"] },
    { level: "Advisory", months: 8, medium: "English", cert: "Associate Member of the Chartered Institute of Taxation (ACIT)",
      subjects: [["TX 311", "International Taxation & Transfer Pricing"], ["TX 312", "Application of Tax Adjudication"], ["CP 311", "Contemporary Issues in Taxation"], ["CP 312", "Compliance Risk Management & Validation"], ["BS 311", "Strategic Management & Entrepreneurship"]],
      entry: ["CIT Analyst Level 2 completed", "or ICASL past finalists / members"] },
  ],
  fees: {   // Additional Information + Student Payment Procedure 17.07.26
    "Application": { reg: 3000, course: 30000, exemption: 0, plan: [[0.75, 0, "At registration (75%)"], [0.25, 6, "Within 6 weeks of the 1st instalment (25%)"]] },
    "Analyst 1": { reg: 3000, course: 50000, exemption: 14000, plan: [[0.5, 0, "At registration (50%)"], [0.25, 4, "4th week (25%)"], [0.25, 8, "8th week (25%)"]] },
    "Analyst 2": { reg: 3000, course: 75000, exemption: 35500, plan: [[0.5, 0, "At registration (Rs 37,500)"], [1 / 6, 4, "4th week (Rs 12,500)"], [1 / 6, 8, "8th week (Rs 12,500)"], [1 / 6, 12, "12th week (Rs 12,500)"]] },
    "Advisory": { reg: 3000, course: 93000, exemption: 21700, plan: [[0.5, 0, "At registration (Rs 46,500)"], [1 / 6, 4, "4th week (Rs 15,500)"], [1 / 6, 8, "8th week (Rs 15,500)"], [1 / 6, 12, "12th week (Rs 15,500)"]] },
  },
  examFees: { "Application": [5800, 7700, 10200, 12100], "Analyst 1": [6100, 8800, 11500, 13500, 15500], "Analyst 2": [6500, 9000, 11500, 14000, 16500], "Advisory": [7000, 9500, 12000, 14500, 17500] },
  exemptions: [
    ["Entire Application Level", "AAT", "Past finalists or members"], ["Entire Application Level", "ICASL", "Business Level II"],
    ["Entire Application Level", "CMA", "Qualified in Operational Level (Level 2)"], ["Entire Application Level", "CIMA", "Qualified in Operational Level"],
    ["Entire Application Level", "ACCA", "Qualified in Applied Skills Level"], ["Entire Application Level", "ICASL – Certified / Chartered Tax Advisor", "Past finalists or members"],
    ["Entire Application Level", "SLIATE HNDA / HNDBF", "Completed the 2nd year"], ["Entire Application Level", "UGC-approved graduates / master's holders", "Graduates who have undertaken (the relevant subjects)"],
    ["Entire Application Level", "Attorney-at-Law", ""],
    ["Application – BS 111 Fundamentals of Accounting", "G.C.E. A/L", "Accountancy with a ‘C’ pass"],
    ["Application – TX 112 Principles of Indirect Tax", "Professional tax course in CITSL, CIT, CTA, AAT, CMA", "Completed"],
    ["Application – TX 111 Principles of Direct Tax", "Professional tax course in CITSL, CIT, CTA, AAT, CMA", "Completed"],
    ["Application – BS 112 Business Environment", "G.C.E. A/L", "Economics and Business Studies with a ‘C’ pass and O/L Mathematics with a ‘B’ pass"],
    ["Entire Analyst Level I", "ICASL", "Past finalists or members"], ["Entire Analyst Level I", "ICASL – Certified / Chartered Tax Advisor", "Past finalists or members"],
    ["Analyst I – BS 211 Accounting for Taxation", "ICASL", "Completed Business Level II – Accounting"], ["Analyst I – BS 211 Accounting for Taxation", "CMA / CIMA / ACCA", "Past finalists or members"],
    ["Analyst I – BS 211 Accounting for Taxation", "SLIATE HNDA / HNDBF", "Completed the course"], ["Analyst I – BS 211 Accounting for Taxation", "UGC-approved graduates", "Specialised in accountancy or finance"],
    ["Analyst I – BS 212 Business Law", "ICASL", "Completed the Business Law subject"], ["Analyst I – BS 212 Business Law", "CMA / CIMA / ACCA", "Past finalists or members"],
    ["Analyst I – BS 212 Business Law", "SLIATE HNDA / HNDBF", "Completed the course"], ["Analyst I – BS 212 Business Law", "UGC-approved graduates", "Undertaken business law as a subject"],
    ["Analyst I – BS 212 Business Law", "Attorney-at-Law / LLB", "Any law degree with a pass in Business Law"], ["Analyst I – BS 212 Business Law", "Chartered Corporate Secretaries", "Passed finalists or members"],
    ["Entire Analyst Level II", "ICASL", "Past finalists or members"],
    ["Analyst II – TX 221 Corporate Taxation", "ICASL – Certified / Chartered Tax Advisor", "Past finalists or members"],
    ["Analyst II – TX 222 Practical Application of VAT", "ICASL – Certified / Chartered Tax Advisor", "Past finalists or members"],
    ["Analyst II – BS 222 Corporate Law", "Attorney-at-Law / LLB", "Any law degree with a pass in Corporate Law"], ["Analyst II – BS 222 Corporate Law", "Chartered Corporate Secretaries", "Passed finalists or members"],
    ["Analyst II – BS 222 Corporate Law", "ACCA / CMA", "Completed the Corporate Law subject"],
    ["Analyst II – BS 221 Audit & Assurance", "CMA", "Completed Corporate Governance, Control Strategy and Ethics (GCE)"], ["Analyst II – BS 221 Audit & Assurance", "ICASL", "Corporate level – Audit and Assurance paper"],
    ["Analyst II – BS 221 Audit & Assurance", "AAT / CIMA", "Past finalists or members"], ["Analyst II – BS 221 Audit & Assurance", "ACCA", "Completed Audit & Assurance (AA)"],
    ["Analyst II – PS 201 Business Skills", "CMA", "Completed MBO and MPI"], ["Analyst II – PS 201 Business Skills", "CIMA", "Past finalists or members"], ["Analyst II – PS 201 Business Skills", "ACCA", "Completed Performance Management (PM)"],
    ["Advisory – BS 311 Strategic Management & Entrepreneurship", "ICASL / CIMA / ACCA / CMA", "Past finalists or members"],
  ],
  transition: [   // 2014 curriculum → 2025 curriculum
    ["Diploma P1", "Direct Taxation", "Analyst I · TX 211 Direct Taxation Management"],
    ["Diploma P2", "Indirect Taxation & Other Taxes", "Analyst I · TX 212 Indirect Taxation Management + Analyst II · TX 222 Practical Application of VAT"],
    ["Diploma P3", "Tax Compliance & Principles of Tax Law", "Analyst I · CP 211 Compliance Management"],
    ["Diploma P4", "Computation of Business Profits & Business Law", "Analyst I · BS 212 Business Law"],
    ["Diploma P5", "Accountancy", "Analyst I · BS 211 Accounting for Taxation"],
    ["Professional P1", "Companies", "Analyst II · TX 221 Corporate Taxation"],
    ["Professional P2", "International Taxation", "Advisory · TX 311 International Taxation & Transfer Pricing"],
    ["Professional P3", "Tax Administration & Back Duty", "Analyst II · BS 221 Audit & Assurance for Taxation"],
    ["Professional P4", "Tax Planning & Anti-Avoidance Provision", "Advisory · CP 312 Compliance Risk Management & Validation"],
    ["Professional P5", "Case Study", "—"],
  ],
};
const addWeeks = (d, w) => { const x = new Date(d); x.setDate(x.getDate() + w * 7); return x; };
const dmy = d => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function renderRules() {
  const R = RULES, L = R.levels.map(l => l.level);
  const sel = (id, opts, v) => `<select class="inp" id="${id}">${opts.map(o => `<option ${o === v ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  $("#v-rules").innerHTML = `
    <div class="titlebar"><h1>Rules &amp; fees</h1></div>
    <p class="sub">From the CIT documents — courses, fees, payment plans, exams, renewals, exemptions, the 2025 syllabus and membership.</p>
    <div class="chips-row rnav">${[["r-calc", "Fee calculator"], ["r-courses", "Courses"], ["r-fees", "Fees"], ["r-exam", "Exams"], ["r-renew", "Renewal & re-joining"], ["r-exempt", "Exemptions"], ["r-trans", "Syllabus 2025"], ["r-member", "Membership"], ["r-contact", "Payments & contacts"]].map(([a, t]) => `<button data-go="${a}">${t}</button>`).join("")}</div>

    <section id="r-calc" class="rsec"><div class="h2row"><h2>Course fee calculator</h2></div>
      <div class="card rcalc"><div class="rform">
        <label>Level${sel("cLevel", L, "Analyst 1")}</label>
        <label>Student is${sel("cEntry", ["New to CIT", "Continuing from the previous CIT level", "Joining directly with an exemption"], "New to CIT")}</label>
        <label>Payment${sel("cPay", ["Instalment plan", "Full payment"], "Instalment plan")}</label>
        <label>Registration date<input class="inp" type="date" id="cDate" value="${new Date().toISOString().slice(0, 10)}"></label>
      </div><div id="cOut"></div></div></section>

    <section id="r-courses" class="rsec"><div class="h2row"><h2>Course structure</h2><span class="muted">Application → Analyst I → Analyst II → Advisory → ACIT → FCIT</span></div>
      <div class="rgrid">${R.levels.map((l, i) => `<div class="card rlevel" style="--i:${i}"><div class="rl-h"><span class="rl-n">${i + 1}</span><div><b>${l.level === "Analyst 1" ? "Analyst Level I" : l.level === "Analyst 2" ? "Analyst Level II" : l.level + " Level"}</b><small>${l.months} months · ${l.medium}</small></div></div>
        ${l.subjects.map(([c, n]) => `<div class="rl-s"><span class="code-tag">${c}</span>${esc(n)}</div>`).join("")}
        <div class="rl-c"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:4px"><path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5"/></svg>${esc(l.cert)}</div><small class="k">Entry</small>${l.entry.map(e => `<div class="rl-e">${esc(e)}</div>`).join("")}</div>`).join("")}</div></section>

    <section id="r-fees" class="rsec"><div class="h2row"><h2>Course fees</h2><span class="muted">Rs</span></div>
      <div class="card"><table class="rtable"><tr><th>Level</th><th>Registration</th><th>Course fee</th><th>Exemption fee</th><th>Direct entry total at registration*</th></tr>
        ${L.map(l => { const f = R.fees[l]; return `<tr><td><b>${l}</b></td><td>${f.reg.toLocaleString()}</td><td>${f.course.toLocaleString()}</td><td>${f.exemption ? f.exemption.toLocaleString() : "—"}</td><td>${(f.reg + f.exemption + f.course * f.plan[0][0]).toLocaleString()}</td></tr>`; }).join("")}</table>
        <ul class="rlist"><li>The <b>Rs 3,000 registration fee</b> is paid only once — the first time a student enrols at any level.</li>
          <li>Moving on to the next level after completing the previous one: <b>course fee only</b> (no registration or exemption fee).</li>
          <li>The <b>exemption fee</b> applies when joining a level directly on other qualifications, and is paid in full at registration.</li>
          <li>Subject exemptions have <b>no fee</b>, but the full course fee is still payable.</li>
          <li>Standard policy is the full course fee at registration; instalment plans are offered to support students.</li>
          <li>*Registration + exemption fee + 1st instalment (Payment Procedure 17.07.26).</li></ul></div></section>

    <section id="r-exam" class="rsec"><div class="h2row"><h2>Examinations</h2></div>
      <div class="rgrid2"><div class="card"><table class="rtable"><tr><th>Subjects</th>${L.map(l => `<th>${l}</th>`).join("")}</tr>
        ${[0, 1, 2, 3, 4].map(n => `<tr><td><b>${n + 1}</b></td>${L.map(l => `<td>${R.examFees[l][n] ? R.examFees[l][n].toLocaleString() : "N/A"}</td>`).join("")}</tr>`).join("")}</table></div>
        <div class="card rcalc"><div class="rform"><label>Level${sel("xLevel", L, "Analyst 1")}</label><label>Subjects<select class="inp" id="xN">${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join("")}</select></label>
          <label class="chk"><input type="checkbox" id="xLate"> Late application (+50%)</label><label class="chk"><input type="checkbox" id="xRen"> Add renewal fee (Rs 2,000)</label></div><div id="xOut"></div></div></div>
      <ul class="rlist card" style="padding:14px 18px 14px 34px;margin-top:12px">
        <li><b>First sitting:</b> students must sit all subjects in their first sitting, except subjects they are exempted from.</li>
        <li><b>Referred students</b> (two subjects still to complete) may register for the next level and follow the course, but cannot sit its exam until the two subjects are completed.</li>
        <li>Late applications are accepted for a short period after the closing date with an <b>additional 50%</b> of the exam fee.</li>
        <li>Exam applications go to <b>exam@citsl.lk</b>; a renewal fee of Rs 2,000 (if any) is paid with the exam fee — students registered in the current year don't pay renewal.</li>
        <li>Pay at <b>citsl.lk/payment</b> (Payment → Exam), with the level and purpose in the remarks; write name and SRN on bank slips.</li></ul></section>

    <section id="r-renew" class="rsec"><div class="h2row"><h2>Student renewal &amp; re-joining</h2></div>
      <div class="rgrid2"><div class="card"><table class="rtable"><tr><th colspan="2">Annual student renewal fee</th></tr><tr><td>Before 2023</td><td>Rs 1,000 per year</td></tr><tr><td>From 1.1.2023</td><td>Rs 2,000 per year</td></tr>
          <tr><th colspan="2">Re-joining (batch transfer) fee</th></tr><tr><td>Within 1 year</td><td>Rs 5,000</td></tr><tr><td>Within 2 years of starting</td><td>Rs 7,000</td></tr><tr><td>More than 2 years</td><td>Rs 10,000</td></tr>
          <tr><th colspan="2">Course fee redemption (credit for the old fee)</th></tr><tr><td>Within 2 years</td><td>90%</td></tr><tr><td>2 – 5 years</td><td>70%</td></tr><tr><td>5 – 10 years</td><td>50%</td></tr><tr><td>Informed the institute with a valid reason</td><td>40%</td></tr></table>
          <p class="foot" style="text-align:left">Batch transfer = re-joining after a lapse. Charges: unpaid renewals for the lapsed period + re-joining fee + the difference between the current and the original course fee (+ redemption fee, not defined in the documents).</p></div>
        <div class="card rcalc"><div class="rform"><label>Renewed up to (year)<input class="inp" type="number" id="jUp" value="${new Date().getFullYear() - 2}"></label><label>Course started<input class="inp" type="date" id="jStart" value="${new Date(Date.now() - 2.5 * 365 * 864e5).toISOString().slice(0, 10)}"></label>
          <label>Old course fee paid<input class="inp" type="number" id="jOld" value="40000"></label><label>Current course fee<input class="inp" type="number" id="jNew" value="50000"></label></div><div id="jOut"></div></div></div></section>

    <section id="r-exempt" class="rsec"><div class="h2row"><h2>Exemptions · Curriculum 2025</h2></div>
      <div class="search" style="margin-bottom:10px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="eq" type="search" placeholder="Search a qualification — ACCA, CIMA, AAT, A/L, LLB, HNDA…"></div>
      <div class="card"><table class="rtable" id="eTable"></table></div></section>

    <section id="r-trans" class="rsec"><div class="h2row"><h2>Transition to Syllabus 2025</h2></div>
      <div class="card"><table class="rtable"><tr><th>2014 unit</th><th>Name</th><th>Counts as (2025)</th></tr>${R.transition.map(r => `<tr><td><b>${r[0]}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</table>
        <small class="k">Level-based</small><ul class="rlist">
          <li>Not completed the Diploma: exempt all of Application, unit-wise for Analyst I, plus TX 222 (VAT) in Analyst II.</li>
          <li>Completed the whole Diploma: exempt Application and Analyst I; sit Analyst II (except TX 222) and Advisory.</li>
          <li>Completed the Diploma but not the Professional level: exempt Application, Analyst I and TX 222; unit-wise for Analyst II and Advisory.</li></ul>
        <small class="k">Also</small><ul class="rlist">
          <li>Only <b>passed</b> subjects carry forward — failed, referred or re-referred units don't qualify for unit-wise exemption.</li>
          <li>Registered but didn't follow the course, or attendance under 75%: must attend lectures under the new syllabus before the exam.</li>
          <li>Sat and failed: must attend the new-syllabus lectures before sitting. Referred / re-referred: may attend.</li>
          <li>Syllabuses before 2013 map through the 2013/14 syllabus; anything not linked through 2014 isn't carried into 2025. Special cases go to the Exemption Committee.</li></ul></div></section>

    <section id="r-member" class="rsec"><div class="h2row"><h2>Membership</h2></div>
      <div class="rgrid2"><div class="card"><table class="rtable"><tr><th>Membership year</th><th>Associate (ACIT)</th><th>Fellow (FCIT)</th></tr>
          ${(() => { const R = typeof memberRates === "function" ? memberRates() : {}; return Object.keys(R).sort().reverse().slice(0, 5).map(y => `<tr><td><b>${y}</b></td><td>${rs(R[y].Associate)}</td><td>${rs(R[y].Fellow)}</td></tr>`).join(""); })()}
          <tr><td><b>Entrance fee</b></td><td colspan="2">Rs 15,000 with the Associate application</td></tr></table>
          <p class="foot" style="text-align:left">Edit the rates in Members → Fee rates by year.</p></div>
        <div class="card"><ul class="rlist">
          <li><b>Associate:</b> after passing the Advisory Level exams and the VIVA assessment (or a thesis accepted by Council, for eligible professionals).</li>
          <li><b>Fellow:</b> an Associate for at least 5 years who applies in writing to the Council.</li>
          <li>Application form signed by <b>two sponsors</b> (Fellow, Honorary Fellow or Associate), with the fees and the original payment slip, to the Secretariat; Council approves.</li>
          <li>The membership year runs April – March. "W/O" in the fee report means the fee is waived.</li></ul></div></div></section>

    <section id="r-contact" class="rsec"><div class="h2row"><h2>Payments &amp; contacts</h2></div>
      <div class="card"><div class="crow"><span class="cic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg></span><div><small>Payment gateway</small><a href="https://citsl.lk/payment" target="_blank" rel="noopener">citsl.lk/payment</a></div></div>
        <div class="crow"><span class="cic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/></svg></span><div><small>Bank</small><b>Commercial Bank, Dehiwala · A/C 1580006485 · Chartered Institute of Taxation of Sri Lanka</b></div><button class="cbtn" data-copy3="1580006485">${I.copy}</button></div>
        <div class="crow"><span class="cic">${I.mail}</span><div><small>General / exams</small><b>info@citsl.lk · exam@citsl.lk</b></div></div>
        <div class="crow"><span class="cic">${I.phone}</span><div><small>Course coordinator · Reception</small><b>077 530 8804 · 011 205 5201 / 077 088 4927 · 077 144 8804</b></div></div>
        <div class="crow"><span class="cic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg></span><div><small>Address</small><b>484, Havelock Road, Colombo 06</b></div></div></div></section>`;

  // nav
  $$("#v-rules [data-go]").forEach(b => b.onclick = () => document.getElementById(b.dataset.go).scrollIntoView({ behavior: "smooth", block: "start" }));
  $$("#v-rules [data-copy3]").forEach(b => b.onclick = () => copyText(b.dataset.copy3, "Account number copied"));
  // course fee calculator
  const calc = () => {
    const lv = $("#cLevel").value, f = RULES.fees[lv], entry = $("#cEntry").value, full = $("#cPay").value === "Full payment", d0 = new Date($("#cDate").value || Date.now());
    const continuing = /Continuing/.test(entry), direct = /directly/.test(entry);
    const reg = continuing ? 0 : f.reg, ex = direct && f.exemption ? f.exemption : 0;
    const rows = [];
    if (full) rows.push([d0, "At registration", reg + ex + f.course, [reg && "registration", ex && "exemption", "full course fee"].filter(Boolean).join(" + ")]);
    else f.plan.forEach(([p, w, t], i) => rows.push([addWeeks(d0, w), t, Math.round(f.course * p) + (i === 0 ? reg + ex : 0), i === 0 ? [reg && `registration ${reg.toLocaleString()}`, ex && `exemption ${ex.toLocaleString()}`].filter(Boolean).join(" + ") : ""]));
    const total = rows.reduce((s, r) => s + r[2], 0);
    $("#cOut").innerHTML = `<div class="sched">${rows.map(([d, t, a, n], i) => `<div class="sch" style="--n:${i}"><span class="sch-d">${dmy(d)}</span><span class="sch-t"><b>${esc(t)}</b>${n ? `<small>${esc(n)}</small>` : ""}</span><span class="sch-a">${rs(a)}</span></div>`).join("")}</div>
      <div class="sch-tot"><span>Total for ${lv}</span><b>${rs(total)}</b></div>
      ${direct && lv === "Application" ? `<div class="note">No exemption fee at Application Level.</div>` : ""}${continuing ? `<div class="note">Continuing students pay the course fee only.</div>` : ""}`;
    fx($("#cOut"), ".sch");
  };
  ["cLevel", "cEntry", "cPay", "cDate"].forEach(id => $("#" + id).oninput = $("#" + id).onchange = calc); calc();
  // exam calculator
  const xcalc = () => {
    const lv = $("#xLevel").value, n = +$("#xN").value, base = RULES.examFees[lv][n - 1];
    if (base == null) { $("#xOut").innerHTML = `<div class="note">Application Level has only 4 subjects.</div>`; return; }
    const late = $("#xLate").checked ? base * 0.5 : 0, ren = $("#xRen").checked ? 2000 : 0;
    $("#xOut").innerHTML = `<div class="lg-r"><span>Exam fee (${n} subject${n > 1 ? "s" : ""})</span><b>${rs(base)}</b></div>${late ? `<div class="lg-r"><span>Late fee (50%)</span><b>${rs(late)}</b></div>` : ""}${ren ? `<div class="lg-r"><span>Renewal fee</span><b>${rs(ren)}</b></div>` : ""}<div class="sch-tot"><span>To pay</span><b>${rs(base + late + ren)}</b></div>`;
  };
  ["xLevel", "xN", "xLate", "xRen"].forEach(id => $("#" + id).onchange = xcalc); xcalc();
  // rejoin calculator
  const jcalc = () => {
    const up = +$("#jUp").value || new Date().getFullYear(), now = new Date(), due = [];
    for (let y = up + 1; y <= now.getFullYear(); y++) due.push(y);
    const ren = due.reduce((s, y) => s + CitDocs.RENEWAL_FEE(y), 0);
    const e = CitDocs.rejoinEstimate({ renewalDue: ren, startDate: $("#jStart").value, oldCourseFee: +$("#jOld").value || 0, newCourseFee: +$("#jNew").value || 0 });
    $("#jOut").innerHTML = `<div class="lg-r"><span>Unpaid renewals ${due.length ? "(" + due.join(", ") + ")" : ""}</span><b>${rs(ren)}</b></div>
      <div class="lg-r"><span>Re-joining fee ${e.years != null ? "(" + e.years.toFixed(1) + " yrs)" : ""}</span><b>${rs(e.rejoinFee)}</b></div>
      <div class="lg-r"><span>Course fee difference (new − ${e.redemptionRate != null ? Math.round(e.redemptionRate * 100) : "?"}% of old)</span><b>${e.courseDiff != null ? rs(e.courseDiff) : "—"}</b></div>
      <div class="sch-tot"><span>Estimated total</span><b>${rs(e.total)}</b></div>`;
  };
  ["jUp", "jStart", "jOld", "jNew"].forEach(id => $("#" + id).oninput = jcalc); jcalc();
  // exemptions
  const etable = () => {
    const q = norm($("#eq").value), rows = RULES.exemptions.filter(r => !q || norm(r.join(" ")).split(" ").some(() => q.split(" ").every(t => norm(r.join(" ")).includes(t))));
    $("#eTable").innerHTML = `<tr><th>Exemption from</th><th>Qualification</th><th>Criteria</th></tr>` + (rows.map(r => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No match</td></tr>`);
  };
  $("#eq").oninput = etable; etable();
  fx($("#v-rules"), ".none");
}

/* navigation: Rules is reached from the top bar and from Lookup */
$(".topbar").insertAdjacentHTML("beforeend", "");
$("#themeBtn").insertAdjacentHTML("beforebegin", `<button class="iconbtn" id="rulesBtn" aria-label="Rules & fees" title="Rules & fees" style="margin-left:auto;margin-right:8px"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M9 7h6M9 11h6"/></svg></button>`);
$("#rulesBtn").onclick = () => tab("rules");
const _tabR = tab;
tab = function (name) {
  if (name !== "rules") { $("#v-rules").classList.add("hide"); return _tabR(name); }
  $$("main > .view").forEach(v => v.classList.add("hide")); $("#v-rules").classList.remove("hide");
  currentTab = "rules"; $$(".tabbar button").forEach(b => b.classList.remove("on")); moveGlider(); $(".tabbar .glider").style.width = "0px";
  scrollTo({ top: 0 }); try { sessionStorage.setItem("tab", "rules"); } catch { }
  renderRules();
};
$$(".tabbar button").forEach(b => b.onclick = () => tab(b.dataset.tab));
const _renderHome = renderHome;
renderHome = function () {
  _renderHome();
  $("#hhint").insertAdjacentHTML("beforeend", ` · <button class="link" id="toRules">Rules &amp; fees</button>`);
  $("#toRules").onclick = () => tab("rules");
};
