# Backlog — cms-auth
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order is deliberate: settle the identity model (Slice 0) BEFORE building
schema/login/invites on top of it. Each slice gates on CMS tsc + opennext build
green + regen PM cms-bundle + EN/FI/ET for new strings.

- DONE: **Slice 0 — settle the identity model (DESIGN + the ONE fork, tiny PR).**
  Decide and write down in this goal's GOAL/CAVEATS (and a short JOURNAL entry) the
  central fork before any code: does a PM-SSO login **auto-provision a CMS user
  row** (one unified CMS user table, SSO + local both produce a CMS user with a
  CMS-local role) OR does SSO stay a parallel "operator bypass" path? RECOMMEND
  auto-provision: it gives ONE session notion on the CMS host and lets roles apply
  uniformly (the SSO callback already sets a CMS-host session — extend it to upsert
  a CMS user). Also decide: cookie name (reuse `bizbee_session` on the CMS host vs.
  a distinct name) and the first-user/bootstrap rule (who is the first CMS Owner —
  the PM creator auto-seeded at deploy? the first SSO operator? explicit). No new
  runtime code beyond doc; if a trivial type/const helps, add it. This unblocks all
  other slices.

- DONE: **Slice 1 — CMS user + session schema + password auth (mirror PM, no
  countries).** user+session tables (session in D1 — NO KV binding on the CMS
  Worker), PBKDF2-100k password.ts ported verbatim, pure session-core, user +
  session stores via the Db port, migration 0009, node tests (526 green), tsc +
  opennext build green, deployer-applies-migrations confirmed. cms-bundle NOT
  regenerated (no runtime route added this slice; PM predeploy regens it). See
  JOURNAL 2026-06-22 12:46. Original spec below.
  Add to `CMS/src/db/schema.ts`: a `users` table (id, email unique,
  passwordHash nullable for SSO-only users, role, createdAt) and whatever session
  store the model slice picked (KV session like PM, or a sessions table). Port
  `ProjectManager/src/lib/auth/password.ts` (PBKDF2 **100k** — do not exceed) and
  `session.ts` (cookie + KV, 7-day TTL) into the CMS, DROPPING all country code.
  Add the Drizzle migration and confirm the deployer applies CMS migrations
  per-Site (note in JOURNAL if it doesn't — that's a follow-up). Node test the
  password hash/verify round-trip (no live crypto-cap surprise) + session
  create/read. NO UI yet.

