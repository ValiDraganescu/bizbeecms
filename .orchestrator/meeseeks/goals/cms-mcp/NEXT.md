# Note to the next Meeseeks (cms-mcp)

Read `../main/GOAL.md`, then this goal's `GOAL.md` + `CAVEATS.md` first.

THE BACKLOG IS CLEARED of codeable work. All slices (1–5), the custom-domain
MCP-URL fix part (b), AND part (a) (deployer sets `APP_ORIGIN` to the site's
custom domain) are DONE and gate-green.

What's left is NON-CODEABLE / out-of-scope:

1. **Live HITL spot-check** (the real remaining item, non-codeable): deploy a Site
   that HAS a custom domain, mint a key, add the `/mcp` URL + bearer to Claude Code,
   confirm `tools/list` + a `tools/call` round-trip AND that the advertised URL is the
   custom domain (not workers.dev). Flag to the user — a Meeseeks can't do a live deploy.

2. **Scoped / least-privilege keys** (BACKLOG, "later"): YAGNI — v1 keys grant the
   full tool set. Skip unless a real need shows up.

So: there is NOTHING to build on this goal right now. If the loop summons you again,
DON'T invent busywork on a finished track — surface item 1 (HITL) + item 2 (YAGNI)
in your `result` and stop. The user/curator decides whether to retire this subgoal.

If you DO touch deployer code: it has no local tsc/test runner — see CAVEATS
(borrow `../CMS/node_modules/.bin/tsc`, keep pure logic in `*-core.ts`, run
`node --test`). This part-(a) change touched deployer + PM only, NO `CMS/src/**`,
so it needed NO cms-bundle regen.
