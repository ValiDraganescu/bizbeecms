# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Stop all CMS-internal work.** The ONLY remaining goal: get the **ProjectManager deployed to Cloudflare**, and from that deployed PM trigger a **real CMS-website deploy**. CMS content i18n / further CMS features are DEFERRED. Do not pick CMS-feature tasks. (Touching `CMS/`'s OpenNext *config* to fix the deploy blocker below is allowed — that's deploy work, not a CMS feature.)

## State of the world (git is the truth — `git log --oneline`)
- PM: UI, i18n (EN/FI/ET cookie), auth, invite flow, Site CRUD, Site-deploy engine + CMS-bundle artifact + Deploy UI, `npm run preflight`, root `DEPLOY.md` runbook — all DONE.
- **NEW this run:** CMS bundle **boot self-check** — `npm run bundle:selfcheck` (`scripts/bundle-selfcheck.mjs`), also folded into `npm run preflight`. Static validation of the committed CMS Worker artifact: entry contract, unresolved-import detection, and it **surfaced a real live-deploy blocker** (see below). 22/22 tests.
- Deploy path is code-complete EXCEPT the live network call (no CF auth in this env).

## ⚠️ REAL LIVE-DEPLOY BLOCKER UNCOVERED THIS RUN — Durable Objects
The CMS bundle `export`s DO classes (`DOQueueHandler`/`DOShardedTagCache`/`BucketCachePurge`) but the Script-Upload metadata (`buildScriptUploadForm` in `src/lib/deploy/script-upload.ts`) declares **no `durable_objects`/`migrations`**. Cloudflare rejects that. **This is the most valuable next slice** — and it's mostly fixable OFFLINE:

## Next valuable slices (pick ONE; #1 is highest value):
1. **Fix the DO gap (offline-buildable).** Prefer option (b): disable OpenNext's DO caches so the CMS worker stops exporting DOs at all (the milestone CMS is the default Next install — it has no cache need). Add an `open-next.config.ts` to `CMS/` selecting the dummy/no-op incremental cache + tag cache + queue (see `@opennextjs/cloudflare` docs), `npm run bundle:cms`, then `npm run bundle:selfcheck` should no longer warn about DOs. Verify with the OpenNext build gate. (Option (a) — declare `durable_objects.bindings` + a `migrations` tag in `buildScriptUploadForm` — also works but is only fully testable against a live account.) Either way the self-check + a test prove it.
2. **Wire preflight into a `predeploy` npm hook** so `npm run deploy` can't skip it (npm auto-runs `predeploy`). Cheap footgun-closer. Update DEPLOY.md step 8 → automatic.
3. **Smoke-test the credential-less deploy flow** (action→bundle→engine→state machine) → Site `failed` + correct i18n error; verify `sites.deploy.errors.*` key parity EN/FI/ET.

## Gotchas
- Run PM commands inside `ProjectManager/`. DEPLOY.md is at the REPO ROOT — keep it in sync if you change deploy scripts/wrangler.jsonc/the deploy flow.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run it while `next dev` is on 3601 (corrupts `.next`). Check `lsof -ti:3601`.
- Bundle/preflight/self-check scripts are plain `.mjs` (no TS gate); tests are `.test.mjs` under `scripts/`, covered by the `npm test` glob. Keep tests dependency-free, relative imports, no `@/` alias.
- Self-check import-detection anchors on `\nimport` at column 0 — see CAVEATS "CMS bundle boot self-check" before touching that regex (the 4MB bundle embeds `from "x"` inside strings).
- Use ONLY purpose theme tokens in markup; all user-visible strings via i18n (3-catalog parity).
