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
- PM SESSION INVALIDATION (P3, learned): KV sessions are keyed by an opaque random
  id with NO userId index, so "kill all of a user's sessions" can't be a single
  delete. P3 added `invalidateUserSessions(userId)` to `lib/auth/session.ts` that
  pages `kv.list({ prefix: "session:" })` and deletes records whose `userId`
  matches — O(all sessions), fine for a small team (ponytail comment names the
  upgrade path: a `user:<id>:sessions` set index). CMS C3 will hit the same wall:
  check the CMS session store keying before assuming a delete-all. Reuse this
  scan-by-prefix shape if CMS sessions are likewise un-indexed by user.
- P3 GENERIC ERROR: invalid/expired/used reset tokens ALL return the single
  `auth.errors.resetTokenInvalid` key — the route never reads `applyReset`'s
  `reason` (a test asserts `result.reason` never appears in the route). Keep that
  property when mirroring in CMS: no detail leak about why a token failed.
- P3 SINGLE-USE is concurrency-safe via `update … where isNull(usedAt)` returning
  rows: 0 rows updated ⇒ token already used ⇒ reject. Don't replace with a
  read-then-write (TOCTOU). Mark used BEFORE hashing/session-kill (test locks the
  order).
- P5 TESTABILITY (learned): `node --test` CANNOT resolve the `@/` alias, so logic
  that imports `@/db`/`@/lib/...` can only be tested by SOURCE-TEXT matching (grep
  the .ts). For GENUINE behavioral fail-before/pass-after tests, extract the pure
  decision (no DB, no `@/`) into an alias-free `*-logic.ts` with STRUCTURAL types
  (e.g. `ResetRow = {usedAt, expiresAt}`), have the real fn delegate to it, and
  import+execute it from the test. PM did this: `checkReset` → `classifyReset` in
  `lib/reset/reset-logic.ts` + `reset-logic.test.ts`. Mirror this for CMS C5.
- C1 CMS NAMING (learned): CMS schema uses SINGULAR table names + the Drizzle
  export matches (`user`/`session`/`invite`, and now `password_reset` exported as
  `passwordReset`) — PM uses PLURALS (`users`/`passwordResets`). When mirroring PM
  reset code into CMS, rename: PM `passwordResets` ⇒ CMS `passwordReset`, PM `users`
  ⇒ CMS `user`. C1 followed the task spec and kept a real FK→`user.id` cascade even
  though CMS `session`/`invite` deliberately drop FKs — the spec asked for it.
- C1/C3 SESSION INVALIDATION: CMS sessions live in D1 (`session` table) NOT KV (the
  CMS Worker has no KV binding). The `session` table has `session_user_idx` on
  `userId`, so C3 can kill a user's sessions with a plain indexed
  `delete from session where userId = ?` — no prefix-scan needed (PM's KV had no
  user index and needed a scan; CMS is the easy case).
- C2 CMS MESSAGE STRUCTURE (learned): CMS `messages/*.json` has NO `auth`
  namespace (PM does). CMS invite/reset email strings live at the TOP LEVEL —
  invite is `inviteEmail`, C2 added `resetEmail` (NOT `auth.forgot.email` like PM).
  Login-form strings are top-level `login.*`. When C4 adds the forgot/reset PAGE
  strings, follow CMS's own top-level convention (e.g. a `forgotPassword`/`reset`
  top-level key), do NOT copy PM's `auth.forgot.*`/`auth.reset.*` nesting. Also
  CMS has NO `validateEmail` helper (PM's `lib/auth/validation.ts` doesn't exist
  in CMS) — only `normalizeEmail` in `db/user-store`. C2's forgot route did the
  format check with an inline regex; reuse that or extract if C3/C4 also need it.
- C3 ROUTE ERROR KEYS ARE BARE / NO STRINGS (learned): CMS auth routes return raw
  error KEYS (`Response.json({error:"passwordTooShort"})`), NOT translated text — the
  PAGE maps the key to a message (see invite-accept route + its page). So C3's reset
  route reuses `passwordRequired`/`passwordTooShort`/`passwordMismatch`/`resetTokenInvalid`
  and added ZERO message strings → i18n parity untouched. C4 is the slice that adds the
  `resetTokenInvalid` etc. mappings to its reset page (+ EN/FI/ET) — do it there, not C3.
  (PM differs: PM's reset route returns keys under `auth.errors.*` that already existed.)
- C3 used `isPasswordLongEnough(password)` from CMS `lib/auth/password.ts` (NOT PM's
  `validatePassword` — CMS has no `lib/auth/validation.ts`). `MIN_PASSWORD_LENGTH=10`,
  same as invite-accept. The reset-route test greps `isPasswordLongEnough`, not
  `validatePassword`.
- C2 CMS ROUTES use `Response.json(...)` (web Response), NOT PM's
  `NextResponse.json(...)` — CMS auth routes (login) return `Response`. Mirror
  that in C3 (`/api/auth/reset`); the forgot-route test greps for `Response.json`,
  so a reset-route test should too.
- P5 NON-DUPLICATION: the enumeration-safe hit===miss invariant is already locked
  STRUCTURALLY by `forgot-route.test.ts` (exactly one `{ok:true}` returned AFTER
  the `if(user)` block). Don't add a runtime deep-equal of `{ok:true}` vs
  `{ok:true}` — it's tautological. Trust the structural lock.
