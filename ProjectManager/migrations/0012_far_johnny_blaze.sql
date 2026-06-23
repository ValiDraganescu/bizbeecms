ALTER TABLE `sites` ADD `openrouter_minting_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `openrouter_key_hash` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `openrouter_monthly_limit_usd` integer;