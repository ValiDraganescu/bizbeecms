# Note to the next Meeseeks (cms-auth)

Slice 0 (identity model) + Slice 1 (user/session schema + password auth) are
DONE. Build on them; don't re-litigate the four Slice-0 decisions (GOAL.md
"Settled identity model" + CAVEATS fixed-decisions block).

## What Slice 1 left you (the foundation, already green)
- `CMS/src/lib/auth/password.ts` — `hashPassword`/`verifyPassword` (PBKDF2-100k,
  pure), `isPasswordLongEnough` + `MIN_PASSWORD_LENGTH=10`.
- `CMS/src/lib/auth/session-core.ts` — pure `SESSION_COOKIE="bizbee_session"`,
  `SESSION_TTL_SECONDS` (7d), `newSessionId`, `buildSession`, `isSessionValid`.
- `CMS/src/db/session-store.ts` — `createSession(userId)` (inserts D1 row + sets
  cookie), `getSession()`, `getSessionId()`, `destroySession()`. **SESSIONS ARE
  IN D1, not KV** (no KV binding on the CMS — see CAVEATS).
- `CMS/src/db/user-store.ts` — `findUserByEmail`/`findUserById`/`createUser`,
  `normalizeEmail`. `user` table: email UNIQUE, passwordHash NULLABLE, role
  default 'Editor'. Migration 0009 applied by the deployer per-Site.

## PICK NEXT: Slice 2 — in-CMS login page replaces the auto-redirect
Concretely (see BACKLOG Slice 2 for the full spec):
- Replace the signed-out auto-redirect in `CMS/src/app/admin/layout.tsx` with an
  in-CMS **login page** (email + password form → `POST /api/auth/login` that
  verifies via `findUserByEmail` + `verifyPassword` and calls `createSession`).
- **CRITICAL rewire (Slice 0 decision 2):** today `/api/auth/sso-callback` stores
  PM's *sid* in `bizbee_session` and `guard-core.ts` forwards it to PM
  cms-validate EVERY request. Slice 2 MUST change sso-callback to: nonce-exchange
  → get PM userId/email → upsert a CMS user (`role=Admin`, via createUser) → mint
  a CMS-LOCAL session (`createSession`) → set the cookie. Then the guard resolves
  sessions LOCALLY via `getSession()` instead of forwarding to PM. cms-validate
  becomes the SSO HANDSHAKE only. Don't leave the guard forwarding the cookie once
  local sessions exist — local users have NO PM row.
- Show the **"Sign in with BizbeeCMS" SSO button ONLY when the visitor arrived
  from PM** — match `Referer`/`?from=pm` against `PM_ORIGIN` from config (study
  `CMS/src/lib/auth/forwarded-host.ts` + `guard-core.ts` for the existing
  host-from-config pattern; NEVER hardcode `manager.bizbeecms.com`). Make the
  visibility a PURE helper + node-test it (origin match true/false).
- Leave a placeholder slot for the Google button (Slice 2b).
- EN/FI/ET for the page + button (Slice 2 is the FIRST slice with user-facing
  strings — Slice 1 was string-free).
- Gate: CMS `tsc` + `npx opennextjs-cloudflare build` green (NEVER while
  `npm run dev` is up). Slice 2 ADDS a runtime login route → **regen PM
  `cms-bundle`** this time (`cd ProjectManager && npm run bundle:cms`).

## Heads-up
- You are the sole CMS worker but a PM worker may be in `ProjectManager/src/` —
  coordinate before touching PM. Your scope: `CMS/src/**` + CMS migrations.
- Roles helper (`canInvite`/`canManageUsers`/`canRemoveUser`) is Slice 3 — Slice 2
  can hardcode `role=Admin` for the auto-provisioned SSO user for now.
