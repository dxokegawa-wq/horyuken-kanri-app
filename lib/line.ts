import { env } from "cloudflare:workers";
import { db } from "@/lib/records";

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function randomToken(size = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function lineConfigured() {
  return !!(env.LINE_CHANNEL_SECRET && env.LINE_CHANNEL_ACCESS_TOKEN);
}

export function lineOfficialAccountUrl() {
  return env.LINE_OFFICIAL_ACCOUNT_URL ?? null;
}

export async function hashLineToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function verifyLineSignature(body: string, signature: string | null) {
  if (!env.LINE_CHANNEL_SECRET || !signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.LINE_CHANNEL_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  const expected = bytesToBase64(signed);
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return difference === 0;
}

async function lineRequest(path: string, payload: unknown) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const response = await fetch(`https://api.line.me${path}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`LINE API ${response.status}: ${(await response.text()).slice(0, 300)}`);
}

export async function replyLine(replyToken: string, text: string) {
  await lineRequest("/v2/bot/message/reply", { replyToken, messages: [{ type: "text", text }] });
}

export async function getLineDisplayName(userId: string) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return "店舗長";
  const response = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
    headers: { "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!response.ok) return "店舗長";
  const profile = await response.json() as { displayName?: string };
  return profile.displayName?.trim().slice(0, 100) || "店舗長";
}

type NotifyRecord = {
  id: string; store: string; kind: "hold" | "manual"; rate: string; record_date: string;
  person_name: string; amount: number; unit: string; purpose: string;
};

export async function notifyLineManagers(record: NotifyRecord) {
  if (!lineConfigured()) return { sent: 0, status: "not_configured" as const };
  const managers = await db().prepare("SELECT line_user_id FROM line_managers WHERE store = ? ORDER BY linked_at")
    .bind(record.store).all<{ line_user_id: string }>();
  const recipients = managers.results ?? [];
  if (!recipients.length) return { sent: 0, status: "not_linked" as const };

  const token = randomToken();
  const tokenHash = await hashLineToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db().prepare(
    "INSERT INTO line_approval_tokens (token_hash, record_id, store, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)"
  ).bind(tokenHash, record.id, record.store, expiresAt, now.toISOString()).run();

  const kindLabel = record.kind === "hold" ? "保留券" : "手入力";
  const detail = `${record.store}の承認依頼\n${record.record_date} / ${kindLabel}\n${record.rate} / ${record.amount.toLocaleString()}${record.unit}\n担当者：${record.person_name}\n用途：${record.purpose.slice(0, 500)}`;
  const messages = [
    { type: "text", text: detail },
    { type: "template", altText: `${record.store}の承認依頼`, template: {
      type: "buttons", title: "店舗長確認", text: "内容を確認して承認してください。",
      actions: [{ type: "postback", label: "承認する", data: `approve:${token}`, displayText: "承認する" }],
    } },
  ];
  const results = await Promise.allSettled(recipients.map(manager => lineRequest("/v2/bot/message/push", { to: manager.line_user_id, messages })));
  const sent = results.filter(result => result.status === "fulfilled").length;
  if (!sent) console.error("LINE通知の送信に失敗", results);
  return { sent, status: sent ? "sent" as const : "failed" as const };
}
