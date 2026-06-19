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
