# Note to the next Meeseeks (custom-domains)

Done so far:
- `deployer.bizbeecms.com` → deployer Worker; PM `DEPLOYER_URL` → it.
- `manager.bizbeecms.com` → PM Worker; PM `APP_ORIGIN` → it. `cmsWorkerUrl()` decoupled from APP_ORIGIN.
- Per-site CMS served at `<slug>.site.bizbeecms.com` via the ROUTER (slug from subdomain, no HOST_MAP write).
- `cmsWorkerUrl()` returns `https://<slug>.site.bizbeecms.com`; `hosts.ts` has `SITE_HOST_SUFFIX`/`siteUrlForSlug()`/`PM_ORIGIN`. Deployer injects committed `PM_ORIGIN=https://manager.bizbeecms.com`.
- **SSO VERIFIED:** `cms-sso.test.ts` extended (12→16, all pass via `node --test src/lib/auth/cms-sso.test.ts`). Own-zone check accepts `<slug>.site.bizbeecms.com` + `manager.bizbeecms.com` with NO allowlist change; lookalikes (`*.bizbeecms.com.evil.com`, `evil.attacker.workers.dev`) still rejected. The hostname gate (the only host-dependent SSO step) is proven by test.

**LAST TODO (BACKLOG ## Tasks, only open one): Decommission / alias the old `.workers.dev` URLs.**
- Confirm nothing user-facing still depends on `bizbeecms-projectmanager.workers.dev` / `bizbeecms-deployer.workers.dev` / `bizbeecms-cms-<slug>.workers.dev`.
- `cmsWorkerUrl()` already returns the custom host (no workers.dev leak). Audit: `send-invite.ts` (uses APP_ORIGIN = manager.bizbeecms.com ✓), SSO (request-relative ✓), DEPLOYER_URL (custom ✓). Grep for any remaining `.workers.dev` / `WORKERS_DEV_SUFFIX` usage that reaches users.
- Leave workers.dev reachable as a cheap fallback (per CAVEATS: don't disable the workers.dev subdomain). Note the cutover state in CAVEATS.md if you change anything.
- This is the FINAL task — after it, the goal's "what good looks like" is met modulo the live-deploy + wildcard-cert step (infra, not code).

Reminders:
- `*.site.bizbeecms.com` route needs a wildcard cert on the zone at deploy time (code can't fix that).
- No live deploy run yet — all config/code only. Deployer dry-run needs Docker.
- `WORKERS_DEV_SUFFIX`/`ACCOUNT_WORKERS_SUBDOMAIN` are still used by the SSO allowlist's own-account CMS-worker check (`isOwnCmsWorker`) — that's the workers.dev fallback path, KEEP it. Don't delete those constants when decommissioning.
