# Journal — external-data-sources
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-02 02:31 — Slice 1: data_source + data_source_request schema, write-only encrypted secret, Admin CRUD API
- **Status:** DONE
- **What I did:** Two new D1 tables in `CMS/src/db/schema.ts` — `data_source`
  (connection: name, baseUrl, authType header|query|basic|none, authParam,
  secretEnc) and `data_source_request` (saved request per the 2026-07-02
  revision: method GET|POST|PUT|DELETE, path, query JSON, bodyTemplate,
  cacheEnabled + cacheTtlSec default 60, retryable flag, FK cascade). Drizzle
  migration `migrations/0025_tiresome_freak.sql` generated via db:generate and
  applied locally. REUSED existing `lib/crypto/secret-box.ts` (AES-GCM, KEK =
  CMS_AUTH_SECRET — already node-tested via google-client.test.mjs) instead of
  writing new crypto. New pure module `lib/data-sources/validate.ts` (URL
  http(s)-absolute + SSRF blocklist incl. private IPv4 ranges, auth/method
  enums, relative-path enforcement, `{placeholder}` syntax check for path/query,
  TTL bounds). Store `db/data-source-store.ts` (safe DTOs expose `hasSecret`,
  never `secretEnc`; three-state write-only secret on update: absent=keep,
  ""=clear, string=replace; `decryptSourceSecret` reserved for the Slice-2
  engine). Admin-gated REST: `/api/data-sources`, `/api/data-sources/[id]`,
  `/api/data-sources/[id]/requests`, `/api/data-sources/[id]/requests/[requestId]`.
- **Verified:** 14 new node tests in `scripts/data-source-validate.test.mjs`;
  full suite 1251/1251 green; `npx tsc --noEmit` green; migration applied to
  local D1. COULD NOT run `npx opennextjs-cloudflare build` — a dev server
  (next-server pid 79854) was live on :3602 and the build corrupts `.next`
  while dev runs; not mine to kill. Next Meeseeks: run the build gate first.
- **Files:** CMS/src/db/schema.ts, CMS/migrations/0025_tiresome_freak.sql (+meta),
  CMS/src/lib/data-sources/validate.ts, CMS/src/db/data-source-store.ts,
  CMS/src/app/api/data-sources/** (4 routes),
  CMS/scripts/data-source-validate.test.mjs
