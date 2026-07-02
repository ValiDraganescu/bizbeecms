# Note to the next Meeseeks (site-export-import)

**The entire original BACKLOG task list is now DONE** — including the final
E2E/HITL cross-instance slice. The core export/import feature is shipped and
proven to actually work between two real, independent CMS instances (not
just same-instance round-trips).

**What this run did**: stood up a genuinely SEPARATE second local CMS
instance (a real sibling directory, physically copied — see CAVEATS, `next
dev`'s Turbopack refuses symlinks outside its project root), exported the
real :3602 tableonline site (13 pages/136 versions/41 components/7
collections/73 rows/61 assets/6 data sources/12 requests/2 prompt versions
— matches the task hint exactly), imported into the empty second instance,
and clicked through: home (200, identical title/nav), a city page
(`/helsinki`, 200, identical title), a restaurant detail page
(`/restaurants/kogu-resto`, 200, byte-identical page size), a real booking
form submit (`POST /api/forms/submit`, verified the row landed in the
target's `content_bookings` via `wrangler d1 execute --local`), and gallery
images (61/61 uploaded successfully, one spot-checked byte-identical via
sha256, one inline-referenced image on the restaurant page verified `200`).

**Found + fixed 2 real cross-instance bugs** that no prior same-instance test
could have caught (full root-cause writeup in JOURNAL's last entry):
1. `readSiteName` read the wrong JSON key (`name` vs the real
   `SiteIdentity.brandName`) — every real site was exporting a blank
   `meta.siteName`, making import permanently unconfirmable.
2. `planImport`'s `dropContentTables` used the SOURCE artifact's collection
   list instead of the TARGET's actual existing tables — 500s immediately on
   any target with different/no collections. Now the route queries the
   target's live `collection` registry first and passes it into `planImport`
   (new 3rd param, defaults to `[]`).

Both have regression tests (`site-export.test.ts`, `site-import-execute.test.ts`)
that fail pre-fix / pass post-fix. `npm test`: 1501/1501 pass. `tsc --noEmit`
clean. Primary :3602 confirmed unaffected (only one legitimate content write:
set a real `brandName` via the existing Brand settings API, since the site
had none — this is exactly what a real operator would do before exporting,
not a test hack). The scratch second instance + its process were fully torn
down at the end of this run — nothing left running or on disk outside the
repo.

**3 new lower-priority TODOs** were added to BACKLOG.md's "New TODOs found by
the E2E slice" section — none are blocking, all are polish/hardening for a
future run if this goal continues:
- A UX nit around the confirm-string UI copy (probably already fine).
- Wipe-loop atomicity: the DROP+CREATE loop in `POST /api/site-import` isn't
  wrapped in `contentDdlBatch`, so a transient D1 error mid-loop leaves a
  partial state (import is documented safe-to-retry per FORMAT.md, but the
  wipe loop itself isn't unit-tested for partial failure).
- No first-class way to spin up a second local instance if this becomes a
  recurring need (current approach: manual directory copy, works but is
  manual/slow — only worth automating if E2E cross-instance testing becomes
  routine for this or other goals).

**If you're picking up this goal next**: there is no more original-scope
work in BACKLOG.md's `## Tasks` section — every item is DONE. Per the
Meeseeks protocol (never idle), the 3 new TODOs above are reasonable next
picks, OR re-read `GOAL.md` against the current state of the code to look
for any deeper gap (e.g. the "full version history optional — decide and
note" line in GOAL.md was decided as "current draft+live only" by an earlier
run — worth double-checking that's still the right call, or whether a
`--include-history` flag is worth adding). This goal's scope (per its
GOAL.md) may now genuinely be complete for its MVP; if so, flag that in your
`result` so the curator can consider archiving it, same as the other
delivered M2 tracks.
