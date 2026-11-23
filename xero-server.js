/* CIT Student Hub — Xero connection (runs in the local server only; never on Vercel).
 *
 * Uses Xero's OAuth 2.0 "Web app" flow: someone with access to the CIT Xero organisation clicks
 * "Connect to Xero" once, signs in at Xero and allows read-only access. The refresh token is kept in
 * ./xero-tokens.json on this computer (excluded from git and never served), so the app stays connected.
 *
 * Reads only: outstanding sales invoices (Accounts Receivable, status AUTHORISED = awaiting payment)
 * and the contacts on them. Nothing is written to Xero.
 *
 * .env:  XERO_CLIENT_ID, XERO_CLIENT_SECRET
 *        XERO_REDIRECT_URI (default http://localhost:<PORT>/xero/callback — must match the Xero app exactly)
 *        XERO_SCOPES       (default "offline_access accounting.invoices.read accounting.contacts.read")
 *        XERO_TENANT_NAME  (optional: which organisation to use if the login can see several)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function xero({ ROOT, PORT, send }) {
  const ID = process.env.XERO_CLIENT_ID, SECRET = process.env.XERO_CLIENT_SECRET;
  const REDIRECT = process.env.XERO_REDIRECT_URI || `http://localhost:${PORT}/xero/callback`;
  const SCOPES = process.env.XERO_SCOPES || "offline_access accounting.invoices.read accounting.contacts.read";
  const FILE = path.join(ROOT, "xero-tokens.json");
  const CONFIGURED = !!(ID && SECRET);
  const states = new Map();   // OAuth state → created at
  let tok = null;             // { access, exp, refresh, tenantId, tenantName, connectedAt }
  let cache = null;           // { at, data }

  try { tok = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { tok = null; }
  const persist = () => { if (tok) fs.writeFileSync(FILE, JSON.stringify(tok, null, 2), { mode: 0o600 }); else try { fs.unlinkSync(FILE); } catch { } };
  const basic = () => "Basic " + Buffer.from(`${ID}:${SECRET}`).toString("base64");
  const local = req => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || "");

  async function tokenRequest(params) {
    const r = await fetch("https://identity.xero.com/connect/token", {
      method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Xero sign-in failed: " + (j.error_description || j.error || r.statusText));
    return j;
  }
  async function accessToken() {
    if (!tok?.refresh) throw new Error("Not connected to Xero — click Connect to Xero first");
    if (tok.access && Date.now() < tok.exp - 60e3) return tok.access;
    let j;
    try { j = await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh }); }
    catch (e) { if (/invalid_grant/i.test(e.message)) { tok = null; persist(); throw new Error("The Xero connection expired (60 days unused, or access was removed) — connect again"); } throw e; }
    Object.assign(tok, { access: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1000, refresh: j.refresh_token || tok.refresh });
    persist();
    return tok.access;
  }
  async function api(pathAndQuery) {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch("https://api.xero.com/api.xro/2.0/" + pathAndQuery, {
        headers: { Authorization: "Bearer " + await accessToken(), "xero-tenant-id": tok.tenantId, Accept: "application/json" }, signal: AbortSignal.timeout(60000),
      });
      if (r.status === 429 && attempt < 4) { await new Promise(ok => setTimeout(ok, 1000 * (+r.headers.get("retry-after") || 5))); continue; }
      if (r.status === 401 && attempt < 1) { tok.access = null; continue; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Xero ${r.status}: ${j.Detail || j.Message || j.Title || r.statusText}${r.status === 403 ? " (check the app's scopes / that this login can see the organisation)" : ""}`);
      return j;
    }
  }

  /* outstanding receivables, with contact numbers + emails, in a compact shape */
  async function outstanding() {
    const invoices = [], size = 500;
    for (let page = 1; page < 200; page++) {
      const j = await api(`Invoices?page=${page}&pageSize=${size}&Statuses=AUTHORISED&where=${encodeURIComponent('Type=="ACCREC"')}`);
      const list = j.Invoices || [];
      invoices.push(...list.filter(i => +i.AmountDue > 0));
      if (list.length < size) break;
    }
    const ids = [...new Set(invoices.map(i => i.Contact?.ContactID).filter(Boolean))], contacts = new Map();
    for (let k = 0; k < ids.length; k += 40) {
      const j = await api(`Contacts?IDs=${ids.slice(k, k + 40).join(",")}&summaryOnly=true`);
      for (const c of j.Contacts || []) contacts.set(c.ContactID, c);
    }
    const day = s => String(s || "").slice(0, 10);
    return {
      tenant: tok.tenantName, syncedAt: Date.now(),
      invoices: invoices.map(i => {
        const c = contacts.get(i.Contact?.ContactID) || i.Contact || {};
        return {
          id: i.InvoiceID, number: i.InvoiceNumber || "", reference: i.Reference || "", date: day(i.DateString), dueDate: day(i.DueDateString),
          total: +i.Total || 0, paid: +i.AmountPaid || 0, due: +i.AmountDue || 0, currency: i.CurrencyCode || "",
          lines: (i.LineItems || []).map(l => String(l.Description || "")).filter(Boolean).slice(0, 6),
          contact: { id: c.ContactID || "", name: c.Name || i.Contact?.Name || "", accountNumber: c.AccountNumber || "", contactNumber: c.ContactNumber || "", email: c.EmailAddress || "" },
        };
      }),
    };
  }

  /* returns true when the request was handled */
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith("/api/xero") && !url.pathname.startsWith("/xero/")) return false;
    if (!local(req)) { send(res, 403, { error: "Xero is only available on this computer" }); return true; }

    if (url.pathname === "/api/xero/status") {
      send(res, 200, { configured: CONFIGURED, connected: !!tok?.refresh, tenant: tok?.tenantName || "", connectedAt: tok?.connectedAt || 0, redirect: REDIRECT, scopes: SCOPES });
      return true;
    }
    if (url.pathname === "/xero/connect") {
      if (!CONFIGURED) { send(res, 400, "Add XERO_CLIENT_ID and XERO_CLIENT_SECRET to .env and restart npm start.", "text/plain; charset=utf-8"); return true; }
      const state = crypto.randomBytes(16).toString("hex"); states.set(state, Date.now());
      const q = new URLSearchParams({ response_type: "code", client_id: ID, redirect_uri: REDIRECT, scope: SCOPES, state });
      res.writeHead(302, { Location: "https://login.xero.com/identity/connect/authorize?" + q }); res.end();
      return true;
    }
    if (url.pathname === "/xero/callback") {
      const back = msg => { res.writeHead(302, { Location: "/?xero=" + encodeURIComponent(msg) }); res.end(); };
      const state = url.searchParams.get("state"), code = url.searchParams.get("code");
      if (url.searchParams.get("error")) { back("error:" + (url.searchParams.get("error_description") || url.searchParams.get("error"))); return true; }
      if (!state || !states.has(state) || Date.now() - states.get(state) > 10 * 60e3) { back("error:The sign-in link expired — try Connect again"); return true; }
      states.delete(state);
      try {
        const j = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT });
        const cr = await fetch("https://api.xero.com/connections", { headers: { Authorization: "Bearer " + j.access_token, "Content-Type": "application/json" } });
        const conns = (await cr.json().catch(() => [])).filter(c => c.tenantType === "ORGANISATION");
        if (!conns.length) throw new Error("No Xero organisation was shared with the app");
        const want = (process.env.XERO_TENANT_NAME || "").toLowerCase();
        const t = conns.find(c => want && String(c.tenantName).toLowerCase() === want) || conns.sort((a, b) => String(b.updatedDateUtc).localeCompare(String(a.updatedDateUtc)))[0];
        tok = { access: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1000, refresh: j.refresh_token, tenantId: t.tenantId, tenantName: t.tenantName, connectedAt: Date.now() };
        persist(); cache = null;
        console.log(`  Xero: connected to ${t.tenantName}`);
        back("connected");
      } catch (e) { console.error("[xero]", e.message); back("error:" + e.message); }
      return true;
    }
    if (req.method === "POST" && url.pathname === "/api/xero/disconnect") {
      if (tok?.refresh && CONFIGURED) await fetch("https://identity.xero.com/connect/revocation", {
        method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: tok.refresh }),
      }).catch(() => { });
      tok = null; cache = null; persist();
      send(res, 200, { ok: true });
      return true;
    }
    if (url.pathname === "/api/xero/outstanding") {
      if (!cache || url.searchParams.has("refresh") || Date.now() - cache.at > 5 * 60e3) cache = { at: Date.now(), data: await outstanding() };
      send(res, 200, cache.data);
      return true;
    }
    send(res, 404, { error: "Not found" });
    return true;
  };
};
