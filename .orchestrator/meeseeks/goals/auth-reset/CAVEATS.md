# Caveats — auth-reset
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- PARALLEL-SAFETY: a single Meeseeks works **ONE app per run** — either PM or CMS,
  never both. PM slices live entirely under `ProjectManager/`; CMS slices under
  `CMS/`. Do NOT touch the other app in the same run. Only ONE worker may run
  `bundle:cms` at a time (it regenerates the ~6.6MB committed
  `ProjectManager/src/lib/deploy/cms-bundle.generated.js`); CMS slices regen it as
  their LAST step, PM slices never touch it.
- GATES: run `tsc` + node tests + `opennextjs-cloudflare build` for the app you
  touched. NEVER run a build while `npm run dev` is up on 3601 (PM) / 3602 (CMS) —
  the OpenNext build corrupts `.next` and 500s the dev server. Check
  `lsof -ti:3601,3602` first.
- EMAIL is LIVE (provisioned 2026-06-23): Cloudflare Email Sending is enabled for
  `bizbeecms.com`, `noreply@bizbeecms.com` sends successfully, the `send_email`
  binding `EMAIL` is wired in both `wrangler.jsonc`. Reset emails reuse the invite
  send path (`lib/mail/send-invite.ts`). Mirror its graceful degrade: if the
  binding is missing or `send()` throws, catch → return the same enumeration-safe
  success to the user, log server-side. NEVER let a send failure leak account
  existence or 500 the request.
- ENUMERATION-SAFE is the core security property: `POST /api/auth/forgot` MUST
  return the SAME response (status + body) whether or not the email matches a
  user. Do the user lookup + token mint + send only when matched, but the response
  shape is identical either way. A test must assert hit-vs-miss bodies are equal.
- PASSWORD HASHING: use the existing `lib/auth/password.ts` (PBKDF2-HMAC-SHA-256,
  pinned at 100k iterations — Workers' Web Crypto caps PBKDF2 at 100k; requesting
  more throws `NotSupportedError` at RUNTIME only, not at build. Do NOT bump it.).
  Min password length must match the register flow (PM/CMS both ~10 chars — confirm
  against the register route, don't guess).
- SESSION INVALIDATION on reset: after setting the new hash, invalidate the user's
  existing sessions (KV) so a leaked/old session can't survive a password reset.
  PM sessions live in KV via `lib/auth/session.ts`; CMS via its session store
  (`db/session-store.ts` / `session-core.ts`). Find how sessions key off userId
  before assuming a delete-all is possible.
- PM is REST-only on Workers (server actions 500 on OpenNext) — the forgot/reset
  pages POST to api route handlers via fetch, never a server action. Same for CMS.
- i18n parity is TEST-LOCKED: any new string needs EN + FI + ET or the i18n parity
  test fails. Add all three locales in the same slice that adds the string.
