/**
 * Read-only AI tools (Milestone 2, ai-assistant goal, Slice 3).
 *
 * The assistant could CREATE pages/components/translations but had no way to
 * DISCOVER what already exists — so it couldn't reliably UPDATE (it would
 * re-author from scratch or guess names/ids). This module adds the read tools
 * that close that gap, each backed by an EXISTING store function (no new data
 * path; see CAVEATS):
 *
 *   - list_components  → component-store.listComponents()
 *   - get_component    → component-store.getComponentByName(name)
 *   - list_pages       → page-store.listPages()
 *   - get_page         → page-store.getPageById(id)
 *   - list_locales     → settings-store.getContentLocales()
 *   - get_brand_identity → settings-store.getSiteIdentity()
 *   - get_theme        → settings-store.getThemeOverrides() (+ dark)
 *
 * Mirrors `list-assets-tool.ts`: there is NO untrusted artifact to validate (we
 * list/read what exists). The only model-supplied args are identifiers we coerce
 * to strings. The PURE concerns live here (tool schemas + arg coercion + row
 * shaping — no React/D1/CF imports, so node-testable per CAVEATS); the route
 * wires each to its store read.
 *
 * Write tools (update_component / update_page_blocks / update_brand_identity /
 * update_theme) are a SEPARATE follow-up slice — they carry untrusted artifacts
 * that need the same validation rigor as create_* and shouldn't ride along with
 * these zero-risk reads.
 */

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const LIST_COMPONENTS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_components",
    description:
      "List the reusable UI components that already exist on this site (names " +
      "and whether each has a props schema). Call this before authoring a " +
      "component so you reuse or update an existing one instead of duplicating it.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const GET_COMPONENT_TOOL = {
  type: "function" as const,
  function: {
    name: "get_component",
    description:
      "Fetch one existing component's full artifact (html, script, css, props " +
      "schema) by its name, so you can inspect or modify it. Use list_components " +
      "first to discover names.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "The component's exact name." },
      },
      required: ["name"],
    },
  },
} as const;

export const LIST_PAGES_TOOL = {
  type: "function" as const,
  function: {
    name: "list_pages",
    description:
      "List the site's pages (id, slug, parent slug, publish status, and the " +
      "per-locale meta title/description). Call this before creating or editing " +
      "a page so you reference real slugs/ids.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const GET_PAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_page",
    description:
      "Fetch one page by id: its metadata (slug, parent, publish status, " +
      "per-locale meta fields) AND its current draft `blocks` — the page's block " +
      "tree (each block's id, component, props, and children) so you can see " +
      "what's rendered and with which property values. Call this before editing a " +
      "page so update_page_blocks re-passes the full, current tree.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The page's id." },
      },
      required: ["id"],
    },
  },
} as const;

export const LIST_LOCALES_TOOL = {
  type: "function" as const,
  function: {
    name: "list_locales",
    description:
      "List the site's configured content locales (the user-facing languages " +
      "content can be authored/translated into) and which is the default. Call " +
      "this before translating so you target the right locales.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const SEARCH_ICONS_TOOL = {
  type: "function" as const,
  function: {
    name: "search_icons",
    description:
      "Search the site's SELECTED icon set for icons matching a query, so you can " +
      "reference them in a component with an `{{icon \"name\"}}` slot (or set an " +
      "icon-typed prop). Returns matching icon NAMES (e.g. \"calendar\", " +
      "\"arrow-right\") in the active set. Use the returned name verbatim in the " +
      "slot — names are resolved against whatever set the operator chose in " +
      "Settings, so don't include a set prefix.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to look for, e.g. \"calendar\", \"arrow\", \"shopping cart\".",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 48, max 100).",
        },
      },
      required: ["query"],
    },
  },
} as const;

