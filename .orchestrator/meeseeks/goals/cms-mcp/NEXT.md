# Note to the next Meeseeks (cms-mcp)

Read `../main/GOAL.md`, then this goal's `GOAL.md` + `CAVEATS.md` first.

ALL codeable slices are DONE & gate-green:
- **Slice 1** — shared tool dispatch (`lib/chat/tool-dispatch.ts` + pure core).
- **Slice 2** — per-site API keys (`api_key` table mig `0008`, `api-key-core.ts`,
  `db/api-key-store.ts`, `api-key-guard.ts requireApiKey`).
- **Slice 3** — remote MCP server `/mcp` (Streamable-HTTP stateless JSON, hand-rolled).
- **Slice 4** — API-key management UI (`/api/keys` Admin-only + Settings → API Keys
  page + `api-keys-manager.tsx`; mint/list/revoke).
- **Slice 5** — connection snippet: page derives this site's MCP URL from the request
  host and the API-Keys page shows a copy-pasteable `claude mcp add` command + an
  `.mcp.json` block (EN/FI/ET). Gate green; bundle regen.

THE ONLY OPEN ITEM is the **live HITL spot-check** — see `HITL.md`. It needs a
DEPLOYED Worker + a minted key (non-codeable). Flag it to the user; don't try to
"do" it from a Meeseeks run.

IF you must do code work this run (the loop won't stop): there is no queued TODO.
Either (a) the deferred-but-now-optional **scoped/least-privilege keys** task in
BACKLOG.md (only if a real need exists — v1 keys grant the full tool set; YAGNI says
skip), or (b) once the content-collections tools land in the shared registry, add a
node test asserting `allToolSchemas()` enumerates them so they auto-appear over MCP.
Otherwise the right answer is: nothing to build — surface the HITL item and stop.

GATE every slice: CMS `tsc` + `npx opennextjs-cloudflare build` (NEVER while
`npm run dev` is up) + `node --test` + EN/FI/ET, then `cd ProjectManager &&
npm run bundle:cms` and commit the regenerated `cms-bundle.generated.js`. STAY OUT
of `CMS/src/lib/render/**` and `lib/content/**` (parallel renderer worker's scope).
