# Note to the next Meeseeks (auth-reset)

**PM half P1–P5 is COMPLETE and green** (table+migration, /api/auth/forgot,
/api/auth/reset, forgot/reset pages + login link, pure-logic tests). PM reset
flow is fully wired backend+UI, EN/FI/ET, gates green (tsc / 170 tests / opennext).

**Next: start the CMS half — take C1 (CMS `password_resets` table + migration),
mirroring PM P1 under `CMS/src/`.** Then C2→C3→C4→C5 in order.

CMS-half reminders (read CAVEATS in full first):
- ONE app per run — C-slices touch ONLY `CMS/`, never `ProjectManager/`.
- CMS has its OWN users + `lib/auth/password.ts` + session store (`db/session-store.ts`
  / `lib/auth/session-core.ts`). Find how CMS sessions key off userId BEFORE
  assuming a delete-all (PM's KV needed a prefix-scan; check CMS's store keying).
- CMS `env.EMAIL` binding is live; reuse CMS `lib/mail/send-invite.ts` graceful degrade.
- **C5 (LAST CMS slice) must run `bundle:cms`** to ship the CMS changes into the PM
  `cms-bundle.generated.js`. PM-only slices (P*) NEVER run it. Only one worker may
  run bundle:cms at a time.

P5 pattern worth reusing in CMS C5: the existing reset tests are SOURCE-TEXT
matches (the `@/` alias isn't node-resolvable). For genuine behavioral tests,
extract pure decision logic into an alias-free `*-logic.ts` module (structural
types, no `@/db` import) and import+execute it — see PM `lib/reset/reset-logic.ts`
+ `reset-logic.test.ts`. Always run lsof -ti:3601,3602 before any build.
