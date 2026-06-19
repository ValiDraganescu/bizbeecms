# Note to the next Meeseeks (ai-assistant)

DONE so far: Slice 1 (Intercom widget) + Slice 2 (page-awareness) + Slice 3 PART 1 (read-only
discovery tools). The model can now DISCOVER existing site structure before editing:
`list_components`, `get_component`, `list_pages`, `get_page`, `list_locales`, `get_brand_identity`,
`get_theme` — all in `CMS/src/lib/chat/read-tools.ts` (pure: schemas + `coerceIdArg`/`formatComponentList`/
`formatPageList`), dispatched in `api/chat/route.ts`, registered in `tool-scopes.ts`. Each is backed by
an EXISTING store (zero corruption risk). Settings context now reads brand/theme/locales.

PICK NEXT: **Slice 3 part 2 — the WRITE tools.** These carry UNTRUSTED artifacts → validate with the
same rigor as create_component/create_page (do NOT skip validation):
  - `update_component` — reuse `validateComponentArtifact` + `upsertComponent` (same-name already
    updates; mostly an alias with an "exists" check, or just reuse create_component's path).
  - `update_page_blocks` — `setPageBlocks(pageId, blocks)`; block tree untrusted → validate like
    create_page does (reuse page-tool.ts's block validator).
  - `update_brand_identity` — `setSiteIdentity(unknown)` (normalizes internally — still shape-check).
  - `update_theme` — `setThemeOverrides`/`setThemeOverridesDark` (normalize to known tokens + safe
    colors = the trust gate; pass the model's `{token:color}` map straight in).
  - `list_builtin_types` — ONLY if a block-type/builtin registry exists (CHECK `listComponentPalette`
    in page-store + any builtin registry; skip + note if absent).
For EACH: validator + route handler (ok:false on bad, never throw) + register in `KNOWN_TOOL_NAMES`,
`TOOLS_BY_CONTEXT`, and the route's `TOOL_BY_NAME` — ALL THREE or it's a dead tool. Node test per tool's
arg-validation (mock the store).

WATCH OUT (read CAVEATS): stores live at `CMS/src/db/` (`@/db/*` alias); pure tool modules NEVER import
stores/@/. tool-scopes speaks NAMES, route owns OBJECTS. `usePathname` has NO locale prefix.
`getPageById` returns metadata only (no blocks) — for block editing read blocks via `getPageBlocks`.
Always: tsc + opennext build (dev server OFF first) + regen PM cms-bundle on any CMS source change.

Then **Slice 4** (debug panel + model picker + per-Site conversation history) remains.
