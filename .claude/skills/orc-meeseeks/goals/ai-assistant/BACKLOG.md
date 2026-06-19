# Backlog — ai-assistant
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- DONE: **Tool-call round-tripping (multi-turn tool loop).** New `streamChatRounds` in
  `lib/chat/reframe.ts` drives turns: stream → run tools → feed assistant `tool_calls` + each
  `role:"tool"` result back → re-ask, until a turn calls no tool (final answer) or maxRounds(4).
  Route `runTools`→`runToolsRound` (frames `tool` events AND returns ToolResult[]); POST uses a
  `turn(msgs)` closure (same model/tools/gateway each round). `reframe` kept for back-compat.
  Tests: reframe-rounds 4 (incl. result-fed-back proof + maxRounds cap), reframe/sse 21 back-compat.
  Gates green; cms-bundle regen.
- DONE: **Programmatic AI-translate endpoint (reuse the EXISTING translate tool + the AI Gateway).** A
  button-driven "translate these fields to all content locales" path that is NOT a chat conversation. What
  already exists: `lib/chat/translate-tool.ts` (`CREATE_TRANSLATION_TOOL`, `validateTranslationInput`,
  `mergePageFields`) + `db/translate-store.ts` `applyTranslation(input)` (merges `{loc:text}` maps into the
  page/component) — but it's ONLY reachable when the LLM decides to call it mid-chat. ADD a direct path:
  `POST /api/translate` that takes `{kind:"page"|"component", target, fields, fromLocale, toLocales?}`
  (default toLocales = the Site's content locales minus the source), calls the AI MODEL through the SAME AI
  Gateway the assistant uses (binding-adapters `Ai`/REST path — do NOT add a second model client) to produce
  each locale's text, validates via `validateTranslationInput`, and writes via the EXISTING
  `applyTranslation`. Return the produced `{loc:text}` maps so callers can show them for optional review.
  This is the reusable engine BOTH the page-builder AI-translate button (page-builder goal) and the chat
  tool sit on. Mock the model in a node test (request shape + merge); no live API in tests. Gate: CMS tsc +
  opennext build green; regen PM cms-bundle. EN/FI/ET for any user-facing string.
> ASSISTANT = page-aware Intercom widget over the EXISTING chat backend. Reference: aicms
> `src/modules/admin-chat/` (`chat_widget.tsx`, `debug_panel.tsx`, `lib/chat/{tool_scopes,assemble_prompt,
> tool_executor,chat_tools}.ts`). Read CAVEATS for what bizbee already has + tool portability. The model
> transport is the binding-adapters REST-`Ai` task — this goal consumes it, doesn't build it.

- DONE: **Slice 1 — Intercom-style chat widget shell.** Floating bottom-right bubble in `SidebarShell`,
  opens a compact panel over any /admin/* page (open/close/minimize; transcript survives minimize). Shared
  chat core extracted to `components/chat/chat-conversation.tsx` (`useChat` + `ChatConversation`); both the
  widget and the full-page `/admin/chat` render it — ONE pipeline, no fork. Widget hidden on `/admin/chat`.
  `chat.widget.*` i18n EN/FI/ET. Gates green (tsc, opennext, cms-bundle regen + selfcheck).
- DONE: **Slice 2 — page-awareness: per-page system prompt + scoped tools.** Port aicms
  `lib/chat/tool_scopes.ts`: a `detectAdminContext(url)` (strip `/<locale>/` prefix, read the segment after
  `admin` → page-builder | components | pages | settings | general), a per-context prompt addition, and a
  per-context tool subset. The widget sends its current page context (or URL) with each request; the chat
  route assembles `buildSystemPrompt` + the context prompt and exposes only that context's tools. Pure
  helpers (`detectAdminContext`, `toolsForContext`, `contextPrompt`) with node tests. ONLY wire contexts
  whose tools already have backends (see CAVEATS — start with what exists: components, pages, settings).
  Gate: CMS tsc + opennext build green; regen PM cms-bundle. EN/FI/ET.
- DONE: **Slice 3 part 1 — read-only discovery tools.** Added `list_components`, `get_component`,
  `list_pages`, `get_page`, `list_locales`, `get_brand_identity`, `get_theme` (new pure
  `lib/chat/read-tools.ts` + route dispatch/handlers + tool-scopes registration). Each backed by an
  existing store (listComponents/getComponentByName/listPages/getPageById/getContentLocales/
  getSiteIdentity/getThemeOverrides[Dark]). Settings context now reads brand/theme/locales; page-builder +
  components + pages contexts gained discovery. Node tests (read-tools 4 + tool-scopes refreshed). Gates green.
- DONE: **Slice 3 part 2 — the WRITE tools (untrusted artifacts, validate like create_*).**
  Added `update_component` (`validateComponentArtifact`+`upsertComponent`), `update_page_blocks`
  (`validateBlocks`+`missingComponents`+`setPageBlocks` — blocks only, never meta),
  `update_brand_identity` (`setSiteIdentity` normalizes = trust gate), `update_theme`
  (`setThemeOverrides[Dark]` normalize tokens+colors = trust gate), `list_builtin_types` (static —
  only `Section` exposed; `__section_column__` stays internal). New pure `lib/chat/write-tools.ts`
  (schemas + builtinBlockTypes/splitThemeArgs/coerceIdentityArg) + route dispatch/handlers +
  tool-scopes registration (KNOWN_TOOL_NAMES + scopes + TOOL_BY_NAME — all three). Node tests
  (write-tools 5 + tool-scopes refreshed). Gates green.
- DONE: **Slice 4 sub-slice 1 — debug view.** Widget DEBUG toggle showing the assembled system prompt
  (`GET /api/chat/debug`, reusing the new shared `assembleSystemPrompt`) + the active tool list (pure
  `toolsForContext`) for the current context (aicms `debug_panel.tsx`). New `lib/chat/assemble-prompt.ts`
  (shared prompt builder, no fork) + pure `resolveRequestContext` (both routes' untrusted→context
  contract) + `components/chat/chat-debug-panel.tsx`. i18n `chat.debug.*` EN/FI/ET. Gates green.
- DONE: **Slice 4 sub-slice 2 — model picker.** New pure `lib/chat/models.ts`
  (`DEFAULT_MODEL` + curated `CHAT_MODELS` allowlist + `isKnownModel`/`resolveModel`); route
  reads untrusted `body.model` → `resolveModel` → `ai.chat({model})` (never 400); `useChat`
  gained optional `getModel`; widget `<select>` in the `footer` seam; i18n `chat.widget.model`
  EN/FI/ET. Tested (models.test.mjs, 4). Gates green; cms-bundle regen. Confirm the model-id list source FIRST (coordinate with
  binding-adapters' REST `Ai` task — DEFAULT_MODEL is `@cf/meta/llama-3.1-8b-instruct` in route.ts; is
  there a curated CF/gateway list to expose?). Widget sends a chosen `model` in the POST body; thread an
  optional VALIDATED `model` through (untrusted → allowlist → default DEFAULT_MODEL). No arbitrary strings.
  Pure allowlist helper tested; UI localized EN/FI/ET. Gate: CMS tsc + opennext build; regen PM cms-bundle.
- DONE: **Slice 4 sub-slice 3 — per-Site conversation history.** D1 `chat_thread` table (migration 0005)
  + pure `lib/chat/history.ts` (deriveTitle/validateThreadInput/parseStoredMessages/newThreadId) +
  `db/chat-history-store.ts` (list/get/save-upsert/delete) + REST `GET/POST/DELETE /api/chat/history`
  (admin-only) + `useChat` `seed`/`reset` + widget new/history panel (open/delete) saving on the
  busy→idle edge per turn. i18n `chat.widget.{new,history,historyEmpty,historyUntitled,historyDelete}`
  EN/FI/ET. Tested (history.test.mjs, 7). Gates green; cms-bundle regen. List past threads, open/delete. Pick the
  SIMPLEST store — a D1 table (Site already scopes the binding) is likely cleanest; KV if preferred. Save
  threads on send; load/list/delete in the widget. Pure helpers tested; UI localized EN/FI/ET. Gate: CMS
  tsc + opennext build; regen PM cms-bundle.
- TODO: **Searchable model picker over the FULL AI Gateway catalog (grouped by provider, price-sorted).**
  USER 2026-06-19: the picker today is a plain `<select>` over a 3-model allowlist (`lib/chat/models.ts`
  `CHAT_MODELS` = 3 `@cf/...` ids; rendered in `components/chat/chat-widget.tsx` ~245). User wants EVERY model
  available in the AI Gateway, in a CUSTOM select that (1) supports SEARCH/filter, (2) groups by PROVIDER
  (section per provider), (3) within each provider section orders LOW→HIGH price. This REPLACES the 3-model
  allowlist with a real catalog.
  - DEPENDS ON the binding-adapters REST-`Ai` task: that switches addressing to the gateway's `provider/model`
    ids (e.g. `openai/gpt-4.1`) instead of the Workers-AI-binding `@cf/...` ids. Build the catalog on the
    `provider/model` scheme; don't keep the `@cf/...` allowlist. If that task isn't landed yet, this is
    BLOCKED on it — note so and pick another task.
  - CATALOG SOURCE (RESOLVED by curator 2026-06-20 — there IS a real API, cache it; user asked to "cache the
    data in the DB once or twice a day"): Cloudflare's list-models endpoint is
    `GET https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/models/search`
    (auth `Bearer $CF_API_TOKEN` — the SAME creds the binding-adapters REST `Ai` task injects; supports
    `task`, `search`, `per_page`, `hide_experimental`, pagination). Each model carries: `name` (the `@cf/...`
    id), `description`, `deprecated`, `task: {name}` (USE `task.name` as the grouping axis — there's no
    "provider" field; the realistic grouping is by TASK, e.g. "Text Generation", or by the vendor segment of
    the id `@cf/<vendor>/...` — pick vendor-from-id for a provider-like grouping and note the choice), and
    `properties[]` with `{property_id:"price", value:[{unit:"per M input tokens", price, currency}]}`
    (the per-input-token price = the SORT KEY; some models have no price → sort them last). Confirmed shape
    against the nightly public mirror `https://ai-cloudflare-com.pages.dev/api/models`.
    - IMPORTANT SCOPE LIMIT: this endpoint returns WORKERS-AI models ONLY (`@cf/...`, incl. CF-hosted
      openai/llama). The unified AI-Gateway multi-provider catalog (direct OpenAI/Anthropic via the gateway)
      is NOT exposed by any API — those, if wanted, stay a small curated supplement merged on top. Start with
      the CF list (it's the real catalog behind the gateway today); note the gap.
    - CACHE in D1: a `model_catalog` table (or a single JSON row) populated by a refresh that runs at most
      once/twice a day. Implement refresh as a `GET /api/chat/models` route that serves the cached rows and
      re-fetches when the cache is older than ~12h (lazy refresh on read — simplest; ponytail: no Cron needed,
      add a scheduled handler only if lazy refresh proves too laggy). Filter OUT `deprecated` and
      non-text-generation tasks (the assistant needs chat models). Map to `{ provider, id, label, price }`
      at the boundary so the UI stays clean.
  - PURE HELPERS (node-tested): `parseModelCatalog(apiJson)` (extract id/task/price from the `properties`
    shape, drop deprecated/no-price-where-required), `groupByProvider(catalog)`, `sortByPrice(group)`
    (ascending, null price last), `filter(query)`. `resolveModel` must accept ANY cached-catalog id now
    (not just the old 3) — keep the untrusted→known→default guard, validating against the cached set.
  - UI: a small IN-HOUSE combobox (search input + grouped, scrollable option list with provider headers +
    keyboard nav) using design-system tokens. Do NOT add a dropdown/combobox dependency for this. Replace the
    `<select>` in the widget footer.
  - EN/FI/ET for the picker chrome (search placeholder, "no results", any provider-header label). Gate: CMS
    tsc + opennext build green; regen PM cms-bundle.
