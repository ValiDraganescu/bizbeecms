# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entry too)
**Stop all CMS-internal work.** The ONLY remaining goal: get the **ProjectManager deployed to Cloudflare**, and from that deployed PM trigger a **real CMS-website deploy**. CMS content i18n / further CMS features are DEFERRED. Do not pick CMS tasks.

## State of the world (all code-complete + build-gated; git is the truth — `git log --oneline`)
- PM: UI foundation, i18n (EN/FI/ET cookie-based), email+password auth (first user→SuperAdmin), invite flow, Site CRUD, **Site-deploy engine + CMS-bundle artifact + Deploy UI** all DONE.
- The deploy path is **code-complete end-to-end** EXCEPT the live network call: `deploySiteAction` → `buildCmsBundle()` (committed ~4.2MB artifact) → `deploySite` → Cloudflare Workers Script-Upload API. It returns `notConfigured` (graceful, marks Site `failed`) without `CF_API_TOKEN`+`CF_ACCOUNT_ID`.
- **Blocker for the LIVE deploy:** no Cloudflare account/auth in this env. Real `wrangler deploy` of PM, real D1/KV creation (placeholder zero-ids in `wrangler.jsonc`), and the real Script-Upload are ALL unexercised.

## Next valuable slices — all aimed at de-risking/enabling the live deploy (pick ONE, verifiable without CF auth):
1. **Deploy runbook / DEPLOY.md** — exact ordered steps to take PM live: `wrangler login`, `wrangler d1 create bizbeecms` + `kv namespace create SESSIONS` → paste real ids into `wrangler.jsonc` (replace zero-id placeholders), `wrangler d1 migrations apply bizbeecms --remote`, set `CF_API_TOKEN`(scoped Workers Scripts:Edit)+`CF_ACCOUNT_ID` as PM Worker secrets, `npm run bundle:cms`, `npx opennextjs-cloudflare build`, `wrangler deploy`. Then the in-app PM→CMS deploy flow. The single most valuable next artifact — the user needs it to actually go live.
2. **Pre-deploy validation script** — a checked-in script that fails LOUDLY if `wrangler.jsonc` still has placeholder zero-ids, if `cms-bundle.generated.js` is missing/stale, or if required compat flags (`nodejs_compat`, `global_fetch_strictly_public`) are absent. De-risks a botched first deploy.
3. **Bundle-boot self-check** — validate the committed CMS bundle's shape/integrity (entry `worker.js` present, expected exports, non-empty) as a test, since live boot is the one unverified link (esbuild vs wrangler's own OpenNext bundler — see CAVEATS "CMS bundle production").
4. **Smoke-test the credential-less deploy flow** end-to-end (action→bundle→engine→state machine) so a deploy with no CF auth produces the correct UX (Site → `failed` + right i18n error), and verify `deploy.errors.*` key parity across EN/FI/ET.

## Gotchas
- Run PM commands inside `ProjectManager/`. Per the directive, avoid changing `CMS/` source.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run it while `next dev` is on 3601 (corrupts `.next`). Check `lsof -ti:3601`.
- Use ONLY purpose theme tokens in any markup; all user-visible strings via i18n (3-catalog parity).
- Tests: `npm test` (`node --test`, dependency-free, relative `.ts` imports, no `@/` alias).
