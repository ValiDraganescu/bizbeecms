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
 * Reserved component name for a Section ROW — the layer BETWEEN a Section and its
 * columns (multi-row sections epic). A Section's children are `__section_row__`
 * blocks; each row's children are `__section_column__` blocks (1+); components
 * live inside a column. Each row carries its OWN `props.columns` / `columnBehavior`
 * so different rows can have different column counts.
 *
 * GRANDFATHERED: a legacy Section whose direct children are columns (no row layer)
 * is treated as ONE implicit row by the renderer + pure builders (`sectionRows`),
 * so old pages render unchanged and upgrade to explicit rows only when edited.
 * Like Section/column, a renderer primitive (no D1 row) — excluded from the
 * component-existence check.
 */
export const SECTION_ROW_COMPONENT = "__section_row__";

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

/**
 * Reserved component name for the built-in LanguageSwitcher — a renderer
 * primitive (like Section/List, no D1 row) that renders a `<select>` of the
 * Site's configured content locales, current one selected. Choosing a locale
 * NAVIGATES to the same path under that locale's URL prefix (default locale =
 * unprefixed; see plan-language-switcher.ts) — the URL, not a cookie, decides
 * the published render (edge-cacheable). It resolves BY
 * REFERENCE like a component, so an AI-authored nav-bar component can embed it
 * with a `<LanguageSwitcher />` tag (composition-by-tag). The available locale
 * set + active locale come from `LocaleContext.available` — the pure renderer
 * never queries settings itself.
 */
export const LANGUAGE_SWITCHER_COMPONENT = "LanguageSwitcher";

/**
 * Reserved component name for a Form — a BUILT-IN block (external-data-sources
 * Form slice), modeled on the List primitive: special-cased in the renderer
 * (`planForm`), NOT a D1 component. A Form renders as a real `<form>` posting to
 * the Worker's submit endpoint; ANY components can be placed inside it and their
 * `<input name=…>` fields become the form's fields (native form semantics — a
 * `type="submit"` button inside a child component just works). The form's TARGET
 * (`block.formTarget`) is SOURCE-AGNOSTIC like binds: an api saved request
 * (submitted server-side via the central fetch engine — the secret never reaches
 * the browser) or an opted-in collection (visitor submissions land as DRAFT
 * items). Dual submit: native form-data POST (no JS) + a fetch/JSON progressive
 * enhancement, one endpoint. Like Section/List, the block PUT route excludes it
 * from the component-existence check.
 */
export const FORM_COMPONENT = "Form";

