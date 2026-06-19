/**
 * Blog starter kit — premade portable components (Milestone 2, epic G1).
 *
 * A "kit" is a curated set of `{ tree, script, css }` components authored AS
 * portable bundles in the SAME `bizbeecms.component` v1 format the H1/H2
 * export/import path produces. Installing the kit runs every bundle through the
 * EXACT same gate (`parsePortableComponent` → `validateComponentArtifact`) and
 * the EXACT same write path (`upsertImportedComponent`) the manual import uses —
 * NO new write/validation path is introduced (see the kit install route).
 *
 * This proves the H track end-to-end: "build me a blog" becomes "install the
 * blog kit, then compose pages from BlogPostHeader / BlogPostBody / AuthorCard /
 * PostList" instead of authoring every component from scratch.
 *
 * AUTHORING CONSTRAINTS (each bundle must pass the import gate):
 *  - Every `className` token must be in `allowedClasses()` (utility-css.ts). No
 *    arbitrary Tailwind — one-off values go in inline `style` (which the gate
 *    does not class-check), not classes.
 *  - `name` must match /^[A-Za-z][A-Za-z0-9_-]{0,63}$/ (PascalCase identifiers).
 *  - `tree` must be plannable by `planTree` (tag/props/children data walk).
 *  - `script` is optional client JS, bounded; the browser runs it, never the
 *    server. These components are static (no script).
 *
 * PURE: no React/D1/CF imports — unit-tested by the dep-free `node --test`.
 * The matching regression test asserts every bundle in this kit passes
 * `parsePortableComponent` (scripts/blog-kit.test.mjs).
 */

import {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  enumerateAssetDeps,
  enumerateComponentDeps,
  type PortableComponent,
} from "./portable.ts";

/** A stable id for this kit (room for landing/docs/portfolio kits later). */
export const BLOG_KIT_ID = "blog";

/** Wrap an authored component into a v1 portable envelope. */
function bundle(component: PortableComponent["component"]): PortableComponent {
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    meta: { note: `bizbeecms blog starter kit — ${component.name}` },
    // Kit components are self-contained (no media refs) → empty deps, but
    // enumerate so a future kit that references an asset declares it correctly.
    assets: enumerateAssetDeps(component),
    // Nested-component deps this bundle renders (H3b), minus a self-reference.
    // PostList renders PostListItem, so it declares that dep — the install
    // satisfies it from within the same kit (the kit route excludes self-kit
    // names before warning).
    componentDeps: enumerateComponentDeps(component.tree).filter(
      (n) => n !== component.name,
    ),
    component,
  };
}

/**
 * The blog kit bundles. Returned as fresh objects each call (no shared mutable
 * state) so an install can't be corrupted by a previous one. Order is the
 * natural compose order (header → body → author → list item → list).
 *
 * Each component declares its props in `propsSchema` AND marks where that content
 * goes with `{{propName}}` slots in the tree text (block-prop → component-prop
 * binding, the G1 follow-on). A page block supplies values via `block.props`;
 * the renderer (`planPage` → `bindTree`) substitutes declared slots and escapes
 * the values. Unbound slots render as "" (so a block with no props shows a clean
 * shell rather than `{{title}}` literals). Only props in `propsSchema` bind.
 */
