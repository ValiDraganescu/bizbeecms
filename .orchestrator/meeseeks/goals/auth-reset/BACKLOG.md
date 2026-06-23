# Backlog — auth-reset
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
PM first (slices P1–P5), then mirror in CMS (slices C1–C5). ONE app per worker run.

- DONE: **P1 — PM `password_resets` table + migration.** Added `passwordResets`
  to schema (`id`, `userId` FK→users cascade, `token` unique, `expiresAt`,
  `usedAt` nullable, `createdAt`) + types. Migration `0011_simple_rhino.sql`.
  Gates green (tsc / 154 tests / opennext build).

- DONE: **P2 — PM `POST /api/auth/forgot`.** REST route looks up user by email;
  if found, mints a `password_resets` row (`lib/reset/reset.ts`, 64-hex token,
  7d TTL via `RESET_TTL_MS`) and sends the reset email via new `sendResetEmail`
  in `lib/mail/send-invite.ts` (extracted a shared `buildUrl`; reset link is
  `/reset/<token>` from `APP_ORIGIN`, graceful degrade). ALWAYS returns 200
  `{ ok: true }` for hit AND miss; mint/send wrapped in try/catch so failures
  never leak existence. Strings `auth.forgot.email.{subject,body}` added EN/FI/ET.
  Test `lib/reset/forgot-route.test.ts`. Gates green (tsc / 158 tests / opennext).

- TODO: **P3 — PM `POST /api/auth/reset`.** Validate token (exists, `usedAt IS
  NULL`, `expiresAt` in future); on valid: set new password hash via
  `lib/auth/password.ts` (min-length per register route), set `usedAt`, invalidate
  the user's KV sessions (`lib/auth/session.ts`). Reject invalid/expired/used with
  a generic error (no detail leak). Gate.

- TODO: **P4 — PM forgot/reset pages + login link.** `(auth)/forgot` (email form
  → POST /api/auth/forgot, shows the enumeration-safe message) + `(auth)/reset/
  [token]` (new-password form → POST /api/auth/reset, success → login). Add a
  "Forgot password?" link to the login page. EN/FI/ET for all new strings. Gate.

- TODO: **P5 — PM reset pure-logic tests.** Dependency-free node tests
  (fail-before/pass-after): token validity, expiry boundary, single-use (2nd use
  rejected), enumeration-safe response (hit body === miss body). Mirror the style
  of existing PM `lib/**/*.test.ts`. Gate.

- TODO: **C1 — CMS `password_resets` table + migration** (mirror P1 in `CMS/src/`).
- TODO: **C2 — CMS `POST /api/auth/forgot`** (mirror P2; CMS `env.EMAIL`).
- TODO: **C3 — CMS `POST /api/auth/reset`** (mirror P3; CMS session store).
- TODO: **C4 — CMS forgot/reset pages + login-form link** (mirror P4; EN/FI/ET).
- TODO: **C5 — CMS reset pure-logic tests + regen PM `cms-bundle`** (mirror P5;
  LAST CMS slice runs `bundle:cms` to ship the CMS changes into the PM bundle).

Build order rationale: schema→API(forgot)→API(reset)→UI→tests per app. PM proves
the shape; CMS mirrors it. The forgot endpoint can land before reset (it just
mints+emails); reset needs the table from slice 1. Tests last so they assert the
real shipped behavior.
