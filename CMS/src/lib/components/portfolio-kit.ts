/**
 * Portfolio starter kit (Milestone 2, epic G4).
 *
 * Fourth premade kit — same machinery as the blog (G1), landing (G2) and docs
 * (G3) kits: each component is a `bizbeecms.component` v1 portable bundle,
 * installed through the EXACT same import gate (`parsePortableComponent`) + write
 * path (`upsertImportedComponent`) via `POST /api/components/kit { id: "portfolio" }`.
 * NO new write/validation path.
 *
 * Five components compose a typical personal/agency portfolio page:
 *   PortfolioHero  — name + role headline + intro paragraph
 *   ProjectCard    — a single project: title, role, blurb (a card to repeat)
 *   SkillList      — a heading + three skill chips
 *   WorkTimeline   — a heading + three dated experience rows
 *   ContactCallout — a closing "get in touch" band
 *
 * AUTHORING CONSTRAINTS (identical to the other kits, enforced by the gate):
 *  - every `className` token must be in `allowedClasses()` (utility-css.ts);
 *    note `rounded-md`/`grid-cols-5` do NOT exist — use `rounded`/grid up to 4.
 *  - one-off values go in inline `style` (the gate does not class-check style).
 *  - declare every page-bound prop in `propsSchema` AND mark it with a
 *    `{{prop}}` slot in the tree (block-prop → component-prop binding).
 *
 * PURE: no React/D1/CF imports — covered by the dep-free `scripts/portfolio-kit.test.mjs`.
 */

import {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  enumerateAssetDeps,
  enumerateComponentDeps,
  type PortableComponent,
} from "./portable.ts";

/** Stable id for this kit (sits alongside "blog", "landing" and "docs"). */
export const PORTFOLIO_KIT_ID = "portfolio";

/** Wrap an authored component into a v1 portable envelope (mirrors the other kits). */
function bundle(component: PortableComponent["component"]): PortableComponent {
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    meta: { note: `bizbeecms portfolio starter kit — ${component.name}` },
    assets: enumerateAssetDeps(component),
    componentDeps: enumerateComponentDeps(component.tree).filter(
      (n) => n !== component.name,
    ),
    tags: [], // premade kits carry no operator tags; install sets sourceKit instead
    component,
  };
}

