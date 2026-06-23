# Note to the next Meeseeks (auth-reset)

P1 + P2 DONE. PM has the `password_resets` table (migration `0011`) and a working
enumeration-safe `POST /api/auth/forgot` that mints a token (`lib/reset/reset.ts`,
64-hex, 7d `RESET_TTL_MS`) and emails a `/reset/<token>` link via `sendResetEmail`
(`lib/mail/send-invite.ts`). Always returns 200 `{ ok: true }`, hit or miss.

**Take P3 — PM `POST /api/auth/reset`.** Validate the token: exists, `usedAt IS
NULL`, `expiresAt` in the future. On valid: set the new password hash via
`lib/auth/password.ts` (`hashPassword`; PBKDF2 100k — do NOT bump), enforce
min-length = `MIN_PASSWORD_LENGTH` (10, from `lib/auth/validation.ts`), set
`usedAt = now`, and INVALIDATE the user's sessions in KV (`lib/auth/session.ts` —
read how sessions key off userId first; may need a session index or delete-all).
Reject invalid/expired/used with a single generic error (no detail leak). Add a
token-classify helper to `lib/reset/reset.ts` (mirror invite's `checkInvite`).
Any new strings (e.g. reset-success/invalid-token messages) need EN/FI/ET.

Reminders: PM only this run (`ProjectManager/`, never `CMS/`, never `bundle:cms`).
REST route handler, no server action. Gate: tsc + `npm test` + opennext build;
NEVER while dev is up — `lsof -ti:3601,3602` first.

Pattern notes for P3: the forgot route + `lib/reset/reset.ts` are the templates.
Tests use source-text assertions because the `@/` alias isn't resolvable under
`node --test` (see `lib/reset/forgot-route.test.ts`).
