/* CIT Student Hub — tells the page what the website can do (Vercel). The office app has its own /api/health.
   /api/mail-check (rewritten here with ?check=1) signs in to Microsoft 365 without sending anything. */
"use strict";
const mail = require("../lib/graph-mail");
const { authed } = require("../lib/auth");
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store");
  if (!authed(req)) { res.statusCode = 401; return res.end(JSON.stringify({ error: "Sign in first" })); }
  const mode = mail.configured() ? "graph" : "none";
  if (req.query?.check !== undefined) {
    if (mode === "none") return res.end(JSON.stringify({ ok: false, mode, error: "Email isn't set up on the website — add the Microsoft 365 settings in Vercel" }));
    try { await mail.getToken(); return res.end(JSON.stringify({ ok: true, mode, note: "Signed in to Microsoft 365" })); }
    catch (e) { res.statusCode = 500; return res.end(JSON.stringify({ ok: false, mode, error: e.message })); }
  }
  res.end(JSON.stringify({ ok: true, site: "vercel", mode, from: mail.from(), pdf: false }));
};
