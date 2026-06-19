/**
 * Landing / marketing starter kit (Milestone 2, epic G2).
 *
 * Second premade kit — same machinery as the blog kit (G1): each component is a
 * `bizbeecms.component` v1 portable bundle, installed through the EXACT same
 * import gate (`parsePortableComponent`) + write path (`upsertImportedComponent`)
 * via `POST /api/components/kit { id: "landing" }`. NO new write/validation path.
 *
 * Five components compose a typical one-page marketing site:
 *   Hero        — headline + subhead + CTA button
 *   FeatureGrid — a 3-up grid of feature cards (title + body)
 *   CTABand     — a full-width call-to-action strip
 *   Testimonial — a single quote card (quote + author + role)
 *   SiteFooter  — tagline + copyright line
 *
 * AUTHORING CONSTRAINTS (identical to blog-kit, enforced by the gate):
 *  - every `className` token must be in `allowedClasses()` (utility-css.ts);
 *    note `rounded-md`/`text-6xl` do NOT exist — use `rounded-lg`/`text-5xl`.
 *  - one-off values go in inline `style` (the gate does not class-check style).
 *  - declare every page-bound prop in `propsSchema` AND mark it with a
 *    `{{prop}}` slot in the tree (block-prop → component-prop binding).
 *
 * PURE: no React/D1/CF imports — covered by the dep-free `scripts/landing-kit.test.mjs`.
 */

import {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  enumerateAssetDeps,
  enumerateComponentDeps,
  type PortableComponent,
} from "./portable.ts";

/** Stable id for this kit (sits alongside "blog"). */
export const LANDING_KIT_ID = "landing";

/** Wrap an authored component into a v1 portable envelope (mirrors blog-kit). */
function bundle(component: PortableComponent["component"]): PortableComponent {
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    meta: { note: `bizbeecms landing starter kit — ${component.name}` },
    assets: enumerateAssetDeps(component),
    componentDeps: enumerateComponentDeps(component.tree).filter(
      (n) => n !== component.name,
    ),
    component,
  };
}

