/**
 * Write AI tools (Milestone 2, ai-assistant goal, Slice 3 part 2).
 *
 * Slice 3 part 1 gave the assistant DISCOVERY (read-tools.ts); this slice gives
 * it the matching UPDATE tools so it can edit existing site structure, not only
 * CREATE from scratch. Every write carries an UNTRUSTED model artifact, so each
 * is gated by the SAME validators the create_* tools use (no shortcuts — see
 * CAVEATS), and each is backed by an EXISTING store write:
 *
 *   - update_component   → validateComponentArtifact + component-store.upsertComponent
 *                          (same-name already updates; this is the explicit "edit"
 *                          alias the discovery flow points at).
 *   - update_page_blocks → coerceIdArg(id) + page-blocks.validateBlocks + the
 *                          route's component-existence check + page-store.setPageBlocks
 *                          (edits ONLY the block tree, never metadata — that's
 *                          create_page / page-meta's job).
 *   - update_brand_identity → settings-store.setSiteIdentity(unknown) (normalizes
 *                          + length-bounds internally = the trust gate).
 *   - update_theme       → settings-store.setThemeOverrides / setThemeOverridesDark
 *                          (normalize to known tokens + safe colors = the trust gate).
 *   - list_builtin_types → static: the renderer's reserved layout block names the
 *                          model may use in a block tree (Section) alongside real
 *                          components. No backend read needed.
 *
 * This module is PURE (only the tool SCHEMAS + arg coercion live here — no
 * React/D1/CF/@ imports) so it stays node-testable per CAVEATS. The ROUTE imports
 * the stores + validators and wires each schema to its write. tool-scopes.ts owns
 * which contexts expose each name; the route owns TOOL_BY_NAME — register a new
 * tool in all three or it's a dead tool.
 */

// Relative (not @/) import so this stays node-testable — only the reserved names.
import { SECTION_COMPONENT, LANGUAGE_SWITCHER_COMPONENT } from "../render/tree.ts";

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const UPDATE_COMPONENT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_component",
    description:
      "Update an EXISTING component by re-authoring its full artifact. Use " +
      "get_component first to read the current artifact, then pass the complete " +
      "new { name, html, script, css } (keep the same name to update in place — a " +
      "new name creates a new component). The whole artifact is replaced, not merged.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The component's exact existing name." },
        html: {
          type: "string",
          description:
            "The component's full Handlebars-HTML markup. Use `{{prop}}` / " +
            "`{{t prop}}` for slots and `class` with allowed Tailwind utilities.",
        },
        script: { type: "string", description: "Client JS for interactivity (or empty string)." },
        css: { type: "string", description: "Tailwind utility classes / custom CSS (or empty)." },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional short operator labels for grouping (e.g. ['BasicRestaurant']). " +
            "Replaces this component's tags. Omit to leave existing tags unchanged.",
        },
        label: {
          type: "string",
          description:
            "Optional human display label shown in the UI (can contain spaces; the " +
            "`name` cannot). Omit to leave unchanged; '' clears it.",
        },
      },
      required: ["name", "html"],
    },
  },
} as const;

export const UPDATE_PAGE_BLOCKS_TOOL = {
  type: "function" as const,
  function: {
    name: "update_page_blocks",
    description:
      "FULL-REPLACE the block tree of an EXISTING page (use ONLY to add/remove/" +
      "reorder/restructure sections or blocks). To merely change a block's text or " +
      "props (e.g. 'set the hero title'), use set_block_props instead — it edits ONE " +
      "block and CANNOT delete the rest of the page. This tool overwrites the WHOLE " +
      "tree: any section or block you omit is DELETED. So FIRST get_page to read the " +
      "current tree, then re-pass it ENTIRE with only your intended change applied. " +
      "Does not touch slug/parent/SEO. Each block references a component by name " +
      "(must already exist) or the reserved layout block 'Section'.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The page's id (from list_pages/get_page)." },
        blocks: {
          type: "array",
          description:
            "JSON array of blocks: { id, component, props?, children? }. FULL replacement — " +
            "anything omitted is deleted. Re-pass the entire current tree plus your change. " +
            "TOP LEVEL IS SECTIONS ONLY: every top-level block must be a Section; never place " +
            "a component directly at the top level — wrap it in a Section " +
            "(Section → __section_column__ → YourComponent). A bare top-level component is rejected.",
        },
      },
      required: ["id", "blocks"],
    },
  },
} as const;

export const SET_BLOCK_PROPS_TOOL = {
  type: "function" as const,
  function: {
    name: "set_block_props",
    description:
      "Patch the props of ONE block on a page WITHOUT rewriting the rest of the tree " +
      "(the SAFE way to change text/content — it cannot delete other sections or " +
      "blocks). Use this for requests like 'set the hero title' or 'change the button " +
      "label'. The given props are MERGED into the block's existing props (other props " +
      "are kept); an empty-string value clears that one prop. Find the page id and the " +
      "block id with get_page (every block has an `id`). For a select/combobox List's " +
      "config use bind_list, not this. Platform feature — dynamic/param-driven pages: " +
      "a STRING prop's value may be { \"param\": \"city-slug\" } (this page's wildcard " +
      "route segment) or { \"query\": \"q\" } (a URL query param, e.g. ?q=) instead of a " +
      "literal, to echo the current request into text (e.g. a search page's heading " +
      "\"Results for '{{query}}'\"). Resolved per-request; absent this request → \"\".",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The page's id (from list_pages/get_page)." },
        blockId: {
          type: "string",
          description: "The id of the block to patch (from get_page — every block has an `id`).",
        },
        props: {
          type: "object",
          description:
            "The props to set/merge, e.g. { title: 'Find the restaurant you like' }. " +
            "Merged into the block's existing props; an empty string clears a prop.",
        },
      },
      required: ["id", "blockId", "props"],
    },
  },
} as const;

