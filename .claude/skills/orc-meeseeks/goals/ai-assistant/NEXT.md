# Note to the next Meeseeks (ai-assistant)

DONE so far: Slice 1 (Intercom widget) + Slice 2 (page-awareness) + Slice 3 part 1 (read/discovery
tools) + Slice 3 part 2 (WRITE tools). The assistant now has the full CRUD tool catalog:
- READ: list_components, get_component, list_pages, get_page, list_locales, get_brand_identity,
  get_theme, list_builtin_types.
- WRITE: create_component/update_component, create_page/update_page_blocks, update_brand_identity,
  update_theme, translate, list_assets.
All in `CMS/src/lib/chat/{read-tools,write-tools,*-tool}.ts`, dispatched in `api/chat/route.ts`,
scoped per page in `lib/chat/tool-scopes.ts`. Every write is gated by the same validator/normalizer
its create_* sibling uses. Gates all green; PM cms-bundle regenerated.

PICK NEXT: **Slice 4 — debug panel + model picker + per-Site conversation history.** (The last
backlog item; the tool catalog is now complete.) Three independent sub-slices — do ONE per run, add
the other two as fresh TODOs and take the first:
  1. **Debug view** (smallest, do first): a toggle in the chat widget showing the ASSEMBLED system
     prompt + the ACTIVE tool list for the current context. Both are already computed server-side
     (`withSystemPrompt` + `toolsForRequest` in route.ts). Easiest path: a tiny read endpoint
     (e.g. `GET /api/chat/debug?context=...` → `{systemPrompt, tools:[names]}`) OR compute the
     tool-name list client-side via `toolsForContext(detectAdminContext(pathname))` (pure, already
     imported in the widget) + the prompt via the endpoint. Model: aicms `debug_panel.tsx`.
     Localize panel chrome EN/FI/ET.
  2. **Model picker:** confirm the model-id list source FIRST (coordinate with binding-adapters'
     REST `Ai` task — DEFAULT_MODEL is `@cf/meta/llama-3.1-8b-instruct` in route.ts; is there a
     curated CF/gateway model list to expose?). Widget sends a chosen `model` in the POST body;
     thread an optional VALIDATED `model` through (untrusted → allowlist → default DEFAULT_MODEL).
     Don't expose arbitrary strings.
  3. **Per-Site conversation history:** list past threads, open/delete. Pick the SIMPLEST store —
     a D1 table (Site already scopes the binding) is likely cleanest; KV if you prefer. Pure
     helpers tested; UI localized.

WATCH OUT (read CAVEATS): stores at `CMS/src/db/` (`@/db/*`); pure tool modules NEVER import stores/@/.
tool-scopes speaks NAMES, route owns OBJECTS (TOOL_BY_NAME) — register a new tool in all THREE
(KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + TOOL_BY_NAME) or it's dead. `update_page_blocks` uses
`validateBlocks` (page-blocks), edits blocks ONLY. `setSiteIdentity`/`setThemeOverrides` ARE the trust
gate (take unknown, normalize). Always: tsc + opennext build (dev server OFF first) + regen PM
cms-bundle on any CMS source change.
