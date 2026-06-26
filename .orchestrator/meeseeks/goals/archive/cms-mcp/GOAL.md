# Goal: cms-mcp
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Expose the CMS AI-assistant's tools over a **remote MCP server on each per-Site CMS
Worker**, authenticated by a **per-site API key**, so a local agent (Claude Code)
can manage a specific deployed website directly — more powerful and cheaper than
the in-CMS chat (the user's local agent brings its OWN model; the Worker just
executes tools).

USER DIRECTIVE (2026-06-22): "Expose all ai assistant tools to a CLI and find a way
to connect the CLI to a specific website so that a local Claude Code could manage a
website (more powerful and cheaper than doing it from the CMS)."

## The settled architecture (decided with user 2026-06-22)
- **Protocol = a remote MCP server** mounted on the per-Site CMS Worker (e.g.
  `https://bizbeecms-cms-<slug>.workers.dev/mcp`), NOT a bespoke CLI. Claude Code
  connects as a native remote MCP server and the tools just appear. (MCP is exactly
  the native way Claude Code consumes external tools — no CLI binary to build/ship.)
- **"Cheaper than the CMS"**: the in-CMS chat pays for the LLM on the Worker side;
  here the user's LOCAL Claude Code brings its own model. The Worker only runs tool
  handlers (cheap). Same tools, different (free-to-us) driver.
- **Auth = per-site API key**, minted/managed in the CMS admin UI (Admin-only),
  stored HASHED in an `api_keys` table on the per-Site D1. Passed as
  `Authorization: Bearer <key>`. There is NO token mechanism today (only the
  session cookie + the shared `CMS_AUTH_SECRET` deploy secret — which must NEVER be
  handed to a client), so this key path is net-new and REQUIRED.
- **Reuse the EXISTING tool handlers** — `app/api/chat/route.ts` already dispatches
  clean handler functions (validate → store call) and the stores are directly
  callable. The MCP server wraps those SAME handlers; do NOT re-implement tool logic
  or fork the data path. Extract the dispatch/handlers into a shared module both the
  chat route AND the MCP server call.
- **One site per key/endpoint**: each deployed Worker IS one site (own D1/R2,
  `SITE_ID` env). A key authorizes managing THAT site only. Claude Code points at
  that site's Worker URL + its key.

## What "good" looks like
- An operator opens CMS → Settings → API Keys, generates a key (shown once),
  optionally revokes it. Keys are Admin-only (cms-auth role model), hashed at rest.
- Claude Code adds the site's `/mcp` URL + the key to its MCP config and sees ALL
  the assistant tools as native tools: create/update component, create page /
  update blocks, translate, list/get (components/pages/locales/brand/theme/assets),
  update brand/theme, and the content-collections tools once those exist.
- Calling a tool over MCP runs the SAME validated handler + store as the chat tool
  — identical behavior, identical safety gates.
- The MCP endpoint is auth-gated by the API key (bearer); unauthenticated/invalid
  key = rejected. The browser chat route keeps working unchanged (cookie auth).
- Gate every slice: CMS `tsc` + `opennextjs-cloudflare build` green; regen the PM
  `cms-bundle`; EN/FI/ET for any new UI strings.

## Dependencies / ordering
- **Tool surface**: wraps whatever tools exist. Land the core tools first (they
  exist); the content-collections tools join automatically once that subgoal adds
  them to the shared registry — design the MCP server to enumerate the SHARED tool
  registry, not a hardcoded list, so new tools appear for free.
- **Auth/roles**: the key-management UI is Admin-gated via the `cms-auth` role
  model — coordinate (the API-key check is a SECOND guard path alongside cms-auth's
  cookie/SSO path).

## Reference (current state, verified 2026-06-22)
- NO MCP anywhere in the repo today (net-new).
- Tool dispatch + clean handlers: `app/api/chat/route.ts` (`runToolsRound` ~254,
  `handleCreateComponent` ~318, etc.). Tool schemas: `lib/chat/{read-tools,
  write-tools,component-tool,page-tool,translate-tool,list-assets-tool}.ts`. Scopes:
  `lib/chat/tool-scopes.ts` (KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + TOOL_BY_NAME).
- Stores (directly callable): `db/{component-store,page-store,settings-store,
  translate-store,asset-store}.ts`.
- Auth today: `lib/auth/guard.ts` (`requireAdmin` → cms-validate cookie/SSO; NO
  api-key path). Site identity: `SITE_ID`/`PM_ORIGIN`/`CMS_AUTH_SECRET` env
  (deployer-injected, `wrangler.jsonc` vars). URL: `bizbeecms-cms-<slug>.<acct>
  .workers.dev`.