export const UPDATE_BRAND_IDENTITY_TOOL = {
  type: "function" as const,
  function: {
    name: "update_brand_identity",
    description:
      "Update the site's brand identity / design / AI-persona settings (name, " +
      "tagline, voice, etc.). Read the current values with get_brand_identity " +
      "first, then pass the full identity object you want stored. Unknown fields " +
      "are dropped and text is length-bounded server-side.",
    parameters: {
      type: "object",
      properties: {
        identity: {
          type: "object",
          description:
            "The brand identity object (e.g. { name, tagline, voice, … }) — the " +
            "same shape get_brand_identity returns.",
        },
      },
      required: ["identity"],
    },
  },
} as const;

export const UPDATE_THEME_TOOL = {
  type: "function" as const,
  function: {
    name: "update_theme",
    description:
      "Update the site's theme color token overrides for light and/or dark mode. " +
      "Read current values with get_theme first. Pass 'light' and/or 'dark' as a " +
      "map of { tokenName: cssColor }. Only known design tokens and safe color " +
      "values are kept (others are dropped server-side). Omit a mode to leave it " +
      "unchanged.",
    parameters: {
      type: "object",
      properties: {
        light: {
          type: "object",
          description: "Light-mode token→color overrides, e.g. { primary: '#1d4ed8' }.",
        },
        dark: {
          type: "object",
          description: "Dark-mode token→color overrides (same shape).",
        },
      },
      required: [],
    },
  },
} as const;

export const LIST_BUILTIN_TYPES_TOOL = {
  type: "function" as const,
  function: {
    name: "list_builtin_types",
    description:
      "List the renderer's built-in layout block types you can use in a page's " +
      "block tree IN ADDITION to your authored components (e.g. 'Section', which " +
      "lays its column children out in a grid). Use these to structure a page " +
      "layout; use list_components for the content components that fill them.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * The renderer's reserved built-in block types the AI may reference in a block
 * tree (alongside real components). `__section_column__` is an internal child the
 * Section manages, so it's NOT exposed — the model only authors Sections.
 * PURE; static.
 */
export function builtinBlockTypes(): { name: string; description: string }[] {
  return [
    {
      name: SECTION_COMPONENT,
      description:
        "A layout container, and the ONLY block allowed at a page's top level — every " +
        "component must live inside a Section (a bare top-level component is rejected). " +
        "REQUIRED: set props.name to a short, descriptive label for the section (e.g. " +
        "\"Hero\", \"Featured restaurants\", \"Footer CTA\") — the operator sees these in " +
        "the Layers tree and @section mentions, and an unnamed section is rejected. " +
        "A Section holds one or more ROWS ('__section_row__'); each row holds 1+ COLUMNS " +
        "('__section_column__') and sets its OWN props.columns (1-4) + optional " +
        "columnBehavior. Different rows may have different column counts. Your actual " +
        "components go inside a COLUMN's `children` — never directly under a Section or a " +
        "row. Shape: { component:'Section', props:{name:'Hero'}, children:[ " +
        "{ component:'__section_row__', props:{columns:2}, children:[ " +
        "{ component:'__section_column__', children:[ { component:'Hero', props:{…} } ] }, " +
        "{ component:'__section_column__', children:[ { component:'Img', props:{…} } ] } ] } ] }. " +
        "(A single-row section may also be written the legacy way — columns directly under " +
        "the Section — and is auto-wrapped into one row; prefer the explicit row shape.)",
    },
    {
      name: LANGUAGE_SWITCHER_COMPONENT,
      description:
        "A built-in language switcher: renders a <select> of the Site's configured " +
        "content locales, the active one selected; choosing one switches the page's " +
        "language and persists across refreshes. It takes NO props and has no children. " +
        "Use it inside a column like any component (e.g. in a header/nav Section), OR " +
        "embed it INSIDE a component's tree by writing the tag `<LanguageSwitcher/>` " +
        "(composition-by-tag) — e.g. put it in a NavBar component. It renders nothing on " +
        "single-locale Sites. Shape as a block: { component:'LanguageSwitcher' }.",
    },
  ];
}

/**
 * Split an `update_theme` arg into its light/dark override maps. Returns whichever
 * of `light`/`dark` were supplied as objects (passed straight to the store, which
 * is the normalization/trust gate), plus whether at least one was given. PURE —
 * never throws; non-object values are ignored.
 */
export function splitThemeArgs(args: unknown): {
  light?: unknown;
  dark?: unknown;
  any: boolean;
} {
  if (typeof args !== "object" || args === null) return { any: false };
  const a = args as Record<string, unknown>;
  const out: { light?: unknown; dark?: unknown; any: boolean } = { any: false };
  if (isPlainObject(a.light)) {
    out.light = a.light;
    out.any = true;
  }
  if (isPlainObject(a.dark)) {
    out.dark = a.dark;
    out.any = true;
  }
  return out;
}

/** Pull the `identity` sub-object from an update_brand_identity arg (or undefined). */
export function coerceIdentityArg(args: unknown): unknown | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const id = (args as Record<string, unknown>).identity;
  return isPlainObject(id) ? id : undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
