# Note to the next Meeseeks (cms-auth)

Slices 0,1,2,3,4 AND 5 are DONE. Don't re-litigate the four Slice-0 decisions
(GOAL.md "Settled identity model").

## What Slice 5 left you (all green — 716 tests, tsc + opennext build, cms-bundle regen)
- Pure `lib/auth/user-mgmt.ts` (ASSIGNABLE_ROLES / assignableRolesFor /
  userRowControls) — UI + API compute per-row controls from it; API re-checks the
  SAME canChangeRole/canRemoveUser (UI is defense-in-depth).
- Store: `listUsers`/`updateUserRole`/`deleteUser`(+session sweep) in user-store,
  `deleteInvite` in invite-store. All injectedDb-testable.
- Routes (all `requireUserManager`, Manager+): `GET /api/users`,
  `PATCH/DELETE /api/users/[id]`, `DELETE /api/invite/[id]`.
- Page `/admin/settings/users` + client `users-manager.tsx` (invite form, inline
  role select, remove/revoke via in-app ConfirmModal). SettingsNav `users` tab.
- i18n: NEW `roles` (lowercase-first, mirrors PM) + `users` namespaces EN/FI/ET.
  Role labels now translated (Slice-3 deferral resolved).

## PICK NEXT: Slice 2b — Google sign-in (the last open BACKLOG task)
The only remaining TODO. OAuth 2.0 OWN client, net-new (no Google auth in the repo).
`GET /api/auth/google/start` (redirect w/ state+PKCE) + `GET /api/auth/google/callback`
(exchange code, verify id_token, read VERIFIED email). On callback: match a CMS user
by email → sign in; UNINVITED user with no row → REJECT (no self-signup, per Slice-0
decision 3 — randoms can't walk in). Mint the same `bizbee_session` CMS-local session.
Client id/secret + redirect from deployer-injected Worker vars (thread like
PM_ORIGIN/APP_ORIGIN — see deployer/src/index.ts). Pure helpers (state/nonce verify,
id_token email extraction) node-tested; do NOT call live Google in tests. EN/FI/ET
for the Google button (login page already has a placeholder slot from Slice 2). Gate.

## Heads-up / gotchas (still true)
- Don't reintroduce the PM forward in the guard — local/Google users have no PM row.
- CF Email binding uses WORKERS shape `{to, from:{email,name}, subject, text}`;
  commented in wrangler until a verified sender domain exists (degrades to logging).
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` is up) + EN/FI/ET parity + regen cms-bundle from
  ProjectManager (`npm run bundle:cms`) once a slice adds runtime routes.
- SSO users appear as `<uuid>@pm.sso` in the user list — backfill when PM's
  cms-validate returns the real email (Slice-2 follow-up).
