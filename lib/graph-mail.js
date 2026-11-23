/* CIT Student Hub — send email through Microsoft 365 (Microsoft Graph, app registration with Mail.Send)
   for the Vercel site. Same settings as the office app: MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET,
   MS_SENDER (+ optional MAIL_FROM_NAME, MAIL_REPLY_TO). See README → "Microsoft 365 setup". */
"use strict";
const E = process.env;
const configured = () => !!(E.MS_TENANT_ID && E.MS_CLIENT_ID && E.MS_CLIENT_SECRET && E.MS_SENDER);
const isEmail = s => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || "").trim());
let token = null;   // { value, exp } — reused while this function instance is warm

async function getToken() {
  if (token && Date.now() < token.exp - 60e3) return token.value;
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(E.MS_TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: E.MS_CLIENT_ID, client_secret: E.MS_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Microsoft sign-in failed: " + String(j.error_description || j.error || r.statusText).split("\r\n")[0]);
  token = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return token.value;
}

/* attachments: [{ filename, base64, contentType? }] */
async function sendMail({ to, cc, subject, text, html, attachments = [] }) {
  if (!configured()) throw new Error("Email isn't set up on the website (Microsoft 365 settings missing in Vercel)");
  if (!isEmail(to)) throw new Error(`Invalid email address: ${to || "(empty)"}`);
  const message = {
    subject: String(subject || ""), body: html ? { contentType: "HTML", content: html } : { contentType: "Text", content: text || "" },
    toRecipients: [{ emailAddress: { address: String(to).trim() } }],
    ccRecipients: cc && isEmail(cc) ? [{ emailAddress: { address: String(cc).trim() } }] : [],
    attachments: attachments.filter(a => a?.base64).map(a => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: String(a.filename || "admission.pdf"), contentType: a.contentType || "application/pdf", contentBytes: a.base64 })),
  };
  if (E.MAIL_REPLY_TO) message.replyTo = [{ emailAddress: { address: E.MAIL_REPLY_TO } }];
  if (E.MAIL_FROM_NAME) message.from = { emailAddress: { address: E.MS_SENDER, name: E.MAIL_FROM_NAME } };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(E.MS_SENDER)}/sendMail`, {
      method: "POST", headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message, saveToSentItems: true }), signal: AbortSignal.timeout(30000),
    });
    if (r.status === 202) return { ok: true, mode: "graph" };
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await new Promise(ok => setTimeout(ok, 1000 * (+r.headers.get("retry-after") || 2 ** attempt * 2))); continue; }
    if (r.status === 401 && attempt < 1) { token = null; continue; }
    const j = await r.json().catch(() => ({}));
    const msg = j.error?.message || r.statusText;
    if (r.status === 403) throw new Error(`Microsoft refused to send as ${E.MS_SENDER} (needs Mail.Send application permission with admin consent): ${msg}`);
    if (r.status === 404) throw new Error(`Mailbox ${E.MS_SENDER} not found: ${msg}`);
    throw new Error(`Microsoft Graph error ${r.status}: ${msg}`);
  }
}
module.exports = { configured, sendMail, getToken, from: () => E.MAIL_FROM_NAME ? `${E.MAIL_FROM_NAME} <${E.MS_SENDER}>` : E.MS_SENDER || "" };
