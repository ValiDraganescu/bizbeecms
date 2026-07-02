/**
 * The second AI tool: create/compose a page (Milestone 2, epic B3).
 *
 * After authoring components (B2), the AI assembles them into a PAGE: a block
 * tree where each block references a `component.name`. This module owns the two
 * PURE, offline-testable concerns of that tool, mirroring `component-tool.ts`:
 *
 *  1. `CREATE_PAGE_TOOL` — the OpenAI-style function/tool schema handed to
 *     `env.AI.run({ tools })`.
 *  2. `validatePageInput` — the security/correctness gate on the model's
 *     UNTRUSTED output. It validates the slug, optional parent slug, publish
 *     status, and the block tree's SHAPE (via the renderer's own `planPage`, so
 *     an un-renderable tree is rejected), and collects every distinct component
 *     name the blocks reference. PURE — never throws, never writes.
 *
 * The validator can't know which components EXIST in D1 (that needs the binding),
 * so it returns the referenced `componentNames`; the chat route checks them
 * against the DB before the upsert and reports any missing ones to the model.
 * The D1 write lives in `db/page-store.ts`. This module is PURE (no React/D1/CF
 * imports) so it's unit-tested with the project's dep-free `node --test`.
 */

// Relative (not @/) imports so this stays node-testable (see CAVEATS).
import {
  planPage,
  SECTION_COMPONENT,
  isBuiltinComponent,
  type Block,
} from "../render/tree.ts";

export type PublishStatus = "draft" | "published";

/** The validated, ready-to-persist page input. */
export interface PageInput {
  slug: string;
  parentSlug: string | null;
  publishStatus: PublishStatus;
  blocks: Block[];
  metaTitle: Record<string, string>;
  metaDescription: Record<string, string>;
}

// Slug: lowercase URL segment (the public route resolves these against the page
// tree). Allow letters/digits/hyphens; the reserved "home" serves "/" (A2). A
// leading ":" marks a WILDCARD param segment (e.g. ":city-slug") — matches any
// path segment at that position; its value is exposed to blocks as a route
// param (platform feature: dynamic/param-driven pages).
const SLUG_RE = /^:?[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * The tool schema handed to the model. OpenAI/Workers-AI function-calling shape.
 * `blocks` is described as a JSON array; open models often emit it as a string,
 * so the validator accepts an array OR a JSON string of one (see `coerceBlocks`).
 */
export const CREATE_PAGE_TOOL = {
  type: "function" as const,
  function: {
    name: "create_page",
    description:
      "Create or update a page by composing it from existing components. The " +
      "page is a tree of 'blocks', each referencing a component by name (create " +
      "those components first with create_component). Re-using a slug (under the " +
      "same parent) updates that page. Use slug 'home' for the site root '/'.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description:
            "URL path segment, lowercase, e.g. 'pricing' or 'home' (the site " +
            "root). Unique under its parent. Prefix with ':' for a WILDCARD " +
            "param segment (e.g. ':city-slug') that matches any path segment " +
            "there — its value is exposed to this page's blocks as route " +
            "param 'city-slug' for filter/binding values ({\"param\":\"city-slug\"}).",
        },
        parentSlug: {
          type: "string",
          description:
            "Optional slug of the parent page (for nesting, e.g. a blog post " +
            "under 'blog'). Omit or empty for a top-level page.",
        },
        publishStatus: {
          type: "string",
          enum: ["draft", "published"],
          description: "'published' makes the page live; 'draft' hides it. Defaults to draft.",
        },
        blocks: {
          type: "array",
          description:
            "JSON array of blocks: { id, component, props?, children? }. Each " +
            "'component' must name a component that exists. Blocks may nest.",
        },
        metaTitle: {
          type: "object",
          description:
            "Optional per-locale SEO title map, e.g. { \"en\": \"Pricing\" }.",
        },
        metaDescription: {
          type: "object",
          description: "Optional per-locale SEO description map.",
        },
      },
      required: ["slug", "blocks"],
    },
  },
};

/**
 * Validate a raw tool-call argument object into a persistable page input plus
 * the set of component names its blocks reference, or return the problems (which
 * the route relays back to the model). PURE — never throws, never writes.
 *
 * NOTE: this does NOT verify the referenced components EXIST (no D1 here) — it
 * returns `componentNames` for the route to check against the DB.
 */
