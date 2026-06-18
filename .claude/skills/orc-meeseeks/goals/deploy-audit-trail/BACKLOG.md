# Backlog — deploy-audit-trail
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

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
- TODO (nice-to-have): **Container RAM during build.** Sample `/proc/meminfo` MemAvailable (or `free -m`)
  around `next build` and send it as the build event's `ramAvailableMb`; show it in the UI timeline.
- TODO: **Verify end-to-end.** `npx opennextjs-cloudflare build` green; a real deploy produces a full
  ordered trail with timings; a forced step failure records the error; emit failure does not break deploy.
