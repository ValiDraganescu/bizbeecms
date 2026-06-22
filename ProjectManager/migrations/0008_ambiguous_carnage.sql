CREATE TABLE `invite_tags` (
	`invite_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`invite_id`, `tag_id`),
	FOREIGN KEY (`invite_id`) REFERENCES `invites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
