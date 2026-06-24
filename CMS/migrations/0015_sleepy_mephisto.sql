CREATE TABLE `prompt_version` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`prompt` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