export function validatePageInput(
  args: unknown,
):
  | { ok: true; page: PageInput; componentNames: string[] }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (typeof args !== "object" || args === null) {
    return { ok: false, errors: ["tool arguments must be a JSON object"] };
  }
  const a = args as Record<string, unknown>;

  // ── slug ──
  const slug = typeof a.slug === "string" ? a.slug.trim() : "";
  if (!SLUG_RE.test(slug)) {
    errors.push("slug must match /^[a-z0-9][a-z0-9-]{0,63}$/ (a lowercase URL segment)");
  }

  // ── parentSlug ── (optional; same slug rules when present)
  let parentSlug: string | null = null;
  if (a.parentSlug != null && a.parentSlug !== "") {
    if (typeof a.parentSlug === "string" && SLUG_RE.test(a.parentSlug.trim())) {
      parentSlug = a.parentSlug.trim();
    } else {
      errors.push("parentSlug must be a lowercase URL segment, or omitted for a top-level page");
    }
  }

  // ── publishStatus ── (optional; defaults to draft)
  let publishStatus: PublishStatus = "draft";
  if (a.publishStatus != null) {
    if (a.publishStatus === "draft" || a.publishStatus === "published") {
      publishStatus = a.publishStatus;
    } else {
      errors.push("publishStatus must be 'draft' or 'published'");
    }
  }

  // ── blocks ── (accept array or JSON string of one)
  const blocks = coerceBlocks(a.blocks);
  let componentNames: string[] = [];
  if (blocks === undefined) {
    errors.push("blocks must be a JSON array of block objects (or a JSON string of one)");
  } else {
    const shape = validateBlockTree(blocks);
    errors.push(...shape.errors);
    componentNames = shape.componentNames;
    // Reuse the renderer's own page walker against an EMPTY component map: it
    // never throws (unknown components become hidden placeholders), so if it
    // throws here the block tree is structurally un-renderable.
    if (shape.errors.length === 0) {
      try {
        planPage(blocks, new Map());
      } catch (err) {
        errors.push(`blocks are not renderable: ${(err as Error).message}`);
      }
    }
  }

  // ── meta (optional per-locale string maps) ──
  const metaTitle = coerceStringMap(a.metaTitle);
  if (metaTitle === undefined) errors.push("metaTitle must be an object of locale→string");
  const metaDescription = coerceStringMap(a.metaDescription);
  if (metaDescription === undefined) {
    errors.push("metaDescription must be an object of locale→string");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    page: {
      slug,
      parentSlug,
      publishStatus,
      blocks: blocks as Block[],
      metaTitle: metaTitle as Record<string, string>,
      metaDescription: metaDescription as Record<string, string>,
    },
    componentNames,
  };
}

/** Accept a blocks array, or a JSON string of one; undefined if neither. */
function coerceBlocks(raw: unknown): Block[] | undefined {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  return Array.isArray(v) ? (v as Block[]) : undefined;
}

/** Accept an object of string values (or undefined/empty → {}); undefined if invalid. */
function coerceStringMap(raw: unknown): Record<string, string> | undefined {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val !== "string") return undefined;
    out[k] = val;
  }
  return out;
}

/**
 * Validate the block tree's shape and collect every distinct referenced
 * component name. Each block needs a string `id` and a string `component`;
 * `children` (if present) must be an array of blocks. Walks recursively.
 */
function validateBlockTree(
  blocks: Block[],
): { errors: string[]; componentNames: string[] } {
  const errors: string[] = [];
  const names = new Set<string>();
  blocks.forEach((b, i) => walk(b, `blocks[${i}]`));
  // TOP-LEVEL RULE: only Sections at the top level (a new page has no grandfathered
  // blocks). A bare component here renders outside any section layout.
  blocks.forEach((b, i) => {
    const comp = (b as { component?: unknown })?.component;
    if (typeof comp === "string" && comp.trim() !== "" && comp.trim() !== SECTION_COMPONENT) {
      errors.push(
        `blocks[${i}] is a "${comp.trim()}", but only Sections are allowed at the top level. ` +
          `Wrap it in a Section (Section → __section_row__ → __section_column__ → ${comp.trim()}).`,
      );
      return;
    }
    // NAMING RULE (AI path): every Section the model authors must carry a
    // human-readable props.name (e.g. "Hero", "Featured restaurants") — the
    // operator sees these in the Layers tree and @section mentions, so an
    // unnamed "Section 3" is not acceptable from the AI.
    if (comp === SECTION_COMPONENT) {
      const name = (b as { props?: Record<string, unknown> })?.props?.name;
      if (typeof name !== "string" || name.trim() === "") {
        errors.push(
          `blocks[${i}] is a Section with no name — set props.name to a short, ` +
            `descriptive label (e.g. "Hero", "Menu highlights", "Footer CTA").`,
        );
      }
    }
  });
  // Drop renderer built-ins (Section/row/column/List/LanguageSwitcher) — they
  // have no D1 component row, so the caller's existence check must not see them.
  for (const n of [...names]) if (isBuiltinComponent(n)) names.delete(n);
  return { errors, componentNames: [...names] };

  function walk(block: unknown, path: string): void {
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      errors.push(`${path} must be a block object`);
      return;
    }
    const b = block as Record<string, unknown>;
    if (typeof b.id !== "string" || b.id.trim() === "") {
      errors.push(`${path}.id must be a non-empty string`);
    }
    if (typeof b.component !== "string" || b.component.trim() === "") {
      errors.push(`${path}.component must be a non-empty component name`);
    } else {
      names.add(b.component.trim());
    }
    if (b.children != null) {
      if (!Array.isArray(b.children)) {
        errors.push(`${path}.children must be an array of blocks`);
      } else {
        (b.children as unknown[]).forEach((c, i) => walk(c, `${path}.children[${i}]`));
      }
    }
  }
}
