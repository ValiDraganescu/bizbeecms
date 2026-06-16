# Backlog — main
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- DONE: Scaffold the PM Next.js app under `ProjectManager/` wired for Cloudflare Workers deployment (OpenNext / wrangler config). Hello-world + /api/health building; `opennextjs-cloudflare build` emits a worker bundle.
- DONE: Scaffold the default Next.js install under `CMS/` (mirrors PM OpenNext/wrangler wiring; `next build` + `opennextjs-cloudflare build` both pass).
- DONE: Add Cloudflare D1 binding + initial schema/migrations for users, invites, sites, site_users. (drizzle-orm/d1; schema in src/db/schema.ts, migration 0000 generated; DB+SESSIONS bindings in wrangler.jsonc with placeholder ids.)
- TODO: **UI foundation (do BEFORE building any auth/site pages)** — set up Tailwind CSS in `ProjectManager/`, a light+dark theme using purpose-named color tokens (CSS vars / Tailwind theme: surface, foreground, border, primary, danger, etc. — never raw color names), a theme toggle/provider respecting system preference, and a small set of composable base components (e.g. `<Table>` family, `<Button>`, `<Card>`, form fields) demonstrating composition-over-props. See CAVEATS "UI design rules".
- TODO: **PM i18n foundation (do alongside/right after UI foundation, BEFORE auth pages)** — set up localization for the ProjectManager UI in **English, Finnish, Estonian** (e.g. next-intl): locale routing/provider, message catalogs for the 3 locales, a locale switcher, browser-default + persistence. All subsequent PM pages must use it — no hardcoded user-visible strings. See CAVEATS "Localization rules".
- TODO: Email+password auth — registration where the FIRST user becomes SuperAdmin; subsequent users do not. Sessions in D1/KV. (Build the auth UI with the composable components + theme + i18n from the foundation tasks; all copy localized EN/FI/ET.)
- TODO: Invite flow — SuperAdmin/Admin invite Admin/SiteManager with role + country scoping, enforced server-side.
- TODO: Site CRUD — create/list/manage Sites; assign PM users to a Site.
- TODO: Site deployment — PM calls Cloudflare API to provision a CMS Worker per Site; report deploy status. Must work from the deployed PM.
- TODO: CMS UI i18n — localize the CMS admin/UI chrome in English, Finnish, Estonian (same fixed set + approach as PM). See CAVEATS "Localization rules".
- TODO: CMS content localization — allow configuring an arbitrary set of user-facing **content** languages per Site (data-driven, distinct from the fixed EN/FI/ET admin-UI locales), and serve/render published content in the configured content locales.
