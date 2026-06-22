# Backlog — cms-mcp
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order: extract the shared tool dispatch first, then API-key auth, then the MCP
transport, then the key UI. Each slice gates on CMS tsc + opennext build green +
node tests + EN/FI/ET for new strings.

- DONE (2026-06-22): **Slice 1 — extract a SHARED tool dispatch module (refactor,
  no behavior change).** `lib/chat/tool-dispatch.ts` (real handlers, `runTool`,
  `TOOL_BY_NAME`, `toolSchemasForContext`/`allToolSchemas`) + pure node-tested core
  `lib/chat/tool-dispatch-core.ts` (`makeDispatcher`, `selectToolSchemas`). Chat
  route now calls `runTool`; SSE framing stays in the route. Gate green; bundle regen.

- DONE (2026-06-22): **Slice 2 — per-site API keys: schema + auth guard.**
  `api_key` table on per-Site D1 (`db/schema.ts` + migration `0008_famous_vertigo`):
  id, keyHash (HASH only), keyPrefix (display), label, createdBy, createdAt,
  lastUsedAt, revokedAt; UNIQUE(keyHash). Pure node-tested helpers
  `lib/auth/api-key-core.ts` (generateKey `bzb_`+random, keyPrefix, hashKey SHA-256,
  verifyKey constant-time, parseBearer, looksLikeKey). Store `db/api-key-store.ts`
  (list/create/revoke/findActiveKeyByHash via the Db port). Guard
  `lib/auth/api-key-guard.ts` `requireApiKey` — SEPARATE from the cookie guard,
  fail-closed. Gate green; bundle regen. No MCP/UI yet.

- DONE (2026-06-22): **Slice 3 — MCP server endpoint on the Worker (the core).**
  SPIKE → Streamable HTTP, stateless JSON mode (POST one JSON-RPC 2.0 msg → one JSON
  response); hand-rolled (no SDK). `CMS/src/app/mcp/mcp-core.ts` (pure: schema→MCP
  mapping, envelope parse, `handleRpc` for initialize/tools.list/tools.call/ping/
  notifications) + `route.ts` (`POST /mcp` gated by `requireApiKey`, enumerates the
  SHARED `allToolSchemas()`, `tools/call`→`runTool` shared dispatch; GET→405) +
  `mcp-core.test.ts` (10 node tests). `tsc` clean for my files, browser `/api/chat`
  untouched. ⚠️ PM `cms-bundle` regen DEFERRED — shared gate was RED on the renderer's
  in-flight `binding.ts`; a later cms-mcp run regens once that tsc is green.

- DONE (2026-06-22): **Slice 4 — API-key management UI (CMS admin).** CMS → Settings →
  API Keys page (`admin/settings/api-keys/page.tsx` + client `api-keys-manager.tsx`):
  list (label, prefix…, created/lastUsed, revoked badge), create (show-once in-app
  modal w/ copy), revoke (reuses shared `ConfirmModal` — NO native confirm).
  `GET/POST/DELETE /api/keys` over the existing `api-key-store`. Admin-only:
  cms-auth roles ARE landed → added `canManageApiKeys` (Admin+, a tier above
  canManageUsers since a key = full tool set) + `requireApiKeyManager` (API) +
  page-layer `checkRoleFromHeaders(canManageApiKeys)`. Pure `isValidLabel`/
  `normalizeLabel` (MAX 80) node-tested. EN/FI/ET (`apiKeys` block + settingsNav tab).
  Gate green (tsc + opennext + 656 node tests); bundle regen (incl. the Slice 3
  `/mcp` CARRY-OVER, now in the manifest).

- TODO: **Slice 5 — connection docs + onboarding snippet.** A small in-UI snippet
  on the API Keys page showing how to wire this site into Claude Code (the `/mcp`
  URL for THIS site + the bearer header), copy-pasteable. Optionally a short
  CMS/README section. No new backend. EN/FI/ET. Gate. (ponytail: docs+snippet, not a
  whole onboarding flow.)

- TODO (later) — **scoped / least-privilege keys.** If needed: per-key tool scopes
  (read-only key vs. full) reusing the tool-scopes contexts. Only if a real need
  shows up — v1 keys grant the full tool set for the site.
