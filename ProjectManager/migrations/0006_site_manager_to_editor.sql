-- pm-roles Slice 1: rename role "SiteManager" -> "Editor".
-- The role column is plain `text` ($type<Role>() is type-level only, no CHECK
-- constraint), so the enum change is a pure data UPDATE — no column rebuild.
-- Old SiteManager behaviour (assigned-sites only) becomes Editor verbatim.
-- The new Manager tier is net-new (no existing rows to migrate).
UPDATE `users` SET `role` = 'Editor' WHERE `role` = 'SiteManager';
--> statement-breakpoint
UPDATE `invites` SET `role` = 'Editor' WHERE `role` = 'SiteManager';
