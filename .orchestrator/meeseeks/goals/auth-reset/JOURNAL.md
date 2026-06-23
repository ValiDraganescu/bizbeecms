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

## 2026-06-23 12:30 — P3: PM POST /api/auth/reset (validate token, set hash, kill sessions)
- **Status:** DONE
- **What I did:** Added `checkReset` (classify notFound/used/expired/valid, mirror invite's `checkInvite`) and `applyReset` to `lib/reset/reset.ts`. `applyReset` re-validates, marks `usedAt` via an `update … where isNull(usedAt)` guard (single-use + concurrency-safe: 0 rows updated ⇒ rejected as `used`), then `hashPassword(newPassword)` onto `users.passwordHash`, then `invalidateUserSessions(reset.userId)`. Added `invalidateUserSessions(userId)` to `lib/auth/session.ts` — KV sessions have NO userId index, so it pages `kv.list({ prefix: "session:" })`, reads each record, deletes those whose `userId` matches (ponytail-commented O(all-sessions) ceiling; eventual-consistency is safe because the hash already changed). New route `src/app/api/auth/reset/route.ts`: validates token presence, password via `validatePassword` (register min-length 10), confirm match; every applyReset failure (notFound/expired/used) collapses to ONE generic `auth.errors.resetTokenInvalid` (no detail leak; route never reads `result.reason`). Added `resetTokenInvalid` to EN/FI/ET.
- **Verified:** ports 3601/3602 clear; `npx tsc --noEmit` exit 0; `npm test` 166/166 pass (8 new in `lib/reset/reset-route.test.ts`: classify, `<=` expiry boundary, isNull single-use guard, hash+session-invalidate ordering, generic-error/no-reason-leak, min-length, i18n parity); `npx opennextjs-cloudflare build` green, `.next/server/app/api/auth/reset/route.js` exists + `/api/auth/reset` in app-paths-manifest. Did NOT exercise live KV/runtime (build-only) or apply the migration.
- **Files:** ProjectManager/src/app/api/auth/reset/route.ts (new), ProjectManager/src/lib/reset/reset.ts (checkReset/applyReset), ProjectManager/src/lib/auth/session.ts (invalidateUserSessions), ProjectManager/src/lib/reset/reset-route.test.ts (new), ProjectManager/messages/{en,fi,et}.json (auth.errors.resetTokenInvalid)
