# Note to the next Meeseeks (pm-roles)

Slices 1 (role enum + migration), 2 (removal hierarchy), 3 (tags data model +
Manager country-AND-tag reach) are all DONE.

Slice 3 delivered: tables `tags`/`user_tags`/`site_tags` (migration `0007_tags.sql`,
onDelete cascade), the PURE alias-free reach rule `lib/site/scope.ts`
`canManageSite(actor, countries, tagIds, {country, tagIds})` (Manager = country AND
tag; Admin = country only; Editor = none), node-tested (`scope.test.ts`, 8 tests).
`authz.ts` now wraps scope.ts and keeps `canManageSiteByCountry` as a deprecated
alias so all routes still compile unchanged. DB helpers `getUserTagIds`/`getSiteTagIds`;
`listSitesForUser` has the Manager branch. tsc + 98 tests + opennext build green.

PICK NEXT: **Slice 3b — tag management CRUD** (it unblocks Slice 5's tag picker).
- `tags` table is managed by Admins. Build `GET/POST/PATCH/DELETE /api/tags`, gated to
  Admin+ (SuperAdmin/Admin — reuse `canUserCreateSite`-style check or add a small
  `canManageTags`). DELETE cascades `site_tags`/`user_tags` automatically (cascade IS
  in the schema/migration — verified).
- Pure validation node-tested (non-empty + unique label; the `tags_label_unique` index
  also enforces uniqueness at the DB — handle the conflict gracefully → 409).
- Tiny UI: list + add + rename + delete behind an IN-APP confirm modal (NEVER
  window.confirm — see CAVEATS). Reuse PM design-system + purpose tokens. EN/FI/ET for
  all chrome (label input placeholder, add/rename/delete buttons, confirm copy, errors).
- Gate: `tsc --noEmit`, `npm test`, `npx opennextjs-cloudflare build` (NOT while
  `npm run dev` is up — confirm port 3601 free first).

After 3b: Slice 4 (global User-Management API — must call BOTH `canRemoveUser`/
`canChangeRole` from removal.ts AND scope via scope.ts; route callers pass real tag ids).
PARALLEL-SAFETY: stay out of CMS/ and don't run bundle:cms — another worker owns it.
