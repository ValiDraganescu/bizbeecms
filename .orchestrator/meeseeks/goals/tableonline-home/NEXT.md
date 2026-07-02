# Note to the next Meeseeks (tableonline-home)

**The platform-feature blocker is GONE.** Dynamic/param-driven pages now work:
a page slug prefixed with `:` (e.g. `:city-slug`) is a wildcard route segment;
its matched value + any URL query params are available to List/binding filter
`value`s as `{"param":"name"}` / `{"query":"name"}` (resolved per-request,
dropped gracefully when absent). Live-verified end-to-end via MCP `bind_component`
+ `create_list` (see JOURNAL 2026-07-02 16:15). tsc clean, 1446/1446 tests green.

**Read `CAVEATS.md`'s two newest entries before touching pages/bindings** —
especially: `create_page` alone does NOT populate the draft version, so
`bind_component`/`create_list`/`get_page` right after it will fail with
"no block with id X". Always call `update_page_blocks` with the same tree
right after `create_page`, THEN bind.

## Recommended order for the remaining landing pages (all now unblocked)
Per BACKLOG.md, in the order that unlocks the most home-page links fastest:
1. **Search page** (`/search?q=`) — top-level page (NOT wildcard), List/whatever
   filters `content_restaurants` by `name`/`location` LIKE `{"query":"q"}`.
   ALSO fix the HomeHero search `<input>` (no `name`, no `<form>` today) so it
   actually submits `GET /search?q=...`.
2. **City landing page** (`/:city-slug`) — the wildcard pattern smoke-tested
   this run. Filter `content_restaurants`/`content_offers`/`content_events` by
   `city_slug`/`city eq {"param":"city-slug"}`. Wire the home CityCards
   (already link `/{slug}`) to it — they'll just start resolving.
3. **Offer detail** (`/offers/:slug`) — filter `content_offers` by
   `slug eq {"param":"slug"}`. Home OfferCards already link here.
4. **Book-a-table** (`/book?restaurant=...`) — query-param, not wildcard (the
   query IS the restaurant id already, per the data-fix run). Use the CMS form
   machinery (`create_form`/`bind_form`) into a bookings collection.
5. **Restaurant detail** (`/:city-slug/:restaurant-slug` — TWO nested wildcard
   levels, both work with this feature: each tree level independently falls
   back to its wildcard sibling). Link restaurant names here from
   home/city/search cards instead of straight to book.

Then the two "Home page visual replica" passes (header/hero dark bar +
promo strip; footer/registration-teaser/app-download) are pure component/CSS
work, no platform feature needed — can be done anytime.

Nothing blocked. No new bugs reported. Dev server was already running on :3602
all run; MCP token still valid (`.mcp.json` → `local-site`). The scratch test
page (`:city-slug`, id `426cf071-...`) created during smoke-testing was
DELETED before finishing — don't be confused if you see it in an old MCP
response cached somewhere; `list_pages` no longer shows it.
