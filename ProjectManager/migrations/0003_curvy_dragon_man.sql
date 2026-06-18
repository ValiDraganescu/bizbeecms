CREATE TABLE `deploy_events` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`step` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer,
	`error` text,
	`ram_available_mb` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
