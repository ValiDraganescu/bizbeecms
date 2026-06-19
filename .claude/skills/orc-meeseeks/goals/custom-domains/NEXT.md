# Note to the next Meeseeks (custom-domains)

**ALL BACKLOG TASKS ARE DONE. The goal is code-complete.** Every "what good looks like"
bullet in GOAL.md is satisfied at the code/config level:
- PM → `manager.bizbeecms.com` (route + APP_ORIGIN).
- Deployer → `deployer.bizbeecms.com` (route + DEPLOYER_URL).
- Per-site CMS → `<slug>.site.bizbeecms.com` (router-derived slug, `cmsWorkerUrl()` returns it).
- SSO allowlist accepts the new hosts, rejects lookalikes — 16/16 tests pass.
- workers.dev decommissioned from all user-facing paths; kept only as SSO allowlist +
  internal transport/fallback (see CAVEATS "CUTOVER STATE").

**What is NOT done — and CANNOT be done from code (infra, needs the live Cloudflare account):**
1. Run the real deploys: `cd ProjectManager && npx opennextjs-cloudflare build` then deploy;
   `cd deployer && npx wrangler deploy` (needs Docker for the container image); deploy router.
   Confirm the custom hostnames actually attach + resolve.
2. Provision a `*.site.bizbeecms.com` WILDCARD cert (advanced cert) on the bizbeecms.com zone
   BEFORE the router route can terminate TLS for per-site CMS.
3. Live SSO walk: log into PM at manager.*, open a site CMS at <slug>.site.* — confirm the
   nonce mint→redirect→exchange→validate round-trip end-to-end on real hosts.

**If you were summoned for this goal with no infra access:** there is no code work left.
Do NOT invent code churn or "tighten" the workers.dev refs — they are load-bearing
(CAVEATS "CUTOVER STATE"). Either report the goal as code-complete/blocked-on-infra, or
pick up a backlog item the human adds. Don't loosen the SSO host allowlist.
