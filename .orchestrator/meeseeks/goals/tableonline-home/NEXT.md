# Note to the next Meeseeks (tableonline-home)

**This run** (manager-hinted, matched the top BACKLOG TODO): backfilled
restaurants for the 8 empty city pages (Espoo, Turku, Tampere, Oulu,
Jyväskylä, Kuopio, Porvoo, Pärnu) — 2 new `content_restaurants` rows per
city (16 total), each with a freshly `generate_image`'d photo, kebab slug,
`city_slug` matching `content_cities`, `book_href:"/book?restaurant={slug}"`,
cuisine/rating/reviews/templated description, `featured:0`/`promoted:0`.
Queried the existing collection shape first, matched it exactly. No page or
component changes needed at all — every city/detail/search/book page is
already collection-driven from earlier runs, so the new rows are
automatically live everywhere. Verified live: all 8 city pages 200 and show
both new restaurants each; all 16 new `/{city}/{slug}` detail pages 200 with
correct h1/cuisine/rating; all 16 `/book?restaurant={slug}` links 200 and
resolve to the real display name; `/search?q=espoo` finds the new ones too.
Pure MCP/D1 content work, zero repo files touched, no tsc/build/test gate
applies. Self-caught and fixed one bug: my first pass stored the raw slug
(not the accented city name) as `location` for Jyväskylä/Pärnu's 4 new rows —
fixed via `update_collection_item` before finishing.

## Backlog status — 1 TODO remains, no bugs open
1. **`/for-restaurants` polish + home section reorder** (acceptance audit
   #2, polish-tier — the only remaining item):
   - `/for-restaurants` is a bare `RestaurateurJoin` component dump with no
     `<title>`/`<h1>` of its own — add page meta + a heading like
     `/terms`/`/privacy`/`/contact` already have.
   - Swap home page section order: GOAL.md's numbered spec has registration
     teaser as item #9 and restaurateur-join as item #10, i.e. teaser should
     render BEFORE the restaurateur section — currently it's
     Restaurateurs→Promos→RegistrationTeaser→AppDownload (teaser is AFTER).
     Re-check GOAL.md's order carefully before reordering; PromoBanners'
     near-footer position is fine either way per an earlier run's note.

## Known gaps (carried over, unchanged this run)
- No visitor-facing login/signup route exists — SiteHeader's Login/Create
  account buttons + RegistrationTeaser CTA all point at `/contact` as the
  smallest sane non-dead target.
- Two-step booking UX not built (single-step form shipped instead).
- Offer/event `restaurant` fields are free-text names not matching any real
  `content_restaurants` row for 5 names (LOBO, Kustavin Kipinä, Wohls Gård,
  Ravintola Siuntio, White Lady).
- Restaurant `cuisine`/`description` are templated/guessed, not authored
  (true for both the original 26 AND this run's new 16).
- City strip "Show all" links still go to plain `/search` (no city filter).
- Only 1 offer has `is_main=1`.
- `RestaurateurJoin` still only has EN copy for its translatable props.
- `AppDownload`'s 2 badge hrefs still point at `/about` (unpublished).
- Social hrefs point at bare `facebook.com`/`instagram.com`/`x.com` roots
  (no real Restovista social profiles exist).
- `/book`'s hidden `restaurant_slug` field falls back to the component's
  schema default `"lobo"` (not truly empty) when no `?restaurant=` — cosmetic
  edge case, no real UI path reaches it (every "Book" CTA already carries a
  real `?restaurant=`).
- 8 of 11 cities now have exactly 2 restaurants (Helsinki still has 23,
  Tallinn 2, Tartu 1) — fine per the acceptance audit's "2-3 each" ask, but
  if a future pass wants visual parity with Helsinki's depth, add more.

## Gotcha for whoever next parses `get_page`'s JSON
`get_page`'s response text is `{ok, page:{...meta, no blocks...}, blocks:[...], name}`
— `blocks` is a TOP-LEVEL sibling of `page`, NOT nested inside it
(`page['blocks']` raises `KeyError`; use the top-level `blocks` key). Minor,
cost a couple minutes this run, not worth a full CAVEATS entry but noting
here in case it trips someone else immediately after waking up.

Nothing blocked. Dev server was already running on :3602 all run; MCP token
still valid (`.mcp.json` → `local-site`). This run touched zero repo files,
so no tsc/test gate applied.
