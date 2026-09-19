CREATE TABLE `line_managers` (
  `line_user_id` text PRIMARY KEY NOT NULL,
  `store` text NOT NULL,
  `display_name` text NOT NULL,
  `linked_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_line_managers_store` ON `line_managers` (`store`);
--> statement-breakpoint
CREATE TABLE `line_link_codes` (
  `code` text PRIMARY KEY NOT NULL,
  `store` text NOT NULL,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_line_link_codes_store` ON `line_link_codes` (`store`);
--> statement-breakpoint
CREATE TABLE `line_approval_tokens` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `record_id` text NOT NULL,
  `store` text NOT NULL,
  `expires_at` text NOT NULL,
  `used_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_line_approval_record` ON `line_approval_tokens` (`record_id`);
--> statement-breakpoint
PRAGMA optimize;
