# Backlog — cms-mcp
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
Build order: extract the shared tool dispatch first, then API-key auth, then the MCP
transport, then the key UI. Each slice gates on CMS tsc + opennext build green +
node tests + EN/FI/ET for new strings.

- TODO: **Slice 1 — extract a SHARED tool dispatch module (refactor, no behavior
  change).** Pull the tool dispatch + handlers out of `app/api/chat/route.ts`
  (`runToolsRound` + the `handle*` functions) into a reusable module
  (e.g. `lib/chat/tool-dispatch.ts`) that takes `(toolName, args)` → runs the same
  validate→store handler → returns a structured result (no SSE coupling). The chat
  route then CALLS this module (its SSE loop just streams the results). Build the
  callable tool list from the SHARED registry (KNOWN_TOOL_NAMES/TOOL_BY_NAME) so any
  tool added there is dispatchable. Pure-ish, node-tested (dispatch a known tool →
  handler runs; unknown tool → structured error). Behavior identical to today. Gate.

- TODO: **Slice 2 — per-site API keys: schema + auth guard.** Add an `api_keys`
  table to the per-Site D1 (`db/schema.ts`): id, keyHash (hash of the key — NEVER
  plaintext), label, createdBy, createdAt, lastUsedAt, revokedAt. Drizzle migration.
  Pure helpers (node-tested): generate a key (prefix `bzb_` + random), hash + verify,
  `parseBearer(header)`. A guard `requireApiKey(request)` → hash the bearer → lookup
  non-revoked → allow/deny (constant-time compare). Keep SEPARATE from the cookie
  guard. NO MCP yet — just the table + the auth primitive + tests.

- TODO: **Slice 3 — MCP server endpoint on the Worker (the core).** Mount an MCP
  remote-server endpoint (`/mcp`) on the CMS Worker, auth-gated by `requireApiKey`
  (Slice 2). Implement the MCP transport Claude Code expects for a REMOTE server
  (streamable-HTTP / SSE — VERIFY current expectation + whether to use an SDK vs.
  hand-rolled JSON-RPC; spike this first, note the choice in JOURNAL). Expose the
  SHARED tool registry (Slice 1): MCP `tools/list` from the registry schemas, MCP
  `tools/call` → the shared dispatch → structured result. The browser `/api/chat`
  stays unchanged. Test the JSON-RPC shape (list returns the tools; call routes to a
  handler; bad key rejected) without a live agent. Gate.

- TODO: **Slice 4 — API-key management UI (CMS admin).** CMS → Settings → API Keys:
  list keys (label, created, last used, revoked), generate (show the key ONCE in an
  in-app modal — never again), revoke (in-app confirm modal, NO native confirm).
  Admin-only via the cms-auth role model (or requireAdmin until roles land — note).
  `GET/POST/DELETE /api/keys`. Reuse design-system + purpose tokens. EN/FI/ET.
  Pure validation (label) node-tested. Gate.

- TODO: **Slice 5 — connection docs + onboarding snippet.** A small in-UI snippet
  on the API Keys page showing how to wire this site into Claude Code (the `/mcp`
  URL for THIS site + the bearer header), copy-pasteable. Optionally a short
  CMS/README section. No new backend. EN/FI/ET. Gate. (ponytail: docs+snippet, not a
  whole onboarding flow.)

- TODO (later) — **scoped / least-privilege keys.** If needed: per-key tool scopes
  (read-only key vs. full) reusing the tool-scopes contexts. Only if a real need
  shows up — v1 keys grant the full tool set for the site.
