# Journal — cms-auth
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:01 — Slice 0: settle the identity model (design + the one fork)
- **Status:** DONE
- **What I did:** Resolved the central design fork (the thing every later slice
  sits on) and wrote it down — no runtime code, design-only as the slice spec said.
  Decisions: (1) ONE unified CMS `users` table; PM-SSO login AUTO-PROVISIONS a row
  (match by verified email, role=Admin per the USER "PM-with-site-access=Admin"
  rule, passwordHash=NULL for SSO-only) — no parallel operator path. (2) ONE
  session cookie, name kept `bizbee_session` (different host than PM, no real
  collision) — but the cookie's VALUE meaning changes: today sso-callback stores
  PM's sid and the guard forwards it to PM cms-validate every request; after Slice
  1 the cookie holds a CMS-LOCAL session id and the guard resolves locally, so
  Slice 1/2 must rewrite sso-callback (nonce-exchange → upsert CMS user → mint
  local session) and cms-validate becomes the SSO handshake only. (3) No local
  first-registrant SuperAdmin bootstrap — first CMS user = first PM operator via
  SSO (auto-provisioned Admin); uninvited email/Google with no matching row =
  rejected (no self-signup). (4) Role set mirrors pm-roles exactly:
  SuperAdmin|Admin|Manager|Editor + canRemoveUser hierarchy, country/tag scope
  dropped. Recorded in GOAL.md ("Settled identity model" section) + CAVEATS.md
  (fixed-decisions block) + this entry.
- **Verified:** Confirmed against code, not assumption: `sso-callback/route.ts`
  sets `bizbee_session` = PM sid; `guard-core.ts` `SESSION_COOKIE="bizbee_session"`
  and forwards the cookie to PM cms-validate; `admin/layout.tsx` does the signed-out
  PM redirect this goal replaces; `ProjectManager/src/lib/roles.test.ts` pins the
  4-role union (SuperAdmin|Admin|Manager|Editor, no SiteManager). No build/tsc run
  — this slice touches no CMS source (doc-only), so the gate is N/A this run.
- **Files:** GOAL.md, CAVEATS.md, BACKLOG.md (Slice 0 → DONE), JOURNAL.md, NEXT.md.

## 2026-06-22 12:46 — Slice 1: CMS user + session schema + password auth (mirror PM, no countries)
- **Status:** DONE
- **What I did:** First CODE slice. Gave the CMS its own local-user + session
  layer, mirroring PM's mechanics, dropping ALL country scope.
  - `CMS/src/lib/auth/password.ts` — PBKDF2-100k hashing ported VERBATIM from
    `ProjectManager/src/lib/auth/password.ts` (pure, node-loadable, no `@/` / no
    CF binding). Added `MIN_PASSWORD_LENGTH=10` + `isPasswordLongEnough` (PM's
    10-char floor) so the rule lives next to the primitive for Slice 2/4.
  - `CMS/src/lib/auth/session-core.ts` — PURE session logic (newSessionId 64-hex,
    buildSession, isSessionValid, `SESSION_COOKIE="bizbee_session"`, 7-day TTL).
    Node-testable; CF/cookie-bound half kept separate.
  - `CMS/src/db/schema.ts` — added `user` (id, email UNIQUE, passwordHash
    NULLABLE for SSO/Google-only, role TEXT default 'Editor', createdAt) +
    `session` (id, userId, createdAt, expiresAt; user idx) + `CmsRole` type +
    User/Session/New* type exports.
  - `CMS/src/db/user-store.ts` — CF-coupled (Db port): normalizeEmail,
    findUserByEmail/ById, createUser. Mirrors api-key-store; goes through
    `getDb()` so the sole-reader guard stays green (never touches `env.DB`).
  - `CMS/src/db/session-store.ts` — CF+cookie-coupled: createSession (insert row
    + set cookie), getSessionId, getSession (reads D1, rejects+sweeps expired),
    destroySession (delete row + clear cookie).
  - `CMS/migrations/0009_motionless_night_thrasher.sql` — Drizzle migration for
    both tables (via `npm run db:generate`).
  - Tests: `scripts/password.test.mjs` (round-trip + the 100k-iterations
    assertion that fails-in-CI if someone bumps above the Workers cap) +
    `scripts/session-core.test.mjs` (id/build/expiry).
