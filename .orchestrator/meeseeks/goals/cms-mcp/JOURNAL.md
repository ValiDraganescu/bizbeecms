# Journal — cms-mcp
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:12 — Slice 1: shared tool dispatch module (no-behavior-change refactor)
- **Status:** DONE
- **What I did:** Pulled the tool dispatch + all `handle*` functions out of
  `CMS/src/app/api/chat/route.ts` into a shared module so the chat route AND the
  future MCP server run ONE validated tool path.
  - New `CMS/src/lib/chat/tool-dispatch-core.ts` (PURE, no `@/` → node-testable):
    `makeDispatcher(handlers)` (name→handler map → `(name,args)→{name,...}`;
    unknown tool / thrown handler → `{ok:false,errors}`, never throws) and
    `selectToolSchemas(byName, names)` (resolve names→schemas from the shared
    registry, order-preserving, skips unknowns).
  - New `CMS/src/lib/chat/tool-dispatch.ts` (CF-coupled, imports `@/db/*`): the
    `TOOL_BY_NAME` registry (keys == `KNOWN_TOOL_NAMES`), every handler rewritten
    to RETURN `{ok,…}` (no SSE `emit`), `runTool(name,args)` via `makeDispatcher`,
    plus `toolSchemasForContext(ctx)` and `allToolSchemas()` (the MCP full surface).
  - `route.ts` slimmed: dropped ~15 tool imports + `TOOL_BY_NAME` + all handlers;
    `runToolsRound` now just loops `runTool` and frames each result as a `tool` SSE
    event. SSE framing stays in the route; tool logic is shared. Behavior identical.
- **Verified:** `npx tsc --noEmit` clean. New `scripts/tool-dispatch.test.mjs`
  (6 tests) pass: dispatch a known tool / unknown→error / throwing handler caught /
  name always tagged / selectToolSchemas order+skip / every scoped tool name is a
  KNOWN_TOOL_NAME (no dead tools). Re-ran chat-sse/component-tool/page-tool/
  translate-tool tests (65) green. `npx opennextjs-cloudflare build` (CMS deploy
  gate) green. Regenerated PM `cms-bundle.generated.js`. No new UI strings (refactor).
- **Files:** CMS/src/lib/chat/tool-dispatch-core.ts, CMS/src/lib/chat/tool-dispatch.ts,
  CMS/src/app/api/chat/route.ts, CMS/scripts/tool-dispatch.test.mjs,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js
