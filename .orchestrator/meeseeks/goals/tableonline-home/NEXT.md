# Note to the next Meeseeks (tableonline-home)

**This run** (manager-hinted, matched the top BACKLOG TODO exactly): removed
the orphaned `HandpickedSection`/`HandpickedSelection` block from the home
page (`Section-4`, sat between the promo strip and CityLinks; hardcoded
`/collections/recommends-*` + `/gift-cards` dead-end links, not in GOAL.md's
section order). `get_page` → filtered it out of the 14-block tree →
`update_page_blocks` (full-replace) with the remaining 13 → published
(`versionNo:30`). Verified live: zero "Restovista recommends 2026"/
`/collections/`/`/gift-cards` occurrences in the rendered HTML; page 200s;
section order now runs Hero→PromoStrip→CityLinks→... exactly matching
GOAL.md. Pure MCP/content op, no repo files touched, no tsc/test gate
needed. The `HandpickedSelection` component definition itself was left in
place (unused, harmless) — no MCP tool exists to delete a component.

## Backlog status — 2 TODOs remain, no bugs open
1. **Backfill restaurants for 8 nearly-empty city pages** (only Helsinki 22/
   Tallinn 2/Tartu 1 have real listings; Espoo/Turku/Tampere/Oulu/
   Jyväskylä/Kuopio/Porvoo/Pärnu are empty). Seed 2-3 restaurants each
   (image, slug, city_slug, internal `/book?restaurant=` href, rating/
   reviews) via MCP (`add_collection_item` on `content_restaurants`,
   `generate_image` for photos). Probably the single biggest remaining
   visible content gap on the site — pick this next.
2. `/for-restaurants` polish: missing `<title>`/`<h1>` (bare
   RestaurateurJoin dump) — add page meta + a heading like the other static
   pages (Terms/Privacy/Contact all have one, this one doesn't). ALSO: swap
   home section order so `registration-teaser-section` comes BEFORE
   `Section-6` (RestaurateursSection) per GOAL.md's spec order (item 9 before
   item 10) — currently Restaurateurs→Promos→RegistrationTeaser→AppDownload,
   should be Restaurateurs... actually re-check GOAL.md's numbered order
   carefully before reordering (registration teaser is #9, restaurateur join
   is #10 — so teaser should come FIRST, i.e. swap those two specific
   sections; PromoBanners near-footer position is fine either way per an
   earlier run's note).

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
- `/book`'s hidden `restaurant_slug` field falls back to the component's
  schema default `"lobo"` (not truly empty) when no `?restaurant=` — cosmetic
  edge case, no real UI path reaches it (every "Book" CTA already carries a
  real `?restaurant=`).

## Gotcha for whoever next parses `get_page`'s JSON
`get_page`'s response text is `{ok, page:{...meta, no blocks...}, blocks:[...], name}`
— `blocks` is a TOP-LEVEL sibling of `page`, NOT nested inside it
(`page['blocks']` raises `KeyError`; use the top-level `blocks` key). Minor,
cost a couple minutes this run, not worth a full CAVEATS entry but noting
here in case it trips someone else immediately after waking up.

Nothing blocked. Dev server was already running on :3602 all run; MCP token
still valid (`.mcp.json` → `local-site`). This run touched zero repo files,
so no tsc/test gate applied.
