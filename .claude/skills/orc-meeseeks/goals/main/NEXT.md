# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entry too)
**Stop all CMS-internal work.** The ONLY remaining goal: get the **ProjectManager deployed to Cloudflare**, and from that deployed PM trigger a **real CMS-website deploy**. CMS content i18n / further CMS features are DEFERRED. Do not pick CMS tasks.

## State of the world (git is the truth — `git log --oneline`)
- PM: UI, i18n (EN/FI/ET cookie), auth, invite flow, Site CRUD, Site-deploy engine + CMS-bundle artifact + Deploy UI — all DONE.
- Deploy path is code-complete end-to-end EXCEPT the live network call (`deploySiteAction`→`buildCmsBundle()`→`deploySite`→Cloudflare Script-Upload). Returns `notConfigured`/marks Site `failed` without `CF_API_TOKEN`+`CF_ACCOUNT_ID`.
- **NEW this run:** `npm run preflight` (`ProjectManager/scripts/preflight-deploy.mjs`) — offline pre-deploy validator. Fails loudly on placeholder zero-ids, missing compat flags, missing/empty CMS bundle. Self-tested (`npm test` → 14/14). USE IT before any real deploy.
- **Blocker for the LIVE deploy:** no Cloudflare account/auth in this env. Real `wrangler deploy`, real D1/KV creation (placeholder zero-ids in `wrangler.jsonc` — preflight now flags them), and the real Script-Upload are ALL unexercised.

## Next valuable slices (pick ONE, verifiable without CF auth):
1. **DEPLOY.md runbook** — the single most valuable remaining artifact. Exact ordered steps to go live: `wrangler login`, `wrangler d1 create bizbeecms` + `wrangler kv namespace create SESSIONS` → paste real ids into `wrangler.jsonc` (replace zero-ids), `wrangler d1 migrations apply bizbeecms --remote`, set `CF_API_TOKEN`(Workers Scripts:Edit)+`CF_ACCOUNT_ID` as PM Worker secrets, set `vars.APP_ORIGIN`, `npm run bundle:cms`, **`npm run preflight`** (final gate — should pass once ids are real), `npx opennextjs-cloudflare build`, `wrangler deploy`. Then the in-app PM→CMS deploy flow + how to verify the CMS Worker booted.
2. **Bundle-boot self-check** — validate the committed CMS bundle boots / has the right shape beyond size (entry exports, no unresolved app imports) — live boot is the one unverified link (esbuild vs wrangler's own OpenNext bundler; see CAVEATS "CMS bundle production").
3. **Smoke-test the credential-less deploy flow** end-to-end (action→bundle→engine→state machine) → Site `failed` + correct i18n error; verify `deploy.errors.*` key parity EN/FI/ET.
4. **Wire preflight into the deploy npm script** (e.g. `predeploy` hook) once a runbook exists, so `npm run deploy` can't skip it.

## Gotchas
- Run PM commands inside `ProjectManager/`. Avoid changing `CMS/` source (directive).
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run it while `next dev` is on 3601 (corrupts `.next`). Check `lsof -ti:3601`.
- preflight/bundle scripts are plain `.mjs` (no TS gate); their tests are `.test.mjs` under `scripts/` and are covered by the `npm test` glob.
- Use ONLY purpose theme tokens in markup; all user-visible strings via i18n (3-catalog parity).
- Tests: `npm test` (`node --test`, dependency-free, relative imports, no `@/` alias).
