# Note to the next Meeseeks (cms-mcp)

Read `../main/GOAL.md`, then this goal's `GOAL.md` + `CAVEATS.md` first.

DONE so far:
- **Slice 1** — shared tool dispatch (`lib/chat/tool-dispatch.ts` + pure
  `tool-dispatch-core.ts`); `runTool`, `allToolSchemas()`, `TOOL_BY_NAME`.
- **Slice 2** — per-site API keys: `api_key` table (migration `0008_famous_vertigo`),
  pure `lib/auth/api-key-core.ts`, `db/api-key-store.ts`, guard
  `lib/auth/api-key-guard.ts` (`requireApiKey`, fail-closed, separate from cookie guard).
- **Slice 3** — remote MCP server `/mcp` on the CMS Worker. Streamable-HTTP stateless
  JSON mode, hand-rolled JSON-RPC. `app/mcp/mcp-core.ts` (pure, node-tested) +
  `app/mcp/route.ts` (POST gated by `requireApiKey`; `tools/list` from
  `allToolSchemas()`; `tools/call`→`runTool`; GET→405). 10/10 node tests; tsc clean for
  my files. Browser `/api/chat` unchanged.

⚠️ **CARRY-OVER (do this FIRST next run): regen the PM cms-bundle.** Slice 3 could NOT
regen it because the shared CMS tsc/opennext gate was RED on the RENDERER worker's
in-flight `CMS/src/lib/content/binding.ts:37` (TS2339). The `/mcp` route IS new and the
Worker manifest needs it. Once the tree's `tsc --noEmit` is GREEN:
`cd ProjectManager && npm run bundle:cms` → commit the regenerated
`src/lib/deploy/cms-bundle.generated.js`. (Confirm dev server is NOT running first.)

PICK NEXT (after the bundle regen): **Slice 4 — API-key management UI (CMS admin).**
- CMS → Settings → API Keys: list (label, created, last used, revoked), generate
  (show the key ONCE in an in-app modal — never again), revoke (in-app confirm modal,
  NO native confirm/alert). Admin-only via the cms-auth role model (or `requireAdmin`
  until roles land — note it).
- `GET/POST/DELETE /api/keys` over the existing `db/api-key-store.ts` (list/create/
  revoke already exist). Reuse design-system + purpose tokens. EN/FI/ET strings.
- Pure label validation node-tested. Gate (tsc + opennext + node tests + bundle regen).

ONE HITL spot-check remains for the whole track (non-codeable): on a DEPLOYED Worker
with a minted key, add the `/mcp` URL + `Authorization: Bearer bzb_…` to Claude Code and
confirm the tools list + a `tools/call` round-trip live. Park it for after Slice 4 ships
the key UI (you need a real key to test).

GATE every slice: CMS `tsc` + `npx opennextjs-cloudflare build` (NEVER while
`npm run dev` is up) + `node --test` + EN/FI/ET for new strings, then regen the PM
bundle. You are the sole CMS worker for your scope; check for a parallel renderer worker
in `lib/content/**` before assuming a tsc error is yours.
