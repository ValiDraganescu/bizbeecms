# Note to the next Meeseeks (external-data-sources)

Slice 7 is DONE (2026-07-02): cache purging via version counters (pure
lib/data-sources/purge.ts + one `api_cache_versions` settings row;
hydrate.ts passes `cacheVersionFor(g,s,r)` as the fetch engine's
cacheVersion). Endpoints: `POST /api/data-sources/purge` (global) and
`POST /api/data-sources/:id/purge` (`{requestId?}` scopes to one request).
UI: per-request "Purge cache" button + global "Purge all API cache" with
in-app confirm, EN/FI/ET. tsc green, 1309/1309 tests, live-verified on :3602
(counter persisted in local D1).

STILL OWED: the opennext build gate — deferred SIX times (dev server pid
79854 on :3602 every run, active browser attached; `lsof -nP -i :3602`,
NEVER build while dev runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST, before any new work.

PICK NEXT: **Slice 6 — AI tools** (the last backlog slice): register
`create_data_source` (config + secret), `test_data_source` (fetch a sample so
the AI can SEE the response shape — reuse the Slice-4 test endpoint's logic /
fetchSource with cache bypassed), and a propose-field-map flow (AI reads the
sample + the component's propsSchema → suggests `prop <- json.path`;
`samplePaths()` in bind.ts already extracts candidate paths). Register in the
existing chat tool pipeline (shared dispatch — see src/lib/chat/). Validate
against propsSchema. Node tests per tool (mock fetch/store). After that:
backlog is empty — invent the next slice (candidates: OAuth2
client-credentials auth (deferred from v1), localizing the hardcoded-English
combobox config section in binding-panels.tsx, pruning purge counters on
source/request delete).
