# Caveats — cms-mcp
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **REUSE the existing tool handlers — do NOT re-implement tool logic.** The chat
  route (`app/api/chat/route.ts`) already has clean, validated handlers
  (validate→store) and the stores are directly callable. The MCP server must call
  the SAME handlers via a SHARED dispatch module — extract the dispatch + handlers
  out of the chat route into something both call. A forked tool path = two code
  paths to keep in sync + drift in the safety gates. Don't.

- **Enumerate the SHARED tool registry, not a hardcoded list.** New tools (e.g.
  content-collections) must appear over MCP automatically. Build the MCP tool list
  from the same KNOWN_TOOL_NAMES / TOOL_BY_NAME registry the chat route uses, so
  adding a tool there exposes it everywhere. (`tool-scopes.ts`.)

- **API-key auth is NET-NEW and REQUIRED — there is no token path today.** Auth is
  currently session-cookie + PM-SSO (`guard.ts requireAdmin`). The shared
  `CMS_AUTH_SECRET` is a DEPLOY secret and must NEVER be given to a client. Add an
  `api_keys` table (per-Site D1): store a HASH of the key (never plaintext), show the
  key ONCE at creation, support revoke. The MCP endpoint guard checks the bearer key
  → hash → lookup; invalid/missing = reject. Keep this guard SEPARATE from but
  alongside the cookie guard (the chat route stays cookie-authed).

- **Key generation/management is Admin-only via the cms-auth role model.** Coordinate
  with the `cms-auth` subgoal — the key-management UI sits behind `canManageUsers`/
  Admin. If cms-auth roles haven't landed, gate on the existing requireAdmin for now
  and note the follow-up.

- **Workers MCP transport.** MCP over a Cloudflare Worker = HTTP/SSE transport (no
  stdio on a Worker). Confirm the current MCP remote-server transport Claude Code
  expects (streamable-HTTP / SSE) and implement that; there's a Cloudflare
  `agents`/MCP story — check whether to use an SDK or hand-roll the JSON-RPC over
  HTTP. Verify against current docs before committing the transport (this is the one
  unknown — spike it first).

- **One Worker = one site.** A key authorizes the ONE site that Worker serves
  (`SITE_ID`). No cross-site access. The MCP URL is that site's Worker URL + `/mcp`.

- **Don't break the browser chat.** `/api/chat` (cookie-authed SSE for the in-CMS
  widget) stays exactly as-is. MCP is an ADDITIONAL surface over the same handlers,
  not a replacement.

- **Node `--test` can't load `@/db/*` (CF-coupled) modules.** Project convention:
  tests import `.ts` directly via Node type-stripping with NO `@/` alias. So split
  CF-coupled code: keep the PURE, testable logic in a sibling `*-core.ts` (no `@/`,
  relative imports only) and the store-bound code in the main module that imports
  the core. Done for tool-dispatch (`tool-dispatch-core.ts` is tested;
  `tool-dispatch.ts` is not). Do the same for the Slice 2 key helpers.

- **Regen the PM bundle after ANY CMS source change.** `ProjectManager` ships the
  CMS as `src/lib/deploy/cms-bundle.generated.js`. After touching `CMS/src/**`, run
  `cd ProjectManager && npm run bundle:cms` (it rebuilds CMS via opennext then
  esbuild-bundles the worker) and commit the regenerated `.generated.js`.

- **Migrations dir is `CMS/migrations/`, NOT `drizzle/`.** `drizzle.config.ts`
  has `out: "./migrations"`. Generate with `npm run db:generate` (drizzle-kit) —
  it auto-numbers (next was `0008_*`) and updates `migrations/meta/_journal.json`.
  Commit the new `.sql` AND the meta journal/snapshot. D1 apply is HITL/deployer.

- **API-key crypto uses Web Crypto (`globalThis.crypto`), not node:crypto.** Works
  on both the Worker and Node 20+ so `api-key-core.ts` stays pure + node-`--test`
  loadable. SHA-256 hex via `crypto.subtle.digest`; random via `getRandomValues`.
  `requireApiKey` (api-key-guard.ts) is a SECOND guard, fully separate from the
  cookie `requireAdmin`. The store uses the `getDb()` Db port (never raw `env.DB`),
  so it doesn't trip the sole-reader env.DB guard.

- **MCP transport = Streamable HTTP, stateless JSON mode (SETTLED Slice 3).** The
  `/mcp` route POSTs one JSON-RPC 2.0 message → one JSON-RPC response as
  `application/json`. NO session id, NO standing SSE stream, NO server-initiated
  notifications (our tools are pure request/response). Protocol version `2025-06-18`.
  Hand-rolled in `app/mcp/mcp-core.ts` — do NOT add `@modelcontextprotocol/sdk`
  (Node-coupled/heavy; we need ~5 methods). MCP tool entries are `{name, description,
  inputSchema}`; our function-calling schemas are `{type:function, function:{name,
  description, parameters}}` — `toMcpTools` maps them (parameters→inputSchema, missing
  →empty object schema). Keep `listTools`/`runTool` INJECTED into `handleRpc` so the
  pure core stays node-testable and the data path stays the shared one.

- **A RED shared tsc/opennext gate may be a PARALLEL worker's in-flight file, not
  yours.** Slice 3 hit `src/lib/content/binding.ts:37` TS2339 — the RENDERER worker's
  UNTRACKED file. Don't retry the shared opennext/bundle gate against another worker's
  transient error and don't touch their files; verify YOUR files are tsc-clean
  (`tsc --noEmit | grep src/app/mcp` → 0) and DEFER the bundle regen to a follow-up run
  once the tree's tsc is green. The bundle catch-up is a tracked follow-up, not a blocker.

- **Gate every slice:** CMS `tsc` + `npx opennextjs-cloudflare build` green (NEVER
  while `npm run dev` is up). Regen the PM `cms-bundle`. EN/FI/ET for new UI strings.
  No native confirm()/alert() — in-app modal for key revoke (browser-review sessions
  hang on native dialogs).