/** The reserved built-in block component names (not D1 component rows). */
export const BUILTIN_COMPONENTS = [
  SECTION_COMPONENT,
  SECTION_ROW_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
  FORM_COMPONENT,
  LANGUAGE_SWITCHER_COMPONENT,
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
//
// external-data-sources Slice 3: the source is SOURCE-AGNOSTIC — `kind` picks
// "collection" (default, legacy bindings carry no kind) or "api" (an external
// data source + saved request; see lib/data-sources). For an api source the
// `map` values are DOT-PATHS into the JSON response ("main.temp"), and `params`
// feeds the saved request's `{placeholder}` tokens from block props / literals.

/** `{placeholder}` → a literal string, or `{ prop }` read from the block's props. */
export type ApiBindingParams = Record<string, string | { prop: string }>;

export type BindingRef = {
  source: {
    /** Source kind; absent = "collection" (legacy stored bindings). */
    kind?: "collection" | "api";
    /** collection kind: the collection's `content_<slug>` table name. */
    collection?: string;
    /** Structured filter/sort clauses (query-compiler `QuerySpec` shape). */
    filter?: Array<{ field: string; op: string; value?: unknown }>;
    sort?: Array<{ field: string; dir?: "asc" | "desc" }>;
    /** api kind: the `data_source` row id. */
    sourceId?: string;
    /** api kind: the saved `data_source_request` row id. */
    requestId?: string;
    /** api kind: values for the request's `{placeholder}` tokens. */
    params?: ApiBindingParams;
  };
  /** `{ blockPropName: fieldName }` — collection field, or api response dot-path. */
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
  /** Source kind; absent = "collection" (legacy stored lists). */
  kind?: "collection" | "api";
  /** collection kind: the collection's `content_<slug>` table name. */
  collection?: string;
  filter?: Array<{ field: string; op: string; value?: unknown }>;
  sort?: Array<{ field: string; dir?: "asc" | "desc" }>;
  /**
   * collection kind: free-text search across the collection's text-typed fields
   * (query-compiler's `search` — a simple case-insensitive `LIKE`, OR'd across
   * columns; NOT possible via `filter` since filter clauses AND together). May
   * be a literal string OR a route-value ref (`{"query":"q"}` / `{"param":"x"}`,
   * see `lib/content/route-params.ts`) resolved per-request like `filter` values.
   */
  search?: unknown;
  /** api kind (external-data-sources Slice 3): the `data_source` row id. */
  sourceId?: string;
  /** api kind: the saved `data_source_request` row id. */
  requestId?: string;
  /** api kind: values for the request's `{placeholder}` tokens. */
  params?: ApiBindingParams;
  /** api kind: dot-path to the rows array when nested (e.g. OpenWeather "list"). */
  itemsPath?: string;
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
  // ── "list" presentation layout (ignored for "combobox") ───────────────────
  /**
   * How the rows lay out. Default "vertical".
   *  - "vertical"   → a column; maxSize caps HEIGHT, overflow scrolls on Y.
   *  - "horizontal" → a row;    maxSize caps WIDTH,  overflow scrolls on X.
   *  - "grid"       → an N-column grid (see `columns`); maxSize caps HEIGHT.
   */
  direction?: "vertical" | "horizontal" | "grid";
  /** Grid column count at DESKTOP width (direction "grid" only). Default 2, min 1. */
  columns?: number;
  /** Grid columns at TABLET width (768–1023px). Unset = same as `columns`. */
  columnsTablet?: number;
  /** Grid columns at MOBILE width (≤767px). Unset = same as `columns`. */
  columnsMobile?: number;
  /** Gap between items (all directions). Default 0, in `gapUnit`. */
  gap?: number;
  /** Unit for `gap`. Default "px". */
  gapUnit?: "rem" | "px";
  /**
   * Max size along the scroll axis, in `maxSizeUnit` — max-height for
   * vertical/grid, max-width for horizontal. Content past it SCROLLS.
   * Unset = grows to fit.
   */
  maxSize?: number;
  /** Unit for `maxSize`. Default "px". */
  maxSizeUnit?: "rem" | "px";
  /** Auto-scroll the overflowing content in a seamless loop. Default off. */
  autoscroll?: boolean;
  /** Auto-scroll speed. Default "normal". */
  autoscrollSpeed?: "slow" | "normal" | "fast";
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

// ── Built-in `Form` block target (external-data-sources Form slice) ─────────
//
// Where a Form block's submission goes. SOURCE-AGNOSTIC like BindingRef/
// ListSource: `kind:"api"` submits through the central fetch engine to a saved
// request (form field values fill the request's `{placeholder}` tokens,
// server-side, safely encoded — the secret never reaches the browser);
// `kind:"collection"` writes the submitted fields as a DRAFT item into a
// collection that has EXPLICITLY opted in to public submissions
// (`collection.public_submissions`, default OFF). The submit endpoint resolves
// this target from the PUBLISHED page's blocks — the client only names the
// page + block ids, never the target.
export type FormTarget = {
  kind?: "api" | "collection";
  /** api kind: the `data_source` row id. */
  sourceId?: string;
  /** api kind: the saved `data_source_request` row id. */
  requestId?: string;
  /** collection kind: the collection's `content_<slug>` table name. */
  collection?: string;
  /** Success message shown inline (fetch mode). Default English fallback. */
  successMessage?: string;
  /** Error message shown inline (fetch mode). Default English fallback. */
  errorMessage?: string;
  /** Optional same-site path to redirect to after a NATIVE (no-JS) submit. */
  redirect?: string;
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
  /**
   * Form block ONLY: where the submission goes (api saved request or opted-in
   * collection). Authored; the submit endpoint re-reads it from the PUBLISHED
   * page server-side. Ignored on non-Form blocks.
   */
  formTarget?: FormTarget;
  /**
   * Form block ONLY, set by the renderer host (`buildPlanFromPage`): the page id
   * stamped into the form's hidden identity input so the submit endpoint can
   * resolve the block from the published page. NOT authored.
   */
  formPageId?: string;
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
export type LocaleContext = {
  locale: string;
  fallback: string;
  /**
   * The Site's full content-locale set (code + human label), for the built-in
   * LanguageSwitcher to render its options. Absent on paths that don't need it
   * (the switcher then renders nothing). Ordered as configured; the default leads.
   */
  available?: Array<{ code: string; label: string }>;
};

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
