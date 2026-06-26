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

## 2026-06-23 16:56 — TEST-HARNESS-CMS: CMS reset route tests now behavioral (mirror PM)
- **Status:** DONE
- **What I did:** Mirrored PM's TEST-HARNESS work on the CMS side. (1) Ported the
  shared fake-D1 util to `CMS/src/lib/test/fake-d1.ts` (copy of PM's:
  `fakeD1`/`fakeD1Rows`/`fakeD1Returning` — dep-free, node --test friendly; CMS had
  no deploy-events precedent to extract from). (2) Refactored `CMS/src/lib/reset/
  reset.ts` to the injected-Db seam: `@/db` → relative `../../db/schema.ts`, `Db`
  type from relative `../ports/db.ts` (the CMS `@/db` re-export chains through the
  `@/`-aliased ports module — must import the RELATIVE ports path), `getDb` pulled
  LAZILY via `(await import("../ports/db.ts")).getDb()` so the module LOADS under
  node --test without dragging `@opennextjs/cloudflare`; `createPasswordReset`/
  `checkReset`/`applyReset` take an optional injected `Db` (defaults real). CMS kills
  sessions with a plain INDEXED `delete from session where userId = ?` (D1, not KV)
  so NO session-invalidator stub is needed — it's asserted off the emitted SQL+param.
  (3) Rewrote `forgot-route.test.ts` + `reset-route.test.ts` to DRIVE the real CMS
  fns over the fake D1: createPasswordReset writes a 64-hex token + 7d-TTL row into
  the SINGULAR `password_reset` table; applyReset marks usedAt under the isNull
  guard, writes a fresh `pbkdf2$…` hash to `user`, fires the indexed
  `delete from "session" where "user_id" = ?` for the RIGHT userId (`["user-1"]`);
  single-use (guarded update → 0 rows ⇒ rejected, no rehash, no session kill);
  expired/used/notFound collapse to non-ok BEFORE any write. DELETED the source-grep
  asserts; KEPT the structural enumeration-safe route lock (single
  `Response.json({ok:true})` after the user block) + i18n bodies (top-level
  `resetEmail.*`, executed on real data).
- **Verified:** Fail-before confirmed (drop the `marked.length===0` guard ⇒ single-use
  test fails; reverted). Gates GREEN against the current tree: `npx tsc --noEmit`
  exit 0 / `npm test` 760 pass 0 fail (was 748 — the 11 old source-grep asserts
  replaced by real behavioral tests) / `opennextjs-cloudflare build` complete.
  Dev ports 3601/3602 confirmed down before the build.
- **DEFERRED:** `bundle:cms` — per the concurrency warning, other workers (cms-auth,
  ai-openrouter) have UNCOMMITTED in-flight changes in the CMS tree
  (`CMS/src/app/admin/layout.tsx`) + PM. Regenerating the PM `cms-bundle.generated.js`
  now would bake their unfinished work into the committed bundle. My change is
  TEST-ONLY + a backward-compatible `reset.ts` seam (prod call sites unchanged, no
  runtime behavior change) so the deployed bundle needs no regen for correctness.
  A later worker regenerates it cleanly. **auth-reset behavioral-test hardening
  COMPLETE (PM + CMS); bundle regen is the only loose end.**
- **Files:** CMS/src/lib/test/fake-d1.ts (new), CMS/src/lib/reset/reset.ts,
  CMS/src/lib/reset/forgot-route.test.ts, CMS/src/lib/reset/reset-route.test.ts

## 2026-06-26 09:38 — BUG [P1] part (2): CMS invite subject carries the custom domain
- **Status:** DONE (CMS half of part 2)
- **What I did:** Fixed the generic-subject half of the P1 bug for the CMS app
  (one-app-per-run; the repro subject "You're invited to BizbeeCMS" is the CMS
  `inviteEmail.subject`). New pure, alias-free `CMS/src/lib/mail/invite-subject.ts`:
  `customDomain(appOrigin)` parses APP_ORIGIN's host, returns null for empty/
  malformed/`*.workers.dev`/`localhost`, else strips a leading `www.` and returns
  the host; `inviteSubject(appOrigin, generic, withDomain)` returns the
  domain-prefixed subject when a custom domain is attached, else the generic. Wired
  `CMS/src/app/api/invite/route.ts` to read `APP_ORIGIN` from the CF env and build
  the subject via `inviteSubject(...)`, rendering `inviteEmail.subjectWithDomain`
  for the custom-domain case. Added top-level `inviteEmail.subjectWithDomain`
  (`"{domain}: You are invited to use BizBeeCMS"`) EN/FI/ET. Derived from APP_ORIGIN
  so it stays consistent with the link; once the deployer APP_ORIGIN fix (part 1,
  tracked in sso/cms-mcp) lands, the prefix auto-activates — pre-fix APP_ORIGIN is
  workers.dev so the generic subject is used (no behavior change yet).