export const GET_BRAND_IDENTITY_TOOL = {
  type: "function" as const,
  function: {
    name: "get_brand_identity",
    description:
      "Read the site's brand identity / design-system / AI-persona settings " +
      "(name, tagline, voice, etc.) so your authored content matches the brand.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const GET_THEME_TOOL = {
  type: "function" as const,
  function: {
    name: "get_theme",
    description:
      "Read the site's EFFECTIVE color theme — `theme.light` and `theme.dark` " +
      "each map every color token to its active value (built-in defaults merged " +
      "with the operator's overrides), so you see the real palette. `overrides` " +
      "holds only the tokens the operator explicitly changed (empty = pure " +
      "defaults, which is normal, not a misconfiguration).",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

/** The admin-page contexts the authoring-guide tool exposes. */
export const GUIDE_CONTEXTS = [
  "page-builder",
  "components",
  "pages",
  "settings",
  "media",
  "collections",
  "general",
] as const;
export type GuideContext = (typeof GUIDE_CONTEXTS)[number];

export const GET_AUTHORING_GUIDE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_authoring_guide",
    description:
      "Fetch this Site's built-in authoring guide — the SAME system prompt the " +
      "in-CMS assistant runs on, assembled with the live Site identity, existing " +
      "components, collections, and locales. Pick the guide for the task: " +
      "`page-builder` (compose components into pages), `components` (develop " +
      "reusable components), `pages` (manage/translate the pages list), " +
      "`settings` (brand identity + theme), `media` (uploaded assets), " +
      "`collections` (structured data), or `general`. Call this BEFORE authoring " +
      "so you follow the Site's exact rules (plain HTML attrs, " +
      "components-before-pages, every locale, real table names) instead of guessing.",
    parameters: {
      type: "object",
      properties: {
        guide: {
          type: "string",
          enum: GUIDE_CONTEXTS as unknown as string[],
          description:
            "Which guide: page-builder | components | pages | settings | media | " +
            "collections | general. Defaults to 'page-builder'.",
        },
      },
      required: [],
    },
  },
} as const;

/** Map the tool's `guide` arg to a valid context; default page-builder. */
export function coerceGuideArg(args: unknown): GuideContext {
  const raw =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).guide
      : undefined;
  return (GUIDE_CONTEXTS as readonly string[]).includes(raw as string)
    ? (raw as GuideContext)
    : "page-builder";
}

// ── Pure arg coercion ─────────────────────────────────────────────────────────

/**
 * Coerce a model-supplied identifier arg (`name`/`id`) to a trimmed string, or
 * undefined if missing/blank/wrong-type. Open models sometimes wrap args oddly;
 * we accept only a real string. PURE, never throws.
 */
export function coerceIdArg(args: unknown, key: string): string | undefined {
  if (typeof args !== "object" || args === null) return undefined;
  const raw = (args as Record<string, unknown>)[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

// ── Pure row shaping (D1 rows → the compact result the model sees) ─────────────

/** A component row as the store returns it (subset we care about). */
export interface ComponentRowLike {
  name: string;
  propsSchema?: string | null;
}

/** Shape `listComponents()` rows into `{ name, hasProps }` for the model. */
export function formatComponentList(
  rows: ComponentRowLike[],
): { name: string; hasProps: boolean }[] {
  return rows.map((r) => ({
    name: r.name,
    hasProps: typeof r.propsSchema === "string" && r.propsSchema.trim() !== "" &&
      r.propsSchema.trim() !== "{}",
  }));
}

/** A page summary as the store returns it (subset we surface). */
export interface PageSummaryLike {
  id: string;
  slug: string;
  parentSlug: string | null;
  publishStatus: string;
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
}

/** Shape `listPages()` rows into a compact per-page summary for the model. */
export function formatPageList(rows: PageSummaryLike[]): {
  id: string;
  slug: string;
  parentSlug: string | null;
  publishStatus: string;
  locales: string[];
}[] {
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    parentSlug: r.parentSlug,
    publishStatus: r.publishStatus,
    // Which locales already have meta text (so the model knows what to translate).
    locales: [
      ...new Set([
        ...Object.keys(r.metaTitle ?? {}),
        ...Object.keys(r.metaDescription ?? {}),
      ]),
    ].sort(),
  }));
}
