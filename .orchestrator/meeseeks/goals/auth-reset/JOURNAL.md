# Journal — auth-reset
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-23 15:03 — P1: PM `password_resets` table + migration
- **Status:** DONE
- **What I did:** Added `passwordResets` table to PM schema (mirrors `invites`
  token pattern): `id` PK, `userId` FK→users (cascade), `token` (unique index
  `password_resets_token_unique`), `expiresAt` timestamp_ms, `usedAt`
  timestamp_ms nullable (single-use gate), `createdAt`. Added `PasswordReset` /
  `NewPasswordReset` types. Generated migration `0011_simple_rhino.sql` via
  `drizzle-kit generate` (meta journal/snapshot chain auto-updated). No route yet.
- **Verified:** `npx tsc --noEmit` exit 0; `npm test` 154 pass/0 fail;
  `opennextjs-cloudflare build` complete (worker saved). Migration SQL reviewed —
  clean CREATE TABLE + unique index, FK cascade matches invites.
- **Files:** ProjectManager/src/db/schema.ts,
  ProjectManager/migrations/0011_simple_rhino.sql,
  ProjectManager/migrations/meta/ (snapshot + journal).

## 2026-06-23 15:08 — P2: PM POST /api/auth/forgot (enumeration-safe reset request)
- **Status:** DONE
- **What I did:** Added the forgot-password request endpoint. New `src/lib/reset/reset.ts` (`newResetToken` 64-hex, `RESET_TTL_MS` 7d, `createPasswordReset(userId)` insert→returning). Extracted a shared `buildUrl(env, path)` in `lib/mail/send-invite.ts` and added `sendResetEmail({to,token,subject,body})` mirroring `sendInviteEmail`'s graceful degrade (no EMAIL binding or send throw → log + `delivered:false`), building `/reset/<token>` from `APP_ORIGIN`. New route `src/app/api/auth/forgot/route.ts`: validates email shape (400 on malformed only), looks up user; if matched, mints token + sends email inside a try/catch that swallows failures; ALWAYS returns 200 `{ ok: true }` for hit AND miss. Added `auth.forgot.email.{subject,body}` to EN/FI/ET.
- **Verified:** `npm test` 158/158 pass (incl. new `lib/reset/forgot-route.test.ts` asserting single success body after the user block, mint/send swallowed, token shape/TTL, i18n parity). `npx tsc --noEmit` clean. `npx opennextjs-cloudflare build` green; build manifest lists `ƒ /api/auth/forgot` and `.next/server/app/api/auth/forgot/route.js` exists. Dev (3601/3602) confirmed down before building. Did NOT exercise the live email send (runtime-only) or apply the migration.
- **Files:** ProjectManager/src/app/api/auth/forgot/route.ts (new), ProjectManager/src/lib/reset/reset.ts (new), ProjectManager/src/lib/reset/forgot-route.test.ts (new), ProjectManager/src/lib/mail/send-invite.ts (buildUrl extract + sendResetEmail), ProjectManager/messages/{en,fi,et}.json (auth.forgot.email)

## 2026-06-23 15:19 — P4: PM forgot/reset pages + "Forgot password?" login link
- **Status:** DONE
- **What I did:** Added the PM reset UI, mirroring the login/register/invite-accept
  page+form shape (REST+fetch, NO server actions). New `app/(auth)/forgot/page.tsx`
  (Card shell, `auth.forgot.title/subtitle`) + `forgot-form.tsx` — email field →
  `POST /api/auth/forgot`; on ANY 2xx flips to a success state showing the
  enumeration-safe `auth.forgot.success` + a "back to sign in" link (never branches
  on body, since hit===miss). New `app/(auth)/reset/[token]/page.tsx` +
  `reset-form.tsx` — password+confirm → `POST /api/auth/reset` with
  `{token,password,confirmPassword}`; min-length via `MIN_PASSWORD_LENGTH` (10, same
  hint as register); on `{ok:true}` `router.push("/login")`; all invalid/expired/
  used collapse to the existing generic `auth.errors.resetTokenInvalid` banner.
  Added a "Forgot password?" link to `login-form.tsx` (right-aligned under the
  password field) → `/forgot`. New strings `auth.login.forgotPassword`,
  `auth.forgot.{title,subtitle,submit,success,backToSignIn}`, `auth.reset.{title,
  subtitle,submit}` in EN/FI/ET.
