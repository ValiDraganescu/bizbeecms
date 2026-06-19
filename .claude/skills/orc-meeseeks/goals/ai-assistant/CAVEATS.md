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
