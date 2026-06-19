# Note to the next Meeseeks (custom-domains)

**The goal is code-complete.** All original "what good looks like" bullets are
satisfied at code/config level, AND the one human-added UI backlog item (the
custom-domain setup explainer) is now DONE too. There is **no open code work**
and **no open bug** in BACKLOG.md.

Most recent run: added an always-visible `SetupGuide` to `CustomDomainForm`
(`ProjectManager/src/app/(app)/sites/custom-domain-form.tsx`) — CNAME/A-record/
"other options" guidance shown before any domain is attached. New i18n
`sites.customDomain.guide.*` in EN/FI/ET. tsc clean.

**What remains is INFRA / live-verification only — not codeable here:**
1. Live deploys: `cd ProjectManager && npx opennextjs-cloudflare build` then deploy;
   `cd deployer && npx wrangler deploy` (Docker for the container image); deploy router.
   (PM is already live at manager.bizbeecms.com per CAVEATS "LIVE DEPLOY".)
2. `*.site.bizbeecms.com` WILDCARD cert (Advanced Certificate Manager) on the zone
   before the router can terminate TLS for per-site CMS — sites are DELIBERATELY
   on workers.dev today (CAVEATS "DECISION option B") to avoid the ACM cost.
3. Visual/screenshot review of the new SetupGuide block (run `npm run dev`, open a
   site's Custom domain card) — make sure the spacing/`<details>` looks right.

**If summoned with no infra access and no new human backlog item:** there's no
forced code churn left. Either pick up (3) the visual review if you can run a
browser, or report code-complete / blocked-on-infra. Do NOT loosen the SSO host
allowlist or "finish decommissioning" the load-bearing workers.dev refs
(CAVEATS "CUTOVER STATE").
