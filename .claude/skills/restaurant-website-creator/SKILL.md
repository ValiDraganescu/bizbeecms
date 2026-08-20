---
name: restaurant-website-creator
description: Create a conversion-focused restaurant website on a bizbeecms Site. Use when the user asks to build or scaffold a restaurant site or its pages (home, menu, about, contact, reservations…), research a restaurant's web presence / gather its data / extract its menu, or build restaurant-specific components.
argument-hint: "[restaurant name / URL / what to build, e.g. 'https://taivaanranta.com — gather info and build the site']"
allowed-tools: Read, Bash, WebSearch, WebFetch, mcp__local-site__get_authoring_guide, mcp__local-site__get_theme, mcp__local-site__get_brand_identity, mcp__local-site__list_components, mcp__local-site__get_component, mcp__local-site__create_component, mcp__local-site__update_component, mcp__local-site__list_assets, mcp__local-site__generate_image, mcp__claude-in-chrome__navigate, mcp__claude-in-chrome__computer, mcp__claude-in-chrome__get_page_text
---

# Restaurant Website Creator

Build a high-converting restaurant website on a bizbeecms Site over MCP (namespaced per site — `mcp__local-site__*` here; substitute the connected site's prefix).

Two phases, two documents:
- **Gathering** (a real restaurant's data): Read `gathering.md` in this skill's folder and follow it to produce `restaurant-research/<slug>/` (profile.json, menu.json, reviews.json, sources.md, assets/). Run it BEFORE building for a real restaurant — all build content (hours, menu items, story, reviews, links, logo) comes from those files, never from imagination.
- **Building** (this file): what to build — pages, navigation, content placement, i18n, imagery. HOW to author components (theme tokens only, `{{t prop}}`, real glyphs, preview loop) is the **cms-components** skill — read `.claude/skills/cms-components/SKILL.md` and follow it for every component. Start every build with `get_authoring_guide`, `get_theme`, `get_brand_identity`, `list_components` — reuse existing components before creating new ones.

## Conversion principles (drive every decision)

Sourced from tryotter.com and richmenu.io best-restaurant-website analyses:

- **One primary conversion goal** per site — ask the user (or infer): Order online, Reserve a table, or Call/visit. That goal's CTA is high-contrast, above the fold on a 375px screen, and one tap away on EVERY page (sticky header, not buried in the hero).
- **Mobile first.** 80%+ of restaurant searches happen on phones; verify every page at 375px width. Static hero image, never autoplaying video (3s load = abandonment).
- **Nothing important is buried.** Hours, address, tap-to-call phone live on the homepage and in the footer of every page — not only on Contact.
- **HTML menu, never a PDF/image menu.** Crawlable text with prices; searchable and readable without zooming.
- **Minimal navigation** — max ~5 items. Every element must answer: does this help a visitor see the menu, place an order/reservation, or find the location?
- **Trust signals near the CTA**: a review quote, rating, or press badge paired with the primary action, not isolated on their own page.
- **Frictionless action path**: ≤3–4 taps from homepage to order/reservation confirmation; no account walls.

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
2. **Trust strip** — 1–3 reviews from `reviews.json` (rating stars, quote, author, source link; author photo only with the owner's approval) or press badges.
3. **Menu teaser** — 3–4 signature dishes (photo, name, one-line description, price) + "Full menu →" link. NOT the whole menu.
4. **Story teaser** — one paragraph of brand personality (seed: `brand_copy_<locale>`) + a photo + "Our story →".
5. **Visit block** — hours, address, embedded map or map image, phone, directions link.
6. **Final CTA banner** — restate the primary action.

### Menu `/menu`
- HTML sections per category (Starters, Mains, Desserts, Drinks…), sticky/anchor category nav on top for long menus.
- Each item: name, description (sourcing/pairing where it sells), price, dietary marks (text glyphs or small badges).
- **Photos on top sellers only (~30% of items)** — photographed items get a card layout, the rest a clean text row. Single-column on mobile, large tap targets.
- If the Site models menu items as a collection (check `get_authoring_guide`), build the menu component over the collection instead of hardcoding items.
- Populate items from `restaurant-research/<slug>/menu.json` — its locale objects map 1:1 onto translatable props. Never retype a menu by hand.

### About `/about`
A conversion tool, not an obligation: origin story with a point of view (2–3 short sections; press findings from gathering feed this), chef/team photo, values/sourcing, interior atmosphere photo, closing CTA back to Menu/Reserve.

### Contact & Location `/contact`
Hours table (per day), full address + map, tap-to-call phone, email, parking/transit note, social links, CTA. Contact form is supplementary — never the only way to reach the restaurant.

### Reservations `/reservations`
Short pitch line, the booking widget/embed (platform identified in gathering) front and center above the fold, phone fallback ("or call us"), policies below.

### Gallery `/gallery`
Curated grid (food, interior, people) — restraint over volume; less, presented exceptionally, reads as quality.

### Locations (multi-unit)
Location finder page + a dedicated page per location (own hours, address, phone, menu variant, local photo) — not just pins on a map. Persistent location selector in the header.

## i18n (mandatory)

- Every guest-visible text prop is `translatable: true` and uses `{{t prop}}`; when placing components on pages, fill values for **ALL site locales** (locale objects), not just `en`. Get the locale list from `get_authoring_guide`.
- Translate for real: menu descriptions, hours labels, CTAs, form labels, policies. Prices, phone numbers, addresses and proper names stay as-is.
- Include the built-in **LanguageSwitcher** in the header (published pages read the `bb_content_locale` cookie).
- Watch length: FI/ET strings run longer than EN — don't design CTAs that only fit the English word.

## Images: generate as you build

The Site's `generate_image` MCP tool creates an image from a prompt, saves it to the gallery, and returns a `/media/...` URL you use directly in image props. `list_assets` first — reuse existing gallery images before generating. Steer style with the gathering pass's `assets/` reference images and `brand.json` — one consistent photographic look across the site.

**Sampling rule for lists — never generate one image per list item.** For any repeated collection (menu items, gallery grid, dish teasers, events), generate **2–3 representative images** and leave the rest imageless or with defaults the owner can replace. Say so: generated food images are placeholders until real photography arrives.

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

## Build order

0. Gather: `gathering.md` → `restaurant-research/<slug>/` complete per its done-when.
1. Discover: `get_authoring_guide`, `get_theme`, `get_brand_identity`, `list_components`, `list_assets`; confirm primary conversion goal + which optional pages apply.
2. Shared shell first: header (logo + nav + CTA + LanguageSwitcher) and footer components.
3. Home, then Menu, then About/Contact, then optional pages.
4. Generate images just-in-time as each component needs them (sampling + sizing rules above).
5. Preview every page in the browser at desktop AND ~375px width; check both light/dark theme and each locale via the switcher.
6. Report what was built, which images are placeholders, and what the owner must supply or approve (real photos, booking embed, review-display permission, exact hours).
