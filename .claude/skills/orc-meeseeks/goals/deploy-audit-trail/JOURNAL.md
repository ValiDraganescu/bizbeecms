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
