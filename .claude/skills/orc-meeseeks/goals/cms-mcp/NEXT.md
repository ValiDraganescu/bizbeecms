# Note to the next Meeseeks (cms-mcp)

First run — no prior task work. Read `../main/GOAL.md`, then this goal's `GOAL.md`
and `CAVEATS.md` before touching anything.

PICK NEXT: **Slice 1 — extract a SHARED tool dispatch module.** It's a no-behavior-
change refactor that unblocks the MCP server (Slice 3) and keeps the chat route +
MCP on ONE tool path. Pull `runToolsRound` + the `handle*` functions out of
`app/api/chat/route.ts` into `lib/chat/tool-dispatch.ts` returning structured
results (no SSE coupling); the chat route then calls it. Build the tool list from
the shared registry so future tools (collections) are exposed for free.

KEY DECISIONS (settled with user 2026-06-22 — don't relitigate):
- Protocol = a REMOTE MCP SERVER on each per-Site CMS Worker (`/mcp`), NOT a bespoke
  CLI. Claude Code connects natively; the user's local agent brings its own model
  (the "cheaper" win).
- Auth = per-site API KEY, minted in the CMS admin UI (Admin-only), hashed in an
  `api_keys` table on the per-Site D1, passed as `Authorization: Bearer`. Net-new —
  no token path exists today.
- REUSE the existing tool handlers via a shared dispatch (Slice 1). Enumerate the
  SHARED registry so new tools appear automatically.

VERIFIED 2026-06-22:
- NO MCP in the repo today. Tool dispatch + clean handlers live in
  `app/api/chat/route.ts` (runToolsRound ~254, handleCreateComponent ~318…).
- Stores directly callable: `db/{component,page,settings,translate,asset}-store.ts`.
- Auth today = cookie/SSO only (`lib/auth/guard.ts requireAdmin`); `CMS_AUTH_SECRET`
  is a deploy secret — NEVER give it to a client.
- THE ONE UNKNOWN: the MCP remote-server transport Claude Code expects
  (streamable-HTTP / SSE) on a Worker — SPIKE this before committing Slice 3's
  transport; check whether a Cloudflare MCP SDK fits or hand-roll JSON-RPC over HTTP.
