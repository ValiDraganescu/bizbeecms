# Note to the next Meeseeks (main)

State of the world (verify against `git log --oneline` + filesystem — the JOURNAL lagged history badly until the 2026-06-17 catch-up entry; trust the files):
- `ProjectManager/` (PM, dev 3601) + `CMS/` (dev 3602) scaffolded + building on Cloudflare/OpenNext. D1 + drizzle wired in PM.
- **DONE so far (all build-gate verified):** PM UI foundation (Tailwind v4, purpose-token light/dark/system theme, composable `@/components/ui` incl. `<Combobox>`, `<Alert>`, `<Badge>`); design-system page; **i18n** (next-intl v4, cookie-based EN/FI/ET); **auth** (email+password, first-registrant→SuperAdmin, KV sessions); **invite flow** (role+multi-country scope, accept-invite page, hardened origin); **Site CRUD** (create/list/detail/edit + assign users, country-scoped authz server-enforced) — `src/lib/site/`, `src/app/(app)/sites/`. See CAVEATS for each.

**Next valuable slice (BACKLOG order): SITE DEPLOYMENT.**
- PM calls the **Cloudflare API** to provision a CMS Worker per Site and report deploy status back. Site row already has `status` (draft|deploying|deployed|failed) and `worker_name` (currently null) fields ready for this. The CMS to deploy is the plain default install in `CMS/` (its `wrangler.jsonc` has no D1/KV; PM overrides the Worker `name` per-Site).
- **Must work from the DEPLOYED PM** (PM running on Cloudflare triggers the deploy) — that's the milestone's hardest acceptance criterion. Cloudflare-native only.
- **Big blocker to confirm with the user first:** there is NO Cloudflare account/auth/API token in this env, so a real deploy can't be exercised — only request-building + the status state-machine can be type/build-verified. Decide with the user: (a) build the deploy orchestration + a Cloudflare API client + a `deployAction` that flips status draft→deploying→deployed/failed, read an API token from a binding/secret, and stub/guard the actual API call so it's testable; or (b) something narrower. Don't burn a run on something unverifiable without aligning first.
- Build all UI with `@/components/ui` + theme + i18n (`sites` namespace, EN/FI/ET parity). Reuse `lib/site` authz so only managers of a Site can trigger its deploy.

**After deployment (BACKLOG order):** CMS UI i18n (EN/FI/ET, same approach as PM), then CMS per-Site **content** locales (data-driven, distinct from the fixed admin-UI locales).

**Gotchas (see CAVEATS for full text):** run commands inside each app's own dir (separate npm packages, not a workspace). Kill any stray `next dev` on 3601 before `opennextjs-cloudflare build` (it corrupts `.next`); `rm -rf .next .open-next` then build. No Cloudflare auth → verify via tsc + build, never real deploy/D1/KV. Use ONLY purpose tokens in markup. Keep the three color blocks in globals.css in sync.
