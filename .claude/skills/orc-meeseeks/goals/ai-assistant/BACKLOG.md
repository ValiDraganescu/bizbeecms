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
- TODO: **Slice 3 part 2 — the WRITE tools (untrusted artifacts, validate like create_*).**
  `update_component` (reuse `upsertComponent` + `validateComponentArtifact` — same name updates already),
  `update_page_blocks` (`setPageBlocks` — validate the block tree like create_page does; check the block
  shape validator), `update_brand_identity` (`setSiteIdentity` — it normalizes; still validate shape),
  `update_theme` (`setThemeOverrides`/`setThemeOverridesDark` — they normalize to known tokens + safe
  colors; pass the model's map straight in, they're the trust gate). Also `list_builtin_types` IF a
  builtin/block-type registry exists (CHECK `listComponentPalette` / page-store — verify before exposing).
  Each: validator + route handler + register in KNOWN_TOOL_NAMES/TOOLS_BY_CONTEXT/TOOL_BY_NAME (all three).
  Node test per tool's arg-validation. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
- TODO: **Slice 4 — debug panel + model picker + conversation history.** Widget gets: a DEBUG view showing
  the assembled system prompt + the active tool list for the current context (aicms `debug_panel.tsx`); a
  MODEL PICKER (the model list source — confirm whether to expose Cloudflare AI / gateway models; coordinate
  with the binding-adapters REST task for the model id list); and per-Site conversation HISTORY (list past
  threads, open/delete — pick a store: D1 table or KV; the simplest that fits). Pure helpers tested; UI
  localized EN/FI/ET. Gate: CMS tsc + opennext build green; regen PM cms-bundle.
