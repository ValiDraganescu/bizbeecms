# Goal: pm-roles
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Overhaul **ProjectManager** user management: a new 4-role hierarchy with explicit
"who can remove whom" rules, Manager scope by **countries AND tags**, and the
first real **global user-management UI + API** (PM has none today — you can only
assign users to a Site).

USER DIRECTIVE (2026-06-21): "ProjectManager — SuperAdmin (does all), Admin (does
all but cannot remove SuperAdmin), Manager (does all but cannot remove SuperAdmin
and Admin and can manage one or more countries and tags, admins can set which
countries they manage), Editor (can manage sites where it has been assigned) user
roles."

## The role model (target)
- **SuperAdmin** — does everything. Can remove anyone. (First registered user.)
- **Admin** — does everything EXCEPT remove a SuperAdmin.
- **Manager** — does everything EXCEPT remove a SuperAdmin or an Admin; scoped to
  one or more **countries** AND **tags**. An Admin (or SuperAdmin) sets which
  countries + tags a Manager covers. A Manager reaches a Site when the Site's
  country ∈ the Manager's countries **AND** the Site carries one of the Manager's
  tags (BOTH filter — settled with user 2026-06-21).
- **Editor** — can manage only Sites it has been explicitly **assigned** to
  (`site_users`). No country/tag reach.

This REPLACES today's `SuperAdmin | Admin | SiteManager`. `SiteManager` is
effectively split: its assigned-site behavior becomes **Editor**; the new
**Manager** is a country+tag-scoped tier above Editor. (Decide migration of any
existing `SiteManager` rows → Editor; note in a CAVEAT.)

## What "good" looks like
- `Role` type = `SuperAdmin | Admin | Manager | Editor` everywhere; no dangling
  `SiteManager` references; a data migration for existing rows.
- **Removal hierarchy enforced server-side**: a user can never remove someone of
  an equal-or-higher tier per the rules above (Admin↛SuperAdmin, Manager↛
  SuperAdmin/Admin). Pure, tested `canRemoveUser(actor, target)`.
- **Tags** are a real data model: a tag set on Sites + a tag set on Managers
  (assigned by Admins). Reuse the country-scope pattern (`user_countries`-style
  join) for `user_tags` + `site_tags`. (Tag vocabulary: free-form strings vs. a
  managed list — settle in the schema slice; default to a managed `tags` table so
  they're pickable.)
- Manager access = country-match **AND** tag-match; Editor access = assignment.
  `listSitesForUser` + `canManageSiteByCountry` (rename → `canManageSite`) updated.
- A **global User-Management UI + API** (NEW): list all users, change a user's
  role, set a user's countries + tags, and remove a user — all gated by the
  removal hierarchy + scope. (User chose to build this now, not defer.)
- PM UI localized EN/FI/ET for every new string (role labels, tag picker, remove
  confirms — use an IN-APP confirm modal, never `window.confirm`).
- Gate every slice: PM `tsc` + `opennextjs-cloudflare build` green; PM node tests.

## Reference (current state, verified 2026-06-21)
- `ProjectManager/src/db/schema.ts:18` `Role` type; `userCountries` (~162),
  `siteUsers` (~141). NO tags anywhere today. NO user-delete route, NO global
  user-management UI (only per-Site assign at `app/(app)/sites/[id]`).
- Authz: `lib/invite/authz.ts` (`canUserInvite`, `authorizeInvite`),
  `lib/site/authz.ts` (`canUserCreateSite`, `hasGlobalScope`,
  `canManageSiteByCountry`). NO removal-barrier rule exists yet — it's all net-new.
- Countries: `lib/auth/countries.ts` `COUNTRY_CODES`; enforced in
  `canManageSiteByCountry` + `authorizeInvite`.

## Relationship to cms-auth
The CMS reuses THIS role set (the `cms-auth` subgoal). Keep the role names + the
removal-hierarchy helper in a shape the CMS can mirror. "Any PM user with access to
the CMS site is an Admin in the CMS" — that mapping lives in cms-auth, but it keys
off this role model, so land the role names here first.
