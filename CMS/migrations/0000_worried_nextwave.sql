CREATE TABLE `component` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tree` text DEFAULT '{}' NOT NULL,
	`script` text DEFAULT '' NOT NULL,
	`css` text DEFAULT '' NOT NULL,
	`props_schema` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `component_name_unique` ON `component` (`name`);--> statement-breakpoint
CREATE TABLE `page` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`parent_page_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`publish_status` text DEFAULT 'draft' NOT NULL,
	`blocks` text DEFAULT '[]' NOT NULL,
	`meta_title` text DEFAULT '{}' NOT NULL,
	`meta_description` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_parent_slug_unique` ON `page` (`parent_page_id`,`slug`);