import { db, publicRecord, type RecordRow } from "@/lib/records";

export const runtime = "edge";
const rates = new Set(["4円パチンコ", "1円パチンコ", "0.5円パチンコ", "20円スロット", "10円スロット", "5円スロット", "2円スロット"]);

function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const kind = body.kind;
    const rate = typeof body.rate === "string" ? body.rate : "";
    const recordDate = typeof body.record_date === "string" ? body.record_date : "";
    const personName = typeof body.person_name === "string" ? body.person_name.trim() : "";
    const amount = Number(body.amount);
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
    if (kind !== "hold" && kind !== "manual") return fail("区分を選択してください。");
    if (!rates.has(rate)) return fail("レートを選択してください。");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || Number.isNaN(Date.parse(recordDate))) return fail("日付を入力してください。");
    if (!personName || personName.length > 100) return fail("担当者名を100文字以内で入力してください。");
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100000000) return fail("玉数・枚数を正しく入力してください。");
    if (!purpose || purpose.length > 1000) return fail("用途を1000文字以内で入力してください。");
    const result = await db().prepare(
      "UPDATE records SET kind = ?, rate = ?, record_date = ?, person_name = ?, amount = ?, unit = ?, purpose = ? WHERE id = ?"
    ).bind(kind, rate, recordDate, personName, amount, rate.includes("パチンコ") ? "玉" : "枚", purpose, id).run();
    if (!result.meta.changes) return fail("記録が見つかりません。", 404);
    const updated = await db().prepare("SELECT * FROM records WHERE id = ?").bind(id).first<RecordRow>();
    if (!updated) return fail("記録が見つかりません。", 404);
    return Response.json({ record: publicRecord(updated) });
  } catch (error) {
    console.error("記録の修正に失敗", error);
    return fail("修正できませんでした。入力内容を確認して再試行してください。", 503);
  }
}
