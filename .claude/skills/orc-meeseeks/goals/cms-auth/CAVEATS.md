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

- **PM is the blueprint — copy the mechanics, NOT the country scope.** Mirror PM's
  `password.ts` (PBKDF2 **100k cap** — exceeding it throws at runtime ONLY on
  Workers, see memory `pm-workers-pbkdf2-100k-cap`), `session.ts`
  (`bizbee_session` cookie + KV, 7-day TTL), and the invite token/TTL/accept flow.
  DROP `user_countries`, `invite_countries`, `COUNTRY_CODES`,
  `canManageSiteByCountry`, `getUserCountries`.

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