- **Verified:** ports 3601/3602 down; CMS `tsc --noEmit` clean; `npm test` 984
  pass/0 fail (+7 new in `invite-subject.test.ts`); fail-before PROVEN (replaced the
  `.workers.dev` guard with `false` ⇒ both workers.dev tests fail; reverted);
  `opennextjs-cloudflare build` green. Then ran `npm run bundle:cms` from PM (tree
  was clean of other workers — only my 4 tracked + 2 untracked files) regenerating
  `cms-bundle.generated.js` (8311 KB); PM `tsc` clean + PM opennext build green
  after regen. Did NOT exercise live email (runtime/HITL only) or fix part (1)
  link host (shared deployer APP_ORIGIN fix — by design out of scope here).
- **Files:** CMS/src/lib/mail/invite-subject.ts (new),
  CMS/src/lib/mail/invite-subject.test.ts (new),
  CMS/src/app/api/invite/route.ts (env APP_ORIGIN + inviteSubject),
  CMS/messages/{en,fi,et}.json (inviteEmail.subjectWithDomain),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regenerated)

## 2026-06-26 — BUG [P1] part (2): PM invite + reset subject carries custom domain
- **Status:** DONE (PM half of part 2 — mirrors the CMS run)
- **What I did:** Mirrored the CMS invite-subject fix into the PM app (one-app-per-run).
  New pure alias-free `ProjectManager/src/lib/mail/invite-subject.ts` (exact copy of
  CMS's `customDomain`/`inviteSubject`: workers.dev/localhost/empty/malformed → no
  custom domain → generic subject; else strip leading `www.`). Wired BOTH PM mail
  routes: `app/api/invite/route.ts` (invite) and `app/api/auth/forgot/route.ts`
  (reset) read `APP_ORIGIN` from `getCloudflareContext().env` (cast via `unknown` —
  APP_ORIGIN isn't on the typed `CloudflareEnv`) and build the subject through
  `inviteSubject(appOrigin, t("subject"), (d) => t("subjectWithDomain",{domain:d}))`.
  Added `invites.email.subjectWithDomain` (`"{domain}: You are invited to use
  BizBeeCMS"`, mirroring CMS's exact EN/FI/ET wording) and `auth.forgot.email.
  subjectWithDomain` (reset-specific `"{domain}: Reset your password"` + FI/ET) in all
  three locales. Did the reset subject too per NEXT.md's recommended default.
  Derived from APP_ORIGIN ⇒ pre the deployer APP_ORIGIN fix (part 1) APP_ORIGIN is
  workers.dev ⇒ generic subject ⇒ zero behavior change; prefix auto-activates once
  part 1 lands.
- **Verified:** ports clear; `tsc` exit 0; `npm test` 210 pass/0 fail (+7 new
  `invite-subject.test.ts`); fail-before PROVEN (replace `.workers.dev` guard with
  `false` ⇒ both workers.dev tests fail; reverted ⇒ 7/7); opennext build complete.
  PM-only — did NOT touch cms-bundle (PM never does) or fix part (1) link host.
  Did NOT exercise live email (runtime/HITL only).
- **Files:** ProjectManager/src/lib/mail/invite-subject.ts (new),
  ProjectManager/src/lib/mail/invite-subject.test.ts (new),
  ProjectManager/src/app/api/invite/route.ts (env APP_ORIGIN + inviteSubject),
  ProjectManager/src/app/api/auth/forgot/route.ts (env APP_ORIGIN + inviteSubject for reset),
  ProjectManager/messages/{en,fi,et}.json (invites.email.subjectWithDomain + auth.forgot.email.subjectWithDomain)

## 2026-06-26 09:48 — BUG [P1] pt2: CMS RESET email subject carries custom domain (parity)
- **Status:** DONE (code) — bug stays OPEN pending live HITL verify (gated on deployer APP_ORIGIN fix)
- **What I did:** Mirrored PM's reset-subject treatment into CMS so the password-reset
  email subject is domain-prefixed when a custom domain is attached (was generic only).
  Wired `inviteSubject(appOrigin, t("subject"), d => t("subjectWithDomain",{domain:d}))`
  into `CMS/src/app/api/auth/forgot/route.ts` (reads `APP_ORIGIN` off
  `getCloudflareContext().env`, same `as unknown as {APP_ORIGIN?}` cast as the CMS invite
  route). Added `resetEmail.subjectWithDomain` EN/FI/ET, wording mirrored from PM's
  `auth.forgot.email.subjectWithDomain` ("{domain}: Reset your password" / "Nollaa
  salasanasi" / "Lähtesta oma parool"). Now ALL FOUR email subjects (PM+CMS invite,
  PM+CMS reset) carry the domain prefix — full parity.
- **Verified:** CMS tsc 0; node --test 985 pass (incl. i18n parity); opennextjs-cloudflare
  build green. New key present in all 3 locales. Pre the deployer APP_ORIGIN fix,
  APP_ORIGIN=workers.dev ⇒ `customDomain()` returns null ⇒ generic subject ⇒ zero behavior
  change; prefix auto-activates once a custom domain resolves to APP_ORIGIN.
- **bundle:cms DEFERRED:** working tree had other workers' in-flight PM changes
  (migrations 0015 + schema.ts + deploy-events.ts) — per BUNDLE:CMS CONCURRENCY caveat,
  did NOT run bundle:cms (would bake their unfinished work into the committed bundle).
  My change is behavior-additive + inert pre-deployer-fix; a later clean-tree CMS run
  regenerates the bundle cleanly.
- **Files:** CMS/src/app/api/auth/forgot/route.ts,
  CMS/messages/{en,fi,et}.json (resetEmail.subjectWithDomain)

## 2026-06-26 09:53 — BUNDLE:CMS REGEN — ship committed CMS reset-subject into PM bundle
- **Status:** DONE
- **What I did:** Cleared the long-standing DEFERRED loose end — regenerated the
  PM-deployable `ProjectManager/src/lib/deploy/cms-bundle.generated.js` so it carries
  the committed CMS reset-subject change (`resetEmail.subjectWithDomain` + the
  `inviteSubject` wiring in `CMS/src/app/api/auth/forgot/route.ts`, committed in
  299146a). CMS tree was CLEAN + committed; the only dirty files were another goal's
  PM/deployer deploy-log-stream work (`deploy-timeline.tsx`, `deploy-callback`,
  `deploy-events.ts`, `schema.ts`, migration 0015, `deployer/src/index.ts`) — none of
  which are part of the CMS bundle — so per the BUNDLE:CMS CONCURRENCY caveat the
  regen was safe (bakes ONLY the clean CMS tree). Ran `npm run bundle:cms` from PM.
- **Verified:** ports 3601/3602 clear before regen; `bundle:cms` ran the CMS opennext
  build GREEN (worker saved) and wrote the bundle (8415 KB, builtAt 06:52:58);
  `git status` confirms the regen touched ONLY `cms-bundle.generated.js`; the bundle
  now contains the reset-subject string (`grep` hit). PM `tsc --noEmit` has 2 errors —
  BOTH in another goal's in-flight dirty files (`deploy-events.ts` + the
  `deploy-status-badge.tsx` that consumes its changed `WireEvent` type), NOT mine and
  NOT from the generated `.js` bundle (which tsc doesn't type-check). PM opennext build
  NOT run — it would fail on those same other-worker type errors and is moot for a
  generated-JS change; the relevant build (the CMS opennext build inside bundle:cms)
  is green. Did NOT touch any other worker's files.
- **Files:** ProjectManager/src/lib/deploy/cms-bundle.generated.js (regenerated)