/** The portfolio kit bundles, fresh each call (no shared mutable state). */
export function portfolioKit(): PortableComponent[] {
  return [
    // ── PortfolioHero: name + role + intro ──
    bundle({
      name: "PortfolioHero",
      tree: {
        tag: "header",
        props: {
          className:
            "flex flex-col gap-4 max-w-3xl mx-auto text-center py-16",
        },
        children: [
          {
            tag: "p",
            props: { className: "text-sm font-semibold uppercase text-primary" },
            children: ["{{role}}"],
          },
          {
            tag: "h1",
            props: { className: "text-5xl font-bold text-foreground leading-tight" },
            children: ["{{name}}"],
          },
          {
            tag: "p",
            props: { className: "text-lg text-foreground-muted leading-relaxed" },
            children: ["{{intro}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        name: {
          type: "string",
          required: true,
          translatable: true,
          label: "Name",
          default: "Alex Rivera",
        },
        role: {
          type: "string",
          required: true,
          translatable: true,
          label: "Role",
          default: "Product Designer",
        },
        intro: {
          type: "string",
          translatable: true,
          label: "Intro",
          default:
            "I design calm, useful interfaces for teams who care about the details.",
        },
      }),
    }),

    // ── ProjectCard: a single repeatable project card ──
    bundle({
      name: "ProjectCard",
      tree: {
        tag: "article",
        props: {
          className:
            "flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-6 shadow-sm",
        },
        children: [
          {
            tag: "div",
            props: { className: "flex flex-row items-center justify-between gap-3" },
            children: [
              {
                tag: "h3",
                props: { className: "text-xl font-semibold text-foreground" },
                children: ["{{title}}"],
              },
              {
                tag: "span",
                props: {
                  className:
                    "rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground-muted",
                },
                children: ["{{role}}"],
              },
            ],
          },
          {
            tag: "p",
            props: { className: "text-base text-foreground-muted leading-relaxed" },
            children: ["{{blurb}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        title: {
          type: "string",
          required: true,
          translatable: true,
          label: "Project title",
          default: "Northwind Dashboard",
        },
        role: {
          type: "string",
          translatable: true,
          label: "Your role",
          default: "Lead Designer",
        },
        blurb: {
          type: "string",
          required: true,
          translatable: true,
          label: "Blurb",
          default:
            "Redesigned the analytics suite, cutting time-to-insight in half.",
        },
      }),
    }),

    // ── SkillList: heading + three skill chips ──
    bundle({
      name: "SkillList",
      tree: {
        tag: "section",
        props: { className: "flex flex-col gap-4 max-w-3xl mx-auto my-10" },
        children: [
          {
            tag: "h2",
            props: { className: "text-2xl font-semibold text-foreground" },
            children: ["{{heading}}"],
          },
          {
            tag: "div",
            props: { className: "flex flex-row flex-wrap gap-2" },
            children: [
              {
                tag: "span",
                props: {
                  className:
                    "rounded-full border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-foreground",
                },
                children: ["{{skill1}}"],
              },
              {
                tag: "span",
                props: {
                  className:
                    "rounded-full border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-foreground",
                },
                children: ["{{skill2}}"],
              },
              {
                tag: "span",
                props: {
                  className:
                    "rounded-full border border-border bg-surface-muted px-4 py-2 text-sm font-medium text-foreground",
                },
                children: ["{{skill3}}"],
              },
            ],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        heading: { type: "string", required: true, translatable: true, label: "Heading", default: "What I do" },
        skill1: { type: "string", required: true, translatable: true, label: "Skill 1", default: "Product strategy" },
        skill2: { type: "string", translatable: true, label: "Skill 2", default: "Design systems" },
        skill3: { type: "string", translatable: true, label: "Skill 3", default: "User research" },
      }),
    }),

    // ── WorkTimeline: heading + three dated experience rows ──
    bundle({
      name: "WorkTimeline",
      tree: {
        tag: "section",
        props: { className: "flex flex-col gap-4 max-w-3xl mx-auto my-10" },
        children: [
          {
            tag: "h2",
            props: { className: "text-2xl font-semibold text-foreground" },
            children: ["{{heading}}"],
          },
          {
            tag: "ol",
            props: { className: "flex flex-col gap-4" },
            children: [
              {
                tag: "li",
                props: {
                  className:
                    "flex flex-col gap-1 border-b border-border pb-4",
                },
                children: [
                  {
                    tag: "div",
                    props: { className: "flex flex-row items-center justify-between gap-3" },
                    children: [
                      {
                        tag: "span",
                        props: { className: "text-base font-semibold text-foreground" },
                        children: ["{{role1}}"],
                      },
                      {
                        tag: "span",
                        props: { className: "text-sm text-foreground-muted" },
                        children: ["{{period1}}"],
                      },
                    ],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{place1}}"],
                  },
                ],
              },
              {
                tag: "li",
                props: {
                  className:
                    "flex flex-col gap-1 border-b border-border pb-4",
                },
                children: [
                  {
                    tag: "div",
                    props: { className: "flex flex-row items-center justify-between gap-3" },
                    children: [
                      {
                        tag: "span",
                        props: { className: "text-base font-semibold text-foreground" },
                        children: ["{{role2}}"],
                      },
                      {
                        tag: "span",
                        props: { className: "text-sm text-foreground-muted" },
                        children: ["{{period2}}"],
                      },
                    ],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{place2}}"],
                  },
                ],
              },
              {
                tag: "li",
                props: {
                  className: "flex flex-col gap-1",
                },
                children: [
                  {
                    tag: "div",
                    props: { className: "flex flex-row items-center justify-between gap-3" },
                    children: [
                      {
                        tag: "span",
                        props: { className: "text-base font-semibold text-foreground" },
                        children: ["{{role3}}"],
                      },
                      {
                        tag: "span",
                        props: { className: "text-sm text-foreground-muted" },
                        children: ["{{period3}}"],
                      },
                    ],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{place3}}"],
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
        heading: { type: "string", required: true, translatable: true, label: "Heading", default: "Experience" },
        role1: { type: "string", required: true, translatable: true, label: "Role 1", default: "Senior Designer" },
        place1: { type: "string", translatable: true, label: "Company 1", default: "Northwind" },
        // periods are date ranges, not prose → NOT translatable.
        period1: { type: "string", label: "Period 1", default: "2022 — Now" },
        role2: { type: "string", required: true, translatable: true, label: "Role 2", default: "Product Designer" },
        place2: { type: "string", translatable: true, label: "Company 2", default: "Lumen" },
        period2: { type: "string", label: "Period 2", default: "2019 — 2022" },
        role3: { type: "string", required: true, translatable: true, label: "Role 3", default: "UI Designer" },
        place3: { type: "string", translatable: true, label: "Company 3", default: "Cobalt" },
        period3: { type: "string", label: "Period 3", default: "2017 — 2019" },
      }),
    }),

    // ── ContactCallout: closing "get in touch" band ──
    bundle({
      name: "ContactCallout",
      tree: {
        tag: "section",
        props: {
          className:
            "flex flex-col items-center gap-3 rounded-xl bg-primary-subtle border border-primary px-6 py-12 my-12 text-center",
        },
        children: [
          {
            tag: "h2",
            props: { className: "text-3xl font-bold text-foreground" },
            children: ["{{heading}}"],
          },
          {
            tag: "p",
            props: { className: "text-base text-foreground-muted max-w-lg leading-relaxed" },
            children: ["{{body}}"],
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
        heading: { type: "string", required: true, translatable: true, label: "Heading", default: "Let's work together" },
        body: {
          type: "string",
          translatable: true,
          label: "Body",
          default: "Have a project in mind? I'm always happy to talk through new ideas.",
        },
        ctaLabel: { type: "string", required: true, translatable: true, label: "Button label", default: "Get in touch" },
        // ctaHref is a URL/mailto, not prose → NOT translatable.
        ctaHref: { type: "string", required: true, label: "Button link", default: "mailto:hello@example.com" },
      }),
    }),
  ];
}

/** Just the component names in this kit (for a manifest / UI summary). */
export function portfolioKitNames(): string[] {
  return portfolioKit().map((b) => b.component.name);
}
