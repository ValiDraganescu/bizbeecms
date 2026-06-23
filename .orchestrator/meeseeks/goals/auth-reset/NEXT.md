# Note to the next Meeseeks (auth-reset)

**PM half P1–P5 COMPLETE. CMS half: C1 + C2 DONE.**
- C1: `passwordReset` table (SINGULAR `password_reset`) + migration 0012.
- C2: CMS `POST /api/auth/forgot` (enumeration-safe). New `CMS/src/lib/reset/reset.ts`
  (`newResetToken`/`RESET_TTL_MS` 7d/`createPasswordReset` → `schema.passwordReset`),
  `sendResetEmail` in CMS `lib/mail/send-invite.ts` (shared `buildUrl` extracted),
  route at `CMS/src/app/api/auth/forgot/route.ts`, `resetEmail` strings EN/FI/ET.
  Gates green (tsc / 737 / opennext). NO bundle:cms.

**Next: take C3 — CMS `POST /api/auth/reset`** (mirror PM P3), under `CMS/src/`.
Validate token (exists, `usedAt IS NULL`, not expired) → set new password hash via
CMS `lib/auth/password.ts` → mark `usedAt` (single-use, guarded `where isNull(usedAt)`
returning) → invalidate the user's sessions. ALL invalid/expired/used collapse to ONE
generic error key (no reason leak). Then C4 → C5.

C3 reminders (read CAVEATS in full first):
- ONE app per run — C-slices touch ONLY `CMS/`, never `ProjectManager/`.
- Add `checkReset`/`applyReset` to `CMS/src/lib/reset/reset.ts` (C2 created this file
  with only the mint helpers). Mirror PM `lib/reset/reset.ts`: `schema.passwordReset`
  SINGULAR, `schema.user` SINGULAR (not PM's plurals). Single-use = guarded
  `update … where isNull(usedAt) … returning`; 0 rows ⇒ already used ⇒ reject.
- SESSION INVALIDATION is the EASY case in CMS: sessions live in D1 `session` table
  with `session_user_idx` on `userId`, so kill them with a plain indexed
  `delete from session where userId = ?` (PM needed a KV prefix-scan; CMS doesn't).
  Look at `CMS/src/db/session-store.ts` for the existing delete shape.
- CMS routes return `Response.json(...)` (web Response), NOT PM's `NextResponse`.
- CMS password min-length: check the register/accept-invite flow before guessing
  (PM is 10). Use CMS `lib/auth/password.ts` `hashPassword` (PBKDF2 100k — don't bump).
- New error string → top-level CMS message convention (NOT `auth.errors.*`); add EN/FI/ET.
- C4: forgot/reset PAGES + login-form "forgot password?" link. CMS login form is
  `src/components/login-form.tsx` using `useTranslations("login")`. Pages mirror PM's
  `(auth)/forgot` + `(auth)/reset/[token]` but in CMS's app structure (check where
  CMS login page lives) — REST+fetch, no server actions.
- **C5 (LAST CMS slice) runs `bundle:cms`** to ship CMS into PM `cms-bundle.generated.js`.
  P*/C1–C4 NEVER run it. Only one worker at a time. Also extract pure decision logic
  into an alias-free `*-logic.ts` for genuine behavioral tests (node can't resolve `@/`).
- Always `lsof -ti:3601,3602` before any opennext build (corrupts .next if dev up).
