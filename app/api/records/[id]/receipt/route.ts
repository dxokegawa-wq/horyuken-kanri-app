import { bucket, db } from "@/lib/records";
export const runtime = "edge";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const row = await db().prepare("SELECT receipt_key, receipt_type FROM records WHERE id = ?").bind(id).first<{ receipt_key: string; receipt_type: string }>();
    if (!row) return new Response("見つかりません", { status: 404 });
    const object = await bucket().get(row.receipt_key);
    if (!object) return new Response("画像を読み込めません", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": row.receipt_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch (error) {
    console.error("レシート画像の取得に失敗", error);
    return new Response("画像を読み込めません", { status: 503 });
  }
}
