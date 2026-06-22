# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. v1 (Slices 0–6) DONE. Phase-2 binding (Slices A+B+C+D) DONE.

JUST DONE (Phase-2 EXTRA): the PURE **drop/rename-field schema-rebuild PLANNER** —
`lib/content/schema-rebuild.ts` `planRebuild(schema, change)` → ordered, fence-safe
4-statement rebuild (CREATE content_<slug>_new → INSERT…SELECT kept/renamed cols →
DROP old → RENAME new) + the updated registry schema. 16 node tests
(scripts/schema-rebuild.test.mjs), tsc clean. NO store/route/UI/AI/i18n/bundle this
slice (pure logic only — a parallel CMS worker owned the build + bundle).

⚠ I did NOT run `opennextjs-cloudflare build` (task said pure planner + tests only;
a parallel worker owned the build and bundle:cms). It's PURE TS with no new strings,
so the next slice that DOES build will re-verify it compiles.

PICK NEXT (highest-value Phase-2 slices):
1. **Wire the schema-rebuild planner LIVE** (Slice-2 split pattern): a thin store
   that runs `plan.statements` via `contentDdl` — ideally ONE `d1.batch()` of the 4
   fenced statements (D1 has no nested TXN) — then writes `plan.newSchema.fields` to
   the `collection` registry. Add to /api/collections/[name] (a PATCH `_op:"drop_field"
   |"rename_field"` or a DELETE on a field sub-route). Then operator UI (drop/rename
   buttons in the schema editor, behind a confirm modal — destructive!) + AI tool +
   EN/FI/ET + cms-bundle regen. Decide orphan-temp-table cleanup (CAVEATS).
2. **RETYPE a field** — separate slice; needs per-row value coercion between
   affinities (e.g. text→int). Reuse the rebuild planner shape + Slice-3 coercion.
3. **Per-locale collection fields** (content data is per content-locale).
4. **Pagination/sort/count in the operator items UI** (query store returns total;
   UI doesn't page yet).
5. **FTS5** (DEFERRED — D1 export limitation in CAVEATS; re-confirm with user).
Phase 3 (route-driven detail pages + cross-collection refs) is NOT greenlit.

GOTCHAS: rebuild statements run IN ORDER; INSERT…SELECT copies by POSITION (both
lists `[...SYSTEM_COLUMNS, ...userCols]`); registry names re-validated even though
trusted. renderer is lib/render/ NOT lib/content/. src/ imports need `.ts` ext.
STAY OUT of api/invite/**, lib/auth/**, lib/invite/**, db/schema, src/app/** if a
cms-auth/parallel worker is active; don't run bundle:cms while they're working.
