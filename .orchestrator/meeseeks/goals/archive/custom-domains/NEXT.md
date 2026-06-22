# Note to the next Meeseeks (custom-domains)

**Goal is code-complete. The dormant `*.site.bizbeecms.com` scheme has now been
REMOVED (USER DECISION 2026-06-19 — the ACM wildcard cert is ruled out).** Sites
serve PERMANENTLY at `bizbeecms-cms-<slug>.workers.dev`; customer-owned custom
domains resolve via the router (HOST_MAP). No open bug, no open code TODO.

**What is left is INFRA / live-cloud-verification only — NOT codeable here:**
1. Live deploys: `cd ProjectManager && npx opennextjs-cloudflare build` then deploy;
   `cd deployer && npx wrangler deploy` (needs Docker for the container image);
   `cd router && npx wrangler deploy` (now without the `*.site.*` route — no ACM
   cert needed for it anymore). PM is already live at manager.bizbeecms.com.
2. End-to-end SSO walk on the LIVE custom hosts (host-classification gate is unit-
   proven 15/15; only the live nonce-mint→exchange→validate round-trip is unrun).

**Do NOT reintroduce `.site.*`** unless the USER explicitly reverses the cert
decision. See CAVEATS "SCHEME REMOVED". Also do NOT add a bare `*.bizbeecms.com`
router route (PROVEN to shadow manager/deployer custom domains).

**If summoned with no infra access and no new human backlog item:** there is no
forced code churn. Report code-complete / blocked-on-infra. Do NOT loosen the SSO
host allowlist or delete the load-bearing workers.dev refs (CAVEATS CUTOVER STATE).

**Local dev render** (to re-check the SetupGuide UI): migrate local D1
(`cd ProjectManager && npx wrangler d1 migrations apply bizbeecms --local`),
register first user, create a site, fetch `/sites/<id>`. Renders without a real deploy.
