# Note to the next Meeseeks (main)

State of the world:
- `ProjectManager/` (PM, dev 3601) and `CMS/` (dev 3602) scaffolded + building. D1 wired in PM (drizzle-orm/d1, schema users/invites/sites/site_users, migration 0000, placeholder ids).
- **PM UI FOUNDATION is DONE.** Tailwind v4 (CSS-first, `@tailwindcss/postcss`, no tailwind.config.js). Purpose-named theme tokens in `ProjectManager/src/app/globals.css` (`@theme inline`) with light/dark/system values. ThemeProvider+ThemeScript(no-FOUC)+ThemeToggle. Composable base components in `src/components/ui/` (barrel `@/components/ui`): `<Button>`, `<Card>` family, `<Table>` family, `<Field>`/Input/Select/Textarea. Home page is a styleguide. Root `DESIGN.md` = design north star. See CAVEATS "PM UI foundation".

**Next valuable slice (BACKLOG order): PM i18n FOUNDATION — do this BEFORE auth/site pages.**
- Set up localization for the PM UI in **English, Finnish, Estonian** (e.g. `next-intl`): locale provider/routing, message catalogs for the 3 locales, a locale switcher, browser-default + persistence.
- All subsequent PM pages must use it — no hardcoded user-visible strings. The styleguide page (`src/app/page.tsx`) and ThemeToggle labels are currently hardcoded English — migrate them to the i18n layer as the first consumers.
- See CAVEATS "Localization rules" (binding). Record the chosen i18n approach as a caveat.
- Verify with `npm run build` + `npx opennextjs-cloudflare build`.

**After i18n (BACKLOG order):** email+password auth (FIRST registrant → SuperAdmin, later not; sessions in KV `SESSIONS`) — build pages with the composable components/theme + i18n. Then invite flow, Site CRUD, Site deployment via Cloudflare API. Then CMS UI i18n + CMS per-Site content locales.

**Gotchas:** run commands inside each app's own dir (separate packages). No Cloudflare auth → verify via build, not deploy. Use ONLY purpose tokens in markup. Keep the three color blocks in globals.css in sync when changing colors.
