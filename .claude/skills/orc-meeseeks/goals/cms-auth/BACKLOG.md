# Backlog — cms-auth
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order is deliberate: settle the identity model (Slice 0) BEFORE building
schema/login/invites on top of it. Each slice gates on CMS tsc + opennext build
green + regen PM cms-bundle + EN/FI/ET for new strings.

- TODO: **Slice 0 — settle the identity model (DESIGN + the ONE fork, tiny PR).**
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

- TODO: **Slice 1 — CMS user + session schema + password auth (mirror PM, no
  countries).** Add to `CMS/src/db/schema.ts`: a `users` table (id, email unique,
  passwordHash nullable for SSO-only users, role, createdAt) and whatever session
  store the model slice picked (KV session like PM, or a sessions table). Port
  `ProjectManager/src/lib/auth/password.ts` (PBKDF2 **100k** — do not exceed) and
  `session.ts` (cookie + KV, 7-day TTL) into the CMS, DROPPING all country code.
  Add the Drizzle migration and confirm the deployer applies CMS migrations
  per-Site (note in JOURNAL if it doesn't — that's a follow-up). Node test the
  password hash/verify round-trip (no live crypto-cap surprise) + session
  create/read. NO UI yet.

- TODO: **Slice 2 — in-CMS login page replaces the auto-redirect; conditional SSO
  button.** Replace the auto-redirect in `CMS/src/app/admin/layout.tsx`: when
  signed-out, render an in-CMS **login page** (email + password form → a new
  `POST /api/auth/login` on the CMS that verifies against the Slice 1 user table
  and mints the CMS session). Show a **"Sign in with BizbeeCMS" SSO button ONLY
  when the visitor arrived from PM** — detect via `Referer`/an explicit `?from=pm`
  param matched against `PM_ORIGIN` from config (study `forwarded-host`/`guard.ts`
  for the existing host-from-config pattern; NEVER hardcode the domain). The button
  triggers the EXISTING cms-sso → sso-callback handoff (keep it intact). Reconcile
  the SSO-callback session with the local-login session per Slice 0 (one cookie).
  EN/FI/ET for the page + button. Node test the SSO-button visibility helper
  (origin match true/false).

- TODO: **Slice 3 — CMS roles + server-side authorization (mirror PM minus
  country).** Define the CMS role set (RECOMMEND `Owner` | `Editor` — Owner can
  invite + manage users + everything; Editor edits content only; settle exact names
  in the PR and note why). Pure role-check helpers (`canInvite`, `canManageUsers`,
  `canEditContent`) with node tests. Wire them into BOTH guard layers: the
  `/admin/*` page gate (`admin/layout.tsx`/guard) AND the `/api/*` route guard — a
  page-only check is bypassable. SSO-provisioned operators get a role per Slice 0.
  EN/FI/ET for any role label/error.

- TODO: **Slice 4 — invitation flow (token + email + accept), mirror PM minus
  country.** Add an `invites` table (id, email, role, invitedBy, token 64-hex,
  acceptedAt, expiresAt 7-day TTL — copy PM's shape, drop `invite_countries`).
  `POST /api/invite` (Owner-only per Slice 3) creates the invite + sends the accept
  email via the Cloudflare EMAIL binding with an `APP_ORIGIN`-based accept URL
  (mirror PM `lib/mail/send-invite.ts`; confirm the CMS Worker has an EMAIL binding
  + `APP_ORIGIN` var — if not, that's a deployer-wiring sub-task, note it).
  `POST /api/invite/accept/[token]` validates expiry/accepted, the invitee sets a
  password (10-char min), creates the CMS user with the invited role, mints a
  session. Node test: invite create → accept happy path + expired/already-accepted
  rejection (mock email). EN/FI/ET for the invite email + accept page.

- TODO: **Slice 5 — CMS member management UI (list / invite / change role /
  revoke).** An admin page (Owner-only) listing CMS users + pending invites, with
  invite-by-email + role select, change-role, and revoke-invite / remove-user.
  Reuse the design-system components + purpose tokens. Deletions use an IN-APP
  confirm modal (NO native confirm — breaks browser-review sessions). EN/FI/ET.
  Gate as usual.
