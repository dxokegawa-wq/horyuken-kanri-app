import { bucket, db } from "@/lib/records";
import { monthRange, stores } from "@/lib/month-end";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const store = params.get("store") ?? "";
    const month = params.get("month") ?? "";
    if (!stores.has(store) || !monthRange(month)) return new Response("見つかりません", { status: 404 });
    const row = await db().prepare("SELECT photo_key, photo_type FROM month_end_photos WHERE store = ? AND month = ?")
      .bind(store, month).first<{ photo_key: string; photo_type: string }>();
    if (!row) return new Response("見つかりません", { status: 404 });
    const object = await bucket().get(row.photo_key);
    if (!object) return new Response("画像を読み込めません", { status: 404 });
    return new Response(object.body, { headers: {
      "Content-Type": row.photo_type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    } });
  } catch (error) {
    console.error("月末写真の表示に失敗", error);
    return new Response("画像を読み込めません", { status: 503 });
  }
}
