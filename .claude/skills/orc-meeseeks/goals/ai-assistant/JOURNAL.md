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
