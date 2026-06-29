/**
 * Pricing / e-commerce starter kit (Milestone 2, epic G5).
 *
 * Fifth premade kit — same machinery as the blog (G1), landing (G2), docs (G3)
 * and portfolio (G4) kits: each component is a `bizbeecms.component` v1 portable
 * bundle, installed through the EXACT same import gate (`parsePortableComponent`)
 * + write path (`upsertImportedComponent`) via
 * `POST /api/components/kit { id: "pricing" }`. NO new write/validation path.
 *
 * Five components compose a typical SaaS pricing / simple-store page:
 *   PricingHeader  — section eyebrow + headline + subtitle
 *   PricingTier    — one plan card: name, price, period, blurb, CTA (repeat 2–4×)
 *   FeatureRow     — a single "✓ feature" line for inside a tier
 *   ProductCard    — a simple shop card: image, name, price, buy button
 *   PricingFaqItem — one Q/A row for a pricing FAQ
 *
 * AUTHORING CONSTRAINTS (identical to the other kits, enforced by the gate):
 *  - className tokens may be ANY Tailwind class (compiled per page at render);
 *    note `rounded-md`/`grid-cols-5`/`text-6xl`/`line-through` do NOT exist —
 *    use `rounded`/grids up to 4 / `text-5xl` / inline `style` for strike-through.
 *  - one-off values go in inline `style` (the gate does not class-check style).
 *  - declare every page-bound prop in `propsSchema` AND mark it with a
 *    `{{prop}}` slot in the tree (block-prop → component-prop binding).
 *  - prose props are `translatable:true`; prices/URLs/identifiers are `false`.
 *
 * PURE: no React/D1/CF imports — covered by the dep-free `scripts/pricing-kit.test.mjs`.
 */

import {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  enumerateAssetDeps,
  enumerateComponentDeps,
  type PortableComponent,
} from "./portable.ts";

/** Stable id for this kit (sits alongside the other kit ids). */
export const PRICING_KIT_ID = "pricing";

/** Wrap an authored component into a v1 portable envelope (mirrors the other kits). */
function bundle(component: PortableComponent["component"]): PortableComponent {
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    meta: { note: `bizbeecms pricing starter kit — ${component.name}` },
    assets: enumerateAssetDeps(component),
    componentDeps: enumerateComponentDeps(component.tree).filter(
      (n) => n !== component.name,
    ),
    tags: [], // premade kits carry no operator tags; install sets sourceKit instead
    component,
  };
}

