# Note to the next Meeseeks (main)

State of the world (verify against `git log --oneline` + filesystem — files are truth):
- `ProjectManager/` (PM, dev 3601) + `CMS/` (dev 3602) scaffolded + building on Cloudflare/OpenNext. D1 + drizzle in PM.
- **DONE so far (build-gate verified):** PM UI foundation (Tailwind v4, purpose-token light/dark/system theme, composable `@/components/ui` incl. `<Combobox>`/`<Alert>`/`<Badge>`); design-system page; **i18n** (next-intl v4, cookie-based EN/FI/ET); **auth** (email+password, first-registrant→SuperAdmin, KV sessions); **invite flow** (role+multi-country scope, accept-invite, hardened origin); **Site CRUD** (create/list/detail/edit + assign users, country-scoped authz) — `src/lib/site/`, `src/app/(app)/sites/`; **Site-deploy ENGINE core** — `src/lib/deploy/` (Cloudflare Script-Upload client + deploy state-machine + `setSiteDeployStatus`); **CMS bundle production** — committed pre-bundled artifact (`scripts/build-cms-bundle.mjs` → `src/lib/deploy/cms-bundle.generated.js`) + `buildCmsBundle()` loader. See CAVEATS for each.

**Site deployment: engine + bundle are DONE. Only the UI slice (and the later live deploy) remain.**

1. **Deploy UI (DO THIS NEXT — everything it needs exists).** Wire the engine to the Site detail page:
   - A `deploySiteAction` server action in `src/app/(app)/sites/actions.ts` (or a new file) — **authz-gated via `lib/site/authz`**: only a user who can MANAGE that Site (reach = country OR `site_users` assignment) may deploy. Re-enforce server-side; never trust the client.
   - The action calls `buildCmsBundle()` (from `@/lib/deploy`); if it returns `null`, surface a clear "CMS bundle not built" error (shouldn't happen — artifact is committed). Then `deploySite({ siteId, bundle })`.
   - A "Deploy" button + live **status indicator** (use `<Badge>`; site.status enum = draft|deploying|deployed|failed) on `sites/[id]/page.tsx`. Disable while `deploying` (engine also guards `alreadyDeploying`). Show `worker_name` once deployed.
   - i18n: add a `sites.deploy.*` namespace to ALL THREE catalogs (`messages/{en,fi,et}.json`) — keep key parity. Map `DeployErrorKey` (`notFound|alreadyDeploying|notConfigured|uploadFailed|unknown`) → localized messages.
   - Verify: tsc + `npm test` + `npx opennextjs-cloudflare build` (kill any dev on 3601 first, `rm -rf .next .open-next`).

2. **Real end-to-end deploy (later/user-driven).** Set `CF_API_TOKEN` (Workers Scripts: Edit) + `CF_ACCOUNT_ID` secrets on the deployed PM. THIS is where the committed CMS artifact's *content* gets validated for the first time — our plain esbuild bundle may need tuning (loaders/defines/DO+wasm) vs. wrangler's own bundler to actually BOOT. See CAVEATS "CMS bundle". No CF auth here, so verify everything else via tsc + `npm test` + build until then.

**After deployment (BACKLOG order):** CMS UI i18n (EN/FI/ET, same approach as PM), then CMS per-Site **content** locales (data-driven, distinct from the fixed admin-UI locales).

**Gotchas (see CAVEATS for full text):** run commands inside each app's own dir (separate npm packages). Kill any stray `next dev` on 3601 before `opennextjs-cloudflare build` (corrupts `.next`); `rm -rf .next .open-next` then build. No CF auth → verify via tsc + `npm test` + build, never real deploy/D1/KV. `npm test` uses `node --test`; keep test files dependency-free + relative `.ts` imports (tsconfig-excluded, checked by running). **Regenerate `cms-bundle.generated.js` (`npm run bundle:cms`) after ANY `CMS/` change** or deploys ship stale CMS. Use ONLY purpose tokens in markup; keep the three color blocks in globals.css in sync.
