# Note to the next Meeseeks (tableonline-home)

**Offer detail page `/offers/:offer-slug` is DONE and live** — nested under a
new static `offers` index page (`parentSlug:"offers"`). Home OfferCards, the
`:city-slug` page's offer strips, and the new `/offers` index all link into
it and resolve for real. **The nested-wildcard-under-static-parent question
from the last run's NEXT.md is RESOLVED: it just works, zero new platform
code needed** — `resolvePage` was always a generic per-level tree walk, never
special-cased to top-level. Create the static parent page first (`create_page`
errors `"parent page not found"` if the wildcard child comes first), then
`create_page` the child with `parentSlug` set to the parent's slug. See
JOURNAL 2026-07-02 16:50 for the full design + live smoke tests across all 6
offers + a nonexistent-offer graceful-fallback check.

**New:** `OfferHero` component (breadcrumb, image, title, date range,
description, "At {restaurant}", "Book a table" CTA →
`/book?restaurant={{restaurantSlug}}`), `content_offers.restaurant_slug`
field (slugified from the free-text `restaurant` name — **note:** offers'/
events' `restaurant` names do NOT exist as rows in `content_restaurants`,
they're a separate informal roster; see the newest CAVEATS entry before
building the restaurant detail page, which will need to decide how to
reconcile this).

**Read CAVEATS.md's 5 newest entries before touching pages** — especially:
nested wildcards under a static parent work with no new code (just create the
parent first); `bind_component`'s MCP args are FLAT (`page`,`block`,
`collection`,`filter`,`sort`,`map`), not nested like a List's `listSource`;
publishing a BRAND NEW component correctly reports `published:false` (no
draft to publish, not an error).

## Recommended next task (per BACKLOG.md order)
**Book-a-table page** (`/book?restaurant=...`) — every "Book a table"/"Book"
CTA across the site (offer page, restaurant cards, search rows, city page)
already points here and currently 404s. Use the CMS form machinery
(`create_form`/`bind_form` MCP tools — NOT yet used by this goal, read
`get_authoring_guide` for their shape first) into a new `bookings` collection.
Pre-select the restaurant via the `?restaurant=` query param (same
`{"query":"restaurant"}` route-value-ref pattern already proven on `/search`'s
`?q=`) — likely as a read-only/preset field or a hidden form field echoing the
query value into a visible "Booking at {restaurant}" heading (reuse
`resolveRouteProps` via a plain string component prop, same trick as
`SearchHeader`'s "Results for '{{query}}'").

Then: restaurant detail page `/:city-slug/:restaurant-slug` (TWO nested
wildcards — now HIGH confidence this works too, since one level of nesting
under a static parent was just proven and `resolvePage`'s walk is fully
generic per-level; still worth one live smoke test to be sure, but don't
expect surprises). The two "Home page visual replica" passes (dark header
bar/promo strip; footer/registration-teaser/app-download) are pure
component/CSS work, no platform feature needed — slot in anytime a
landing-page task isn't ready.

## Known gaps (not blockers, just noted)
- `/offers` (the new index page) has no locale-specific offer content beyond
  the heading/subtitle (same single-locale-collection-field limitation as
  every other collection-driven list this goal) — acceptable per GOAL.md.
- Offer restaurant names ("LOBO", "Kustavin Kipinä", etc.) don't correspond to
  any `content_restaurants` row — the offer page's "At {restaurant}" text and
  Book CTA use the free-text name/slugified-name directly, not a real
  restaurant relation. If a future pass reseeds offers/events against real
  restaurant names, update `restaurant`/`restaurant_slug` on all 6 offers (and
  the analogous fields on `content_events`) to match.
- City strip "Show all" links still go to `/search` (no city pre-filter) —
  unchanged from the last run, still an open nice-to-have.
- Search-result rows' name-link and the city page's restaurant cards still
  point at `/book?restaurant=...` (no restaurant detail page exists yet) —
  once `/:city-slug/:restaurant-slug` ships, update `detailHref`/book-link
  mappings across `SearchResultRow`/`RestaurantRow`/`RestaurantCard`.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). No repo
files touched this run — content lives entirely in D1 via MCP, so no
tsc/build/test gate applies to this commit (goal-memory files only).
