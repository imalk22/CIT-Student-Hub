/* CIT Student Hub — email one admission card from the website (Vercel). The browser makes the PDF and sends it
   here as base64; this sends it through Microsoft 365. Staff login required. */
"use strict";
const mail = require("../lib/graph-mail");
const { authed } = require("../lib/auth");

function readJson(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(JSON.parse(req.body || "{}"));
  return new Promise((ok, bad) => { let s = ""; req.on("data", c => { s += c; }); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch (e) { bad(e); } }); req.on("error", bad); });
}

module.exports = async (req, res) => {
  const json = (code, body) => { res.statusCode = code; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };
  if (!authed(req)) return json(401, { ok: false, error: "Sign in first" });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });
  try {
    const b = await readJson(req);
    if (req.query?.test !== undefined || b.test) return json(200, await mail.sendMail({ to: b.to, subject: "CIT Student Hub — test email", text: "This is a test email from the CIT Student Hub website. Email sending works." }));
    if (b.attachments?.some(a => a.html && !a.base64)) return json(400, { ok: false, error: "The website needs the PDF made in the browser — refresh the page and try again" });
    return json(200, await mail.sendMail(b));
  } catch (e) {
    console.error("[send]", e.message);
    return json(500, { ok: false, error: e.message });
  }
};
