/* CIT Student Hub — Xero on the Vercel site. Same endpoints the office app has, so the page works the same:
     /xero/connect, /xero/callback (rewritten to /api/xero/…), /api/xero/status, /api/xero/outstanding,
     /api/xero/disconnect, and /api/xero/cron (Vercel Cron, keeps the connection alive every day).
   Live updates: the copy in storage is re-read from Xero whenever it is older than XERO_SYNC_MINUTES (default 10)
   and someone has the site open (the page asks every 2 minutes). */
"use strict";
const createXero = require("../../lib/xero-api");
const store = require("../../lib/kv");
const { authed } = require("../../lib/auth");

const EVERY = Math.max(2, +process.env.XERO_SYNC_MINUTES || 10) * 60e3;
const json = (res, code, body) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
const go = (res, to) => { res.statusCode = 302; res.setHeader("Location", to); res.setHeader("Cache-Control", "no-store"); res.end(); };

module.exports = async (req, res) => {
  const action = String(req.query.action || "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const X = createXero({
    id: process.env.XERO_CLIENT_ID, secret: process.env.XERO_CLIENT_SECRET,
    redirect: process.env.XERO_REDIRECT_URI || `https://${host}/xero/callback`,
    scopes: process.env.XERO_SCOPES, tenantName: process.env.XERO_TENANT_NAME, store, log: m => console.log(m),
  });
  try {
    if (action === "cron") {   // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
      if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return json(res, 401, { error: "Unauthorized" });
      const s = await X.status();
      if (s.connected) await X.sync();
      return json(res, 200, { ok: true, connected: s.connected });
    }
    if (!authed(req)) return json(res, 401, { error: "Sign in first" });   // middleware.js already checks; this is a second lock
    if (action === "status") return json(res, 200, { ...(await X.status()), autoEveryMin: EVERY / 60e3, storage: store.ready, site: "vercel" });
    if (action === "connect") {
      if (!X.configured) return json(res, 400, { error: "Add XERO_CLIENT_ID and XERO_CLIENT_SECRET in Vercel → Settings → Environment Variables, then redeploy" });
      return go(res, await X.authUrl());
    }
    if (action === "callback") {
      let msg = "connected";
      try { await X.callback(req.query); } catch (e) { msg = "error:" + e.message; }
      return go(res, "/?xero=" + encodeURIComponent(msg));
    }
    if (action === "disconnect" && req.method === "POST") { await X.disconnect(); return json(res, 200, { ok: true }); }
    if (action === "outstanding") return json(res, 200, { ...(await X.outstanding({ force: "refresh" in req.query, maxAgeMs: EVERY })), autoEveryMin: EVERY / 60e3 });
    return json(res, 404, { error: "Not found" });
  } catch (e) {
    console.error("[xero]", action, e.message);
    return json(res, 500, { ok: false, error: e.message });
  }
};
