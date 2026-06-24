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

- TODO: **MCP URL must use the site's custom domain when one is configured.** BUG (USER 2026-06-24):
  the "Connect Claude Code" snippets show the `bizbeecms-cms-<slug>.workers.dev` URL even when the
  site has a custom domain. Root cause: Slice 5's `mcpUrlFromRequest()` (`api-keys/page.tsx:20`)
  derives the URL from the INCOMING REQUEST HOST — admin is browsed on workers.dev, so the snippet
  shows workers.dev; and `deployer/src/index.ts:520` ALWAYS sets `APP_ORIGIN` to the workers.dev URL
  even when a custom domain is attached (the deployer sets up the custom-domain DNS at ~293-294 but
  never feeds the chosen domain into APP_ORIGIN). The MCP endpoint should be advertised at the site's
  PRIMARY PUBLIC origin (the custom domain if attached, else workers.dev). FIX (two layers — confirm
  scope before splitting):
  (a) **Deployer:** when the site has an attached/primary custom domain, set `APP_ORIGIN` to
  `https://<custom-domain>` instead of the workers.dev URL (the custom-domain data lives PM-side — see
  archived `custom-domains`; thread the primary domain into the deploy so the deployer can pick it).
  Keep workers.dev as the fallback when no custom domain.
  (b) **CMS page:** stop deriving the MCP URL purely from the request host — prefer the deployed
  `APP_ORIGIN` (the site's configured public origin) for the advertised `/mcp` URL, falling back to the
  request host only when APP_ORIGIN is unset. Pure helper choosing the origin (customDomainOrigin ??
  appOrigin ?? requestHost) + node test. EN/FI/ET unaffected (URL only). Gate: CMS tsc + `npm test` +
  `npx opennextjs-cloudflare build` (dev OFF) + cms-bundle regen; deployer tsc + its test if (a) is in
  scope. NOTE cross-track: (a) touches the deployer + PM custom-domain data (archived `custom-domains`
  is read-only — read it, don't write it); if (a) is bigger than one run, do (b) first (correct as soon
  as APP_ORIGIN is right) and file (a) as its own follow-up.

- TODO (later) — **scoped / least-privilege keys.** If needed: per-key tool scopes
  (read-only key vs. full) reusing the tool-scopes contexts. Only if a real need
  shows up — v1 keys grant the full tool set for the site.
