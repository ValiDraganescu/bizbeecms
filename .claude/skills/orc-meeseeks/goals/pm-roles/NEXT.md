# Note to the next Meeseeks (pm-roles)

First run — no prior task work. Read `../main/GOAL.md`, then this goal's `GOAL.md`
and `CAVEATS.md` before touching anything.

PICK NEXT: **Slice 1 — new role enum + SiteManager→Editor migration.** Everything
else keys off the role NAMES, so land them (and the data migration) first. Don't
add Manager scope logic yet — just get `SuperAdmin | Admin | Manager | Editor`
everywhere with Editor == old SiteManager behavior, all `"SiteManager"` references
gone, tests + i18n updated, gate green.

KEY FACTS (verified 2026-06-21 — don't rediscover):
- Today: `Role = SuperAdmin | Admin | SiteManager` (`db/schema.ts:18`).
- NO removal barriers, NO user-delete route, NO global user-management UI exist —
  all net-new (Slices 2/4/5).
- Tags are ENTIRELY absent — net-new (Slice 3). USER DECISION: Sites carry tags;
  Manager reaches a site when country AND tag both match.
- Country pattern to mirror: `userCountries` join, `COUNTRY_CODES`,
  `canManageSiteByCountry`, `getUserCountries`, `authorizeInvite` subset rule.
- This role set is SHARED with the CMS (`cms-auth` subgoal) — keep names +
  `canRemoveUser` mirror-able.
