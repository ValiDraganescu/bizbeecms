# Note to the next Meeseeks (tableonline-home)

Cities collection (task 2) is DONE: `content_cities` (title, country_code FI/EE, image; system `slug`+`status` set explicitly at seed time) has 11 published items (8 FI: espoo/helsinki/jyvaskyla/kuopio/oulu/porvoo/tampere/turku; 3 EE: parnu/tallinn/tartu). Home page's old hardcoded `CityLinks` block is replaced with a "Choose your city" heading + "Finland"/"Estonia" sub-headings each followed by a horizontal-scroll `List` of a new `CityCard` component (photo, dark bottom gradient, white serif name, links to `/{slug}`), bound via `create_list`/`bind_list` with `country_code` filter — verified live on :3602 in en + fi.

**CRITICAL — READ CAVEATS.md FIRST, especially the new draft/publish entries.** Both pages AND components have a draft/publish split; MCP tools (`update_page_blocks`, `update_component`, etc.) only ever touch the DRAFT. Nothing you author via MCP is live — or even bindable via `bind_list`'s prop-declared check — until you publish:
```
curl -X POST http://localhost:3602/api/pages/<id>/publish
curl -X POST http://localhost:3602/api/components/<Name> -H 'content-type: application/json' -d '{"action":"publish"}'
```
Local dev auto-auths as SuperAdmin (no cookie needed). I lost real time on this — the DB genuinely had my new blocks/prop the whole time, `get_page`/`get_component` (MCP) show the DRAFT so they looked "wrong"-free, but the live HTML and `bind_list`'s validation both read the PUBLISHED side. Verify via `npx wrangler d1 execute bizbeecms-cms --local --command "SELECT ..."` on `page_version`/`component` if `curl :3602/` output doesn't match what you just wrote.

Next up per BACKLOG.md (in order): **offers collection** — create via `create_collection`/`add_collection_item`, seed from the 4 existing hardcoded `OfferCard` props on the home page (get_page it first to read them) + 2-4 more, replace the hardcoded offers row with a collection-bound `List` (reuse the `create_list`/`bind_list` pattern from this run; remember the `map` can't compute a prefixed href — if the offer link needs `/offers/{slug}`, give `OfferCard` a plain string `slug`-mapped prop and bake the `/offers/` prefix into the component HTML, same trick used for `CityCard`/`citySlug`). Then events collection (same pattern). The offer-detail page itself (`/offers/{slug}`) doesn't need to exist yet for this task — that's a later backlog item.

Also worth remembering for whoever builds the wildcard-page platform feature: no such route exists yet in `CMS/src/app/`. The `[[...slug]]` catch-all currently only resolves by matching literal page slugs against D1 — it doesn't support a `:param` wildcard segment or exposing query params to blocks. That's real repo-code work (`CMS/src/app/[[...slug]]/page.tsx` + `lib/render/`), not MCP content work — build it with tests like any other CMS feature.

Nothing blocked. No new bugs reported.
