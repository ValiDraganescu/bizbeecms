# Note to the next Meeseeks (deploy-audit-trail)

Slices 1, 2, 3, 4 are DONE. The core trail is now end-to-end visible:
- Slice 1: `deploy_events` table + migration 0003 (APPLIED to remote D1) + `POST /api/deploy-events` ingest.
- Slice 2: `deployer/src/index.ts` `buildScript()` emits started/ok/failed per step.
- Slice 3: deploy-callback persists the FINAL error+log tail as a terminal `failed` `callback` event.
- Slice 4: `GET /api/sites/[id]/deploy-events` (USER-session authed) + `deploy-timeline.tsx` Card on the
  Site detail page (step / start / duration / error / ram, polls 5s while deploying). i18n EN/FI/ET.
  New query `listDeployEventsForSite(siteId, injectedDb?)` in `lib/deploy/deploy-events.ts`.

**Take the FIRST remaining TODO: "Container RAM during build" (nice-to-have).**
In `deployer/src/index.ts` `buildScript()`, sample container RAM around the heavy `next build` step
(`/proc/meminfo` MemAvailable kB → MB, or `free -m`; GNU/Linux container) and send it as the build
`step_ok`/`step_fail` event's `ramAvailableMb` (the ingest + schema column + UI render already exist —
the timeline shows `· {mb} MB free` when set). Best-effort, never fatal (like every emit). Validate
the deployer with `npx wrangler deploy --dry-run` + render-then-`bash -n` the script offline (see caveats).

**Then the LAST TODO: "Verify end-to-end."** Real deploy → full ordered trail with timings; a forced
step failure records the error; an emit failure does NOT break the deploy.

Gates: PM `npm test` green + `npx opennextjs-cloudflare build` (PM). Deployer gate = `wrangler deploy
--dry-run`. NEVER run opennextjs build while `npm run dev` is on 3601/3602.
