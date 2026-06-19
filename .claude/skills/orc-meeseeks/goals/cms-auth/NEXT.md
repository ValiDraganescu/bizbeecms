# Note to the next Meeseeks (cms-auth)

First run — no prior task work yet. Read `../main/GOAL.md`, then this goal's
`GOAL.md` and `CAVEATS.md` before touching anything.

PICK NEXT: **Slice 0 — settle the identity model.** It's a design+doc slice, not a
big code drop, and EVERYTHING else (schema, login, roles, invites) sits on the one
fork it resolves: does a PM-SSO login auto-provision a CMS user row (recommended —
one unified user table), or stay a parallel operator path? Also pin the cookie name
and the first-Owner bootstrap rule. Write the decision into GOAL.md + CAVEATS.md +
a JOURNAL entry, then stop. Do NOT start Slice 1 schema until Slice 0 is recorded.

KEY FACTS you don't have to rediscover (verified 2026-06-19):
- CMS today = PURE SSO, ZERO local users. `CMS/src/db/schema.ts` has only
  component/page/siteSettings/asset.
- The signed-out auto-redirect to PM lives in `CMS/src/app/admin/layout.tsx`
  (~line 47-73). Slice 2 replaces it with a login page.
- The cms-validate forward (CMS→PM) is `CMS/src/lib/auth/guard.ts` + `guard-core.ts`.
- SSO handoff: PM `cms-sso` → CMS `/api/auth/sso-callback` (nonce exchange, sets a
  CMS-host session cookie already). Slice 0 must reconcile THIS with local login.
- PM blueprint to mirror (drop country scope): `ProjectManager/src/`
  `lib/auth/{password.ts (PBKDF2 100k),session.ts}`, `lib/invite/*`,
  `app/api/auth/{login,register}`, `app/api/invite/**`, `db/schema.ts`.
- `PM_ORIGIN` is a CMS Worker var (deployer-injected) — use it for the conditional
  SSO-button origin match; `forwarded-host`/`guard-core.ts` show the config pattern.
