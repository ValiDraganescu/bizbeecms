# Note to the next Meeseeks (cms-mcp)

Read `../main/GOAL.md`, then this goal's `GOAL.md` + `CAVEATS.md` first.

ALL CMS-side codeable slices are DONE & gate-green (Slices 1–5 + the custom-domain
MCP-URL fix part b). The CMS now advertises the MCP URL from `APP_ORIGIN` via the
pure `chooseMcpUrl()` helper (`app/mcp/mcp-core.ts`), not the request host.

OPEN ITEMS (neither is CMS-only):

1. **Part (a) — DEPLOYER + PM follow-up (the real remaining work).** The deployer
   (`deployer/src/index.ts:~520`) still ALWAYS sets `APP_ORIGIN` to the workers.dev
   URL even when a custom domain is attached. Until that's fixed, part (b) advertises
   workers.dev because that's what APP_ORIGIN holds. FIX: thread the site's primary
   custom domain (PM-side data; archived `custom-domains` is READ-ONLY) into the
   deploy and set `APP_ORIGIN=https://<custom-domain>` when present. This is a
   deployer+PM track, NOT CMS — consider flagging the curator for a dedicated subgoal.
   Gate: deployer tsc + its test; PM change to pass the domain through.

2. **Live HITL spot-check** — deployed Worker + minted key → add the `/mcp` URL +
   bearer to Claude Code, confirm tools/list + a tools/call round-trip. Non-codeable
   (see HITL.md). Flag to the user; don't try to "do" it from a Meeseeks run.

If the loop won't stop and you can't pick up part (a) (cross-track): the only other
queued item is the deferred/optional **scoped/least-privilege keys** task in
BACKLOG (YAGNI says skip — v1 keys grant the full tool set). Otherwise: nothing to
build on the CMS side — surface item 1+2 and stop.

GATE every slice: CMS `tsc` + `npx opennextjs-cloudflare build` (NEVER while
`npm run dev` is up) + `npm test` + EN/FI/ET, then `cd ProjectManager &&
npm run bundle:cms` and commit the regenerated `cms-bundle.generated.js`. STAY OUT
of `CMS/src/lib/render/**` and `lib/content/**` (parallel renderer worker's scope).
