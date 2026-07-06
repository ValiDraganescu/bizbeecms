# Product

## Register

product

## Users

Site operators — designers and marketing people, not engineers — running one
whitelabel Site's content day-to-day (pages, components, media, collections,
translations). A per-Site CMS instance deployed to Cloudflare by the
ProjectManager; operators reach it through the admin sidebar and lean heavily
on the built-in AI assistant to author components and pages.

## Product Purpose

A Cloudflare-native, multi-site B2B whitelabel CMS. Each Site gets its own CMS
deployment: page builder (sections/rows/columns + components), AI-authored
component artifacts (html/script/css), media library on R2, content
collections, per-locale content (EN/FI/ET admin; arbitrary content locales),
draft/publish for both pages and components. Success = an operator ships a
polished multilingual site without touching code.

## Brand Personality

Calm, professional, unobtrusive. Quiet confidence with low visual noise — the
admin gets out of the operator's way (Linear / Vercel-dashboard energy, not
consumer-app warmth). The content being edited is the star; the chrome recedes.

## Anti-references

- WordPress admin: cluttered plugin-soup, inconsistent pages, notification noise.
- Generic SaaS template: Bootstrap/shadcn defaults, hero-metric cards,
  identical card grids, decorative gradients.

## Design Principles

1. **Chrome recedes, content leads** — the operator's site content is always
   the most visually prominent thing on screen.
2. **One way to do a thing** — shared primitives (NumberInput, UnitNumberInput,
   SpacingControls, MediaLibrary, ConfirmModal) over per-page reinventions.
3. **Purpose tokens only** — `bg-surface`, `text-foreground`, `border-border`,
   `bg-primary`…; never raw palette names or hex/oklch literals in markup, so
   light/dark and future per-site themes stay correct for free.
4. **Every state designed** — loading, empty, error, and draft/pending states
   are first-class, with self-explanatory copy (next-intl, EN/FI/ET).
5. **Consistent shells** — full-height rails and independently scrolling
   panes (page builder, settings, media) so surfaces feel like one product.

## Accessibility & Inclusion

WCAG AA: ≥4.5:1 body-text contrast, keyboard reachable with visible focus
(`focus-visible:ring`), `aria-` labels on icon-only buttons, `aria-live` for
async status, reduced-motion respected for any non-trivial animation.
