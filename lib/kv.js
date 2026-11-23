/* CIT Student Hub — tiny Redis store for the Vercel site (Upstash Redis REST API, no packages needed).
   Vercel → Storage → add "Upstash for Redis" (free) and connect it to the project: it sets
   KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). */
"use strict";
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const PREFIX = "cithub:xero:";

async function cmd(args) {
  if (!URL_ || !TOKEN) throw new Error("Storage isn't set up: add Upstash for Redis in Vercel → Storage and connect it to this project, then redeploy");
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error("Storage error: " + (j.error || r.statusText));
  return j.result;
}
module.exports = {
  ready: !!(URL_ && TOKEN),
  async get(k) { const v = await cmd(["GET", PREFIX + k]); return v == null ? null : JSON.parse(v); },
  async set(k, v, ttl) { await cmd(ttl ? ["SET", PREFIX + k, JSON.stringify(v), "EX", String(ttl)] : ["SET", PREFIX + k, JSON.stringify(v)]); },
  async del(k) { await cmd(["DEL", PREFIX + k]); },
  async setNX(k, v, ttl) { return (await cmd(["SET", PREFIX + k, JSON.stringify(v), "NX", "EX", String(ttl)])) === "OK"; },
};
