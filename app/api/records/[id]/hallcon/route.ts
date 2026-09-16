import { bucket, db } from "@/lib/records";
export const runtime = "edge";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const row = await db().prepare("SELECT hallcon_key, hallcon_type FROM records WHERE id = ?").bind(id).first<{ hallcon_key: string | null; hallcon_type: string | null }>();
    if (!row?.hallcon_key || !row.hallcon_type) return new Response("見つかりません", { status: 404 });
    const object = await bucket().get(row.hallcon_key);
    if (!object) return new Response("画像を読み込めません", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": row.hallcon_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch (error) {
    console.error("ホールコン画像の取得に失敗", error);
    return new Response("画像を読み込めません", { status: 503 });
  }
}
