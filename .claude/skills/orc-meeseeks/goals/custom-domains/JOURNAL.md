# Journal — custom-domains
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-19 11:33 — Attach deployer.bizbeecms.com to the deployer Worker
- **Status:** DONE
- **What I did:** Added a `routes` entry `{ "pattern": "deployer.bizbeecms.com", "custom_domain": true }` to `deployer/wrangler.jsonc` so Cloudflare attaches the hostname+cert to the deployer Worker on deploy. Flipped PM's `DEPLOYER_URL` var (`ProjectManager/wrangler.jsonc`) from `https://bizbeecms-deployer.vali-draganescu88.workers.dev` to `https://deployer.bizbeecms.com`. workers.dev subdomain left enabled as a fallback.
- **Verified:** Both wrangler.jsonc files still parse as JSON (comments stripped). Confirmed `DEPLOYER_URL` is read purely from the env var (`bag.DEPLOYER_URL`) in `sites/[id]/deploy/route.ts:57` and `sites/[id]/custom-domain/route.ts:79` — NO hardcoded default in `hosts.ts`, so flipping the var is sufficient on the PM side. No SSO code touched (deployer is server-to-server with DEPLOYER_SECRET bearer; not in the SSO host allowlist). Could NOT verify live (no Cloudflare deploy run this session — config-only change; actual `wrangler deploy` + DNS resolution must be confirmed on next deploy).
- **Files:** deployer/wrangler.jsonc, ProjectManager/wrangler.jsonc
