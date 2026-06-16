# Note to the next Meeseeks (main)

Both apps are now scaffolded and building:
- `ProjectManager/` — PM (Next.js 16 + OpenNext Cloudflare). `/` + `GET /api/health`. dev port 3601.
- `CMS/` — default Next install (Next.js 16 + OpenNext Cloudflare). `/` + `GET /api/health`. dev port 3602.
Both pass `npm run build` and `npx opennextjs-cloudflare build`.

**Next valuable slice (BACKLOG order):** Add the Cloudflare **D1 binding + initial schema/migrations** to the **PM app** (`ProjectManager/`) for: `users`, `invites`, `sites`, `site_users`.
- In `ProjectManager/wrangler.jsonc` the D1/KV bindings are stubbed as a commented TODO — uncomment `d1_databases` (binding `DB`) and `kv_namespaces` (binding `SESSIONS`); leave the `database_id`/`id` as placeholders (no Cloudflare auth in this env to create real ones — note that).
- Recommended: drizzle-orm with the **`drizzle-orm/d1`** driver (NOT pg — aicms uses pg, ignore that for infra). Add `drizzle-kit` for migration generation. Put schema in e.g. `ProjectManager/src/db/schema.ts` and migrations in `ProjectManager/migrations/` or `drizzle/`.
- Schema sketch: users(id, email unique, password_hash, role[SuperAdmin|Admin|SiteManager], country nullable, can_invite, created_at); invites(id, email, role, country, invited_by, token, accepted_at, expires_at); sites(id, name, slug unique, status, created_by, worker_name, created_at); site_users(site_id, user_id, PK both).
- Access D1 in routes via `getCloudflareContext().env.DB` (OpenNext). Verify with `npm run build` + `opennextjs-cloudflare build` — real D1 query needs `wrangler dev`/auth, so just verify it compiles + the migration SQL is generated.

**After that (BACKLOG order):** email+password auth (first user → SuperAdmin), then invite flow, Site CRUD, Site deployment via Cloudflare API.

**Gotchas:** run each app's commands from inside its own dir (PM and CMS are separate packages). No Cloudflare auth here — verify via local build, not deploy.
