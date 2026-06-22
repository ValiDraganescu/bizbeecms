# Note to the next Meeseeks (cms-auth)

Slice 0 (identity model), Slice 1 (user/session schema + password auth), and
Slice 2 (in-CMS login page + local-session guard + SSO rewire) are DONE.
Don't re-litigate the four Slice-0 decisions (GOAL.md "Settled identity model").

## What Slice 2 left you (all green)
- `CMS/src/app/admin/layout.tsx` — signed-out now renders `<LoginForm>` (NO more
  auto-redirect). Computes `showSso` via `shouldShowSsoButton` + builds the SSO
  handoff URL behind the button.
- `CMS/src/components/login-form.tsx` — email/password form + conditional SSO
  button + a **Google placeholder slot** (comment marker for Slice 2b).
- `CMS/src/app/api/auth/login/route.ts` — POST, verifies + mints local session,
  non-enumerating 401.
- `CMS/src/lib/auth/guard.ts` — **resolves sessions LOCALLY** (getSession →
  findUserById). NO per-request PM forward. cms-validate is SSO-handshake-only.
- `CMS/src/app/api/auth/sso-callback/route.ts` — nonce→sid→cms-validate→upsert
  Admin (synthetic `<pmUserId>@pm.sso` email)→createSession.
- `CMS/src/lib/auth/guard-core.ts` — pure `shouldShowSsoButton` (node-tested).
- `login` i18n namespace in EN/FI/ET. cms-bundle regenerated.

## PICK NEXT: Slice 3 — CMS roles + server-side authorization
(or Slice 2b Google sign-in if you'd rather — both are TODO; Slice 3 is the
listed next.) See BACKLOG Slice 3 for the spec:
- Copy the pm-roles role SET + `canRemoveUser` removal hierarchy NAMES only (drop
  country/tag scope). Pure helpers (`canInvite`/`canManageUsers`/`canEditContent`/
  `canRemoveUser`), node-tested.
- Wire role checks into BOTH guard layers: the `/admin/*` page gate AND the
  `/api/*` route guard (extend, don't fork). Right now `requireAdmin`/
  `checkAdmin*` only check "is a valid CMS user" — Slice 3 adds the role gate.
  `GuardDecision` already carries `userId`; thread the `role` through (the user
  store row has it).
- SSO users are `role=Admin` (already set by sso-callback). Local users get their
  role from invite (Slice 4) — default `Editor` until then.

## Heads-up / gotchas
- **Don't reintroduce the PM forward in the guard** (CAVEAT). Local users have no
  PM row.
- SSO user email is the synthetic `<uuid>@pm.sso` stopgap — see CAVEAT; backfill
  when PM returns the real email.
- You are the sole CMS worker; a PM worker may be in `ProjectManager/src/`. Stay
  in `CMS/src/**`; only run `npm run bundle:cms` from ProjectManager (yours) once
  a slice adds runtime code the worker serves.
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` is up) + regen cms-bundle + EN/FI/ET.
