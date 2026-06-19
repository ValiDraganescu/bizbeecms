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
import { SECTION_COMPONENT } from "../render/tree.ts";

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const UPDATE_COMPONENT_TOOL = {
  type: "function" as const,
  function: {
    name: "update_component",
    description:
      "Update an EXISTING component by re-authoring its full artifact. Use " +
      "get_component first to read the current artifact, then pass the complete " +
      "new { name, tree, script, css } (keep the same name to update in place — a " +
      "new name creates a new component). The whole artifact is replaced, not merged.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The component's exact existing name." },
        tree: {
          type: "object",
          description: "The component's element tree (JSON) the renderer walks server-side.",
        },
        script: { type: "string", description: "Client JS for interactivity (or empty string)." },
        css: { type: "string", description: "Tailwind utility classes / custom CSS (or empty)." },
      },
      required: ["name", "tree"],
    },
  },
} as const;

export const UPDATE_PAGE_BLOCKS_TOOL = {
  type: "function" as const,
  function: {
    name: "update_page_blocks",
    description:
      "Replace the block tree of an EXISTING page (its layout/content), WITHOUT " +
      "touching its slug/parent/SEO metadata. Use list_pages/get_page to find the " +
      "page id, then pass the full new 'blocks' array. Each block references a " +
      "component by name (which must already exist) or the reserved layout block " +
      "'Section'. Re-pass the whole tree — this is a full replace, not a patch.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The page's id (from list_pages/get_page)." },
        blocks: {
          type: "array",
          description:
            "JSON array of blocks: { id, component, props?, children? }. Full replacement.",
        },
      },
      required: ["id", "blocks"],
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
        "A layout container. Its column children are laid out in a CSS grid row. " +
        "Set props.columns (1-4); drop components into the columns.",
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
