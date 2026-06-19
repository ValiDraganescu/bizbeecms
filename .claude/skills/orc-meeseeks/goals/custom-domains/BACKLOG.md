# Backlog — custom-domains
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Ordered: prove the two single-Worker domains first (low risk), then the per-site scheme (touches deployer+router+SSO), then verify. Each is one Meeseeks slice.

- DONE (2026-06-19): **Attach `deployer.bizbeecms.com` to the deployer Worker.** Added `routes:[{pattern:"deployer.bizbeecms.com",custom_domain:true}]` to `deployer/wrangler.jsonc`; flipped PM's `DEPLOYER_URL` var to `https://deployer.bizbeecms.com`. No `hosts.ts` default existed (DEPLOYER_URL is env-only). Config-only; live deploy still to confirm.

- TODO: **Attach `manager.bizbeecms.com` to the PM Worker.** Add the custom domain for `manager.bizbeecms.com` on the zone in `ProjectManager/wrangler.jsonc`. Set `APP_ORIGIN` to `https://manager.bizbeecms.com` (wrangler var + `hosts.ts` default). Audit every place that builds PM-facing URLs (invite emails `send-invite.ts`, SSO redirects, `PM_ORIGIN` injected to CMS) to confirm they read `APP_ORIGIN`, not a hardcoded workers.dev host.

- TODO: **Switch per-site CMS hostname scheme to `<slug>.site.bizbeecms.com`.** Decide the mechanism (likely: keep per-site worker name `bizbeecms-cms-<slug>`, but serve it at `<slug>.site.bizbeecms.com` — either via the router with a widened `*.site.bizbeecms.com` route + HOST_MAP, or by attaching a per-site custom hostname at deploy time). Update `router/wrangler.jsonc` route and/or `deployer/src/index.ts` so a deployed site resolves at `<slug>.site.bizbeecms.com`. Keep `WORKERS_SUBDOMAIN`/internal worker names intact — only the public hostname changes.

- TODO: **Point `PM_ORIGIN` + site links at the new hosts.** Ensure the deployer injects `PM_ORIGIN=https://manager.bizbeecms.com` into each CMS worker (`deployer/src/index.ts:262,468`), and PM's "open site" / "open CMS admin" links target `<slug>.site.bizbeecms.com`. Confirm `hosts.ts` is the single source of truth and no `.workers.dev` strings leak into user-facing URLs.

- TODO: **Verify SSO end-to-end on the new domains.** Confirm `classifyCmsReturnUrl` accepts `<slug>.site.bizbeecms.com` (own-zone path) and `manager.bizbeecms.com`, and STILL rejects attacker lookalikes (add/extend a unit test in cms-sso tests if one exists). Manually (or via the deployer's audit trail) walk: login at manager.bizbeecms.com → open a site's CMS admin → nonce mint → redirect → exchange → validate succeeds. Document the result in JOURNAL.md.

- TODO: **Decommission / alias the old `.workers.dev` URLs.** Once the custom domains are proven, confirm nothing user-facing still depends on `bizbeecms-projectmanager.workers.dev` / `bizbeecms-deployer.workers.dev` / `bizbeecms-cms-<slug>.workers.dev`. Leave workers.dev reachable as a fallback if cheap; otherwise note the cutover in CAVEATS.md. (Last — only after verify passes.)