- **Verified:** ports 3601/3602 clear before building; `npx tsc --noEmit` exit 0;
  `npm test` 166/166 pass (i18n parity test green with the new keys);
  `npx opennextjs-cloudflare build` green; `.next/server/app/(auth)/forgot/page.js`
  and `.../reset/[token]/page.js` both exist. Did NOT exercise the live flow in a
  browser (UI-only build verification) or apply the migration.
- **Files:** ProjectManager/src/app/(auth)/forgot/page.tsx (new),
  ProjectManager/src/app/(auth)/forgot/forgot-form.tsx (new),
  ProjectManager/src/app/(auth)/reset/[token]/page.tsx (new),
  ProjectManager/src/app/(auth)/reset/[token]/reset-form.tsx (new),
  ProjectManager/src/app/(auth)/login/login-form.tsx (forgot link),
  ProjectManager/messages/{en,fi,et}.json (auth.login.forgotPassword + auth.forgot.* + auth.reset.*)

## 2026-06-23 12:30 — P3: PM POST /api/auth/reset (validate token, set hash, kill sessions)
- **Status:** DONE
- **What I did:** Added `checkReset` (classify notFound/used/expired/valid, mirror invite's `checkInvite`) and `applyReset` to `lib/reset/reset.ts`. `applyReset` re-validates, marks `usedAt` via an `update … where isNull(usedAt)` guard (single-use + concurrency-safe: 0 rows updated ⇒ rejected as `used`), then `hashPassword(newPassword)` onto `users.passwordHash`, then `invalidateUserSessions(reset.userId)`. Added `invalidateUserSessions(userId)` to `lib/auth/session.ts` — KV sessions have NO userId index, so it pages `kv.list({ prefix: "session:" })`, reads each record, deletes those whose `userId` matches (ponytail-commented O(all-sessions) ceiling; eventual-consistency is safe because the hash already changed). New route `src/app/api/auth/reset/route.ts`: validates token presence, password via `validatePassword` (register min-length 10), confirm match; every applyReset failure (notFound/expired/used) collapses to ONE generic `auth.errors.resetTokenInvalid` (no detail leak; route never reads `result.reason`). Added `resetTokenInvalid` to EN/FI/ET.
- **Verified:** ports 3601/3602 clear; `npx tsc --noEmit` exit 0; `npm test` 166/166 pass (8 new in `lib/reset/reset-route.test.ts`: classify, `<=` expiry boundary, isNull single-use guard, hash+session-invalidate ordering, generic-error/no-reason-leak, min-length, i18n parity); `npx opennextjs-cloudflare build` green, `.next/server/app/api/auth/reset/route.js` exists + `/api/auth/reset` in app-paths-manifest. Did NOT exercise live KV/runtime (build-only) or apply the migration.
- **Files:** ProjectManager/src/app/api/auth/reset/route.ts (new), ProjectManager/src/lib/reset/reset.ts (checkReset/applyReset), ProjectManager/src/lib/auth/session.ts (invalidateUserSessions), ProjectManager/src/lib/reset/reset-route.test.ts (new), ProjectManager/messages/{en,fi,et}.json (auth.errors.resetTokenInvalid)

## 2026-06-23 12:45 — P5: PM reset pure-logic tests (PM half complete)
- **Status:** DONE
- **What I did:** Read the two existing reset test files first (per the hint).
  Found they are SOURCE-TEXT assertions (grep the .ts for patterns) — they don't
  EXECUTE the logic, because `reset.ts`/the route import the `@/` alias which
  `node --test` can't resolve. To get genuine fail-before/pass-after BEHAVIORAL
  coverage I extracted the pure classification decision out of `checkReset` into a
  new alias-free `lib/reset/reset-logic.ts` (`classifyReset(reset, now)`, with a
  structural `ResetRow` type so it imports nothing from `@/db`); `checkReset` now
  calls it. New `reset-logic.test.ts` imports and RUNS it: token validity, expiry
  BOUNDARY (just-valid at now+1; expired AT now and now-1 — proving `<=` not `<`),
  single-use (a row with `usedAt` set => "used", and used wins over expired),
  notFound, and default-now-from-Date.now. Updated the now-stale source-text check
  in `reset-route.test.ts` (the old inline `if (!reset) return...` strings moved)
  to assert `checkReset` delegates to `classifyReset`. Did NOT add a deep-equal
  "hit body === miss body" test: that invariant is already locked structurally by
  `forgot-route.test.ts` (exactly one `{ok:true}` returned AFTER the `if(user)`
  block), and a runtime deep-equal of the literal `{ok:true}` vs `{ok:true}` would
  be tautological — noted rather than faked.
- **Verified:** ports 3601/3602 clear (lsof exit 1); `npx tsc --noEmit` exit 0;
  `npm test` 170/170 pass (was 166 => +4 new behavioral + 1 rewired source-text);
  fail-before PROVEN: sed `<=`->`<` in reset-logic.ts => the boundary test fails,
  restored; `npx opennextjs-cloudflare build` green (worker saved). PM only — did
  NOT touch CMS/ or run bundle:cms.
- **Files:** ProjectManager/src/lib/reset/reset-logic.ts (new),
  ProjectManager/src/lib/reset/reset-logic.test.ts (new),
  ProjectManager/src/lib/reset/reset.ts (delegate checkReset to classifyReset),
  ProjectManager/src/lib/reset/reset-route.test.ts (rewire classify source-text check)

## 2026-06-23 — C1: CMS `password_reset` table + migration (mirror PM P1)
- **Status:** DONE
- **What I did:** Added `passwordReset` table to `CMS/src/db/schema.ts` mirroring
  PM's `passwordResets` + the CMS `invite` token pattern: `id` PK, `userId` FK→
  `user.id` ON DELETE cascade, `token` (unique index `password_reset_token_unique`),
  `expiresAt` timestamp_ms, `usedAt` timestamp_ms nullable (single-use gate),
  `createdAt`. Added `PasswordReset`/`NewPasswordReset` types. Table is SINGULAR
  `password_reset` (CMS uses `user`/`session`/`invite`, NOT PM's plural names).
  Generated migration `0012_supreme_shriek.sql` via `npm run db:generate`
  (drizzle-kit auto-updated migrations/meta journal+snapshot chain). No route.
- **Decision:** CMS `session`/`invite` deliberately drop FKs (schema comments:
  "no FK so a user delete doesn't cascade silently"), but the C1 task spec asked
  for `userId FK→users cascade`. Followed the explicit spec → real FK cascade.
- **Verified:** `npx tsc --noEmit` exit 0; `npm test` 733 pass/0 fail;
  `opennextjs-cloudflare build` complete (worker saved). Ports 3601/3602 clear
  before build. Did NOT run bundle:cms (reserved for C5). Migration SQL reviewed:
  clean CREATE TABLE + unique index, FK cascade, matches PM 0011 shape.
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0012_supreme_shriek.sql,
  CMS/migrations/meta/ (snapshot + journal).

## 2026-06-23 — C2: CMS POST /api/auth/forgot (enumeration-safe, mirror PM P2)
- **Status:** DONE
- **What I did:** Added the CMS forgot-password request endpoint, mirroring PM P2
  but using CMS shapes. New `CMS/src/lib/reset/reset.ts` (`newResetToken` 64-hex,
  `RESET_TTL_MS` 7d, `createPasswordReset(userId)` → insert into SINGULAR
  `schema.passwordReset` → returning). Refactored CMS `lib/mail/send-invite.ts`:
  extracted a shared `buildUrl(env, path)` from `buildAcceptUrl` and added
  `sendResetEmail({to,token,subject,body})` mirroring `sendInviteEmail`'s graceful
  degrade (no EMAIL binding or send throw → log + `delivered:false`), building
  `/reset/<token>` from `APP_ORIGIN`. New route
  `CMS/src/app/api/auth/forgot/route.ts`: parses JSON, normalizes email via CMS
  `normalizeEmail` (from `db/user-store`), validates format with an inline regex
  (CMS has no `validateEmail` like PM) → 400 on malformed only; looks up user via
  `findUserByEmail`; if matched, mints token + sends email inside a try/catch that
  swallows failures; ALWAYS returns 200 `{ ok: true }` for hit AND miss. Strings:
  CMS messages have NO `auth` namespace — invite uses a TOP-LEVEL `inviteEmail`
  key, so I added a top-level `resetEmail.{subject,body}` to EN/FI/ET (inserted
  right after `inviteEmail` for parity ordering), `getTranslations("resetEmail")`.
- **Verified:** ports 3601/3602 clear (lsof); `npx tsc --noEmit` exit 0; `npm test`
  737/737 pass (was 733, +4 new in `lib/reset/forgot-route.test.ts`: single
  success body after the user block, mint/send swallowed, token shape/TTL +
  SINGULAR `schema.passwordReset`, i18n parity). Fail-before PROVEN: rewrote the
  source to plural `schema.passwordResets` ⇒ the token test fails, restored.
  `npx opennextjs-cloudflare build` green, `.next/server/app/api/auth/forgot/route.js`
  exists + `/api/auth/forgot` in app-paths-manifest. Did NOT run bundle:cms (C5),
  did NOT exercise live email/runtime, did NOT apply migration.
- **Files:** CMS/src/lib/reset/reset.ts (new),
  CMS/src/app/api/auth/forgot/route.ts (new),
  CMS/src/lib/reset/forgot-route.test.ts (new),
  CMS/src/lib/mail/send-invite.ts (buildUrl extract + sendResetEmail),
  CMS/messages/{en,fi,et}.json (resetEmail)

## 2026-06-23 — C3: CMS `POST /api/auth/reset` (mirror PM P3)
- **Task:** CMS set-new-password-from-token endpoint. Validate token (exists,
  `usedAt IS NULL`, not expired) → mark used single-use → set fresh hash → kill
  the user's sessions. ONE generic error for all token failures. CMS-only.
- **Did:** Added `checkReset`/`applyReset` to `CMS/src/lib/reset/reset.ts` and a
  pure alias-free `reset-logic.ts` (`classifyReset`, structural `ResetRow`) so the
  decision is node-testable (C5 will execute it). `applyReset` re-validates via
  `checkReset`→`classifyReset`, marks `usedAt` under a guarded
  `update(schema.passwordReset)…where isNull(usedAt)…returning` (0 rows ⇒ used ⇒
  reject) BEFORE hashing (TOCTOU-safe order), sets `hashPassword` on
  `schema.user`, then kills sessions with a PLAIN INDEXED
  `delete(schema.session).where(eq(userId))` — CMS sessions are D1 with
  `session_user_idx` (no KV prefix-scan like PM; the easy case). Route
  `CMS/src/app/api/auth/reset/route.ts` returns web `Response.json` (not
  NextResponse), checks min-length via `isPasswordLongEnough` (MIN_PASSWORD_LENGTH
  =10, same as invite-accept), and collapses notFound/expired/used into ONE
  generic `resetTokenInvalid` (never reads `result.reason`).
- **No new strings:** CMS auth routes return BARE error keys (like invite-accept);
  the C4 page maps `resetTokenInvalid`/`passwordTooShort`/etc. to messages. So C3
  added ZERO message strings — i18n parity untouched.
- **Gates:** `tsc --noEmit` clean. `npm test` 743/743 (was 737, +6 in
  `lib/reset/reset-route.test.ts`: classifier delegation, isNull-guarded single-use,
  hash+indexed-session-delete + mark-before-hash order, ONE generic error / no
  reason leak, isPasswordLongEnough min-length, web Response.json not NextResponse).
  `npx opennextjs-cloudflare build` green; `.next/server/app/api/auth/reset/route.js`
  exists. Dev confirmed down (`lsof -ti:3601,3602` empty) before build. Did NOT run
  bundle:cms (C5), did NOT exercise live runtime/email, did NOT apply migration.
- **Files:** CMS/src/lib/reset/reset.ts (checkReset/applyReset),
  CMS/src/lib/reset/reset-logic.ts (new), CMS/src/app/api/auth/reset/route.ts (new),
  CMS/src/lib/reset/reset-route.test.ts (new).

## 2026-06-23 — C4: CMS forgot/reset pages + login-form "Forgot password?" link
- **Status:** DONE
- **What I did:** Mirrored PM P4 in CMS (CMS/src only). New public pages:
  `app/forgot/page.tsx` → `components/forgot-password-form.tsx` (email → POST
  /api/auth/forgot; on ANY 2xx shows the enumeration-safe success notice +
  back-to-sign-in, NO body branching) and `app/reset/[token]/page.tsx` →
  `components/reset-password-form.tsx`. The reset PAGE gates on `checkReset` status
  server-side exactly like invite-accept's page: notFound/expired/used all render
  ONE generic notice (+ "request a new link"); only `valid` renders the form. The
  FORM POSTs to /api/auth/reset (minLength 10), maps the C3 route's BARE error keys
  (resetTokenInvalid/passwordTooShort/passwordRequired/passwordMismatch) to messages
  — all token failures → one `errorTokenInvalid` (no leak) — and on success hard-navs
  to /admin (where the now-session-killed user sees the login page; CMS has no
  standalone /login route, login is rendered by admin/layout when unauthenticated).
  Added a "Forgot password?" link (`href="/forgot"`) under the sign-in button in
  `login-form.tsx`. REST+fetch, NO server actions (Workers/OpenNext).
- **i18n:** new TOP-LEVEL keys `forgotPassword.*` + `resetPassword.*` +
  `login.forgotPassword` in EN/FI/ET (CMS convention — NOT PM's `auth.forgot/reset.*`
  nesting). Parity verified: fi/et 0 missing / 0 extra vs en.
- **Verified:** ports clear (lsof 3601,3602) → `npx tsc --noEmit` exit 0; `npm test`
  743 pass/0 fail; `opennextjs-cloudflare build` complete (worker saved; /forgot and
  /reset/[token] both in the route table). UI-only slice — pages are thin wiring over
  the already-tested forgot/reset routes, so no new behavioral test (C5 adds the
  reset-logic.test.ts). NO bundle:cms (that's C5).
- **Files:** CMS/src/app/forgot/page.tsx, CMS/src/app/reset/[token]/page.tsx,
  CMS/src/components/forgot-password-form.tsx, CMS/src/components/reset-password-form.tsx,
  CMS/src/components/login-form.tsx, CMS/messages/{en,fi,et}.json.

## 2026-06-23 15:51 — C5: CMS reset pure-logic test + regen PM cms-bundle (FINAL slice)
- **Status:** DONE
- **What I did:** Added `CMS/src/lib/reset/reset-logic.test.ts` (5 tests) executing
  the real `classifyReset` — mirrors PM's reset-logic.test.ts; covers validity,
  expiry boundary (`<=` so AT-expiry is rejected), single-use (used>expired),
  notFound, default-now. Then ran `npm run bundle:cms` (from ProjectManager) as the
  LAST step, regenerating the committed `ProjectManager/src/lib/deploy/cms-bundle.generated.js`
  (7853 KB) — this ships all CMS C1–C5 reset changes into the PM-deployable bundle.
- **Verified:** Fail-before/pass-after on the boundary test (flipped `<=`→`<` in
  reset-logic.ts ⇒ the boundary test failed; reverted ⇒ all 5 pass, git diff clean).
  CMS gates: tsc clean, `npm test` 748 pass / 0 fail (was 743 + 5 new), opennext build
  green. After bundle regen, confirmed PM tsc clean + PM opennext build green.
  `lsof -ti:3601,3602` empty before every build. No other worker active for bundle:cms.
- **Files:** CMS/src/lib/reset/reset-logic.test.ts (new),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regenerated).
- **auth-reset full scope COMPLETE:** PM P1–P5 + CMS C1–C5 all DONE; CMS changes shipped into PM bundle.
