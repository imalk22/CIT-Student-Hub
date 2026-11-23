/* CIT Student Hub — staff login for the Vercel site. One shared staff password (HUB_PASSWORD in Vercel's
   environment variables). A signed cookie keeps people signed in for 30 days; changing the password signs
   everyone out. middleware.js checks the same cookie with Web Crypto (same HMAC-SHA256, same format). */
"use strict";
const crypto = require("crypto");
const COOKIE = "hub_auth", DAYS = 30;
const key = () => "cithub|" + (process.env.HUB_PASSWORD || "");
const sign = exp => crypto.createHmac("sha256", key()).update("hub:" + exp).digest("hex");

function makeCookie() {
  const exp = Date.now() + DAYS * 864e5;
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
function authed(req) {
  if (!process.env.HUB_PASSWORD) return false;
  const m = String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)\\.([a-f0-9]{64})`));
  if (!m || +m[1] < Date.now()) return false;
  const a = Buffer.from(m[2], "hex"), b = Buffer.from(sign(m[1]), "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function passwordOk(pw) {
  const want = process.env.HUB_PASSWORD || "";
  const a = crypto.createHash("sha256").update(String(pw || "")).digest(), b = crypto.createHash("sha256").update(want).digest();
  return !!want && crypto.timingSafeEqual(a, b);
}
module.exports = { COOKIE, makeCookie, clearCookie, authed, passwordOk };
