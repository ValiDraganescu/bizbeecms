# Goal: ai-context-engineering
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Right-size the CMS AI assistant's context: the model gets exactly what it needs,
when it needs it — never bloat, never starvation. The user's framing (2026-07-03):
"not too much context, not too less context, but exactly what it needs, when it
needs it. I do not want to bloat the system prompt with things that the AI
Assistant will not use."

## Baseline measurements (2026-07-03, live on :3602; tokens ≈ chars/4)

Per-request fixed cost (system prompt + tool schemas), via
`GET /api/chat/debug?context=<ctx>` + MCP `tools/list`:

| Context | Prompt | Tools | Schemas | Total |
|---|---|---|---|---|
| general (fallback) | ~5,200 tok | 42 | ~12,500 tok | ~17,700 tok |
| page-builder | ~5,950 | 26 | ~9,700 | ~15,700 |
| pages | ~5,600 | 20 | ~8,200 | ~13,800 |
| components | ~5,300 | 10 | ~2,300 | ~7,600 |
| collections | ~5,400 | 8 | ~1,900 | ~7,300 |
| settings | ~5,250 | 6 | ~800 | ~6,100 |
| media | ~5,200 | 2 | ~400 | ~5,600 |

Real tool-result sizes (replayed verbatim in history forever, no truncation):
get_page(home) ~4,700 tok; query_collection(content_restaurants, default
limit 1000) ~6,800 tok; get_authoring_guide ~6,200 tok;
get_data_sources_guide ~1,600 tok. Biggest schema outliers: bind_list ~1,684
tok, create_list ~959, bind_component ~755.

Base-prompt breakdown (general): component-authoring rules ~1,500 tok,
List/combobox/set_block_props guidance ~590 tok, existing-components list
~1,900 tok (41 components, uncapped), builtins ~450 tok, i18n rule ~235 tok,
collections list ~185 tok. `buildSystemPrompt` is context-blind — only the
`contextPrompt` addition (~200–760 tok) varies per context, so ~60–75% of the
prompt is dead weight outside the three page-building contexts.

## What good looks like

- Loading a chat thread that's gone cold (>24h old) compacts stale tool
  results to one-line stubs; LIVE threads are NEVER mutated mid-conversation
  (user directive: mutating replayed history breaks provider prompt caching
  and costs MORE). Steady-state old-thread reopen cost drops by tens of
  thousands of tokens.
- Every list-a-resource tool pages: small default limit + total count, model
  can ask for more. No 6,800-token accidental discovery calls.
- The base system prompt is context-aware: each section ships only where its
  tools are in scope. Media/settings/collections contexts drop to roughly
  1–2k prompt tokens.
- /admin/data-sources has its own scoped context (~8 tools) instead of
  falling through to general (42 tools).
- No fact is paid for three times (tool schema + context prompt + on-demand
  guide say complementary things, not the same thing); the component list in
  the prompt is capped with an "…and N more" overflow; the prompt's opening
  paragraph no longer claims only 4 tools exist.
- The keep-forever invariants hold: debug endpoint shows exactly what ships
  (no fork), inline context stays in the user message (system prompt stays
  cache-stable), write-only secrets never appear anywhere, self-correcting
  errors philosophy intact.
