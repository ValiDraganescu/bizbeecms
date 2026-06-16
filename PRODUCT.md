# Product

## Register

product

## Users

**Primary: agency operators.** B2B agency staff working at a desk, daily, on
desktop — SuperAdmins and Admins who manage many client Sites at once. They are
power users: they value density, speed, and keyboard-driven flows over
hand-holding. Their context is operational, not exploratory; they come in to get
a specific thing done (invite an admin, spin up a Site, deploy a CMS instance,
scope someone to a country) and move on.

**Secondary: SiteManagers.** Invited users assigned to one or a few Sites,
logging in occasionally. The same system must stay legible to them without a
separate "simple mode" — clarity for the occasional user and density for the
power user are the same design, well-ordered.

The product spans two product surfaces that share one design system:

- **ProjectManager (PM):** the admin tool — user/role management, invites,
  country scoping, Site creation, and Cloudflare-native deployment.
- **CMS admin:** the per-Site whitelabel CMS's own management UI (one CMS
  instance is deployed per Site). Treated as product, not brand — the
  whitelabeled public output is a separate concern.

## Product Purpose

bizbeecms is a Cloudflare-native, multi-site B2B whitelabel CMS. The PM lets an
agency provision and operate many client Sites — each Site is a deployment of
the CMS to Cloudflare Workers — from one console, with a role model
(SuperAdmin → Admin → SiteManager), invites, and country scoping. Success is an
operator trusting the tool enough to run real client infrastructure through it:
fast to act in, impossible to misread, never surprising. The product earns trust
by behaving like infrastructure, not like a brochure.

## Brand Personality

**Calm, precise, trustworthy.** Three words: *infrastructural, exact, quiet.*

The voice is that of a serious operations tool — Cloudflare dashboard, Linear,
Vercel. Confidence shown through restraint: clear state, honest feedback, no
decoration that doesn't earn its place. The emotional goal is *steadiness* — an
operator running client production should feel in control and unhurried. Nothing
shouts; the interface recedes so the work is legible. Density is a feature, not a
liability, but density is achieved through hierarchy and rhythm, never clutter.

## Anti-references

This must NOT look like any of these:

- **Generic Bootstrap / AdminLTE admin.** Blue navbar, boxy cards everywhere,
  gray-on-gray, drop-shadow defaults, no point of view. The template look.
- **Consumer-playful SaaS.** Rounded blobs, spot illustrations, decorative
  gradients, big friendly emoji. Too casual for B2B infrastructure.
- **Heavy corporate enterprise.** IBM/SAP-style dense gray, shadow-heavy
  chrome, cluttered toolbars, dated affordances.
- **AI-slop landing aesthetic.** Gradient-text headings, cream/sand/parchment
  backgrounds, tracked-uppercase eyebrows above every section, numbered section
  markers as scaffolding, identical icon-heading-text card grids.

## Design Principles

1. **Behave like infrastructure.** Predictable, honest, low-drama. State is
   always visible and truthful; actions confirm what they did. Trust is built by
   never surprising the operator.
2. **Density through hierarchy, not clutter.** Power users want a lot on one
   screen. Earn that with rhythm, alignment, and typographic hierarchy — not by
   cramming or by hiding everything behind menus.
3. **One system, two clarities.** The same design serves the daily power user
   and the occasional SiteManager. Don't bifurcate into "advanced" vs "simple";
   order the information so both read it correctly.
4. **Restraint is the brand.** Distinction comes from exactness — spacing,
   contrast, considered states — not from color volume or ornament. If an
   element doesn't carry information, it doesn't ship.
5. **Make state and permission legible.** Roles, country scoping, Site status,
   and deploy state are the core nouns. The UI's first job is to make *who can
   do what, where, and what's happening right now* impossible to misread.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥4.5:1 contrast, large text ≥3:1; visible,
non-color-only focus indicators; full keyboard operability for an
operator-driven tool; status never conveyed by color alone (pair with
text/icon — important for deploy/role/scope state). Honor
`prefers-reduced-motion` with crossfade/instant alternatives on every
animation.

**Theme:** light default (daytime desk work), with a dark mode available.
