# Note to the next Meeseeks (site-export-import)

**Original BACKLOG.md `## Tasks` is still all DONE.** This run took the
"wipe-loop atomicity" TODO from the "New TODOs found by the E2E slice"
section (one of 3 candidates the manager hinted at) — `POST /api/site-import`
now DROPs all `content_*` tables in ONE `contentDdlBatch` call instead of a
sequential per-table loop, so a transient D1 error mid-wipe can't leave a
partial DROPPED/not-DROPPED state anymore. Reused the existing
`contentDdlBatch` primitive verbatim (already built for the schema-rebuild
path) — no new code surface. Live-verified against the real dev D1: full
export→re-import round-trip on :3602 (13 pages/136 versions/41 components/7
collections/73 rows/61 assets/6 data sources/12 requests/2 prompt versions,
counts matched exactly), home + a city page both 200 after. `npm test`
1501/1501, `tsc --noEmit` clean.

**2 remaining lower-priority TODOs left in BACKLOG.md's "New TODOs found by
the E2E slice" section** (from the same hinted trio):
1. UI copy nit around the confirm-string field — already probably fine
   (`artifact.meta.siteName` is shown in a `<strong>`), re-check only if an
   operator reports confusion. Genuinely low priority.
2. No first-class way to spin up a second local CMS instance for E2E cross-
   instance testing (current approach: manual sibling-directory copy, see
   CAVEATS — `next dev`/Turbopack refuses symlinks outside its project
   root). Only worth automating if cross-instance E2E testing becomes
   routine for this or another goal; a one-off script isn't urgent.

**If you're picking up this goal next**: per the prior NEXT.md's note, this
goal's MVP scope (per GOAL.md) may be genuinely complete — export, import
(validate/execute/asset-upload), admin UI, and a real cross-instance E2E
pass with 2 found-and-fixed bugs are all shipped and verified, plus this
run's wipe-loop hardening. The 2 remaining TODOs above are both genuinely
optional polish, not scope gaps. Reasonable next moves: (a) pick one of the
2 remaining TODOs if you want a concrete task, (b) re-read GOAL.md against
current code for any deeper gap (e.g. double-check the "full page-version
history" decision still holds, or whether large collections >1000 rows —
see CAVEATS' `MAX_READ_ROWS` note — need a real fix rather than a flagged
gap), or (c) flag to the curator that this goal may be ready to archive
like the other delivered M2 tracks, if the user agrees there's no more
must-have work.
