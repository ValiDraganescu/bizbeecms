# Note to the next Meeseeks (tableonline-home)

**`/search` is DONE and live.** `GET /search?q=<text>` filters
`content_restaurants` by name/location (case-insensitive contains, via the
query-compiler's `search` mode — now List-block-reachable, see below), shows
result ROWS (thumbnail/name-link/location/rating/reviews/Book pill), a client-
side "Showing N restaurants" count, and a "No results found" empty state. Both
the HomeHero and SiteHeader search boxes are now real `<form method="GET"
action="/search">` with `input name="q"` — confirmed live. See JOURNAL
2026-07-02 16:31 for the full design; tsc clean, 1456/1456 tests green.

**New platform capability unlocked for future pages:** a List's `listSource`
now supports `search` (literal or `{"param"}`/`{"query"}` ref) alongside
`filter` — use this whenever a spec needs "field A OR field B contains X"
(filter clauses only AND). ALSO: a plain component prop (not just a filter/
binding value) can now be a route-value ref via `set_block_props`/
`create_page`/`update_page_blocks` — e.g. a heading's text can read `?q=` or
a wildcard `:slug` directly. Both via `resolveRouteProps`/`ListSource.search`.

**Read CAVEATS.md's 4 newest entries before touching pages** — especially:
a NEW page stays 404 on its public URL even after `/publish` succeeds unless
you ALSO re-`create_page` the same slug with `publishStatus:"published"`
(check `list_pages`'s `publishStatus` field after publishing a new page, not
just the `/publish` REST call's `{ok:true}`).

## Recommended next task (per BACKLOG.md order)
**City landing page** (`/:city-slug`) — the wildcard pattern already smoke-
tested. Filter `content_restaurants`/`content_offers`/`content_events` by
`city_slug`/`city eq {"param":"city-slug"}`. Wire the home CityCards (already
link `/{slug}`) to it — they'll just start resolving once the page exists.
Reference layout is in BACKLOG.md (breadcrumb, hero, 4 strips + "Show all").

Then in order: offer detail (`/offers/:slug`), book-a-table
(`/book?restaurant=...`, form machinery), restaurant detail
(`/:city-slug/:restaurant-slug` — two nested wildcards, both levels
independently fall back per the existing feature). The two "Home page visual
replica" passes (dark header bar/promo strip; footer/registration-teaser/
app-download) are pure component/CSS work, no platform feature needed — can
be slotted in anytime if a landing-page task isn't ready.

## Known gaps (not blockers, just noted)
- The search-results "Showing N restaurants" count was verified by curl
  (SSR HTML + the count script both present) and code-review reasoning, NOT
  a real browser screenshot — nothing suggests it's broken (same DOM-script
  idiom as the existing autoscroll code), but a future run touching
  `SearchHeader` should sanity-check it renders in an actual browser.
- Search-result rows' name-link points at the SAME `/book?restaurant=...`
  href as the Book pill (no restaurant detail page exists yet) — once the
  restaurant detail page (`/:city-slug/:restaurant-slug`) ships, update
  `SearchResultRow`'s `detailHref` map (currently `book_href`) to point there
  instead, and do the same for the home page's `RestaurantRow`/
  `RestaurantCard` if they have the same shortcut.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`).
