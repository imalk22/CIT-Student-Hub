/* CIT Student Hub — staff sign-in / sign-out for the Vercel site (POST from login.html). */
"use strict";
const { makeCookie, clearCookie, passwordOk } = require("../lib/auth");

const safeNext = n => (typeof n === "string" && /^\/(?!\/)/.test(n) && !n.startsWith("/login") ? n : "/");
function body(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(Object.fromEntries(new URLSearchParams(req.body)));
  return new Promise(ok => { let s = ""; req.on("data", c => { s += c; if (s.length > 1e4) req.destroy(); }); req.on("end", () => ok(Object.fromEntries(new URLSearchParams(s)))); });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.query?.logout !== undefined) { res.setHeader("Set-Cookie", clearCookie()); res.statusCode = 303; res.setHeader("Location", "/login.html"); return res.end(); }
  if (req.method !== "POST") { res.statusCode = 405; return res.end("Method not allowed"); }
  const b = await body(req), next = safeNext(b.next);
  if (!process.env.HUB_PASSWORD) { res.statusCode = 303; res.setHeader("Location", "/login.html?e=setup"); return res.end(); }
  if (!passwordOk(b.password)) {
    await new Promise(ok => setTimeout(ok, 900));   // slow down guessing
    res.statusCode = 303; res.setHeader("Location", "/login.html?e=1&next=" + encodeURIComponent(next)); return res.end();
  }
  res.setHeader("Set-Cookie", makeCookie());
  res.statusCode = 303; res.setHeader("Location", next); res.end();
};
