ALTER TABLE `component` ADD `draft_html` text;--> statement-breakpoint
ALTER TABLE `component` ADD `draft_script` text;--> statement-breakpoint
ALTER TABLE `component` ADD `draft_css` text;--> statement-breakpoint
ALTER TABLE `component` ADD `draft_label` text;--> statement-breakpoint
ALTER TABLE `component` ADD `draft_props_schema` text;--> statement-breakpoint
ALTER TABLE `component` ADD `has_draft` integer DEFAULT false NOT NULL;