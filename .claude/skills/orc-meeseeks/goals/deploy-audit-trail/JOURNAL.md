# Journal — deploy-audit-trail
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-18 19:43 — Slice 1: deploy_events schema + POST /api/deploy-events ingest
- **Status:** DONE
- **What I did:**
  - Added `deployEvents` table to PM `src/db/schema.ts` (id, siteId FK→sites ON DELETE cascade,
    step, status started|ok|failed, startedAt ms, durationMs/error/ramAvailableMb nullable,
    createdAt). Generated migration `migrations/0003_curvy_dragon_man.sql` via `npm run db:generate`.
    Exported `DeployEvent`/`NewDeployEvent` + `DeployEventStatus` types.
  - New `src/lib/deploy/deploy-events.ts`: pure `isAuthorized(secret, bearer)` (same semantics as
    deploy-callback), pure `parseDeployEvent(body)` (validates + coerces shell-string numerics to
    int, nullable fields → null), and `insertDeployEvent(event, injectedDb?)` with an injected-Db
    seam (mirrors CMS binding-adapters store pattern). getDb is lazy-imported only when no db is
    injected so the test path never loads @opennextjs/cloudflare.
  - New route `src/app/api/deploy-events/route.ts`: Bearer DEPLOYER_SECRET auth (mirrors
    deploy-callback exactly), parse, insert. Service-to-service, NOT a user session.
  - Added `Db` type export to PM `src/db/index.ts`; added `allowImportingTsExtensions: true` to PM
    tsconfig (CMS already had it — required so the lib's relative `.ts` imports build under Next).
  - Test `src/lib/deploy/deploy-events.test.ts`: drives the REAL drizzle client over an in-memory
    fake D1 (records SQL+params), asserts a real `insert into "deploy_events"` with bound values +
    nullables-as-null; parse accept/reject; auth-reject. Honest assertions, no tautological mocks.
- **Verified:** `npm test` → 37 pass (5 new). `npx opennextjs-cloudflare build` green (dev confirmed
  not running on 3601/3602 first). Did NOT apply the migration to live D1 (HITL: `wrangler d1
  migrations apply bizbeecms`).
- **Files:** ProjectManager/src/db/schema.ts, src/db/index.ts, tsconfig.json,
  migrations/0003_curvy_dragon_man.sql (+ meta/0003_snapshot.json, _journal.json),
  src/lib/deploy/deploy-events.ts, src/lib/deploy/deploy-events.test.ts,
  src/app/api/deploy-events/route.ts

## 2026-06-18 19:48 — Slice 2: per-step events emitted from the deployer bash script
- **Status:** DONE
- **What I did:**
  - `deployer/src/index.ts` `startDeploy()` env block: added `EVENTS_URL` (PM_CALLBACK_ORIGIN
    + `/api/deploy-events`, empty if no origin), built exactly like the existing `CALLBACK_URL`.
  - `buildScript()`: added best-effort `emit_event()` (mirrors `report()`: `curl ... || true`,
    NEVER fatal; no-ops when `$EVENTS_URL` empty), `now_ms()` (`date +%s%3N`, GNU/Linux container),
    and `step_start`/`step_ok`/`step_fail` helpers that track `STEP_NAME`/`STEP_START_MS` shell
    state. Wrapped all 6 steps — clone, npm, build, provision, migrate, deploy — to POST
    `started` (with startedAt ms) then `ok` (+durationMs) or `failed` (+durationMs +sanitized
    error). Step names reuse the existing `report failed "<step>"` labels' intent. `step_fail`
    runs *before* the existing `report failed` on each checkpoint so both the trail and the final
    callback fire. Error text sanitized like report() (`tr '"\n' '  '`, cut 200).
  - JSON bodies match slice-1 `parseDeployEvent` contract `{siteId, step, status, startedAt,
    durationMs?, error?}`; numbers emitted as quoted strings (parseDeployEvent coerces). Fully
    STATIC — all values via process env $VARS, no caller interpolation (shell-injection guard).
- **Verified:** Rendered the template literal via node `eval` (proves no stray JS interpolation),
  `bash -n` syntax-OK. Functional harness with a stubbed curl + deterministic now_ms: started/ok/
  failed emit valid JSON, error sanitization works, empty EVENTS_URL no-ops cleanly. Gate:
  `npx wrangler deploy --dry-run` green (deployer is a plain Worker — TS bundles + container
  builds); PM `npm test` → 37 pass. Dev confirmed NOT on 3601/3602 first. NOT deployed live; NOT
  applied migration 0003 (still HITL).
- **Files:** deployer/src/index.ts

## 2026-06-18 19:52 — Slice 3: Surface errors (persist final deploy error)
- **Status:** DONE
- **What I did:**
  - Resolved the `ponytail:` TODO in PM `src/app/api/deploy-callback/route.ts`. On a `failed`
    callback it now PERSISTS the deployer's final `body.error` + build-log tail (`body.log`) as a
    terminal `failed` deploy_event (`step: "callback"`) via slice-1 `insertDeployEvent` — kept the
    existing `console.error` too (handy in `wrangler tail`). Persistence is wrapped in try/catch so
    it is best-effort and CANNOT break the status latch (`setSiteDeployStatus`) that follows.
  - **Storage choice:** reused the existing `deploy_events` trail rather than adding an `error`
    column to `sites`. Rationale: the trail table + read-API/UI already exist (slices 1, 4), so the
    error renders for free with zero schema churn / no new migration.
  - New pure helper `buildFailedCallbackEvent(siteId, error, log, now)` in
    `src/lib/deploy/deploy-events.ts`: combines reported error + log tail; tolerates missing/empty
    error (→ `(no error)`) and missing/empty log (not appended). Pure (caller passes `now`) → node-testable.
- **Verified:** `npm test` → 40 pass (3 new: pure combine, missing-error/log tolerance, and a
  fake-D1 insert proving the combined error binds into a real `insert into "deploy_events"`).
  `npx opennextjs-cloudflare build` green (dev confirmed NOT on 3601/3602 first). Honest assertions.
- **Files:** ProjectManager/src/app/api/deploy-callback/route.ts,
  src/lib/deploy/deploy-events.ts, src/lib/deploy/deploy-events.test.ts

## 2026-06-18 — Slice 4: Events read API + UI (visibility payoff)
- **Status:** DONE
- **What I did:**
  - PM `GET /api/sites/[id]/deploy-events` (`src/app/api/sites/[id]/deploy-events/route.ts`):
    USER-session authed (getCurrentUser) with the SAME site-reach check as the deploy trigger
    (`canManageSiteByCountry || isUserAssignedToSite`). NOT DEPLOYER_SECRET — this is user-facing.
    Returns `{ status, events }` (status from the Site row so the client knows when to stop polling).
  - New `listDeployEventsForSite(siteId, injectedDb?)` in `lib/deploy/deploy-events.ts`: relative-`.ts`
    + injected-Db seam (same node-testable pattern as `insertDeployEvent`). Orders
    `asc(startedAt), asc(createdAt)` → oldest-first timeline.
  - Client `src/app/(app)/sites/deploy-timeline.tsx`: fetches the trail, polls every 5s WHILE
    status==='deploying', stops on deployed/failed (mirrors deploy-form's poll). Renders per step:
    name, status Badge, start time (toLocaleTimeString), duration (ms/s), ram (if set), and the
    error in a `<pre>` for failed steps — incl. the terminal `callback` row (slice 3) holding the
    final deployer error + log tail. Design tokens only (border-border, bg-danger-subtle/text-danger).
  - Mounted in a Card on the Site detail page (`[id]/page.tsx`).
  - i18n `sites.timeline` (title/description/empty/ram/status.{started,ok,failed}) added to EN/FI/ET.
- **Verified:** `npm test` → 42 pass (2 new honest fake-D1 tests: compiled SELECT filters by
  site_id + orders started_at,created_at; seeded D1 rows map back through the real schema, startedAt
  → Date). `npx opennextjs-cloudflare build` green (dev confirmed NOT on 3601/3602 first).
- **Files:** ProjectManager/src/app/api/sites/[id]/deploy-events/route.ts,
  src/app/(app)/sites/deploy-timeline.tsx, src/app/(app)/sites/[id]/page.tsx,
  src/lib/deploy/deploy-events.ts, src/lib/deploy/deploy-events.test.ts, messages/{en,fi,et}.json
