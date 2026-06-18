# Backlog — deploy-audit-trail
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)
- DONE: BUG [P2]: deploy timeline showed each step TWICE (Running row + Done row) — reported 2026-06-18. Fixed CLIENT-SIDE only: new pure `collapseDeployEvents(events)` helper in `lib/deploy/deploy-events.ts` folds the started+ok/failed pair into one row per `step` (latest status, duration from the terminal row, first-seen startedAt/id/ram preserved, failed error kept). `deploy-timeline.tsx` maps the collapsed `rows` instead of raw `events`. No schema/API/bash change — both raw rows stay persisted. 4 new pure unit tests (46 pass). Gate: npm test + opennextjs build green. (2026-06-18)

## Tasks
(Vertical slices, ordered so each leaves the deploy working. Core trail first, RAM last.)

- DONE: **Schema + ingest API.** `deploy_events` table + migration `0003_curvy_dragon_man.sql`,
  `POST /api/deploy-events` (Bearer DEPLOYER_SECRET), pure `parseDeployEvent`/`isAuthorized` +
  injected-Db `insertDeployEvent`, fake-D1 unit tests (37 pass). (2026-06-18)
  NOTE: migration 0003 NOT yet applied to live D1 — HITL `wrangler d1 migrations apply bizbeecms`
  before the slice-2 bash-script emit hits a live PM (else the ingest 500s on a missing table).
- DONE: **Emit per-step events from the bash script.** `buildScript()` now wraps all 6 steps
  (clone/npm/build/provision/migrate/deploy) with `step_start`/`step_ok`/`step_fail` → best-effort
  (`curl ... || true`) POST to `$EVENTS_URL` (passed via env like CALLBACK_URL) of started/ok/failed
  events {siteId, step, status, startedAt, durationMs?, error?}. STATIC, env $VARS only. Validated by
  `wrangler deploy --dry-run` + `npm test` (37). (2026-06-18)
- DONE: **Surface errors.** deploy-callback/route.ts now persists the FINAL deployer error + log
  tail as a terminal `failed` deploy_event (`step: "callback"`) via slice-1 `insertDeployEvent`,
  resolving the `ponytail:` TODO. Chose deploy_events over a `sites.error` column (zero schema churn;
  trail + read-API already render it). Best-effort try/catch — never breaks the status latch.
  New pure `buildFailedCallbackEvent` (error+log combine), 3 new fake-D1 tests (40 pass). (2026-06-18)
- DONE: **Events read API + UI.** PM `GET /api/sites/[id]/deploy-events` (user-SESSION authed,
  same site-reach check as the deploy trigger) returns `{status, events}` ordered oldest-first.
  New `listDeployEventsForSite(siteId, injectedDb?)` query in `lib/deploy/deploy-events.ts`
  (relative-`.ts`, injected-Db seam). Client `deploy-timeline.tsx` renders step/start/duration/error
  (+ram), polls every 5s while status=deploying, stops on deployed/failed; mounted in a Card on the
  Site detail page. Localized EN/FI/ET (`sites.timeline`). 2 new fake-D1 tests (order+filter SQL,
  row mapping) → 42 pass. Gate: opennextjs build green. (2026-06-18)
- DONE (nice-to-have): **Container RAM during build.** `read_ram_mb()` reads `/proc/meminfo`
  MemAvailable (kB→MB, portable Linux); `emit_event` appends `ramAvailableMb` only when the module
  var `STEP_RAM_MB` is non-empty. The build step samples it before+after `next build`; `step_start`
  clears it so no other step reports ram. Best-effort: MemAvailable absent → no field. STATIC, env
  $VARS only, never fatal. Verified by render-eval + `bash -n` + a 5-case functional harness, plus
  deployer `wrangler deploy --dry-run` + PM `npm test` (42). UI/schema/parse already accept ram. (2026-06-18)
- TODO: **Verify end-to-end.** `npx opennextjs-cloudflare build` green; a real deploy produces a full
  ordered trail with timings; a forced step failure records the error; emit failure does not break deploy.
