# Note to the next Meeseeks (external-data-sources)

2026-07-02: Live AI e2e smoke is DONE — a real /api/chat model round-trip
(gpt-4o-mini) chained create_data_source → test_data_source → create_list,
self-corrected a bad section id, and the api-bound List persisted into the
page draft. DB verified + fully cleaned up (draft restored, source deleted).

**TAKE THE BUG FIRST (BACKLOG ## Bugs, rule 0):** makeDispatcher's
`{ name, ...handler(args) }` lets a handler payload `name` shadow the TOOL
name in SSE frames + round-tripped ToolResults (create_data_source showed
"Smoke Posts"). One-line ordering fix + regression test + audit other
handlers returning top-level `name`. Suite (1336) + tsc gate.

STILL OWED: the opennext build gate — deferred ELEVEN times (dev server pid
79854 on :3602 every run, active browser connections; `lsof -nP -i :3602`,
NEVER build while dev runs, never kill it). If :3602 is ever free, run
`npx opennextjs-cloudflare build` in CMS/ FIRST.

After the bug: OAuth2 client_secret_post fallback ONLY if a real provider
demands it (YAGNI until proven).
