# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entry too)
**Stop all CMS-internal work.** The ONLY remaining goal: get the **ProjectManager deployed to Cloudflare**, and from that deployed PM trigger a **real CMS-website deploy**. CMS content i18n / further CMS features are DEFERRED. Do not pick CMS tasks.

## State of the world (git is the truth — `git log --oneline`)
- PM: UI, i18n (EN/FI/ET cookie), auth, invite flow, Site CRUD, Site-deploy engine + CMS-bundle artifact + Deploy UI, `npm run preflight` validator — all DONE.
- **NEW this run:** root **`DEPLOY.md`** — the full ordered runbook to go live (login → d1/kv create → paste real ids over wrangler.jsonc zero-ids → cf-typegen → db:migrate --remote → secrets CF_API_TOKEN/CF_ACCOUNT_ID/APP_ORIGIN → bundle:cms → preflight → deploy → first-user bootstrap → in-app Site Deploy → curl verify). Has a quick-ref command block + troubleshooting table. The human follows this when they have CF auth.
- Deploy path is code-complete end-to-end EXCEPT the live network call. Returns `notConfigured`/marks Site `failed` without `CF_API_TOKEN`+`CF_ACCOUNT_ID`.
- **Blocker for the LIVE deploy:** still no Cloudflare account/auth in this env. Real `wrangler deploy`, D1/KV creation, and the Script-Upload remain unexercised. The runbook is the human-executable bridge for that.

## Next valuable slices (pick ONE, verifiable without CF auth):
1. **Bundle-boot self-check** — validate the committed CMS bundle boots / has the right shape beyond size (entry exports `worker.js` with a `fetch` handler, no unresolved bare app imports left in the source). This is the ONE unverified link (esbuild vs wrangler's OpenNext bundler; see CAVEATS "CMS bundle production" + DEPLOY.md step 11 ⚠️). High value: de-risks the only thing the runbook can't pre-verify.
2. **Smoke-test the credential-less deploy flow** end-to-end (action→bundle→engine→state machine) → Site `failed` + correct i18n error; verify `sites.deploy.errors.*` key parity EN/FI/ET.
3. **Wire preflight into a `predeploy` npm hook** so `npm run deploy` can't skip it (npm runs `predeploy` automatically before `deploy`). Cheap, closes a footgun. Update DEPLOY.md if you do (the manual `npm run preflight` step 8 becomes automatic).
4. **Make preflight also assert APP_ORIGIN-when-needed / migration presence** — extend the offline validator's coverage of first-deploy mistakes.

## Gotchas
- Run PM commands inside `ProjectManager/`. Avoid changing `CMS/` source (directive).
- DEPLOY.md is at the REPO ROOT (not under ProjectManager/). Keep it in sync if you change deploy scripts/wrangler.jsonc.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run it while `next dev` is on 3601 (corrupts `.next`). Check `lsof -ti:3601`.
- preflight/bundle scripts are plain `.mjs` (no TS gate); their tests are `.test.mjs` under `scripts/`, covered by the `npm test` glob.
- Use ONLY purpose theme tokens in markup; all user-visible strings via i18n (3-catalog parity).
- Tests: `npm test` (`node --test`, dependency-free, relative imports, no `@/` alias).
