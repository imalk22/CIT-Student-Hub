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

/* "Download all" → ZIP, one PDF per student named by student number */
async function downloadAllCards(e, list = e.candidates) {
  if (!list.length) return toast("No candidates yet");
  await checkServer();
  let stop = false;
  openSheet(`<div class="bar-top"><b style="font-size:17px">Download all admission cards</b>${closeBtn}</div>
    <p class="muted" style="margin-top:0">${plural(list.length, "card")} · one PDF per student, named by student number, in one ZIP file.</p>
    <div class="card sendbox"><div class="sendtop"><b id="zT">Preparing…</b><button class="link danger" id="zStop">Stop</button></div><div class="rvprog"><i id="zBar"></i></div><div class="sglist" id="zList"></div></div>`);
  $("#zStop").onclick = () => { stop = true; $("#zT").textContent = "Stopping…"; };
  try {
    await loadLib("jszip");
    const zip = new window.JSZip(), used = new Set();
    let done = 0, bad = 0;
    for (const c of list) {
      if (stop || !$("#sheet").classList.contains("on")) break;
      const name = cardFileName(c, used);
      $("#zT").textContent = `Making ${done + 1} of ${list.length} · ${name}`;
      try { zip.file(name, await cardPdfBlob(e, c)); }
      catch (err) { bad++; $("#zList").insertAdjacentHTML("afterbegin", `<div class="sgrow"><span class="baddot">!</span><b>${esc(c.name)}</b><span class="danger">${esc(err.message)}</span></div>`); if (/load the PDF tools/.test(err.message)) break; }
      done++; $("#zBar").style.width = (100 * done / list.length) + "%";
    }
    const ok = done - bad;
    if (!ok) { $("#zT").textContent = "Nothing was made."; return; }
    $("#zT").textContent = "Packing the ZIP…";
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const zipName = `Admission cards - ${String(e.heading || e.level).replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.zip`;
    download(zipName, blob);
    $("#zT").textContent = `Downloaded ${plural(ok, "card")}${bad ? ` · ${bad} failed` : ""}${done < list.length ? ` · ${list.length - done} skipped (stopped)` : ""}`;
    $("#zStop").remove();
    toast(`${zipName} downloaded`);
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
