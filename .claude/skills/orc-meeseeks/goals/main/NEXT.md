# Note to the next Meeseeks (main)

## USER DIRECTIVE (binding — read CAVEATS top entries too)
**Stop all CMS-internal work.** The ONLY remaining goal: get the **ProjectManager deployed to Cloudflare**, and from that deployed PM trigger a **real CMS-website deploy**. CMS content i18n / further CMS features are DEFERRED. Do not pick CMS-feature tasks. (Touching deploy *config/tooling* — open-next config, the bundler, npm scripts, docs — to de-risk the deploy is allowed; that's deploy work, not a CMS feature.)

## State of the world (git is the truth — `git log --oneline`)
- PM fully built: UI, i18n (EN/FI/ET cookie), auth, invite flow, Site CRUD, Site-deploy engine + committed CMS-bundle artifact (DO-free) + Deploy UI, `npm run preflight` / `bundle:selfcheck` / `bundle:cms`, root `DEPLOY.md` runbook. 26/26 tests.
- **NEW this run:** `npm run deploy` is now **footgun-proofed** — `"predeploy": "npm run preflight"` is an npm pre-script, so a failing preflight (placeholder ids / missing compat flags / stale bundle) aborts the build/upload. Verified exit-1 propagates predeploy→deploy abort. Also FROZE deploy error-path i18n parity: `scripts/deploy-i18n-parity.test.mjs` derives the error-key set from source and asserts EN/FI/ET `sites.deploy.errors.*` match exactly — adding a new DeployErrorKey without all 3 catalog strings now fails the suite.
- The whole PM→Cloudflare→CMS deploy path is code-complete + offline-validated EXCEPT the live network call (no CF auth in this env). All documented first-deploy footguns are now closed and gated.

## Next valuable slices (pick ONE; all verifiable OFFLINE):
1. **Audit Script-Upload metadata vs the (DO-free) bundle** — confirm `buildScriptUploadForm` sends the right `main_module`/compat-flags/`compatibility_date` for a no-DO worker, and that nothing else in the bundle needs a binding the metadata omits (self-check covers imports + DOs; double-check **bindings/assets** — e.g. does the OpenNext worker expect an `ASSETS` binding or env vars the upload doesn't provide?). If it needs a binding, add it to `buildScriptUploadForm` + DEPLOY.md.
2. **Smoke-test the credential-less deploy action end-to-end** (action → `buildCmsBundle` → `deploySite` state machine) WITHOUT CF auth: assert a Site lands `failed`/`notConfigured` and status revalidates. Tricky to unit-test (action imports `@opennextjs/cloudflare` + drizzle which need a Worker runtime) — may need a thin pure seam; if too entangled, do slice 1 instead and note the seam.
3. **Harden the runbook**: dry-run each DEPLOY.md step that doesn't need CF auth, fix any drift (script names, flags), and add a "what success looks like" curl/expected-output to the verify step.

## Gotchas
- Run PM commands inside `ProjectManager/`. DEPLOY.md is at the REPO ROOT — keep it in sync with any deploy-script/wrangler/flow change.
- `npm run <prescript-target>` directly does NOT chain pre-scripts; npm only runs `pre*` when you run the *target*. Verify hook behavior by checking the underlying script's exit code propagates (it does: preflight exit 1 → predeploy exit 1).
- Deploy-error i18n is now test-locked — if you add/rename a `DeployErrorKey` or `DeployState.error` gate key, add the string to ALL THREE `messages/*.json` under `sites.deploy.errors.*` or `npm test` fails.
- REGENERATE `cms-bundle.generated.js` (`npm run bundle:cms`) after ANY `CMS/` change.
- Deploy gate = `npx opennextjs-cloudflare build`; NEVER run while `next dev` is on 3601 (corrupts `.next`). Check `lsof -ti:3601`; clean `.next .open-next` after gating.
- Tests are dependency-free `.mjs`/`.ts` (no `@/` alias, no drizzle/opennext imports). New parity test reads source files via relative paths from `scripts/`.
- Use ONLY purpose theme tokens; all user-visible strings via i18n (3-catalog parity).
