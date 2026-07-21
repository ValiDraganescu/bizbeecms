CREATE TABLE `chat_agent` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`system_prompt` text NOT NULL,
	`model` text,
	`enabled` integer DEFAULT true NOT NULL,
	`welcome_message` text,
	`limits` text DEFAULT '{}' NOT NULL,
	`data_sources` text DEFAULT '[]' NOT NULL,
	`collections` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_agent_name_unique` ON `chat_agent` (`name`);--> statement-breakpoint
CREATE TABLE `usage_counter` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
