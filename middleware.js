/* CIT Student Hub — Vercel Routing Middleware: the whole site (pages, data.json, finance API) needs the staff
   login. Only the sign-in page, its logo and Vercel Cron get through without it. Same cookie as lib/auth.js.
   (The office app run with npm start does not use this file.) */
const COOKIE = "hub_auth";
const OPEN = new Set(["/login.html", "/api/login", "/assets/emblem.png", "/favicon.ico", "/api/xero/cron"]);

export const config = { matcher: "/:path*" };

const next = () => new Response(null, { headers: { "x-middleware-next": "1" } });
async function sign(secret, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
  return [...s].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default async function middleware(request) {
  const url = new URL(request.url), p = url.pathname;
  if (OPEN.has(p)) return next();
  const pw = process.env.HUB_PASSWORD;
  if (!pw) return new Response("This site is locked. Set HUB_PASSWORD in Vercel → Project → Settings → Environment Variables, then redeploy.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)hub_auth=(\d+)\.([a-f0-9]{64})/);
  if (m && +m[1] > Date.now() && m[2] === await sign("cithub|" + pw, "hub:" + m[1])) return next();
  if (p.startsWith("/api/")) return new Response(JSON.stringify({ error: "Sign in first" }), { status: 401, headers: { "Content-Type": "application/json" } });
  return Response.redirect(new URL("/login.html?next=" + encodeURIComponent(p + url.search), url), 302);
}
