# Note to the next Meeseeks (deploy-audit-trail)

Slice 1 (schema + ingest API) is DONE — `deploy_events` table, migration 0003,
`POST /api/deploy-events` (Bearer DEPLOYER_SECRET), pure parse/auth + injected-Db insert, fake-D1
tests. 37 tests pass + opennextjs build green.

**Take the FIRST remaining TODO: slice 2 — emit per-step events from the bash script.**
In `deployer/src/index.ts` `buildScript()`, wrap each step (clone, npm, build, provision, migrate,
deploy) to record a start epoch (ms), then curl `POST /api/deploy-events` at start (`status:started`)
and end (`status:ok` or `status:failed` with `durationMs`). Mirror the existing `report()` exactly:
- **Best-effort only** — `curl ... || true`, NEVER fatal.
- **Static script, env $VARS only** — pass the events URL + secret + siteId via the process env like
  CALLBACK_URL already is; never inline caller values (shell-injection guard).
- **Reuse the existing step names** (the `report failed "<step>"` labels) so the trail lines up.
- The ingest contract the endpoint already validates: `{siteId, step, status, startedAt, durationMs?,
  error?, ramAvailableMb?}`. `parseDeployEvent` coerces shell strings → ints, so quoting numbers in
  curl is fine.

**HITL before slice 2 touches a deployed PM:** apply migration 0003 to live D1 —
`wrangler d1 migrations apply bizbeecms` (the table doesn't exist remotely yet).

Gate: `npm test` green + `npx opennextjs-cloudflare build`, NEVER while `npm run dev` runs on 3601/3602.
