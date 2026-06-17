# Note to the next Meeseeks (main)

State of the world (verify against `git log --oneline` + filesystem — files are truth):
- `ProjectManager/` (PM, dev 3601) + `CMS/` (dev 3602) scaffolded + building on Cloudflare/OpenNext. D1 + drizzle in PM.
- **DONE so far (build-gate verified):** PM UI foundation (Tailwind v4, purpose tokens, theme, `@/components/ui`); design-system page; **i18n** (next-intl v4, cookie EN/FI/ET); **auth** (email+password, first-registrant→SuperAdmin, KV sessions); **invite flow** (role+multi-country scope, hardened origin); **Site CRUD** (`src/lib/site/`, `src/app/(app)/sites/`); **Site-deploy ENGINE** (`src/lib/deploy/`); **CMS bundle** (committed `cms-bundle.generated.js` + `buildCmsBundle()`); **Deploy UI** — `deploySiteAction` + Deploy/Redeploy card on Site detail, `sites.deploy.*` in all 3 catalogs. See CAVEATS for each.

**The entire Site-deployment slice (engine + bundle + UI) is DONE in code. The only deploy work left is the LIVE end-to-end run, which needs Cloudflare auth this env doesn't have.**

Pick ONE of these (top is the natural next un-blocked slice):

1. **CMS UI i18n (DO THIS NEXT — no CF auth needed, fully verifiable here).** Localize the CMS admin/UI chrome in EN/FI/ET, same approach as PM (next-intl v4, COOKIE-based — copy PM's `src/i18n/` wiring exactly; see CAVEATS "PM i18n" for WHY path-prefix fails the OpenNext gate). Work inside `CMS/` (its own npm package, dev 3602). Add `messages/{en,fi,et}.json`, `LocaleSwitcher`, wrap layout in `NextIntlClientProvider`. Verify from inside `CMS/`: tsc + `npx opennextjs-cloudflare build`. **After ANY `CMS/` change, regenerate the bundle: `npm run bundle:cms` in `ProjectManager/`** or deploys ship a stale CMS.

2. **CMS content localization (bigger — likely its own track).** After CMS UI i18n: configure an arbitrary set of user-facing **content** languages per Site (data-driven, distinct from the fixed EN/FI/ET admin-UI locales) and serve/render published content in them. This is a coherent body of work — flag it to the driver as a candidate subgoal rather than cramming it into one run.

3. **Real end-to-end deploy (user-driven, needs auth).** Set `CF_API_TOKEN` (Workers Scripts: Edit) + `CF_ACCOUNT_ID` secrets on the deployed PM, click Deploy on a Site. THIS first validates the committed CMS artifact actually BOOTS on a Worker — our plain esbuild bundle may need tuning (loaders/defines/DO+wasm) vs wrangler's bundler. See CAVEATS "CMS bundle".

**Gotchas (see CAVEATS for full text):** run commands inside each app's own dir (PM and CMS are separate npm packages). Kill any stray `next dev` on 3601/3602 before `opennextjs-cloudflare build` (corrupts `.next`); `rm -rf .next .open-next` then build. No CF auth → verify via tsc + `npm test` + build, never a real deploy/D1/KV. `npm test` = `node --test`; keep test files dependency-free + relative `.ts` imports. Use ONLY purpose tokens in markup; keep i18n key parity across en/fi/et.
