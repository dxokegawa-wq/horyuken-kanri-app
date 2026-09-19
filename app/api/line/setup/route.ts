import { adminPassword, db } from "@/lib/records";
import { lineConfigured, lineOfficialAccountUrl } from "@/lib/line";
import { stores } from "@/lib/month-end";

export const runtime = "edge";

function fail(message: string, status = 400) { return Response.json({ error: message }, { status }); }

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; password?: string; store?: string; line_user_id?: string };
    if (!adminPassword() || body.password !== adminPassword()) return fail("管理パスワードが違います。", 403);
    if (!body.store || !stores.has(body.store)) return fail("店舗を確認してください。");
    if (body.action === "status") {
      const result = await db().prepare("SELECT line_user_id, display_name, linked_at FROM line_managers WHERE store = ? ORDER BY linked_at")
        .bind(body.store).all<{ line_user_id: string; display_name: string; linked_at: string }>();
      return Response.json({ managers: result.results ?? [], configured: lineConfigured(), official_account_url: lineOfficialAccountUrl() });
    }
    if (body.action === "generate") {
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      await db().batch([
        db().prepare("DELETE FROM line_link_codes WHERE store = ? OR expires_at < ?").bind(body.store, now.toISOString()),
        db().prepare("INSERT INTO line_link_codes (code, store, expires_at, created_at) VALUES (?, ?, ?, ?)").bind(code, body.store, expiresAt, now.toISOString()),
      ]);
      return Response.json({ code, expires_at: expiresAt });
    }
    if (body.action === "unlink") {
      if (!body.line_user_id) return fail("解除する店舗長を選択してください。");
      await db().prepare("DELETE FROM line_managers WHERE store = ? AND line_user_id = ?").bind(body.store, body.line_user_id).run();
      return Response.json({ removed: true });
    }
    return fail("操作を確認してください。");
  } catch (error) {
    console.error("LINE連携設定に失敗", error);
    return fail("LINE連携設定を更新できませんでした。", 503);
  }
}
