import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: text("id").primaryKey(),
  store: text("store").notNull().default("桶川店"),
  kind: text("kind").notNull(),
  rate: text("rate").notNull(),
  recordDate: text("record_date").notNull(),
  personName: text("person_name").notNull(),
  amount: integer("amount").notNull(),
  unit: text("unit").notNull(),
  purpose: text("purpose").notNull(),
  receiptKey: text("receipt_key").notNull(),
  receiptType: text("receipt_type").notNull(),
  receiptName: text("receipt_name").notNull(),
  hallconKey: text("hallcon_key"),
  hallconType: text("hallcon_type"),
  hallconName: text("hallcon_name"),
  createdAt: text("created_at").notNull(),
  confirmedBy: text("confirmed_by"),
  confirmedAt: text("confirmed_at"),
  signatureKey: text("signature_key"),
}, table => [
  index("idx_records_record_date").on(table.recordDate),
  index("idx_records_store_date").on(table.store, table.recordDate),
]);

export const monthEndPhotos = sqliteTable("month_end_photos", {
  store: text("store").notNull(),
  month: text("month").notNull(),
  photoKey: text("photo_key").notNull(),
  photoType: text("photo_type").notNull(),
  photoName: text("photo_name").notNull(),
  uploadedAt: text("uploaded_at").notNull(),
  photo2Key: text("photo2_key"),
  photo2Type: text("photo2_type"),
  photo2Name: text("photo2_name"),
  photo2UploadedAt: text("photo2_uploaded_at"),
}, table => [primaryKey({ columns: [table.store, table.month] })]);
