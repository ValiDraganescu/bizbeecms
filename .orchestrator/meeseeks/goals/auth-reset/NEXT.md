# Note to the next Meeseeks (auth-reset)

**PM half P1–P5 COMPLETE. CMS half: C1 + C2 + C3 + C4 DONE.**
- C1: `passwordReset` table (SINGULAR) + migration 0012.
- C2: CMS `POST /api/auth/forgot` (enumeration-safe).
- C3: CMS `POST /api/auth/reset` (single-use, sessions killed via indexed D1 delete,
  ONE generic `resetTokenInvalid`, bare error keys).
- C4: CMS forgot/reset PAGES + login-form link. `app/forgot/page.tsx` +
  `components/forgot-password-form.tsx`; `app/reset/[token]/page.tsx` (server-gates on
  `checkReset` status like invite-accept — notFound/expired/used → ONE generic notice;
  valid → `components/reset-password-form.tsx`). Forms POST via fetch (NO server actions),
  success hard-navs to `/admin` (CMS has NO standalone `/login` route — admin/layout
  renders login when signed out). "Forgot password?" link added to `login-form.tsx`.
  New TOP-LEVEL strings `forgotPassword.*` + `resetPassword.*` + `login.forgotPassword`
  in EN/FI/ET (parity verified). Gates green (tsc / 743 tests / opennext build). NO bundle:cms.

**Next: take C5 — CMS reset pure-logic test + regen PM `cms-bundle` (LAST CMS slice).**
- Extract/verify a GENUINE behavioral test: `CMS/src/lib/reset/reset-logic.test.ts` that
  EXECUTES `classifyReset` (it already exists in `CMS/src/lib/reset/reset-logic.ts`, made
  in C3 — alias-free, structural types). Cover: validity / expiry BOUNDARY (just-valid @
  now+1, expired @ now and now-1 — `<=` not `<`) / single-use (`usedAt` set ⇒ used; used
  wins over expired) / notFound / default-now. Verify fail-before (flip `<=`→`<` ⇒ boundary
  test fails, then revert). Mirror PM's `reset-logic.test.ts`.
- **C5 runs `bundle:cms`** (regens the committed PM `ProjectManager/src/lib/deploy/
  cms-bundle.generated.js`, ~6.6MB) as its LAST step — this is what ships ALL the C1–C5
  CMS changes into the PM-shipped bundle. ONLY C5 runs it; only one worker at a time.
- After bundle:cms, gates: CMS tsc + node tests + opennext build. (bundle:cms touches the
  PM file, so also confirm PM tsc still passes — but C5 is CMS-driven; the bundle regen is
  the one allowed cross-app write.)

Always before any opennext build OR bundle:cms: `lsof -ti:3601,3602` (build corrupts .next
if dev up). ONE app run — C-slices touch ONLY `CMS/` (+ the cms-bundle.generated.js regen in C5).
