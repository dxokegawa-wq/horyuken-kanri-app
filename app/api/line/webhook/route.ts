import { db } from "@/lib/records";
import { getLineDisplayName, hashLineToken, replyLine, verifyLineSignature } from "@/lib/line";

export const runtime = "edge";

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string };
  message?: { type?: string; text?: string };
  postback?: { data?: string };
};

async function handleLink(event: LineEvent, code: string) {
  const userId = event.source?.userId;
  if (!userId || !event.replyToken) return;
  const now = new Date().toISOString();
  const link = await db().prepare("SELECT store, expires_at FROM line_link_codes WHERE code = ?")
    .bind(code).first<{ store: string; expires_at: string }>();
  if (!link || link.expires_at < now) {
    await replyLine(event.replyToken, "連携コードが違うか、有効期限が切れています。管理画面で新しいコードを発行してください。");
    return;
  }
  const displayName = await getLineDisplayName(userId);
  await db().batch([
    db().prepare("INSERT INTO line_managers (line_user_id, store, display_name, linked_at) VALUES (?, ?, ?, ?) ON CONFLICT(line_user_id) DO UPDATE SET store = excluded.store, display_name = excluded.display_name, linked_at = excluded.linked_at")
      .bind(userId, link.store, displayName, now),
    db().prepare("DELETE FROM line_link_codes WHERE code = ?").bind(code),
  ]);
  await replyLine(event.replyToken, `${link.store}の店舗長として連携しました。今後、この店舗の承認依頼をLINEでお送りします。`);
}

async function handleApproval(event: LineEvent, token: string) {
  const userId = event.source?.userId;
  if (!userId || !event.replyToken) return;
  const tokenHash = await hashLineToken(token);
  const approval = await db().prepare(
    "SELECT record_id, store, expires_at, used_at FROM line_approval_tokens WHERE token_hash = ?"
  ).bind(tokenHash).first<{ record_id: string; store: string; expires_at: string; used_at: string | null }>();
  if (!approval || approval.expires_at < new Date().toISOString()) {
    await replyLine(event.replyToken, "この承認ボタンは期限切れです。アプリで記録を確認してください。");
    return;
  }
  const manager = await db().prepare("SELECT display_name FROM line_managers WHERE line_user_id = ? AND store = ?")
    .bind(userId, approval.store).first<{ display_name: string }>();
  if (!manager) {
    await replyLine(event.replyToken, "この店舗を承認する権限がありません。");
    return;
  }
  const record = await db().prepare("SELECT confirmed_at FROM records WHERE id = ? AND store = ?")
    .bind(approval.record_id, approval.store).first<{ confirmed_at: string | null }>();
  if (!record) {
    await replyLine(event.replyToken, "対象の記録が見つかりません。");
    return;
  }
  if (approval.used_at || record.confirmed_at) {
    await replyLine(event.replyToken, "この記録はすでに承認済みです。");
    return;
  }
  const now = new Date().toISOString();
  const confirmedBy = `${manager.display_name}（LINE承認）`;
  const result = await db().prepare(
    "UPDATE records SET confirmed_by = ?, confirmed_at = ?, signature_key = NULL WHERE id = ? AND confirmed_at IS NULL"
  ).bind(confirmedBy, now, approval.record_id).run();
  if (!result.meta.changes) {
    await replyLine(event.replyToken, "この記録はすでに承認済みです。");
    return;
  }
  await db().prepare("UPDATE line_approval_tokens SET used_at = ? WHERE record_id = ? AND used_at IS NULL")
    .bind(now, approval.record_id).run();
  await replyLine(event.replyToken, `${approval.store}の記録を承認しました。`);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await verifyLineSignature(rawBody, request.headers.get("x-line-signature")))) {
    return new Response("Invalid signature", { status: 401 });
  }
  try {
    const body = JSON.parse(rawBody) as { events?: LineEvent[] };
    for (const event of body.events ?? []) {
      if (event.type === "follow" && event.replyToken) {
        await replyLine(event.replyToken, "友だち追加ありがとうございます。管理画面で発行した6桁のコードを「連携 123456」の形で送信してください。");
        continue;
      }
      if (event.type === "message" && event.message?.type === "text") {
        const code = event.message.text?.trim().match(/^連携\s*([0-9]{6})$/)?.[1];
        if (code) await handleLink(event, code);
        continue;
      }
      const approvalToken = event.postback?.data?.match(/^approve:([A-Za-z0-9_-]{20,100})$/)?.[1];
      if (event.type === "postback" && approvalToken) await handleApproval(event, approvalToken);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("LINE webhookの処理に失敗", error);
    return Response.json({ ok: false }, { status: 500 });
  }
}
