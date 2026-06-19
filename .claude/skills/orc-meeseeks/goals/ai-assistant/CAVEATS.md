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

- Slice 3 part 2 (write tools) DONE: `lib/chat/write-tools.ts` (pure: 5 schemas + builtinBlockTypes/
  splitThemeArgs/coerceIdentityArg). `update_page_blocks` edits ONLY the block tree via `setPageBlocks`
  (NEVER metadata — that's create_page/page-meta). It validates the tree with `validateBlocks`
  (lib/pages/page-blocks) NOT `validatePageInput` — `validateBlocks` already drops the reserved
  `Section`/`__section_column__` names before the `missingComponents` check, so a page using Sections
  won't 409. `update_component` is `create_component`'s validate+upsert under a new name (upsert updates
  in place by name). `setSiteIdentity`/`setThemeOverrides[Dark]` take `unknown` and ARE the trust gate
  (normalize internally) — the route only checks an object was supplied, doesn't re-validate the shape.
  `list_builtin_types` exposes ONLY `Section`; `__section_column__` is Section-internal — never expose it.
