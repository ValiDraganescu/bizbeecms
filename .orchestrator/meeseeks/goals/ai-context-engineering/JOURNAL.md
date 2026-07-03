# Journal — ai-context-engineering
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-03 12:40 — Stale-thread history compaction (thread-load only)
- **Status:** DONE
- **What I did:** New pure module `CMS/src/lib/chat/compact-stale.ts` —
  `compactStaleThreadMessages(messages, updatedAt, now)`: if the thread is >24h
  cold, each successful assistant tool card whose serialized `output` exceeds
  400 chars is replaced with a one-line stub
  (`[<name> result, X.XkB — elided from history (thread went stale); call the tool again…]`).
  Fresh threads return BY REFERENCE (byte-identical — provider cache safe);
  error cards (`ok:false`) keep their exact shape; small outputs untouched.
  Wired into the widget's thread-open path only (`openThread` in
  `chat-widget.tsx`, which also serves the on-mount resume flow): the fetched
  thread's `updatedAt` (already returned by `getThread`/the history route) is
  passed in before `chat.seed`. `build-history.ts` untouched — live turns never
  compacted. KEY FINDING: the pieces DO split — `tools` is the flat source
  replayed by `buildModelHistory`; `parts` drives the on-screen cards — so
  compacting `tools[].output` leaves reopened UI tool cards fully intact
  (except pre-`parts` legacy threads, whose cards are derived from `tools` at
  seed time and will show the stub — accepted, honest degradation).
- **Verified:** 6 new node tests in `compact-stale.test.ts` (>24h compacts;
  <24h same-reference + byte-identical; error shape preserved; small outputs +
  parts untouched; buildModelHistory replays the stub not the payload; NaN
  updatedAt = never compact). Full CMS suite 1511/1511 green; `tsc --noEmit`
  clean. Skipped `opennextjs-cloudflare build` gate — dev server live on :3602
  (CLAUDE.md forbids building while dev runs). Did not live-verify a stale
  thread in the browser (needs a >24h-old thread in local D1).
- **Files:** CMS/src/lib/chat/compact-stale.ts, compact-stale.test.ts,
  CMS/src/components/chat/chat-widget.tsx

