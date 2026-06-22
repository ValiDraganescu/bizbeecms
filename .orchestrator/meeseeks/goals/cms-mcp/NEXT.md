# Note to the next Meeseeks (cms-mcp)

Read `../main/GOAL.md`, then this goal's `GOAL.md` + `CAVEATS.md` first.

DONE so far:
- **Slice 1** — shared tool dispatch: `lib/chat/tool-dispatch.ts` (`runTool`,
  `TOOL_BY_NAME`, `toolSchemasForContext`/`allToolSchemas`) + pure core
  `tool-dispatch-core.ts`. Chat route frames `runTool` results as SSE events.
- **Slice 2** — per-site API keys (schema + auth primitive):
  - `api_key` table on per-Site D1 (`db/schema.ts`, migration
    `migrations/0008_famous_vertigo.sql`): keyHash (HASH only), keyPrefix, label,
    createdBy, createdAt, lastUsedAt, revokedAt; UNIQUE(keyHash).
  - PURE node-tested crypto: `lib/auth/api-key-core.ts` — `generateKey()` (`bzb_`+
    32 random bytes), `keyPrefix`, `hashKey` (SHA-256 hex), `verifyKey`/
    `timingSafeEqualHex` (constant-time), `parseBearer`, `looksLikeKey`.
  - Store `db/api-key-store.ts`: `listApiKeys` (no secrets), `createApiKey`
    (returns plaintext ONCE), `revokeApiKey`, `findActiveKeyByHash` (non-revoked
    only + lastUsedAt stamp). Uses the `getDb()` Db port.
  - Guard `lib/auth/api-key-guard.ts`: `requireApiKey(request)` → bearer → hash →
    lookup → allow/deny. SEPARATE from the cookie `requireAdmin`; fail-closed.

PICK NEXT: **Slice 3 — MCP server endpoint on the Worker (the core).**
- Mount `/mcp` on the CMS Worker (a Next route handler, e.g.
  `app/mcp/route.ts`), auth-gated by `requireApiKey` (Slice 2).
- THE ONE UNKNOWN — SPIKE FIRST: the MCP remote-server transport Claude Code
  expects (streamable-HTTP vs SSE). Check current docs + whether a Cloudflare MCP
  SDK fits or hand-roll JSON-RPC over HTTP. Note the choice in JOURNAL.
- Expose the SHARED registry from Slice 1: `tools/list` from `allToolSchemas()`,
  `tools/call` → `runTool(name,args)` → structured MCP result. Don't fork tool
  logic. New tools (content-collections) appear for free since dispatch enumerates
  the shared registry.
- Test the JSON-RPC shapes WITHOUT a live agent (list returns tools; call routes
  to a handler; bad key → 401). The browser `/api/chat` stays unchanged.

GATE every slice: CMS `tsc` + `npx opennextjs-cloudflare build` (NEVER while
`npm run dev` is up) + `node --test` + EN/FI/ET for new UI strings, then regen the
PM bundle (`cd ProjectManager && npm run bundle:cms`). You are the sole CMS worker.
