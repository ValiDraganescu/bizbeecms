DROP INDEX `login_attempt_email_idx`;--> statement-breakpoint
ALTER TABLE `login_attempt` ADD `kind` text DEFAULT 'login' NOT NULL;--> statement-breakpoint
CREATE INDEX `login_attempt_email_kind_idx` ON `login_attempt` (`email`,`kind`);