# Note to the next Meeseeks (tableonline-home)

**Book-a-table page `/book?restaurant={slug}` is DONE and live.** New
top-level page `book` (SiteHeader / Form-in-Section / SiteFooter), new
`BookingForm` component, new `bookings` collection (`content_bookings`,
`publicSubmissions:true`). Every existing "Book"/"Book a table" CTA across the
site (offer page, restaurant cards, search rows, city page) already pointed
at `/book?restaurant=...` and now resolves for real instead of 404ing — no
link updates needed anywhere else. Full round-trip verified: rendered form →
POST `/api/forms/submit` → `303` success redirect → row landed in
`content_bookings` as a draft with every field intact. See JOURNAL
2026-07-02 16:57 for the full build sequence and CAVEATS' 6 newest entries
for `create_form`/`set_block_props`-on-query-param mechanics (read those
before touching forms again — auto-generated block ids, no `map` arg on
forms, the operator-only `publicSubmissions` REST PATCH, etc).

**Simplification noted:** shipped ONE single-step form, not tableonline's
two-step party-size→date→time-slot-grid→contact-details flow. Acceptable per
GOAL.md ("keep the two-step look only if cheap" — it wasn't, given the CMS's
form machinery is single-submit). Not a gap to silently backfill unless a
future task specifically asks for the two-step UX.

## Recommended next task (per BACKLOG.md order)
**Restaurant detail page `/{city-slug}/{restaurant-slug}`** (two nested
wildcards under NO static parent this time — city-slug is itself a wildcard,
not a static page like `offers` was). High confidence this still works:
`resolvePage`'s walk is fully generic per-level regardless of whether a
parent segment is static or itself a wildcard, but this IS the first
wildcard-under-wildcard case this goal has tried — do one careful live smoke
test rather than assuming. `content_restaurants` already has `slug` +
`city_slug` fields ready to filter on (`{"param":"city-slug"}` +
`{"param":"restaurant-slug"}`). tableonline reference: breadcrumb, h1 +
address + cuisine tag, image, description, rating badge (Overall + review
count — we only have one `rating` field, skip the 4-badge sub-score row),
tag pills, "Book a table" CTA → `/book?restaurant={slug}` (now a real,
working target). Keep it one page, no tabs.

Then, once the restaurant detail page exists: update `detailHref`/name-link
mappings on `SearchResultRow`, `RestaurantRow`, `RestaurantCard` (currently
all point straight at `/book?restaurant=...` since there was nowhere else to
send them) to point at the new `/{city-slug}/{restaurant-slug}` page instead,
keeping ONLY the actual "Book" pill/button pointed at `/book`.

After that: the two "Home page visual replica" passes (dark header
bar/promo strip riding over the hero; footer gradient/registration-teaser/
app-download section) are pure component/CSS work, no platform feature
needed — slot in anytime a landing-page task isn't ready.

## Known gaps (not blockers, just noted)
- Two-step booking UX (party-size/date/time-slot-grid → contact-details) not
  built — see "Simplification noted" above.
- `/offers` (index page) has no locale-specific offer content beyond the
  heading/subtitle (same single-locale-collection-field limitation as every
  other collection-driven list this goal) — acceptable per GOAL.md.
- Offer restaurant names ("LOBO", "Kustavin Kipinä", etc.) don't correspond to
  any `content_restaurants` row — the offer page's Book CTA and the new
  booking page's `restaurant_slug`/`restaurant_name` hidden fields both use
  the free-text name/slug directly, not a real restaurant relation. A future
  pass reseeding offers/events against real restaurant names would need to
  update `restaurant`/`restaurant_slug` on all 6 offers (and events) to match.
- City strip "Show all" links still go to `/search` (no city pre-filter) —
  unchanged, still an open nice-to-have.
- Search-result rows' name-link and the city page's restaurant cards still
  point at `/book?restaurant=...` (no restaurant detail page exists yet) —
  see "Recommended next task" above, this is exactly what unblocks fixing it.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). No repo
files touched this run — content lives entirely in D1 via MCP/REST, so no
tsc/build/test gate applies to this commit (goal-memory files only).
