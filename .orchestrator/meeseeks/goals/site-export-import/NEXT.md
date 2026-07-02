# Note to the next Meeseeks (site-export-import)

**Asset bytes upload leg is now DONE** — all 3 of FORMAT.md §4's protocol
pieces exist: `GET /api/site-export/asset/<key>` (download), `POST
/api/site-import` (D1 restore, returns `assetKeysToUpload`), `POST
/api/site-import/asset/<key>` (upload, this run). Read FORMAT.md first —
still the contract, unchanged.

- New route: `CMS/src/app/api/site-import/asset/[...key]/route.ts`.
  `requireAdmin` + `isValidAssetKey` guard (mirrors export's asset route
  exactly), looks up the key in the `asset` table (404 + named error if not
  found — refuses to upload under a key metadata doesn't know about), reads
  raw bytes via `request.arrayBuffer()`, calls `Storage.put(key, bytes,
  {contentType: row.contentType})` — **content-type always comes from the
  restored D1 row, the client's header is ignored entirely**, not just
  validated against.
- No pure-logic module needed for this route (same as the export asset
  route it mirrors — both are thin passthroughs: guard + one D1 lookup + one
  port call). Don't go looking for a `site-import-asset.ts` pure-logic file,
  it doesn't exist by design.
- **Live-verified full round-trip on `:3602`** (dev server already running,
  did NOT run `opennextjs-cloudflare build`): downloaded a real gallery
  asset via export's asset route, sha256'd it, re-uploaded the SAME bytes to
  the SAME key via the new route, re-downloaded — sha256 IDENTICAL — then
  hit the PUBLIC `/media/<key>` route: 200, correct content-type, correct
  size. Traversal guard and unknown-key guard both verified live (404s,
  named errors).
- `npx tsc --noEmit -p CMS` clean. `npm test` in `CMS/`: 1500/1500 pass, zero
  new tests needed (nothing new to unit-test beyond what the guard helpers
  already cover).

**Next TODO (per BACKLOG.md, in order): the full asset protocol (all 3 legs)
is now done. Only 2 tasks remain in BACKLOG's original list:**

1. **Admin UI**: Settings → "Export / Import" section. Export button
   (downloads `site.json` via `GET /api/site-export`, then loop-fetches
   every `tables.asset[].key` via `GET /api/site-export/asset/<key>` to
   assemble a client-side downloadable bundle — FORMAT.md §4 leaves the
   exact client packaging to this UI slice, e.g. a folder-of-files download
   or a client-side zip lib). Import flow: upload `site.json` → POST
   `/api/site-import/validate` → render the dry-run report (counts,
   secrets-to-re-enter, `collectionCapOk`) → typed confirmation input (must
   equal `artifact.meta.siteName` exactly, case-sensitive — surface that
   requirement in the UI copy) → POST `/api/site-import` → on success, loop
   `POST /api/site-import/asset/<key>` for every key in the response's
   `assetKeysToUpload` (upload the corresponding file from whatever the user
   provided — if they uploaded a `site.json` + separate asset files/folder,
   match by key/filename) → show final result + secrets-to-re-enter list.
   i18n via next-intl like sibling admin pages (check an existing Settings
   sub-page for the pattern).
2. **E2E/HITL slice**: export the local-site (:3602) with its full
   tableonline content, import it into a SECOND instance (scratch second
   local D1 or the deployed `bizbeecms-cms-test-1` — pick the cheaper one),
   click through: home renders identically, a city page, a booking form
   submit, gallery images load (this is the ONE remaining gap the prior
   same-instance smoke tests haven't covered — cross-instance, not
   same-instance). Record gaps as new TODOs.

Do #1 (Admin UI) next unless you have a good reason to do #2 first — the UI
is what actually makes the already-built API surface usable by an operator,
and #2 (E2E) benefits from clicking through the real UI rather than curling
three separate endpoints by hand.

One thing worth knowing: `CAVEATS.md`'s body is STILL mostly copy-pasted
noise from a DIFFERENT goal (`tableonline-home`) — still out of scope for a
one-task run to prune. The genuinely-this-goal entries are clustered near the
top (cap hard-fail-vs-warning, D1 bound-param cap, and now the
content-type-trust note this run added).
