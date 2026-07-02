# Note to the next Meeseeks (tableonline-home)

**Restaurant detail page `/{city-slug}/{restaurant-slug}` is DONE and live** —
the first wildcard-under-wildcard page this goal built (`:restaurant-slug`
nested under `:city-slug`), and it worked with **zero new platform code**.
New `RestaurantHero` component (breadcrumb, h1+location+cuisine pill, image,
description, Overall-rating badge + review count, "Book a table" CTA). Added
`content_restaurants.cuisine`/`.description` fields (didn't exist before),
backfilled all 26 rows with a guessed cuisine + templated one-line
description (ponytail: good enough, not hand-authored prose — upgrade later
if ever prioritized). Also repointed restaurant-NAME links (not the Book
pill) on `RestaurantRow`/`RestaurantCard` (home + city page) and
`SearchResultRow` (search page) from `/book?restaurant=...` to
`/{citySlug}/{slug}` — all 3 components `update_component`'d + published,
all 5 Lists using them (home×2, city×2, search×1) re-`bind_list`'d with
`citySlug`+`slug` added to `map`, all 3 affected pages republished. See
JOURNAL 2026-07-02 17:08 for the full sequence + verification.

**Important self-caught bug (read CAVEATS' 2 newest entries before touching
ANY new page):** my first live smoke test looked like a wildcard-under-
wildcard platform bug (every restaurant/city combo rendered the same
default) — it was actually just a missed `POST /api/pages/<id>/publish`
call after `bind_component` on the brand-new page (the public route silently
falls back to the pre-binding legacy `page.blocks` column when
`published_version_id` is still NULL). Publish IMMEDIATELY after the first
bind on any new page, before smoke-testing. Also hit (and documented) a
separate red herring: `query_collection`'s filter arg is `filters` (plural),
not `filter` (singular) like the bind_* tools — passing the wrong name is
silently accepted and returns unfiltered rows.

## Recommended next task (per BACKLOG.md order)
**Home page visual replica pass 1** (header/hero): dark top utility bar
(`#14151a`, currently light/inverted-contrast) with "For restaurants" +
language switcher, transparent nav over a full-bleed photo hero with 50%
dark overlay + white serif headline, and a promotions strip riding up over
the hero bottom (`margin-top:-4rem`) — one large 16/9 main promo
(`content_offers.is_main=1`, field exists/unused today, set it on 1-2 seeded
offers) + a secondary promo column. This is pure component/CSS/theme work,
no platform feature needed. Leave the existing 2 bottom PromoBanner blocks
alone (tableonline has the same near-footer Avios/newsletter tiles).

After that: **Home page visual replica pass 2** (registration teaser
callout, app-download badges, footer gradient/social row/copyright bar, dead
`href="#"` footer links) — also pure component work.

Then: **Static/footer pages** (Terms/Privacy/Contact/"For restaurants") so
no footer link 404s — lowest priority, do last.

## Known gaps (not blockers, just noted)
- Two-step booking UX not built (single-step form shipped instead) — see
  earlier JOURNAL entries, acceptable simplification per GOAL.md.
- Offer/event `restaurant` fields are free-text names that don't match any
  real `content_restaurants` row (5 names: LOBO, Kustavin Kipinä, Wohls
  Gård, Ravintola Siuntio, White Lady) — `content_offers.restaurant_slug`
  was backfilled by slugifying the free-text name so its Book CTA still
  works, but it won't resolve to a real restaurant detail page (no
  `content_restaurants` row exists for these 5 names) — a future task
  reseeding offers/events against real restaurant names would fix this.
- Restaurant `cuisine`/`description` are templated/guessed, not authored —
  fine for now, could be revisited for realism later.
- City strip "Show all" links still go to plain `/search` (no city
  pre-filter) — still an open nice-to-have.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). No repo
files touched this run — content lives entirely in D1 via MCP/REST, so no
tsc/build/test gate applies to this commit (goal-memory files only).
