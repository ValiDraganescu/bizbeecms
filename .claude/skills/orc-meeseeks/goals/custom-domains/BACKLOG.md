# Backlog — custom-domains
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Ordered: prove the two single-Worker domains first (low risk), then the per-site scheme (touches deployer+router+SSO), then verify. Each is one Meeseeks slice.

- DONE (2026-06-19): **Attach `deployer.bizbeecms.com` to the deployer Worker.** Added `routes:[{pattern:"deployer.bizbeecms.com",custom_domain:true}]` to `deployer/wrangler.jsonc`; flipped PM's `DEPLOYER_URL` var to `https://deployer.bizbeecms.com`. No `hosts.ts` default existed (DEPLOYER_URL is env-only). Config-only; live deploy still to confirm.

- DONE (2026-06-19): **Attach `manager.bizbeecms.com` to the PM Worker.** Added `routes:[{pattern:"manager.bizbeecms.com",custom_domain:true}]` + flipped `APP_ORIGIN` var to `https://manager.bizbeecms.com` in `ProjectManager/wrangler.jsonc`. Decoupled `cmsWorkerUrl()` from APP_ORIGIN (now uses `WORKERS_DEV_SUFFIX` from `hosts.ts`) so the "Open CMS" link doesn't break. Audited: `send-invite.ts` (prefixes APP_ORIGIN — fine), SSO (request-relative, not APP_ORIGIN), `PM_ORIGIN` (deployer env, separate task). No `hosts.ts` APP_ORIGIN default exists; the wrangler var is the source. Config + refactor only; live deploy still to confirm.

- DONE (2026-06-19): **Switch per-site CMS hostname scheme to `<slug>.site.bizbeecms.com`** via the router (Option A — no deployer change needed). Widened `router/wrangler.jsonc` route to add `*.site.bizbeecms.com/*` (zone bizbeecms.com), and in `router/src/index.ts` derive the slug straight from the leftmost subdomain label when Host ends with `.site.bizbeecms.com` — NO HOST_MAP entry needed for these. Other (customer-owned) custom hostnames still resolve via HOST_MAP. Internal worker names `bizbeecms-cms-<slug>` unchanged. Verified: wrangler.jsonc parses, `wrangler deploy --dry-run` bundles clean, slug-derivation self-check (nested-label + leading-hyphen rejection) passes. NOTE: deploy-time needs a `*.site.bizbeecms.com` wildcard cert on the zone.

- DONE (2026-06-19): **Point `PM_ORIGIN` + site links at the new hosts.** Added `SITE_HOST_SUFFIX`/`siteUrlForSlug()`/`PM_ORIGIN` to `hosts.ts` (single source of truth). `cmsWorkerUrl()` now strips `CMS_WORKER_PREFIX` → returns `https://<slug>.site.bizbeecms.com` (null for non-CMS names, so no `.workers.dev` leak). Deployer gets a committed `vars:{PM_ORIGIN:"https://manager.bizbeecms.com"}` block (dry-run confirms the binding). tsc clean + slug self-check pass. Live deploy still to confirm (needs `*.site.bizbeecms.com` wildcard cert).

- TODO: **Verify SSO end-to-end on the new domains.** Confirm `classifyCmsReturnUrl` accepts `<slug>.site.bizbeecms.com` (own-zone path) and `manager.bizbeecms.com`, and STILL rejects attacker lookalikes (add/extend a unit test in cms-sso tests if one exists). Manually (or via the deployer's audit trail) walk: login at manager.bizbeecms.com → open a site's CMS admin → nonce mint → redirect → exchange → validate succeeds. Document the result in JOURNAL.md.

- TODO: **Decommission / alias the old `.workers.dev` URLs.** Once the custom domains are proven, confirm nothing user-facing still depends on `bizbeecms-projectmanager.workers.dev` / `bizbeecms-deployer.workers.dev` / `bizbeecms-cms-<slug>.workers.dev`. Leave workers.dev reachable as a fallback if cheap; otherwise note the cutover in CAVEATS.md. (Last — only after verify passes.)
