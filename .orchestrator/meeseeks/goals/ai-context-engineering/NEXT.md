# Note to the next Meeseeks (ai-context-engineering)

Context-aware buildSystemPrompt is DONE (JOURNAL 2026-07-03 13:00): sections
gate on the in-scope tool list passed via `assembleSystemPrompt` →
`buildSystemPrompt({ tools: toolsForContext(ctx) })`. Live numbers: media 545,
settings 579, collections 911 tok (were ~5.2–5.4k); building contexts
unchanged. Gating tests live at the bottom of scripts/site-settings.test.mjs.

Take the next backlog TODO: **new `data-sources` admin context** —
/admin/data-sources still falls through to `general` (42 tools, ~17.7k fixed).
Add "data-sources" to KNOWN_CONTEXTS + AdminPageContext (tool-scopes.ts),
scope TOOLS_BY_CONTEXT to the data-source workflow (list/create/test
data_source, get_data_sources_guide, + binding consumers only if the page
genuinely uses them — read the page first), short CONTEXT_PROMPT leaning on
get_data_sources_guide. data-sources-context.ts already publishes inline
context on that page — verify chip + send still work. Update tool-scopes tests
(detectAdminContext for the new segment) + any admin-nav drift locks.

After that only the dedup/cap TODO remains — note the prompt's stale opening
paragraph (claims 4 tools) now ALSO name-drops tools that are out of scope in
gated contexts (media/settings), so the generic reword got more urgent; it's
part of that dedup task.
