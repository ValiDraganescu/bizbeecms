# Note to the next Meeseeks (deploy-audit-trail)

All slices DONE + both timeline bugs FIXED (P2 double-row collapse, P1 cross-run mixing).
The full per-step audit trail is built, visible, de-duplicated, and run-isolated:
- Slice 1: `deploy_events` table + migration 0003 (APPLIED to remote D1) + `POST /api/deploy-events`.
- Slice 2: `deployer/src/index.ts` `buildScript()` emits started/ok/failed per step.
- Slice 3: deploy-callback persists the FINAL error+log tail as a terminal `failed` `callback` event.
- Slice 4: `GET /api/sites/[id]/deploy-events` (USER-session authed) + `deploy-timeline.tsx` Card.
- Slice 5: build step samples `/proc/meminfo` MemAvailable → `ramAvailableMb`.
- P2 FIX: `collapseDeployEvents()` folds started+ok/failed per step into ONE row.
- P1 FIX: per-run `deploy_id`. Migration `0004_legal_fabian_cortez.sql` (drizzle-generated, nullable).
  Deployer mints `crypto.randomUUID()` per invocation, passes `DEPLOY_ID` via env; bash emit + both
  report bodies carry `deployId`. `selectLatestRun(events)` (pure) runs BEFORE collapse in the UI.

**DRIVER ACTION PENDING (P1 fix needs this to take effect live):**
- Apply migration 0004 to remote D1: `cd ProjectManager && npx wrangler d1 migrations apply bizbeecms`
- Redeploy BOTH workers: PM (`npx opennextjs-cloudflare deploy` / its deploy path) AND
  `cd deployer && npx wrangler deploy` (so the DEPLOY_ID-emitting script ships).
  Until then, NEW events get a real deploy_id but OLD rows are null — `selectLatestRun` still works
  (latest = the newest deploy_id once a fresh run lands; legacy nulls group together).

**ONLY ONE TODO LEFT: "Verify end-to-end."** Needs a REAL deploy (not just dry-run):
- Trigger a live deploy → confirm a full ordered trail, EACH STEP ONCE, ONLY the latest run's rows
  (deploy a Site, let it fail, deploy again → the new run replaces the old in the timeline, no interleave),
  build event shows `· {mb} MB free`, terminal callback row surfaces.
- Force a step failure → failed step's error + `callback` row's final error/log tail render.
- Confirm an emit failure (EVENTS_URL → 500) does NOT break the deploy.
- Operational/HITL — likely needs the human to run the live deploy + observe.
- Don't trigger deploys yourself if one may be in flight.

Gates: PM `npm test` + `npx opennextjs-cloudflare build`. Deployer gate = `wrangler deploy --dry-run`.
NEVER run opennextjs build while `npm run dev` is on 3601/3602.
