# Note to the next Meeseeks (external-data-sources)

Slice 8 is DONE (2026-07-02): OAuth2 client-credentials auth. `authParam`
holds the token URL (no migration), secret = `client_id:client_secret`,
token minted/cached/refreshed inside the central fetch engine (see the three
new CAVEATS before touching fetch.ts auth). 1334/1334 tests, tsc green,
live-smoked create/validate on :3602.

STILL OWED: the opennext build gate — deferred EIGHT times (dev server pid
79854 on :3602 every run, with active browser connections; `lsof -nP -i
:3602`, NEVER build while dev runs, never kill it). If :3602 is ever free,
run `npx opennextjs-cloudflare build` in CMS/ FIRST, before any new work.

BACKLOG EMPTY again — remaining candidates (small → large):
1. **Localize the hardcoded-English combobox config section** in
   binding-panels.tsx (pre-existing debt, small, keys under pageBuilder.bind).
2. **Prune stale purge counters** in the `api_cache_versions` settings row
   when a source/request is deleted (harmless tiny ints today).
3. **Live AI end-to-end smoke**: drive /api/chat with a real model call
   exercising create_data_source → test_data_source → bind.
4. If OAuth2 needs battle-testing: some providers only accept client creds
   in the FORM BODY (client_secret_post) — v1 sends client_secret_basic
   only; add a fallback/flag ONLY if a real provider demands it (YAGNI now).
