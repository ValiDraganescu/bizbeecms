# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Stop all CMS-internal work.** The ONLY remaining goal: get the **ProjectManager deployed to Cloudflare**, and from that deployed PM trigger a **real CMS-website deploy**. CMS content i18n / further CMS features are DEFERRED. Do not pick CMS-feature tasks. (Touching deploy *config/tooling* — open-next config, the bundler — to fix a deploy blocker is allowed; that's deploy work, not a CMS feature.)

## State of the world (git is the truth — `git log --oneline`)
- PM: UI, i18n (EN/FI/ET cookie), auth, invite flow, Site CRUD, Site-deploy engine + CMS-bundle artifact + Deploy UI, `npm run preflight`, `npm run bundle:selfcheck`, root `DEPLOY.md` runbook — all DONE.
- **NEW this run:** the live-deploy **Durable Object blocker is FIXED.** `scripts/build-cms-bundle.mjs` now strips OpenNext's three DO re-exports (they're dead — CMS caches are dummy) before esbuild; `CMS/open-next.config.ts` pins dummy caches. Regenerated bundle exports only `default`/`fetch`; `bundle:selfcheck` is now warning-free and `preflight`'s bundle check is clean. 22/22 tests; PM deploy gate passes.
- Deploy path is now code-complete + offline-validated EXCEPT the live network call (no CF auth in this env). The previously-flagged most-likely first-deploy failure is closed.

## Next valuable slices (pick ONE; all are verifiable OFFLINE):
1. **Wire preflight into a `predeploy` npm hook** (cheap footgun-closer): add `"predeploy": "npm run preflight"` so `npm run deploy` (the `opennextjs-cloudflare build && deploy` script) can't run with placeholder ids / a stale bundle — npm auto-runs `predeploy`. Update DEPLOY.md step 8/9 to note it's now automatic. Verify: `npm run predeploy` behaves like `npm run preflight`; the `deploy` script chain unchanged otherwise.
2. **Smoke-test the credential-less deploy flow end-to-end** (action → `buildCmsBundle` → `deploySite` state machine) WITHOUT CF auth: assert it lands the Site in `failed` with reason `notConfigured` and that every `DeployErrorKey`/UI error has a `sites.deploy.errors.*` string in all 3 catalogs (EN/FI/ET parity). Pure/Node-testable; closes the i18n-parity gap on the deploy error path.
3. **Audit the Script-Upload metadata against the (now DO-free) bundle** — confirm `buildScriptUploadForm` sends the right `main_module`/compat-flags/`compatibility_date` for a no-DO worker, and that nothing else in the bundle needs a binding the metadata omits (the self-check covers imports + DOs; double-check bindings/assets).

## Gotchas
- Run PM commands inside `ProjectManager/`. DEPLOY.md is at the REPO ROOT — keep it in sync with any deploy-script/wrangler/flow change.
- **DO exports are config-independent in OpenNext** — `defineCloudflareConfig({})` won't drop them; the entry statically re-exports them. The strip lives in `build-cms-bundle.mjs` (`DO_EXPORT_RE` + `stripDoExports`, which throws if a DO export survives). If OpenNext renames the DO classes, the build throws + the bundle-selfcheck integration test fails — update the regex then.
- **REGENERATE `cms-bundle.generated.js` (`npm run bundle:cms`) after ANY `CMS/` change** — else deploys ship a stale CMS.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while `next dev` is on 3601 (corrupts `.next`). Check `lsof -ti:3601`; clean `.next .open-next` after gating.
- Bundle/preflight/self-check scripts are plain `.mjs`; tests are `.test.mjs` under `scripts/` (and `src/lib/deploy/*.test.ts`), all dependency-free, relative imports, no `@/` alias.
- Use ONLY purpose theme tokens in markup; all user-visible strings via i18n (3-catalog parity).
