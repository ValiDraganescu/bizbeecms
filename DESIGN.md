<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->
---
name: bizbeecms
description: Cloudflare-native multi-site B2B whitelabel CMS — calm, precise, infrastructural admin tooling.
---

# Design System: bizbeecms

## 1. Overview

**Creative North Star: "The Control Room"**

bizbeecms looks and behaves like the console of a serious operations team — a
control room, not a brochure. The operator running real client production should
feel steady and in command: every state visible and truthful, every action
confirming what it did, nothing performing for attention. Distinction comes from
exactness — spacing, contrast, considered states — not from color volume or
ornament. This is the Linear / Cloudflare-dashboard / Vercel lineage: quiet
surface, dense where density earns its place, an accent so rare it means
something when it appears.

The system is built on a **Restrained** color strategy: tinted neutrals carry
the surface, and a single deep-blue/indigo accent appears on ≤10% of any screen
— reserved for the primary action and the one thing that matters most right now.
Motion is **Responsive**: it confirms (hover, focus, optimistic updates, toasts)
and never choreographs. Type is a single technical sans across weights, tuned
for legible density.

This system explicitly rejects the generic Bootstrap/AdminLTE admin look
(blue navbar, boxy cards, gray-on-gray), consumer-playful SaaS (blobs,
illustrations, decorative gradients), heavy corporate-enterprise chrome, and the
AI-slop landing aesthetic (gradient text, cream backgrounds, tracked-uppercase
eyebrows, identical card grids).

**Key Characteristics:**
- Quiet, infrastructural surface; the UI recedes so the work is legible.
- Density through hierarchy and rhythm, never clutter.
- One rare accent that always means "act here" or "look here".
- State, role, and permission are impossible to misread — never color-only.
- Motion confirms; it never performs.

## 2. Colors

A near-neutral system tinted toward the brand's cool hue, with one deep blue /
indigo accent. *[Exact values to be resolved during implementation. Use OKLCH;
compose the neutral ramp tinted ~0.005–0.015 chroma toward the accent hue, not
toward warm-by-default.]*

### Primary
- **Indigo Accent** `[to be resolved during implementation]`: The single accent.
  Primary buttons, active nav, focus rings, the one element on a screen that must
  be acted on. Used on ≤10% of any given screen.

### Neutral
- **Ink** `[to be resolved during implementation]`: Body and heading text. Must
  hit ≥4.5:1 on every surface it sits on. When in doubt, bias toward ink, never
  toward light-gray "elegance".
- **Muted Ink** `[to be resolved during implementation]`: Secondary text, helper
  copy, table metadata. Still ≥4.5:1 for body sizes.
- **Surface** `[to be resolved during implementation]`: Default light background
  for the app shell and content.
- **Surface Raised** `[to be resolved during implementation]`: Panels, table
  rows on hover, popovers — one tonal step off Surface.
- **Border / Divider** `[to be resolved during implementation]`: Hairline
  structure. 1px only.

### Status (deploy / role / scope state) — to define during implementation
- **Success / Live**, **Pending / Deploying**, **Warning**, **Error / Failed**:
  a small, deliberate status set for Site and deploy state. Each must pair color
  with text and/or icon — never color alone.

### Named Rules
**The One Voice Rule.** The indigo accent appears on ≤10% of any screen. Its
rarity is what makes it mean "act here". If two things on a screen are accented,
neither is.

**The No Color-Only State Rule.** Deploy status, role, and country scope are
never communicated by color alone. Always pair with a label or icon — a
red-green-blind operator must read state correctly.

## 3. Typography

**Display / UI Font:** Single technical sans (Inter / Geist lineage)
*[exact family to be chosen at implementation]*, used across all weights.
**Label/Mono Font:** A monospace *[optional, to be chosen]* — recommended for
IDs, slugs, country codes, and deploy log output, to make machine data legible.

**Character:** Neutral, dense, legible. One family doing all the work through
weight and size, not through pairing. No serif, no decorative display face.

### Hierarchy
*[Sizes/weights to be set at implementation; keep body line length 65–75ch in
prose contexts. Roles:]*
- **Display**: rare — empty states, first-run/onboarding headlines only.
- **Headline**: page titles (Users, Sites, a Site detail).
- **Title**: section and panel headers, table group headers.
- **Body**: default reading text; descriptions, helper copy.
- **Label**: form labels, table column headers, buttons, status chips.

### Named Rules
**The One Family Rule.** Hierarchy comes from weight and size within a single
sans, not from pairing two similar fonts. Mono is the only second face, and only
for machine data.

## 4. Elevation

**Flat by default.** Surfaces are flat at rest; depth is conveyed by tonal
layering (Surface → Surface Raised) and 1px borders, not by ambient shadows.
Shadow appears only as a response to state — popovers, dialogs, dropdowns that
must float above content — and stays soft and shallow. This matches the
Responsive motion energy: the interface is calm until you interact with it.

### Named Rules
**The Flat-By-Default Rule.** If a surface has a drop shadow at rest, it's wrong.
Shadow is reserved for genuinely floating layers (dialog, popover, dropdown,
toast).

## 5. Components

*Omitted — no components exist yet. Re-run `/impeccable document` once the app
shell, tables, forms, and dialogs are built, to capture the real component
vocabulary and generate the `.impeccable/design.json` sidecar.*

## 6. Do's and Don'ts

### Do:
- **Do** keep the indigo accent to ≤10% of any screen (The One Voice Rule).
- **Do** bias text toward Ink for contrast; verify ≥4.5:1 body, ≥3:1 large.
- **Do** convey density through hierarchy, alignment, and rhythm.
- **Do** pair every status color with a label or icon (The No Color-Only Rule).
- **Do** keep surfaces flat at rest; reserve shadow for floating layers.
- **Do** make motion confirm an action (hover, focus, optimistic update, toast)
  and provide a `prefers-reduced-motion` alternative for each.

### Don't:
- **Don't** build the generic Bootstrap/AdminLTE admin look — blue navbar, boxy
  cards everywhere, gray-on-gray, drop-shadow defaults.
- **Don't** go consumer-playful — no rounded blobs, spot illustrations,
  decorative gradients, or big friendly emoji.
- **Don't** ship heavy corporate-enterprise chrome — dense gray, shadow-heavy
  toolbars, dated affordances.
- **Don't** use the AI-slop landing aesthetic — gradient-text headings,
  cream/sand/parchment backgrounds, tracked-uppercase eyebrows above every
  section, numbered section markers as scaffolding, identical card grids.
- **Don't** use a `border-left`/`border-right` > 1px as a colored accent stripe.
- **Don't** communicate deploy/role/scope state with color alone.
