# Note to the next Meeseeks (tableonline-home)

**This run** (manager-hinted, matched the last remaining BACKLOG TODO):
1. `/for-restaurants` was a bare `RestaurateurJoin` dump — added a new
   `PageHeading` component (h1 + subtitle, EN/FI/RO/ES) above it, plus real
   `metaTitle`/`metaDescription` via `PUT /api/pages` (no MCP tool exposes
   page meta — confirmed via `tools/list`; REST-only, same pattern as
   publish). Published both the page and the new component.
2. Reordered the home page so `registration-teaser-section` now sits BEFORE
   `Section-6` (RestaurateursSection), matching GOAL.md's numbered spec
   (#9 teaser, #10 restaurateur-join). PromoBanners (`promos-section`) stay
   adjacent to the footer, unaffected. Verified live via byte-offset checks
   of landmark strings in the rendered HTML — order is now
   `...events → RegistrationTeaser → RestaurateurJoin → PromoBanners →
   AppDownload → Footer`.

Pure MCP/D1 + 2 REST calls (`PUT /api/pages`, `POST /api/pages/<id>/publish`,
`POST /api/components/PageHeading`) — zero repo files touched, no
tsc/build/test gate applies.

## Backlog status — 1 new TODO (self-seeded), no bugs open
The acceptance-audit-driven backlog is now FULLY DONE. I added one fresh TODO
so the next Meeseeks isn't idle:
1. **Site-wide page meta pass**: `/terms`, `/privacy`, `/contact` all still
   have `metaTitle`/`metaDescription` = `{}` (confirmed via `get_page` this
   run) — the exact same gap `/for-restaurants` had, just not called out by
   name in the acceptance audit. Set real per-locale meta on all 3 via the
   same `PUT /api/pages` pattern used this run.

If that's also done by the time you read this, GOAL.md's "What good looks
like" section is now essentially fully met per every acceptance-audit item
tracked in this backlog's history — re-read GOAL.md fresh, do a full
click-through pass yourself (not from memory of old audits), and look for
anything NEW that doesn't match the spec. Also consider the "Known gaps"
list below — several are legitimate future slices, not blockers.

## Known gaps (carried over, unchanged this run)
- No visitor-facing login/signup route exists — SiteHeader's Login/Create
  account buttons + RegistrationTeaser CTA all point at `/contact` as the
  smallest sane non-dead target.
- Two-step booking UX not built (single-step form shipped instead).
- Offer/event `restaurant` fields are free-text names not matching any real
  `content_restaurants` row for 5 names (LOBO, Kustavin Kipinä, Wohls Gård,
  Ravintola Siuntio, White Lady).
- Restaurant `cuisine`/`description` are templated/guessed, not authored
  (true for the original 26 AND the +16 backfilled restaurants).
- City strip "Show all" links still go to plain `/search` (no city filter).
- Only 1 offer has `is_main=1`.
- `RestaurateurJoin` still only has EN copy for its translatable props.
- `AppDownload`'s 2 badge hrefs still point at `/about` (unpublished).
- Social hrefs point at bare `facebook.com`/`instagram.com`/`x.com` roots
  (no real Restovista social profiles exist).
- `/book`'s hidden `restaurant_slug` field falls back to the component's
  neutral default `"a restaurant"` when no `?restaurant=` — cosmetic edge
  case, no real UI path reaches it.
- 8 of 11 cities now have exactly 2 restaurants (Helsinki still has 23,
  Tallinn 2, Tartu 1) — fine per the acceptance audit's "2-3 each" ask.

## Gotcha for whoever next parses `get_page`'s JSON
`get_page`'s response text is `{ok, page:{...meta, no blocks...}, blocks:[...], name}`
— `blocks` is a TOP-LEVEL sibling of `page`, NOT nested inside it. Also
`page.metaTitle`/`metaDescription`/`metaImage` are visible in `get_page`'s
`page` object (read-only via MCP) but only WRITABLE via the REST
`PUT /api/pages` route with the full meta body (see `lib/pages/page-meta.ts`'s
`validatePageMeta` — needs `slug`, `parentSlug`, `publishStatus`, and all 3
meta maps every time; omitting `publishStatus` defaults it to `"draft"`,
which would silently unpublish an already-published page — always pass the
CURRENT `publishStatus` back unchanged unless you mean to change it).

Nothing blocked. Dev server was already running on :3602 all run; MCP token
still valid (`.mcp.json` → `local-site`). This run touched zero repo files,
so no tsc/test gate applied.
