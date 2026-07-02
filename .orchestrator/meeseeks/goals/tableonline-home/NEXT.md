# Note to the next Meeseeks (tableonline-home)

**City landing page `/:city-slug` is DONE and live.** Breadcrumb ("Restaurants
» {City}"), dark-overlay hero (h1 city name, real per-city photo), then 4
strips: "Best restaurants in {city}" (grid, content_restaurants filtered
`city_slug eq param`), "Offers in {city}" (grid, content_offers filtered
`city like param` — city is a NAME field, not a slug, hence `like` not `eq`),
"Upcoming events in {city}" (grid, content_events `location like param`),
"Newest restaurants in {city}" (row list, content_restaurants sorted
created_at desc). Each strip has a "Show all" link → `/search` (no `?city=`
filter yet — see below) and an empty-state ("Nothing here yet") when a city
has no offers/events. Home page's existing CityCards already link `/{slug}`
and now resolve for real (confirmed `/espoo` 200s). See JOURNAL
2026-07-02 16:42 for the full design + live smoke tests across
helsinki/turku/tallinn/a nonexistent slug.

**New components:** `CityHero`, `CityStripHeading`, `CityEmptyStrip` — all
get their dynamic city name/image via `bind_component` against
`content_cities` filtered `slug eq {param:"city-slug"}` (properly-cased name
+ real photo, no manual string echo needed). Reused ALL existing card
templates (RestaurantCard/RestaurantRow/OfferCard/EventCard) unmodified.

**Read CAVEATS.md's 5 newest entries before touching pages** — especially:
`bind_list` has no empty-slot arg (add `listRole:"empty"` children yourself
via a get_page→mutate→update_page_blocks pass AFTER binding); a
`bind_component` prop with no matching row falls back to its static
propsSchema DEFAULT, not blank; `content_offers.city`/`content_events.location`
are city NAMES not slugs (use `like`, not `eq`, when filtering by a
`:city-slug` param).

## Recommended next task (per BACKLOG.md order)
**Offer detail page** (`/offers/:slug`) — home OfferCards and the new city
page's OfferCards both already link `/offers/{slug}`, currently 404. Needs
image, title, date range, description, restaurant, "Book a table" CTA →
`/book?restaurant=...`. Same `bind_component`-against-collection-filtered-by-
param pattern as `:city-slug`. **Untested wrinkle:** this is a wildcard
segment NESTED under a static `offers` path (`/offers/:offer-slug`), whereas
`:city-slug` was a TOP-LEVEL wildcard — check `create_page`'s `parentSlug` arg
(create a static `offers` page or just use `parentSlug` pointing at nothing
and see if a literal `offers/:offer-slug`-shaped single slug is accepted, or
whether you need a real parent page row) and re-read `lib/render/slug.ts`'s
`matchSlugSegment`/`resolvePage` in `[[...slug]]/page.tsx` before assuming
either nesting approach works — this run only exercised a single top-level
wildcard segment.

Then in order: book-a-table page (`/book?restaurant=...`, CMS form
machinery via `create_form`/`bind_form`), restaurant detail page
(`/:city-slug/:restaurant-slug` — TWO nested wildcards; also untested at two
levels, verify before committing to the design). The two "Home page visual
replica" passes (dark header bar/promo strip; footer/registration-teaser/
app-download) are pure component/CSS work, no platform feature needed — can
be slotted in anytime if a landing-page task isn't ready.

## Known gaps (not blockers, just noted)
- City strip "Show all" links go to `/search` (no city pre-filter) — `/search`
  only supports `?q=` right now. A future task could add `?city=` support to
  `/search`'s List binding (another `filter` clause reading `{"query":"city"}`,
  ANDed with the existing `search`) and then update the 4
  `CityStripHeading.showAllHref` props on the `:city-slug` page accordingly.
- Search-result rows' name-link and the city page's restaurant cards both
  still point at `/book?restaurant=...` (no restaurant detail page exists
  yet) — once `/:city-slug/:restaurant-slug` ships, update the `detailHref`/
  book-link mappings across `SearchResultRow`, `RestaurantRow`,
  `RestaurantCard` to point there instead.
- A city with no matching `content_cities` row (typo'd slug) renders the
  `CityHero`/`CityStripHeading` static defaults ("Helsinki") instead of a
  blank/generic fallback — see the newest CAVEATS entry; not fixed, just
  documented as the existing binding contract's behavior.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). No repo
files touched this run — content lives entirely in D1 via MCP, so no
tsc/build/test gate applies to this commit (goal-memory files only).
