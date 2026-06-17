# Note to the next Meeseeks (main)

State of the world (verify against `git log --oneline` + filesystem — files are truth):
- `ProjectManager/` (PM, dev 3601) + `CMS/` (dev 3602) — both scaffolded, building on Cloudflare/OpenNext. D1 + drizzle in PM.
- **DONE so far (build-gate verified):** PM UI foundation (Tailwind v4, purpose tokens, theme, `@/components/ui`); design-system page; PM i18n (next-intl v4, cookie EN/FI/ET); auth (email+password, first→SuperAdmin, KV sessions); invite flow (role+multi-country); Site CRUD; Site-deploy ENGINE; CMS bundle (committed `cms-bundle.generated.js` + `buildCmsBundle()`); Deploy UI; **CMS UI i18n (NEW — next-intl v4 cookie EN/FI/ET in `CMS/`)**. See CAVEATS for each.

**Both the Site-deployment slice (engine+bundle+UI) AND CMS UI i18n are DONE in code. The two remaining big things are: (a) the live end-to-end deploy (needs CF auth this env lacks), and (b) CMS CONTENT localization (a whole new track).**

Pick ONE of these (top is the natural next un-blocked slice):

1. **CMS content localization (BIG — flag to driver as its own subgoal).** Configure an arbitrary set of user-facing **content** languages PER SITE (data-driven, distinct from the fixed EN/FI/ET admin-UI locales just built) and serve/render published content in them. This is a coherent body of work — do a fitting first slice this run (e.g. the per-Site content-locales data model + a config UI) and **flag the new track in your `result`** so the driver can carve out a subgoal. Where the data lives: per-Site config likely needs the CMS to gain D1/KV bindings (its `wrangler.jsonc` deliberately has none yet — the PM deploy step overrides the Worker name per-Site; you'd need to decide how per-Site config reaches each CMS Worker: env vars at deploy, or a shared store). Mine `../aicms` for content-model/rendering patterns (it's Postgres, NOT a deploy ref — patterns only).

2. **Real end-to-end deploy (user-driven, needs auth).** Set `CF_API_TOKEN` (Workers Scripts: Edit) + `CF_ACCOUNT_ID` secrets on the deployed PM, click Deploy on a Site. THIS first validates the committed CMS artifact actually BOOTS on a Worker — our plain esbuild bundle may need tuning (loaders/defines/DO+wasm) vs wrangler's bundler. See CAVEATS "CMS bundle".

3. **CMS UI foundation/design-system parity** (optional polish): the CMS is still the default inline-styled Next page. If content-loc work needs admin screens, port PM's Tailwind v4 tokens + `@/components/ui` into `CMS/` first (then the `LocaleSwitcher` can use a real `<Combobox>` instead of the native `<select>`).

**Gotchas (see CAVEATS for full text):** PM and CMS are SEPARATE npm packages — run each app's commands inside its own dir. **After ANY `CMS/` change run `npm run bundle:cms` in `ProjectManager/`** or deploys ship a stale CMS. Kill stray `next dev` on 3601/3602 before `opennextjs-cloudflare build` (corrupts `.next`); `rm -rf .next .open-next` then build. No CF auth → verify via tsc + `npm test` + build, never a real deploy/D1/KV. CMS i18n is cookie-based (copy PM exactly); keep en/fi/et key parity; use `getTranslations`/`useTranslations` for all CMS copy.
