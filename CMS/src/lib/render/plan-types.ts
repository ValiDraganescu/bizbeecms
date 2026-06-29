/**
 * Render-plan + block-tree TYPES and the reserved built-in component names.
 *
 * Split out of `tree.ts` (which re-exports all of these) so the type vocabulary
 * the whole renderer + editor + chat tools share lives in one small, dependency-
 * free place. Pure types + a couple of trivial constants/guards — no logic.
 */

/**
 * Reserved component name for a layout Section — a builder primitive, NOT an
 * AI-authored D1 component. A Section block renders as a plain container that
 * nests its `children` blocks; the renderer handles it directly so no D1
 * `component` row is needed (and the block PUT route excludes it from the
 * component-existence check). Lives here (the lowest layer) so both the renderer
 * and the editor (`page-blocks.ts`, which re-exports it) agree on the one name.
 */
export const SECTION_COMPONENT = "Section";

/**
 * Reserved component name for a Section's COLUMN (the aicms Section→Columns
 * model). A Section's `children` are `__section_column__` blocks (1–4), and the
 * actual dropped components live inside a column's `children`. Like the Section,
 * a column is a renderer primitive (no D1 row), so the block PUT route excludes
 * it from the component-existence check.
 */
export const SECTION_COLUMN_COMPONENT = "__section_column__";

/**
 * Reserved component name for a List — a BUILT-IN data-binding block (Phase 2,
 * Slice B), modeled EXACTLY on the Section primitive: special-cased in this
 * renderer (`planList`), NOT an AI-authored D1 component. A List carries a
 * structured query (`listSource`: collection + filter/sort/limit) and ONE child
 * SLOT = the template component to STAMP once per result row. The renderer host
 * runs the query in the async `buildPlanFromPage` (hydrate-before-walk, same seam
 * as Slice A's single-item bindings) and stashes the rows onto `listRows`; the
 * PURE `planList` then clones the slot subtree per row, binding each row's mapped
 * fields into the slotted component's DECLARED props (`map`, allowlist-gated).
 * GRACEFUL: an empty/dead result renders nothing (or an optional empty-state
 * slot). Like Section, the block PUT route excludes it from the component check.
 */
export const LIST_COMPONENT = "List";

/** The reserved built-in block component names (not D1 component rows). */
export const BUILTIN_COMPONENTS = [
  SECTION_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
] as const;

/** Is this block component a built-in renderer primitive (no D1 row needed)? */
export function isBuiltinComponent(name: string): boolean {
  return (BUILTIN_COMPONENTS as readonly string[]).includes(name);
}

// ── Component element tree (what `component.tree` holds, parsed) ─────────────
export type TreeNode =
  | string
  | {
      tag: string;
      props?: Record<string, unknown>;
      children?: TreeNode[];
    };

// ── Component ↔ collection data binding (Phase 2, Slice A) ───────────────────
//
// A block can BIND a collection item's fields into its own declared props. This
// is SINGLE-ITEM binding: a structured query picks the FIRST matching row, and
// each `map` entry copies that row's `fieldName` into the block prop `propName`
// BEFORE the pure walk (hydrate-before-walk — see render-page.tsx). The binding
// is data only (no SQL); the live query is compiled + run by the renderer host.
// Validation (collection/field/prop exist) is in `lib/content/binding.ts`.
export type BindingRef = {
  source: {
    /** The collection's `content_<slug>` table name (registry `table_name`). */
    collection: string;
    /** Structured filter/sort clauses (query-compiler `QuerySpec` shape). */
    filter?: Array<{ field: string; op: string; value?: unknown }>;
    sort?: Array<{ field: string; dir?: "asc" | "desc" }>;
  };
  /** `{ blockPropName: collectionFieldName }` — which row field fills which prop. */
  map: Record<string, string>;
};

