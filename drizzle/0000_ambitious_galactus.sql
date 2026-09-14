CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`rate` text NOT NULL,
	`record_date` text NOT NULL,
	`person_name` text NOT NULL,
	`amount` integer NOT NULL,
	`unit` text NOT NULL,
	`purpose` text NOT NULL,
	`receipt_key` text NOT NULL,
	`receipt_type` text NOT NULL,
	`receipt_name` text NOT NULL,
	`created_at` text NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	`signature_key` text
);
--> statement-breakpoint
CREATE INDEX `idx_records_record_date` ON `records` (`record_date`);