/* CIT Student Hub — admission card PDFs made in the browser (works on the Vercel site, no server needed),
   one-click "Download all" as a ZIP with one PDF per student named by student number, and the PDF that is
   attached when cards are emailed from the website. When the office app's server is running, its sharper
   PDF maker is used instead. */
"use strict";
const LIBS = {
  html2canvas: "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  jspdf: "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
};
const _libs = {};
function loadLib(name) {
  return _libs[name] ||= new Promise((ok, bad) => {
    const s = document.createElement("script"); s.src = LIBS[name]; s.async = true;
    s.onload = ok; s.onerror = () => { delete _libs[name]; bad(new Error("Couldn't load the PDF tools — check the internet connection")); };
    document.head.appendChild(s);
  });
}

/* "2026/01/3035" → "2026-01-3035.pdf" (falls back to index no, then name) */
function cardFileName(c, used) {
  const base = String(c.sid || c.index || c.name || "admission-card").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").replace(/^-+|-+$/g, "") || "admission-card";
  let name = base + ".pdf", n = 2;
  if (used) { while (used.has(name.toLowerCase())) name = `${base} (${n++}).pdf`; used.add(name.toLowerCase()); }
  return name;
}

/* render A4 card pages (HTML strings) → PDF Blob, in the browser */
async function pagesToPdf(pages) {
  await Promise.all([loadLib("html2canvas"), loadLib("jspdf")]);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;background:#fff;z-index:-1";
  host.innerHTML = pages.join("");
  document.body.appendChild(host);
  try {
    await Promise.all($$("img", host).map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
    if (document.fonts?.ready) await document.fonts.ready;
    const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    const els = $$(".page", host);
    for (let i = 0; i < els.length; i++) {
      const canvas = await window.html2canvas(els[i], { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
      if (i) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    }
    return pdf.output("blob");
  } finally { host.remove(); }
}

/* one candidate's card as a PDF Blob — office server if available, otherwise in the browser */
async function cardPdfBlob(e, c) {
  if (SERVER?.pdf) {
    const r = await fetch("/api/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ html: cardPages(e, c).join(""), filename: "card.pdf" }) });
    if (r.ok) return await r.blob();
  }
  return pagesToPdf(cardPages(e, c));
}
const blobToBase64 = b => new Promise((ok, bad) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = bad; f.readAsDataURL(b); });

/* "Download all" → a separate PDF for every student, named by student number, saved straight to Downloads
   (or, if chosen, the same separate PDFs packed in one ZIP). Never one combined PDF. */
async function downloadAllCards(e, list = e.candidates, mode) {
  if (!list.length) return toast("No candidates yet");
  await checkServer();
  if (!mode) {   // ask how to save them
    openSheet(`<div class="bar-top"><b style="font-size:17px">Download all admission cards</b>${closeBtn}</div>
      <p class="muted" style="margin-top:0">${plural(list.length, "student")} · a separate PDF for each student, named by student number (e.g. <b>${esc(cardFileName(list[0]))}</b>).</p>
      <div class="typecards">
        <button class="typecard on" data-m="files"><span class="ic" style="background:var(--blue)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 13h7M9 17h7"/></svg></span><b>Separate PDF files</b><span>${plural(list.length, "PDF")} saved straight to your Downloads folder. If the browser asks “download multiple files”, choose <b>Allow</b>.</span></button>
        <button class="typecard" data-m="zip"><span class="ic" style="background:var(--purple)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M12 4v4M12 10v2M12 14v2"/></svg></span><b>One ZIP file</b><span>The same separate PDFs packed in one ZIP — handy for emailing or sharing.</span></button>
      </div>
      <div class="actions" style="justify-content:flex-end"><button class="btn primary" id="dlGo">Download ${plural(list.length, "PDF")}</button></div>`);
    let m = "files";
    $("#sheet .typecards").onclick = ev => { const b = ev.target.closest("[data-m]"); if (!b) return; m = b.dataset.m; $$("#sheet .typecard").forEach(x => x.classList.toggle("on", x === b)); $("#dlGo").textContent = m === "zip" ? `Download ZIP (${plural(list.length, "PDF")})` : `Download ${plural(list.length, "PDF")}`; };
    $("#dlGo").onclick = () => downloadAllCards(e, list, m);
    return;
  }
  let stop = false;
  openSheet(`<div class="bar-top"><b style="font-size:17px">Download all admission cards</b>${closeBtn}</div>
    <p class="muted" style="margin-top:0">${plural(list.length, "student")} · ${mode === "zip" ? "separate PDFs in one ZIP file" : "separate PDF files, saved to Downloads"} · named by student number.</p>
    <div class="card sendbox"><div class="sendtop"><b id="zT">Preparing…</b><button class="link danger" id="zStop">Stop</button></div><div class="rvprog"><i id="zBar"></i></div><div class="sglist" id="zList"></div></div>`);
  $("#zStop").onclick = () => { stop = true; $("#zT").textContent = "Stopping…"; };
  const row = (ok, c, text) => $("#zList")?.insertAdjacentHTML("afterbegin", `<div class="sgrow"><span class="${ok ? "okdot" : "baddot"}">${ok ? "✓" : "!"}</span><b>${esc(c.name)}</b><span class="${ok ? "muted" : "danger"}">${esc(text)}</span></div>`);
  try {
    let zip = null;
    if (mode === "zip") { await loadLib("jszip"); zip = new window.JSZip(); }
    const used = new Set();
    let done = 0, bad = 0;
    for (const c of list) {
      if (stop || !$("#sheet").classList.contains("on")) break;
      const name = cardFileName(c, used);
      $("#zT").textContent = `Making ${done + 1} of ${list.length} · ${name}`;
      try {
        const blob = await cardPdfBlob(e, c);
        if (zip) zip.file(name, blob);
        else { download(name, blob); await new Promise(r => setTimeout(r, 350)); }   // a short gap so the browser keeps every file
        row(true, c, name);
      } catch (err) { bad++; row(false, c, err.message); if (/load the PDF tools/.test(err.message)) break; }
      done++; if ($("#zBar")) $("#zBar").style.width = (100 * done / list.length) + "%";
    }
    const ok = done - bad, tail = `${bad ? ` · ${bad} failed` : ""}${done < list.length ? ` · ${list.length - done} skipped (stopped)` : ""}`;
    if (!ok) { $("#zT").textContent = "Nothing was made."; return; }
    if (zip) {
      $("#zT").textContent = "Packing the ZIP…";
      const zipName = `Admission cards - ${String(e.heading || e.level).slice(0, 80)}.zip`;
      download(zipName, await zip.generateAsync({ type: "blob", compression: "STORE" }));
      $("#zT").textContent = `Downloaded a ZIP with ${plural(ok, "PDF")}${tail}`;
    } else $("#zT").textContent = `Saved ${plural(ok, "separate PDF")} to Downloads${tail}`;
    $("#zStop")?.remove();
    toast(zip ? "ZIP downloaded" : `${plural(ok, "PDF")} downloaded`);
  } catch (err) { $("#zT").textContent = err.message; toast(err.message); }
}

/* a single card, named by student number */
async function downloadOneCard(e, c) {
  await checkServer();
  busy(true);
  try { download(cardFileName(c), await cardPdfBlob(e, c)); toast("PDF downloaded"); }
  catch (err) { toast("PDF failed: " + err.message); }
  finally { busy(false); }
}