// ── Built-in `List` block: collection → repeated component (Phase 2, Slice B) ─
//
// A List block (component === LIST_COMPONENT) repeats a TEMPLATE component once
// per query result row. `source` is the structured query (collection + optional
// filter/sort/limit, reusing the Slice-4 query-compiler vocabulary). `map` is the
// row-field → template-prop binding (`{ templatePropName: collectionFieldName }`),
// allowlist-gated against the template's declared props at stamp time. The rows
// themselves are fetched in the async `buildPlanFromPage` (NOT in the pure walk)
// and stashed onto `Block.listRows`, mirroring Slice A's hydrate-before-walk seam.
export type ListSource = {
  /** The collection's `content_<slug>` table name (registry `table_name`). */
  collection: string;
  filter?: Array<{ field: string; op: string; value?: unknown }>;
  sort?: Array<{ field: string; dir?: "asc" | "desc" }>;
  /** Max rows to stamp. Clamped by the query store; default = the store default. */
  limit?: number;
  /**
   * How the stamped rows are PRESENTED (default "list"):
   *  - "list"     → the original List: a flat container of stamped rows.
   *  - "combobox" → the List acts as a Combobox CONTAINER. It still stamps the
   *    ITEM COMPONENT once per row (same `listMap` field→prop binding), but wraps
   *    each stamped row as a selectable option inside a combobox shell. The
   *    combobox client script owns selection/search/check/limits; the author's
   *    item component is purely visual. Config below rides on the SAME List panel.
   */
  presentation?: "list" | "combobox";
  // ── "combobox" presentation config (ignored for "list") ───────────────────
  /** single = pick one (closes on select); multiple = pick many. Default multiple. */
  select?: "single" | "multiple";
  /** Minimum selectable (a selected item can't be removed below this). Default 0. */
  min?: number;
  /** Maximum selectable (0 = unlimited). Default 0. */
  max?: number;
  /** Show the in-panel search box (default true). */
  searchable?: boolean;
  /** Collection field whose value identifies each option (default the row `id`). */
  valueField?: string;
  /**
   * Collection field shown as each selected item's chip in the trigger summary
   * (and matched by search). Default: the option's rendered text content (the
   * stamped item component flattened) — which can read mashed, hence this opt-in.
   */
  labelField?: string;
  /**
   * Advanced: a TEMPLATE-LITERAL BODY evaluated client-side against the ROW object
   * to build the chip label — stored WITHOUT backticks, e.g. "${name} · ★ ${rating}"
   * (see `normalizeLabelExpr`; the client wraps it in backticks before eval). Wins
   * over `labelField`. Runs via `new Function` IN THE BROWSER (admin-authored, same
   * trust as a component's client script). A throwing/empty expr falls back to
   * labelField → text. NEVER evaluated on the server (Workers block Function); the
   * renderer only stamps the row JSON + the expr string for the client to use.
   */
  labelExpr?: string;
  /** Form field name for the hidden input the selection writes to. Default "selection". */
  name?: string;
  /** Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** Search box placeholder. */
  searchPlaceholder?: string;
};

// ── Page block instances (what `page.blocks` holds, parsed) ──────────────────
export type Block = {
  id: string;
  // References a `component.name`, OR a built-in (Section/column/List).
  component: string;
  props?: Record<string, unknown>;
  children?: Block[];
  /**
   * Optional single-item collection binding (Phase 2, Slice A) — SEPARATE from
   * `props`. The renderer fetches the first matching row and hydrates the mapped
   * field values into `props` (under the mapped prop names) before the pure walk.
   * Unresolved (no match / dead collection / unknown field) → graceful blank.
   */
  bindings?: Record<string, BindingRef>;
  /**
   * List block (Slice B) ONLY: the structured query for the rows to repeat.
   * Ignored on non-List blocks.
   */
  listSource?: ListSource;
  /**
   * List block (Slice B) ONLY: `{ templatePropName: collectionFieldName }` — how
   * each row's fields fill the per-row template component's declared props.
   */
  listMap?: Record<string, string>;
  /**
   * List block (Slice B) ONLY, set by the renderer host (`buildPlanFromPage`):
   * the fetched rows for `listSource`. The PURE `planList` reads this; it is NOT
   * authored. Absent/empty → the List renders its empty-state slot (or nothing).
   */
  listRows?: Array<Record<string, unknown>>;
  /**
   * Marks a List child as the EMPTY-STATE slot (rendered only when there are no
   * rows). All other List children form the per-row TEMPLATE. Ignored elsewhere.
   */
  listRole?: "template" | "empty";
};

// A component artifact as stored (the fields the renderer needs).
export type ComponentArtifact = {
  name: string;
  tree: TreeNode;
  script?: string;
  /** Component-scoped CSS (the artifact's `css` column). Shipped once per used
   *  component, like `script`. Needed for styles that can't ride Tailwind utility
   *  classes — e.g. rules targeting nodes a CLIENT script builds at runtime, which
   *  never appear in the SSR plan the runtime Tailwind compiler reads. */
  css?: string;
  // The component's declared props, a JSON string `{ name: { type, default } }`
  // (B2/H2 `propsSchema` column). Only props DECLARED here can be bound from a
  // page block — it is the allowlist for the `{{prop}}` slot binding below.
  propsSchema?: string | null;
};

/**
 * A serializable render plan: a normalized element tree plus the ordered,
 * de-duplicated set of client scripts to ship. The React adapter walks
 * `root`; the route emits `scripts` as <script> strings.
 */
export type ElementPlan =
  | { kind: "text"; text: string }
  | {
      kind: "element";
      tag: string;
      props: Record<string, unknown>;
      children: ElementPlan[];
    };

export type RenderPlan = {
  root: ElementPlan[];
  // Client scripts, in first-seen order, one per distinct component used.
  scripts: string[];
  // Component-scoped CSS, in first-seen order, one per distinct component used.
  styles: string[];
};

/**
 * Optional content-locale context (epic C1). When present, every prop value
 * that is a "locale object" ({ en: "...", fi: "..." }, at any depth) is
 * resolved to the active locale (fallback → default → first present) as the
 * tree is walked. Absent = no resolution (props pass through verbatim).
 */
export type LocaleContext = { locale: string; fallback: string };

/** Make a hidden placeholder element carrying a render-error message. Shared by
 *  every planner so one bad node degrades to an invisible div, never a throw. */
export function placeholder(message: string): ElementPlan {
  return {
    kind: "element",
    tag: "div",
    props: {
      "data-render-error": message,
      style: { display: "none" },
    },
    children: [],
  };
}

// ── tiny shared coercers (used by every planner) ─────────────────────────────
export function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
export function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}
