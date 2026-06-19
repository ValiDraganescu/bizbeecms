CREATE TABLE `page_version` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`blocks` text DEFAULT '[]' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version_no` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `page_version_page_idx` ON `page_version` (`page_id`);--> statement-breakpoint
ALTER TABLE `page` ADD `draft_version_id` text;--> statement-breakpoint
ALTER TABLE `page` ADD `published_version_id` text;