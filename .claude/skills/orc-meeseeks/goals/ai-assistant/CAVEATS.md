# Caveats — ai-assistant
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- WHAT ALREADY EXISTS in bizbee (don't rebuild): the assistant backend is live —
  `CMS/src/app/api/chat/route.ts` (prepends a system prompt via `buildSystemPrompt` — Site identity +
  components + utility classes — unless the client sent a system message), `lib/chat/` has
  `reframe.ts` (SSE), `page-tool.ts` (`create_page`), `component-tool.ts` (`create_component`),
  `translate-tool.ts` (`translate`), `list-assets-tool.ts`, `sse.ts`/`client-sse.ts`. Settings stores
  exist for brand / content-locales / theme (`db/settings-store.ts`). The model call goes through the
  binding-adapters `Ai` port (`lib/ports/ai.ts`).

- TOOL PORTABILITY (from aicms `lib/chat/chat_tools.ts` + `tool_scopes.ts`): aicms is an ART-GALLERY CMS.
  Its ARTWORK / PRODUCT / DISCOUNT / ORDER tool groups have NO bizbeecms equivalent — DO NOT port them.
  PORTS to bizbee (structural CMS tools):
    • Component: create_component (HAVE), update_component, get_component, list_components.
    • Page-builder: create_page (HAVE), update_page_blocks, list_pages, get_page, list_builtin_types.
    • Brand/design/theme: get_brand_identity/update_brand_identity (brand store exists),
      get_theme/update_theme (theme store exists), get_design_system/update_design_system (only if a
      design-system store exists — CHECK first), list_locales (content-locales store exists).
  Verify each backend (store/route) exists in bizbee BEFORE exposing a tool; a tool with no backend is a
  dead tool. aicms's component model also has slots / entity-picker / tag-filter field types — those map
  to the page-builder goal's props-schema work; coordinate, don't fork.

- DEPENDENCY: the model transport is the binding-adapters "AI assistant via Cloudflare AI REST API" task.
  This goal CONSUMES the `Ai` port — do NOT re-implement the model call or the gateway here.

- The page-aware switch is URL-driven in aicms (`detect_admin_context` strips the locale prefix, finds the
  segment after `admin`). bizbee admin routes are `/<locale>/admin/<page>` — same shape, port the parser.

- Standing project rules (see main/CAVEATS): CF-native, REST + fetch, NO server actions for AI; EN/FI/ET
  i18n parity; gate every change on CMS tsc + `opennextjs-cloudflare build`; regen the PM cms-bundle when
  CMS render/runtime changes (watch the cross-loop bundle guardrail).

- The `Ai` port (`lib/ports/ai.ts`) ONLY does STREAMING chat (`chat()` → SSE `ReadableStream`). For a
  NON-streaming/programmatic model call, don't add a second client — drain the stream with
  `collectStreamText` (lib/chat/translate-request.ts), which reuses `SseDeltaParser`. Small CF models wrap
  JSON answers in prose/```json fences, so parse with a balanced-brace JSON extractor (see
  `extractFirstJsonObject`), not `JSON.parse(wholeText)`.

- `applyTranslation` (db/translate-store) only supports `kind:"page"` — it REJECTS `kind:"component"`
  with a clear message (component text lives in block props at the page use-site). So `/api/translate`
  with a component target will 422 by design until component-target translation is built. Page fields:
  `metaTitle`, `metaDescription`, or `<blockId>.<propName>`.

- `/api/translate` strings are NOT user-facing chrome (it's a backend endpoint returning JSON), so no
  i18n strings were added this slice. The page-builder AI-translate BUTTON that calls it must localize
  its own UI (EN/FI/ET) in the page-builder goal.

- CHAT UI is now ONE shared core: `components/chat/chat-conversation.tsx` (`useChat` hook owns the
  fetch/SSE; `ChatConversation` is the transcript+form with `transcriptClassName`/`footer` seams).
  BOTH `chat-widget.tsx` (floating bubble in `SidebarShell`) and the full-page `admin-chat.tsx` render
  it. DO NOT add chat-transport logic to either surface — extend `useChat`/`ChatConversation`. The
  widget is mounted once in `SidebarShell` and HIDDEN on `/admin/chat` (else two copies of the same
  conversation). `chat.widget.*` i18n keys exist in en/fi/et.

- PAGE-AWARENESS lives in PURE `lib/chat/tool-scopes.ts` (Slice 2): `detectAdminContext`,
  `isAdminContext`, `toolsForContext`, `contextPrompt`. It speaks tool NAMES (strings), NOT tool
  objects — the route (`api/chat/route.ts`) owns `TOOL_BY_NAME` and maps names→objects so the pure
  module stays node-testable (no @/ alias / React / D1 imports). When Slice 3 adds tools: add the
  name to `KNOWN_TOOL_NAMES`, slot it into the right `TOOLS_BY_CONTEXT` entries, AND add it to the
  route's `TOOL_BY_NAME` — all three or the tool is dead. `usePathname()` in bizbee returns the path
  WITHOUT the locale prefix (cookie i18n), so `detectAdminContext` does NOT strip a locale segment
  (aicms did). Only contexts whose tools EXIST today are wired; `/admin/sitemap` → general on purpose.

- The chat route now accepts an OPTIONAL `context` (or `pathname`) in the POST body via
  `resolveContext` — it is NEVER a 400 (untrusted → validated/detected → defaults to "general" =
  full toolset). The full-page `/admin/chat` sends no context → general, behavior unchanged. The
  widget sends its page context (read fresh per `send` so navigating mid-chat re-scopes). Do NOT add
  `context` to `parseChatBody` (that's the strict messages contract); keep it separate/optional.

- STORES LIVE AT `CMS/src/db/` (NOT `src/lib/db/`). The chat tools import them via the `@/db/*` alias
  (`@/db/component-store`, `@/db/page-store`, `@/db/settings-store`, `@/db/translate-store`,
  `@/db/asset-store`). Pure tool modules (read-tools.ts, *-tool.ts) must NOT import stores or @/ —
  they stay node-testable; the ROUTE imports the stores and the pure module only shapes/validates.

- Slice 3 part 1 (read tools) DONE: `read-tools.ts` holds 7 read schemas + `coerceIdArg`,
  `formatComponentList`, `formatPageList`. Backing store fns confirmed to exist: component-store
  `listComponents`/`getComponentByName`; page-store `listPages`/`getPageById` (PageSummary, no blocks —
  metadata only); settings-store `getContentLocales`/`getSiteIdentity`/`getThemeOverrides`/
  `getThemeOverridesDark`. For WRITE tools (part 2): page-store `setPageBlocks`/`upsertPageMeta`,
  component-store `upsertComponent`, settings-store `setSiteIdentity` (normalizes)/`setThemeOverrides[Dark]`
  (normalize to known tokens + safe colors = the trust gate, pass model map straight in).

- SYSTEM PROMPT now has ONE builder: PURE-context logic stays in `tool-scopes.ts`, but the actual
  prompt ASSEMBLY (Site identity + components + utility classes + contextPrompt, with defensive D1
  reads) lives in `lib/chat/assemble-prompt.ts` `assembleSystemPrompt(context)` (NOT pure — owns @/db
  + @/lib imports). BOTH `api/chat/route.ts` (POST `withSystemPrompt`) and `api/chat/debug/route.ts`
  call it — do NOT inline a second copy or the debug view drifts from what the model actually gets.
  Untrusted→context resolution is the PURE `resolveRequestContext(context, pathname)` in tool-scopes.ts
  (explicit valid context wins → detect pathname → "general"); both routes use it. The debug panel
  (`components/chat/chat-debug-panel.tsx`) computes the tool list CLIENT-side (pure toolsForContext) and
  fetches only the prompt from `GET /api/chat/debug` (admin-only — it reveals the system prompt).

- Slice 3 part 2 (write tools) DONE: `lib/chat/write-tools.ts` (pure: 5 schemas + builtinBlockTypes/
  splitThemeArgs/coerceIdentityArg). `update_page_blocks` edits ONLY the block tree via `setPageBlocks`
  (NEVER metadata — that's create_page/page-meta). It validates the tree with `validateBlocks`
  (lib/pages/page-blocks) NOT `validatePageInput` — `validateBlocks` already drops the reserved
  `Section`/`__section_column__` names before the `missingComponents` check, so a page using Sections
  won't 409. `update_component` is `create_component`'s validate+upsert under a new name (upsert updates
  in place by name). `setSiteIdentity`/`setThemeOverrides[Dark]` take `unknown` and ARE the trust gate
  (normalize internally) — the route only checks an object was supplied, doesn't re-validate the shape.
  `list_builtin_types` exposes ONLY `Section`; `__section_column__` is Section-internal — never expose it.

- MODEL allowlist is the PURE `lib/chat/models.ts` (`DEFAULT_MODEL` + `CHAT_MODELS` +
  `isKnownModel`/`resolveModel`). The `Ai` port (`lib/ports/ai.ts`) exposes NO curated model list, so
  it's a small hard-coded allowlist of CF Workers-AI TOOL-CAPABLE models. Do NOT re-declare a model id
  in the route or widget — import from this module so route + picker share ONE list. The route reads
  UNTRUSTED `body.model` → `resolveModel` (allowlist → default) → `ai.chat({model})`: NEVER a 400 (same
  contract as `context`); arbitrary ids never reach `env.AI.run`. The widget threads it via
  `useChat(getContext, getModel)` — `getModel` is read fresh per send (like `getContext`), and the
  `<select>` lives in `ChatConversation`'s `footer` seam (don't add transport logic to the widget).

- HISTORY (Slice 4 sub-slice 3) DONE. Threads persist in a NEW D1 table `chat_thread` (migration
  `0005_wonderful_ultragirl.sql` — `drizzle-kit generate` from `CMS/`; apply with
  `wrangler d1 migrations apply <name>`). Only role/content TEXT is stored — tool cards are NOT
  persisted (re-derived client-side; a loaded assistant turn comes back with empty `tools`).
  Pure shape/validation is `lib/chat/history.ts` (node-tested); the store `db/chat-history-store.ts`
  is the binding layer; the route `api/chat/history` is admin-only. SAVE is best-effort from the
  CLIENT on the busy→idle EDGE (a `busyRef` in chat-widget) — NOT inside the SSE route (the full
  assistant text only accumulates client-side, so saving server-side mid-stream is awkward; don't
  try to move it there). `saveThread` upserts by id and MINTS an id when null, returning it so the
  widget keeps re-saving the same thread (threadId ref). `useChat` now exposes `seed(messages)` +
  `reset()` — use those to load a thread / start fresh; do NOT add another setMessages path.

- ROUND-TRIPPING (tool result → model) DONE. The chat loop is now MULTI-TURN: `streamChatRounds`
  (lib/chat/reframe.ts), NOT `reframe`, drives the route. It streams a turn, runs its tools, and if
  any ran feeds the assistant `tool_calls` message + one `role:"tool"` result per call back into a
  fresh `ai.chat()` (the `turn(msgs)` closure in route.ts re-uses the SAME model/tool-scope/gateway
  every round so the page's tool set persists). Loop ends when a turn calls NO tool (final answer) or
  `maxRounds`(4) is hit (last round's tools still run, just no follow-up). `reframe` (single pass)
  stays ONLY for back-compat + its 6 tests — don't route through it. The route's tool runner is now
  `runToolsRound(calls,…)` which BOTH frames `tool` events AND RETURNS `ToolResult[]` (via a
  collect/emit wrapper); every handler must emit EXACTLY ONE result (a `before`-length guard
  synthesizes one if a handler emits nothing, else tool_call_id↔result pairing desyncs). When adding a
  tool handler keep the one-emit-per-call invariant. `streamChatRounds` uses `start()` (producer-driven
  SSE) — tokens still stream live because `consumeTurn` enqueues each delta as it arrives from upstream.
  Workers AI's OpenAI-compat endpoint accepts the extra `tool_calls`/`tool_call_id`/`name` fields (the
  route casts `TurnMessage[]`→`{role,content}[]` for the `Ai` port type only; runtime forwards them).

- THREAD RESUME (mount restore) DONE: `chat-widget.tsx` remembers the active thread id in
  `sessionStorage["bizbee.chat.threadId"]` (PER-TAB on purpose — two tabs mustn't fight over one
  thread). A run-once mount effect resumes it, else falls back to `GET /api/chat/history` threads[0],
  then `await openThread(id)`. It only restores when `threadId.current === null` (don't clobber an
  in-flight convo). Keep `sessionStorage` writes in sync on EVERY threadId change: save effect +
  `openThread` set it, `forgetThread()` clears it (called by new/delete-of-current). All storage
  access is try/catch-wrapped (private mode). `openThread` is a hoisted function decl so the mount
  effect can call it before its textual definition — keep it a declaration, not a const arrow.

- PRE-EXISTING FAILING TEST (NOT this goal): `page-blocks-sections.test.ts` →
  "planPage renders a Section as a grid of columns" expects `repeat(2, 1fr)` but gets
  `repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`. Introduced by the page-builder "responsive
  Section columns" change (commit fc0b2e7) — the test wasn't updated. Fails on a clean tree, so
  the full CMS suite is 416/417. It's a PAGE-BUILDER goal bug; flag it there, don't fix it here.

- MODEL CATALOG (searchable picker) DONE. The picker is now backed by the FULL Workers-AI
  catalog, not the 3-id allowlist. Key facts:
  - GROUPING AXIS = vendor-from-id (`@cf/<vendor>/...` → `providerOf`), NOT a "provider"
    field — the CF list-models API has NO provider field (it has `task.name`). Chose vendor-
    from-id for a provider-like grouping (spec said "pick one + note it"). If you ever want
    task-based grouping, the data's there in `task.name`.
  - CACHE reuses the GENERIC `site_settings` table (one `model_catalog` JSON row
    `{fetchedAt, models}`) — NO new D1 table / migration. `getModelCatalogCache`/
    `setModelCatalogCache` in `db/settings-store.ts`. Lazy refresh on read when >12h old
    (`GET /api/chat/models`); ponytail: no Cron — add a scheduled handler only if laggy.
  - LIVE FETCH needs `env.CF_ACCOUNT_ID` + `env.CF_API_TOKEN` (the deployer must inject them
    per-Site — the SAME creds binding-adapters' REST `Ai` uses). They are NOT in wrangler.jsonc
    vars yet; when absent the route serves the STATIC `CHAT_MODELS` fallback (never empty,
    never throws). If the live catalog never appears in a deployed CMS, that's the missing
    var — coordinate with the deployer / binding-adapters task to add CF_ACCOUNT_ID/CF_API_TOKEN.
  - SCOPE LIMIT: CF list-models returns WORKERS-AI models only (`@cf/...`). The unified
    AI-Gateway multi-provider catalog (direct OpenAI/Anthropic) is NOT exposed by any API —
    a curated supplement merged on top is the only way to add those (not built; note the gap).
  - `resolveModel(value, allowedSet?)` / `isKnownModel(value, allowedSet?)` now take an
    OPTIONAL dynamic allowlist. The chat route reads the cached catalog ids and passes them so
    a freshly-catalogued id validates; static ids always pass. Keep the untrusted→known→default
    guard — never forward an arbitrary id to env.AI.run.
  - The combobox `components/chat/model-picker.tsx` is IN-HOUSE (no dropdown dep). It fetches
    `/api/chat/models` on mount, keeps the static fallback on failure. Don't add a combobox lib.
