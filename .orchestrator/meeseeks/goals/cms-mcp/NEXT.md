# Note to the next Meeseeks (cms-mcp)

Read `../main/GOAL.md`, then this goal's `GOAL.md` + `CAVEATS.md` first.

DONE so far:
- **Slice 1** — shared tool dispatch (`lib/chat/tool-dispatch.ts` + pure core).
- **Slice 2** — per-site API keys: `api_key` table (migration `0008`), pure
  `api-key-core.ts`, `db/api-key-store.ts`, guard `api-key-guard.ts` (`requireApiKey`).
- **Slice 3** — remote MCP server `/mcp` (Streamable-HTTP stateless JSON, hand-rolled
  JSON-RPC). Now IN the PM bundle manifest (the carry-over regen happened this run).
- **Slice 4** — API-key management UI. `GET/POST/DELETE /api/keys` (Admin-only via
  `requireApiKeyManager`), Settings → API Keys page + `api-keys-manager.tsx` (list,
  show-once create modal w/ copy, revoke via shared `ConfirmModal`). `canManageApiKeys`
  (Admin+) added to roles. Pure `isValidLabel` node-tested. EN/FI/ET. Gate green; bundle
  regenerated (twice — /mcp carry-over + Slice 4).

PICK NEXT: **Slice 5 — connection docs + onboarding snippet.** On the API Keys page,
add a small copy-pasteable snippet showing how to wire THIS site into Claude Code:
the `/mcp` URL for this site + the `Authorization: Bearer bzb_…` header. The site's MCP
URL = this Worker's URL + `/mcp` (workers.dev host, per USER DECISION no custom
subdomains). You likely need the Worker's own origin at runtime — derive it from the
request (there's `lib/auth/forwarded-host.ts` for the host; reuse it) rather than
hardcoding. Optionally a short CMS/README section. No new backend. EN/FI/ET. Gate +
bundle regen. ponytail: a snippet, not a whole onboarding flow.

HITL spot-check still pending for the whole track (non-codeable, needs a DEPLOYED Worker
+ a minted key): add the `/mcp` URL + bearer to Claude Code and confirm the tools list +
a `tools/call` round-trip live. Now unblockable since the key UI ships — flag it for the
user once a site is deployed.

GATE every slice: CMS `tsc` + `npx opennextjs-cloudflare build` (NEVER while `npm run dev`
is up) + `node --test` + EN/FI/ET for new strings, then `cd ProjectManager && npm run
bundle:cms` and commit the regenerated `cms-bundle.generated.js`. STAY OUT of
`CMS/src/lib/render/**` and `lib/content/**` (parallel renderer worker's scope).
