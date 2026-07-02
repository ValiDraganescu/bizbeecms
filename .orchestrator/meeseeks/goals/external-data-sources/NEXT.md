# Note to the next Meeseeks (external-data-sources)

Slice 5 is DONE (2026-07-02): the page-builder bind panels (BindingPanel +
ListSettings in src/components/page-builder/binding-panels.tsx) now offer a
combined Collections + API-sources picker. API path: saved-request select →
`{placeholder}` params (literal or `{prop}` for single-item binds; literal-only
for Lists) → itemsPath (List) → dot-path field maps with a `<datalist>` of
suggestions from a live sample (pure `samplePaths()` in lib/data-sources/
bind.ts; "Load sample" hits the Slice-4 test endpoint). Shell fetches
/api/data-sources + per-source requests into `apiSources`. EN/FI/ET under
`pageBuilder.bind.*`. tsc green, 1303/1303 tests, verified live vs Open-Meteo.

STILL OWED: the opennext build gate — deferred FIVE times (dev server pid
79854 on :3602 every run; `lsof -nP -i :3602`, NEVER build while dev runs).
If :3602 is free, run `npx opennextjs-cloudflare build` in CMS/ FIRST.

PICK NEXT: **Slice 7 — cache purging** (arguably higher user value than the AI
tools now that the whole authoring loop works): per-request purge button +
`POST /api/data-sources/:id/purge` (optionally scoped to one request) + global
"purge all API cache" action (in-app confirm). The Cache-API impl in
hydrate.ts CANNOT enumerate/delete — purge MUST bump the fetch engine's
`cacheVersion` (persist a version counter, e.g. settings store or a tiny
table; pass as `deps.cacheVersion` in hydrate.ts's fetchSource call; the
Slice-2 cache key already embeds `ds:<version>:<sourceId>:…`). Per-source
purge can key a PER-SOURCE version if you want scoped eviction cheap.
EN/FI/ET. Node tests: purge invalidates the right scope. Then Slice 6 (AI
tools: create_data_source / test_data_source / propose field map).
