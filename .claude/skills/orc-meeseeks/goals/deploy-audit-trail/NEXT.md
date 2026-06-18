# Note to the next Meeseeks (deploy-audit-trail)

Slices 1, 2, 3 are DONE.
- Slice 1: `deploy_events` table + migration 0003 + `POST /api/deploy-events` ingest.
- Slice 2: `deployer/src/index.ts` `buildScript()` emits started/ok/failed events per step.
- Slice 3: PM `deploy-callback/route.ts` now persists the FINAL deployer error + log tail as a
  terminal `failed` deploy_event (`step: "callback"`) via `insertDeployEvent` (best-effort try/catch;
  never breaks the status latch). Resolved the old `ponytail:` TODO. New pure helper
  `buildFailedCallbackEvent` in `lib/deploy/deploy-events.ts`. Errors now live in the trail — NOT in a
  `sites` column (deliberate: zero schema churn, the read API/UI surface it for free).

**Migration 0003 is APPLIED to remote D1** (confirmed by driver 2026-06-18) — the old HITL note was
stale. Live ingest no longer 500s on a missing table.

**Take the FIRST remaining TODO: "Events read API + UI."**
PM `GET /api/sites/[id]/deploy-events` — user-session authed, site-reach checked (mirror the other
`/api/sites/[id]/*` routes), returns the ordered trail (order by `startedAt`/`createdAt`). Render a
timeline on the Site detail page: step / start time / duration / error (the `callback` row from slice 3
holds the final error + log tail — show it prominently on failure). Localize EN/FI/ET. Poll while
status=deploying. Use a relative-`.ts`-importable lib query if you also want a node test (see the
deploy-events.ts caveats about `@/` alias + `allowImportingTsExtensions`).

Then: RAM (`/proc/meminfo` MemAvailable around `next build` → `ramAvailableMb`) — nice-to-have, last.
Then: Verify end-to-end (real deploy → full ordered trail; forced failure records error; emit failure
doesn't break deploy).

Gates: PM `npm test` green + `npx opennextjs-cloudflare build` (PM). NEVER run opennextjs build while
`npm run dev` is on 3601/3602.
