import { adminPassword, bucket, db, publicRecord, type RecordRow } from "@/lib/records";

export const runtime = "edge";
const rates = new Set(["4円パチンコ", "1円パチンコ", "0.5円パチンコ", "20円スロット", "10円スロット", "5円スロット", "2円スロット"]);
const stores = new Set(["岩槻本店", "桶川店", "平塚店", "ふじみ野店", "美女木店", "鶴瀬店"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasValidImageSignature(file: File, bytes: Uint8Array) {
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return (file.type === "image/jpeg" && jpeg) || (file.type === "image/png" && png) || (file.type === "image/webp" && webp);
}

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const month = params.get("month") ?? "";
    const store = params.get("store") ?? "";
    if (!stores.has(store)) return fail("店舗を選択してください。");
    if (!/^\d{4}-\d{2}$/.test(month)) return fail("確認する月を選択してください。");
    const [year, monthNumber] = month.split("-").map(Number);
    if (monthNumber < 1 || monthNumber > 12) return fail("確認する月を選択してください。");
    const startDate = `${month}-01`;
    const endDate = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    const result = await db().prepare(
      "SELECT * FROM records WHERE store = ? AND record_date >= ? AND record_date < ? ORDER BY record_date DESC, created_at DESC"
    ).bind(store, startDate, endDate).all<RecordRow>();
    return Response.json({ records: (result.results ?? []).map(publicRecord) });
  } catch (error) {
    console.error("記録一覧の取得に失敗", error);
    return fail("記録を読み込めませんでした。時間をおいて再試行してください。", 503);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const receipt = form.get("receipt");
    const hallcon = form.get("hallcon");
    const store = String(form.get("store") ?? "");
    const kind = String(form.get("kind") ?? "");
    const rate = String(form.get("rate") ?? "");
    const recordDate = String(form.get("record_date") ?? "");
    const personName = String(form.get("person_name") ?? "").trim();
    const amountText = String(form.get("amount") ?? "");
    const purpose = String(form.get("purpose") ?? "").trim();
    const amount = Number(amountText);
    if (!(receipt instanceof File)) return fail("レシート画像を選択してください。");
    if (!(hallcon instanceof File)) return fail("ホールコン画像を選択してください。");
    if (!stores.has(store)) return fail("店舗を選択してください。");
    if (!imageTypes.has(receipt.type) || receipt.size === 0 || receipt.size > 10 * 1024 * 1024) return fail("画像は10MB以内のJPG・PNG・WEBPを選択してください。");
    if (!imageTypes.has(hallcon.type) || hallcon.size === 0 || hallcon.size > 10 * 1024 * 1024) return fail("ホールコン画像は10MB以内のJPG・PNG・WEBPを選択してください。");
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const hallconBytes = new Uint8Array(await hallcon.arrayBuffer());
    if (!hasValidImageSignature(receipt, bytes)) return fail("レシート画像の形式を確認してください。");
    if (!hasValidImageSignature(hallcon, hallconBytes)) return fail("ホールコン画像の形式を確認してください。");
    if (kind !== "hold" && kind !== "manual") return fail("区分を選択してください。");
    if (!rates.has(rate)) return fail("レートを選択してください。");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || Number.isNaN(Date.parse(recordDate))) return fail("日付を入力してください。");
    if (!personName || personName.length > 100) return fail("担当者名を100文字以内で入力してください。");
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000000) return fail("玉数・枚数を正しく入力してください。");
    if (!purpose || purpose.length > 1000) return fail("用途を1000文字以内で入力してください。");
    const id = crypto.randomUUID();
    const unit = rate.includes("パチンコ") ? "玉" : "枚";
    const receiptKey = `receipts/${id}`;
    const hallconKey = `hallcon/${id}`;
    await bucket().put(receiptKey, bytes, { httpMetadata: { contentType: receipt.type } });
    const createdAt = new Date().toISOString();
    try {
      await bucket().put(hallconKey, hallconBytes, { httpMetadata: { contentType: hallcon.type } });
      await db().prepare(
        "INSERT INTO records (id, store, kind, rate, record_date, person_name, amount, unit, purpose, receipt_key, receipt_type, receipt_name, hallcon_key, hallcon_type, hallcon_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, store, kind, rate, recordDate, personName, amount, unit, purpose, receiptKey, receipt.type, receipt.name.slice(0, 200), hallconKey, hallcon.type, hallcon.name.slice(0, 200), createdAt).run();
    } catch (error) {
      await Promise.all([bucket().delete(receiptKey), bucket().delete(hallconKey)]).catch(() => undefined);
      throw error;
    }
    return Response.json({ record: { id, store, kind, rate, record_date: recordDate, person_name: personName, amount, unit, purpose, receipt_type: receipt.type, receipt_name: receipt.name.slice(0, 200), hallcon_type: hallcon.type, hallcon_name: hallcon.name.slice(0, 200), created_at: createdAt, confirmed_by: null, confirmed_at: null, has_hallcon: true, has_signature: false } }, { status: 201 });
  } catch (error) {
    console.error("記録の保存に失敗", error);
    return fail("保存できませんでした。入力内容を確認して再試行してください。", 503);
  }
}

export async function DELETE(request: Request) {
  try {
    const configuredPassword = adminPassword();
    if (!configuredPassword) return fail("削除用パスワードが設定されていません。", 503);
    const body = await request.json() as { password?: string; month?: string; store?: string };
    if (body.password !== configuredPassword) return fail("パスワードが違います。", 403);
    const month = body.month ?? "";
    const store = body.store ?? "";
    if (!stores.has(store)) return fail("店舗を選択してください。");
    if (!/^\d{4}-\d{2}$/.test(month)) return fail("削除する月を選択してください。");
    const [year, monthNumber] = month.split("-").map(Number);
    if (monthNumber < 1 || monthNumber > 12) return fail("削除する月を選択してください。");
    const startDate = `${month}-01`;
    const endDate = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
    const rows = await db().prepare(
      "SELECT receipt_key, hallcon_key, signature_key FROM records WHERE store = ? AND record_date >= ? AND record_date < ?"
    ).bind(store, startDate, endDate).all<{ receipt_key: string; hallcon_key: string | null; signature_key: string | null }>();
    const monthEnd = await db().prepare("SELECT photo_key, photo2_key FROM month_end_photos WHERE store = ? AND month = ?")
      .bind(store, month).first<{ photo_key: string; photo2_key: string | null }>();
    const [result] = await db().batch([
      db().prepare("DELETE FROM records WHERE store = ? AND record_date >= ? AND record_date < ?").bind(store, startDate, endDate),
      db().prepare("DELETE FROM month_end_photos WHERE store = ? AND month = ?").bind(store, month),
    ]);
    const keys = [...(rows.results ?? []).flatMap(row => [row.receipt_key, row.hallcon_key, row.signature_key]), monthEnd?.photo_key, monthEnd?.photo2_key]
      .filter((key): key is string => !!key);
    await Promise.allSettled(keys.map(key => bucket().delete(key)));
    return Response.json({ deleted: result.meta.changes ?? 0 });
  } catch (error) {
    console.error("月別記録の削除に失敗", error);
    return fail("削除できませんでした。時間をおいて再試行してください。", 503);
  }
}
