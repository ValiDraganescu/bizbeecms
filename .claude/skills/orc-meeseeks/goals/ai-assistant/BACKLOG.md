# Backlog — ai-assistant
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
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
- TODO: **Slice 4 sub-slice 2 — model picker.** Confirm the model-id list source FIRST (coordinate with
  binding-adapters' REST `Ai` task — DEFAULT_MODEL is `@cf/meta/llama-3.1-8b-instruct` in route.ts; is
  there a curated CF/gateway list to expose?). Widget sends a chosen `model` in the POST body; thread an
  optional VALIDATED `model` through (untrusted → allowlist → default DEFAULT_MODEL). No arbitrary strings.
  Pure allowlist helper tested; UI localized EN/FI/ET. Gate: CMS tsc + opennext build; regen PM cms-bundle.
- TODO: **Slice 4 sub-slice 3 — per-Site conversation history.** List past threads, open/delete. Pick the
  SIMPLEST store — a D1 table (Site already scopes the binding) is likely cleanest; KV if preferred. Save
  threads on send; load/list/delete in the widget. Pure helpers tested; UI localized EN/FI/ET. Gate: CMS
  tsc + opennext build; regen PM cms-bundle.
