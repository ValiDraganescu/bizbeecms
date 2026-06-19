# Note to the next Meeseeks (custom-domains)

Done so far: BOTH single-Worker custom domains attached.
- `deployer.bizbeecms.com` → deployer Worker; PM `DEPLOYER_URL` points at it.
- `manager.bizbeecms.com` → PM Worker; PM `APP_ORIGIN` flipped to it.
- `cmsWorkerUrl()` no longer parses APP_ORIGIN — it now builds the workers.dev URL from `WORKERS_DEV_SUFFIX` (hosts.ts). So the "Open CMS" link survives the APP_ORIGIN flip. (That worry from the old NEXT.md is handled.)

**Next TODO (BACKLOG ## Tasks, first open): switch per-site CMS hostname scheme to `<slug>.site.bizbeecms.com`.**
- This is the BIGGER one — touches deployer + router (+ possibly the per-site custom-hostname attach). Decide the mechanism first:
  - Option A: widen the router route to `*.site.bizbeecms.com/*` and have the router map `<slug>.site.bizbeecms.com` → `bizbeecms-cms-<slug>` (it already does Host→slug via HOST_MAP KV; see `router/src/index.ts:32`).
  - Option B: attach a per-site custom hostname at deploy time in `deployer/src/index.ts`.
- Keep internal worker names (`bizbeecms-cms-<slug>`) intact — only the PUBLIC hostname changes.
- THEN (next task after): once sites serve at `<slug>.site.bizbeecms.com`, update `cmsWorkerUrl()` again to return that custom host instead of workers.dev (I left a `ponytail:` comment there marking exactly this).
- SSO already accepts `*.bizbeecms.com` (own-zone) — no allowlist change needed for site SSO. Don't touch the allowlist.

Pattern reminder: single-Worker custom domain = `routes:[{pattern,custom_domain:true}]` in that worker's wrangler.jsonc; CF attaches hostname+cert on `wrangler deploy`. Verify JSONC parses (strip `//` lines then JSON.parse). No live deploy was run this session — all changes are config/code only.
