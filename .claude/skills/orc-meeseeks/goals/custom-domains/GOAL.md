# Goal: custom-domains
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Move bizbeecms off `*.vali-draganescu88.workers.dev` and onto stable custom domains under the `bizbeecms.com` zone, **without breaking the cross-host CMS admin SSO**.

Target end-state:
- **PM** runs at `manager.bizbeecms.com`
- **Deployer** Worker runs at `deployer.bizbeecms.com`
- **Per-site CMS** deployments are served at `<slug>.site.bizbeecms.com`
- **SSO keeps working** across all of the above (the nonce-handoff flow + host allowlist).

## What "good" looks like
- PM reachable at `https://manager.bizbeecms.com`; `APP_ORIGIN` and all PM→PM/PM→CMS links use it.
- Deployer reachable at `https://deployer.bizbeecms.com`; PM's `DEPLOYER_URL` points there.
- A freshly deployed Site is reachable at `https://<slug>.site.bizbeecms.com` (not `bizbeecms-cms-<slug>.workers.dev`).
- Logging into PM at `manager.bizbeecms.com` and opening a Site's CMS admin at `<slug>.site.bizbeecms.com` completes SSO end-to-end (nonce mint → redirect → exchange → validate), with the host allowlist accepting the new hosts and still rejecting attacker-controlled lookalikes.
- Cloudflare-only: custom hostnames attached to the `bizbeecms.com` zone; no new non-CF infra.

## Grounding (verified 2026-06-19 — file:line)
- Centralized host config: `ProjectManager/src/lib/config/hosts.ts` — `ACCOUNT_WORKERS_SUBDOMAIN="vali-draganescu88"`, `WORKERS_DEV_SUFFIX`, `CMS_WORKER_PREFIX="bizbeecms-cms-"`, `ZONE_DOMAIN="bizbeecms.com"`, `CUSTOM_DOMAIN_FALLBACK_ORIGIN="cf.bizbeecms.com"`.
- PM `wrangler.jsonc`: `APP_ORIGIN` + `DEPLOYER_URL` both on `.workers.dev` today. No routes declared.
- Per-site CMS worker name: `deployer/src/index.ts:220` → `bizbeecms-cms-<slug>` (≤63 chars), deployed via `wrangler deploy --name`.
- Router: `router/wrangler.jsonc` route `cf.bizbeecms.com/*` on zone `bizbeecms.com`; `router/src/index.ts:32` proxies `Host→slug` (via `HOST_MAP` KV) to `bizbeecms-cms-<slug>.<WORKERS_SUBDOMAIN>.workers.dev`. Comment notes plan to widen route to `*/*`.
- SSO allowlist: `ProjectManager/src/lib/auth/cms-sso.ts:54-68` `classifyCmsReturnUrl` — statically allows 4-label `bizbeecms-cms-<slug>.<account>.workers.dev` anchored to our account, AND any host under `bizbeecms.com` (own-zone). Custom domains checked against `HOST_MAP` KV. HTTPS-only; open-redirect guards on `next`.
- SSO routes: `cms-sso/route.ts`, `cms-sso-exchange/route.ts` (server-to-server, `CMS_AUTH_SECRET` bearer), `cms-validate/route.ts`. CMS guard: `CMS/src/lib/auth/guard.ts`.
- Deployer injects `PM_ORIGIN` + `CMS_AUTH_SECRET` into each CMS worker: `deployer/src/index.ts:262,468`.

## Key insight (de-risks the work)
`<slug>.site.bizbeecms.com` is already under `bizbeecms.com`, so SSO's own-zone check **already accepts it** — no allowlist code change needed for site SSO. The work is mostly: attach custom hostnames to the PM + deployer Workers, route `*.site.bizbeecms.com` through the router (or attach per-site custom hostnames) to the right per-site worker, and update `APP_ORIGIN`/`DEPLOYER_URL`/injected `PM_ORIGIN` to the new domains. Verify, don't assume.
