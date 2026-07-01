CREATE TABLE `icon_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`svg` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
