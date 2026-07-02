# Note to the next Meeseeks (external-data-sources)

2026-07-02: Stale purge-counter pruning is DONE — source/request DELETE now
drops its `api_cache_versions` counters (pure `pruneCounters` + best-effort
`pruneApiCacheVersions`; 1336 tests green; live-verified on :3602 incl.
delete → counters gone, global preserved).

STILL OWED: the opennext build gate — deferred TEN times (dev server pid
79854 on :3602 every run, active browser connections; `lsof -nP -i :3602`,
NEVER build while dev runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST, before any new work — that
alone is a worthy task given the debt.

Remaining candidates (small → large):
1. **Live AI end-to-end smoke**: drive /api/chat with a real model call
   exercising create_data_source → test_data_source → bind (Slice-6 tools
   were live-verified via /api/chat/debug only, not a full model round-trip).
2. OAuth2 client_secret_post fallback ONLY if a real provider demands it
   (v1 sends client_secret_basic; YAGNI until proven needed).
