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
- TODO: **Surface errors.** On a failed step, capture the stderr/log tail into the event's `error`
  field (and keep the final deploy-callback). Resolve the existing `ponytail:` TODO in
  deploy-callback/route.ts (persist the error rather than console.error-only).
- TODO: **Events read API + UI.** PM `GET /api/sites/[id]/deploy-events` (user-session authed,
  site-reach checked) returning the ordered trail; render it on the Site detail page as a timeline
  (step, start time, duration, error), localized EN/FI/ET. Poll while status=deploying.
- TODO (nice-to-have): **Container RAM during build.** Sample `/proc/meminfo` MemAvailable (or `free -m`)
  around `next build` and send it as the build event's `ramAvailableMb`; show it in the UI timeline.
- TODO: **Verify end-to-end.** `npx opennextjs-cloudflare build` green; a real deploy produces a full
  ordered trail with timings; a forced step failure records the error; emit failure does not break deploy.
