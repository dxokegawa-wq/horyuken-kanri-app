import { bucket, db } from "@/lib/records";
export const runtime = "edge";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { manager_name?: string; signature?: string };
    const managerName = body.manager_name?.trim() ?? "";
    if (!managerName || managerName.length > 100) return Response.json({ error: "店長名を100文字以内で入力してください。" }, { status: 400 });
    const encoded = body.signature?.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)?.[1];
    if (!encoded || encoded.length > 400000) return Response.json({ error: "サインを記入してください。" }, { status: 400 });
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    if (bytes.length < 100 || bytes.length > 300000 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return Response.json({ error: "サイン画像を確認してください。" }, { status: 400 });
    const existing = await db().prepare("SELECT id, confirmed_at FROM records WHERE id = ?").bind(id).first<{ id: string; confirmed_at: string | null }>();
    if (!existing) return Response.json({ error: "記録が見つかりません。" }, { status: 404 });
    if (existing.confirmed_at) return Response.json({ error: "この記録は確認済みです。" }, { status: 409 });
    const key = `signatures/${id}/${crypto.randomUUID()}`;
    await bucket().put(key, bytes, { httpMetadata: { contentType: "image/png" } });
    const now = new Date().toISOString();
    try {
      const result = await db().prepare(
        "UPDATE records SET confirmed_by = ?, confirmed_at = ?, signature_key = ? WHERE id = ? AND confirmed_at IS NULL"
      ).bind(managerName, now, key, id).run();
      if (!result.meta.changes) {
        await bucket().delete(key).catch(() => undefined);
        return Response.json({ error: "この記録はすでに確認されています。" }, { status: 409 });
      }
    } catch (error) {
      await bucket().delete(key).catch(() => undefined);
      throw error;
    }
    return Response.json({ confirmed_by: managerName, confirmed_at: now });
  } catch (error) {
    console.error("店長確認の保存に失敗", error);
    return Response.json({ error: "確認を保存できませんでした。再試行してください。" }, { status: 503 });
  }
}
