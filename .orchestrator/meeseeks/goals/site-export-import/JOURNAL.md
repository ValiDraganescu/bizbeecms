# Journal — site-export-import
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-02 19:03 — Design + inventory slice: wrote FORMAT.md
- **Status:** DONE
- **What I did:** Read `CMS/src/db/schema.ts` in full (all 17 named tables) and
  `CMS/src/db/settings-store.ts` (the complete `site_settings` key list: 10 keys —
  content_locales, theme_overrides, theme_overrides_dark, site_identity,
  model_catalog, image_model, translate_model, image_gen_model, icon_set,
  api_cache_versions). Mined `archive/component-kits` (`CMS/src/lib/components/portable.ts`
  — the `bizbeecms.component`/`bizbeecms.kit` envelope + trust-boundary pattern to
  mirror one tier up as `bizbeecms.site`) and `archive/content-collections`
  (`collection-schema.ts`'s `buildCreateTableSql`/`buildAddColumnSql`, the Slice-0
  fence in `content-db.ts`/`fence.ts`, and `collection-store.ts`'s create/drop
  order) for the fenced-DDL machinery import must reuse verbatim. Also checked
  `lib/ports/db.ts` + `lib/ports/storage.ts` (the Db/Storage ports export/import
  must go through) and confirmed `fflate` is NOT an installed dependency
  (`package.json`). Wrote `goals/site-export-import/FORMAT.md`: the full table
  inventory + export/do-not-export split, the `bizbeecms.site` v1 envelope shape,
  the collection-row encoding rule (generic `SELECT *` → JSON, no per-type coding
  needed since D1 already stores bool/date as int), the asset size-strategy
  decision (manifest + per-asset fetch/upload protocol, NOT a single zip — no
  fflate installed + Workers' ~100MB body ceiling + the Storage port is already
  per-key `put/get/delete`), the collection-recreation rule (import MUST call
  `buildCreateTableSql` + `contentDdl`, never hand-author DDL), and the exact
  destructive-import reset plan (wipe order, preserve list, restore order,
  idempotency-by-construction via unconditional wipe).
- **Verified:** Cross-checked every table name/column claim directly against
  `schema.ts` (read in full, not skimmed) and every settings key against the
  actual `_KEY` constants in `settings-store.ts` (not GOAL.md's prose, which only
  gestured at "theme, brand identity, content locales, AI persona/prompts
  config" — the real key list is now enumerated exactly). Confirmed `fflate`
  absence via `package.json`. No product code touched this run, per the task's
  own scope.
- **Files:** `goals/site-export-import/FORMAT.md` (new), `BACKLOG.md` (flipped
  first TODO to DONE), `JOURNAL.md`, `NEXT.md`.