- DONE: **Slice 2 — in-CMS login page replaces the auto-redirect; email/password +
  conditional SSO button (Google added in Slice 2b).** See JOURNAL 2026-06-22 13:01.
  Login page + `POST /api/auth/login` + guard resolves sessions LOCALLY (no more
  per-request PM forward) + sso-callback rewired (nonce→sid→cms-validate handshake→
  upsert Admin user→mint local session) + pure `shouldShowSsoButton` (node-tested) +
  EN/FI/ET `login` namespace + cms-bundle regenerated. tsc + opennext build green,
  544 tests. SSO user keyed by synthetic `<pmUserId>@pm.sso` email (cms-validate
  returns no email; can't touch PM this slice) — backfill caveat noted. Original
  spec below.
  Replace the auto-redirect in
  `CMS/src/app/admin/layout.tsx`: when signed-out, render an in-CMS **login page**
  (email + password form → a new `POST /api/auth/login` on the CMS that verifies
  against the Slice 1 user table and mints the CMS session). Show a **"Sign in with
  BizbeeCMS" SSO button ONLY when the visitor arrived from PM** — detect via
  `Referer`/an explicit `?from=pm` param matched against `PM_ORIGIN` from config
  (study `forwarded-host`/`guard.ts` for the existing host-from-config pattern;
  NEVER hardcode the domain). The button triggers the EXISTING cms-sso →
  sso-callback handoff (keep it intact). Reconcile the SSO-callback session with the
  local-login session per Slice 0 (one cookie). Leave a placeholder slot for the
  Google button (Slice 2b). EN/FI/ET for the page + button. Node test the SSO-button
  visibility helper (origin match true/false).

- TODO: **Slice 2b — Google sign-in (OAuth 2.0, own client) on the login page.**
  USER 2026-06-21: the login page must also offer **Sign in with Google**. NO Google
  auth exists anywhere in the repo today — this is net-new. Register a Google Cloud
  OAuth 2.0 client; add `GET /api/auth/google/start` (redirect to Google's consent
  with state/PKCE) + `GET /api/auth/google/callback` (exchange code, verify the
  id_token, read the VERIFIED email). On callback: match an existing CMS user by
  email → sign in; else create a CMS user (role per Slice 0/3 — an UNINVITED Google
  user with no prior row: decide whether to allow self-signup or require a matching
  invite; RECOMMEND require an existing user/invite so randoms can't get in — note
  the choice). Mint the same CMS session cookie (one session notion). Client
  id/secret + redirect origin from Worker vars/secrets (deployer-injected, NEVER
  hardcoded — thread like PM_ORIGIN/CMS_AUTH_SECRET). Pure helpers (state/nonce
  verify, id_token email extraction) node-tested; do NOT call live Google in tests.
  EN/FI/ET for the button. Gate.

- DONE: **Slice 3 — CMS roles + server-side authorization.** See JOURNAL
  2026-06-22 13:43. Added pure `lib/auth/roles.ts` (canRemoveUser/canChangeRole/
  canInvite/canInviteRole/canManageUsers/canEditContent + INVITABLE_ROLES,
  scope-free mirror of PM removal.ts), threaded `role` through `GuardDecision`
  (+ `forbidden`/403 reason), added API gate `requireRole`/`requireUserManager`
  + page gate `checkRoleFromHeaders`. 7 new node tests, 608 total green, tsc +
  opennext build green. No migration (role col exists Slice 1), no new strings
  (role LABELS deferred to Slice 5), no bundle regen (helpers not yet
  route-imported). Original spec below.
  Use PM's role set from the `pm-roles` subgoal
  (`SuperAdmin | Admin | Manager | Editor` + `canRemoveUser` hierarchy) — copy the
  NAMES + the removal helper, DROP country/tag scope (a single CMS = one Site).
  USER RULE 2026-06-21: a PM user reaching the CMS via SSO/cms-validate = **Admin**
  (auto-provisioned per Slice 0). CMS-local users get their role from their invite.
  Pure role-check helpers (`canInvite`, `canManageUsers`, `canEditContent`,
  `canRemoveUser`) with node tests. Wire into BOTH guard layers: the `/admin/*` page
  gate (`admin/layout.tsx`/guard) AND the `/api/*` route guard — page-only is
  bypassable. EN/FI/ET for role labels/errors. (Coordinate with pm-roles: same role
  names so the CMS can mirror; if pm-roles hasn't landed the names yet, this is
  loosely BLOCKED — note it and you may proceed with the agreed names.)

- DONE: **Slice 4 — invitation flow (token + email + accept) via Cloudflare Email
  Service.** See JOURNAL 2026-06-22 14:23. `invite` table + migration 0011, pure
  `invite-core.ts` (token/TTL/classify) + CF `invite-store.ts` (create/accept
  lifecycle, injectedDb-testable), `send-invite.ts` over the `send_email` binding
  (degrades to logging; `APP_ORIGIN`-based accept URL), `POST /api/invite` (gated
  by canInvite + canInviteRole) + `POST /api/invite/accept/[token]` (hash + mint
  session) + public accept page/form, EN/FI/ET, cms-bundle regen. Deployer injects
  `APP_ORIGIN`; `send_email` binding declared COMMENTED in wrangler (needs verified
  sender domain on Paid). 9 invite tests, 690 total, tsc + opennext build green.
  Original spec below.
  Add an `invites` table (id, email, role, invitedBy, token 64-hex,
  acceptedAt, expiresAt 7-day TTL — copy PM's shape, drop `invite_countries`).
  `POST /api/invite` (gated by `canInvite`, Slice 3) creates the invite + sends the
  accept email via the **Cloudflare Email Service**
  (https://developers.cloudflare.com/email-service/ — the `send_email` binding;
  mirror PM `lib/mail/send-invite.ts`, which already targets `env.EMAIL.send`).
  Confirm the CMS Worker has the `send_email` binding + a verified sender +
  `APP_ORIGIN` var; PM's `wrangler.jsonc` has the binding COMMENTED OUT — provision
  it for the CMS (deployer-wiring sub-task; note it if blocked). Accept URL is
  `APP_ORIGIN`-based. `POST /api/invite/accept/[token]` validates expiry/accepted,
  the invitee sets a password (10-char min) OR links Google (Slice 2b), creates the
  CMS user with the invited role, mints a session. Node test: invite create →
  accept happy path + expired/already-accepted rejection (mock email; no live send).
  EN/FI/ET for the invite email + accept page.

- TODO: **Slice 5 — CMS user management UI (list / invite / change role / remove).**
  An admin page (gated by `canManageUsers`) listing CMS users + pending invites,
  with invite-by-email + role select (the Slice 3 role set), change-role, and
  revoke-invite / remove-user — every mutation enforcing `canRemoveUser` /
  role-change rules. Reuse the design-system components + purpose tokens. Deletions
  use an IN-APP confirm modal (NO native confirm — breaks browser-review sessions).
  EN/FI/ET. Gate as usual. (Mirrors pm-roles Slice 5, CMS-local, no country/tag.)
