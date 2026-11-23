/* CIT Student Hub — Xero for the office app (npm start). The Xero logic itself is in lib/xero-api.js and is
 * shared with the Vercel site (api/xero). Here the connection is kept in ./xero-tokens.json on this computer
 * (excluded from git and never served) and the app re-reads Xero every XERO_SYNC_MINUTES (default 10).
 *
 * .env:  XERO_CLIENT_ID, XERO_CLIENT_SECRET
 *        XERO_REDIRECT_URI (default http://localhost:<PORT>/xero/callback — must match the Xero app exactly)
 *        XERO_SCOPES, XERO_TENANT_NAME, XERO_SYNC_MINUTES (optional)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const createXero = require("./lib/xero-api");

function fileStore(file) {
  const mem = new Map();   // key → { v, exp }
  try { const t = JSON.parse(fs.readFileSync(file, "utf8")); if (t?.refresh) mem.set("tok", { v: t, exp: 0 }); } catch { }
  const live = k => { const e = mem.get(k); if (!e) return undefined; if (e.exp && Date.now() > e.exp) { mem.delete(k); return undefined; } return e; };
  const persist = () => { const t = mem.get("tok")?.v; if (t) fs.writeFileSync(file, JSON.stringify(t, null, 2), { mode: 0o600 }); else try { fs.unlinkSync(file); } catch { } };
  return {
    async get(k) { return live(k)?.v ?? null; },
    async set(k, v, ttl) { mem.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 }); if (k === "tok") persist(); },
    async del(k) { mem.delete(k); if (k === "tok") persist(); },
    async setNX(k, v, ttl) { if (live(k)) return false; mem.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 }); return true; },
  };
}

module.exports = function xero({ ROOT, PORT, send }) {
  const X = createXero({
    id: process.env.XERO_CLIENT_ID, secret: process.env.XERO_CLIENT_SECRET,
    redirect: process.env.XERO_REDIRECT_URI || `http://localhost:${PORT}/xero/callback`,
    scopes: process.env.XERO_SCOPES, tenantName: process.env.XERO_TENANT_NAME,
    store: fileStore(path.join(ROOT, "xero-tokens.json")), log: m => console.log("  " + m),
  });
  const EVERY = Math.max(2, +process.env.XERO_SYNC_MINUTES || 10) * 60e3;
  const tick = async () => { if ((await X.status()).connected) X.sync().catch(() => { }); };
  setInterval(tick, EVERY).unref();
  setTimeout(tick, 3000).unref();
  const local = req => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || "");

  /* returns true when the request was handled */
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/xero") && !url.pathname.startsWith("/xero/")) return false;
    if (!local(req)) { send(res, 403, { error: "Xero is only available on this computer" }); return true; }
    const p = url.pathname.replace(/^\/api\/xero\//, "/xero/");
    if (p === "/xero/status") { send(res, 200, { ...(await X.status()), autoEveryMin: EVERY / 60e3 }); return true; }
    if (p === "/xero/connect") {
      if (!X.configured) { send(res, 400, "Add XERO_CLIENT_ID and XERO_CLIENT_SECRET to .env and restart npm start.", "text/plain; charset=utf-8"); return true; }
      res.writeHead(302, { Location: await X.authUrl() }); res.end(); return true;
    }
    if (p === "/xero/callback") {
      let msg = "connected";
      try { await X.callback(Object.fromEntries(url.searchParams)); } catch (e) { console.error("[xero]", e.message); msg = "error:" + e.message; }
      res.writeHead(302, { Location: "/?xero=" + encodeURIComponent(msg) }); res.end(); return true;
    }
    if (req.method === "POST" && p === "/xero/disconnect") { await X.disconnect(); send(res, 200, { ok: true }); return true; }
    if (p === "/xero/outstanding") {
      send(res, 200, { ...(await X.outstanding({ force: url.searchParams.has("refresh"), maxAgeMs: EVERY + 60e3 })), autoEveryMin: EVERY / 60e3 });
      return true;
    }
    send(res, 404, { error: "Not found" });
    return true;
  };
};
