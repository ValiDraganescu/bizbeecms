# Note to the next Meeseeks (site-export-import)

**Export is DONE (core + assets). Import validate + dry-run is now ALSO DONE**
(all 3 of BACKLOG's first 3 tasks). Read FORMAT.md first — still the
contract, unchanged by this run.

- `GET /api/site-export` — the envelope (metadata for everything).
- `GET /api/site-export/asset/<key>` — streams one asset's raw bytes.
- `POST /api/site-import/validate` — accepts a `bizbeecms.site` artifact JSON
  body, `requireAdmin`-gated, **NO WRITES**. Returns the FORMAT.md §6 Step B
  dry-run report: `{ok, willDestroy, willCreate, secretsToReenter,
  collectionCapOk, warnings}` (HTTP 200 if `ok:true`, 400 if `ok:false` —
  format/version/missing-tables-key are hard-fails; counts-mismatch and
  cap-exceeded are warnings only, see CAVEATS.md's new entry on why). Pure
  logic lives in `CMS/src/lib/site-export/site-import-validate.ts`
  (`validateSiteImport`, injected `getWillDestroy` count-provider per
  FORMAT.md §7) — 13 unit tests, node-testable, zero D1/CF imports. The route
  (`CMS/src/app/api/site-import/validate/route.ts`) is a thin wrapper: parses
  JSON, supplies live D1 counts via the `Db`+`contentSelect` ports, calls the
  pure function. Live-verified: fed the REAL exported tableonline site
  straight back into validate → `willDestroy === willCreate` on every key
  (same instance), 4 real data sources correctly flagged in
  `secretsToReenter`.

**Next TODO (per BACKLOG.md, in order): "Import execute"** — the destructive
path, FORMAT.md §6 Step C, verbatim:

1. Operator-only `POST /api/site-import` (or similar — name it; not pinned by
   FORMAT.md) that, on an EXPLICIT typed confirmation from the caller (the
   admin UI's job, not this route's — but the route itself has no writes
   without SOME confirmation signal in the request, e.g. a required
   `{confirm: "<site name>"}` body field the route checks against the
   artifact's `meta.siteName` before doing anything — decide the exact
   confirmation contract this run, FORMAT.md doesn't pin it).
2. WIPE order (§6 Step C, exact): 1) `DROP TABLE content_*` per current
   `collection` registry row (fenced `contentDdl`, reuse `deleteCollection`'s
   DROP shape) 2) delete all rows: `collection`, `page_version`, `page`,
   `component`, `data_source_request`, `data_source`, `prompt_version`,
   `asset` (D1 rows only — do NOT touch R2 here) 3) delete all
   `site_settings` rows. PRESERVE (never touch):
   `user,session,invite,password_reset,login_attempt,api_key,icon_cache,chat_thread`.
3. RESTORE order (§6 Step C): `collection` registry + recreate `content_*`
   via `buildCreateTableSql`/`contentDdl` (§5 — reuse verbatim, do NOT
   hand-author DDL) → insert that collection's rows via parameterized
   `contentWrite` → `component` rows → `page` rows → `page_version` rows →
   `site_settings` rows → `prompt_version`, `data_source` (secretEnc ALWAYS
   `null`, never trust an artifact-supplied ciphertext) →
   `data_source_request` → `asset` metadata rows (bytes arrive later via the
   §4 per-key upload leg, a SEPARATE route `POST
   /api/site-import/asset/<key>` — decide if that's part of THIS task or a
   follow-up; FORMAT.md §4 describes it as part of the same import flow).
4. Idempotency: the wipe is UNCONDITIONAL (not "wipe only what's about to be
   replaced"), so a second run of the same import after a mid-way failure is
   safe by construction — FORMAT.md calls this out explicitly, don't
   over-engineer transaction/rollback machinery on top of it.
5. 100-table cap: FORMAT.md §5 point 5 says check `tables.collection.length`
   against `MAX_COLLECTIONS` (100) in the dry-run step BEFORE any writes —
   dry-run (this run's work) already computes `collectionCapOk`; Import
   EXECUTE should probably REFUSE to run if `collectionCapOk===false` (a hard
   block this time, unlike validate's warning-only stance — see CAVEATS.md's
   new entry).
6. Unit-test the reset planner + row restorer with MOCKED `Db`/`Storage`
   ports (this repo's "test business logic only" discipline — don't test the
   ports themselves). Live-verify on `:3602` with a small real export
   (re-import into the SAME instance first as the simplest smoke test before
   trying a genuinely different target instance).
7. Do NOT build the Admin UI yet — that's explicitly the task after Import
   execute in BACKLOG.md's ordering.

One thing worth knowing: `CAVEATS.md`'s body is still mostly copy-pasted
noise from a DIFFERENT goal (`tableonline-home`) — still out of scope for a
one-task run to prune. My new entry (the cap-hard-fail-vs-warning resolution)
is right after the Export-core/Export-assets entries, near the top.
