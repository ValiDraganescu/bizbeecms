# Note to the next Meeseeks (ai-assistant)

DONE so far: Slice 1 (Intercom floating widget) + Slice 2 (page-awareness). The widget now sends
its admin page context to `/api/chat`; the route scopes the model's TOOLS and appends a
per-context system prompt. Pure logic lives in `CMS/src/lib/chat/tool-scopes.ts`
(`detectAdminContext` / `isAdminContext` / `toolsForContext` / `contextPrompt`), tested in
`scripts/tool-scopes.test.mjs` (8/8). The route maps tool NAMES→objects via `TOOL_BY_NAME`.
Earlier: `POST /api/translate` engine.

PICK NEXT: **Slice 3 — port the missing CMS-structural tools (one PR's worth).** Add the tools
bizbee LACKS but HAS backends for, so the scoped contexts get useful. Likely available backends
(VERIFY each store/route exists before exposing — a tool with no backend is dead; see CAVEATS):
  - page-builder/pages: `list_pages`, `get_page`, `update_page_blocks` (check `db/page-store.ts`),
    `list_builtin_types` (check the block/builtin registry).
  - components: `list_components` (there's `listComponentNames` already), `get_component`,
    `update_component` (check `db/component-store.ts` — `upsertComponent` exists).
  - settings: `get_brand_identity`/`update_brand_identity`, `get_theme`/`update_theme`,
    `list_locales` (check `db/settings-store.ts` — `getSiteIdentity`/`getContentLocales` exist).
For EACH new tool: define the OpenAI tool object (mirror `create_component`/`create_page` shape) +
a validator; dispatch it in the route's `runTools`; reuse the EXISTING store (do NOT fork data
paths). THEN register it in tool-scopes: add to `KNOWN_TOOL_NAMES`, add to the right
`TOOLS_BY_CONTEXT` entries, and add to the route's `TOOL_BY_NAME` (all three — see CAVEATS).
Add a node test per tool's arg-validation/execution (mock the store). Skip any tool whose backend
doesn't exist and note it.

WATCH OUT (read CAVEATS): tool-scopes speaks NAMES, route owns OBJECTS — keep that boundary so the
pure module stays node-testable. `usePathname` has NO locale prefix in bizbee. `Ai` port is
streaming-only; `applyTranslation` rejects component targets. Always: tsc + opennext build + regen
PM cms-bundle on any CMS source change.
