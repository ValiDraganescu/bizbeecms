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

- DONE: **P3 — PM `POST /api/auth/reset`.** Added `checkReset`/`applyReset` to
  `lib/reset/reset.ts` (mirror invite's `checkInvite`): classify notFound/used/
  expired/valid; `applyReset` marks `usedAt` under an `isNull(usedAt)` guarded
  update (single-use, concurrency-safe), sets a fresh `hashPassword` on the user,
  then `invalidateUserSessions(userId)`. New `invalidateUserSessions` in
  `lib/auth/session.ts` (KV `list({prefix})` scan → delete records matching
  userId; ponytail: O(all sessions), add a userId→session index if volume grows).
  Route `src/app/api/auth/reset/route.ts`: validates token presence + password
  (register min-length via `validatePassword`) + confirm match; ALL invalid/
  expired/used collapse to one generic `auth.errors.resetTokenInvalid` (no detail
  leak). String added EN/FI/ET. Test `lib/reset/reset-route.test.ts`. Gates green
  (tsc / 166 tests / opennext build; route in manifest).

- DONE: **P4 — PM forgot/reset pages + login link.** `(auth)/forgot` page+form
  (email → POST /api/auth/forgot; on any 2xx shows the enumeration-safe success +
  back-to-sign-in, no body branching) + `(auth)/reset/[token]` page+form
  (password+confirm → POST /api/auth/reset, min-length 10 via MIN_PASSWORD_LENGTH,
  generic resetTokenInvalid for all token failures, success → /login). Added a
  "Forgot password?" link to `login-form.tsx`. New strings auth.login.forgotPassword
  + auth.forgot.{title,subtitle,submit,success,backToSignIn} + auth.reset.{title,
  subtitle,submit} in EN/FI/ET. Gates green (tsc / 166 tests / opennext build;
  both pages in .next/server output).

- DONE: **P5 — PM reset pure-logic tests.** Extracted token classification out of
  `checkReset` into a pure `lib/reset/reset-logic.ts` (`classifyReset(row, now)`,
  no DB/`@/` deps) so it's BEHAVIORALLY testable; `checkReset` now delegates to it.
  New `reset-logic.test.ts` EXECUTES the real logic: validity, expiry BOUNDARY
  (just-valid @ now+1, expired @ now and now-1 — `<=` not `<`), single-use
  (`usedAt` set ⇒ used; used wins over expired), notFound, default-now.
  Fail-before verified (flip `<=`→`<` ⇒ boundary test fails). Rewired the
  source-text check in `reset-route.test.ts` to assert the delegation.
  Enumeration-safe hit===miss is already structurally locked by
  `forgot-route.test.ts` (single `{ok:true}` after the user block) — NOT
  re-added as a tautological deep-equal of a literal. Gates green
  (tsc / 170 tests / opennext build). **PM half P1–P5 COMPLETE.**

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
