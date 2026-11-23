/* CIT Student Hub — Xero (read-only) shared by the office app (server.js) and the Vercel site (api/xero).
 *
 * OAuth 2.0 "Web app" flow: someone with access to the CIT Xero organisation clicks Connect once and allows
 * read-only access. The refresh token is kept in a store (a file on the office computer, Redis on Vercel), so the
 * connection survives restarts. Reads only unpaid sales invoices (ACCREC, AUTHORISED) and their contacts.
 *
 * store: { get(key), set(key, value, ttlSec?), del(key), setNX(key, value, ttlSec) } — values are JSON-able.
 */
"use strict";
const crypto = require("crypto");

module.exports = function createXero({ id, secret, redirect, scopes, tenantName = "", store, log = () => { } }) {
  const SCOPES = scopes || "offline_access accounting.invoices.read accounting.contacts.read";
  const configured = !!(id && secret);
  const basic = () => "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");

  async function tokenRequest(params) {
    const r = await fetch("https://identity.xero.com/connect/token", {
      method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Xero sign-in failed: " + (j.error_description || j.error || r.statusText));
    return j;
  }

  async function accessToken(t) {
    if (!t?.refresh) throw new Error("Not connected to Xero — click Connect to Xero first");
    if (t.access && Date.now() < t.exp - 60e3) return t;
    let j;
    try { j = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh }); }
    catch (e) {
      if (!/invalid_grant/i.test(e.message)) throw e;
      const now = await store.get("tok");   // another instance may have just refreshed it
      if (now?.refresh && now.refresh !== t.refresh) return accessToken(now);
      await store.del("tok");
      throw new Error("The Xero connection expired (60 days unused, or access was removed) — connect again");
    }
    const n = { ...t, access: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1000, refresh: j.refresh_token || t.refresh };
    await store.set("tok", n);
    return n;
  }

  async function api(t, pathAndQuery) {
    for (let attempt = 0; ; attempt++) {
      t = await accessToken(t);
      const r = await fetch("https://api.xero.com/api.xro/2.0/" + pathAndQuery, {
        headers: { Authorization: "Bearer " + t.access, "xero-tenant-id": t.tenantId, Accept: "application/json" }, signal: AbortSignal.timeout(60000),
      });
      if (r.status === 429 && attempt < 4) { await new Promise(ok => setTimeout(ok, 1000 * (+r.headers.get("retry-after") || 5))); continue; }
      if (r.status === 401 && attempt < 1) { t = { ...t, access: null }; continue; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Xero ${r.status}: ${j.Detail || j.Message || j.Title || r.statusText}${r.status === 403 ? " (check the app's scopes / that this login can see the organisation)" : ""}`);
      return { t, j };
    }
  }

  /* read every unpaid sales invoice + its contact, in a compact shape */
  async function fetchOutstanding() {
    let t = await store.get("tok");
    const invoices = [], size = 500;
    for (let page = 1; page < 200; page++) {
      const r = await api(t, `Invoices?page=${page}&pageSize=${size}&Statuses=AUTHORISED&where=${encodeURIComponent('Type=="ACCREC"')}`); t = r.t;
      const list = r.j.Invoices || [];
      invoices.push(...list.filter(i => +i.AmountDue > 0));
      if (list.length < size) break;
    }
    const ids = [...new Set(invoices.map(i => i.Contact?.ContactID).filter(Boolean))], contacts = new Map();
    for (let k = 0; k < ids.length; k += 40) {
      const r = await api(t, `Contacts?IDs=${ids.slice(k, k + 40).join(",")}`); t = r.t;
      for (const c of r.j.Contacts || []) contacts.set(c.ContactID, c);
    }
    const day = s => String(s || "").slice(0, 10);
    return {
      tenant: t.tenantName, syncedAt: Date.now(),
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

  /* sync now (one at a time across instances), keep the result in the store */
  async function sync() {
    if (!(await store.get("tok"))?.refresh) throw new Error("Not connected to Xero — click Connect to Xero first");
    const got = await store.setNX("lock", Date.now(), 240);
    if (!got) {   // someone else is syncing: wait for their result (up to ~60 s)
      for (let i = 0; i < 30; i++) { await new Promise(ok => setTimeout(ok, 2000)); if (!(await store.get("lock"))) break; }
      const d = await store.get("data"); if (d) return d;
    }
    try {
      const data = await fetchOutstanding();
      await store.set("data", data); await store.del("err");
      log(`Xero: synced ${new Date().toLocaleTimeString()} · ${data.invoices.length} unpaid invoices · Rs ${Math.round(data.invoices.reduce((s, i) => s + i.due, 0)).toLocaleString("en-LK")} outstanding`);
      return data;
    } catch (e) { await store.set("err", e.message); log("[xero] sync failed: " + e.message); throw e; }
    finally { if (got) await store.del("lock"); }
  }

  return {
    configured, scopes: SCOPES, redirect,
    async status() {
      const t = await store.get("tok"), d = await store.get("data");
      return { configured, connected: !!t?.refresh, tenant: t?.tenantName || "", connectedAt: t?.connectedAt || 0, lastSync: d?.syncedAt || 0, lastError: (await store.get("err")) || "", redirect, scopes: SCOPES };
    },
    async authUrl() {
      const state = crypto.randomBytes(16).toString("hex");
      await store.set("state:" + state, 1, 600);
      return "https://login.xero.com/identity/connect/authorize?" + new URLSearchParams({ response_type: "code", client_id: id, redirect_uri: redirect, scope: SCOPES, state });
    },
    /* → "connected" or throws */
    async callback({ code, state, error, error_description }) {
      if (error) throw new Error(error_description || error);
      if (!state || !(await store.get("state:" + state))) throw new Error("The sign-in link expired — try Connect again");
      await store.del("state:" + state);
      const j = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirect });
      const cr = await fetch("https://api.xero.com/connections", { headers: { Authorization: "Bearer " + j.access_token, "Content-Type": "application/json" } });
      const conns = (await cr.json().catch(() => [])).filter(c => c.tenantType === "ORGANISATION");
      if (!conns.length) throw new Error("No Xero organisation was shared with the app");
      const want = String(tenantName || "").toLowerCase();
      const t = conns.find(c => want && String(c.tenantName).toLowerCase() === want) || conns.sort((a, b) => String(b.updatedDateUtc).localeCompare(String(a.updatedDateUtc)))[0];
      await store.set("tok", { access: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1000, refresh: j.refresh_token, tenantId: t.tenantId, tenantName: t.tenantName, connectedAt: Date.now() });
      await store.del("data"); await store.del("err");
      log(`Xero: connected to ${t.tenantName}`);
      return t.tenantName;
    },
    async disconnect() {
      const t = await store.get("tok");
      if (t?.refresh && configured) await fetch("https://identity.xero.com/connect/revocation", {
        method: "POST", headers: { Authorization: basic(), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: t.refresh }),
      }).catch(() => { });
      await store.del("tok"); await store.del("data"); await store.del("err");
    },
    /* cached copy, refreshed when older than maxAgeMs (or force) */
    async outstanding({ force = false, maxAgeMs = 10 * 60e3 } = {}) {
      if (!(await store.get("tok"))?.refresh) throw new Error("Not connected to Xero — click Connect to Xero first");
      let d = await store.get("data");
      if (force || !d || Date.now() - d.syncedAt > maxAgeMs) {
        try { d = await sync(); } catch (e) { if (!d || force) throw e; }   // keep serving the last copy if a background refresh fails
      }
      return { ...d, lastError: (await store.get("err")) || "" };
    },
    sync,
  };
};
