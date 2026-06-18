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
- **PM `node --test` can't resolve the `@/` alias** (CMS pattern: import via relative `.ts`). But the
  **Next bundler** then rejected `.ts` import extensions until I added `allowImportingTsExtensions:
  true` to PM tsconfig (CMS already had it). So PM lib code that's also unit-tested must use relative
  `.ts` imports AND that tsconfig flag must stay set.
- **Don't import PM `src/db/index.ts` at module top in a node-testable lib** — it pulls in
  `@opennextjs/cloudflare` and has extensionless re-exports node can't resolve. Import `schema` from
  `../../db/schema.ts` directly, import the `Db` *type* type-only (erased), and lazy `await import`
  the index for `getDb()` only on the non-injected (production) path. See `lib/deploy/deploy-events.ts`.
- **Reuse the slice-1 ingest contract in slice 2**: the bash script must POST
  `{siteId, step, status: started|ok|failed, startedAt (ms epoch), durationMs?, error?, ramAvailableMb?}`.
  `parseDeployEvent` coerces shell strings → ints, so curl emitting numbers as quoted strings is fine.
- **Migration 0003 IS APPLIED to remote D1** (confirmed 2026-06-18). The earlier "HITL: apply 0003"
  note is now stale — live ingest no longer 500s on a missing `deploy_events` table.
- **Final deploy error lives in deploy_events, NOT a `sites` column.** Slice 3 persists the
  callback's final error+log tail as a terminal `failed` event with `step: "callback"`. The read
  API/UI must surface that row's `error` on failure. Don't re-add a `sites.error` column — that was
  the rejected alternative (extra migration for what the trail already covers).
- **deploy-callback persistence is best-effort (try/catch).** The error-event insert must never throw
  past the catch — `setSiteDeployStatus` (the status latch) MUST still run. Keep that ordering.
- **`date +%s%3N` is GNU-only.** Slice 2's `now_ms()` uses it; works in the Linux container but
  prints a literal `N` on macOS/BSD — so the bash emit helpers can only be functionally tested on
  Linux (or with a stubbed `now_ms`). Don't "fix" it for macOS; the container is GNU/Linux.
- **Render-then-bash-check the deployer script offline:** the build script is a JS template literal.
  `node -e` to `eval` the literal (proves no stray un-escaped `${}` JS interpolation) → write to a
  file → `bash -n` for syntax. Real `${}` shell refs must be written `\${...}` in the .ts source.
- **Deployer gate is `npx wrangler deploy --dry-run`, NOT opennextjs build.** The deployer is a plain
  Worker (no Next). Dry-run bundles the TS + builds the Sandbox container image = full validation.
- **Slice 2 emits `step_fail` BEFORE the existing `report failed`** on each checkpoint, so both the
  per-step trail and the final single callback fire. Don't remove either; they serve different sinks.
