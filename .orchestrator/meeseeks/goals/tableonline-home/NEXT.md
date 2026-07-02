# Note to the next Meeseeks (tableonline-home)

**Home page visual replica pass 2 (below the fold) is DONE and live.** Added
`RegistrationTeaser` (bordered teal callout, 3 perks, CTA) and `AppDownload`
(App Store / Google Play badge-style buttons) as two new Sections between the
existing bottom `PromoBanner` tiles and the footer. Upgraded `SiteFooter`:
vertical `#001414→#073535` gradient (was flat `bg-foreground`), a "Follow us"
social row (hand-authored inline Facebook/Instagram/X SVGs — lucide has no
brand icons at all), and all 9 previously-dead `href="#"` footer links now
point somewhere real: Finland→`/helsinki`, Estonia→`/tallinn`, and the other
7 (Contact us, Restaurant backoffice, Terms, Gift card terms, Privacy policy,
For restaurants, For affiliate partners) → `/about` per the task's explicit
"point not-yet-built legal pages at /about for now" instruction. Same `/about`
fallback used for the new teaser's CTA and both app-store badge hrefs. See
JOURNAL 2026-07-02 17:22 for the full build.

**Important discovery this run:** `/about` (and ANY unmatched slug, e.g.
`/signup`) currently 200s but is NOT really a distinct page — the
`[[...slug]]` catch-all silently falls back to rendering the HOME page for
any unmatched/unpublished route. `about` exists as a real page row but its
`publishStatus` is still `"draft"`, so it serves this same fallback. This
means every `/about`-pointing link added this run (and any added previously)
is CURRENTLY a soft-dead-end (looks like a page, is actually just the home
page again) until `/about` (or real Terms/Privacy/Contact/For-restaurants
pages) actually get built and published.

## Recommended next task (per BACKLOG.md order)
**Static/footer pages**: build real content pages for Terms, Privacy policy,
Contact us, and "For restaurants" (reuse the existing `RestaurateurJoin`
component's copy/content for the latter), publish them, then repoint:
- `SiteFooter`'s `col2Link1Href` (Contact us), `col3Link1Href` (Terms),
  `col3Link2Href` (Gift card terms — maybe fold into Terms), `col3Link3Href`
  (Privacy policy), `col4Link1Href` (For restaurants) off `/about` onto the
  new real pages.
- `RegistrationTeaser.ctaHref` and `AppDownload.appStoreHref`/`playStoreHref`
  can stay `/about` (or a dedicated `/signup` page if one gets built later —
  no scope for that yet, it's a real auth flow, not a content page).
- `col2Link2Href` ("Restaurant backoffice") has no natural CMS-content target
  at all (it's presumably an external SaaS login) — leave on `/about` or
  reconsider entirely; not part of the static-pages task.

This closes the LAST known dead-end class on the home page. After that,
GOAL.md's home-page spec is essentially fully delivered — a future run should
re-read `GOAL.md` + do a full click-through regression pass (every card,
every nav link, every footer link) to confirm nothing was missed, then look
for polish (locale coverage gaps, restaurant description quality, etc.) or
flag the goal as effectively "steady state" pending user review.

## Known gaps (carried over + unchanged this run, plus new ones above)
- Two-step booking UX not built (single-step form shipped instead).
- Offer/event `restaurant` fields are free-text names not matching any real
  `content_restaurants` row for 5 names (LOBO, Kustavin Kipinä, Wohls Gård,
  Ravintola Siuntio, White Lady).
- Restaurant `cuisine`/`description` are templated/guessed, not authored.
- City strip "Show all" links still go to plain `/search` (no city filter).
- Only 1 offer has `is_main=1`.
- **NEW: every `/about`-pointing link (footer ×7, registration teaser CTA,
  2 app-store badges) is a soft dead-end** — see "Important discovery" above.

Nothing blocked. No new bugs reported. Dev server was already running on
:3602 all run; MCP token still valid (`.mcp.json` → `local-site`). No repo
files touched this run — content/components live entirely in D1 via
MCP/REST, so no tsc/build/test gate applies to this commit (goal-memory
files only).
