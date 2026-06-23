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
  already calls `env.EMAIL.send`. UPDATE 2026-06-23 (USER): the `send_email`
  binding + verified sender are now LIVE — invite emails actually deliver. The code
  still degrades to logging the link (`delivered:false`) when the binding is absent
  (dev/unconfigured), so tests/dev don't hard-fail; that fallback stays.

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

- **SESSION STORE IS D1, NOT KV (settled Slice 1).** The CMS Worker has NO KV
  binding (`wrangler.jsonc` has only DB, AI, MEDIA, ASSETS — verified). PM uses
  KV `SESSIONS`; the CMS does NOT. Sessions live in a D1 `session` table
  (`schema.ts`), source of truth in D1, no auto-TTL so `getSession()` rejects +
  opportunistically deletes expired rows. Don't reintroduce a KV session path —
  use `db/session-store.ts` (`createSession`/`getSession`/`destroySession`).

- **Pure vs CF-coupled split (follow it).** Crypto/logic that must be node-tested
  lives in `lib/auth/password.ts` + `lib/auth/session-core.ts` (NO `@/` imports,
  NO CF bindings — only `globalThis.crypto`). The D1/cookie-bound code is in
  `db/user-store.ts` + `db/session-store.ts`. Stores read D1 ONLY via `getDb()`
  (the Db port) — NEVER `env.DB` directly, or the sole-reader guard
  (`scripts/ports-sole-reader.guard.test.mjs`) flips red.

- **password.ts: keep iterations at exactly 100000.** `scripts/password.test.mjs`
  asserts the stored hash records `100000` — that's a guard against the
  Workers-only PBKDF2 cap (memory `pm-workers-pbkdf2-100k-cap`). Bumping it fails
  CI here instead of at runtime on a deployed Worker. Don't "raise it to OWASP".

- **Deployer applies CMS migrations — confirmed.** `deployer/src/index.ts:639`
  runs `npx wrangler d1 migrations apply DB --remote` over `migrations/` at every
  Site deploy. New Drizzle migrations (run `npm run db:generate` in CMS/)
  auto-apply per-Site. No extra wiring needed for new tables.

- **GUARD NOW RESOLVES SESSIONS LOCALLY (Slice 2) — do NOT reintroduce the PM
  forward.** `guard.ts` `decide()` reads `getSession()` → `findUserById` (D1), NOT
  PM cms-validate. Local email/password/Google users have NO PM row, so forwarding
  every request to PM would lock them out. `cms-validate` is now ONLY the SSO
  handshake (used once inside `sso-callback`). `guard-core.ts` still exports
  `cmsValidateUrl`/`decideFromValidate`/`isGuardConfigured`/`readSessionCookie` —
  those are kept for the sso-callback handshake + tests; don't delete them.

- **SSO operator's CMS email is SYNTHETIC: `<pmUserId>@pm.sso` (Slice 2 stopgap).**
  cms-validate returns `userId` but NOT the email, and Slice 2 couldn't touch PM
  (parallel PM worker). So `sso-callback` upserts the SSO user keyed on a synthetic
  email derived from the PM userId — unique + idempotent, and SSO users never log
  in by email (passwordHash=NULL). **FOLLOW-UP:** when PM's cms-validate (or
  cms-sso-exchange) is extended to return the real verified email, switch the
  upsert to match/store that, and backfill existing `@pm.sso` rows. Until then a
  PM user appears in the CMS user list as `<uuid>@pm.sso` — note this in Slice 5.

- **Login API is non-enumerating — keep it that way.** `/api/auth/login` returns
  the SAME generic 401 `invalidCredentials` for unknown email, SSO/Google user
  (null passwordHash), AND wrong password. Don't add a distinct "no such user"
  branch (it leaks which emails exist). No self-signup here — unknown email = 401.

- **No middleware-level current-URL in the layout.** The admin layout reads
  `from`/`Referer` from `headers()` to decide the SSO-button visibility; there's no
  reliable "current request URL" header on OpenNext, so `?from=pm` is read
  best-effort from `x-forwarded-url`/`referer`. The robust signal is `Referer`
  origin === PM_ORIGIN (always present on a PM-link click). Don't rely on `?from=pm`
  being the only path.

