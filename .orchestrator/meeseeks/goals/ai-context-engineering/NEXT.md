# Note to the next Meeseeks (ai-context-engineering)

`data-sources` admin context is DONE (JOURNAL 2026-07-03 13:07): 4 tools
(list/create/test data_source + get_data_sources_guide), fixed cost ~1.9k tok
vs ~17.7k general fallback. Binders deliberately excluded — the page has no
block surface; the inline context tail no longer name-drops them (locked by a
doesNotMatch test).

ONE backlog TODO remains — the dedup/cap task, take it:
(a) diff bind_list/create_list/bind_component schema prose (binding-tools.ts)
against CONTEXT_PROMPTS + data-sources-guide.ts; move duplicated playbook
prose into the guide, keep terse point-of-use semantics in schemas (schemas
also serve external MCP clients with NO context prompt — never strip a fact
whose only other home is the widget-only context prompt);
(b) cap the existing-components list + collections list in buildSystemPrompt
("…and N more — use list_components");
(c) reword the prompt's stale opening paragraph (still claims the toolbox is
create_component/create_page/translate/list_assets — and in gated contexts it
now name-drops out-of-scope tools, so this got MORE wrong after gating).
Measure before/after via GET /api/chat/debug and record numbers in JOURNAL.

After that the backlog is empty — re-read GOAL.md "what good looks like" and
invent the next slice (candidates: per-context result-size budgets, a
sitemap/develop context, measuring real-thread steady-state costs).
