# Goal: tableonline-home
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Replicate **https://www.tableonline.fi/en** as closely as possible on the **local-site CMS** (dev site at http://localhost:3602, admin page builder at http://localhost:3602/admin/page-builder), with these caveats:

- The platform name stays **Restovista** (already the case).
- The **theme** must match tableonline's palette (see below), not the current purple.
- **Every list on the home page (restaurants, offers, events, cities) must be collection-driven** — no hardcoded card props. Create/update collections as needed.
- **Every internal link on the home page must land somewhere real**: click a city → city landing page; claim an offer → offer detail page; book a table → booking page; search → search results page.
- Build any **CMS platform features** required: pages with **wildcard/dynamic URL params** (city pages like `/{city-slug}`) and pages that **read query params** (search page receives `?q=`). NOTE: the archived goal `goals/archive/content-collections/` explicitly deferred "Phase 3 route-driven detail pages + FTS5 full-text search" — read its journal/backlog before designing this; it is the same feature.

## Environment facts (verified 2026-07-02)

- The local site runs at **:3602** (`npm run dev` in `CMS/`). Never run `npx opennextjs-cloudflare build` while dev is running.
- **Content operations go through the CMS's HTTP MCP endpoint**: `POST http://localhost:3602/mcp`, JSON-RPC 2.0, `Authorization: Bearer <token>` — the token is in `.mcp.json` at the repo root under `local-site`. Example:
  `curl -s -X POST http://localhost:3602/mcp -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_pages","arguments":{}}}'`
  Available tools include: list_pages, get_page, create_page, update_page_blocks, get_theme, update_theme, create_collection, add_collection_field, add_collection_item, query_collection, list_components, get_component, create_component, update_component, bind_list, create_list, set_block_props, get_authoring_guide, list_builtin_types, generate_image, search_icons, translate. Call `get_authoring_guide` first when doing page/block work — it documents block-tree and binding semantics.
- Home page id: `86e95f31-e5f8-4adc-95af-ac50098058a4` (slug `home`, locales en/fi/ro-ro).
- Existing collection: `content_restaurants` (fields used by bindings: name, location, image, book_href, rating, reviews, featured, promoted).
- Home page already has: SiteHeader, HomeHero (title/search props), HandpickedSelection, CityLinks (hardcoded tabs Finland/Estonia), two collection-bound restaurant Lists (RestaurantRow, RestaurantCard templates), OffersSection (4 hardcoded OfferCard), EventsSection (4 hardcoded EventCard), RestaurateurJoin, 2 PromoBanner, SiteFooter.

## Target spec (from live tableonline.fi exploration, 2026-07-02)

### Palette (extracted from shipped CSS — the site is dark-teal + off-white, NOT green)
- Page background `#f9f9f6`; primary text `#001414`.
- Brand teal `#124142` (borders, accents, registration-teaser border); deep teal `#073535`.
- Footer: vertical gradient `#001414 → #073535`, white text.
- Top utility bar `#14151a` (near-black), white text.
- Button gradient accent `#124142 → #009688`; secondary teal `#005c53`.
- White pill buttons on photos; card shadow `0 18px 35px rgba(0,0,0,.17)`; error red `#d12c1a`.
- Typography: serif display headings (Petrona-style; any elegant serif ok), clean sans body (DM Sans-style).
- Map these onto the CMS semantic theme tokens (surface/foreground/primary/etc. — hex values accepted). Keep dark mode sensible (teal-tinted darks).

### Home page section order (tableonline)
1. Dark top utility bar (`#14151a`): "For restaurants", language switcher.
2. Transparent nav overlaid on hero: logo, auth buttons (white pill login).
3. Hero: full-bleed photo, dark 50% overlay, white serif headline "Find the restaurant you like", subtitle, plus a combo bar: city selector pills + white rounded search field.
4. Promotions strip riding up onto the hero bottom (`margin-top:-4rem`): one large 16/9 main promo card + a column of secondary promos (title, date, description).
5. "Choose your city" — horizontal-scroll row of photo cards (~19rem wide), dark bottom-gradient overlay, city name in white.
6. Restaurant lists (Restovista already has newest/best — keep, ensure collection-bound).
7. Offers grid — collection-bound.
8. Events grid — collection-bound.
9. Registration teaser: bordered callout (`1px solid #124142`, faint teal tint bg), perks list, CTA.
10. Restaurateur join section (exists).
11. App download section (App Store + Google Play badges).
12. Footer: dark teal gradient, logo, intro text, multi-column link lists, social row, copyright bar.

### URL patterns (tableonline; mirror as closely as the CMS allows)
- City page: `/{city-slug}` directly (e.g. `/helsinki`) — wildcard/dynamic segment.
- Restaurant page: `/{city-slug}/{restaurant-slug}` (tableonline adds a numeric id; optional for us).
- Book: `/{city}/{restaurant-slug}/book` or equivalent `/book?restaurant=...` — pick what the CMS supports, but the button must land on a booking page for THAT restaurant.
- Search: `/search?q=<query>` — the home hero search submits here; page filters restaurants by name/city/cuisine.
- Offer detail: any sane pattern, e.g. `/offers/{slug}`.

### Data model (create as CMS collections)
- **cities**: title, slug, country_code (FI/EE), image. (Helsinki, Espoo, Turku, Tampere, Oulu, Jyväskylä, Kuopio, Porvoo + Tallinn, Tartu, Pärnu.)
- **offers**: title, image, description (multi-line), date_range (free text "1.6.2026 – 31.7.2026"), slug, restaurant (name or relation), is_main (bool, for the promo strip split), city.
- **events**: title, image, description, date, restaurant, location, rating, slug.
- **restaurants**: extend content_restaurants as needed (slug, city slug, cuisine) so city pages and search can filter it.
- Seed collections from the EXISTING hardcoded card props on the home page (don't lose that content) + a few more items for realistic lists. Existing generated images under /media/assets/ may be reused; `generate_image` MCP tool exists for new ones.

### What "good" looks like
A visitor on :3602 sees a home page that reads like tableonline.fi (teal palette, serif headings, photo-card cities, promo strip over the hero), every card comes from a collection, and every click — city, offer, book, search — lands on a real, populated landing page. Search accepts `?q=` and filters. All content in en/fi/ro-ro where the page-builder supports locales (en-only acceptable for new landing pages initially; note it in the journal).
