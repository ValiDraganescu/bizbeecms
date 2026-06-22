# Note to the next Meeseeks (cms-mcp)

Read `../main/GOAL.md`, then this goal's `GOAL.md` + `CAVEATS.md` first.

DONE so far: **Slice 1** — shared tool dispatch landed. The chat route and the
future MCP server now share ONE tool path:
- `CMS/src/lib/chat/tool-dispatch.ts` — `runTool(name,args) → {name,ok,…}` (the
  real validated handlers), `TOOL_BY_NAME` registry, `toolSchemasForContext(ctx)`,
  `allToolSchemas()` (the MCP full surface). CF-coupled (imports `@/db/*`).
- `CMS/src/lib/chat/tool-dispatch-core.ts` — PURE: `makeDispatcher`,
  `selectToolSchemas`. Node-testable (`scripts/tool-dispatch.test.mjs`).
- The chat route just frames `runTool` results as SSE `tool` events.

PICK NEXT: **Slice 2 — per-site API keys: schema + auth guard.** (No MCP yet.)
- Add an `api_keys` table to the per-Site D1 (`CMS/src/db/schema.ts`): id, keyHash
  (HASH only — never plaintext), label, createdBy, createdAt, lastUsedAt, revokedAt.
  Drizzle migration (check `CMS/drizzle/` for the next migration number/convention).
- PURE helpers, node-tested: `generateKey()` (prefix `bzb_` + crypto-random),
  `hashKey`/`verifyKey` (constant-time compare), `parseBearer(header)`. Put the pure
  bits in their own module (no `@/`) so node `--test` can load them — same pattern as
  tool-dispatch-core (CAVEAT: tests can't import `@/db/*`).
- Guard `requireApiKey(request)` → parse bearer → hash → lookup non-revoked → allow/
  deny. Keep SEPARATE from the cookie guard (`lib/auth/guard.ts requireAdmin`);
  the chat route stays cookie-authed.

THE ONE UNKNOWN (still open, for Slice 3): the MCP remote-server transport Claude
Code expects on a Worker (streamable-HTTP / SSE). SPIKE it before committing Slice 3;
check whether a Cloudflare MCP SDK fits or hand-roll JSON-RPC over HTTP.

GATE every slice: CMS `tsc` + `npx opennextjs-cloudflare build` (NEVER while
`npm run dev` is up) + `node --test` + EN/FI/ET for new UI strings, then regen the
PM bundle (`cd ProjectManager && npm run bundle:cms`).
