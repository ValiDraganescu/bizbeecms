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

- DONE (2026-06-22): **Slice 5 — connection docs + onboarding snippet.** API-Keys
  page derives THIS site's MCP URL server-side (`mcpUrlFromRequest()`: request host
  + proto → `…/mcp`) and passes it to `ApiKeysManager`. New "Connect Claude Code"
  section renders two copy-pasteable blocks (local `CopyBlock` helper): the
  `claude mcp add --transport http <url> --header "Authorization: Bearer bzb_…"`
  CLI command + an `.mcp.json` config snippet. No backend. EN/FI/ET (`connect*`).
  Gate green (tsc + 733 tests + opennext); bundle regen.

- HITL (only open item): **live spot-check** — deployed Worker + minted key → add
  the `/mcp` URL + bearer to Claude Code, confirm tools/list + a tools/call
  round-trip. Non-codeable; see HITL.md.

- DONE (2026-06-26, part b): **MCP URL prefers the configured APP_ORIGIN over the request host.**
  BUG (USER 2026-06-24): the "Connect Claude Code" snippets showed workers.dev even when the site has a
  custom domain, because Slice 5's `mcpUrlFromRequest()` derived the URL from the INCOMING REQUEST HOST
  (admin is browsed on workers.dev). FIX: pure `chooseMcpUrl(appOrigin, requestHost, proto)` in
  `app/mcp/mcp-core.ts` (prefer APP_ORIGIN, strip trailing slash, append `/mcp`; fall back to request
  host only when APP_ORIGIN unset) + 3 node tests; `api-keys/page.tsx` now reads `env.APP_ORIGIN` via
  `getCloudflareContext` and calls it. Gate green (tsc 0 / 943 tests / opennext) + bundle regen. The CMS
  now advertises the right URL AS SOON AS the deployer sets APP_ORIGIN to the custom domain — that's
  part (a), filed below.

- TODO (part a, follow-up — cross-track DEPLOYER + PM): **deployer must set `APP_ORIGIN` to the site's
  primary custom domain when one is attached.** Today `deployer/src/index.ts:~520` ALWAYS sets
  `APP_ORIGIN` to the workers.dev URL, even when the deployer already wires up custom-domain DNS
  (~293-294). With part (b) landed, the CMS advertises whatever APP_ORIGIN holds — so once the deployer
  feeds the primary custom domain into APP_ORIGIN, the MCP URL (and invite/google/reset links, which all
  read APP_ORIGIN) become correct. FIX: thread the site's primary custom domain (data lives PM-side —
  archived `custom-domains` is READ-ONLY, read it don't write it) into the deploy payload and have the
  deployer set `APP_ORIGIN=https://<custom-domain>` when present, else keep workers.dev. Gate: deployer
  tsc + its test; a PM-side change to pass the domain through the deploy request. NOTE: this is its own
  track (deployer + PM, not CMS) — flag to the curator if it wants a dedicated subgoal.

- TODO (later) — **scoped / least-privilege keys.** If needed: per-key tool scopes
  (read-only key vs. full) reusing the tool-scopes contexts. Only if a real need
  shows up — v1 keys grant the full tool set for the site.
