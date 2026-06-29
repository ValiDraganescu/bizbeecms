/**
 * Documentation starter kit (Milestone 2, epic G3).
 *
 * Third premade kit — same machinery as the blog (G1) and landing (G2) kits:
 * each component is a `bizbeecms.component` v1 portable bundle, installed through
 * the EXACT same import gate (`parsePortableComponent`) + write path
 * (`upsertImportedComponent`) via `POST /api/components/kit { id: "docs" }`.
 * NO new write/validation path.
 *
 * Five components compose a typical documentation page:
 *   DocsHeader   — page title + lead paragraph
 *   Callout      — an info/warning highlight box (note, tip, caution)
 *   CodeBlock    — a labelled monospace snippet block
 *   StepList     — an ordered "how to" list of three steps
 *   ApiParam     — a single API parameter reference row (name + type + desc)
 *
 * AUTHORING CONSTRAINTS (identical to the other kits, enforced by the gate):
 *  - className tokens may be ANY Tailwind class (compiled per page at render);
 *    note `rounded-md`/`text-6xl` do NOT exist — use `rounded`/`text-5xl`.
 *  - one-off values go in inline `style` (the gate does not class-check style).
 *  - declare every page-bound prop in `propsSchema` AND mark it with a
 *    `{{prop}}` slot in the tree (block-prop → component-prop binding).
 *
 * PURE: no React/D1/CF imports — covered by the dep-free `scripts/docs-kit.test.mjs`.
 */

import {
  PORTABLE_FORMAT,
  PORTABLE_VERSION,
  enumerateAssetDeps,
  enumerateComponentDeps,
  type PortableComponent,
} from "./portable.ts";

/** Stable id for this kit (sits alongside "blog" and "landing"). */
export const DOCS_KIT_ID = "docs";

/** Wrap an authored component into a v1 portable envelope (mirrors the other kits). */
function bundle(component: PortableComponent["component"]): PortableComponent {
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    meta: { note: `bizbeecms docs starter kit — ${component.name}` },
    assets: enumerateAssetDeps(component),
    componentDeps: enumerateComponentDeps(component.tree).filter(
      (n) => n !== component.name,
    ),
    tags: [], // premade kits carry no operator tags; install sets sourceKit instead
    component,
  };
}

