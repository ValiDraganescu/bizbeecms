CREATE TABLE `invite_countries` (
	`invite_id` text NOT NULL,
	`country` text NOT NULL,
	PRIMARY KEY(`invite_id`, `country`),
	FOREIGN KEY (`invite_id`) REFERENCES `invites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_countries` (
	`user_id` text NOT NULL,
	`country` text NOT NULL,
	PRIMARY KEY(`user_id`, `country`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `invites` DROP COLUMN `country`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `country`;