/** The pricing kit bundles, fresh each call (no shared mutable state). */
export function pricingKit(): PortableComponent[] {
  return [
    // ── PricingHeader: eyebrow + headline + subtitle ──
    bundle({
      name: "PricingHeader",
      tree: {
        tag: "header",
        props: {
          className: "flex flex-col gap-3 max-w-2xl mx-auto text-center py-12",
        },
        children: [
          {
            tag: "p",
            props: { className: "text-sm font-semibold uppercase text-primary" },
            children: ["{{eyebrow}}"],
          },
          {
            tag: "h2",
            props: { className: "text-4xl font-bold text-foreground leading-tight" },
            children: ["{{headline}}"],
          },
          {
            tag: "p",
            props: { className: "text-lg text-foreground-muted leading-relaxed" },
            children: ["{{subtitle}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        eyebrow: {
          type: "string",
          translatable: true,
          label: "Eyebrow",
          default: "Pricing",
        },
        headline: {
          type: "string",
          required: true,
          translatable: true,
          label: "Headline",
          default: "Simple, transparent pricing",
        },
        subtitle: {
          type: "string",
          translatable: true,
          label: "Subtitle",
          default: "Pick the plan that fits. Change or cancel any time.",
        },
      }),
    }),

    // ── PricingTier: one plan card ──
    bundle({
      name: "PricingTier",
      tree: {
        tag: "article",
        props: {
          className:
            "flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-8 shadow-sm",
        },
        children: [
          {
            tag: "div",
            props: { className: "flex flex-col gap-1" },
            children: [
              {
                tag: "h3",
                props: { className: "text-xl font-semibold text-foreground" },
                children: ["{{name}}"],
              },
              {
                tag: "p",
                props: { className: "text-sm text-foreground-muted" },
                children: ["{{blurb}}"],
              },
            ],
          },
          {
            tag: "div",
            props: { className: "flex flex-row items-end gap-1" },
            children: [
              {
                tag: "span",
                props: { className: "text-5xl font-bold text-foreground leading-none" },
                children: ["{{price}}"],
              },
              {
                tag: "span",
                props: { className: "text-sm text-foreground-muted" },
                children: ["{{period}}"],
              },
            ],
          },
          {
            tag: "a",
            props: {
              href: "{{ctaHref}}",
              className:
                "rounded-lg bg-primary px-5 py-3 text-center text-base font-semibold text-primary-foreground",
            },
            children: ["{{ctaLabel}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        name: { type: "string", required: true, translatable: true, label: "Plan name", default: "Pro" },
        blurb: { type: "string", translatable: true, label: "Blurb", default: "For growing teams that need more." },
        // price is a formatted money string, not prose → NOT translatable.
        price: { type: "string", required: true, label: "Price", default: "$29" },
        period: { type: "string", translatable: true, label: "Period", default: "/ month" },
        ctaLabel: { type: "string", required: true, translatable: true, label: "Button label", default: "Start free trial" },
        // ctaHref is a URL → NOT translatable.
        ctaHref: { type: "string", required: true, label: "Button link", default: "/signup" },
      }),
    }),

    // ── FeatureRow: one "✓ feature" line ──
    bundle({
      name: "FeatureRow",
      tree: {
        tag: "div",
        props: { className: "flex flex-row items-center gap-2 py-1" },
        children: [
          {
            tag: "span",
            props: {
              className:
                "inline-flex items-center justify-center rounded-full bg-success-subtle text-success text-sm font-bold w-auto h-auto px-2",
            },
            children: ["✓"],
          },
          {
            tag: "span",
            props: { className: "text-base text-foreground" },
            children: ["{{label}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        label: {
          type: "string",
          required: true,
          translatable: true,
          label: "Feature",
          default: "Unlimited projects",
        },
      }),
    }),

    // ── ProductCard: a simple shop card ──
    bundle({
      name: "ProductCard",
      tree: {
        tag: "article",
        props: {
          className:
            "flex flex-col gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-sm",
        },
        children: [
          {
            tag: "img",
            props: {
              src: "{{imageUrl}}",
              alt: "{{name}}",
              className: "w-full rounded bg-surface-muted",
              style: { aspectRatio: "4 / 3", objectFit: "cover" },
            },
            children: [],
          },
          {
            tag: "div",
            props: { className: "flex flex-row items-center justify-between gap-2" },
            children: [
              {
                tag: "h3",
                props: { className: "text-base font-semibold text-foreground" },
                children: ["{{name}}"],
              },
              {
                tag: "span",
                props: { className: "text-base font-bold text-primary" },
                children: ["{{price}}"],
              },
            ],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted leading-relaxed" },
            children: ["{{blurb}}"],
          },
          {
            tag: "a",
            props: {
              href: "{{buyHref}}",
              className:
                "rounded-lg border border-primary px-4 py-2 text-center text-sm font-semibold text-primary",
            },
            children: ["{{buyLabel}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        // imageUrl points at a /media/<key> asset or external URL → NOT translatable.
        imageUrl: { type: "string", label: "Image URL", default: "/media/placeholder.png" },
        name: { type: "string", required: true, translatable: true, label: "Product name", default: "Field Notebook" },
        // price is a money string → NOT translatable.
        price: { type: "string", required: true, label: "Price", default: "$18" },
        blurb: { type: "string", translatable: true, label: "Blurb", default: "Hand-bound, 120 dotted pages." },
        buyLabel: { type: "string", required: true, translatable: true, label: "Button label", default: "Add to cart" },
        // buyHref is a URL → NOT translatable.
        buyHref: { type: "string", required: true, label: "Button link", default: "/cart/add" },
      }),
    }),

    // ── PricingFaqItem: one Q/A row ──
    bundle({
      name: "PricingFaqItem",
      tree: {
        tag: "div",
        props: {
          className: "flex flex-col gap-1 border-b border-border py-4 max-w-2xl mx-auto",
        },
        children: [
          {
            tag: "h4",
            props: { className: "text-base font-semibold text-foreground" },
            children: ["{{question}}"],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted leading-relaxed" },
            children: ["{{answer}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        question: {
          type: "string",
          required: true,
          translatable: true,
          label: "Question",
          default: "Can I change plans later?",
        },
        answer: {
          type: "string",
          required: true,
          translatable: true,
          label: "Answer",
          default: "Yes — upgrade or downgrade any time and we'll prorate the difference.",
        },
      }),
    }),
  ];
}

/** Just the component names in this kit (for a manifest / UI summary). */
export function pricingKitNames(): string[] {
  return pricingKit().map((b) => b.component.name);
}
