/* CIT Student Hub — local server.
 * Serves the web app, turns admission cards into real PDFs (using the installed Edge/Chrome),
 * and emails them over SMTP. Without SMTP settings it runs in TEST MODE: every email is
 * saved to ./outbox as a .eml file plus the PDF, and nothing leaves this computer.
 *
 * Start:  npm start      (then open http://localhost:5173)
 * Email:  copy .env.example to .env and fill in the SMTP details.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
loadEnv(path.join(ROOT, ".env"));
const PORT = +process.env.PORT || 5173;
const HOST = process.env.HOST || "127.0.0.1";
const OUTBOX = path.join(ROOT, "outbox");

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/* ---------- mail ---------- */
const nodemailer = require("nodemailer");
// Microsoft 365 via Microsoft Graph (app registration, client-credentials). Preferred for Exchange Online.
const GRAPH = !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_SENDER);
const SMTP = !GRAPH && !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const LIVE = GRAPH || SMTP;
const MODE = GRAPH ? "graph" : SMTP ? "smtp" : "test";
const FROM = GRAPH ? (process.env.MAIL_FROM_NAME ? `${process.env.MAIL_FROM_NAME} <${process.env.MS_SENDER}>` : process.env.MS_SENDER)
  : process.env.MAIL_FROM || process.env.SMTP_USER || "CIT Examinations <exams@localhost>";
const transport = SMTP
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || +process.env.SMTP_PORT === 465,
    requireTLS: +(process.env.SMTP_PORT || 587) === 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, pool: true, maxConnections: 2, maxMessages: 50,
  })
  : nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });

let graphToken = null;   // { value, exp }
async function getGraphToken() {
  if (graphToken && Date.now() < graphToken.exp - 60e3) return graphToken.value;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Microsoft sign-in failed: " + (j.error_description || j.error || r.statusText).split("\r\n")[0]);
  graphToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return graphToken.value;
}
async function sendViaGraph({ to, cc, subject, text, html, files }) {
  const token = await getGraphToken();
  const message = {
    subject, body: html ? { contentType: "HTML", content: html } : { contentType: "Text", content: text || "" },
    toRecipients: [{ emailAddress: { address: to } }],
    ccRecipients: cc ? [{ emailAddress: { address: cc } }] : [],
    attachments: files.map(f => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: f.filename, contentType: f.contentType, contentBytes: f.content.toString("base64") })),
  };
  if (process.env.MAIL_REPLY_TO) message.replyTo = [{ emailAddress: { address: process.env.MAIL_REPLY_TO } }];
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MS_SENDER)}/sendMail`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }),
    });
    if (r.status === 202) return;
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {   // throttled: wait and retry
      await new Promise(ok => setTimeout(ok, 1000 * (+r.headers.get("retry-after") || 2 ** attempt * 2)));
      continue;
    }
    const j = await r.json().catch(() => ({}));
    const msg = j.error?.message || r.statusText;
    if (r.status === 403) throw new Error(`Microsoft refused to send as ${process.env.MS_SENDER} (needs Mail.Send application permission with admin consent): ${msg}`);
    if (r.status === 404) throw new Error(`Mailbox ${process.env.MS_SENDER} not found in this tenant: ${msg}`);
    throw new Error(`Microsoft Graph error ${r.status}: ${msg}`);
  }
}

/* ---------- pdf ---------- */
const BROWSERS = [
  process.env.BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge",
].filter(Boolean);
const BROWSER = BROWSERS.find(p => { try { return fs.existsSync(p); } catch { return false; } });
let browserP = null;
function browser() {
  if (!BROWSER) throw new Error("No Edge or Chrome found. Set BROWSER_PATH in .env.");
  if (!browserP) {
    browserP = require("puppeteer-core").launch({ executablePath: BROWSER, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
    browserP.then(b => b.on("disconnected", () => { browserP = null; })).catch(() => { browserP = null; });
  }
  return browserP;
}
async function makePdf(pagesHtml) {
  const b = await browser();
  const page = await b.newPage();
  try {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><base href="http://127.0.0.1:${PORT}/">
      <link rel="stylesheet" href="styles.css"></head><body><div id="print-root">${pagesHtml}</div></body></html>`;
    await page.setContent(doc, { waitUntil: "networkidle0", timeout: 30000 });
    await page.emulateMediaType("print");
    return Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));   // puppeteer returns Uint8Array
  } finally { await page.close().catch(() => { }); }
}

