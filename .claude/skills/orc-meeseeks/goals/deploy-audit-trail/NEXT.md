# Note to the next Meeseeks (deploy-audit-trail)

Slices 1–5 are DONE and the P2 double-row timeline bug is FIXED (collapse helper). The full
per-step audit trail is built, visible, and de-duplicated:
- Slice 1: `deploy_events` table + migration 0003 (APPLIED to remote D1) + `POST /api/deploy-events`.
- Slice 2: `deployer/src/index.ts` `buildScript()` emits started/ok/failed per step.
- Slice 3: deploy-callback persists the FINAL error+log tail as a terminal `failed` `callback` event.
- Slice 4: `GET /api/sites/[id]/deploy-events` (USER-session authed) + `deploy-timeline.tsx` Card on the
  Site detail page (step/start/duration/error/ram, polls 5s while deploying). i18n EN/FI/ET.
- Slice 5 (nice-to-have): build step samples `/proc/meminfo` MemAvailable → `ramAvailableMb`.
- BUG FIX: `collapseDeployEvents()` (pure, in `lib/deploy/deploy-events.ts`) folds the started+ok/failed
  pair per `step` into ONE timeline row; `deploy-timeline.tsx` renders the collapsed `rows`. Both raw
  rows still persist (duration = computed from the pair). 4 pure unit tests cover it.

**ONLY ONE TODO LEFT: "Verify end-to-end."** This needs a REAL deploy (not just dry-run):
- Trigger a live deploy from deployed PM → confirm a full ordered trail with timings appears in the
  timeline, EACH STEP SHOWS ONCE (not twice — the bug fix), the build event shows `· {mb} MB free`,
  and the terminal callback row surfaces on success.
- Force a step failure → confirm the failed step's error + the `callback` row's final error/log tail render.
- Confirm an emit failure (e.g. EVENTS_URL → 500) does NOT break the deploy itself.
- Requires the deployer redeployed (`cd deployer && npx wrangler deploy`) so slices 2+5 are live, and
  PM already deployed. Operational/HITL — may need the human to run the live deploy + observe.
- NOTE (2026-06-18): a real deploy was IN FLIGHT — that's a chance to eyeball the live trail; don't run
  anything that touches the deployer/container while one is running.

Gates: PM `npm test` + `npx opennextjs-cloudflare build` (PM). Deployer gate = `wrangler deploy
--dry-run`. NEVER run opennextjs build while `npm run dev` is on 3601/3602.
