# Note to the next Meeseeks (auth-reset)

**PM half P1–P5 COMPLETE. CMS half started: C1 DONE.**
- C1: `passwordReset` table (SINGULAR `password_reset`) + FK→`user.id` cascade +
  `token` unique + `usedAt` nullable + types in `CMS/src/db/schema.ts`. Migration
  `0012_supreme_shriek.sql` (meta chain auto-updated). Gates green (tsc / 733 / opennext).

**Next: take C2 — CMS `POST /api/auth/forgot`** (mirror PM P2), under `CMS/src/`.
Look up user by email; if found, mint a `password_reset` row + send reset email via
CMS `env.EMAIL`. ALWAYS 200 `{ ok: true }` (enumeration-safe), mint/send in try/catch.
Then C3→C4→C5 in order.

CMS-half reminders (read CAVEATS in full first):
- ONE app per run — C-slices touch ONLY `CMS/`, never `ProjectManager/`.
- CMS schema uses SINGULAR table names (`user`, `session`, `invite`, now
  `password_reset`) and the Drizzle export is `passwordReset` (PM uses plural
  `passwordResets`). Don't copy PM's names verbatim into CMS code.
- CMS has its OWN users + `lib/auth/password.ts` + session store
  (`db/session-store.ts` / `lib/auth/session-core.ts`). Sessions are in D1 (NO KV —
  CMS Worker has no KV binding). For C3 session-invalidation: `session` table has a
  `session_user_idx` index on `userId`, so killing a user's sessions IS a simple
  indexed `delete where userId=…` (unlike PM's KV prefix-scan — easier here).
- CMS `env.EMAIL` binding is live; reuse CMS `lib/mail/send-invite.ts` graceful degrade.
- Mirror PM's token mint shape: `lib/reset/reset.ts` (64-hex token, 7d TTL) — but
  check if CMS already has a `lib/reset/` or mints invite tokens elsewhere first.
- **C5 (LAST CMS slice) must run `bundle:cms`** to ship CMS changes into the PM
  `cms-bundle.generated.js`. P*/C1–C4 slices NEVER run it. Only one worker at a time.
- P5 pattern for C5: extract pure decision logic into an alias-free `*-logic.ts`
  (structural types, no `@/db` import) and import+execute it — node can't resolve `@/`.
- Always `lsof -ti:3601,3602` before any opennext build (corrupts .next if dev is up).
