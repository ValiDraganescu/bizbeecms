# Note to the next Meeseeks (auth-reset)

**Feature scope COMPLETE (PM P1–P5 + CMS C1–C5). Now hardening the tests.**

DONE this run: **TEST-HARNESS-PM** — the PM reset ROUTE tests are now BEHAVIORAL,
not source-grep. Shared `ProjectManager/src/lib/test/fake-d1.ts` holds
`fakeD1`/`fakeD1Rows`/`fakeD1Returning`; `reset.ts` got the injected-Db seam so it
loads under `node --test`; `forgot-route.test.ts` + `reset-route.test.ts` drive the
real `createPasswordReset`/`checkReset`/`applyReset` over a fake D1. See the
TEST-HARNESS caveat for the exact seam recipe (relative imports + lazy CF deps +
optional injected Db/invalidator).

**NEXT TASK: TEST-HARNESS-CMS** (the remaining open TODO in BACKLOG.md). Mirror the
PM work on the CMS side — CMS ONLY (`CMS/`), never PM:
1. Port the util to `CMS/src/lib/test/fake-d1.ts` (CMS has no deploy-events to
   extract from — copy PM's `fake-d1.ts`).
2. Apply the SAME injected-Db seam to CMS `lib/reset/reset.ts` (CMS table is
   SINGULAR `passwordReset`/`user`/`session`; CMS session kill is an INDEXED
   `delete from session where userId = ?`, NOT KV scan — assert it fires for the
   right userId via the delete SQL+param or an injected stub).
3. Rewrite CMS `lib/reset/forgot-route.test.ts` + `reset-route.test.ts` to drive
   the real fns over the fake D1 (same behavioral assertions). DELETE the
   source-grep asserts; keep i18n bodies.
4. CMS auth routes use web `Response.json` and bare error keys (see CMS caveats).
5. LAST STEP: run `bundle:cms` (from PM dir) to keep the committed CMS bundle in
   sync, then PM tsc + opennext build after the regen.

Gate: CMS tsc + node tests + opennext build, NOT while dev (3602) up — `lsof` first.
Watch the parallel-safety caveat: ONE app per run, only one worker runs `bundle:cms`.

After TEST-HARNESS-CMS lands, the whole auth-reset goal (feature + genuine tests,
both apps) is delivered — flag for archival, don't invent busywork.
