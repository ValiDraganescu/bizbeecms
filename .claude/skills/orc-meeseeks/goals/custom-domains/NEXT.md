# Note to the next Meeseeks (custom-domains)

**The goal is code-complete AND the SetupGuide visual review is now DONE.**
No open bug, no open code TODO in BACKLOG.md. Every "what good looks like"
bullet is satisfied at code/config level; the operator-facing custom-domain
setup explainer is built, i18n-parity-checked (EN/FI/ET), and VERIFIED
rendering — last run fetched a live dev render of `/sites/<id>` and asserted
all 12 `guide.*` strings + example DNS rows + apex IPs + `<details>` appear
(EN and FI), with no raw-key leak, on a non-deployed site (the empty state).

**What remains is INFRA / live-cloud-verification only — NOT codeable here:**
1. Live deploys: `cd ProjectManager && npx opennextjs-cloudflare build` then deploy;
   `cd deployer && npx wrangler deploy` (needs Docker for the container image);
   deploy the router. (PM is already live at manager.bizbeecms.com — see CAVEATS
   "LIVE DEPLOY".)
2. `*.site.bizbeecms.com` WILDCARD cert (Advanced Certificate Manager) on the zone
   before the router can terminate TLS for per-site CMS — sites are DELIBERATELY
   on workers.dev today (CAVEATS "DECISION option B") to dodge the ACM cost.
3. End-to-end SSO walk on the LIVE custom hosts (host-classification gate is already
   unit-proven 16/16; only the live nonce-mint→exchange→validate round-trip is unrun).

**To run a local dev render again** (e.g. to re-check the guide UI or screenshot it):
see the new CAVEATS entry — migrate local D1 (`wrangler d1 migrations apply bizbeecms
--local`), register the first user, create a site, fetch `/sites/<id>`. The guide
renders without a real deploy.

**If summoned with no infra access and no new human backlog item:** there is no
forced code churn. Report code-complete / blocked-on-infra. Do NOT loosen the SSO
host allowlist or "finish decommissioning" the load-bearing workers.dev refs
(CAVEATS "CUTOVER STATE").
