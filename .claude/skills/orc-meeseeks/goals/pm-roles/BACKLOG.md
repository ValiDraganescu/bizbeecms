# Backlog — pm-roles
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order: role enum + migration FIRST (everything keys off the names), then the
removal hierarchy, then tags, then the management UI/API. Each slice gates on PM
tsc + opennext build green + PM node tests + EN/FI/ET for new strings.

- TODO: **Slice 1 — new role enum + SiteManager→Editor migration.** Change
  `ProjectManager/src/db/schema.ts:18` `Role` to
  `"SuperAdmin" | "Admin" | "Manager" | "Editor"`. Drizzle migration: UPDATE all
  `users.role = 'SiteManager'` → `'Editor'` (the role column is text + `$type`, so
  this is a data UPDATE, not a column rebuild — confirm against an existing
  migration). Grep the WHOLE PM for `"SiteManager"` and replace in authz, i18n
  (role labels — add `Manager`/`Editor`, keep EN/FI/ET), UI, tests. Existing authz
  semantics for the renamed role stay equivalent for now (Editor == old
  SiteManager: assigned-sites only); Manager-specific scope comes in Slice 3. Pure
  helpers untouched except the type. Tests updated to the new names. Gate.

- TODO: **Slice 2 — removal hierarchy (the core new rule).** Add ONE pure helper
  `canRemoveUser(actor: User, target: User): boolean` enforcing: SuperAdmin removes
  anyone; Admin removes anyone EXCEPT SuperAdmin; Manager removes anyone EXCEPT
  SuperAdmin/Admin (and only within their own country+tag scope — wire the scope
  check once Slice 3 lands tags; until then, scope by country); Editor removes no
  one. Same rule guards ROLE CHANGES (can't elevate/demote to or above your own
  tier). Node tests covering each (actor,target) pair. NO route yet (Slice 4 wires
  it) — pure + tested this slice so the rule is locked before UI.

- TODO: **Slice 3 — tags data model + Manager country+tag reach.** Add tags:
  USER DECISION — Sites carry tags; Manager reaches a Site when country ∈
  Manager.countries AND tag ∈ Manager.tags (BOTH). Schema: a managed `tags` table
  (pickable list) + `user_tags` (Manager's tags, PK userId+tag) + `site_tags` (PK
  siteId+tag), mirroring `user_countries`. Drizzle migration. Update the access
  rule: rename/extend `canManageSiteByCountry` → `canManageSite(actor, countries,
  tags, site, siteTags)` and thread it through `listSitesForUser` so Managers see
  only country-AND-tag matches; Editors still by assignment; SuperAdmin/Admin
  global. Helpers to read a user's tags + a site's tags. Pure access-rule tests
  (country-only match → denied; tag-only → denied; both → allowed; Editor by
  assignment; Admin global). Gate.

- TODO: **Slice 4 — global User-Management API.** NEW REST under
  `app/api/users/*`: `GET` list all users (with role, countries, tags — scoped to
  what the actor may see), `PATCH /api/users/[id]` to change role + set
  countries + set tags (Admins set a Manager's countries/tags), `DELETE
  /api/users/[id]` to remove a user. EVERY mutation gated by `canRemoveUser` /
  the role-change rule (Slice 2) + scope (Slice 3). A Manager can only assign
  countries/tags within its own scope (mirror `authorizeInvite`'s subset rule).
  Node tests for each route's authz (forbidden + allowed paths). Gate.

- TODO: **Slice 5 — global User-Management UI.** NEW PM page (e.g.
  `app/(app)/users/`): a users table (email, role, countries, tags), inline role
  change, a countries+tags picker (reuse/extend the country picker; add a tag
  multiselect from the managed `tags` table), and a remove action behind an
  IN-APP confirm modal (never `window.confirm`). Show only actions the current
  user is allowed (hide/disable remove on higher tiers). Reuse PM design-system
  components + purpose tokens. EN/FI/ET for all chrome. Gate.

- TODO: **Slice 6 — extend the INVITE flow to the new roles + tags.** Update
  `authorizeInvite` + the invite UI so an inviter can invite at the new roles
  (Manager/Editor) and, for Manager invites, set the invited countries + tags
  (subset of the inviter's own scope, like the existing country subset rule). The
  invite-accept path stores the role + countries + tags on the new user. Node
  tests for the subset/authz rules. EN/FI/ET. Gate. (Keep in sync with cms-auth's
  invite flow — same shape, CMS-local.)
