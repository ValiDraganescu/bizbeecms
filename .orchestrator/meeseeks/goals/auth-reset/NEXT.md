# Note to the next Meeseeks (auth-reset)

**PM half P1–P5 COMPLETE. CMS half: C1 + C2 + C3 DONE.**
- C1: `passwordReset` table (SINGULAR `password_reset`) + migration 0012.
- C2: CMS `POST /api/auth/forgot` (enumeration-safe).
- C3: CMS `POST /api/auth/reset` (mirror PM P3). `checkReset`/`applyReset` in
  `CMS/src/lib/reset/reset.ts` + pure `reset-logic.ts` (`classifyReset`). Single-use
  guarded `update…where isNull(usedAt)…returning` BEFORE hashing; fresh `hashPassword`
  on `schema.user`; sessions killed via PLAIN INDEXED `delete from session where
  userId = ?` (D1, `session_user_idx`). Route returns web `Response.json`, ONE generic
  `resetTokenInvalid` for all token failures (never reads `reason`). Min-length via
  `isPasswordLongEnough` (10). NO new strings (route returns bare keys — page maps them
  in C4). Test `lib/reset/reset-route.test.ts`. Gates green (tsc / 743 / opennext). NO bundle:cms.

**Next: take C4 — CMS forgot/reset PAGES + login-form "forgot password?" link.** Mirror
PM P4 but in CMS's app structure + CMS conventions. Under `CMS/src/` ONLY.
- Pages: a `/forgot` page (email form → POST `/api/auth/forgot`; on ANY 2xx show the
  enumeration-safe success + back-to-sign-in, NO body branching) and a `/reset/[token]`
  page (password+confirm → POST `/api/auth/reset`; min-length 10 via MIN_PASSWORD_LENGTH;
  map the bare error keys `resetTokenInvalid`/`passwordTooShort`/`passwordRequired`/
  `passwordMismatch` to messages; success → CMS login or /admin). REST+fetch, NO server
  actions. Find where the CMS login page/route live (login form is
  `src/components/login-form.tsx` using `useTranslations("login")`).
- Add a "Forgot password?" link to `login-form.tsx` (new `login.forgotPassword` string?
  follow CMS top-level convention — login strings are `login.*`).
- NEW STRINGS this slice (C4 is where they land): page titles/subtitles/submit/success
  + the error-key→message mappings. Follow CMS's TOP-LEVEL message convention (NOT PM's
  `auth.forgot.*`/`auth.reset.*` nesting) — see CAVEATS "C2 CMS MESSAGE STRUCTURE". Add
  ALL THREE locales EN/FI/ET in the same slice (i18n parity is test-locked).

**Then C5 (LAST CMS slice):**
- Extract genuine behavioral test: `CMS/src/lib/reset/reset-logic.test.ts` that EXECUTES
  `classifyReset` (validity / expiry BOUNDARY @ now+1 vs now/now-1 with `<=` / single-use
  / used-wins-over-expired / notFound / default-now). Verify fail-before (flip `<=`→`<`).
- **C5 runs `bundle:cms`** (regens PM `cms-bundle.generated.js`) as its LAST step. ONLY
  C5 runs it; only one worker at a time.

Always before any opennext build: `lsof -ti:3601,3602` (build corrupts .next if dev up).
ONE app run — C-slices touch ONLY `CMS/`, never `ProjectManager/`.
