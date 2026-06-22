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

## 2026-06-18 20:00 — Slice 5 (nice-to-have): container RAM during build
- **Status:** DONE
- **What I did:**
  - `deployer/src/index.ts` `buildScript()`: new `read_ram_mb()` — reads `/proc/meminfo`
    MemAvailable (`grep -m1 '^MemAvailable:' | awk '{print $2}'`, kB) and echoes `kb/1024` MB.
    Portable Linux source (container is Linux per Dockerfile); prints NOTHING if MemAvailable
    absent (best-effort — caller leaves the var empty, no field emitted, never breaks the deploy).
  - New module shell var `STEP_RAM_MB`. `emit_event` appends `"ramAvailableMb":"$STEP_RAM_MB"`
    ONLY when non-empty (parseDeployEvent coerces the quoted int string). `step_start` clears it
    so only a step that explicitly samples it reports ram.
  - The `build` step sets `STEP_RAM_MB=$(read_ram_mb)` before `npx opennextjs-cloudflare build`,
    captures `build_rc=$?`, re-samples after (post-build headroom), then `step_ok`/`step_fail`
    carry the ram value. The OOM-prone step is exactly why this slice exists (standard-1→standard-2).
  - Honored CAVEATS: STATIC (env $VARS only, no caller interpolation); `now_ms`/`date +%s%3N`
    left GNU-only as-is; emit stays `curl ... || true`. No PM-side changes — slice-1 schema/parse
    + slice-4 UI (`· {mb} MB free`) already accept `ramAvailableMb`.
- **Verified:** Render the template literal via node `eval` (no stray JS `${}`) → `bash -n` OK.
  Functional harness (stubbed curl/now_ms, fake meminfo): (1) non-build step emits NO ram,
  (2) build ok carries `"ramAvailableMb":"8192"`, (3) build fail carries ram + error, (4) step
  after build has ram cleared, (5) MemAvailable absent → no ram field. ALL PASS. Gates: deployer
  `npx wrangler deploy --dry-run` green (TS bundles + container image builds); PM `npm test` → 42
  pass (no PM code changed). Dev confirmed NOT on 3601/3602. NOT deployed live.
- **Files:** deployer/src/index.ts

## 2026-06-18 — BUG FIX [P2]: timeline rendered each step twice
- **Task:** Priority-0 human-reported bug. `deploy-timeline.tsx` mapped one row per RAW event;
  each step emits a `started` then an `ok`/`failed`, so every step showed twice (Running + Done).
- **Fix (client-side only, no schema/API/bash change — both raw rows stay persisted):**
  - New pure `collapseDeployEvents(events: TimelineRow[])` in `lib/deploy/deploy-events.ts`: groups by
    `step` (Map, insertion order = first-seen = step order), latest status wins, duration/error/ram from
    the terminal row with `?? prev` so a null never clobbers a set value (started row's startedAt/id/ram
    survive). `id` = first event's id (stable React key across polls).
  - `deploy-timeline.tsx` now maps `collapseDeployEvents(events)` instead of `events`. The empty-state
    guard still checks raw `events.length` (correct — no events = nothing to collapse).
- **Test (pure, no mocks):** 4 node --test cases — started+ok→one ok row w/ duration; started-only→
  Running; started+failed→failed+error kept; first-seen startedAt/id/ram preserved across the pair.
- **Verified:** PM `npm test` → 46 pass (was 42, +4). `npx opennextjs-cloudflare build` green. Dev
  confirmed OFF (3601/3602 free) before build; did NOT touch deployer/container (real deploy in flight).
- **Files:** ProjectManager/src/lib/deploy/deploy-events.ts (+collapseDeployEvents, TimelineRow),
  deploy-events.test.ts (+4), src/app/(app)/sites/deploy-timeline.tsx (import + use collapsed rows).

## 2026-06-19 15:57 — Show total deploy duration per run
- **Status:** DONE
- **What I did:**
  - New pure `runTotalDurationMs(steps)` in `lib/deploy/deploy-events.ts`: total wall-clock span of
    a run = (max step `startedAt + durationMs`) − (min step `startedAt`) over its COLLAPSED step rows.
    A still-running step (no `durationMs`) contributes only its start, so the total grows as steps land.
    NaN-safe (skips unparseable starts); returns null when no step has a parseable start; clamps ≥0.
  - `deploy-timeline.tsx`: surfaces the total in TWO places — (1) a header line above the current
    run's steps (`Total {duration}`), and (2) appended to each previous-run `<summary>` line
    (`· {duration}`). Both use the existing `fmtElapsed` (s / XmZZs) for consistency with per-step durs.
  - i18n `sites.timeline.total` ("Total {duration}") added EN/FI/ET.
  - Pure unit tests (3): span across two finished steps (302000ms), still-running step contributes
    only its start (2000ms), null when no parseable start.
- **Verified:** `npm test` → 80 pass (+3 new). `npx opennextjs-cloudflare build` green (dev confirmed
  NOT on 3601/3602 first). Codebase had already grown past the backlog note — `groupRunsByDeployId`,
  `DeployRun`, paged history, `fmtElapsed`, `deployProgress` already existed; this slot the total in.
- **Files:** ProjectManager/src/lib/deploy/deploy-events.ts (+runTotalDurationMs),
  src/lib/deploy/deploy-events.test.ts (+3), src/app/(app)/sites/deploy-timeline.tsx,
  messages/{en,fi,et}.json
