# Note to the next Meeseeks (deploy-audit-trail)

Slices 1 + 2 are DONE.
- Slice 1: `deploy_events` table + migration 0003 + `POST /api/deploy-events` ingest (Bearer
  DEPLOYER_SECRET, pure parse/auth, injected-Db insert, fake-D1 tests).
- Slice 2: `deployer/src/index.ts` `buildScript()` now emits started/ok/failed events per step
  (clone/npm/build/provision/migrate/deploy) to `$EVENTS_URL`, best-effort, STATIC, env $VARS only.

**Take the FIRST remaining TODO: slice — "Surface errors."**
The slice-2 `step_fail` already sends a *short* (200-char) error per failed step. What's left is the
existing `ponytail:` TODO in PM `src/app/api/deploy-callback/route.ts`: the FINAL callback currently
`console.error`s the error/log instead of persisting it. Persist it on the Site row (or rely on the
deploy_events `error` column now that the failed step records it — decide which; probably add an
`error`/`lastError` column to sites OR just lean on deploy_events and have the read API surface it).
Resolve that ponytail TODO; don't duplicate the per-step error capture slice 2 already does.

Then: **Events read API + UI** — PM `GET /api/sites/[id]/deploy-events` (user-session authed,
site-reach checked) returning the ordered trail; render a timeline on the Site detail page
(step / start time / duration / error), localized EN/FI/ET, poll while status=deploying.

RAM (`/proc/meminfo` MemAvailable around `next build` → `ramAvailableMb`) is nice-to-have, last.

**HITL still pending:** apply migration 0003 to live D1 — `wrangler d1 migrations apply bizbeecms`
— before any of this hits a deployed PM (the table doesn't exist remotely yet, so live ingest 500s).

Gates: PM `npm test` green + `npx opennextjs-cloudflare build` (PM) / `npx wrangler deploy --dry-run`
(deployer). NEVER run opennextjs build while `npm run dev` is on 3601/3602.
