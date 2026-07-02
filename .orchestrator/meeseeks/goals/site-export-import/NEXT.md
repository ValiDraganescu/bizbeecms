# Note to the next Meeseeks (site-export-import)

**Import EXECUTE is now DONE too** (Export core+assets, Import validate+dry-run,
Import execute — all 4 of BACKLOG's first 4 tasks). Read FORMAT.md first — still
the contract, unchanged by this run.

- `POST /api/site-import` — the destructive path. Body: `{artifact, confirm}`.
  `confirm` must equal the artifact's `meta.siteName` EXACTLY (case-sensitive) —
  a blank `siteName` (source never set `site_identity`) can NEVER be confirmed,
  refused outright with a named error. Wipes `collection` (+drops every
  `content_*` table), `page_version`, `page`, `component`,
  `data_source_request`, `data_source`, `prompt_version`, `asset`,
  `site_settings` — NEVER touches `user/session/invite/password_reset/
  login_attempt/api_key/icon_cache/chat_thread`. Recreates collections via
  `buildCreateTableSql`/`contentDdl` (never hand-authored DDL), restores
  everything in FORMAT.md §6's dependency order, nulls every `data_source.secretEnc`
  regardless of what the artifact claims. HARD-BLOCKS (not warning) if
  `tables.collection.length > 100` — refuses before any writes. Pure planner:
  `CMS/src/lib/site-export/site-import-execute.ts` (`planImport`,
  `checkConfirmation`, `WIPE_BUILTIN_TABLES`, `PRESERVED_TABLES`) — 13 unit
  tests, node-testable, zero D1/CF imports. Route
  (`CMS/src/app/api/site-import/route.ts`) is the thin executor.
- **Idempotent by construction**: wipe is unconditional, so re-POSTing the
  same artifact after a mid-way failure (or just for a repeat test) is safe —
  verified live by literally doing it twice in a row against the real dev D1.
- **IMPORTANT gotcha for ANY future bulk-insert code here**: D1's per-statement
  bound-param cap is 100. `db.insert(table).values([manyRows])` in one call
  WILL 500 past ~6-7 rows on a wide table (confirmed on `component`, 16 cols).
  The route's `insertRows()` helper chunks by `floor(90/columnCount)` — reuse
  this helper (or the pattern) for the asset-upload leg's own D1 writes if it
  needs any bulk insert, and for anything else that inserts artifact-sized
  batches. This is now in BOTH this goal's CAVEATS.md and `main`'s CAVEATS.md
  (goal-agnostic Workers/D1 constraint).
- Live-verified end-to-end on `:3602` (dev server was already running,
  `opennextjs-cloudflare build` was NOT run): exported the real tableonline
  site (13 pages/41 components/7 collections/73 rows/61 assets/6
  dataSources/2 promptVersions), imported it back into the SAME instance
  (simplest smoke test, matches this file's prior guidance) — home page
  re-rendered 200 with the correct title, every D1 count matched, secrets
  nulled, `user` table (2 rows) untouched throughout both the first AND a
  repeat second import.

**Next TODO (per BACKLOG.md, in order): two remaining slices, pick ONE.**

1. **Asset bytes upload leg** (FORMAT.md §4's second import leg, explicitly
   deferred by both this run and the prior validate run): `POST
   /api/site-import/asset/<key>` — operator-only, takes raw bytes + a
   content-type, calls `Storage.put(key, bytes, {contentType})`. The import
   EXECUTE response already returns `assetKeysToUpload: string[]` (every
   `asset.key` from the just-restored metadata rows) as the checklist a caller
   drives against — this route is the upload counterpart, one call per key.
   Mirror `GET /api/site-export/asset/<key>`'s shape/guard style
   (`isValidAssetKey`, `requireAdmin`). Decide: does the route need to verify
   the key exists in the `asset` table first (probably yes — don't let an
   operator upload bytes under an arbitrary key not in the metadata), and
   should content-type come from the request or be trusted from the already-
   restored `asset.content_type` row (safer: read the row, ignore/validate any
   client-supplied content-type against it).
2. **Admin UI**: Settings → "Export / Import" section (BACKLOG's next item
   after asset upload) — Export button, Import flow (upload → dry-run report →
   typed confirmation → execute → result + secrets-to-re-enter list). Needs
   the asset upload leg (#1) to be a complete UX, so probably do #1 first
   unless you have a good reason to stub the UI without it.

One thing worth knowing: `CAVEATS.md`'s body is STILL mostly copy-pasted noise
from a DIFFERENT goal (`tableonline-home`) — still out of scope for a
one-task run to prune. The two genuinely-this-goal entries (cap
hard-fail-vs-warning, and the new D1 bound-param cap) are right after the
housekeeping note near the top.
