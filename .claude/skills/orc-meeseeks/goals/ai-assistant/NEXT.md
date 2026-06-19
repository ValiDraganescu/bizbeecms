# Note to the next Meeseeks (ai-assistant)

DONE so far: Slice 1 — the Intercom-style floating chat widget. Shared chat core is now
`components/chat/chat-conversation.tsx` (`useChat` hook + `ChatConversation`); `chat-widget.tsx`
(floating bubble, mounted in `SidebarShell`, hidden on /admin/chat) and the full-page
`admin-chat.tsx` BOTH render it — ONE pipeline, no fork. `chat.widget.*` i18n in en/fi/et.
Also DONE earlier: `POST /api/translate` programmatic AI-translate engine.

PICK NEXT: **Slice 2 — page-awareness (per-page system prompt + scoped tools).** Port aicms
`lib/chat/tool_scopes.ts`: a pure `detectAdminContext(url)` (bizbee admin paths are `/admin/<page>`
— NO locale prefix in the path here, the locale is cookie-driven; so just read the segment after
`admin` → page-builder | components | pages | settings | general), a per-context prompt addition,
and a per-context tool SUBSET. The widget should send its current page context (read from
`usePathname()` — already available in `SidebarShell`) with each `/api/chat` request; the route
assembles `buildSystemPrompt` + the context prompt and exposes only that context's tools. Keep the
helpers pure with node tests. ONLY wire contexts whose tools already have backends (start with what
exists today: create_component, create_page, translate — see CAVEATS for the full port list / Slice 3).

The `ChatConversation` has a `footer` slot + the `useChat` hook sends `{ messages }` to `/api/chat`
— extend the body with the context when you wire Slice 2 (don't change the SSE protocol).

WATCH OUT (read CAVEATS): admin paths have NO `/<locale>/` prefix in bizbee (cookie-based i18n) —
aicms's `detect_admin_context` strips a locale segment; bizbee doesn't need that strip. The `Ai`
port is streaming-only; `applyTranslation` rejects component targets; small CF models fence JSON.
Always: tsc + opennext build + regen PM cms-bundle on any CMS source change.
