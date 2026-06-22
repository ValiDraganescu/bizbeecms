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