/** The docs kit bundles, fresh each call (no shared mutable state). */
export function docsKit(): PortableComponent[] {
  return [
    // ── DocsHeader: page title + lead paragraph ──
    bundle({
      name: "DocsHeader",
      tree: {
        tag: "header",
        props: {
          className: "flex flex-col gap-3 max-w-3xl border-b border-border pb-6 mb-8",
        },
        children: [
          {
            tag: "h1",
            props: { className: "text-4xl font-bold text-foreground leading-tight" },
            children: ["{{title}}"],
          },
          {
            tag: "p",
            props: { className: "text-lg text-foreground-muted leading-relaxed" },
            children: ["{{lead}}"],
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
          label: "Title",
          default: "Getting started",
        },
        lead: {
          type: "string",
          translatable: true,
          label: "Lead paragraph",
          default: "Everything you need to know to begin, in a few short minutes.",
        },
      }),
    }),

    // ── Callout: an info/note highlight box ──
    bundle({
      name: "Callout",
      tree: {
        tag: "aside",
        props: {
          className:
            "flex flex-col gap-1 max-w-3xl rounded-lg border border-info bg-info-subtle px-5 py-4 my-6",
        },
        children: [
          {
            tag: "span",
            props: {
              className: "text-xs font-semibold uppercase text-info",
            },
            children: ["{{label}}"],
          },
          {
            tag: "p",
            props: { className: "text-base text-foreground leading-relaxed" },
            children: ["{{body}}"],
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
          label: "Label",
          default: "Note",
        },
        body: {
          type: "string",
          required: true,
          translatable: true,
          label: "Body",
          default: "A short, helpful aside that highlights something worth knowing.",
        },
      }),
    }),

    // ── CodeBlock: a labelled monospace snippet ──
    bundle({
      name: "CodeBlock",
      tree: {
        tag: "div",
        props: {
          className:
            "flex flex-col gap-2 max-w-3xl rounded-lg border border-border bg-surface-muted my-6 overflow-hidden",
        },
        children: [
          {
            tag: "div",
            props: {
              className:
                "text-xs font-medium uppercase text-foreground-muted border-b border-border px-4 py-2",
            },
            children: ["{{filename}}"],
          },
          {
            tag: "pre",
            props: {
              className: "text-sm text-foreground overflow-auto p-4 leading-relaxed",
              style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
            },
            children: [
              {
                tag: "code",
                props: {},
                children: ["{{code}}"],
              },
            ],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        // filename/code are literal source, not prose → NOT translatable.
        filename: { type: "string", required: true, label: "Filename", default: "example.sh" },
        code: { type: "richtext", required: true, label: "Code", default: "npm install bizbeecms" },
      }),
    }),

    // ── StepList: an ordered three-step "how to" ──
    bundle({
      name: "StepList",
      tree: {
        tag: "section",
        props: { className: "flex flex-col gap-4 max-w-3xl my-8" },
        children: [
          {
            tag: "h2",
            props: { className: "text-2xl font-semibold text-foreground" },
            children: ["{{heading}}"],
          },
          {
            tag: "ol",
            props: { className: "flex flex-col gap-3" },
            children: [
              {
                tag: "li",
                props: {
                  className:
                    "flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4",
                },
                children: [
                  {
                    tag: "span",
                    props: { className: "text-sm font-semibold text-primary" },
                    children: ["{{step1Title}}"],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{step1Body}}"],
                  },
                ],
              },
              {
                tag: "li",
                props: {
                  className:
                    "flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4",
                },
                children: [
                  {
                    tag: "span",
                    props: { className: "text-sm font-semibold text-primary" },
                    children: ["{{step2Title}}"],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{step2Body}}"],
                  },
                ],
              },
              {
                tag: "li",
                props: {
                  className:
                    "flex flex-col gap-1 rounded-lg border border-border bg-surface-raised p-4",
                },
                children: [
                  {
                    tag: "span",
                    props: { className: "text-sm font-semibold text-primary" },
                    children: ["{{step3Title}}"],
                  },
                  {
                    tag: "p",
                    props: { className: "text-sm text-foreground-muted" },
                    children: ["{{step3Body}}"],
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
        heading: { type: "string", required: true, translatable: true, label: "Heading", default: "How it works" },
        step1Title: { type: "string", required: true, translatable: true, label: "Step 1 title", default: "1. Install" },
        step1Body: { type: "string", translatable: true, label: "Step 1 body", default: "Add the package to your project." },
        step2Title: { type: "string", required: true, translatable: true, label: "Step 2 title", default: "2. Configure" },
        step2Body: { type: "string", translatable: true, label: "Step 2 body", default: "Set up your options once." },
        step3Title: { type: "string", required: true, translatable: true, label: "Step 3 title", default: "3. Ship" },
        step3Body: { type: "string", translatable: true, label: "Step 3 body", default: "Deploy and you are done." },
      }),
    }),

    // ── ApiParam: a single API parameter reference row ──
    bundle({
      name: "ApiParam",
      tree: {
        tag: "div",
        props: {
          className:
            "flex flex-col gap-1 max-w-3xl border-b border-border py-4",
        },
        children: [
          {
            tag: "div",
            props: { className: "flex flex-row items-center gap-3" },
            children: [
              {
                tag: "code",
                props: {
                  className: "text-sm font-semibold text-foreground",
                  style: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
                },
                children: ["{{name}}"],
              },
              {
                tag: "span",
                props: {
                  className:
                    "rounded-full bg-surface-muted px-2 py-1 text-xs font-medium text-foreground-muted",
                },
                children: ["{{paramType}}"],
              },
            ],
          },
          {
            tag: "p",
            props: { className: "text-sm text-foreground-muted leading-relaxed" },
            children: ["{{description}}"],
          },
        ],
      },
      script: "",
      css: "",
      propsSchema: JSON.stringify({
        // name/paramType are code identifiers/type literals → NOT translatable.
        name: { type: "string", required: true, label: "Parameter name", default: "apiKey" },
        paramType: { type: "string", required: true, label: "Type", default: "string" },
        description: {
          type: "string",
          required: true,
          translatable: true,
          label: "Description",
          default: "What this parameter controls and when to use it.",
        },
      }),
    }),
  ];
}

/** Just the component names in this kit (for a manifest / UI summary). */
export function docsKitNames(): string[] {
  return docsKit().map((b) => b.component.name);
}
