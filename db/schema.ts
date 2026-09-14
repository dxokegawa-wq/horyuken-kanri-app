import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const records = sqliteTable("records", {
  id: text("id").primaryKey(),
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
  createdAt: text("created_at").notNull(),
  confirmedBy: text("confirmed_by"),
  confirmedAt: text("confirmed_at"),
  signatureKey: text("signature_key"),
}, table => [index("idx_records_record_date").on(table.recordDate)]);
