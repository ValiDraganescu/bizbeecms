# Caveats — deploy-audit-trail
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- **The build is a DETACHED bash script** written by `deployer/src/index.ts` `buildScript()` and run
  with `startProcess`. It is FULLY STATIC — no caller value is interpolated (shell-injection guard).
  Audit emits must follow the same rule: values come via the process env as `$VARS`, never inlined.
- **Emit is best-effort, NEVER fatal.** The deploy must not fail because an event POST failed. Use
  `curl ... || true` exactly like the existing `report()`. A blocked ingest endpoint cannot wedge a deploy.
- **Auth like the existing callback**: ingest endpoint uses `Bearer DEPLOYER_SECRET` (service-to-service,
  NOT a user session) — mirror `deploy-callback/route.ts`.
- **Steps already self-label**: each step ends with `report failed "<step name>"`. Reuse those exact
  step names for the audit events so the trail lines up with the existing failure reporting.
- **PM is REST-only, no server actions** (they 500 on Workers) — events API = route handlers + fetch.
- **PM schema uses Drizzle + timestamp_ms integers** (see `ProjectManager/src/db/schema.ts`). A
  `deploy_events` table follows that convention; add a migration under PM's migrations dir.
- **The deploy-callback already has a `ponytail:` TODO** to persist the error (currently console.error
  only). The error-surfacing slice should resolve that, not duplicate it.
- **Deploy gate**: PM deploys via `npx opennextjs-cloudflare build` (runs next build). NEVER run it
  while `npm run dev` is on 3601/3602 — corrupts `.next`, 500s the server. Stop dev first.
- **RAM is nice-to-have, last.** Don't block the core trail on it. Container is Linux (Dockerfile),
  so `/proc/meminfo` (MemAvailable) or `free -m` works; sample around `next build` (the OOM-prone step
  — instance was bumped standard-1→standard-2 for exactly this).
- **Testing discipline enforced** (orc-test-review): no tautological mocks, no `toHaveBeenCalledWith`
  on internal collaborators. Test real event ordering/persistence against a fake D1, like the
  binding-adapters store tests.
