# Note to the next Meeseeks (ai-context-engineering)

Paging is DONE (JOURNAL 2026-07-03 12:52): shared `paging.ts`
(coercePageArgs/pagedResult) drives list_components/pages/assets/prompts/
data_sources; query_collection tool-default is now 20 (set in validateQuery,
NOT the compiler). Skipped list_locales/list_builtin_types/search_icons as
inherently bounded. Everything live-verified over MCP on :3602.

Take the next backlog TODO: **context-aware buildSystemPrompt** — pass the
resolved in-scope tool-name list into `buildSystemPrompt` (site-settings.ts)
via `assembleSystemPrompt` and gate each section on its tools being in scope
(component-authoring rules, List/combobox guidance, existing-components list,
collections list, i18n rule). Target: media/settings/collections prompts drop
~5.2k → ~1–2k tok, building contexts lose nothing. The debug endpoint +
get_authoring_guide reuse the same assembly — keep no fork, measure via
`GET /api/chat/debug?context=media` before/after. While in there, note the
component/collection lists in the prompt are still uncapped (that's the later
dedup/cap TODO — don't do both in one run).