## 2026-07-03 12:52 — Paging for all list-a-resource tools
- **Status:** DONE
- **What I did:** New pure `CMS/src/lib/chat/paging.ts` (`coercePageArgs` +
  `pagedResult`: limit/offset coercion incl. numeric strings, total count, and a
  self-correcting `hint` — "more available; call again with offset=N" / "offset
  past the end"). Wired into list_components, list_pages, list_assets (kept its
  50/200 default/max, gained offset+total), list_prompts, list_data_sources
  (pages the raw rows FIRST, then fetches saved requests only for the page).
  query_collection's tool-layer default limit dropped 1000→20 in
  `validateQuery` (collection-tools.ts — ONLY the AI-tool path; the compiler /
  REST / binding callers keep their own limits) + result gains the more-available
  hint. All 6 schemas updated with limit/offset + "Paged: result includes a
  `total`" prose — shared with /mcp, so external MCP clients get identical
  paging. Retired `coerceLimit` from list-assets-tool (replaced by shared
  helper); `formatAssetList` now shapes all rows, paging is the caller's job.
  SKIPPED as inherently bounded (per task spec, noting it): list_locales (a
  site's few locales, 207 B live), list_builtin_types (fixed builtin catalog),
  search_icons (remote Iconify search API — already limit-capped ≤100, upstream
  has no offset).
- **Measured (bytes over live MCP :3602, before → after):** query_collection
  default on a 42-row collection 27,136 → 13,276 B (≈6.8k → 3.3k tok; scales
  much bigger on 1000-row stores); list_components now 20 of 41 + hint;
  list_assets limit=3 offset=2 → 3 of 61; list_pages 1 of 13; list_data_sources
  1 of 6 (shaped keys + hasSecret-only intact); list_prompts 1 of 2.
- **Verified:** 6 new node tests in paging.test.ts; updated
  scripts/list-assets-tool.test.mjs (coerceLimit gone) +
  scripts/collection-tools.test.mjs (minimal spec now `{limit:20}`). Full suite
  1513/1513 green; `tsc --noEmit` clean; live-verified every paged tool over
  MCP on :3602. Skipped opennextjs build gate — dev server running (CAVEATS).
- **Files:** CMS/src/lib/chat/paging.ts, paging.test.ts, read-tools.ts,
  list-assets-tool.ts, prompt-tools.ts, data-source-tools.ts,
  collection-tools.ts, tool-dispatch.ts; CMS/scripts/list-assets-tool.test.mjs,
  collection-tools.test.mjs

## 2026-07-03 13:00 — Context-aware buildSystemPrompt (section gating by in-scope tools)
- **Status:** DONE
- **What I did:** `buildSystemPrompt` (site-settings.ts) gained an optional
  `tools?: readonly string[]`; when given, each base-prompt section ships only
  if a tool it explains is in scope: html-data-walk / slots-propsSchema /
  ICONS / Tailwind-tokens paragraphs → create_component|update_component;
  builtins list → create_page|update_page_blocks; existing-components list →
  either group; collections list → query_collection|bind_component|bind_list;
  list_assets line → list_assets; set_block_props para → set_block_props;
  combobox + List-layout paras → bind_list; i18n rule → prop-WRITERS only
  (authoring/composing/set_block_props — NOT bare `translate`, the rule is
  entirely about props, so settings drops it). Omitted `tools` → full prompt
  (legacy/direct callers unchanged). `assembleSystemPrompt` passes
  `toolsForContext(context)` — chat POST, export, debug GET, /mcp getPrompt,
  and get_authoring_guide all flow through it, so no fork. Opening paragraph
  intentionally untouched (stale-4-tools reword belongs to the dedup TODO).
- **Measured (live :3602 debug endpoint, chars/4; baseline from GOAL.md):**
  media 5,200→545 tok; settings 5,250→579; collections 5,400→911;
  components 5,300→4,108; pages 5,600→4,324; page-builder ~5,955 and
  general ~5,194 unchanged (all sections in scope) — target "media/settings/
  collections → 1–2k, building contexts lose nothing" beaten.
- **Verified:** 5 new gating tests in scripts/site-settings.test.mjs (media/
  settings/collections drops, general byte-identical to ungated, page-builder
  keeps everything); full suite 1518/1518; `tsc --noEmit` clean; live probes on
  ?context=media confirm assets line + identity kept, authoring prose gone.
  Skipped opennextjs build gate — dev server running (CAVEATS).
- **Files:** CMS/src/lib/settings/site-settings.ts,
  CMS/src/lib/chat/assemble-prompt.ts, CMS/scripts/site-settings.test.mjs

## 2026-07-03 13:07 — New `data-sources` admin context
- **Status:** DONE
- **What I did:** Added "data-sources" to AdminPageContext + KNOWN_CONTEXTS
  (tool-scopes.ts) so /admin/data-sources no longer falls through to `general`.
  Scoped TOOLS_BY_CONTEXT to the source workflow ONLY: list_data_sources,
  create_data_source, test_data_source, get_data_sources_guide. Binder tools
  (bind_component/create_list/bind_list/create_form/bind_form) deliberately
  EXCLUDED — read the page first per task spec: DataSourcesManager manages
  sources + saved requests + test calls, no page/block surface, and binders are
  unusable without get_page/list_pages which would balloon scope back toward
  general. New short CONTEXT_PROMPT leans on get_data_sources_guide and
  redirects binding work to Page Builder/Pages. Aligned the inline context
  block's tail (data-sources-context.ts) to stop name-dropping the now
  out-of-scope binders.
- **Measured (live :3602):** debug?context=data-sources → 4 tools, prompt 672
  tok (section gating drops everything authoring-related);
  toolSchemasForContext("data-sources") = 4,938 chars ≈ 1,235 tok. Fixed cost
  ~1.9k tok vs ~17.7k before (42-tool general fallback).
  debug?pathname=/admin/data-sources detects the new context; general unchanged
  (42 tools). /mcp tools/list still serves the full catalog by design (context
  only shapes getPrompt there).
- **Verified:** tsc --noEmit clean; full suite 1519/1519 (1 new contextPrompt
  test + new scope/detect/isAdminContext assertions in tool-scopes.test.mjs +
  a doesNotMatch binder lock in data-sources-context.test.ts). Chip/send path:
  only a string literal changed in the store; detection + POST-route context
  resolution share resolveRequestContext, live-verified via the debug GET.
  admin-nav drift locks don't key off contexts — no change needed. Skipped
  opennextjs build gate — dev server running (CAVEATS).
- **Files:** CMS/src/lib/chat/tool-scopes.ts, data-sources-context.ts,
  data-sources-context.test.ts; CMS/scripts/tool-scopes.test.mjs
