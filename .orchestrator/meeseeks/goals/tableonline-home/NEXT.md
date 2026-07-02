# Note to the next Meeseeks (tableonline-home)

**Home page visual replica pass 1 (header/hero) is DONE and live** — dark
`#14151a` top utility bar (was light/inverted-contrast), transparent nav
absolutely-positioned over the full-bleed hero photo (50% flat dark overlay,
serif headline), and a new promotions strip riding up `-4rem` over the hero
bottom: one large 16/9 `PromoMain` card (`content_offers.is_main=1`) + a
`PromoSecondary` column (3 non-main offers). The 2 bottom `PromoBanner`
blocks were left untouched as instructed. See JOURNAL 2026-07-02 17:16 for
the full build sequence.

**Key technique for next time you need to overlay one block on another:**
there's NO `position` support in the Section/row/column layout system at
all — bake `position:absolute` classes into the COMPONENT's own root tag via
a plain `wrapClass`-style string prop, only override it via `set_block_props`
on the ONE block instance that needs it (kept `SiteHeader` a single shared
component used on every page — only home's instance got the transparent/
absolute override; every other page still renders the old opaque nav,
verified zero regression on /helsinki, /search, /book, /offers,
/offers/lobo-brunch-19). For "ride content up over the section above it",
use column-level `marginTop` (negative, with `marginTopUnit`) — that's the
ONLY margin knob that exists in this layout system (Section/row have none).

## Recommended next task (per BACKLOG.md order)
**Home page visual replica pass 2** (below the fold): registration teaser
callout (`1px solid #124142` border, faint teal-tint bg, perks list + CTA —
absent today), app-download section (App Store / Google Play badges —
absent today), footer upgrade (vertical gradient `#001414→#073535` instead
of flat `bg-foreground`, "Follow us" social icon row, copyright bar, and
replace the 9 dead `href="#"` footer links with real targets — point
not-yet-built legal pages at `/about` for now and note it, per the BACKLOG
entry's own guidance). Pure component/content work, same pattern as this
run and every run before it.

Then: **Static/footer pages** (Terms/Privacy/Contact/"For restaurants") —
lowest priority, do last, so no footer link 404s once pass 2 wires them up.

## Known gaps (not blockers, carried over + unchanged this run)
- Two-step booking UX not built (single-step form shipped instead).
- Offer/event `restaurant` fields are free-text names not matching any real
  `content_restaurants` row for 5 names (LOBO, Kustavin Kipinä, Wohls Gård,
  Ravintola Siuntio, White Lady) — `restaurant_slug` backfilled so Book CTAs
  still work, just don't resolve to a real restaurant detail page.
- Restaurant `cuisine`/`description` are templated/guessed, not authored.
- City strip "Show all" links still go to plain `/search` (no city filter).
- Only 1 offer has `is_main=1` (spec allowed "1-2"; one was visually
  sufficient for a single large promo card — a future run could flip a 2nd
  offer's `is_main` if a design ever calls for rotating/multiple mains, but
  the current component only renders the FIRST match via `bind_component`
  so a 2nd `is_main=1` wouldn't currently show anywhere without more work).

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). No repo
files touched this run — content/components live entirely in D1 via
MCP/REST, so no tsc/build/test gate applies to this commit (goal-memory
files only).
