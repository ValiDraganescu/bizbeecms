# Note to the next Meeseeks (tableonline-home)

**This run did two small tasks** (manager-hinted, both fast):

1. **Housekeeping**: committed the orphaned wildcard zero-match-404 platform
   fix (4 repo files that were verified-but-uncommitted since an earlier
   run) — re-verified tsc + 1462 tests green + live smoke, committed as
   commit `50096e2`.
2. **`/book` no-param neutral placeholder**: fixed the last "known quirk" —
   `/book` (no `?restaurant=`) now shows "Book a table at a restaurant"
   instead of a real restaurant's name. Needed TWO layers: a new
   `isUnresolvedSingleRouteFilter` platform helper (skip the query instead of
   running it unfiltered) AND a `set_block_props` content fix (the
   component's own static props were themselves leftover prop-level route
   refs from an earlier task, which `resolveRouteProps` blanks independently
   of the binding fix). Committed as a separate commit on top of #1 — see
   CAVEATS for the full gotcha writeup if you hit something similar.

Both commits: `tsc --noEmit` clean, `npm test` 1468/1468 pass, live-verified
on the running :3602 dev server.

## Backlog status — 3 TODOs remain, all pure MCP/D1 content work, no bugs open
1. Remove or repurpose the orphaned HandpickedSelection section on home
   ("Restovista recommends 2026" — dead `/collections/*` links; those 404
   cleanly now instead of mis-rendering, but still dead ends worth
   removing/repointing).
2. Backfill restaurants for 8 nearly-empty city pages (only Helsinki/
   Tallinn/Tartu have real listings; Espoo/Turku/Tampere/Oulu/Jyväskylä/
   Kuopio/Porvoo/Pärnu are empty). Probably the single biggest remaining
   visible content gap on the site.
3. `/for-restaurants` polish: missing `<title>`/`<h1>` (bare RestaurateurJoin
   dump); also swap home section order so registration-teaser comes BEFORE
   the restaurateur section per GOAL.md (PromoBanners stay near footer).

Pick #2 first (biggest content gap) unless something more urgent surfaces.

## Known gaps (carried over, unchanged this run)
- No visitor-facing login/signup route exists — SiteHeader's Login/Create
  account buttons + RegistrationTeaser CTA all point at `/contact` as the
  smallest sane non-dead target.
- Two-step booking UX not built (single-step form shipped instead).
- Offer/event `restaurant` fields are free-text names not matching any real
  `content_restaurants` row for 5 names (LOBO, Kustavin Kipinä, Wohls Gård,
  Ravintola Siuntio, White Lady).
- Restaurant `cuisine`/`description` are templated/guessed, not authored.
- City strip "Show all" links still go to plain `/search` (no city filter).
- Only 1 offer has `is_main=1`.
- `RestaurateurJoin` still only has EN copy for its translatable props.
- `AppDownload`'s 2 badge hrefs still point at `/about` (unpublished).
- Social hrefs point at bare `facebook.com`/`instagram.com`/`x.com` roots
  (no real Restovista social profiles exist).
- `/book`'s hidden `restaurant_slug` field still falls back to the
  component's schema default `"lobo"` (not truly empty) when no
  `?restaurant=` — cosmetic, only matters if someone submits `/book` with no
  param at all (an edge case with no real UI path to reach it, since every
  "Book" CTA on the site already carries a real `?restaurant=`).

Nothing blocked. Dev server was already running on :3602 all run; MCP token
still valid (`.mcp.json` → `local-site`). Both this run's commits touched
repo files — tsc/test gate applied and passed both times.
