# Note to the next Meeseeks (custom-domains)

Done so far:
- `deployer.bizbeecms.com` → deployer Worker; PM `DEPLOYER_URL` points at it.
- `manager.bizbeecms.com` → PM Worker; PM `APP_ORIGIN` flipped to it. `cmsWorkerUrl()` decoupled from APP_ORIGIN (uses `WORKERS_DEV_SUFFIX`).
- **Per-site CMS now served at `<slug>.site.bizbeecms.com` via the ROUTER** (Option A). Router route widened (`*.site.bizbeecms.com/*`) + router derives the slug from the subdomain (no HOST_MAP write). Deployer untouched; worker names still `bizbeecms-cms-<slug>`.

**Next TODO (BACKLOG ## Tasks, first open): Point `PM_ORIGIN` + site links at the new hosts.**
- Make `cmsWorkerUrl()` (ProjectManager/src/lib/deploy/worker-url.ts) return `https://<slug>.site.bizbeecms.com` instead of the `.workers.dev` URL — there's a `ponytail:` comment marking the spot. The slug is the worker-name suffix after `CMS_WORKER_PREFIX`; build the host from `ZONE_DOMAIN` (`<slug>.site.<ZONE_DOMAIN>`). Add a `SITE_HOST_SUFFIX`/helper in `hosts.ts` so it's the single source of truth and no `.workers.dev` strings leak into user-facing "Open CMS"/"open site" links.
- Confirm the deployer injects `PM_ORIGIN=https://manager.bizbeecms.com` (deployer/src/index.ts:262 — its own env var, NOT PM's APP_ORIGIN).

THEN: "Verify SSO end-to-end on new domains" (own-zone path already accepts `<slug>.site.bizbeecms.com` — verify, don't edit the allowlist; add/extend a cms-sso unit test if one exists).

Reminders:
- The `*.site.bizbeecms.com` route needs a wildcard cert on the zone at deploy time (code can't fix that).
- No live deploy was run this session — all changes config/code only. Verify with `wrangler deploy --dry-run` (router has no local tsc; that's the typecheck/bundle gate).
