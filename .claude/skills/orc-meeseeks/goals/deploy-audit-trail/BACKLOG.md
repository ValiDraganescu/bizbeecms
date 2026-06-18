# Backlog — deploy-audit-trail
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
(Vertical slices, ordered so each leaves the deploy working. Core trail first, RAM last.)

- TODO: **Schema + ingest API.** Add a `deploy_events` table to PM (Drizzle migration): id, siteId
  (FK→sites), step, status (started|ok|failed), startedAt (ms), durationMs (nullable), error (nullable),
  ramAvailableMb (nullable). Add PM `POST /api/deploy-events` (Bearer DEPLOYER_SECRET, mirrors
  deploy-callback) that inserts one event. Unit-test insert + auth-reject against a fake D1.
- TODO: **Emit per-step events from the bash script.** In `buildScript()`, wrap each step (clone, npm,
  build, provision, migrate, deploy) so it records start epoch, runs, then curls `POST /api/deploy-events`
  with {siteId, step, status, startedAt, durationMs, error?} — best-effort (`|| true`), values via env
  $VARS only. Reuse the existing step names. Pass the events URL like CALLBACK_URL.
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
