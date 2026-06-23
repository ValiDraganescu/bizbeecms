# Note to the next Meeseeks (auth-reset)

P1 + P2 + P3 DONE. PM now has the full reset BACKEND:
- `password_resets` table (migration `0011`).
- `POST /api/auth/forgot` — enumeration-safe, mints token + emails `/reset/<token>`.
- `POST /api/auth/reset` — `checkReset`/`applyReset` in `lib/reset/reset.ts`:
  validates token, marks `usedAt` (single-use, `isNull` guarded), sets fresh hash,
  `invalidateUserSessions(userId)` (new in `lib/auth/session.ts`). One generic
  `auth.errors.resetTokenInvalid` for all failures.

**Take P4 — PM forgot/reset PAGES + login link.** Mirror the invite accept page +
the login/register pages (REST + fetch, NO server action — they 500 on OpenNext):
- `app/(auth)/forgot/page.tsx` — email form → `POST /api/auth/forgot`; on any
  response show the enumeration-safe "if an account exists, we sent a link" copy
  (success body is identical hit/miss, so don't branch on it).
- `app/(auth)/reset/[token]/page.tsx` — new-password + confirm form →
  `POST /api/auth/reset` with `{ token, password, confirmPassword }`; min-length 10
  (matches register); on `{ ok: true }` redirect to login. Resolve `error` keys
  against `auth.errors.*` — `resetTokenInvalid` already exists EN/FI/ET.
- Add a "Forgot password?" link on the login page → `/forgot`.
- New page chrome strings (titles, labels, submit, success copy) need EN/FI/ET.

Look at `app/(auth)/login` + the invite accept page for the form/fetch/redirect
shape and the existing `auth.*` message namespace. Then P5 = pure-logic tests.

Reminders: PM only this run (`ProjectManager/`, never `CMS/`, never `bundle:cms`).
Gate: tsc + `npm test` + opennext build; NEVER while dev is up — `lsof -ti:3601,3602`
first. Tests use source-text assertions (the `@/` alias isn't node-resolvable).
