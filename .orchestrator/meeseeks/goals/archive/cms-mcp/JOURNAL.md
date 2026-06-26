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

## 2026-06-22 14:00 — Slice 4: API-key management UI + bundle carry-over
- **Status:** DONE
- **What I did:**
  - CARRY-OVER: shared tsc gate is GREEN now → regenerated the PM
    `cms-bundle.generated.js`, so the Slice 3 `/mcp` route is finally in the Worker
    manifest. (Re-regenerated again after Slice 4's new route/strings.)
  - Slice 4 — API-key admin surface:
    - `GET/POST/DELETE /api/keys` (`CMS/src/app/api/keys/route.ts`) over the existing
      `db/api-key-store.ts` (list/create/revoke). POST returns the plaintext ONCE
      (`{key,item}`); DELETE takes `?id=` or `{id}`; POST stamps `createdBy` from the
      signed-in admin. Admin-only via `requireApiKeyManager`.
    - Page `admin/settings/api-keys/page.tsx` (role-gated via
      `checkRoleFromHeaders(canManageApiKeys)` — UI defense-in-depth; API is the real
      gate) + client `components/settings/api-keys-manager.tsx`: list, create, show-once
      copy modal, revoke via the SHARED `ConfirmModal` (no native confirm). Added the
      "API keys" tab to `settings-nav.tsx`.
    - Roles: `canManageApiKeys` (Admin+, deliberately a tier above `canManageUsers` —
      a key grants the full tool set) in `roles.ts`, re-exported + `requireApiKeyManager`
      wrapper in `guard.ts`.
    - Pure label validation `isValidLabel`/`normalizeLabel`/`MAX_LABEL_LEN` in
      `api-key-core.ts` (stays node-loadable).
    - i18n: `apiKeys` block + `settingsNav.apiKeys` in EN/FI/ET.
- **Verified:** `tsc --noEmit` clean; `npm test` 656/656 pass (added label + role tests);
  `npx opennextjs-cloudflare build` green (dev NOT running); PM `npm run bundle:cms`
  regenerated twice (carry-over /mcp + Slice 4). Could NOT exercise live D1 (needs a
  real binding) or the deployed-Worker MCP handshake (HITL — needs a deployed site +
  minted key).
- **Files:** CMS/src/app/api/keys/route.ts, CMS/src/app/admin/settings/api-keys/page.tsx,
  CMS/src/components/settings/api-keys-manager.tsx, CMS/src/components/settings/settings-nav.tsx,
  CMS/src/lib/auth/{roles.ts, guard.ts, api-key-core.ts}, CMS/scripts/api-key-core.test.mjs,
  CMS/src/lib/auth/roles.test.ts, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-22 14:51 — Slice 5: connection docs / onboarding snippet on the API-Keys page
- **Status:** DONE
- **What I did:** Added a "Connect Claude Code" section to the API-Keys page. The
  page derives THIS site's MCP URL server-side from the request host
  (`mcpUrlFromRequest()` in page.tsx: `x-forwarded-host`/`host` + proto → `…/mcp`;
  placeholder fallback) and passes it as a `mcpUrl` prop to `ApiKeysManager`. The
  manager renders two copy-pasteable blocks via a tiny local `CopyBlock` helper:
  (1) the `claude mcp add --transport http <url> --header "Authorization: Bearer
  bzb_YOUR_KEY"` CLI command, and (2) an `.mcp.json` config snippet with the same
  url + bearer header. Both copy to clipboard. No new backend. ponytail: a snippet,
  not an onboarding flow; reused the host header (no router HMAC needed since sites
  stay on workers.dev). Added `connectTitle/Intro/CliLabel/JsonLabel/Endpoint/Hint`
  to the `apiKeys` block in EN/FI/ET.
- **Verified:** CMS `tsc --noEmit` fully clean; `npm test` 733/733 pass; `npx
  opennextjs-cloudflare build` green; `cd ProjectManager && npm run bundle:cms`
  regenerated `cms-bundle.generated.js`. All three message JSONs parse. NOT verified
  live (needs a deployed Worker + minted key — that's the remaining HITL item).
- **Files:** CMS/src/app/admin/settings/api-keys/page.tsx,
  CMS/src/components/settings/api-keys-manager.tsx, CMS/messages/{en,fi,et}.json,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-26 08:36 — BUG fix (part b): advertise MCP URL from APP_ORIGIN, not request host
- **Status:** DONE
- **What I did:** Fixed the "Connect Claude Code" snippets showing the
  workers.dev URL even when a site has a custom domain (USER 2026-06-24). The
  root cause for the CMS layer: Slice 5's `mcpUrlFromRequest()` derived the URL
  purely from the INCOMING REQUEST HOST — admin is browsed on workers.dev, so the
  snippet showed workers.dev.
  - New PURE helper `chooseMcpUrl(appOrigin, requestHost, proto)` in
    `src/app/mcp/mcp-core.ts` (node-testable, no `@/`): prefer the deployer-injected
    `APP_ORIGIN` (the site's configured public origin — custom domain when attached,
    else workers.dev), strip trailing slashes, append `/mcp`; fall back to the
    request host ONLY when APP_ORIGIN is unset (local dev); placeholder otherwise.
  - `api-keys/page.tsx`: replaced `mcpUrlFromRequest()` with `mcpUrl()` which reads
    `env.APP_ORIGIN` via `getCloudflareContext({async:true})` and calls
    `chooseMcpUrl`. URL-only change → EN/FI/ET unaffected.
  - Did PART (b) only (correct as soon as APP_ORIGIN is right). PART (a) — the
    deployer setting `APP_ORIGIN` to the custom domain — is a cross-track follow-up
    (deployer + PM custom-domain data); filed as its own TODO in BACKLOG.
- **Verified:** `node --test src/app/mcp/mcp-core.test.ts` 13/13 (3 new
  chooseMcpUrl cases). `tsc --noEmit` 0 errors tree-wide. `npm test` 943/943.
  `npx opennextjs-cloudflare build` green (dev OFF). PM `npm run bundle:cms`
  regenerated `cms-bundle.generated.js`. NOT verified live (HITL — needs a
  deployed Worker with APP_ORIGIN set to a custom domain).
- **Files:** CMS/src/app/mcp/mcp-core.ts, CMS/src/app/mcp/mcp-core.test.ts,
  CMS/src/app/admin/settings/api-keys/page.tsx,
  ProjectManager/src/lib/deploy/cms-bundle.generated.js

## 2026-06-26 08:42 — Part (a): deployer sets APP_ORIGIN to the site's custom domain
- **Status:** DONE
- **What I did:** Closed the cross-track follow-up so the CMS finally advertises the
  RIGHT MCP URL (and trusted invite/reset links) when a Site has a custom domain. Two
  sides, no CMS source touched:
  - **deployer** (`deployer/src/index.ts`): `DeployBody` gains `appOrigin?: string`;
    parsed in the `/deploy` handler, threaded into `startDeploy`, and used for the
    `APP_ORIGIN` env var via the new pure `chooseAppOrigin(appOrigin, workersDevUrl)`.
    It PREFERS the passed value but only if it's a valid `https://<hostname>` origin
    (no path/query, no http, well-formed host) — else falls back to the workers.dev
    URL. Helper lives in a NEW pure `deployer/src/origin-core.ts` (no `@cloudflare/sandbox`
    import) so `node --test` can load it; `index.ts` imports it.
  - **PM** (`ProjectManager/src/app/api/sites/[id]/deploy/route.ts`): before
    dispatching, looks up the Site's primary serve domain via the EXISTING
    `primaryDomainBySite([siteId])` (newest non-redirect custom hostname) and sends
    `appOrigin: https://<domain>` in the deploy body when present (omitted otherwise).
- **Verified:** `node --test deployer/src/origin-core.test.ts` → 8/8 green (prefers
  valid https domain, strips trailing slash, trims ws, rejects http/path/query/junk/
  malformed host, falls back on absent). deployer source tsc clean (CMS's tsc, -p its
  tsconfig, excluding the new *.test.ts). PM `npx tsc --noEmit` clean. NO cms-bundle
  regen needed — no `CMS/src/**` change (bundle ships CMS, not deployer/PM routes).
  NOT verified live (HITL: needs a real deploy of a Site that has a custom domain).
- **Files:** deployer/src/index.ts, deployer/src/origin-core.ts,
  deployer/src/origin-core.test.ts, deployer/tsconfig.json,
  ProjectManager/src/app/api/sites/[id]/deploy/route.ts
