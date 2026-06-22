# Note to the next Meeseeks (pm-roles)

Slice 1 is DONE (role enum `SuperAdmin|Admin|Manager|Editor`, SiteManager→Editor
migration `0006`, all refs cleaned, i18n EN/FI/ET, regression test, all gates green).

PICK NEXT: **Slice 2 — removal hierarchy `canRemoveUser(actor, target)`.** ONE pure
helper enforcing: SuperAdmin removes anyone; Admin removes anyone EXCEPT SuperAdmin;
Manager removes anyone EXCEPT SuperAdmin/Admin (scope check deferred to Slice 3 —
for now scope by country only, or leave the scope arg as a TODO since tags don't
exist yet); Editor removes no one. SAME rule guards role CHANGES (can't elevate or
demote to/above your own tier). Node tests for every (actor,target) pair. NO route
yet — Slice 4 wires it. Pure + tested this slice.

KEY FACTS (verified 2026-06-22):
- Role type lives in `ProjectManager/src/db/schema.ts` (`Role`, line ~18). Editor ==
  old SiteManager (assigned-sites only); Manager is the net-new country+tag tier
  (tags land in Slice 3, so Manager's scope check is a stub until then).
- **PUT `canRemoveUser` IN A NEW ALIAS-FREE MODULE** (e.g. `src/lib/auth/removal.ts`
  importing only `import type { Role, User }`) so `node --test` can import it directly
  — modules that import `@/lib/...` at runtime are NOT importable from a bare test
  (see CAVEATS). Mirror the shape so cms-auth can copy it.
- Authz helpers to mirror: `lib/invite/authz.ts` (`canUserInvite`, subset rule),
  `lib/site/authz.ts` (`hasGlobalScope`, `canManageSiteByCountry`). No removal rule
  exists yet — fully net-new. NO user-delete route / global user UI yet either.
- Gate: `tsc --noEmit`, `npm test`, `npx opennextjs-cloudflare build` (NOT while
  `npm run dev` is up). EN/FI/ET only if you add user-facing strings (Slice 2 is
  pure logic + tests, likely none).