/** The landing kit bundles, fresh each call (no shared mutable state). */
export function landingKit(): PortableComponent[] {
  return [
    // ── Hero: headline + subhead + primary CTA button ──
    bundle({
      name: "Hero",
      tree: {
        tag: "section",
        props: {
          className:
            "flex flex-col items-center gap-6 max-w-3xl mx-auto text-center py-20 px-4",
        },
        children: [
          {
            tag: "h1",
            props: { className: "text-5xl font-bold text-foreground leading-tight" },
            children: ["{{headline}}"],
          },
          {
            tag: "p",
            props: { className: "text-lg text-foreground-muted max-w-prose" },
            children: ["{{subhead}}"],
          },
          {
            tag: "a",
            props: {
              href: "{{ctaHref}}",
              className:
                "rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground",
            },
            children: ["{{ctaLabel}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        headline: { type: "string", default: "Your product, beautifully launched", required: true, translatable: true, label: "Headline" },
        subhead: { type: "string", default: "A clear, compelling sentence about what you do.", translatable: true, label: "Subhead" },
        ctaLabel: { type: "string", default: "Get started", translatable: true, label: "CTA label" },
        ctaHref: { type: "string", default: "#", label: "CTA link" },
      }),
    }),

    // ── FeatureGrid: heading + 3-up grid of feature cards ──
    bundle({
      name: "FeatureGrid",
      tree: {
        tag: "section",
        props: { className: "flex flex-col gap-8 max-w-5xl mx-auto py-16 px-4" },
        children: [
          {
            tag: "h2",
            props: { className: "text-3xl font-bold text-foreground text-center" },
            children: ["{{heading}}"],
          },
          {
            tag: "div",
            props: { className: "grid grid-cols-3 gap-6" },
            children: [
              {
                tag: "div",
                props: {
                  className:
                    "flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-6",
                },
                children: [
                  {
                    tag: "h3",
                    props: { className: "text-lg font-semibold text-foreground" },
                    children: ["{{feature1Title}}"],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{feature1Body}}"],
                  },
                ],
              },
              {
                tag: "div",
                props: {
                  className:
                    "flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-6",
                },
                children: [
                  {
                    tag: "h3",
                    props: { className: "text-lg font-semibold text-foreground" },
                    children: ["{{feature2Title}}"],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{feature2Body}}"],
                  },
                ],
              },
              {
                tag: "div",
                props: {
                  className:
                    "flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-6",
                },
                children: [
                  {
                    tag: "h3",
                    props: { className: "text-lg font-semibold text-foreground" },
                    children: ["{{feature3Title}}"],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{feature3Body}}"],
                  },
                ],
              },
            ],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        heading: { type: "string", default: "Why teams choose us", required: true, translatable: true, label: "Heading" },
        feature1Title: { type: "string", default: "Fast", required: true, translatable: true, label: "Feature 1 title" },
        feature1Body: { type: "string", default: "Describe the first benefit.", translatable: true, label: "Feature 1 body" },
        feature2Title: { type: "string", default: "Reliable", required: true, translatable: true, label: "Feature 2 title" },
        feature2Body: { type: "string", default: "Describe the second benefit.", translatable: true, label: "Feature 2 body" },
        feature3Title: { type: "string", default: "Simple", required: true, translatable: true, label: "Feature 3 title" },
        feature3Body: { type: "string", default: "Describe the third benefit.", translatable: true, label: "Feature 3 body" },
      }),
    }),

    // ── CTABand: full-width primary-toned call-to-action strip ──
    bundle({
      name: "CTABand",
      tree: {
        tag: "section",
        props: {
          className:
            "flex flex-col items-center gap-4 bg-primary-subtle text-center py-16 px-4",
        },
        children: [
          {
            tag: "h2",
            props: { className: "text-3xl font-bold text-foreground" },
            children: ["{{title}}"],
          },
          {
            tag: "p",
            props: { className: "text-base text-foreground-muted max-w-prose" },
            children: ["{{subtitle}}"],
          },
          {
            tag: "a",
            props: {
              href: "{{ctaHref}}",
              className:
                "rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground",
            },
            children: ["{{ctaLabel}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        title: { type: "string", default: "Ready to get started?", required: true, translatable: true, label: "Title" },
        subtitle: { type: "string", default: "Join today and ship faster.", translatable: true, label: "Subtitle" },
        ctaLabel: { type: "string", default: "Sign up", translatable: true, label: "CTA label" },
        ctaHref: { type: "string", default: "#", label: "CTA link" },
      }),
    }),

    // ── Testimonial: a single quote card (quote + author + role) ──
    bundle({
      name: "Testimonial",
      tree: {
        tag: "figure",
        props: {
          className:
            "flex flex-col gap-4 max-w-2xl mx-auto rounded-lg border border-border bg-surface-raised p-8 my-12",
        },
        children: [
          {
            tag: "blockquote",
            props: { className: "text-xl italic text-foreground leading-relaxed" },
            children: ["{{quote}}"],
          },
          {
            tag: "figcaption",
            props: { className: "flex flex-col gap-0" },
            children: [
              {
                tag: "span",
                props: { className: "font-semibold text-foreground" },
                children: ["{{author}}"],
              },
              {
                tag: "span",
                props: { className: "text-sm text-foreground-muted" },
                children: ["{{role}}"],
              },
            ],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        quote: { type: "string", default: "This product changed how we work.", required: true, translatable: true, label: "Quote" },
        author: { type: "string", default: "Jane Doe", required: true, translatable: true, label: "Author" },
        role: { type: "string", default: "CEO, Example Inc.", translatable: true, label: "Role" },
      }),
    }),

    // ── SiteFooter: tagline + copyright line ──
    bundle({
      name: "SiteFooter",
      tree: {
        tag: "footer",
        props: {
          className:
            "flex flex-col items-center gap-2 border-t border-border text-center py-8 px-4",
        },
        children: [
          {
            tag: "p",
            props: { className: "text-base font-medium text-foreground" },
            children: ["{{tagline}}"],
          },
          {
            tag: "p",
            props: { className: "text-xs text-foreground-muted" },
            children: ["{{copyright}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        tagline: { type: "string", default: "Built with bizbeecms", required: true, translatable: true, label: "Tagline" },
        copyright: { type: "string", default: "© 2026 Your Company. All rights reserved.", translatable: true, label: "Copyright" },
      }),
    }),
  ];
}

/** Just the component names in this kit (for a manifest / UI summary). */
export function landingKitNames(): string[] {
  return landingKit().map((b) => b.component.name);
}
