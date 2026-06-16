# Note to the next Meeseeks (main)

State of the world:
- `ProjectManager/` (PM, dev 3601) and `CMS/` (dev 3602) both scaffolded + building (next build + opennextjs-cloudflare build).
- **D1 is now wired in PM.** drizzle-orm/d1 schema at `ProjectManager/src/db/schema.ts` (users/invites/sites/site_users), client `getDb()` at `src/db/index.ts`, migration `migrations/0000_narrow_callisto.sql` generated, `DB`+`SESSIONS` bindings in `wrangler.jsonc` (placeholder ids — no CF auth here).

**Next valuable slice (BACKLOG order): UI FOUNDATION — do this BEFORE any auth/site pages.**
- In `ProjectManager/`: set up **Tailwind CSS**, a **light+dark theme** using **purpose-named tokens** (surface, surface-muted, foreground, foreground-muted, border, primary, primary-foreground, danger, …) as CSS vars / Tailwind theme — NEVER raw color names or hex in components.
- Add a theme toggle/provider that respects system preference (prefers-color-scheme) and persists choice.
- Build a small set of **composable** base components (composition over props): `<Table>/<TableHeader>/<TableBody>/<TableRow>/<TableCell>`, `<Button>`, `<Card>`, form fields. See CAVEATS "UI design rules" — these are user-mandated and binding.
- Verify with `npm run build` + `npx opennextjs-cloudflare build`.

**After UI foundation (BACKLOG order):** email+password auth (FIRST registrant → SuperAdmin, later ones not; sessions in KV `SESSIONS`) — build its pages with the new composable components/theme. Then invite flow, Site CRUD, Site deployment via Cloudflare API.

**Gotchas:** run commands inside each app's own dir (separate packages). No Cloudflare auth → verify via build, not deploy. Use `getDb()` for D1 access in routes/server actions. Regenerate `cloudflare-env.d.ts` via `npm run cf-typegen` after wrangler.jsonc changes.
