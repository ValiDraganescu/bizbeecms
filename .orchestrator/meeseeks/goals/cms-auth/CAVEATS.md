# Caveats — cms-auth
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **The CMS today has NO local users.** `CMS/src/db/schema.ts` has only `component`,
  `page`, `siteSettings`, `asset` — auth is 100% delegated to PM via
  `lib/auth/guard.ts` → PM `/api/auth/cms-validate`. This goal ADDS the user layer;
  don't assume any user/session/invite table exists yet.

- **Each CMS Worker has its OWN D1 (the DB IS the site boundary).** New auth tables
  are NOT site-scoped — no `siteId` column. Add a Drizzle migration; the deployer
  runs migrations per-Site at deploy time (confirm the migration path in the
  deployer before assuming it auto-applies).

- **PM is the blueprint — copy the mechanics + the ROLE SET, drop the SCOPE.**
  Mirror PM's `password.ts` (PBKDF2 **100k cap** — exceeding it throws at runtime
  ONLY on Workers, see memory `pm-workers-pbkdf2-100k-cap`), `session.ts`
  (`bizbee_session` cookie + KV, 7-day TTL), the invite token/TTL/accept flow, AND
  the `pm-roles` role set (`SuperAdmin | Admin | Manager | Editor` + the
  `canRemoveUser` removal hierarchy). DROP all country/tag SCOPE
  (`user_countries`, `invite_countries`, `COUNTRY_CODES`, `user_tags`, `site_tags`,
  `canManageSiteByCountry`, `getUserCountries`) — a single deployed CMS is ONE Site,
  so scope is meaningless here. Coordinate role NAMES with the `pm-roles` subgoal so
  the two stay identical.

- **PM-with-CMS-site-access = Admin (USER RULE 2026-06-21).** A PM user who reaches
  the CMS via SSO/cms-validate is a CMS **Admin** — wire that role on the
  auto-provisioned SSO user (Slice 0/3). CMS-local (email/Google/invited) users get
  their role from their invite, defaulting per Slice 0.

- **Google sign-in is net-new (Slice 2b).** No Google/OAuth exists anywhere today.
  Use an own OAuth 2.0 client; verify the id_token email server-side; client
  id/secret + redirect from deployer-injected Worker vars, never hardcoded. Decide
  whether an uninvited Google user can self-signup — RECOMMEND no (require a
  matching user/invite) so randoms can't walk in.

- **Invite email = Cloudflare Email Service `send_email` binding** (the user's
  link: https://developers.cloudflare.com/email-service/). PM's `send-invite.ts`
  already calls `env.EMAIL.send` but PM's `wrangler.jsonc` has the `send_email`
  binding COMMENTED OUT (needs a verified sender on a paid plan). The CMS Worker
  must get the binding + a verified sender provisioned by the deployer — treat
  missing-binding as a deploy-wiring sub-task, and degrade to logging the link in
  dev (as PM does) so tests/dev don't hard-fail.

- **Cookie-name collision risk.** PM's session cookie is `bizbee_session` on the PM
  host; the CMS guard already FORWARDS that cookie to PM. If the CMS now mints its
  OWN session cookie, decide whether to reuse the name `bizbee_session` (on the CMS
  host it's a different cookie — different domain) or pick a distinct name to avoid
  confusion in the SSO-callback path. The SSO callback (`/api/auth/sso-callback`)
  already sets a session cookie on the CMS host — RECONCILE the new local-login
  session with that existing SSO-callback session so there's ONE session notion on
  the CMS host, not two competing cookies.

- **SSO must keep working.** `app/admin/layout.tsx` currently redirects signed-out
  users to PM `cms-sso`. This goal replaces the AUTO-redirect with a login PAGE,
  but the PM handoff (cms-sso → sso-callback nonce exchange) stays — it's now
  behind the conditional "Sign in with BizbeeCMS" button. Don't delete the SSO
  path; gate it.

- **The SSO button is conditional on origin — read it from config.** Show it only
  when the visitor came from PM. The PM origin is already available as `PM_ORIGIN`
  (a Worker var injected by the deployer; see `guard-core.ts` GuardConfig +
  `wrangler.jsonc` vars). Match against THAT, never a hardcoded
  `manager.bizbeecms.com`. The existing `forwarded-host` HMAC handling is the
  "similar handling" the user referenced — study it before inventing a new scheme.

- **Two layers to guard.** The guard gates BOTH `/admin/*` page renders
  (`admin/layout.tsx`) AND `/api/*` data routes. Any new role check must cover
  both — a page-only check is bypassable by hitting the API directly. Extend the
  existing guard, don't fork it.

- **IDENTITY MODEL SETTLED (Slice 0, 2026-06-22) — see GOAL.md "Settled identity
  model".** Decisions are now FIXED; don't re-litigate them:
  1. ONE unified CMS `users` table; SSO login AUTO-PROVISIONS a row (match by
     verified email, `role=Admin`, `passwordHash=NULL`). No parallel operator path.
  2. ONE cookie, name kept as `bizbee_session` (different host than PM's, no real
     collision). **CRITICAL — the cookie's VALUE meaning changes:** today
     `/api/auth/sso-callback` stores PM's *sid* and the guard forwards it to PM
     cms-validate EVERY request. After Slice 1 the cookie must hold a CMS-LOCAL
     session id, and the guard must resolve sessions LOCALLY. So Slice 1/2 MUST
     rewrite sso-callback to: nonce-exchange → get PM userId/email → upsert CMS
     user → mint a CMS-local session → set cookie. cms-validate becomes the SSO
     HANDSHAKE only, not the per-request authz call. Do NOT leave the guard
     forwarding the cookie to PM once local sessions exist — that would defeat
     local users (PM has no row for them).
  3. NO local first-registrant SuperAdmin self-bootstrap. First CMS user = the
     first PM operator via SSO (auto-provisioned Admin). `SuperAdmin` reserved in
     the role set for parity, unused by default. Uninvited email/Google user with
     no matching row = REJECTED (no self-signup).

- **PM-SSO user ↔ CMS user identity.** When an operator signs in via SSO they have
  a PM userId but NO CMS user row. Decide (model slice) whether SSO login
  auto-provisions a CMS user (so roles apply uniformly) or stays a separate
  "operator" path that bypasses CMS roles. This is the central design fork —
  settle it FIRST, before building invites/roles on top.

- **Gate every slice:** CMS `tsc` + `npx opennextjs-cloudflare build` green (build
  is the deploy gate — NEVER run it while `npm run dev` is up, it corrupts `.next`).
  Then regen the PM `cms-bundle` (the deployable CMS bundle). EN/FI/ET for every
  new user-facing string (login page, invite emails, role labels, errors).

- **No native confirm()/alert().** Browser-automation review sessions hang on
  native dialogs (CLAUDE.md). Any "delete user / revoke invite" confirm must be an
  in-app modal/popover, never `window.confirm`.
