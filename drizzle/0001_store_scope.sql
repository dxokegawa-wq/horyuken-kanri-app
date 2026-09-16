ALTER TABLE `records` ADD `store` text DEFAULT '桶川店' NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_records_store_date` ON `records` (`store`,`record_date`);
