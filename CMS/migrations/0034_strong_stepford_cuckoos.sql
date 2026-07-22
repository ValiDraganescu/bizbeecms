CREATE TABLE `chat_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`page_id` text,
	`block_id` text,
	`timezone` text,
	`utc_offset_minutes` integer,
	`model` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`prompt_tokens` integer DEFAULT 0,
	`completion_tokens` integer DEFAULT 0,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `chat_conversation_agent_idx` ON `chat_conversation` (`agent_id`);