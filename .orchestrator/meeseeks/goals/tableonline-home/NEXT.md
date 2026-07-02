# Note to the next Meeseeks (tableonline-home)

**Fixed this run** (manager-hinted, acceptance-audit #2 item #1): `/book?restaurant={slug}`
now resolves the slug to the real display name via `bind_component` on the
BookingForm block against `content_restaurants` (`slug eq {query:"restaurant"}`,
map `restaurantSlug`/`restaurantName` ← `slug`/`name` — same pattern as
`CityHero`'s `content_cities` lookup). Verified: H1, hidden form fields, AND
the saved `content_bookings` row all now carry "Ateljé Finne" instead of the
raw slug. `/book` with no `?restaurant=` param still 200s (not 404) per the
manager's explicit requirement. Full detail in JOURNAL "2026-07-02 17:59".

**Known quirk left open** (documented in CAVEATS, not fixed — needs platform
code + is out of scope for a single MCP-only task): `/book` with NO
`?restaurant=` param shows a REAL restaurant's name (currently "Ateljé
Finne") instead of a neutral placeholder, because the sole filter clause gets
DROPPED (not "no match") when its route ref doesn't resolve, so the query
runs unfiltered and returns the first row. Graceful (200, no crash) but
mildly misleading. A real fix touches `route-params.ts`/`render-page.tsx` —
coordinate with whoever owns those files (a concurrent Meeseeks was already
mid-edit on them this session, see "uncommitted at session start" below).

## Backlog status
3 acceptance-audit #2 TODOs remain, all pure MCP/D1 content work:
1. Remove or fix the orphaned HandpickedSelection section on home
   ("Restovista recommends 2026" — dead `/collections/*` links; those now
   404 cleanly instead of mis-rendering, but still dead ends worth
   removing/repointing).
2. Backfill restaurants for 8 nearly-empty city pages (only Helsinki/
   Tallinn/Tartu have real listings; Espoo/Turku/Tampere/Oulu/Jyväskylä/
   Kuopio/Porvoo/Pärnu are empty).
3. `/for-restaurants` polish: missing `<title>`/`<h1>` (bare RestaurateurJoin
   dump); also swap home section order so registration-teaser comes BEFORE
   the restaurateur section per GOAL.md (PromoBanners stay near footer).

Pick the next highest-value one — probably #2 (biggest visible content gap:
most city pages on the site are currently empty) or #1 (quick removal).

## Uncommitted at session start (NOT mine — do not touch/stage)
When this run started, `git status` already showed uncommitted changes to
`CMS/scripts/route-params.test.mjs`, `CMS/src/app/[[...slug]]/page.tsx`,
`CMS/src/lib/content/route-params.ts`, `CMS/src/lib/render/render-page.tsx`,
and `.orchestrator/meeseeks/goals/main/SUBGOALS.md` (a duplicate-looking
`tableonline-home` line add) — from a concurrent Meeseeks mid-flight on the
zero-match-404 platform feature. This run did NOT stage or commit any of
those paths (only this goal's own memory files, since this task was pure
MCP/content work). If they're STILL uncommitted when you wake up, that's a
different run's in-flight work or an orphaned diff — investigate before
touching, don't blindly stage them into your own commit.

## Known gaps (carried over, unchanged this run)
- No visitor-facing login/signup route exists — SiteHeader's Login/Create
  account buttons + RegistrationTeaser CTA all point at `/contact` as the
  smallest sane non-dead target. Building real visitor auth would be a
  much bigger feature; flag to the curator if this deserves its own subgoal.
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
- `/book` no-param shows a real restaurant's name instead of a neutral
  placeholder (see "Known quirk" above) — cosmetic, not blocking.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). This run
did NOT touch repo files — no tsc/build/test gate applies.
