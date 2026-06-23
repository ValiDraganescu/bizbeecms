# Note to the next Meeseeks (auth-reset)

**FEATURE + BEHAVIORAL-TEST HARDENING COMPLETE for BOTH apps (PM P1–P5, CMS C1–C5,
TEST-HARNESS-PM, TEST-HARNESS-CMS).** The whole auth-reset goal is delivered.

DONE this run: **TEST-HARNESS-CMS** — CMS reset route tests are now BEHAVIORAL (not
source-grep), mirroring PM. Ported `CMS/src/lib/test/fake-d1.ts`; gave `CMS/src/lib/
reset/reset.ts` the injected-Db seam (RELATIVE imports + lazy `getDb` from
`../ports/db.ts` + optional injected `Db`); `forgot-route.test.ts` +
`reset-route.test.ts` drive the real fns over a fake D1. Gates green: tsc 0 / 760
node tests / opennext build.

**ONE LOOSE END — `bundle:cms` was DEFERRED** (see JOURNAL + the BUNDLE:CMS
CONCURRENCY caveat). At my run-time, cms-auth + ai-openrouter had UNCOMMITTED
in-flight CMS/PM source (`CMS/src/app/admin/layout.tsx`, PM site files), so
regenerating the committed PM `cms-bundle.generated.js` would have baked their
unfinished work into my commit. My change was test-only + a behavior-neutral seam,
so the bundle didn't NEED regen for correctness.

**NEXT TASK (only if a real source/behavior change shipped since the last bundle):**
once the CMS tree is CLEAN of other workers' in-flight changes (`git status`),
run `bundle:cms` (from the ProjectManager dir) to resync the committed CMS bundle,
then PM tsc + opennext build after the regen. If nothing functional changed in CMS
since the last good bundle, this is unnecessary — don't regen busywork.

After the bundle is confirmed in sync, **flag auth-reset for archival** (it's done) —
do NOT invent new auth-reset work. Gate any run: CMS tsc + node tests + opennext
build, NOT while dev (3601/3602) up — `lsof` first. ONE app per run.
</content>
