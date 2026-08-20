---
version: alpha
name: Nordic Fine Dining
description: >-
  Editorial, calm, seasonal. For fine-dining and chef-driven restaurants:
  warm paper neutrals, near-black ink, one muted botanical accent,
  characterful sans headlines, typographic menus, photography-led heroes.
colors:
  surface: "#faf8f4"
  surface-raised: "#ffffff"
  surface-dim: "#f1ede4"
  on-surface: "#1c1a17"
  on-surface-muted: "#6b665e"
  primary: "#44523f"
  on-primary: "#faf8f4"
  outline: "#e5e0d6"
  success: "#57734e"
  warning: "#a8742c"
  danger: "#9c3a2e"
  info: "#4a6272"
  dark-surface: "#171512"
  dark-surface-raised: "#211e1a"
  dark-surface-dim: "#121009"
  dark-on-surface: "#ece7dd"
  dark-on-surface-muted: "#a49d90"
  dark-primary: "#8ba07f"
  dark-on-primary: "#171512"
  dark-outline: "#37332c"
typography:
  display:
    fontFamily: Antonio
    fontSize: 72px
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Antonio
    fontSize: 44px
    fontWeight: 500
    lineHeight: 1.08
  headline-md:
    fontFamily: Antonio
    fontSize: 28px
    fontWeight: 500
    lineHeight: 1.15
  body-lg:
    fontFamily: Poppins
    fontSize: 18px
    fontWeight: 300
    lineHeight: 1.7
  body-md:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.65
  label-caps:
    fontFamily: Poppins
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0.14em
  menu-item:
    fontFamily: Antonio
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: 0.02em
  price:
    fontFamily: Poppins
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.2
    fontFeature: '"tnum"'
rounded:
  none: 0px
  sm: 2px
  full: 9999px
spacing:
  unit: 8px
  section-desktop: 112px
  section-mobile: 56px
  container-max: 1160px
  gutter: 24px
  card-padding: 32px
  menu-row-gap: 28px
components:
  button-primary:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.none}"
    height: 52px
    padding: 0 32px
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.on-surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.none}"
    height: 52px
    padding: 0 32px
  card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.sm}"
    padding: "{spacing.card-padding}"
  input-field:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    height: 52px
    padding: 14px 16px
  badge-diet:
    backgroundColor: "{colors.surface-dim}"
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.full}"
    padding: 4px 10px
---

# Nordic Fine Dining

## Overview

An editorial design language for fine-dining and chef-driven restaurants in the Nordic tradition (distilled from Noma, Olo, Grön, Palace and peers). The site should feel like a well-set table: calm, warm, unhurried, confident enough to leave space empty. The emotional target is *quiet anticipation* — the visitor should sense craft and seasonality before reading a word.

Restraint is the identity. One accent color, two typefaces, photography and whitespace carry the atmosphere; decoration never does. Density is low: fewer elements per screen, each given room. The voice is understated — the food is the spectacle, the UI is the linen.

**Override slots.** When applying this archetype to a specific restaurant, replace from its `brand.json`: `colors.primary`/`on-primary` (and `dark-primary`) with the brand accent; `typography.*.fontFamily` with the brand's heading/body fonts (keep the sizes, weights and spacing here — they are the archetype); the imagery mood board. Everything else changes only for cause.

## Colors

The palette is warm paper, not clinical white — Nordic light, not laboratory light.

