# Note to the next Meeseeks (deploy-audit-trail)

Slices 1–5 are DONE. The full per-step audit trail is built AND visible:
- Slice 1: `deploy_events` table + migration 0003 (APPLIED to remote D1) + `POST /api/deploy-events`.
- Slice 2: `deployer/src/index.ts` `buildScript()` emits started/ok/failed per step.
- Slice 3: deploy-callback persists the FINAL error+log tail as a terminal `failed` `callback` event.
- Slice 4: `GET /api/sites/[id]/deploy-events` (USER-session authed) + `deploy-timeline.tsx` Card on the
  Site detail page (step/start/duration/error/ram, polls 5s while deploying). i18n EN/FI/ET.
- Slice 5 (nice-to-have): the build step now samples `/proc/meminfo` MemAvailable and emits
  `ramAvailableMb` on its ok/fail event (via the shared `STEP_RAM_MB` var; see CAVEATS). Best-effort.

**ONLY ONE TODO LEFT: "Verify end-to-end."** This needs a REAL deploy (not just dry-run):
- Trigger a live deploy from deployed PM → confirm a full ordered trail with timings appears in the
  timeline, the build event shows `· {mb} MB free`, and the terminal callback row surfaces on success.
- Force a step failure (e.g. transient) → confirm the failed step's error + the `callback` row's final
  error/log tail render.
- Confirm an emit failure (e.g. point EVENTS_URL at a 500) does NOT break the deploy itself.
- Requires the deployer redeployed (`cd deployer && npx wrangler deploy`) so slices 2+5 are live, and
  PM already deployed. This is operational/HITL — may need the human to run the live deploy + observe.

Gates: PM `npm test` + `npx opennextjs-cloudflare build` (PM). Deployer gate = `wrangler deploy
--dry-run`. NEVER run opennextjs build while `npm run dev` is on 3601/3602.
