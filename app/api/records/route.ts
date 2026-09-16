import { bucket, db, publicRecord, type RecordRow } from "@/lib/records";

export const runtime = "edge";
const rates = new Set(["4円パチンコ", "1円パチンコ", "0.5円パチンコ", "20円スロット", "10円スロット", "5円スロット", "2円スロット"]);
const stores = new Set(["岩槻本店", "桶川店", "平塚店", "ふじみ野店", "美女木店", "鶴瀬店"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

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
      "SELECT * FROM records WHERE store = ? AND record_date >= ? AND record_date < ? ORDER BY record_date DESC, created_at DESC LIMIT 500"
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
    const store = String(form.get("store") ?? "");
    const kind = String(form.get("kind") ?? "");
    const rate = String(form.get("rate") ?? "");
    const recordDate = String(form.get("record_date") ?? "");
    const personName = String(form.get("person_name") ?? "").trim();
    const amountText = String(form.get("amount") ?? "");
    const purpose = String(form.get("purpose") ?? "").trim();
    const amount = Number(amountText);
    if (!(receipt instanceof File)) return fail("レシート画像を選択してください。");
    if (!stores.has(store)) return fail("店舗を選択してください。");
    if (!imageTypes.has(receipt.type) || receipt.size === 0 || receipt.size > 10 * 1024 * 1024) return fail("画像は10MB以内のJPG・PNG・WEBPを選択してください。");
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!((receipt.type === "image/jpeg" && jpeg) || (receipt.type === "image/png" && png) || (receipt.type === "image/webp" && webp))) return fail("画像形式を確認してください。");
    if (kind !== "hold" && kind !== "manual") return fail("区分を選択してください。");
    if (!rates.has(rate)) return fail("レートを選択してください。");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || Number.isNaN(Date.parse(recordDate))) return fail("日付を入力してください。");
    if (!personName || personName.length > 100) return fail("担当者名を100文字以内で入力してください。");
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000000) return fail("玉数・枚数を正しく入力してください。");
    if (!purpose || purpose.length > 1000) return fail("用途を1000文字以内で入力してください。");
    const id = crypto.randomUUID();
    const unit = rate.includes("パチンコ") ? "玉" : "枚";
    const receiptKey = `receipts/${id}`;
    await bucket().put(receiptKey, bytes, { httpMetadata: { contentType: receipt.type } });
    const createdAt = new Date().toISOString();
    try {
      await db().prepare(
        "INSERT INTO records (id, store, kind, rate, record_date, person_name, amount, unit, purpose, receipt_key, receipt_type, receipt_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(id, store, kind, rate, recordDate, personName, amount, unit, purpose, receiptKey, receipt.type, receipt.name.slice(0, 200), createdAt).run();
    } catch (error) {
      await bucket().delete(receiptKey).catch(() => undefined);
      throw error;
    }
    return Response.json({ record: { id, store, kind, rate, record_date: recordDate, person_name: personName, amount, unit, purpose, receipt_type: receipt.type, receipt_name: receipt.name.slice(0, 200), created_at: createdAt, confirmed_by: null, confirmed_at: null, has_signature: false } }, { status: 201 });
  } catch (error) {
    console.error("記録の保存に失敗", error);
    return fail("保存できませんでした。入力内容を確認して再試行してください。", 503);
  }
}
