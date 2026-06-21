# Goal: deploy-audit-trail
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Give operators **visibility into the per-Site CMS deploy process**: an **audit trail of every
step** with **start time + duration**, **any error that surfaces**, and (nice-to-have)
**container RAM during the build**. Today the deploy is a black box — a detached bash script in
the Sandbox Container emits exactly ONE terminal callback (`deployed`/`failed`), the build-log
tail is `console.error`-only, and the Site row stores only `status`/`deployStartedAt`/`workerName`.
We want the whole timeline persisted and viewable.

## The deploy path (verified 2026-06-18 — design around this)
- PM `POST /api/sites/[id]/deploy` → deployer Worker `POST /deploy` → writes a STATIC bash script
  into the Sandbox Container, `startProcess` detached, returns immediately.
- The script (`deployer/src/index.ts` `buildScript()`) runs ordered steps: git clone → npm ci →
  `opennextjs-cloudflare build` → provision per-Site D1 + R2 → d1 migrations → `wrangler deploy`,
  then `report()` curls PM `POST /api/deploy-callback` ONCE with the final status.
- PM `deploy-callback/route.ts` persists status via `setSiteDeployStatus`. There is **no per-step
  event ingestion** and **no error column** (a `ponytail:` comment there flags exactly this gap).
- Steps already have clear boundaries + a `report failed "<step>"` on each — the audit emit points
  map 1:1 onto those existing checkpoints.

## What "good" looks like
- A persisted, ordered **deploy-events** trail per Site (or per deploy run): each event has
  `step` name, `startedAt`, `durationMs`, `status` (started/ok/failed), and `error` text when failed.
- The bash script emits an event at the **start and end of each step** (clone/npm/build/provision/
  migrate/deploy) to a PM (or deployer) ingest endpoint, authed with `DEPLOYER_SECRET` like the
  existing callback. Best-effort: an emit failure must NEVER break the deploy.
- **Errors surface**: a failed step's stderr/log tail is captured into the event + shown, not just
  `console.error`. (Addresses the existing ponytail TODO — persist the error.)
- **RAM (nice-to-have)**: sample container memory (e.g. `/proc/meminfo` MemAvailable / `free -m`)
  around the heavy `next build` step and attach it to that step's event.
- The trail is **viewable** — minimally a PM API to fetch a Site's deploy events; ideally rendered
  on the Site detail page (timeline with per-step time + duration + error), localized EN/FI/ET to
  match the rest of PM.
- Zero regression to the deploy itself: `npx opennextjs-cloudflare build` green, deploy still works
  end-to-end, emit is fire-and-forget.

## Out of scope
- No new infra/queues — reuse the existing HTTP-callback pattern + PM's D1. No streaming/websockets
  (poll the events API). Keep it Cloudflare-native (matches main).
