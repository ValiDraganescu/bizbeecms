# Journal — component-kits
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:22 — Slice 1: component tags schema + portable envelope round-trip
- **Status:** DONE
- **What I did:**
  - Added `tags text NOT NULL DEFAULT '[]'` to the `component` table (`db/schema.ts`),
    generated Drizzle migration `migrations/0007_tense_lady_vermin.sql` (+ snapshot,
    + `_journal.json`). Deployer auto-applies it per-Site via
    `wrangler d1 migrations apply DB --remote` (deployer/src/index.ts:498) — NO manual step.
  - New pure helper module `lib/components/tags.ts`: `normalizeTags` (trim/dedupe
    case-insensitive/drop empty+over-long/cap 50/sort), `parseTags` (read DB column,
    never throws), `serializeTags` (canonical JSON), `distinctTags` (union for the
    Slice-2 autocomplete/filter). ponytail: JSON-array column, no managed tag table.
  - Threaded tags through the `PortableComponent` envelope (`lib/components/portable.ts`):
    new top-level `tags: string[]` field; `serializeComponent` normalizes the DB
    column into it; `parsePortableComponent` RE-normalizes the untrusted envelope
    `b.tags` (trust boundary — never trust the bundle's spelling into the column).
    Added `tags` to `ComponentRow` (optional) + `ImportedComponent` (required).
  - Threaded tags through `component-store.ts`: select `tags` in `listComponents`
    + `getComponentByName`; `upsertImportedComponent` persists `serializeTags(c.tags)`.
    AI write path (`upsertComponent`) deliberately leaves tags untouched (preserves
    on update, DB default `[]` on insert).
  - Set `tags: []` in all 5 premade kit `bundle()` wrappers (now-required field).
  - Tests: new `lib/components/tags.test.ts` (6 cases) + 3 round-trip cases added to
    `scripts/components-export-import.test.mjs`. Updated `scripts/component-store.test.mjs`
    DDL to include the `tags` column.
  - Regenerated PM `cms-bundle` (`ProjectManager/src/lib/deploy/cms-bundle.generated.js`).
- **Verified:** CMS `tsc --noEmit` green; `npx opennextjs-cloudflare build` green;
  `npm test` 499/500 (the 1 fail is PRE-EXISTING + unrelated: the
  `ports-sole-reader.guard` test flags `lib/content/content-db.ts` from commit ce01b0d,
  the content-collections goal — confirmed failing on clean HEAD before my changes).
  No UI yet (Slice 2). No EN/FI/ET strings added this slice (no user-facing copy).
- **Files:** CMS/src/db/schema.ts, CMS/src/db/component-store.ts,
  CMS/src/lib/components/{tags.ts,tags.test.ts,portable.ts,blog-kit.ts,docs-kit.ts,
  landing-kit.ts,pricing-kit.ts,portfolio-kit.ts}, CMS/scripts/components-export-import.test.mjs,
  CMS/scripts/component-store.test.mjs, CMS/migrations/0007_tense_lady_vermin.sql,
  CMS/migrations/meta/{0007_snapshot.json,_journal.json},
  ProjectManager/src/lib/deploy/cms-bundle.generated.js