- **KEY DECISION — session store is D1, NOT KV.** PM uses a KV `SESSIONS`
  binding, but the CMS Worker's `wrangler.jsonc` has NO KV binding (only DB, AI,
  MEDIA, ASSETS). Adding KV would be a new deployer-wiring sub-task; the deployer
  ALREADY provisions + migrates D1 per-Site. So sessions live in a D1 `session`
  table — one less binding to wire, the DB is already the Site boundary. D1 has
  no auto-TTL so getSession() rejects + opportunistically deletes expired rows.
- **Verified:**
  - CMS `npx tsc --noEmit` → exit 0.
  - `npm test` → 526/526 green (was 505; +21 from my two new test files), incl.
    the sole-reader guard (my stores use getDb(), no stray env.DB) and
    schema-migration test (4/4).
  - `npx opennextjs-cloudflare build` (the deploy gate) → "OpenNext build
    complete" (ran with no dev server up, per CAVEAT).
  - CONFIRMED the deployer applies CMS migrations per-Site:
    `deployer/src/index.ts:639` runs `npx wrangler d1 migrations apply DB
    --remote` over `migrations/` (migrations_dir in wrangler.jsonc) at every
    deploy — so 0009 auto-applies. No follow-up needed there.
- **DID NOT regen PM cms-bundle (deliberate).** `bundle:cms` bundles
  `CMS/.open-next/worker.js` (runtime worker), NOT migrations. Slice 1 adds no
  new route/UI imported by a worker entrypoint, so the runtime bundle is
  functionally unchanged; regenerating now only churns `builtAt`. PM's
  `predeploy` runs `bundle:cms` automatically and will pick these files up once
  Slice 2 imports them into a login route. (Also honored the task's "don't run
  bundle:cms unless your slice needs it" + stay-out-of-ProjectManager.)
- **Files:** CMS/src/lib/auth/password.ts, CMS/src/lib/auth/session-core.ts,
  CMS/src/db/schema.ts, CMS/src/db/user-store.ts, CMS/src/db/session-store.ts,
  CMS/migrations/0009_motionless_night_thrasher.sql,
  CMS/migrations/meta/_journal.json, CMS/migrations/meta/0009_snapshot.json,
  CMS/scripts/password.test.mjs, CMS/scripts/session-core.test.mjs.

## 2026-06-22 13:01 — Slice 2: in-CMS login page + guard goes local + SSO rewire
- **Status:** DONE
- **What I did:** Replaced the signed-out auto-redirect in `admin/layout.tsx` with
  an in-CMS LOGIN PAGE (email/password form + conditional SSO button + a Google
  placeholder slot for 2b). New `POST /api/auth/login` verifies via
  `findUserByEmail`+`verifyPassword` and mints a CMS-local session (`createSession`);
  rejects SSO/Google users (null passwordHash) and unknown emails with the SAME
  generic 401 (no email enumeration). **Guard now resolves sessions LOCALLY** —
  `guard.ts` `decide()` reads `getSession()` → `findUserById` instead of forwarding
  the cookie to PM cms-validate every request (local users have no PM row, so the
  old forward would have locked them out). Both entry points (`checkAdmin` for /api,
  `checkAdminFromHeaders` for pages) funnel through it; the `Request` arg on
  checkAdmin is now unused (kept for call-site compat). **Rewired
  `/api/auth/sso-callback`** per Slice-0 decision 2: nonce→PM sid → cms-validate
  handshake (with sid + SITE_ID) to get the PM userId → UPSERT a CMS user
  (role=Admin, passwordHash=NULL, keyed by a synthetic `<userId>@pm.sso` email
  since cms-validate doesn't return the email and I can't touch PM this slice) →
  `createSession` mints the local session cookie. cms-validate is now the SSO
  HANDSHAKE only, never a per-request authz call. Added pure
  `shouldShowSsoButton(referer, fromParam, pmOrigin)` to `guard-core.ts` (origin
  match against PM_ORIGIN from config — `?from=pm` hint OR Referer origin; missing
  origin = fail-closed hide). EN/FI/ET `login` namespace. Regenerated PM cms-bundle.
- **Verified:** `npm test` 544 pass (added 6 tests: shouldShowSsoButton true/false +
  fail-closed, login i18n parity). `npx tsc --noEmit` clean. `npx opennextjs-cloudflare
  build` green (dev confirmed not running first) — `/api/auth/login` +
  `/api/auth/sso-callback` both in the route manifest. `npm run bundle:cms` from
  ProjectManager regenerated `cms-bundle.generated.js`. Could NOT verify the live
  cross-host SSO handshake or a real login round-trip (needs a deployed Worker +
  PM) — HITL.
- **Files:** CMS/src/app/admin/layout.tsx, CMS/src/app/api/auth/login/route.ts (new),
  CMS/src/app/api/auth/sso-callback/route.ts, CMS/src/lib/auth/guard.ts,
  CMS/src/lib/auth/guard-core.ts, CMS/src/components/login-form.tsx (new),
  CMS/messages/{en,fi,et}.json, CMS/scripts/auth-guard.test.mjs,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-22 13:43 — Slice 3: CMS roles + server-side authorization
- **Status:** DONE
- **What I did:** Added `CMS/src/lib/auth/roles.ts` — pure, dep-free role-tier
  helpers mirroring PM's `removal.ts` VERBATIM with country/tag scope DROPPED:
  `canRemoveUser`, `canChangeRole` (strictly-greater RANK + no self), `canInvite`
  (Manager+), `canInviteRole` (must outrank grant + never SuperAdmin),
  `canManageUsers` (Manager+), `canEditContent` (all users), `INVITABLE_ROLES`.
  Type-only-imports `CmsRole` from schema so it runs under bare `node --test`.
  Threaded `role` through `GuardDecision` (guard-core.ts: allow branch gains
  `role?: CmsRole`; deny branch gains a `forbidden` reason → 403). `guard.ts`
  `decide()` now returns `user.role`; added the API-layer role gate
  `requireRole(request, allowed)` (401 unsigned / 403 forbidden) +
  `requireUserManager` convenience, and the page-layer `checkRoleFromHeaders`
  (defense-in-depth so /admin pages can render a forbidden notice). Re-exported
  the role helpers from guard.ts for route call sites.
- **Verified:** `node --test roles.test.ts` 7/7 green; full `npm test` 608/608;
  `npx tsc --noEmit` clean; `npx opennextjs-cloudflare build` green. NO migration
  needed — the `role` column already exists (Slice 1, defaults Editor). NO new
  user strings → no cms-bundle regen (deferred role labels to Slice 5 per hint;
  parallel worker owns bundle:cms). New helpers aren't imported by a route yet
  (Slice 4/5 wire them), so the worker bundle is unchanged.
- **Files:** CMS/src/lib/auth/roles.ts (new), CMS/src/lib/auth/roles.test.ts (new),
  CMS/src/lib/auth/guard.ts, CMS/src/lib/auth/guard-core.ts.

## 2026-06-22 14:23 — Slice 4: invitation flow (token + email + accept) via CF Email Service
- **Status:** DONE
- **What I did:** Full token-based invite flow mirroring PM, country/tag scope
  DROPPED.
  - Schema: added an `invite` table (id, email, role, invited_by, token 64-hex
    UNIQUE, accepted_at, expires_at 7-day TTL, created_at) + types. Migration
    `0011_silky_micromacro.sql` (deployer auto-applies per-Site, CAVEAT-confirmed).
  - PURE `lib/invite/invite-core.ts` (no `@/`, type-only `CmsRole`): `newInviteToken`
    (32 bytes hex), `INVITE_TTL_MS` (7d), `buildInviteTimes`, `classifyInvite`
    (notFound/valid/expired/accepted, accepted-wins, `<=` expiry boundary).
  - CF-coupled `db/invite-store.ts` (Db port, NEVER env.DB): createInvite,
    findInviteByToken, hasPendingInvite (pending only, email-normalised),
    listPendingInvites, checkInvite, acceptInvite (re-validates token, creates the
    CMS user with the invited role + supplied HASH, marks accepted; email-unique
    backstop). Added an optional trailing `injectedDb` param (page-store pattern)
    to these + to user-store's `findUserByEmail`/`createUser` for node-testing —
    inject doesn't read env, so the sole-reader guard stays green.
  - `lib/mail/send-invite.ts`: Cloudflare Email Sending `send_email` binding
    (`env.EMAIL.send({to, from:{email,name}, subject, text})` — the Workers shape
    per the cloudflare-email-service skill). Degrades to logging the accept link +
    `delivered:false` when no binding (dev / not yet provisioned). Accept URL from
    `APP_ORIGIN` (Host-Header-Injection-safe; dev falls back to request host).
  - `POST /api/invite`: `checkAdmin` → `canInvite(inviterRole)` → `canInviteRole`
    (granted role strictly below inviter tier) → emailTaken/alreadyInvited 409s →
    create + send. `POST /api/invite/accept/[token]`: password (10-char min via
    `isPasswordLongEnough`) + confirm → hash → acceptInvite → mint session cookie.
  - Public `app/invite/accept/[token]/page.tsx` (no /admin guard — token IS the
    credential): gates on status, renders `AcceptInviteForm` (client) or a notice.
  - i18n: `inviteEmail` (subject/body) + `acceptInvite` namespaces, EN/FI/ET (parity
    verified). Regenerated the PM cms-bundle (runtime routes added).
  - Deploy wiring: declared the `send_email` binding (COMMENTED, like PM — needs a
    verified sender domain on Paid) + `APP_ORIGIN` var in CMS/wrangler.jsonc; the
    deployer now injects `APP_ORIGIN=https://<worker>.<WORKERS_DEV_SUFFIX>` (new
    const mirroring PM hosts.ts) via `--var`.
- **Verified:** `node --test scripts/invite.test.mjs` 9/9 (pure core + full
  create→accept lifecycle + expired/accepted/notFound/emailTaken rejections over
  in-memory sqlite); full `npm test` 690/690; `npx tsc --noEmit` clean;
  `npx opennextjs-cloudflare build` + `next build` green (all 3 invite routes
  present); sole-reader guard 4/4; deployer `wrangler deploy --dry-run` builds.
  Email NOT live-sent (no verified sender domain — out of codeable scope; binding
  stays commented, flow degrades to logging).
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0011_silky_micromacro.sql (+meta),
  CMS/src/lib/invite/invite-core.ts (new), CMS/src/db/invite-store.ts (new),
  CMS/src/db/user-store.ts (injectedDb param), CMS/src/lib/mail/send-invite.ts (new),
  CMS/src/app/api/invite/route.ts (new), CMS/src/app/api/invite/accept/[token]/route.ts
  (new), CMS/src/app/invite/accept/[token]/page.tsx (new),
  CMS/src/components/accept-invite-form.tsx (new), CMS/messages/{en,fi,et}.json,
  CMS/wrangler.jsonc, deployer/src/index.ts,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js, CMS/scripts/invite.test.mjs (new).

## 2026-06-22 14:32 — Slice 5: CMS user-management UI (list/invite/change-role/remove)
- **Status:** DONE
- **What I did:** Built the Manager+ user-management surface consuming Slice-3
  gates + Slice-4 invite API.
  - Pure `lib/auth/user-mgmt.ts` (`ASSIGNABLE_ROLES`, `assignableRolesFor`,
    `userRowControls`) — type-only `CmsRole`, node-loadable; wraps the Slice-3 tier
    rules into the exact per-row controls the UI renders AND the API re-checks.
  - Store fns: `listUsers`/`updateUserRole`/`deleteUser` (deleteUser also sweeps the
    user's `session` rows so a removed user is signed out — no FK cascade) in
    user-store; `deleteInvite` in invite-store. All take optional `injectedDb?` for
    node tests (same seam as Slice 4).
  - Routes: `GET /api/users` (list users incl. `ssoOnly` flag for `<uuid>@pm.sso`
    rows + pending invites + `me`, gated `requireUserManager`); `PATCH/DELETE
    /api/users/[id]` (re-run `canChangeRole`/`canRemoveUser` server-side, 403/404);
    `DELETE /api/invite/[id]` (revoke, `requireUserManager`).
  - UI: `/admin/settings/users` page (gated `checkRoleFromHeaders(canManageUsers)`)
    + client `users-manager.tsx` — invite form (role select bounded by
    `canInviteRole`), inline role `<select>` per row (options from
    `userRowControls`), remove + revoke via shared in-app `ConfirmModal` (NO native
    confirm). Added `users` tab to SettingsNav.
  - i18n: NEW `roles` namespace (lowercase-first keys, mirrors PM) + `users`
    namespace + `settingsNav.users`, EN/FI/ET parity (34 user keys + 4 role keys
    each). Role LABELS now translated (was deferred from Slice 3).
- **Verified:** `npm test` 716/716 green (12 new: pure gating + store CRUD over
  in-memory node:sqlite incl. session-sweep on delete). `npx tsc --noEmit` clean.
  `npx opennextjs-cloudflare build` green — all 5 new routes
  (/admin/settings/users, /api/users, /api/users/[id], /api/invite/[id]) present.
  cms-bundle regenerated (worker now serves the new routes). i18n parity asserted
  by key-count check. Could NOT live-test against a deployed Worker (no D1 binding
  offline) — store logic covered by node tests instead.
- **Files:** CMS/src/lib/auth/user-mgmt.ts (new), CMS/src/db/user-store.ts,
  CMS/src/db/invite-store.ts, CMS/src/app/api/users/route.ts (new),
  CMS/src/app/api/users/[id]/route.ts (new), CMS/src/app/api/invite/[id]/route.ts
  (new), CMS/src/app/admin/settings/users/page.tsx (new),
  CMS/src/components/settings/users-manager.tsx (new),
  CMS/src/components/settings/settings-nav.tsx, CMS/messages/{en,fi,et}.json,
  CMS/scripts/user-mgmt.test.mjs (new),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-22 14:47 — Slice 2b: Google sign-in (OAuth 2.0, own client)
- **Status:** DONE (offline code+tests+gate; live OAuth round-trip → HITL.md)
- **What I did:** Net-new "Sign in with Google" on the CMS login page. Pure
  `lib/auth/google-core.ts`: `buildGoogleAuthUrl` (scope `openid email`),
  stateless signed-state CSRF (`signState`/`verifyState` — HMAC over nonce+ts with
  CMS_AUTH_SECRET, 10-min TTL, NO server store needed), `verifiedEmailFromIdToken`
  (decodes the JWT payload + enforces Google iss, `aud===clientId`,
  `email_verified===true`, `exp` not past; normalises email), and the PURE
  `decideGoogleSignIn` rule — **no self-signup**: allowed ONLY if a CMS user OR a
  pending invite exists (Slice-0 decision 3). Routes: `GET /api/auth/google/start`
  (302 → consent w/ signed state; redirect_uri from APP_ORIGIN so it matches the
  registered client) + `GET /api/auth/google/callback` (verify state → token
  exchange holding client_secret → verify id_token → existence check via
  findUserByEmail/hasPendingInvite → mint `bizbee_session` for an existing user;
  uninvited→`?error=googleDenied`, invite-only→`?error=googleInvitePending`,
  failures→`?error=google`). Login page: Google button shown when GOOGLE_CLIENT_ID
  + APP_ORIGIN are set (server flag), `?error=` surfaced as a banner; the `or`
  divider now wraps Google+SSO. EN/FI/ET `login.google{Button,Denied,InvitePending,
  Error}`. Deployer threaded GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (Env type +
  container env injection + two `--var` lines) + CMS wrangler.jsonc placeholders.
- **Verified:** 17 new node tests (auth-URL params, state round-trip/tamper/
  wrong-secret/expiry/garbage, id_token aud/iss/verified/exp/malformed, decision
  matrix) — 733 total green. `npx tsc --noEmit` clean. `npx opennextjs-cloudflare
  build` green. cms-bundle regenerated from PM. COULD NOT verify the live Google
  consent/token round-trip or redirect-URI registration (needs a real Google OAuth
  client + deployed Worker) → appended to HITL.md ## Open (P1).
- **Files:** CMS/src/lib/auth/google-core.ts (new),
  CMS/src/app/api/auth/google/{start,callback}/route.ts (new),
  CMS/src/app/admin/layout.tsx, CMS/src/components/login-form.tsx,
  CMS/messages/{en,fi,et}.json, CMS/wrangler.jsonc,
  CMS/scripts/google-auth.test.mjs (new), deployer/src/index.ts,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js, HITL.md.

## 2026-06-23 16:46 — GOOGLE-CLIENT REWORK (storage slice): per-Site Google client creds in CMS settings (encrypted D1)
- **Status:** DONE
- **What I did:** First of the 4 rework TODOs — STORAGE + UI only, NO OAuth wiring
  yet (routes still read env this slice; the env→config swap is the NEXT TODO).
  Built the CMS-local secret-box (mirror of PM's `lib/crypto/secret-box.ts`, AES-256-GCM
  Web Crypto, pure/node-testable), a pure `lib/auth/google-config.ts` (validation +
  `isGoogleConfigured` [needs BOTH id AND secret] + normalize + `toGoogleClientStatus`
  which NEVER echoes the secret), and `db/google-client-store.ts` (stores one
  `site_settings` row `google_client` = `{clientId, clientSecretEnc}`; id plaintext,
  secret AES-encrypted with the KEK; injectedDb-testable, reads D1 only via the Db
  port). KEK = the existing `CMS_AUTH_SECRET` Worker var (no new secret to provision).
  REST route `GET/PATCH/DELETE /api/settings/google` gated by `requireUserManager`
  (Manager+); GET returns the safe status only. Settings page `/admin/settings/google`
  + client `google-client-manager.tsx` (write-only fields, configured/not-configured
  badge, clear via in-app ConfirmModal — no native confirm). SettingsNav `google` tab.
  EN/FI/ET `googleClient` namespace + `settingsNav.google`. `getDecryptedClientSecret`
  added for the NEXT slice (route rewrite) — decrypt failure returns null, never 500.
- **Verified:** new `scripts/google-client.test.mjs` (8 tests: config validation,
  is-configured, normalize, status-never-leaks-secret, secret-box round-trip +
  wrong-key/tamper reject, store set→status→decrypt→clear, wrong-KEK→null). Full
  suite 756 green, `tsc --noEmit` clean, `opennextjs-cloudflare build` complete,
  i18n EN==FI==ET key parity, cms-bundle regenerated (route is runtime-served).
- **Files:** CMS/src/lib/crypto/secret-box.ts (new),
  CMS/src/lib/auth/google-config.ts (new), CMS/src/db/google-client-store.ts (new),
  CMS/src/app/api/settings/google/route.ts (new),
  CMS/src/app/admin/settings/google/page.tsx (new),
  CMS/src/components/settings/google-client-manager.tsx (new),
  CMS/src/components/settings/settings-nav.tsx, CMS/messages/{en,fi,et}.json,
  CMS/scripts/google-client.test.mjs (new),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-23 16:52 — GOOGLE-CLIENT REWORK #2: OAuth routes source per-Site creds (not env)
- **Status:** DONE
- **What I did:** Rewrote `app/api/auth/google/{start,callback}/route.ts` to read the
  Google client id from the per-Site CMS-D1 config (`getGoogleClientConfig`) and the
  client secret via `getDecryptedClientSecret(CMS_AUTH_SECRET)` at request time —
  instead of `env.GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET`. Added a pure decision helper
  `decideGoogleRoute(config, appOrigin)` in `lib/auth/google-config.ts` that returns
  `{ usable, clientId, redirectUri }` (usable = configured client + non-empty appOrigin;
  redirect_uri = `<appOrigin>/api/auth/google/callback`, trailing slash stripped).
  `start` no-ops to `/admin` (no consent) when not usable; `callback` redirects
  `/admin?error=google` when not usable OR the secret decrypt returns null (NEVER 500).
  `google-core.ts` UNCHANGED (already param-driven). CMS_AUTH_SECRET still read from env
  (KEK + HMAC state key only — not a Google cred).
- **Verified:** 757 node tests pass (+1 new `decideGoogleRoute` case covering usable/
  no-origin/half-config/empty/trailing-slash); `npx tsc --noEmit` clean (fixed a
  `decision` name collision → renamed mine to `route`); `npx opennextjs-cloudflare build`
  green (dev server confirmed not running first); regen'd PM cms-bundle (both routes are
  runtime). Could not do a live Google round-trip (needs a real per-Site client — HITL).
- **Files:** CMS/src/app/api/auth/google/start/route.ts,
  CMS/src/app/api/auth/google/callback/route.ts, CMS/src/lib/auth/google-config.ts,
  CMS/scripts/google-client.test.mjs,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-23 16:57 — GOOGLE-CLIENT REWORK #3: login Google button gated on per-Site config
- **Status:** DONE
- **What I did:** Switched the login-page Google-button visibility from the shared
  env `GOOGLE_CLIENT_ID` to THIS Site's own D1 client config. `admin/layout.tsx`
  now computes `showGoogle = decideGoogleRoute(await getGoogleClientConfig(),
  APP_ORIGIN).usable` — the same single signal the OAuth routes use (REWORK #2), so
  button + routes can never disagree. Dropped `GOOGLE_CLIENT_ID` from the layout's
  `env` cast (no longer read there). No config / half-config (id but no secret) /
  missing APP_ORIGIN → button hidden; email/password + PM-SSO still work. No new
  i18n strings (button keys exist from Slice 2b).
- **Verified:** `decideGoogleRoute` usable-matrix already fully covered in
  `scripts/google-client.test.mjs` (configured→usable, half/empty/no-origin→not
  usable) — the visibility signal IS that helper, so NO duplicate test added
  (YAGNI). `npm test` 760/760 green; `npx tsc --noEmit` clean; `npx
  opennextjs-cloudflare build` green (dev confirmed not running first); regen'd PM
  cms-bundle (layout is a runtime page). Could not live-verify the button
  appears/hides on a deployed Worker (needs a real per-Site client → HITL).
- **Files:** CMS/src/app/admin/layout.tsx,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js.

## 2026-06-23 17:01 — REWORK #4: rip out shared deployer-injected Google client
- **Status:** DONE
- **What I did:** Final GOOGLE-CLIENT REWORK slice. Deleted the shared
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` everywhere: `deployer/src/index.ts` (the
  `Env` type fields + their comment block, the container-env block `GOOGLE_CLIENT_ID:
  env...` / `GOOGLE_CLIENT_SECRET: env...`, and the two `--var "GOOGLE_CLIENT_*"` lines
  in the wrangler-deploy command — also fixed the trailing `\` so `--var APP_ORIGIN`
  is now the last arg). `CMS/wrangler.jsonc`: removed the two empty placeholders and
  rewrote the comment to document the per-Site customer-client model. Nothing in the
  app layer ever read these post-REWORK-#2/#3 (routes use D1, layout uses D1), so this
  was pure dead-code removal.
- **Verified:** `grep GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET` across deployer/src +
  CMS/src + CMS/wrangler.jsonc → ZERO hits. CMS `npm test` 760 pass, `npx tsc --noEmit`
  clean, `npx opennextjs-cloudflare build` green, PM `npm run bundle:cms` regen OK.
  Deployer has no local TypeScript (only wrangler) so used a ts transpile syntax check
  → "syntax OK". No dev server was running during the build.
- **Files:** deployer/src/index.ts, CMS/wrangler.jsonc, ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-23 17:07 — Hardening: JWK RS256 signature verification of the Google id_token
- **Status:** DONE
- **What I did:** Backlog had NO queued TODO (GOOGLE-CLIENT REWORK fully closed) — invented
  the next valuable slice per skill rule 3, picking NEXT.md candidate #2 (hardening) over
  candidate #1 (the `@pm.sso` PM follow-up) because a PARALLEL ai-openrouter Meeseeks is
  actively editing ProjectManager/src (site-form/deploy/site.ts) — touching PM would collide.
  This slice is fully self-contained in CMS. Added defense-in-depth: the Google id_token's
  RS256 signature is now verified against Google's JWKS, on top of the existing
  TLS-direct-exchange provenance. Pure `verifyIdTokenSignature(idToken, jwks)` in
  `google-core.ts` (decodes the JWT header, requires alg=RS256, filters JWKS by `kid`,
  imports each RSA JWK via `crypto.subtle.importKey("jwk", …, RSASSA-PKCS1-v1_5/SHA-256)`
  and verifies — fail-closed on any mismatch/missing key/non-RS256/malformed). Exported
  `GOOGLE_JWKS_URI` + `GoogleJwk` type. The CF-bound `fetchGoogleJwks()` (module-level 1h
  cache) lives in the callback route (keeps google-core pure); the callback now verifies the
  signature BEFORE `verifiedEmailFromIdToken`, redirecting to `?error=google` if JWKS can't
  be fetched OR the signature doesn't match.
- **Verified:** 8 new node tests (real generated RSA keypair → sign → export public JWK →
  verify; covers happy path, kid-selection among multiple keys, wrong key, tampered payload,
  no-kid-match, alg=none, malformed/empty-JWKS). `npm test` 767 pass (was 760, +7 net — one
  pre-existing 0-count quirk). `npx tsc --noEmit` clean (fixed a `Uint8Array<ArrayBufferLike>`
  → `BufferSource` typing by copying into fresh `.slice().buffer` ArrayBuffers before
  `crypto.subtle.verify`). `npx opennextjs-cloudflare build` green (no dev server running).
  PM `npm run bundle:cms` regenerated (callback route is runtime worker code).
- **Files:** CMS/src/lib/auth/google-core.ts, CMS/src/app/api/auth/google/callback/route.ts,
  CMS/scripts/google-auth.test.mjs, ProjectManager/src/lib/deploy/cms-bundle.generated.js