/* ---------- helpers ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8" };
const BLOCK = /^(node_modules|outbox|data-files|_test|ref\/|\.env|server\.js|xero-server\.js|xero-tokens|package(-lock)?\.json|\.git|api\/|lib\/|middleware\.js|vercel\.json)/i;
function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readJson(req, limit = 25e6) {
  return new Promise((ok, bad) => {
    let n = 0; const chunks = [];
    req.on("data", c => { n += c.length; if (n > limit) { bad(new Error("Request too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { bad(e); } });
    req.on("error", bad);
  });
}
const safeName = s => String(s || "file").replace(/[^\w.@-]+/g, "_").slice(0, 80);
const isEmail = s => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || "").trim());
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

// Exchange Online allows ~30 messages/minute per mailbox: keep live sends at least 2.1 s apart.
const GAP = +(process.env.MAIL_GAP_MS || 2100);
let nextSlot = 0;
function pace() { const now = Date.now(), at = Math.max(now, nextSlot); nextSlot = at + GAP; return new Promise(ok => setTimeout(ok, at - now)); }

async function sendMail({ to, cc, subject, text, html, attachments = [] }) {
  if (!isEmail(to)) throw new Error(`Invalid email address: ${to || "(empty)"}`);
  if (LIVE) await pace();
  const files = [];
  for (const a of attachments) files.push({ filename: a.filename || "admission.pdf", content: a.html ? await makePdf(a.html) : Buffer.from(a.base64 || "", "base64"), contentType: "application/pdf" });
  cc = cc && isEmail(cc) ? String(cc).trim() : undefined;
  if (GRAPH) { await sendViaGraph({ to: String(to).trim(), cc, subject, text, html, files }); return { ok: true, mode: "graph" }; }
  const msg = { from: FROM, to: String(to).trim(), cc, replyTo: process.env.MAIL_REPLY_TO || undefined, subject, text, html, attachments: files };
  const info = await transport.sendMail(msg);
  if (SMTP) return { ok: true, mode: "smtp", id: info.messageId };
  const dir = path.join(OUTBOX, `${stamp()}_${safeName(to)}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "message.eml"), info.message);
  for (const f of files) fs.writeFileSync(path.join(dir, safeName(f.filename)), f.content);
  return { ok: true, mode: "test", saved: path.relative(ROOT, dir) };
}

/* ---------- citsl.lk member directory ---------- */
let citslCache = null;
async function citslMembers(force) {
  if (!force && citslCache && Date.now() - citslCache.at < 6 * 3600e3) return citslCache.data;
  const pages = [["fellow-members", "Fellow"], ["associate-members", "Associate"]], members = [];
  try {
    for (const [p, type] of pages) {
      const r = await fetch(`https://citsl.lk/${p}`, { headers: { "User-Agent": "Mozilla/5.0 (CIT Student Hub)" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`citsl.lk ${p}: HTTP ${r.status}`);
      const html = await r.text();
      const re = /<img class="img-fluid" src="([^"]+)">\s*<\/div>\s*<div class="team-info">\s*<span class="team-name[^"]*">\s*([\s\S]*?)<\/span>\s*<p[^>]*>\s*Member No:\s*([\s\S]*?)<\/p>/g;
      for (const m of html.matchAll(re)) {
        const raw = m[3].trim().toUpperCase().replace(/[\s-]/g, ""), mm = raw.match(/^([FA])0*(\d+)$/);
        members.push({ type, no: mm ? mm[1] + mm[2].padStart(3, "0") : raw, name: m[2].replace(/\s+/g, " ").trim(), photo: /profile_01/.test(m[1]) ? "" : m[1] });
      }
    }
    if (members.length < 50) throw new Error("citsl.lk page layout changed");
    citslCache = { at: Date.now(), data: { source: "https://citsl.lk", fetched: new Date().toISOString().slice(0, 10), live: true, members } };
    return citslCache.data;
  } catch (e) {
    console.error("[citsl]", e.message);
    const saved = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "citsl-members.json"), "utf8"));
    return { ...saved, live: false, error: e.message };
  }
}

