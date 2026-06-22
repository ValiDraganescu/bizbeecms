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

## 2026-06-22 12:40 — Slice 2: per-site API keys (schema + auth guard + pure helpers)
- **Status:** DONE
- **What I did:** Added the net-new per-site API-key credential path for the
  future MCP server. NO MCP yet — just the table, the crypto primitives, and the
  bearer guard.
  - `db/schema.ts`: new `api_key` table (id, keyHash, keyPrefix, label, createdBy,
    createdAt, lastUsedAt, revokedAt; UNIQUE index on keyHash). Only the HASH is
    stored, never plaintext. + `ApiKey`/`NewApiKey` types. Drizzle migration
    `migrations/0008_famous_vertigo.sql` (via `npm run db:generate`).
  - `lib/auth/api-key-core.ts` (PURE, no `@/`, node-tested): `generateKey()`
    (`bzb_`+32 random bytes b64url via Web Crypto), `keyPrefix()`, `hashKey()`
    (SHA-256 hex via `crypto.subtle`), `verifyKey()`/`timingSafeEqualHex()`
    (constant-time), `parseBearer(header)`, `looksLikeKey()`.
  - `db/api-key-store.ts` (CF-coupled, via the Db port — NOT raw env.DB):
    `listApiKeys()` (no secrets), `createApiKey(label,createdBy)` → plaintext ONCE
    + stored item, `revokeApiKey(id)` (sets revokedAt), `findActiveKeyByHash()`
    (lookup non-revoked by hash + best-effort lastUsedAt stamp).
  - `lib/auth/api-key-guard.ts`: `checkApiKey`/`requireApiKey(request)` — parse
    bearer → shape-check → hash → lookup non-revoked → allow/deny. SEPARATE from
    the cookie guard (`guard.ts requireAdmin`); fail-closed (401 + WWW-Authenticate).
- **Verified:** `node --test scripts/api-key-core.test.mjs` 8/8 green (gen unique,
  hash deterministic/64-hex, verify only matching plaintext, prefix never auths,
  parseBearer case/whitespace, looksLikeKey gate). `npx tsc --noEmit` clean.
  `npm test` 516/516. `npx opennextjs-cloudflare build` (CMS deploy gate) green.
  Regenerated PM `cms-bundle.generated.js`. No UI strings (no UI this slice).
  Could NOT exercise the live D1 store (needs a real binding — HITL; pure crypto
  + guard logic are fully covered, store is build-verified).
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0008_famous_vertigo.sql,
  CMS/migrations/meta/* , CMS/src/lib/auth/api-key-core.ts,
  CMS/src/db/api-key-store.ts, CMS/src/lib/auth/api-key-guard.ts,
  CMS/scripts/api-key-core.test.mjs,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-22 13:50 — Slice 3: remote MCP server endpoint (/mcp) on the CMS Worker
- **Status:** DONE (code+tests; PM bundle regen DEFERRED — see below)
- **Transport SPIKE result (the one unknown):** remote MCP on a Worker = **Streamable
  HTTP** (current MCP transport, supersedes the old HTTP+SSE pair). Our tool surface is
  pure request/response (no server-initiated notifications), so we use the simplest
  spec-compliant mode: client POSTs one JSON-RPC 2.0 message, server replies with ONE
  JSON-RPC response as `application/json` (no session, no standing SSE stream).
  **Hand-rolled the JSON-RPC** — did NOT add `@modelcontextprotocol/sdk` (Node-coupled,
  heavy; the methods we need are ~5). Claude Code adds the site URL + bearer header as a
  remote MCP server and the tools appear.
- **What I did:**
  - `CMS/src/app/mcp/mcp-core.ts` (PURE, no `@/` → node-testable): protocol version
    `2025-06-18`, JSON-RPC types/codes, `parseJsonRpc` (envelope shape-check),
    `toMcpTools` (maps our `{type:function,function:{name,description,parameters}}`
    schemas → MCP `{name,description,inputSchema}`; missing params → empty object schema;
    junk skipped), `parseToolCall`, `toMcpToolResult` (wraps the `{name,ok,…}` dispatch
    payload as one JSON text content block, `isError = ok===false`), and `handleRpc`
    (dispatch: initialize / tools/list / tools/call / ping / notifications → null).
    `listTools`+`runTool` are INJECTED so the data path stays the SHARED one.
  - `CMS/src/app/mcp/route.ts` (CF-coupled): `POST /mcp` gated by `requireApiKey`
    (Slice 2, SEPARATE from the cookie guard); `tools/list` from `allToolSchemas()`,
    `tools/call` → `runTool` (shared dispatch — NOT forked; new tools like
    content-collections appear for free). Notification → 202 no-body; parse/internal
    errors → JSON-RPC error envelopes. `GET /mcp` → 405 (no standing SSE in JSON mode).
    Browser `/api/chat` untouched (still cookie-authed).
  - `CMS/src/app/mcp/mcp-core.test.ts`: 10 node `--test` cases — schema mapping, envelope
    validation, initialize/list/call routing, arg defaulting, missing-name reject,
    isError flagging, notification null, unknown-method error, parseToolCall guards.
- **Verified:** `node --test src/app/mcp/*.test.ts` → 10/10 pass. `tsc --noEmit` → **0
  errors in src/app/mcp/**** (the only tsc error in the tree is `src/lib/content/
  binding.ts:37`, the RENDERER worker's in-flight UNTRACKED file — out of my scope).
  Could NOT run the full `opennextjs-cloudflare build` / PM `bundle:cms` because that
  gate is RED on the renderer's binding.ts AND would race their shared `.next`. The live
  Claude-Code-connects-over-the-network handshake can't be exercised offline (needs a
  deployed Worker + a minted key) — that's the only HITL spot-check, noted in NEXT.
- **Files:** CMS/src/app/mcp/{mcp-core.ts, route.ts, mcp-core.test.ts}
