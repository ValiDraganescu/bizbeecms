# Goal: auth-reset
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Give **both** apps a self-serve **"forgot password"** flow so any user with a
password account can recover access without an operator. PM and CMS each get the
same token→email→set-new-password mechanism, mirroring the existing **invite
flow** (token + Cloudflare Email + accept page) that already ships in both apps.

USER DIRECTIVE (2026-06-23): "We need a reset password functionality for both the
PM users and for the CMS users." Settled with the user:
- **Self-serve "Forgot password"** — a public link on the login page → enter email
  → emailed a reset-token link → set a new password. Standard.
- **Email-enumeration-safe** — the request endpoint ALWAYS responds with the same
  "if an account exists, an email was sent" message, whether or not the email
  matches a user. Never reveal account existence.
- **Reset always sets/changes the password hash** — no special-casing for
  Google-SSO accounts. A reset simply establishes a password credential; an
  SSO-only user can afterward use either Google or their new password. (No "you
  signed up with Google, go use Google" branch.)

## What "good" looks like
- Both PM and CMS login pages have a **"Forgot password?"** link → a public
  `/forgot` page (email field).
- Submitting `/forgot` ALWAYS returns the same enumeration-safe success message.
  If the email matches a user, a reset email is sent via the live **Cloudflare
  Email Sending** binding (`env.EMAIL.send()`, `noreply@bizbeecms.com`) with a
  tokenized link to `/reset/<token>`.
- The reset link opens a **set-new-password** page; submitting a valid, unexpired,
  unused token sets a fresh PBKDF2 hash via `lib/auth/password.ts`, marks the
  token **used (single-use)**, and **invalidates the user's existing sessions** so
  a leaked session can't outlive the reset.
- Tokens are **single-use** and **time-boxed** (mirror the invite TTL — 7 days, or
  tighter if a slice argues for it; record the choice in CAVEATS).
- All new chrome is **EN/FI/ET** (both apps are tri-lingual; parity is test-locked).
- Each slice gates: app `tsc` + node tests + `opennextjs-cloudflare build` green.
  PM work regenerates nothing CMS-side; CMS work regens the PM `cms-bundle` (the
  deployable CMS bundle PM ships) as its LAST step.

## Build order — PM first, then mirror in CMS (one app per worker)
PM is the blueprint; once its 5 slices land and are green, mirror them in CMS.
A single Meeseeks works **one app only** per run (see CAVEATS parallel-safety).

PM slices:
1. `password_resets` table (`userId`, `token`, `expiresAt`, `usedAt` nullable) +
   Drizzle migration. Single-use = `usedAt IS NULL` gate; expiry = `expiresAt`.
2. `POST /api/auth/forgot` — look up user by email; if found, mint a token row +
   send the reset email via `env.EMAIL`. ALWAYS 200 with the enumeration-safe
   message regardless of match. (Mirror `lib/mail/send-invite.ts` for the send +
   graceful `delivered:false` degrade.)
3. `POST /api/auth/reset` — validate token (exists, `usedAt IS NULL`, not expired),
   set new password via `lib/auth/password.ts`, set `usedAt`, invalidate the
   user's sessions (KV). Reject invalid/expired/used with a generic error.
4. `(auth)/forgot` page (email form) + `(auth)/reset/[token]` page (new-password
   form, min-length rule matching register) + "Forgot password?" link on login.
   EN/FI/ET.
5. Pure-logic tests (fail-before/pass-after): token validity, expiry boundary,
   single-use (second use rejected), enumeration-safe response shape (same body
   for hit vs miss). Keep them dependency-free like the existing `*.test.ts`.

CMS slices: mirror PM slices 1–5 in `CMS/src/` (CMS has its OWN `users` +
`lib/auth/password.ts` + session store from cms-auth). Drop nothing — CMS already
has password auth and the EMAIL binding. Final CMS slice regenerates the PM
`cms-bundle`.

## Reference (mirror the invite flow — it's the blueprint)
- **PM:** `ProjectManager/src/db/schema.ts` (`invites` token pattern),
  `lib/auth/password.ts` (PBKDF2 100k — `hashPassword`/`verifyPassword`),
  `lib/auth/session.ts` (`bizbee_session` + KV — for session invalidation),
  `lib/mail/send-invite.ts` (`env.EMAIL.send()`, enumeration-safe degrade,
  `APP_ORIGIN` accept-URL builder), `lib/invite/*` (token mint + TTL + accept),
  `app/api/auth/{login,register}/route.ts`, `app/(auth)/login`.
- **CMS:** same shapes under `CMS/src/` — `db/schema.ts`, `lib/auth/password.ts`,
  `db/session-store.ts` / `lib/auth/session-core.ts`, `lib/mail/send-invite.ts`,
  `app/api/auth/login`, `components/login-form.tsx`.
- **Live email is provisioned** (2026-06-23): Cloudflare Email Sending enabled for
  `bizbeecms.com`, `noreply@bizbeecms.com` verified, `send_email` binding wired in
  both `wrangler.jsonc`. Reset emails ride the same path as invites.
