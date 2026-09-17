import { bucket, db } from "@/lib/records";
import { monthRange, stores } from "@/lib/month-end";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const store = params.get("store") ?? "";
    const month = params.get("month") ?? "";
    const slot = Number(params.get("slot") ?? "1");
    if (!stores.has(store) || !monthRange(month) || (slot !== 1 && slot !== 2)) return new Response("見つかりません", { status: 404 });
    const row = await db().prepare("SELECT photo_key, photo_type, photo2_key, photo2_type FROM month_end_photos WHERE store = ? AND month = ?")
      .bind(store, month).first<{ photo_key: string; photo_type: string; photo2_key: string | null; photo2_type: string | null }>();
    const key = slot === 1 ? row?.photo_key : row?.photo2_key;
    const type = slot === 1 ? row?.photo_type : row?.photo2_type;
    if (!key || !type) return new Response("見つかりません", { status: 404 });
    const object = await bucket().get(key);
    if (!object) return new Response("画像を読み込めません", { status: 404 });
    return new Response(object.body, { headers: {
      "Content-Type": type,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    } });
  } catch (error) {
    console.error("月末写真の表示に失敗", error);
    return new Response("画像を読み込めません", { status: 503 });
  }
}
