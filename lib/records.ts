import { env } from "cloudflare:workers";

export type RecordRow = {
  id: string; kind: "hold" | "manual"; rate: string; record_date: string;
  store: string;
  person_name: string; amount: number; unit: "玉" | "枚"; purpose: string;
  receipt_key: string; receipt_type: string; receipt_name: string;
  hallcon_key: string | null; hallcon_type: string | null; hallcon_name: string | null;
  created_at: string; confirmed_by: string | null; confirmed_at: string | null;
  signature_key: string | null;
};

export function db() {
  if (!env.DB) throw new Error("記録データベースを利用できません");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new Error("画像保存先を利用できません");
  return env.BUCKET;
}
export function adminPassword() {
  return env.ADMIN_PASSWORD;
}
export function publicRecord(row: RecordRow) {
  const { receipt_key, hallcon_key, signature_key, ...safe } = row;
  return { ...safe, has_hallcon: !!hallcon_key, has_signature: !!signature_key };
}