export function blogKit(): PortableComponent[] {
  return [
    // ── BlogPostHeader: title + meta line (date · author) ──
    bundle({
      name: "BlogPostHeader",
      tree: {
        tag: "header",
        props: { className: "flex flex-col gap-2 mb-6" },
        children: [
          {
            tag: "h1",
            props: { className: "text-4xl font-bold text-foreground leading-tight" },
            children: ["{{title}}"],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted" },
            children: ["{{date}} · By {{author}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        title: { type: "string", default: "Post title", required: true, translatable: true, label: "Title" },
        date: { type: "date", default: "2026-01-01", label: "Date" },
        author: { type: "string", default: "Author", translatable: true, label: "Author" },
      }),
    }),

    // ── BlogPostBody: a readable prose column ──
    bundle({
      name: "BlogPostBody",
      tree: {
        tag: "article",
        props: { className: "flex flex-col gap-4 max-w-prose text-foreground leading-relaxed" },
        children: [
          {
            tag: "p",
            props: { className: "text-base" },
            children: ["{{body}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        body: { type: "richtext", default: "", required: true, translatable: true, label: "Body" },
      }),
    }),

    // ── AuthorCard: avatar-less byline card (name + bio) ──
    bundle({
      name: "AuthorCard",
      tree: {
        tag: "aside",
        props: {
          className:
            "flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4 my-6",
        },
        children: [
          {
            tag: "span",
            props: { className: "text-xs uppercase text-foreground-muted" },
            children: ["Written by"],
          },
          {
            tag: "span",
            props: { className: "text-lg font-semibold text-foreground" },
            children: ["{{name}}"],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted" },
            children: ["{{bio}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        name: { type: "string", default: "Author Name", required: true, translatable: true, label: "Author name" },
        bio: { type: "string", default: "", translatable: true, label: "Bio" },
      }),
    }),

    // ── PostListItem: one row in a post index (title + excerpt + date) ──
    bundle({
      name: "PostListItem",
      tree: {
        tag: "a",
        props: {
          href: "{{href}}",
          className:
            "flex flex-col gap-1 rounded border border-border bg-surface-raised p-4",
        },
        children: [
          {
            tag: "span",
            props: { className: "text-xl font-semibold text-primary" },
            children: ["{{title}}"],
          },
          {
            tag: "span",
            props: { className: "text-xs text-foreground-muted" },
            children: ["{{date}}"],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted" },
            children: ["{{excerpt}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        title: { type: "string", default: "Post title", required: true, translatable: true, label: "Title" },
        href: { type: "string", default: "#", label: "Link URL" },
        date: { type: "date", default: "2026-01-01", label: "Date" },
        excerpt: { type: "string", default: "", translatable: true, label: "Excerpt" },
      }),
    }),

    // ── PostList: the index container (heading + stacked items) ──
    bundle({
      name: "PostList",
      tree: {
        tag: "section",
        props: { className: "flex flex-col gap-4 max-w-3xl mx-auto" },
        children: [
          {
            tag: "h2",
            props: { className: "text-2xl font-bold text-foreground" },
            children: ["{{heading}}"],
          },
          {
            tag: "div",
            props: { className: "flex flex-col gap-3" },
            // Two sample PostListItem-shaped rows so the bare list renders with
            // content. (Real posts are added as page blocks / by the AI.)
            children: [
              {
                tag: "a",
                props: {
                  href: "#",
                  className:
                    "flex flex-col gap-1 rounded border border-border bg-surface-raised p-4",
                },
                children: [
                  {
                    tag: "span",
                    props: { className: "text-xl font-semibold text-primary" },
                    children: ["First post"],
                  },
                  {
                    tag: "span",
                    props: { className: "text-xs text-foreground-muted" },
                    children: ["January 1, 2026"],
                  },
                ],
              },
              {
                tag: "a",
                props: {
                  href: "#",
                  className:
                    "flex flex-col gap-1 rounded border border-border bg-surface-raised p-4",
                },
                children: [
                  {
                    tag: "span",
                    props: { className: "text-xl font-semibold text-primary" },
                    children: ["Second post"],
                  },
                  {
                    tag: "span",
                    props: { className: "text-xs text-foreground-muted" },
                    children: ["December 15, 2025"],
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
        heading: { type: "string", default: "Latest posts", required: true, translatable: true, label: "Heading" },
      }),
    }),
  ];
}

/** Just the component names in this kit (for a manifest / UI summary). */
export function blogKitNames(): string[] {
  return blogKit().map((b) => b.component.name);
}
