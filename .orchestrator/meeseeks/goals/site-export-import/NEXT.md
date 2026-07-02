# Note to the next Meeseeks (site-export-import)

**Export is now FULLY DONE** (both BACKLOG tasks: core + assets). Read
FORMAT.md first — still the contract, unchanged by this run.

- `GET /api/site-export` — the `bizbeecms.site` v1 envelope (metadata for
  everything, incl. `tables.asset[]` listing every key).
- `GET /api/site-export/asset/<key>` — streams ONE asset's raw bytes
  (`CMS/src/app/api/site-export/asset/[...key]/route.ts`, new this run),
  `requireAdmin`-gated, content-type from the `asset` D1 row, guarded by the
  existing `isValidAssetKey` traversal check. Live-verified: a real 1.5MB
  gallery PNG round-tripped byte-identical (sha256 match) against the same
  bytes served by the public `/media/<key>` route. `tsc --noEmit` clean,
  `npm test` 1476/1476 green (route has no pure logic to unit-test — thin
  guard+D1-lookup+Storage.get wrapper, matches the repo's "test business logic
  only" convention; no other `api/*/route.ts` has a colocated test either).

**Next TODO (per BACKLOG.md, in order): "Import validate + dry-run"** — build
per FORMAT.md §6 Steps A + B:

1. A PURE function (node-testable, no D1/CF imports) that takes a parsed
   artifact (the `bizbeecms.site` envelope JSON) and an **injected count
   provider** (per FORMAT.md §7's own instruction: "the validator function
   should accept an injected count-provider so the PURE report-builder stays
   unit-testable") and returns the dry-run report shape from §6 Step B:
   `{ok, willDestroy, willCreate, secretsToReenter, collectionCapOk, warnings}`.
2. Step A validation rules (hard-fail vs warning) are spelled out verbatim in
   FORMAT.md §6 — implement exactly: `format`/`version` gate, every `tables.*`
   key present+array (name the exact bad key per this repo's error
   philosophy), `tables.collection.length <= 100`, `counts` mismatch = WARNING
   not hard-fail.
3. Thin route: `POST /api/site-import/validate` (or similar — name it,
   FORMAT.md doesn't pin the exact validate-endpoint path, only that Import
   validate is a NO-WRITES operator-only endpoint) that accepts the artifact
   JSON body, computes `willDestroy` by COUNTING current target rows (the
   tables listed under §6 Step C's WIPE list) via the `Db` port, and calls the
   pure report-builder. `requireAdmin`-gated like every other admin route.
4. Unit-test the pure validator/report-builder thoroughly (this is the
   valuable logic); do NOT unit-test the route itself (thin I/O wrapper,
   matches this goal's own established convention from Export core/assets).
5. Do NOT build Import EXECUTE yet (destructive path) — that's the next
   BACKLOG task after this one, explicitly ordered.

One thing worth knowing: `CAVEATS.md`'s body is still mostly copy-pasted
noise from a DIFFERENT goal (`tableonline-home`) — an earlier run fixed the
header but a full prune is still out of scope for a one-task run. My 2 new
entries (Export core's + Export assets') are near the top, right after the
corrected header — the rest (MCP tool-arg quirks etc.) doesn't apply to this
goal's actual work.
