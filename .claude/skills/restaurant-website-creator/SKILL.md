---
name: restaurant-website-creator
description: Create a conversion-focused restaurant website on a bizbeecms Site. Use when the user asks to build or scaffold a restaurant site or its pages (home, menu, about, contact, reservations…), research/gather a restaurant's data or extract its menu, or build restaurant-specific components.
argument-hint: "[restaurant name / URL / what to build, e.g. 'https://taivaanranta.com — gather info and build the site']"
---

# Restaurant Website Creator

Build a high-converting restaurant website on a bizbeecms Site over MCP (namespaced per site — `mcp__local-site__*` here; substitute the connected site's prefix). Two phases: **gathering** — follow `gathering.md` in this skill's folder to produce `restaurant-research/<slug>/` — then **building**, this file. All build content (hours, menu items, story, reviews, links, logo, photos) comes from the gathered files, never from imagination; the gathered dataset's usage rights are governed by the **rights premise** defined in `gathering.md`.

Component markup, where a block needs it, follows the **cms-components** skill — read `.claude/skills/cms-components/SKILL.md` (theme tokens only, `{{t prop}}`, real glyphs, preview loop).

## Build order

1. Gather: `gathering.md` → `restaurant-research/<slug>/` complete per its done-when. Skip only if the folder already exists and is complete.
2. **Handoff brief** — read `restaurant-research/<slug>/key-findings-for-the-build.md` unless this session wrote it and it is still in context (gathering and building are usually separate sessions). It carries the conversion goal, booking mechanism, brand tokens, and page-inventory decisions; follow its pointers into profile.json/menu.json/reviews.json/assets rather than re-deriving them. If the folder exists but the brief is missing, the gathering is incomplete — finish it before building.
3. Discover: `get_authoring_guide` (context `general`), `get_theme`, `get_brand_identity`, `list_builtin_types`, `list_components`, `list_pages`, `list_assets`, `list_locales` — reuse what exists before creating anything. Confirm the primary conversion goal and which optional pages apply (see **Page inventory**).
4. Theme (guide context `settings` first): pick the design-system archetype matching the category (`list_design_systems` → `get_design_system`), override its accent colors and fonts with the client's `brand.json`, apply via `update_theme` (light AND dark) + Theme font picks; set the brand identity (`update_brand_identity`).
5. Brand assets into the gallery via `upload_asset` (logo, favicon; harvest photos as pages need them — see **Images**).
6. Shared shell (guide context `components` first): header and footer — the two legitimately shared components (see **Page inventory** for their contents).
7. Compose pages Section-by-Section per **Page composition**: Home, then Menu, then About/Contact/Reservations, then optional pages. Fetch guide context `page-builder` before the first page; re-fetch after any new component or collection lands mid-build.
8. Forms (guide context `collections` first): recreate every gathered form as collection + Form (see **Forms → collections**).
9. Images just-in-time as each block needs them, per **Images**.
10. Verify: open every page with the Chrome browser tool and take screenshots at desktop AND ~375px width, both light/dark, each locale via the switcher — then judge each screenshot as a designer would: section rhythm (air between sections), one aligned grid, equal-height repeated cards, image crops, text contrast on photos, CTA visibility above the fold. Fix what reads wrong and re-screenshot until the design satisfies. Also: each page's Layers tree in the page builder shows the named Sections, rows, and columns you intended; AND all three site linters exit 0 against the dev server: `node CMS/scripts/lint-section-padding.mjs`, `node CMS/scripts/lint-repeated-items.mjs`, `node CMS/scripts/lint-external-links.mjs`.
11. Report what was built, which images are placeholders vs. harvested originals, and what the owner must still supply (higher-res photos for subjects the harvest lacks, exact hours, open content gaps).

## The Site's own authoring guide

`get_authoring_guide` returns the SAME system prompt the in-CMS assistant runs on, assembled LIVE for this Site: identity, every existing component with its declared props, every collection's exact table name + fields, the content locales, the builtin block types, and the CMS's authoring rules. It is per-Site and changes as the Site grows, so fetch it fresh for the context you are about to work in (the Build order names each step's context) — a remembered copy from another site or an earlier session makes you guess prop names and table names (the classic failure: guessing `restaurants` for `content_restaurants`).

**Precedence:** on CMS mechanics (block/prop shapes, HTML attribute rules, locale requirements, table names, tool usage) the live guide WINS over this skill. This skill governs the restaurant layer — conversion strategy, page inventory, content placement, imagery.

## Conversion principles (drive every decision)

- **One primary conversion goal** per site — ask the user (or infer): Order online, Reserve a table, or Call/visit. That goal's CTA is high-contrast, above the fold on a 375px screen, and one tap away on EVERY page (sticky header, not buried in the hero).
- **Mobile first.** 80%+ of restaurant searches happen on phones; verify every page at 375px width. Static hero image, never autoplaying video (3s load = abandonment).
- **Nothing important is buried.** Hours, address, tap-to-call phone live on the homepage and in the footer of every page — not only on Contact.
- **HTML menu, never a PDF/image menu.** Crawlable text with prices; searchable and readable without zooming.
- **Minimal navigation** — max ~5 items. Every element must answer: does this help a visitor see the menu, place an order/reservation, or find the location?
- **Trust signals near the CTA**: a review quote, rating, or press badge paired with the primary action, not isolated on their own page.
- **Frictionless action path**: ≤3–4 taps from homepage to order/reservation confirmation; no account walls.

## Page composition — the Layers tree IS the deliverable

The operator lives in the page builder's Layers panel; a page whose tree they cannot read, reorder, and edit block-by-block is a failed build even when the pixels look right.

- **Sections own layout.** Every page is a stack of named `Section`s (top level), each holding `__section_row__`s with a real `columns` count and `__section_column__`s holding the content blocks. A 3-card row is a 3-column row with one card per column — never one component that renders its own grid. Widths, padding, background bands, and column splits live in Section/row/column props, so the operator can restyle in the builder without touching markup.
- **Blocks stay small.** One block = one thing: a heading, a paragraph, a dish row, an image, a button group. A mega-component with a whole page section inside gives the operator a single opaque layer.
- **Inline first, componentize on the second use.** Author one-off markup inline if the Site offers an inline-HTML block (check `list_builtin_types`); until it does, use a page-scoped single-use component named for its page (`HomeHero`, `AboutTeam`) with no layout duties. Promote to a shared reusable component only when a second page needs the same thing — header and footer qualify immediately (every page); a hero does not.
- **One grid.** Pick the content width ONCE (the design system's `container-max`) and give every Section the same maxWidth and horizontal padding. Mixed section widths read as broken, not as rhythm. Full-bleed backgrounds (hero photo, footer band) are the only exception, and their inner content still aligns to that same grid.
- **Declared spacing.** Every Section carries explicit `paddingTop`/`paddingBottom` in its props: a real value where neighbors need air, `0` where the edge touches by design (header on hero, footer band). Component markup spaces content *inside* a section; the section props own the rhythm *between* sections.
- **Equal-size repeats.** A row of repeated cards gets `verticalAlign: "stretch"` on the row and `h-full` on the card component's root (`mt-auto` on bottom-anchored content) so every card renders the same height; every `<img>` inside a repeated component pins its rendered size with `object-cover` plus an `aspect-*` or `h-*` class so photos of any intrinsic ratio render uniform.
- **Uniform CTAs.** Buttons in one group share height and typography; stacked on mobile they also share width (`w-full sm:w-auto` on every button in the group).
- **Phones are tap-to-call.** Every phone number renders inside a `tel:` link styled as a button from the site's system (a shared ghost-button component works site-wide: footer, contact, visit blocks, prose sections). Body copy references the button ("order via the number below") — a bare number in text is a dead end on the device where most guests read it.
- **External links open in a new tab.** Never write `target`/`rel` in markup — set the link's companion flag: `<propName>NewTab: true` in the block's props (or `newTab: true` on the link prop's schema spec) and the renderer emits `target="_blank" rel="noopener noreferrer"`. Internal navigation stays same-tab.

## Page inventory & navigation structure

**Header (every page):** logo (from `assets/logo.*`, → Home) · nav: Menu, About, Contact (+ Reservations/Order if that's the goal) · primary CTA button (sticky, high contrast) · built-in LanguageSwitcher. On phones: hamburger or bottom bar, CTA stays visible.
**Footer (every page):** hours, address (→ map link), tap-to-call phone (`tel:` link), social + platform links from `profile.json → links`, legal-entity line (registry data in profile.json), secondary nav.

| Page                           | Route                                | Required?                        |
|--------------------------------|--------------------------------------|----------------------------------|
| Home                           | `/`                                  | yes                              |
| Menu                           | `/menu`                              | yes                              |
| About / Our story              | `/about`                             | yes                              |
| Contact & Location             | `/contact`                           | yes                              |
| Reservations                   | `/reservations`                      | if reservation-driven            |
| Order online                   | external/embedded                    | if order-driven                  |
| Gallery                        | `/gallery`                           | optional                         |
| Events / Catering / Gift cards | `/events` etc.                       | only if the restaurant offers it |
| Locations                      | `/locations` + one page per location | multi-location only              |

Confirm which optional pages apply before scaffolding them.

### Home `/` (the conversion hub)
Top → bottom:
1. **Hero** — full-width food/interior photo with a token-gradient overlay, restaurant name + one-line positioning ("Wood-fired Neapolitan pizza in Kallio"), primary CTA + secondary CTA (View menu). Hours + area/address line visible in or directly under the hero.
2. **Trust strip** — 1–3 reviews from `reviews.json` (rating stars, quote, author, source link — attribute and link per the source platform's rules) or press badges.
3. **Menu teaser** — 3–4 signature dishes (photo, name, one-line description, price) + "Full menu →" link. NOT the whole menu.
4. **Story teaser** — one paragraph of brand personality (seed: `brand_copy_<locale>`) + a photo + "Our story →".
5. **Visit block** — hours, address, embedded map or map image, phone, directions link.
6. **Final CTA banner** — restate the primary action.

### Menu `/menu`
- HTML sections per category (Starters, Mains, Desserts, Drinks…), sticky/anchor category nav on top for long menus.
- Each item: name, description (sourcing/pairing where it sells), price, dietary marks (text glyphs or small badges).
- **Photos on top sellers only (~30% of items)** — photographed items get a card layout, the rest a clean text row. Single-column on mobile, large tap targets.
- If the Site models menu items as a collection (check the authoring guide), build the menu component over the collection instead of hardcoding items.
- Populate items from `restaurant-research/<slug>/menu.json` — its locale objects map 1:1 onto translatable props. Never retype a menu by hand.

### About `/about`
A conversion tool, not an obligation: origin story with a point of view (2–3 short sections; press findings from gathering feed this), chef/team photo, values/sourcing, interior atmosphere photo, closing CTA back to Menu/Reserve.

### Contact & Location `/contact`
Hours table (per day), full address + map, tap-to-call phone, email, parking/transit note, social links, CTA. Contact form is supplementary — never the only way to reach the restaurant.

**Forms → collections.** Every form gathering inventoried (`profile.json → forms`: contact, inquiry, event/cabinet booking) is recreated with the CMS's own form machinery, not hand-rolled markup: `create_collection` (+ `add_collection_field` matching the gathered fields) for the submissions, then `create_form` / `bind_form` writing into it — the owner reads inquiries inside the CMS. Form labels, placeholders, and confirmation copy are guest-visible text: all locales.

### Reservations `/reservations`
Short pitch line, then the booking module EMBEDDED front and center above the fold: use `profile.json → booking.embed` verbatim (the current site's own widget markup), else build the embed from `booking.deep_link` (the URL that opens THIS venue's booking flow directly). A plain link to the platform's landing page — where the visitor must find the booking button all over again — is a conversion leak; link out (new tab) only when gathering found no embed and no deep link, and flag it in the report. Phone fallback ("or call us"), policies below. If gathering found a reservation/inquiry FORM (`profile.json → forms`), recreate it here per the Contact rule.

**TableOnline instabook** (common FI booking platform):
- Embed the direct host: `https://book.tableonline.com/res_<id>`. Legacy `v2.tableonline.fi/instabook/bookings/<id>` URLs 302 there and the redirect DROPS the query string — resolve the redirect once and iframe the target.
- The widget reads `?persons=`, `date=YYYY-MM-DD`, `time=`, `promotion_id=` from its URL; `persons` pre-completes the Party Size step, so a page-side guest-count selector can swap the iframe `src` (each swap reloads the widget) and the guest never picks the size twice.
- Give the iframe full section width and ~720px height — at ≥~600px it renders its two-panel layout; narrow (~330px) falls back to a cramped phone layout. No frame-blocking headers as of 2026-08.

### Gallery `/gallery`
Curated grid (food, interior, people) — restraint over volume; less, presented exceptionally, reads as quality.

### Locations (multi-unit)
Location finder page + a dedicated page per location (own hours, address, phone, menu variant, local photo) — not just pins on a map. Persistent location selector in the header.

## i18n (mandatory)

- Every guest-visible text prop is `translatable: true` and uses `{{t prop}}`; when placing components on pages, fill values for **ALL site locales** (locale objects), not just `en`. Get the locale list from the authoring guide.
- Translate for real: menu descriptions, hours labels, CTAs, form labels, policies. Prices, phone numbers, addresses and proper names stay as-is.
- Include the built-in **LanguageSwitcher** in the header (published pages read the `bb_content_locale` cookie).
- Watch length: FI/ET strings run longer than EN — don't design CTAs that only fit the English word.

## Images

Priority order for every image slot: existing gallery asset (`list_assets`) → harvest photo → generated image.

**Harvest first.** The gathered `assets/photos/` are publishable site imagery (rights premise): match slots against `photos.json` descriptions + dimensions and upload the fits via `upload_asset` (filename + base64 `data` or a full `data:` URL; optional `contentType`/`tags`; 20 MB cap; returns the `/media/...` URL for image props). Also upload the logo and favicon this way. If `upload_asset` is missing from your tool list, the MCP connection predates the tool — reconnect.

**Dimmed URLs.** Write raster image props as `/media/<key>?w=<W>&h=<H>` using the asset's intrinsic pixels (from `list_assets`) — the renderer emits responsive `srcset` and the CDN serves right-sized variants only for dimmed URLs; a bare `/media/<key>` ships the full master to every viewer.

**Generate for the gaps** with `generate_image` (saves to the gallery, returns a `/media/...` URL), steering style with the harvest photos and `brand.json` — one consistent photographic look across the site. Generated food images are placeholders until real photography arrives — say so in the report.

**Sampling rule for lists — never generate one image per list item.** For any repeated collection (menu items, gallery grid, dish teasers, events), use 2–3 representative images and leave the rest imageless or with defaults the owner can replace.

**Sizing/aspect.** Check the `generate_image` schema at run time: if it exposes a size/aspect/dimensions parameter, set it per the table below. If it doesn't (current state — prompt-only), steer the shape through the prompt wording and keep small-use images square so they crop well. Never ship a hero-scale image into a thumbnail slot or vice versa.

| Use                        | Aspect / size intent    | Prompt hints                                                                  |
|----------------------------|-------------------------|-------------------------------------------------------------------------------|
| Hero background            | wide 16:9–21:9, largest | "wide panoramic banner photo, cinematic, room for overlaid text"              |
| Section/story photo        | 4:3 or 3:2, medium      | "editorial restaurant interior photo"                                         |
| Menu item / dish thumbnail | square 1:1, small       | "square overhead close-up of a single plated dish, appetizing, natural light" |
| Gallery tile               | square or 4:3, medium   | consistent style across the 2–3 you generate                                  |
| Logo / icon / cut-out dish | square, small           | `transparentBackground: true` (sits on a colored section)                     |
| Map placeholder            | wide 2:1                | prefer a real embedded map; generate only as fallback                         |

**Quality prompts:** always specify subject, cuisine, plating, lighting (natural/warm), camera angle (overhead/45°), mood, and "photorealistic, appetizing, professional food photography". Match the restaurant's cuisine and brand (`get_brand_identity`).

**Cut-outs:** a dish/logo/icon sitting ON a colored section needs `transparentBackground: true`; a full-bleed photo backdrop does not (see cms-components).
