import { bucket, db } from "@/lib/records";
import { monthRange, stores } from "@/lib/month-end";

export const runtime = "edge";

type MonthEndRow = {
  photo_key: string;
  photo_type: string;
  photo_name: string;
  uploaded_at: string;
  photo2_key: string | null;
  photo2_type: string | null;
  photo2_name: string | null;
  photo2_uploaded_at: string | null;
};

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const store = params.get("store") ?? "";
    const month = params.get("month") ?? "";
    if (!stores.has(store) || !monthRange(month)) return fail("店舗と月を確認してください。");
    const row = await db().prepare(
      "SELECT photo_name, uploaded_at, photo2_name, photo2_uploaded_at FROM month_end_photos WHERE store = ? AND month = ?"
    ).bind(store, month).first<MonthEndRow>();
    return Response.json({ photos: [
      row ? { name: row.photo_name, uploaded_at: row.uploaded_at } : null,
      row?.photo2_name && row.photo2_uploaded_at ? { name: row.photo2_name, uploaded_at: row.photo2_uploaded_at } : null,
    ] });
  } catch (error) {
    console.error("月末写真の取得に失敗", error);
    return fail("月末写真を読み込めませんでした。", 503);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const store = String(form.get("store") ?? "");
    const month = String(form.get("month") ?? "");
    const slot = Number(form.get("slot") ?? "1");
    const image = form.get("photo");
    if (!stores.has(store) || !monthRange(month)) return fail("店舗と月を確認してください。");
    if (slot !== 1 && slot !== 2) return fail("写真の番号を確認してください。");
    if (!(image instanceof File)) return fail("ホールコン写真を選択してください。");
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size === 0 || image.size > 10 * 1024 * 1024)
      return fail("写真は10MB以内のJPG・PNG・WEBPを選択してください。");
    const bytes = new Uint8Array(await image.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!((image.type === "image/jpeg" && jpeg) || (image.type === "image/png" && png) || (image.type === "image/webp" && webp)))
      return fail("写真の形式を確認してください。");
    const old = await db().prepare("SELECT photo_key, photo2_key FROM month_end_photos WHERE store = ? AND month = ?")
      .bind(store, month).first<Pick<MonthEndRow, "photo_key" | "photo2_key">>();
    if (slot === 2 && !old) return fail("先に1枚目を保存してください。");
    const key = `month-end/${crypto.randomUUID()}`;
    await bucket().put(key, bytes, { httpMetadata: { contentType: image.type } });
    const uploadedAt = new Date().toISOString();
    try {
      if (slot === 1) {
        await db().prepare(
          "INSERT INTO month_end_photos (store, month, photo_key, photo_type, photo_name, uploaded_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(store, month) DO UPDATE SET photo_key = excluded.photo_key, photo_type = excluded.photo_type, photo_name = excluded.photo_name, uploaded_at = excluded.uploaded_at"
        ).bind(store, month, key, image.type, image.name.slice(0, 200), uploadedAt).run();
      } else {
        await db().prepare(
          "UPDATE month_end_photos SET photo2_key = ?, photo2_type = ?, photo2_name = ?, photo2_uploaded_at = ? WHERE store = ? AND month = ?"
        ).bind(key, image.type, image.name.slice(0, 200), uploadedAt, store, month).run();
      }
    } catch (error) {
      await bucket().delete(key).catch(() => undefined);
      throw error;
    }
    const oldKey = slot === 1 ? old?.photo_key : old?.photo2_key;
    if (oldKey) await bucket().delete(oldKey).catch(error => console.error("旧月末写真の削除に失敗", error));
    return Response.json({ photo: { name: image.name.slice(0, 200), uploaded_at: uploadedAt } });
  } catch (error) {
    console.error("月末写真の保存に失敗", error);
    return fail("写真を保存できませんでした。", 503);
  }
}
