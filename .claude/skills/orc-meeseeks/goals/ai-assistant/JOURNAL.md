# Journal — ai-assistant
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-19 20:15 — Programmatic AI-translate endpoint (POST /api/translate)
- **Status:** DONE
- **What I did:** Added a direct, button-driven translate path that is NOT a chat
  conversation, reusing every existing downstream piece (ONE write path):
  - `CMS/src/lib/chat/translate-request.ts` (PURE, node-testable): `parseTranslateRequest`
    (validates `{kind,target,fields:{name:srcText},fromLocale,toLocales?}`), `resolveTargetLocales`
    (toLocales || site content-locales, minus source, normalized/deduped), `buildTranslateMessages`
    (strict-JSON translate prompt), `collectStreamText` (drains a streaming `Ai.chat` SSE into full
    text via the SAME `SseDeltaParser` the chat route streams through), `parseTranslateResponse`
    (extracts first balanced JSON object — tolerant of prose/```json fences — builds per-field
    `{loc:text}` maps incl. the source locale, reports `missing` field×locale gaps).
  - `CMS/src/app/api/translate/route.ts`: auth → parse → `getContentLocales` → `ai.chat` (same
    `Ai` port + `getGatewayId`, model `@cf/meta/llama-3.1-8b-instruct`, no second model client) →
    `collectStreamText` → `parseTranslateResponse` → `validateTranslationInput` (shape gate on
    untrusted model output) → `applyTranslation` (existing D1 merge/write). Returns
    `{ok,action,target,fieldsWritten,translations,missing}` for optional review.
- **Verified:** `node --test scripts/translate-request.test.mjs` 12/12 pass (model FAKED via a
  hand-built SSE stream; no live API). `tsc --noEmit` clean. `opennextjs-cloudflare build` green
  (`/api/translate` in the route manifest). Regenerated PM `cms-bundle.generated.js` (route present).
  NOT verified (HITL): the live model call + D1 write need a real `AI` binding + Site.
- **Files:** CMS/src/lib/chat/translate-request.ts (new), CMS/src/app/api/translate/route.ts (new),
  CMS/scripts/translate-request.test.mjs (new), ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-19 20:20 — Slice 1: Intercom-style chat widget shell
- **Status:** DONE
- **What I did:** Extracted the streaming chat transport + transcript out of
  `components/chat/admin-chat.tsx` into a shared `components/chat/chat-conversation.tsx`
  (`useChat` hook owning fetch/ReadableStream/state via `lib/chat/client-sse.ts`, plus a
  layout-agnostic `ChatConversation` presentational core with a `transcriptClassName`/`footer`
  seam for later slices). `admin-chat.tsx` is now a thin wrapper around it (one chat pipeline,
  no fork). Built the floating Intercom-style `components/chat/chat-widget.tsx` — fixed
  bottom-right bubble, opens a compact panel (open/close/minimize), conversation survives
  minimize. Mounted it once in `SidebarShell` (`components/admin-sidebar.tsx`) so it shows on
  every /admin/* page EXCEPT /admin/chat (which already renders the same conversation full-page).
  Added `chat.widget.*` i18n keys (title/subtitle/open/close/minimize) to en/fi/et.
- **Verified:** CMS `tsc --noEmit` clean; `opennextjs-cloudflare build` green; regenerated PM
  cms-bundle (`npm run bundle:cms`) + `bundle:selfcheck` passed (only the standing static-assets
  live-deploy warning). Did NOT run the widget in a real browser this run.
- **Files:** CMS/src/components/chat/chat-conversation.tsx (new),
  CMS/src/components/chat/chat-widget.tsx (new), CMS/src/components/chat/admin-chat.tsx (slimmed),
  CMS/src/components/admin-sidebar.tsx (mount widget), CMS/messages/{en,fi,et}.json (chat.widget.*),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-20 00:06 — Tool-call round-tripping (multi-turn tool loop)
- **Status:** DONE
- **What I did:** Closed the single-shot gap — tool RESULTS are now fed back to the model so it
  can chain (discover → act, e.g. list_components → create_page, or get_page → update_page_blocks).
  Before: `reframe` ran one turn, emitted `tool` events, then `done`; the model never saw results.
  - `lib/chat/reframe.ts`: kept `reframe` (single pass, all 6 existing tests green) for back-compat,
    added `streamChatRounds(initial, messages, nextTurn, runTools, maxRounds=4)` that drives the loop:
    stream a turn (forwarding `token`s + collecting text/calls via a new `consumeTurn` helper), run its
    tools, and if any ran AND under the cap, append a synthesized assistant `tool_calls` message + one
    `role:"tool"` result message per call (OpenAI shape, paired by `call_<i>` id) and re-ask via
    `nextTurn`. A turn with no tool call = final answer. Exactly one `done`/`error` out. New types
    `ChatMessage` (with tool_calls/tool_call_id/name), `ToolResult`, `RunToolsRound`, `NextTurn`.
  - `api/chat/route.ts`: `runTools(accumulator,…)` → `runToolsRound(calls,…)` that BOTH frames each
    `tool` event AND returns `ToolResult[]` (an `emit`/`collect` wrapper captures the emitted data;
    a per-call `before`-length guard synthesizes a result if a handler ever emits nothing, keeping
    tool_call_id↔result order aligned). POST builds a `turn(msgs)` closure (same model/tool-scope/
    gateway every round so chaining keeps the page's tools) used for the initial call AND each
    follow-up; switched `reframe(...)` → `streamChatRounds(upstream, messages, turn, runToolsRound)`.
- **Verified:** `node --test scripts/reframe-rounds.test.mjs` 4/4 (no-tool single round; result
  FED BACK then final answer — asserts the assistant tool_calls + role:tool messages reach nextTurn;
  maxRounds caps a runaway loop, asks only N-1 follow-ups; mid-stream error → error not done).
  `reframe.test.mjs`+`chat-sse.test.mjs` 21/21 (back-compat). `tsc --noEmit` clean.
  `opennextjs-cloudflare build` green. Full CMS suite 463/464 (the ONE fail is the PRE-EXISTING
  page-builder Section-grid CSS test, not this goal). PM `bundle:cms` regen + `bundle:selfcheck`
  passed (only the standing static-assets live-deploy warning). NOT verified (HITL): a live model
  actually choosing to chain tools needs a real AI binding + browser.
- **Files:** CMS/src/lib/chat/reframe.ts, CMS/src/app/api/chat/route.ts,
  CMS/scripts/reframe-rounds.test.mjs (new), ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-19 20:26 — Slice 2: page-awareness (per-page system prompt + scoped tools)
- **Status:** DONE
- **What I did:** Ported aicms `tool_scopes.ts` to bizbee reality as a PURE module
  `CMS/src/lib/chat/tool-scopes.ts` (no React/D1/CF imports → node-testable). It speaks tool
  NAMES (strings), so the pure boundary holds and the route maps names→tool objects:
  - `detectAdminContext(pathOrUrl)` — bizbee admin paths are `/admin/<page>` (NO locale prefix;
    cookie-based i18n), so it just reads the segment after `admin`; strips query/hash; accepts a
    full URL too. Unknown/non-admin → `"general"`. Contexts: page-builder | components | pages |
    settings | media | general (only routes that map to EXISTING tools; `sitemap` → general).
  - `isAdminContext(v)` — guards untrusted client `context`.
  - `toolsForContext(ctx)` — per-page subset of the FOUR existing tools (create_component,
    create_page, translate, list_assets). page-builder=[component,page,assets],
    components=[component,assets], pages=[page,translate,assets], settings=[translate],
    media=[assets], general=all. (Slice 3 adds more tools + richer scopes when backends land.)
  - `contextPrompt(ctx)` — a per-context addition appended to `buildSystemPrompt`.
  Wired `CMS/src/app/api/chat/route.ts`: `resolveContext(body)` reads `context` (validated) or
  `pathname` (detected), defaults `general`; replaced the static TOOLS array with `TOOL_BY_NAME`
  + `toolsForRequest(context)`; `withSystemPrompt(messages, context)` now appends
  `contextPrompt(context)`. The widget (`chat-widget.tsx`) reads `usePathname()` and passes
  `useChat(() => detectAdminContext(pathname))`; `useChat(getContext?)` reads it fresh per send
  (so navigating mid-chat re-scopes) and adds `context` to the `/api/chat` body when present.
  Full-page `/admin/chat` passes no getContext → route defaults to general (full toolset), unchanged.
- **Verified:** `node --test scripts/tool-scopes.test.mjs` 8/8 pass. `tsc --noEmit` clean.
  `opennextjs-cloudflare build` green. Regenerated PM cms-bundle + selfcheck passed (only the
  standing static-assets live-deploy warning). NOT verified (HITL): live model call honoring the
  scoped tool list / context prompt needs a real AI binding + browser.
- **Files:** CMS/src/lib/chat/tool-scopes.ts (new), CMS/scripts/tool-scopes.test.mjs (new),
  CMS/src/app/api/chat/route.ts (context wiring), CMS/src/components/chat/chat-conversation.tsx
  (useChat getContext + body), CMS/src/components/chat/chat-widget.tsx (usePathname → context),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-19 20:31 — Slice 3 (part 1): port the read-only CMS-structural tools
- **Status:** DONE
- **What I did:** Added the DISCOVERY tools the assistant lacked so it can UPDATE
  (not just CREATE) — each backed by an EXISTING store, ZERO data-corruption risk:
  - New PURE module `CMS/src/lib/chat/read-tools.ts` (node-testable, no @/ imports):
    7 tool schemas — `list_components`, `get_component`, `list_pages`, `get_page`,
    `list_locales`, `get_brand_identity`, `get_theme` — plus pure helpers
    `coerceIdArg(args,key)` (trim/validate `name`/`id` model args),
    `formatComponentList` (rows → `{name,hasProps}`), `formatPageList` (rows →
    compact summary + sorted locale-union of metaTitle/metaDescription keys).
  - Wired `api/chat/route.ts`: imported the 7 schemas + `listComponents`,
    `getComponentByName`, `listPages`, `getPageById`, `getThemeOverrides`,
    `getThemeOverridesDark`; added all 7 to `TOOL_BY_NAME`; added 7 `else-if`
    dispatch branches in `runTools` + 7 read-only handlers (no untrusted artifact;
    missing name/id → ok:false, not-found → ok:false, never throws into the stream).
  - Registered in `lib/chat/tool-scopes.ts`: added all 7 to `KNOWN_TOOL_NAMES`,
    slotted them into the right `TOOLS_BY_CONTEXT` entries (page-builder + components
    get discovery; pages get list/get_page + list_locales; SETTINGS now reads
    brand/theme/locales + translate — no create tools), and updated the per-context
    prompts to "discover first, then author / re-author by same name to update".
  - WRITE tools (update_component, update_page_blocks, update_brand_identity,
    update_theme) DEFERRED to Slice 3 part 2 — they carry untrusted artifacts needing
    create_*-grade validation; not riding along with these zero-risk reads.
- **Verified:** `node --test scripts/read-tools.test.mjs scripts/tool-scopes.test.mjs`
  12/12 pass (stale Slice-2 tool-list assertions updated to the new scopes). `tsc
  --noEmit` clean. `opennextjs-cloudflare build` green. Regenerated PM cms-bundle +
  selfcheck passed (only the standing static-assets live-deploy warning). NOT verified
  (HITL): live model actually calling these tools needs a real AI binding + D1 + browser.
- **Files:** CMS/src/lib/chat/read-tools.ts (new), CMS/scripts/read-tools.test.mjs (new),
  CMS/src/app/api/chat/route.ts (imports+dispatch+handlers), CMS/src/lib/chat/tool-scopes.ts
  (KNOWN_TOOL_NAMES + scopes + prompts), CMS/scripts/tool-scopes.test.mjs (assertions),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-19 20:39 — Slice 3 (part 2): write tools (update_*) + list_builtin_types
- **Status:** DONE
- **What I did:** Gave the assistant the UPDATE half of discovery — each gated by the
  SAME validator/normalizer create_* uses (no shortcuts):
  - New PURE module `CMS/src/lib/chat/write-tools.ts` (node-testable, no @/): 5 tool schemas
    (`update_component`, `update_page_blocks`, `update_brand_identity`, `update_theme`,
    `list_builtin_types`) + pure helpers `builtinBlockTypes()` (exposes only `Section`, hides
    `__section_column__`), `splitThemeArgs(args)` (keeps object light/dark, flags presence),
    `coerceIdentityArg(args)`.
  - Wired `api/chat/route.ts`: imported the 5 schemas + helpers + `setPageBlocks`,
    `setSiteIdentity`/`setThemeOverrides`/`setThemeOverridesDark`, and `validateBlocks`
    (lib/pages/page-blocks). Added all 5 to `TOOL_BY_NAME`, 5 dispatch branches, and handlers:
    update_component → `validateComponentArtifact` + `upsertComponent` (same name updates in
    place); update_page_blocks → `coerceIdArg(id)` + `validateBlocks` + `missingComponents`
    check + `setPageBlocks` (edits BLOCKS only, never meta); update_brand_identity →
    `coerceIdentityArg` + `setSiteIdentity` (normalizes = trust gate); update_theme →
    `splitThemeArgs` + `setThemeOverrides[Dark]` (normalize to known tokens + safe colors =
    trust gate; ≥1 of light/dark required); list_builtin_types → static `builtinBlockTypes()`.
    All handlers ok:false on bad input, never throw into the stream.
  - Registered in `tool-scopes.ts`: added all 5 to `KNOWN_TOOL_NAMES`; page-builder gained
    update_component/update_page_blocks/list_builtin_types; components gained update_component;
    pages gained update_page_blocks/list_builtin_types; settings gained update_brand_identity/
    update_theme. Updated the per-context prompts ("get_* first, then update_* — replaces, not
    merges").
- **Verified:** `node --test scripts/write-tools.test.mjs scripts/tool-scopes.test.mjs
  scripts/read-tools.test.mjs` 17/17 pass. `tsc --noEmit` clean. `opennextjs-cloudflare build`
  green. Regenerated PM cms-bundle + selfcheck passed (only the standing static-assets
  live-deploy warning). NOT verified (HITL): live model calling these tools + actual D1 writes
  need a real AI binding + Site + browser.
- **Files:** CMS/src/lib/chat/write-tools.ts (new), CMS/scripts/write-tools.test.mjs (new),
  CMS/src/app/api/chat/route.ts (imports+dispatch+handlers), CMS/src/lib/chat/tool-scopes.ts
  (KNOWN_TOOL_NAMES + scopes + prompts), CMS/scripts/tool-scopes.test.mjs (assertions),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-19 20:46 — Slice 4 (sub-slice 1): debug view (system prompt + active tools)
- **Status:** DONE
- **What I did:** Gave the widget a DEBUG toggle (aicms `debug_panel.tsx`) showing EXACTLY what the
  assistant gets for the current admin page — no fork, both surfaces share one builder:
  - Extracted the system-prompt assembly out of `api/chat/route.ts`'s `withSystemPrompt` into a new
    `CMS/src/lib/chat/assemble-prompt.ts` `assembleSystemPrompt(context)` (NOT pure — owns the @/db +
    @/lib reads: getSiteIdentity + listComponentNames + buildSystemPrompt + allowedClasses +
    contextPrompt, defensive on unbound D1). The POST route now calls it; debug route reuses it →
    the panel can't drift from the live prompt.
  - New `GET /api/chat/debug?context=&pathname=` (`CMS/src/app/api/chat/debug/route.ts`): admin-only
    (reveals the prompt), resolves context, returns `{context, systemPrompt, tools:[names]}`.
  - Added a PURE `resolveRequestContext(context, pathname)` to `tool-scopes.ts` — the ONE untrusted→
    context resolution BOTH routes now use (explicit valid context wins, else detect pathname, else
    "general"; never throws). Killed the duplicated `resolveContext` in both routes.
  - New client `CMS/src/components/chat/chat-debug-panel.tsx`: tool list computed client-side via the
    pure toolsForContext(detectAdminContext(pathname)) (instant); system prompt fetched lazily from
    the endpoint while the panel is open. Wired a debug toggle into chat-widget.tsx header (panel
    replaces the conversation when on; conversation state survives the toggle).
  - i18n `chat.debug.*` (context/tools/noTools/prompt/loading/error) + `chat.widget.debug` in en/fi/et.
- **Verified:** `node --test scripts/tool-scopes.test.mjs` 9/9 pass (added a resolveRequestContext test
  guarding the shared contract). `tsc --noEmit` clean. `opennextjs-cloudflare build` green
  (`/api/chat/debug` in the route manifest). Regenerated PM cms-bundle + selfcheck passed (only the
  standing static-assets live-deploy warning). NOT verified (HITL): live prompt fetch in a real
  browser with a bound D1.
- **Files:** CMS/src/lib/chat/assemble-prompt.ts (new), CMS/src/app/api/chat/debug/route.ts (new),
  CMS/src/components/chat/chat-debug-panel.tsx (new), CMS/src/lib/chat/tool-scopes.ts
  (resolveRequestContext), CMS/src/app/api/chat/route.ts (shared helpers), CMS/src/components/chat/
  chat-widget.tsx (debug toggle), CMS/messages/{en,fi,et}.json, CMS/scripts/tool-scopes.test.mjs (test),
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-19 20:52 — Slice 4 sub-slice 2 — MODEL PICKER
- **Status:** DONE
- **What I did:** Added an operator model picker to the widget, threaded a validated
  optional `model` through the chat route.
  - New PURE `CMS/src/lib/chat/models.ts`: `DEFAULT_MODEL`, a curated `CHAT_MODELS`
    allowlist (3 CF Workers-AI tool-capable models), `isKnownModel`, `resolveModel`
    (untrusted→allowlist→default, never throws, never forwards arbitrary ids). No
    curated list existed in the `Ai` port, so a small hard-coded allowlist (per NEXT).
  - `api/chat/route.ts`: removed the local `DEFAULT_MODEL` const (now imported from the
    pure module so the widget shares the SAME list), reads `body.model` and passes
    `resolveModel(...)` into `ai.chat({ model })`. Untrusted → NEVER a 400 (same contract
    as `context`).
  - `chat-conversation.tsx`: `useChat` gained an optional second arg `getModel` (read
    fresh per send, like `getContext`); send builds the POST payload conditionally.
  - `chat-widget.tsx`: `model` state (default DEFAULT_MODEL) + a `<select>` rendered via
    the existing `ChatConversation` `footer` seam; passes `() => model` to `useChat`.
  - i18n `chat.widget.model` added to en/fi/et (Model / Malli / Mudel).
- **Verified:** `node --test scripts/models.test.mjs` (4 pass) — DEFAULT in allowlist,
  unique ids, isKnownModel, resolveModel fallback incl. injection-ish strings. CMS
  `tsc --noEmit` clean. `opennextjs-cloudflare build` green (dev server off). PM
  `bundle:cms` regenerated + `bundle-selfcheck` passed (only the pre-existing static-assets
  warning). Did NOT live-call the model (no real AI binding here).
- **Files:** CMS/src/lib/chat/models.ts (new), CMS/scripts/models.test.mjs (new),
  CMS/src/app/api/chat/route.ts, CMS/src/components/chat/chat-conversation.tsx,
  CMS/src/components/chat/chat-widget.tsx, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-19 20:59 — Slice 4 sub-slice 3: per-Site conversation history
- **Status:** DONE
- **What I did:** Per-Site chat thread persistence + a history panel in the widget.
  - `db/schema.ts`: new `chat_thread` table (id, title, messages JSON, createdAt, updatedAt) +
    ChatThread/NewChatThread types. The DB IS the Site boundary, so threads aren't site-scoped.
    Migration `0005_wonderful_ultragirl.sql` generated via `drizzle-kit generate`.
  - `lib/chat/history.ts` (NEW, PURE — node-testable, no @/ except types): `deriveTitle`
    (first user msg, one-lined, ≤80c), `validateThreadInput` (UNTRUSTED body → drops malformed
    messages, bounds count/length, derives title, nulls a bad id), `newThreadId`,
    `parseStoredMessages` (defensive column parse). Tool cards are NOT stored — only role/content
    text needed to reseed `useChat`.
  - `db/chat-history-store.ts` (NEW): listThreads/getThread/saveThread(upsert, mints id when null)/
    deleteThread. Thin binding layer over the pure helpers.
  - `app/api/chat/history/route.ts` (NEW): GET (list / ?id=one), POST (save→{id,action}),
    DELETE (?id). Admin-only (requireAdmin). REST, no server actions. Save body untrusted →
    validateThreadInput → 400 only on genuinely empty/bad shape (never on minor garbage).
  - `chat-conversation.tsx`: `useChat` now returns `seed(messages)` (reseed transcript from a
    loaded thread) + `reset()` (new conversation). No transport fork.
  - `chat-widget.tsx`: New-conversation + History header buttons; a history list panel
    (open thread → seed; delete). Saves the transcript on the busy→idle EDGE per turn via a
    `busyRef`; threadId ref tracks the current server id so re-saves upsert the same thread.
    Best-effort persistence (offline/no-binding fetch failures swallowed).
  - i18n `chat.widget.{new,history,historyEmpty,historyUntitled,historyDelete}` en/fi/et.
- **Verified:** `node --test scripts/history.test.mjs` (7 pass). CMS `tsc --noEmit` clean.
  `opennextjs-cloudflare build` green (route `/api/chat/history` registered; dev server off).
  PM `bundle:cms` regen + `bundle:selfcheck` passed (only the pre-existing static-assets warning).
  Full CMS suite 416/417 — the ONE failure (`planPage renders a Section as a grid of columns`)
  is PRE-EXISTING (fails on a clean tree too; page-builder goal, not mine). Did NOT exercise live
  D1 (no real binding here — HITL).
- **Files:** CMS/src/db/schema.ts, CMS/src/lib/chat/history.ts (new),
  CMS/src/db/chat-history-store.ts (new), CMS/src/app/api/chat/history/route.ts (new),
  CMS/scripts/history.test.mjs (new), CMS/migrations/0005_wonderful_ultragirl.sql (+ meta),
  CMS/src/components/chat/chat-conversation.tsx, CMS/src/components/chat/chat-widget.tsx,
  CMS/messages/{en,fi,et}.json, ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).

## 2026-06-20 00:10 — Resume current thread on widget mount
- **Status:** DONE
- **What I did:** NEXT.md pick #2 — a fresh page load no longer starts the widget
  empty when a thread was mid-flight. `chat-widget.tsx` now persists the active
  thread id to `sessionStorage` (`bizbee.chat.threadId`, per-tab) on every save
  and on `openThread`; clears it on new/delete-of-current (`forgetThread`). A
  run-once mount effect resumes the conversation: prefer the remembered per-tab
  id, else fall back to the most recent saved thread (`GET /api/chat/history`
  → threads[0]), then `await openThread(id)` (which `chat.seed`s the transcript).
  Guards: only restores when `threadId.current === null` (never clobbers an
  in-flight convo); all `sessionStorage` access wrapped in try/catch (private
  mode safe). No new backend, no new route, no new dep — pure client polish over
  the existing history endpoints + `useChat.seed`.
- **Verified:** CMS `tsc --noEmit` clean (exit 0); `opennextjs-cloudflare build`
  green (dev server confirmed off first); PM `bundle:cms` regen + `bundle:selfcheck`
  passed (only the known static-assets-gap warning). Did NOT exercise the live
  reload-resume in a browser (no running deploy this run) — logic verified by
  build/types + read-through.
- **Files:** CMS/src/components/chat/chat-widget.tsx;
  ProjectManager/src/lib/deploy/cms-bundle.generated.js (regen).