- **ROLES + GUARD GATES LANDED (Slice 3).** Role logic is pure in
  `lib/auth/roles.ts` (type-only-imports `CmsRole` → node-testable; mirrors PM
  `removal.ts`, scope DROPPED). `GuardDecision` now carries `role?: CmsRole` on
  allow + a `forbidden` deny reason. `guard.ts` exposes `requireRole(req,
  allowed)` (401 unsigned / 403 forbidden) + `requireUserManager` for /api/* AND
  `checkRoleFromHeaders(allowed)` for /admin pages. **`requireAdmin` is still the
  "any signed-in CMS user" gate — DON'T tighten it to a role check** (Editors must
  still edit content via existing routes). Use `requireRole`/`requireUserManager`
  for the NEW user-mgmt routes (Slice 5) and `canInviteRole` for invite-grant
  validation (Slice 4). The helpers are re-exported from `guard.ts`.

- **Role LABELS are NOT translated yet (Slice 3 deferred them to Slice 5).** No
  EN/FI/ET strings exist for SuperAdmin/Admin/Manager/Editor in the CMS yet — add
  a `roles` namespace (mirror PM's `messages/*.json` `roles` block: lowercase-first
  keys) when Slice 5's user-mgmt UI needs them, and regen cms-bundle THEN.

- **cms-bundle regen is for RUNTIME code only.** `bundle:cms` bundles
  `CMS/.open-next/worker.js`, NOT migrations. A slice that only adds schema/libs
  not yet imported by a worker entrypoint doesn't need a manual regen — PM's
  `predeploy` runs `bundle:cms` automatically. Regen once a slice adds a real
  route/UI the worker serves (Slice 2 login route).

- **INVITE FLOW LANDED (Slice 4).** Pure `lib/invite/invite-core.ts`
  (token/TTL/`classifyInvite`) + CF `db/invite-store.ts` (create/find/checkInvite/
  acceptInvite/hasPendingInvite/listPendingInvites). `acceptInvite(token,
  passwordHash)` takes an ALREADY-HASHED password (the pure/CF crypto split — the
  route hashes via `hashPassword` first). `POST /api/invite` gates with
  `checkAdmin` → `canInvite` → `canInviteRole` (granted role strictly below the
  inviter's tier). `POST /api/invite/accept/[token]` mints a session. Public accept
  page is `app/invite/accept/[token]/page.tsx` (NOT under /admin — token is the
  credential; don't add a guard).

- **injectedDb test seam (Slice 4).** invite-store fns + user-store's
  `findUserByEmail`/`createUser` now take an OPTIONAL trailing `injectedDb?: Db`
  (page-store pattern: `injectedDb ?? await getDb()`). It does NOT read `env.DB`, so
  the sole-reader guard stays green. Use it to node-test store logic over in-memory
  `node:sqlite` (see `scripts/invite.test.mjs`). Don't make it required.

- **CF Email binding shape is the WORKERS shape, not PM's old one.** CMS
  `send-invite.ts` calls `env.EMAIL.send({ to, from: { email, name }, subject,
  text })` — the `send_email` Workers binding (per cloudflare-email-service skill).
  PM's older code used `{ from: string, ... }`; don't copy PM's `from` shape.
  UPDATE 2026-06-23 (USER): the binding + verified sender are LIVE — invite emails
  deliver for real. The code still degrades to logging the accept link
  (`delivered:false`) when the binding is absent (dev/unconfigured); keep that
  fallback for tests/dev.

- **APP_ORIGIN is deployer-injected (Slice 4).** The CMS's own public origin for
  building trusted invite-accept links comes from the `APP_ORIGIN` Worker var. The
  deployer sets it to `https://<worker-name>.<WORKERS_DEV_SUFFIX>` (a new const in
  `deployer/src/index.ts` mirroring PM's `ACCOUNT_WORKERS_SUBDOMAIN` in
  ProjectManager/src/lib/config/hosts.ts — KEEP THE TWO IN SYNC if the account
  subdomain changes). NEVER derive the link origin from request Host headers in prod
  (Host Header Injection) — `buildAcceptUrl` only falls back to the request host in
  dev.

- **USER-MGMT UI + ROLE LABELS LANDED (Slice 5).** Pure
  `lib/auth/user-mgmt.ts` (`ASSIGNABLE_ROLES`=[Admin,Manager,Editor] — SuperAdmin
  never assignable; `assignableRolesFor`; `userRowControls`) wraps the Slice-3 tier
  rules into per-row UI controls AND the API re-checks the SAME `canChangeRole`/
  `canRemoveUser` (UI is defense-in-depth, /api/* is enforcement). Routes:
  `GET /api/users` (+`PATCH`/`DELETE /api/users/[id]`) + `DELETE /api/invite/[id]`,
  all `requireUserManager` (Manager+). Page `/admin/settings/users` + client
  `users-manager.tsx`. The `roles` i18n namespace (lowercase-first keys mirroring
  PM) IS now translated EN/FI/ET — role LABELS no longer deferred. SettingsNav has
  a `users` tab. When adding a new role-bearing UI, use `userRowControls`/
  `assignableRolesFor`, don't re-derive the tier math.

- **`deleteUser` SWEEPS SESSIONS (Slice 5).** `db/user-store.ts deleteUser(id)`
  deletes the user's `session` rows too (no FK cascade on D1), so a removed user is
  signed out immediately on their next request. If you add another credential table
  keyed on userId (e.g. a future Google-link table), sweep it here too.

- **SSO users show as `<uuid>@pm.sso` in the user list (Slice 5 surfaces the Slice-2
  stopgap).** The list flags `ssoOnly` (passwordHash==null) → UI shows "Single
  sign-on". When PM's cms-validate is extended to return the real verified email
  (the Slice-2 FOLLOW-UP), backfill these rows and the list shows the real email.

- **GOOGLE SIGN-IN LANDED (Slice 2b).** Pure `lib/auth/google-core.ts`
  (buildGoogleAuthUrl / signState+verifyState / verifiedEmailFromIdToken /
  decideGoogleSignIn) is node-testable (type-only `CmsRole` not even needed; no
  `@/`, only `globalThis.crypto`). Routes `app/api/auth/google/{start,callback}`.
  KEY RULES, don't break:
  • **redirect_uri = `<APP_ORIGIN>/api/auth/google/callback`** in BOTH start and
    callback — Google rejects a mismatch, AND it must equal the URI registered in
    the Google client. NEVER derive it from request Host headers (registration
    mismatch + redirect-URI poisoning). APP_ORIGIN is the deployer-injected
    stable workers.dev origin (same var Slice 4 uses for invite links).
  • **NO self-signup (Slice-0 decision 3):** `decideGoogleSignIn` allows a verified
    email ONLY if a CMS user OR a pending invite exists. An invited-but-not-yet-a-
    user email is NOT auto-created here — it's redirected to `?error=googleInvite
    Pending` to finish via the invite-accept flow (keeps ONE user-creation path).
    Existing users sign in directly (mint `bizbee_session`).
  • **state CSRF is STATELESS** — HMAC(nonce.timestamp) with CMS_AUTH_SECRET, 10-min
    TTL. No store (the CMS has no KV; D1 would be overkill for a 10-min token).
  • id_token is decoded, NOT JWK-signature-verified — provenance is the TLS direct
    server-to-server token exchange (we hold client_secret). Full JWK verify is a
    hardening follow-up, not required for the direct-exchange threat model.
  • Google client id/secret are PER-SITE, configured in the CMS settings UI and
    stored ENCRYPTED in the CMS's own D1 (see the "PER-SITE GOOGLE CREDS" caveat).
    There is NO shared deployer-injected client — the old `GOOGLE_CLIENT_ID`/
    `GOOGLE_CLIENT_SECRET` deployer vars + wrangler.jsonc placeholders were RIPPED OUT
    (REWORK #4, 2026-06-23 17:01); don't reintroduce them. A Site with no client
    configured simply hides the button + the routes no-op. Live provisioning +
    round-trip is in HITL.md ## Open (P1).

- **PER-SITE GOOGLE CREDS NOW STORED IN CMS D1 (REWORK storage slice landed
  2026-06-23).** A customer's OWN Google client id/secret live in ONE generic
  `site_settings` row keyed `google_client` = `{clientId, clientSecretEnc}` (NO new
  table/column — reused the JSON settings store). The secret is AES-256-GCM
  encrypted via the NEW CMS-local `lib/crypto/secret-box.ts` (mirror of PM's), KEK =
  the existing `CMS_AUTH_SECRET` Worker var (NOT a new secret — reuse it; it's
  deployer-injected + already the google-core HMAC key). Access only via
  `db/google-client-store.ts` (getGoogleClientConfig / setGoogleClientConfig /
  clearGoogleClientConfig / **getDecryptedClientSecret** — the last is for the NEXT
  slice's route rewrite; it returns null on decrypt-fail, NEVER 500). Pure
  validation/`isGoogleConfigured`/`toGoogleClientStatus` (never leaks the secret) in
  `lib/auth/google-config.ts`. `isGoogleConfigured` needs BOTH id AND secret. Route
  `GET/PATCH/DELETE /api/settings/google` is `requireUserManager` (Manager+); page
  `/admin/settings/google`.

- **OAUTH ROUTES NOW USE PER-SITE D1 CREDS (REWORK #2 landed 2026-06-23).**
  `app/api/auth/google/{start,callback}` read the clientId from
  `getGoogleClientConfig()` and decrypt the secret via
  `getDecryptedClientSecret(CMS_AUTH_SECRET)` at request time — they NO LONGER read
  `env.GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET`. The pure decision is
  `decideGoogleRoute(config, appOrigin)` in `lib/auth/google-config.ts`
  (`{ usable, clientId, redirectUri }`; usable = configured + appOrigin; redirect_uri
  = `<appOrigin>/api/auth/google/callback`). `start` no-ops to `/admin` when not
  usable; `callback` → `?error=google` when not usable OR decrypt returns null (decrypt
  failure NEVER 500s). `CMS_AUTH_SECRET` is STILL read from env — it's the KEK + the
  state-HMAC key, NOT a Google credential; don't remove it. **REMAINING REWORK TODO:**
  #4 rip the shared `GOOGLE_CLIENT_ID/SECRET` out of deployer + wrangler + the "GOOGLE
  SIGN-IN LANDED" caveat's last bullet (still describes the shared-client model — update
  it then).

- **GOOGLE id_token IS NOW JWK-RS256-VERIFIED (hardening landed 2026-06-23 17:07).**
  The callback route verifies the id_token signature against Google's JWKS BEFORE
  reading any claim. Pure `verifyIdTokenSignature(idToken, jwks)` in `google-core.ts`
  is fail-closed (alg must be RS256; JWK picked by `kid`; any mismatch/missing-key/
  malformed → false). The JWKS fetcher `fetchGoogleJwks()` (module-level 1h cache,
  `GOOGLE_JWKS_URI`) lives IN the callback route to keep google-core pure — don't move
  it into google-core (it does a network fetch). If JWKS can't be fetched OR the sig
  doesn't match → `?error=google` (never 500). GOTCHA: WebCrypto `verify` needs
  ArrayBuffer-backed BufferSource — the sig/data are copied via `.slice().buffer`
  before the call (else tsc flags `Uint8Array<ArrayBufferLike>`). The earlier "Full
  JWK verification is a hardening follow-up" note in google-core's header comment is
  now SUPERSEDED by this function.

- **LOGIN GOOGLE BUTTON IS GATED ON PER-SITE CONFIG (REWORK #3 landed 2026-06-23).**
  `admin/layout.tsx` computes `showGoogle = decideGoogleRoute(await
  getGoogleClientConfig(), APP_ORIGIN).usable` — NOT `env.GOOGLE_CLIENT_ID` anymore
  (that read is gone from the layout's env cast). Button + OAuth routes (REWORK #2)
  now share ONE signal (`decideGoogleRoute(...).usable`) so they can't disagree. No
  config / half-config (id-no-secret) / missing APP_ORIGIN → button hidden. The
  remaining `env.GOOGLE_CLIENT_*` references live ONLY in deployer/wrangler shared
  injection — REWORK #4 rips those out.
