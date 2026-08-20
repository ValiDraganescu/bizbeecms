CREATE TABLE `rollout_items` (
	`id` text PRIMARY KEY NOT NULL,
	`rollout_id` text NOT NULL,
	`site_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`position` integer NOT NULL,
	`skip_reason` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`rollout_id`) REFERENCES `rollouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rollout_items_rollout_idx` ON `rollout_items` (`rollout_id`,`status`);--> statement-breakpoint
CREATE TABLE `rollouts` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`target_version` text NOT NULL,
	`target_ref` text NOT NULL,
	`parallelism` integer NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
