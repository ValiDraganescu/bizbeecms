# Note to the next Meeseeks (tableonline-home)

**Static/footer pages are DONE.** Built 4 new top-level pages: `/terms`,
`/privacy`, `/contact` (all via a new `LegalContent` component — title +
richtext body, real EN/FI/RO/ES copy authored for each, `whitespace-pre-line`
paragraphs) and `/for-restaurants` (reuses the existing `RestaurateurJoin`
component as-is, its pre-existing content). Repointed `SiteFooter`'s
`col2Link1Href` (Contact us)→`/contact`, `col3Link1Href` (Terms)→`/terms`,
`col3Link2Href` (Gift card terms)→`/terms` (folded in, no separate content),
`col3Link3Href` (Privacy policy)→`/privacy`, `col4Link1Href` (For
restaurants)→`/for-restaurants`. Home page republished. See JOURNAL "this
run" entry for full detail + verification.

**Left on `/about` deliberately (not missed):** `col2Link2Href` (Restaurant
backoffice — no CMS-content target, presumably external SaaS login),
`col4Link2Href` (For affiliate partners — no content asked for),
`RegistrationTeaser.ctaHref`, both `AppDownload` badge hrefs, and the 3
social-icon hrefs (Facebook/Instagram/X — no real profiles to link).

## Backlog status
Every item in BACKLOG.md's `## Tasks` section is now DONE. No open bugs.
This was explicitly flagged as the LAST known dead-end class on the home
page in the prior NEXT.md — that's now closed too.

## Recommended next task
GOAL.md's home-page spec is essentially fully delivered. Per the prior run's
own recommendation (never acted on since footer pages took priority):
1. **Full click-through regression pass**: re-read `GOAL.md`, then manually
   walk every nav link, every card (restaurant/offer/event/city), every
   footer link, the search form, and the booking flow end-to-end on :3602 to
   confirm nothing regressed across the many runs that touched shared
   components (`SiteHeader`, `SiteFooter`, `RestaurantCard`, etc.).
2. If that's clean, look for polish from the "Known gaps" list below, or
   consider the goal "steady state" pending user/design review — there is no
   more scaffolding work queued in BACKLOG.md, so the next Meeseeks should
   either do a real regression pass or pick ONE polish item and log it as a
   new BACKLOG TODO before starting (don't invent silently).

## Known gaps (carried over, unchanged this run)
- Two-step booking UX not built (single-step form shipped instead).
- Offer/event `restaurant` fields are free-text names not matching any real
  `content_restaurants` row for 5 names (LOBO, Kustavin Kipinä, Wohls Gård,
  Ravintola Siuntio, White Lady).
- Restaurant `cuisine`/`description` are templated/guessed, not authored.
- City strip "Show all" links still go to plain `/search` (no city filter).
- Only 1 offer has `is_main=1`.
- `RestaurateurJoin` (reused for `/for-restaurants`) still only has EN copy
  for its translatable props — a pre-existing gap from the run that first
  created it, not introduced here. Low priority: fill in FI/RO/ES if a
  future pass wants full locale parity on that page.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). No repo
files touched this run — content/components live entirely in D1 via
MCP/REST, so no tsc/build/test gate applies to this commit (goal-memory
files only).
