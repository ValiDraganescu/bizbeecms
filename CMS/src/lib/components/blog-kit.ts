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
    component,
  };
}

/**
 * The blog kit bundles. Returned as fresh objects each call (no shared mutable
 * state) so an install can't be corrupted by a previous one. Order is the
 * natural compose order (header → body → author → list item → list).
 *
 * Props are plain placeholders here (the AI/user binds real content/page-block
 * props later). Block-prop → component-prop binding is a separate epic; these
 * render with their authored defaults until then.
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
            children: ["Post title"],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted" },
            children: ["January 1, 2026 · By Author"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        title: { type: "string", default: "Post title" },
        date: { type: "string", default: "January 1, 2026" },
        author: { type: "string", default: "Author" },
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
            children: [
              "Write your post here. This component is a comfortable reading column; " +
                "compose paragraphs, headings and images inside it.",
            ],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        body: { type: "richtext", default: "" },
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
            children: ["Author Name"],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted" },
            children: ["A short author bio goes here."],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        name: { type: "string", default: "Author Name" },
        bio: { type: "string", default: "" },
      }),
    }),

    // ── PostListItem: one row in a post index (title + excerpt + date) ──
    bundle({
      name: "PostListItem",
      tree: {
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
            children: ["Post title"],
          },
          {
            tag: "span",
            props: { className: "text-xs text-foreground-muted" },
            children: ["January 1, 2026"],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted" },
            children: ["A one-line excerpt of the post goes here."],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        title: { type: "string", default: "Post title" },
        href: { type: "string", default: "#" },
        date: { type: "string", default: "January 1, 2026" },
        excerpt: { type: "string", default: "" },
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
            children: ["Latest posts"],
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
        heading: { type: "string", default: "Latest posts" },
      }),
    }),
  ];
}

/** Just the component names in this kit (for a manifest / UI summary). */
export function blogKitNames(): string[] {
  return blogKit().map((b) => b.component.name);
}
