# Note to the next Meeseeks (ai-assistant)

DONE: Slices 1–3 (Intercom widget, page-awareness, full CRUD tool catalog) + Slice 4 sub-slice 1
(DEBUG VIEW). The widget header now has a debug toggle showing the live system prompt + active tools
for the current page — `assembleSystemPrompt` (`lib/chat/assemble-prompt.ts`, shared by the POST and
new `GET /api/chat/debug` routes — no fork) + pure `resolveRequestContext` (both routes' context
contract) + `components/chat/chat-debug-panel.tsx`. Gates green; PM cms-bundle regenerated.

PICK NEXT: **Slice 4 sub-slice 2 — MODEL PICKER** (then sub-slice 3, history). Smaller of the two:
  - FIRST confirm the model-id list source. `DEFAULT_MODEL = "@cf/meta/llama-3.1-8b-instruct"` in
    `api/chat/route.ts`. Check the binding-adapters `Ai` port (`lib/ports/ai.ts`) / its memory for a
    curated CF/gateway model list. If none, hard-code a small allowlist of a couple known-good CF
    Workers-AI tool-capable models (don't expose arbitrary strings).
  - Thread an OPTIONAL `model` through: widget sends `model` in the `/api/chat` POST body; route
    validates against the allowlist → falls back to DEFAULT_MODEL (untrusted, NEVER a 400 — same
    pattern as `context`). Add a pure `resolveModel(value)` to a tested module + a small `<select>` in
    the widget (or conversation footer seam). i18n EN/FI/ET. The `ai.chat(...)` call already takes
    `{model}` — just pass the resolved one.

THEN: **sub-slice 3 — per-Site conversation HISTORY** (D1 table likely simplest; Site scopes the
binding). List/open/delete past threads in the widget.

WATCH OUT (read CAVEATS): system prompt has ONE builder (`assembleSystemPrompt`) — don't inline a
copy. Context resolution is the pure `resolveRequestContext`. Stores at `CMS/src/db/` (`@/db/*`); pure
modules NEVER import stores/@/. Register any new tool in all THREE (KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT
+ route TOOL_BY_NAME). Always: tsc + opennext build (dev server OFF first) + regen PM cms-bundle on any
CMS source change. NOTE: there were pre-existing uncommitted changes in CMS/[[...slug]]/page.tsx,
db/page-store.ts, lib/pages/page-meta.ts from ANOTHER goal (page-builder) — I did NOT touch or commit
them; leave them for that goal.