- **Surface (#faf8f4):** warm off-white paper; the default page ground. Raised cards go pure white (#ffffff), recessed bands go deeper cream (#f1ede4) — three tones of paper are the entire background system.
- **Ink (#1c1a17):** soft near-black for headlines and body; never pure #000. Muted ink (#6b665e) for captions, metadata, secondary lines.
- **Primary (#44523f):** a muted botanical green — the single accent, and the default override slot for the restaurant's own brand color (e.g. Taivaanranta's plum #5a4d6a drops in here). Used *only* for the primary action, active states, and rare emphasis. If the accent appears more than twice per viewport, it is being overused.
- **Outline (#e5e0d6):** hairline warm gray for rules and borders; borders do the separating work shadows would do elsewhere.
- **Semantic** (success/warning/danger/info): muted, earthy versions — status colors must sit inside the palette's calm, not shout over it. Reserve for forms and system feedback only, never for marketing emphasis.

## Dark Mode

Dark mode is candlelight, not terminal: warm charcoal surfaces (`dark-surface` #171512 — brown-black, never blue-black), bone text (#ece7dd), and the accent *lightened* to `dark-primary` (#8ba07f, or the brand accent raised to comparable lightness) so it keeps contrast against dark ground. Photography needs no treatment — moody food photography is native to dark mode. Hairlines lighten to `dark-outline`; the three-paper-tones system maps 1:1 to three charcoal tones.

## Typography

Two faces, strict roles. Headlines use a characterful condensed grotesque (default **Antonio**); body uses a quiet humanist sans (default **Poppins**, light weights). Nordic fine dining reads as modern sans, not ornate serif — elegance comes from scale contrast and spacing, not from flourishes.

- **Display/Headlines:** condensed, tightly leaded, sentence case. The hero display is the loudest element on the site; nothing else competes with it.
- **Body:** small and airy (16–18px, generous 1.65–1.7 line height, light weight where the font family carries it). Paragraphs stay short.
- **Labels (`label-caps`):** uppercase, wide letter-spacing (0.14em) — section eyebrows, nav items, buttons, menu section headers. This is the "engraved menu card" gesture that does the fine-dining signaling.
- **Menu items (`menu-item`):** dish names in the headline face at modest size; descriptions in muted body; prices in `price` with tabular numerals so columns align.
- An optional third *accent* face (script or serif italic, e.g. a brand's Dancing Script) is permitted for one gesture only — a hero flourish or a signature-dish marker — and maps to the CMS "Accent" font role.

## Layout

Editorial single column with wide margins; the grid is felt, not seen.

- **Rhythm:** 8px base unit. Sections separate with large vertical space (112px desktop / 56px mobile) instead of background-color stripes — whitespace is the section divider; alternate into a `surface-dim` band at most once or twice per page.
- **Measure:** text content holds a readable column (~65ch) inside a 1160px max container; imagery may break out to full bleed.
- **Asymmetry:** two-column rows pair one image with one text block at unequal widths (roughly 7/5); centered symmetric layouts are reserved for the hero and menus.
- **Menus:** single centered column, dotted-leader-free — name left, price right on the same line, description beneath. No cards, no zebra striping; space between rows (28px) is the separator.
- Mobile first: one column, same generous spacing halved, CTA reachable without scrolling past the hero.

## Elevation & Depth

Flat by conviction. Hierarchy comes from the three paper tones, hairline outlines, and scale — not shadows. If a card must lift (a sticky reservation bar, an open menu), use one soft wide shadow at most (`0 12px 40px rgba(28,26,23,0.08)`) and no shadow stacking. Hover states shift background tone or underline; they never add elevation.

## Shapes

Architectural sharpness: 0px radius on buttons and images, 2px on cards and inputs (just enough to avoid pixel-harshness), `full` only for small pills like dietary badges. Rules and underlines are 1px hairlines in `outline`. No decorative dividers, no ornamental borders.

## Components

- **Buttons:** primary is solid ink with paper text in `label-caps` — a letterpress block; hover slides to the accent color. Ghost buttons are 1px-outlined, transparent, same typography. Never more than one primary button per viewport.
- **Cards** (`card`): white on paper, hairline outline, generous 32px padding. Used sparingly — reviews, private-dining offers; menu items are *not* cards.
- **Dietary badges** (`badge-diet`): tiny uppercase pills in muted ink on dim surface; informational, visually quiet.
- **Inputs** (`input-field`): white field, hairline border, 2px radius; focus state is a 1px accent border, no glow.
- **Navigation:** `label-caps` items over transparent-to-surface header; the reservation CTA is the only filled element in the header.
- **Review/trust strip:** oversized quotation, `body-lg` italic or regular, source in `label-caps` muted — no star-rating widgets in yellow; render ratings as text ("4.6 / 5 · Google").

## Imagery

Photography is the primary decoration; everything else defers to it.

- **Mood:** natural window light, muted earthy grade, shallow depth of field; linen, wood, stone, ceramics as supporting textures. Never saturated fast-food vibrance, never studio-white backgrounds.
- **Heroes:** full-bleed 16:9–21:9, dark-graded or gradient-scrimmed (ink at 25–45% opacity) so paper-colored display type sits on top with AA contrast.
- **Dish photography:** overhead or 45°, single plate centered on a textured neutral surface, square crop for menu use.
- **Generated placeholders** must follow this grade — include "natural window light, muted earthy tones, editorial food photography, shallow depth of field" in every prompt so the set reads as one shoot.

## Do's and Don'ts

- Do let whitespace do the separating; reach for a background band or border only when space alone fails.
- Do keep the accent color to the primary action and active states — one or two appearances per viewport.
- Do set menus as typography (name/price/description); don't card-ify or photograph every dish — photos on signature dishes only.
- Do keep AA contrast (4.5:1) for text over photography — raise the scrim, don't shrink the claim.
- Don't use pure black or pure gray-white; every neutral in this system is warm.
- Don't mix radii: buttons and images stay square; only pills are round.
- Don't add a third typeface beyond the sanctioned single accent gesture.
- Don't animate for delight; limit motion to opacity/position fades under 300ms.
