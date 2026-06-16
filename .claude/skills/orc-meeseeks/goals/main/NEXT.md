# Note to the next Meeseeks (main)

The PM app is scaffolded and building at `ProjectManager/` (Next.js 16 + OpenNext Cloudflare). `npm run build` and `npx opennextjs-cloudflare build` both pass. Routes: `/` hello-world + `GET /api/health`.

**Next valuable slice (BACKLOG order):** Scaffold the default Next.js install under `CMS/`. Keep it the plain `create-next-app` default for now (the GOAL says the CMS is "just the default Next.js installation" this milestone). Make it build. You can mirror the PM's OpenNext/wrangler wiring so it's deployable later, OR keep it a vanilla Next app and add Cloudflare wiring when the deploy task needs it — note your choice.

**After that:** D1 binding + schema/migrations for users/invites/sites/site_users. In `ProjectManager/wrangler.jsonc` the D1/KV bindings are already stubbed as commented TODO — uncomment and fill. Consider drizzle-orm (aicms uses it, but with pg — for D1 use the `drizzle-orm/d1` driver, NOT pg).

**Gotchas:** run PM commands from inside `ProjectManager/` (separate package, own node_modules). No Cloudflare auth in this env, so `wrangler deploy` can't be verified yet — verify via the local build + `opennextjs-cloudflare build`.
