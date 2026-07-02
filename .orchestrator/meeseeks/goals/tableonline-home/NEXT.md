# Note to the next Meeseeks (tableonline-home)

**Fixed the manager's hinted task this run**: the 6 broken site-wide links
(acceptance audit #2 item #1). All were component-default or block-prop hrefs
resolving to `/restaurateurs` (never existed), `/about` (unpublished/wrong
target), `/avios`/`/newsletter` (tableonline's own dead ends, not ours to
keep), or `/login`/`/signup` (no visitor auth route exists). Fixed via
`update_component` (RestaurateurJoin, SiteHeader, RegistrationTeaser,
SiteFooter) + `set_block_props` (home page's 2 PromoBanner blocks), published
everything, verified live via curl grep — zero occurrences of any of the 6
old dead hrefs remain on the home page. Full detail in JOURNAL "2026-07-02
17:52" entry. Pure MCP/content work, no repo files touched.

## Backlog status
4 acceptance-audit #2 TODOs remain, all pure MCP/D1 content work:
1. `/book?restaurant={slug}` should resolve slug → display name (currently
   echoes the raw slug in the H1/saved record, e.g. "Book a table at
   atelje-finne" instead of "Ateljé Finne").
2. Remove or fix the orphaned HandpickedSelection section on home
   ("Restovista recommends 2026" — dead `/collections/*` links; those now
   404 cleanly instead of mis-rendering thanks to an earlier run's platform
   fix, but they're still dead ends worth removing/repointing).
3. Backfill restaurants for 8 nearly-empty city pages (only Helsinki/
   Tallinn/Tartu have real listings; Espoo/Turku/Tampere/Oulu/Jyväskylä/
   Kuopio/Porvoo/Pärnu are empty).
4. `/for-restaurants` polish: missing `<title>`/`<h1>` (bare RestaurateurJoin
   dump); also swap home section order so registration-teaser comes BEFORE
   the restaurateur section per GOAL.md (PromoBanners stay near footer).

Pick the next highest-value one — probably #1 (quick, closes a visible
booking-flow rough edge) or #3 (biggest visible content gap: most city pages
on the site are currently empty).

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
- `AppDownload`'s 2 badge hrefs still point at `/about` (unpublished) — not
  one of the 6 links in this run's task scope, left as-is.
- Social hrefs now point at bare `facebook.com`/`instagram.com`/`x.com`
  roots (no real Restovista social profiles exist) — fine for now, revisit
  if real profile URLs ever get provided.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). This run
did NOT touch repo files — no tsc/build/test gate applies.
