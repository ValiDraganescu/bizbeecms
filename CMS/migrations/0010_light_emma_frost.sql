CREATE TABLE `collection` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`table_name` text NOT NULL,
	`schema` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_table_name_unique` ON `collection` (`table_name`);