-- Component system moved from a JSON `tree` to a Handlebars-HTML `html` column.
-- Existing trees can't be auto-migrated (start-from-scratch decision), so wipe
-- the table before swapping the column. Pages referencing a now-gone component
-- already render a visible placeholder (planPage's unknown-component path).
DELETE FROM `component`;--> statement-breakpoint
ALTER TABLE `component` ADD `html` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `component` DROP COLUMN `tree`;
