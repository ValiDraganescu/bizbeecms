# Note to the next Meeseeks (cms-auth)

Slices 0, 1, 2, AND 3 are DONE. Don't re-litigate the four Slice-0 decisions
(GOAL.md "Settled identity model").

## What Slice 3 left you (all green — 608 tests, tsc + opennext build)
- `CMS/src/lib/auth/roles.ts` — pure role tier helpers (scope-free mirror of PM
  `removal.ts`): `canRemoveUser`, `canChangeRole`, `canInvite` (Manager+),
  `canInviteRole(actor, target)`, `canManageUsers` (Manager+), `canEditContent`
  (all), `INVITABLE_ROLES`. Type-only-imports `CmsRole` → node-testable.
- `GuardDecision` now carries `role?: CmsRole` on allow + a `forbidden`/403 deny.
- `guard.ts` exposes: `requireRole(req, allowed)` + `requireUserManager` for
  /api/* (401 unsigned, 403 forbidden) and `checkRoleFromHeaders(allowed)` for
  /admin pages. Role helpers re-exported from guard.ts.
- `requireAdmin` is UNCHANGED = "any signed-in CMS user" — Editors still pass it
  (they edit content). Use the role gates only on the NEW user-mgmt surface.

## PICK NEXT: Slice 2b (Google sign-in) OR Slice 4 (invitation flow)
Both are TODO. Slice 4 is the natural continuation now that roles exist:
- Add `invites` table (id, email, role, invitedBy, token 64-hex, acceptedAt,
  expiresAt 7-day TTL — copy PM shape, DROP invite_countries). Drizzle migration.
- `POST /api/invite` gated by `requireRole(req, canInvite)`, validate the granted
  role with `canInviteRole(actorRole, targetRole)`. Send accept email via the
  Cloudflare Email Service `send_email` binding (PM's send-invite.ts targets
  `env.EMAIL.send` but the binding is COMMENTED in wrangler — provision for CMS,
  degrade to logging the link in dev). Accept URL = `APP_ORIGIN`-based.
- `POST /api/invite/accept/[token]` — validate expiry/accepted, invitee sets a
  10-char-min password (or links Google, Slice 2b), createUser with invited role,
  mint session. Node-test create→accept happy + expired/already-accepted.
- This slice ADDS user strings (invite email + accept page) → THEN regen
  cms-bundle from ProjectManager (`npm run bundle:cms`).

## Heads-up / gotchas
- Role LABELS not translated yet — deferred to Slice 5 (CAVEAT). Add the `roles`
  i18n namespace when the user-mgmt UI needs labels.
- Don't reintroduce the PM forward in the guard (CAVEAT). Local users have no PM row.
- SSO user email is the synthetic `<uuid>@pm.sso` stopgap (CAVEAT) — backfill when
  PM returns the real email.
- Sole CMS worker; a PM worker may be in ProjectManager/src/. Only run
  bundle:cms from ProjectManager once a slice adds runtime code the worker serves.
- Gate every slice: CMS `npm test` + `npx tsc --noEmit` + `npx opennextjs-cloudflare
  build` (NEVER while `npm run dev` is up) + EN/FI/ET + regen cms-bundle when runtime.
