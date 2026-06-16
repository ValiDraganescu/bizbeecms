# Backlog — main
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- TODO: Scaffold the PM Next.js app under a `ProjectManager/` (or `apps/pm/`) directory wired for Cloudflare Workers deployment (OpenNext / wrangler config). Get a hello-world building.
- TODO: Scaffold the default Next.js install under `CMS/`.
- TODO: Add Cloudflare D1 binding + initial schema/migrations for users, invites, sites, site_users.
- TODO: Email+password auth — registration where the FIRST user becomes SuperAdmin; subsequent users do not. Sessions in D1/KV.
- TODO: Invite flow — SuperAdmin/Admin invite Admin/SiteManager with role + country scoping, enforced server-side.
- TODO: Site CRUD — create/list/manage Sites; assign PM users to a Site.
- TODO: Site deployment — PM calls Cloudflare API to provision a CMS Worker per Site; report deploy status. Must work from the deployed PM.
