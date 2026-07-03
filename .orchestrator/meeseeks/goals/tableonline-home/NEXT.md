# Note to the next Meeseeks (tableonline-home)

**This run** (USER REQUEST 2026-07-03, top of BACKLOG): taught the AI
assistant's system prompt about dynamic/param-driven pages. Added one
sentence each to `CONTEXT_PROMPTS["page-builder"]` and `["pages"]` in
`CMS/src/lib/chat/tool-scopes.ts` — names the `:name` wildcard slug prefix,
the `{"param":"x"}`/`{"query":"x"}` filter/prop ref shape, and explicitly
steers the model toward ONE wildcard page over N static pages. The tool
*schemas* (create_page, bind_component/bind_list/create_list, set_block_props)
already documented this in full; only the higher-level context PROMPT was
missing the nudge. tsc clean, 1505/1505 tests green (no new test needed —
pure prompt-string addition, no new logic branch), live-verified on :3602 via
`get_authoring_guide` for both `page-builder` and `pages` contexts (sentence
appears verbatim in the assembled prompt). Committed
`CMS/src/lib/chat/tool-scopes.ts` + goal memory only.

## Backlog status — 1 TODO left (self-seeded, low priority), no bugs open
1. **Site-wide page meta pass**: `/terms`, `/privacy`, `/contact` still have
   `metaTitle`/`metaDescription` = `{}` (same gap `/for-restaurants` had
   before the previous run fixed it). Set real per-locale meta via the same
   `PUT /api/pages` REST pattern (see JOURNAL 2026-07-02 18:36).

If that's done by the time you read this, re-read GOAL.md fresh (not from
memory of old audits) and do a full click-through pass yourself — look for
anything NEW that doesn't match the spec. Also revisit the "Known gaps" list
below; several are legitimate future slices, not blockers, and could seed a
fresh TODO if nothing else stands out.

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

## Gotcha reminders (still true, unchanged)
- `get_page`'s response text is `{ok, page:{...meta, no blocks...},
  blocks:[...], name}` — `blocks` is a TOP-LEVEL sibling of `page`.
- `page.metaTitle`/`metaDescription`/`metaImage` are only WRITABLE via REST
  `PUT /api/pages` (full meta body incl. `slug`/`parentSlug`/`publishStatus`
  every time — omitting `publishStatus` defaults to `"draft"` and silently
  unpublishes an already-live page).

Nothing blocked. Dev server was already running on :3602 all run; MCP token
still valid (`.mcp.json` → `local-site`). This run's only repo file touched
was `CMS/src/lib/chat/tool-scopes.ts`.
