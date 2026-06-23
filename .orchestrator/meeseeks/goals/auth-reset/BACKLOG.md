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

- DONE: **C1 — CMS `password_reset` table + migration.** Added `passwordReset`
  to `CMS/src/db/schema.ts` (`id`, `userId` FK→`user.id` ON DELETE cascade,
  `token` unique, `expiresAt`, `usedAt` nullable, `createdAt`) +
  `PasswordReset`/`NewPasswordReset` types. Table is SINGULAR `password_reset`
  (CMS naming convention: `user`/`session`/`invite`, not PM's plurals). FK kept
  per the C1 task spec (CMS's session/invite drop FKs by convention, but the
  spec asked for a cascade FK — done). Migration `0012_supreme_shriek.sql`
  (drizzle-kit generate auto-updated meta journal+snapshot). No route this run.
  Gates green (tsc / 733 tests / opennext build). NO bundle:cms (that's C5).
- DONE: **C2 — CMS `POST /api/auth/forgot`.** REST route (`CMS/src/app/api/auth/
  forgot/route.ts`) looks up user by email via CMS `findUserByEmail`; if found,
  mints a `password_reset` row (new `CMS/src/lib/reset/reset.ts`: `newResetToken`
  64-hex, `RESET_TTL_MS` 7d, `createPasswordReset` → `schema.passwordReset`
  SINGULAR) and sends the reset email via new `sendResetEmail` in CMS
  `lib/mail/send-invite.ts` (extracted shared `buildUrl`; `/reset/<token>` from
  `APP_ORIGIN`, graceful degrade). ALWAYS returns 200 `{ ok: true }` for hit AND
  miss; malformed email → 400 (inline regex, CMS has no `validateEmail`);
  mint/send in try/catch so failures never leak existence. New top-level
  `resetEmail.{subject,body}` strings EN/FI/ET (mirrors `inviteEmail`). Test
  `lib/reset/forgot-route.test.ts`. Gates green (tsc / 737 tests / opennext build;
  route in manifest). NO bundle:cms (that's C5).
- DONE: **C3 — CMS `POST /api/auth/reset`.** Added `checkReset`/`applyReset` to
  `CMS/src/lib/reset/reset.ts` + pure `reset-logic.ts` (`classifyReset`, alias-free).
  `applyReset` re-validates via `checkReset`→`classifyReset`, marks `usedAt` under a
  guarded `update … where isNull(usedAt) … returning` (0 rows ⇒ used ⇒ reject) BEFORE
  hashing (TOCTOU-safe), sets a fresh `hashPassword` on `schema.user`, then kills the
  user's sessions with a PLAIN INDEXED `delete from session where userId = ?` (CMS
  sessions are D1 w/ `session_user_idx` — no KV prefix-scan like PM). Route
  `CMS/src/app/api/auth/reset/route.ts` returns web `Response.json`; min-length via
  `isPasswordLongEnough` (MIN_PASSWORD_LENGTH=10, same as invite-accept); ALL
  invalid/expired/used collapse to ONE generic `resetTokenInvalid` (never reads
  `reason`). Error keys are bare (`passwordRequired`/`passwordTooShort`/
  `passwordMismatch`/`resetTokenInvalid`) — translated by the C4 page, mirroring how
  invite-accept route works, so C3 adds NO message strings (i18n parity untouched).
  Test `lib/reset/reset-route.test.ts` (source-text, +6). Gates green (tsc / 743 tests
  / opennext build; route in manifest). NO bundle:cms (that's C5).
- DONE: **C4 — CMS forgot/reset pages + login-form link.** Public `/forgot` page
  (`app/forgot/page.tsx` → `ForgotPasswordForm`: email → POST /api/auth/forgot;
  on ANY 2xx shows the enumeration-safe success + back-to-sign-in, NO body
  branching) + `/reset/[token]` page (`app/reset/[token]/page.tsx` server-gates on
  `checkReset` status like invite-accept — notFound/expired/used all collapse to
  ONE generic notice; valid → `ResetPasswordForm`: password+confirm → POST
  /api/auth/reset, minLength 10, maps bare error keys
  resetTokenInvalid/passwordTooShort/passwordRequired/passwordMismatch to messages,
  success → hard-nav /admin which shows login since sessions were killed). Added a
  "Forgot password?" link (`href="/forgot"`) under the login button in
  `login-form.tsx`. REST+fetch, NO server actions. New strings: top-level
  `forgotPassword.*` + `resetPassword.*` + `login.forgotPassword` (CMS top-level
  convention, NOT PM's `auth.*` nesting) in EN/FI/ET (parity verified 0 missing/
  extra). Gates green (tsc / 743 tests / opennext build; both pages in route
  table). NO bundle:cms (that's C5). UI-only slice — no new behavioral test (pages
  are thin wiring over the already-tested forgot/reset routes).
- DONE: **C5 — CMS reset pure-logic tests + regen PM `cms-bundle`.** New
  `CMS/src/lib/reset/reset-logic.test.ts` EXECUTES the real `classifyReset`
  (mirrors PM's): validity, expiry BOUNDARY (just-valid @ now+1, expired @ now
  and now-1, `<=` not `<`), single-use (`usedAt` ⇒ used; used wins over expired),
  notFound, default-now. Fail-before verified (flip `<=`→`<` ⇒ boundary test
  fails, reverted). Then ran `bundle:cms` (from PM) as LAST step → regenerated
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js` (7853 KB) shipping all
  CMS C1–C5 changes into the PM-deployable bundle. Gates green: CMS tsc / 748
  tests / opennext build; PM tsc + opennext build confirmed after bundle regen.
  **CMS half C1–C5 COMPLETE → auth-reset full PM+CMS scope done.**

Build order rationale: schema→API(forgot)→API(reset)→UI→tests per app. PM proves
the shape; CMS mirrors it. The forgot endpoint can land before reset (it just
mints+emails); reset needs the table from slice 1. Tests last so they assert the
real shipped behavior.
