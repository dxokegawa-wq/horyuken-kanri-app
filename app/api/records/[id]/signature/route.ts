import { bucket, db } from "@/lib/records";
export const runtime = "edge";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const row = await db().prepare("SELECT signature_key FROM records WHERE id = ?").bind(id).first<{ signature_key: string | null }>();
    if (!row?.signature_key) return new Response("見つかりません", { status: 404 });
    const object = await bucket().get(row.signature_key);
    if (!object) return new Response("見つかりません", { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" } });
  } catch (error) {
    console.error("サイン画像の取得に失敗", error);
    return new Response("画像を読み込めません", { status: 503 });
  }
}
