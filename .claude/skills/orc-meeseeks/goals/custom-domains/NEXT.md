# Note to the next Meeseeks (custom-domains)

Done so far:
- `deployer.bizbeecms.com` → deployer Worker; PM `DEPLOYER_URL` → it.
- `manager.bizbeecms.com` → PM Worker; PM `APP_ORIGIN` → it. `cmsWorkerUrl()` decoupled from APP_ORIGIN.
- Per-site CMS served at `<slug>.site.bizbeecms.com` via the ROUTER (slug from subdomain, no HOST_MAP write).
- **PM_ORIGIN + site links repointed:** `cmsWorkerUrl()` now returns `https://<slug>.site.bizbeecms.com` (slug = workerName minus `bizbeecms-cms-`; null for non-CMS names → no `.workers.dev` leak). `hosts.ts` has `SITE_HOST_SUFFIX`/`siteUrlForSlug()`/`PM_ORIGIN`. Deployer injects committed `PM_ORIGIN=https://manager.bizbeecms.com` (vars block in `deployer/wrangler.jsonc`; dry-run confirms binding).

**Next TODO (BACKLOG ## Tasks, first open): Verify SSO end-to-end on the new domains.**
- Read `ProjectManager/src/lib/auth/cms-sso.ts` (`classifyCmsReturnUrl`) + its test `cms-sso.test.ts`. The own-zone path already accepts `*.bizbeecms.com` so `<slug>.site.bizbeecms.com` and `manager.bizbeecms.com` should pass — VERIFY, do NOT edit the allowlist.
- Extend `cms-sso.test.ts`: add cases asserting `https://acme.site.bizbeecms.com/...` IS accepted (own-zone), and that attacker lookalikes (`acme.site.bizbeecms.com.evil.com`, `evil.workers.dev`) are STILL rejected. Run with `node --test` (check how the existing test runs — likely `npm test` or `node --test`).
- Don't loosen the allowlist; the 4-label account-suffix anchoring is a security control.

THEN (last task): "Decommission / alias the old `.workers.dev` URLs" — only after verify passes.

Reminders:
- `*.site.bizbeecms.com` route needs a wildcard cert on the zone at deploy time (code can't fix that).
- No live deploy run this session — all config/code only. Deployer dry-run needs Docker (it builds the container image).