/* ---------- Xero (read-only: outstanding invoices) ---------- */
const xeroHandle = require("./xero-server")({ ROOT, PORT, send });

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (await xeroHandle(req, res, url)) return;
    if (url.pathname === "/api/health") {
      return send(res, 200, { ok: true, mode: MODE, from: FROM, pdf: !!BROWSER, outbox: LIVE ? null : "outbox" });
    }
    if (url.pathname === "/api/seed" || url.pathname.startsWith("/api/seed/")) {   // private data files, this computer only
      const ip = req.socket.remoteAddress || "";
      if (!/^(::1|127\.|::ffff:127\.)/.test(ip)) return send(res, 403, { error: "Data files are only available on this computer" });
      const dir = path.join(ROOT, "data-files");
      if (!fs.existsSync(dir)) return send(res, 200, { files: [] });
      if (url.pathname === "/api/seed") {
        const files = fs.readdirSync(dir).filter(f => /\.(xlsx|xls)$/i.test(f) && !f.startsWith("~$"))
          .map(f => { const st = fs.statSync(path.join(dir, f)); return { name: f, size: st.size, mtime: st.mtimeMs }; });
        return send(res, 200, { files });
      }
      const name = path.basename(decodeURIComponent(url.pathname.slice("/api/seed/".length)));
      const file = path.join(dir, name);
      if (!fs.existsSync(file)) return send(res, 404, { error: "Not found" });
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname === "/api/citsl-members") {   // live names + photos from citsl.lk (cached 6 h)
      return send(res, 200, await citslMembers(url.searchParams.has("refresh")));
    }
    if (url.pathname === "/api/mail-check") {   // signs in to Microsoft without sending anything
      if (!GRAPH) return send(res, 200, { ok: true, mode: MODE, note: "Not using Microsoft Graph" });
      graphToken = null;   // always sign in fresh so a wrong/expired secret shows up
      await getGraphToken();
      return send(res, 200, { ok: true, mode: MODE, note: "Signed in to Microsoft 365" });
    }
    if (req.method === "POST" && url.pathname === "/api/pdf") {
      const { html, filename } = await readJson(req);
      const pdf = await makePdf(html);
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${safeName(filename || "admission.pdf")}"`, "Cache-Control": "no-store" });
      return res.end(pdf);
    }
    if (req.method === "POST" && url.pathname === "/api/send") {
      const body = await readJson(req);
      return send(res, 200, await sendMail(body));
    }
    if (req.method === "POST" && url.pathname === "/api/test-email") {
      const { to } = await readJson(req);
      return send(res, 200, await sendMail({ to, subject: "CIT Student Hub — test email", text: "This is a test email from CIT Student Hub. Email sending works." }));
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "Method not allowed" });
    // static files
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    if (BLOCK.test(rel) || rel.includes("..")) return send(res, 404, "Not found", "text/plain");
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error("[error]", url.pathname, e.message);
    send(res, 500, { ok: false, error: e.message });
  }
});
server.listen(PORT, HOST, () => {
  console.log(`\n  CIT Student Hub  →  http://localhost:${PORT}`);
  console.log(`  Email: ${GRAPH ? "Microsoft 365 (Graph) as " + FROM : SMTP ? "SMTP " + process.env.SMTP_HOST + " as " + FROM : "TEST MODE — emails are saved to ./outbox (add Microsoft 365 or SMTP settings to .env to send for real)"}`);
  if (GRAPH) getGraphToken().then(() => console.log("  Microsoft 365: signed in OK\n")).catch(e => console.log("  Microsoft 365: " + e.message + "\n"));
  console.log(`  PDF:   ${BROWSER || "no browser found — set BROWSER_PATH"}`);
  console.log(`  Xero:  ${process.env.XERO_CLIENT_ID ? (fs.existsSync(path.join(ROOT, "xero-tokens.json")) ? "connected (read-only)" : "set up — open Finance → Connect to Xero") : "not set up (see README → Xero setup)"}\n`);
});
process.on("SIGINT", async () => { try { (await browserP)?.close(); } catch { } process.exit(0); });
