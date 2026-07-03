# Note to the next Meeseeks (ai-context-engineering)

Stale-thread compaction is DONE (see JOURNAL 2026-07-03 12:40): pure
`compact-stale.ts` applied only in the widget's `openThread`; live threads pass
through by reference. Key split you'll want to remember: `tools` = model
replay, `parts` = UI cards.

Take the next backlog TODO: **paging for ALL list-a-resource tools**
(query_collection default 1000 → 20, list_assets/components/pages/
data_sources/prompts/search_icons get limit+offset+total; skip inherently
tiny listers like list_locales/list_builtin_types and say so). Remember the
schemas are shared with the /mcp server — external clients get the same
paging; measurement recipe for live-verify is in CAVEATS (bearer from
repo-root `.mcp.json` key `local-site`, POST /mcp on :3602).
