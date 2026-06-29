/**
 * Pure block-tree → render-plan walker (Milestone 2, epic A2 core).
 *
 * This is the heart of the data-driven page renderer, kept as a PURE module:
 * no React, no D1, no Cloudflare imports — so it is unit-testable with a
 * dep-free `node --test` (the project's test convention; see CAVEATS). The
 * thin React adapter that turns a plan into elements lives in `react.tsx`.
 *
 * Two trees are involved:
 *  - A component's `tree` — a JSON element tree (tag/props/children) the AI
 *    emits. The Worker SSRs it via React.createElement (a DATA WALK, never
 *    eval/Function — those are permanently blocked on Workers).
 *  - A page's `blocks` — an array of block instances, each naming a component
 *    by `name`. The page walk resolves each block to its component artifact,
 *    renders the artifact's tree, and collects the component's client `script`
 *    (shipped to the browser, run there — never on the server).
 */

import { resolveLocalized } from "./localize.ts";
import {
  COMBOBOX_LIST_ASSET_KEY,
  COMBOBOX_LIST_SCRIPT,
  COMBOBOX_LIST_CSS,
} from "./combobox-list-asset.ts";

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

/**
 * Canonicalize a combobox `labelExpr` to a bare TEMPLATE-LITERAL BODY: trimmed,
 * with a single pair of surrounding backticks stripped if present. The field IS a
 * template body (e.g. `${name} ★ ${rating}`) — the renderer wraps it back in
 * backticks to evaluate. Accepting backticks here means neither the operator nor
 * the AI has to know whether to add them; we store the clean form either way.
 * Idempotent. "" / undefined → "".
 */
export function normalizeLabelExpr(expr: string | null | undefined): string {
  const s = (expr ?? "").trim();
  if (s.length >= 2 && s.startsWith("`") && s.endsWith("`")) {
    return s.slice(1, -1).trim();
  }
  return s;
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
 * Collect every Tailwind class token used across a render plan (so the runtime
 * Tailwind compiler can build exactly the CSS this page needs). Walks the
 * resolved `ElementPlan` tree reading `props.className`. Pure — no compile here.
 */
export function collectPlanClasses(root: ElementPlan[]): Set<string> {
  const out = new Set<string>();
  const walk = (n: ElementPlan): void => {
    if (n.kind !== "element") return;
    const cn = n.props.className;
    if (typeof cn === "string") for (const c of cn.split(/\s+/)) if (c) out.add(c);
    for (const child of n.children) walk(child);
  };
  for (const n of root) walk(n);
  return out;
}

/**
 * Optional content-locale context (epic C1). When present, every prop value
 * that is a "locale object" ({ en: "...", fi: "..." }, at any depth) is
 * resolved to the active locale (fallback → default → first present) as the
 * tree is walked. Absent = no resolution (props pass through verbatim).
 */
export type LocaleContext = { locale: string; fallback: string };

/**
 * A `tag` that names ANOTHER component (composition-by-tag): a PascalCase
 * identifier. Same shape `enumerateComponentDeps`/`validateComponentArtifact`
 * treat as a component reference, so the renderer, the dep-warning, and the
 * artifact gate all agree on what's a component vs a plain HTML element.
 */
const COMPONENT_TAG_RE = /^[A-Z][A-Za-z0-9_-]{0,63}$/;

/**
 * Guard runaway / cyclic component composition (A references B references A …).
 * A component tree resolving deeper than this stops resolving nested-component
 * tags (renders them as a hidden placeholder) instead of recursing forever.
 */
const MAX_COMPONENT_DEPTH = 16;

/**
 * Nested-component resolution context: the component map to resolve PascalCase
 * tags against, and the current recursion depth. Absent (the common path: a
 * single component tree with no component-tags) = tags render literally as
 * before — fully back-compatible.
 */
type ComposeContext = {
  components: Map<string, ComponentArtifact>;
  depth: number;
  /**
   * Optional sink for a resolved nested component's client `script` (collected
   * once per name, first-use order) — supplied by `planPage` so nested-by-tag
   * components ship their script just like top-level block components do.
   */
  collectScript?: (artifact: ComponentArtifact) => void;
};

/**
 * Walk one component element tree into element plans.
 *
 * When `compose` is supplied (the page renderer passes it), a node whose `tag`
 * is a PascalCase component NAME present in the component map is RESOLVED to
 * that component's own tree (composition-by-tag): the referencing node's string
 * props bind into the nested component's `{{slots}}`, and the node's children
 * are appended inside the nested component's root. This is what makes a kit
 * component like `{ tag: "AuthorCard", props: {…} }` actually render the
 * AuthorCard component instead of an `<authorcard>` literal. Unknown component
 * tags / over-deep recursion fall back to a hidden placeholder.
 */
export function planTree(
  node: TreeNode,
  locale?: LocaleContext,
  compose?: ComposeContext,
): ElementPlan {
  if (typeof node === "string") return { kind: "text", text: node };
  if (node == null || typeof node !== "object") {
    throw new Error(`Invalid tree node: ${JSON.stringify(node)} — each node must be a string (text) or an object { tag, props?, children? }`);
  }
  if (typeof node.tag !== "string") {
    // Name the actual defect. The model sometimes corrupts the JSON mid-generation
    // (e.g. tag/props become a stray repeated number like 2222) — say so plainly so
    // it regenerates a clean node instead of re-reading an opaque `{"tag":2222}` dump.
    throw new Error(
      `Invalid tree node: \`tag\` must be an HTML tag NAME string (e.g. "div", "section", "img"), ` +
        `got ${JSON.stringify((node as { tag?: unknown }).tag)}. The node looks corrupted ` +
        `(${JSON.stringify(node).slice(0, 120)}) — regenerate this node with a real string tag, ` +
        `an object \`props\`, and an array \`children\`.`,
    );
  }

  // Composition-by-tag: a PascalCase tag that resolves to a known component.
  if (compose && COMPONENT_TAG_RE.test(node.tag)) {
    return planComponentTag(node, locale, compose);
  }

  const props = node.props ?? {};
  return {
    kind: "element",
    tag: node.tag,
    props: locale
      ? (resolveLocalized(props, locale.locale, locale.fallback) as Record<
          string,
          unknown
        >)
      : props,
    children: (node.children ?? []).map((c) => planTree(c, locale, compose)),
  };
}

/**
 * Resolve a `{ tag: "SomeComponent", props, children }` node by rendering the
 * referenced component's tree in its place. The node's STRING props bind into
 * the component's declared `{{slots}}` (same allowlist + binding the page-block
 * path uses); the node's children append inside the resolved root. Cyclic /
 * too-deep / unknown / text-root references degrade to a hidden placeholder so a
 * bad reference can never throw or blank the page.
 */
function planComponentTag(
  node: Exclude<TreeNode, string>,
  locale: LocaleContext | undefined,
  compose: ComposeContext,
): ElementPlan {
  if (compose.depth >= MAX_COMPONENT_DEPTH) {
    return placeholder(`component "${node.tag}" nested too deeply`);
  }
  const artifact = compose.components.get(node.tag);
  if (!artifact) {
    // Not a known component — render the tag literally (e.g. an HTML-ish custom
    // element the author intended, or a missing dep). Hidden placeholder keeps
    // the page intact while signalling the gap (matches planPage's unknown path).
    return placeholder(`unknown component "${node.tag}"`);
  }
  compose.collectScript?.(artifact);

  // Bind the referencing node's declared string props into the nested tree's
  // {{slots}} (resolve locale objects first), exactly like a page block does.
  let tree = artifact.tree;
  const rawProps = node.props ?? {};
  if (Object.keys(rawProps).length > 0) {
    const declared = declaredProps(artifact.propsSchema);
    if (declared.size > 0) {
      const values = locale
        ? (resolveLocalized(rawProps, locale.locale, locale.fallback) as Record<
            string,
            unknown
          >)
        : rawProps;
      tree = bindTree(tree, values, declared);
    }
  }

  const childCompose: ComposeContext = {
    components: compose.components,
    depth: compose.depth + 1,
    collectScript: compose.collectScript,
  };
  const el = planTree(tree, locale, childCompose);
  const childPlans = (node.children ?? []).map((c) => planTree(c, locale, compose));
  if (childPlans.length === 0) return el;
  if (el.kind !== "element") {
    return placeholder(`component "${node.tag}" cannot host children`);
  }
  return { ...el, children: [...el.children, ...childPlans] };
}

// ── Block-prop → component-prop binding (epic G1 follow-on) ──────────────────
//
// A component author marks where page content goes with `{{propName}}` slots in
// the tree's text nodes and STRING prop values. A page block supplies values via
// `block.props`. Binding substitutes each slot with the block's value — but only
// for props DECLARED in the component's `propsSchema` (the allowlist). This is a
// SECURITY/CORRECTNESS boundary:
//   - Only declared props bind. A `{{undeclared}}` slot is dropped to "" and an
//     undeclared key in `block.props` is ignored (never reaches the tree).
//   - Bound values are placed as plain text / plain prop DATA in the ElementPlan,
//     so the existing plan→React adapter escapes them exactly like any other tree
//     text. No HTML is interpolated, nothing is eval'd. An unsafe value like
//     `<script>` ends up as the literal text `<script>` in the DOM.
//   - Non-string block values are coerced to a string for substitution (objects/
//     functions never reach the tree); locale objects are resolved first.

/**
 * Slot syntax: `{{ propName }}` (plain) or `{{ t propName }}` (translatable).
 * The optional `t ` prefix is metadata for the editor/propsSchema (it marks the
 * prop's value as a locale-object); the renderer binds both identically because
 * locale objects are already resolved to the active locale upstream (localize.ts)
 * before binding. Identifier only, optional inner whitespace.
 */
const SLOT_RE = /\{\{\s*(?:t\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Parse a component's propsSchema JSON into the set of declared prop names. */
function declaredProps(propsSchema: string | null | undefined): Set<string> {
  if (!propsSchema) return new Set();
  try {
    const parsed = JSON.parse(propsSchema);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Set();
    }
    return new Set(Object.keys(parsed as Record<string, unknown>));
  } catch {
    return new Set();
  }
}

/** Coerce a bound value to the string that replaces a slot. */
function slotString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Arrays/plain objects = a `json` prop's structured value. Serialize to JSON so
  // it can ride in a DOM attribute (e.g. `data-options='{{options}}'`) for the
  // component's CLIENT script to JSON.parse — the only channel a static-SSR script
  // has to receive instance data. React escapes it downstream (no injection).
  // Functions and anything that can't stringify still drop to "".
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Replace every `{{prop}}` slot in `text` using `values`, but only for props in
 * `declared`. An undeclared slot (or a declared prop the block didn't supply) →
 * "". The output is plain text; React escapes it downstream (no injection).
 */
function bindSlots(
  text: string,
  values: Record<string, unknown>,
  declared: Set<string>,
): string {
  return text.replace(SLOT_RE, (_m, name: string) =>
    declared.has(name) ? slotString(values[name]) : "",
  );
}

/** Recursively bind block props into one component tree node (returns a new node). */
function bindTree(
  node: TreeNode,
  values: Record<string, unknown>,
  declared: Set<string>,
): TreeNode {
  if (typeof node === "string") return bindSlots(node, values, declared);
  if (node == null || typeof node !== "object" || typeof node.tag !== "string") {
    return node;
  }
  const props = node.props;
  let boundProps = props;
  if (props && typeof props === "object") {
    boundProps = {};
    for (const [k, v] of Object.entries(props)) {
      boundProps[k] = typeof v === "string" ? bindSlots(v, values, declared) : v;
    }
  }
  return {
    tag: node.tag,
    ...(boundProps ? { props: boundProps } : {}),
    ...(node.children
      ? { children: node.children.map((c) => bindTree(c, values, declared)) }
      : {}),
  };
}

/**
 * Resolve a page's block tree against a component map into a render plan.
 *
 * - Each block's `component` name is looked up in `components`. An unknown
 *   component is rendered as a visible placeholder comment rather than
 *   throwing, so one bad block can't blank the whole page.
 * - Block `children` nest INSIDE the resolved component's rendered tree
 *   (appended as extra children of the component root), enabling layout
 *   blocks that wrap others. A component whose root is a text node can't host
 *   children, so children of such a block are dropped (with a placeholder).
 * - Each distinct used component contributes its `script` once, in first-use
 *   order (a component reused across blocks ships its script a single time).
 */
/**
 * Collect every distinct component name referenced anywhere in a block tree
 * (recursing into `children`). Pure — used by both the public route and the
 * draft-preview route to know which D1 component rows to fetch. The reserved
 * Section primitive is included if present; callers ignore it (it needs no row).
 */
export function collectComponentNames(blocks: Block[]): Set<string> {
  const into = new Set<string>();
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (b?.component) into.add(b.component);
      if (b?.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return into;
}

/**
 * Collect the distinct PascalCase component-tag references INSIDE a component's
 * element tree (composition-by-tag) — the names that the renderer will resolve
 * against the component map. Used by the route to transitively fetch nested
 * component rows that `collectComponentNames` (block-level only) can't see.
 * Pure — never throws (malformed nodes are skipped).
 */
export function collectTreeComponentTags(node: TreeNode, into: Set<string> = new Set()): Set<string> {
  if (typeof node !== "object" || node === null || typeof node.tag !== "string") {
    return into;
  }
  if (COMPONENT_TAG_RE.test(node.tag)) into.add(node.tag);
  for (const child of node.children ?? []) collectTreeComponentTags(child, into);
  return into;
}

export function planPage(
  blocks: Block[],
  components: Map<string, ComponentArtifact>,
  locale?: LocaleContext,
): RenderPlan {
  const scripts: string[] = [];
  const styles: string[] = [];
  const seenAssets = new Set<string>();

  // Ship a component's client script + scoped CSS once (first-use order). Shared
  // by top-level block components AND nested-by-tag components resolved in a tree.
  function collectScript(artifact: ComponentArtifact): void {
    if (seenAssets.has(artifact.name)) return;
    seenAssets.add(artifact.name);
    if (artifact.script) scripts.push(artifact.script);
    if (artifact.css) styles.push(artifact.css);
  }

  // Ship the built-in combobox-list script + CSS once, only if a combobox-mode
  // List is actually rendered (the List is a renderer primitive with no D1 row,
  // so its client behavior can't come from the component registry — it lives here).
  function useBuiltinComboboxAssets(): void {
    if (seenAssets.has(COMBOBOX_LIST_ASSET_KEY)) return;
    seenAssets.add(COMBOBOX_LIST_ASSET_KEY);
    scripts.push(COMBOBOX_LIST_SCRIPT);
    styles.push(COMBOBOX_LIST_CSS);
  }

  function planBlock(block: Block): ElementPlan {
    // A Section is a built-in layout container rendered as a CSS grid of
    // COLUMN children (the aicms Section→Columns model). No D1 lookup — it's a
    // renderer primitive. Component blocks live inside a column's children.
    if (block.component === SECTION_COMPONENT) {
      return planSection(block, planBlock);
    }
    // A column is the Section's grid cell — render as a flex column of its
    // children. Standalone (outside a Section) it degrades to the same div.
    if (block.component === SECTION_COLUMN_COMPONENT) {
      return planColumn(block, planBlock, "flex-start", "flex-start");
    }
    // A List repeats its TEMPLATE children once per fetched row (Slice B). The
    // rows were hydrated into `block.listRows` by buildPlanFromPage; planList
    // stamps + binds per row and delegates each stamped block back to planBlock.
    if (block.component === LIST_COMPONENT) {
      return planList(block, planBlock, useBuiltinComboboxAssets);
    }
    const artifact = components.get(block.component);
    if (!artifact) {
      return placeholder(`unknown component "${block.component}"`);
    }
    // Ship this component's script once.
    collectScript(artifact);

    // Bind the block's DECLARED props into the component tree's `{{prop}}` slots
    // before planning. Only props in the component's propsSchema bind; locale
    // objects in the supplied values resolve to the active locale first.
    let tree = artifact.tree;
    if (block.props && typeof block.props === "object") {
      const declared = declaredProps(artifact.propsSchema);
      if (declared.size > 0) {
        const values = locale
          ? (resolveLocalized(block.props, locale.locale, locale.fallback) as Record<
              string,
              unknown
            >)
          : block.props;
        tree = bindTree(tree, values, declared);
      }
    }

    // Pass the component map so a PascalCase tag inside this component's tree
    // resolves to another component (composition-by-tag), depth-guarded; nested
    // components ship their script via the shared collector.
    const el = planTree(tree, locale, { components, depth: 0, collectScript });
    const childPlans = (block.children ?? []).map(planBlock);
    if (childPlans.length === 0) return el;
    if (el.kind !== "element") {
      // Text-root component can't host children — surface it, don't silently drop.
      return placeholder(`component "${block.component}" cannot host children`);
    }
    return { ...el, children: [...el.children, ...childPlans] };
  }

  return { root: blocks.map(planBlock), scripts, styles };
}

// ── Built-in List → per-row stamp (Phase 2, Slice B) ─────────────────────────
//
// A List has a per-row TEMPLATE (its children that are NOT the empty-state slot)
// and an optional empty-state slot (a child with `listRole === "empty"`). The
// rows are in `block.listRows` (hydrated by buildPlanFromPage). For each row we
// CLONE the template blocks and inject the mapped fields (`listMap`) into each
// stamped block's `props` — `planBlock` then binds those into the template
// component's `{{slots}}`, GATED by the component's own declared props (the same
// allowlist the static path uses), so an unmapped/unknown prop can't leak in.
//
// GRACEFUL: no rows → the empty-state slot if present, else nothing. The List
// itself renders as a plain container `<div data-list>` wrapping the stamped rows
// (mirrors Section's `data-section` wrapper — a stable, style-free hook).

/**
 * Inject a row's mapped fields into a template block's props (recursively into
 * its children, so a nested template still receives the row's values). For each
 * `templatePropName → fieldName` in `map`, set `props[templatePropName] =
 * row[fieldName]` when the row actually HAS that field (graceful: a missing field
 * leaves the prop untouched, so an author's static default survives). PURE — a
 * NEW block tree; the originals are untouched. A bound row value OVERWRITES a
 * static prop (the row is the live source of truth, mirroring Slice A).
 */
function stampRow(
  block: Block,
  row: Record<string, unknown>,
  map: Record<string, string>,
): Block {
  const props: Record<string, unknown> = { ...(block.props ?? {}) };
  for (const [propName, fieldName] of Object.entries(map)) {
    if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
      props[propName] = row[fieldName];
    }
  }
  return {
    ...block,
    props,
    ...(block.children
      ? { children: block.children.map((c) => stampRow(c, row, map)) }
      : {}),
  };
}

function planList(
  block: Block,
  planBlock: (b: Block) => ElementPlan,
  useComboboxAssets?: () => void,
): ElementPlan {
  const children = block.children ?? [];
  const template = children.filter((c) => c.listRole !== "empty");
  const emptySlot = children.filter((c) => c.listRole === "empty");
  const rows = Array.isArray(block.listRows) ? block.listRows : [];
  const map = block.listMap ?? {};

  // Empty / dead / un-hydrated result → the empty-state slot if authored, else
  // nothing (an empty container). NEVER a throw — mirrors Section's graceful path.
  if (rows.length === 0) {
    return listWrapper(block, emptySlot.map(planBlock));
  }

  // Stamp the item component once PER ROW (the row's mapped fields bind into the
  // stamped component's declared props). This is shared by both presentations.
  const stampPlan = (row: Record<string, unknown>): ElementPlan[] =>
    template.map((t) => planBlock(stampRow(t, row, map)));

  // "combobox" presentation: wrap each stamped row in a selectable option element
  // carrying a STABLE value, and nest the lot in the combobox shell. The combobox
  // CLIENT script enhances these pre-stamped options (select/search/check/limits)
  // — it does NOT build the rows; the rows are real server-stamped CMS components.
  if (block.listSource?.presentation === "combobox") {
    useComboboxAssets?.();
    return planComboboxList(block, rows, stampPlan);
  }

  // Default: a flat list of stamped rows.
  return listWrapper(block, rows.flatMap(stampPlan));
}

/** The plain List wrapper — a stable, style-free hook (mirrors Section). */
function listWrapper(block: Block, children: ElementPlan[]): ElementPlan {
  return {
    kind: "element",
    tag: "div",
    props: { "data-list": block.id },
    children,
  };
}

/**
 * Resolve the per-row VALUE used as an option's stable identity. Authoring picks
 * the collection field via `listSource.valueField`; falls back to the row's `id`
 * (every content row has one), then to the row index handled by the caller.
 */
function rowValue(
  block: Block,
  row: Record<string, unknown>,
  index: number,
): string {
  const field = block.listSource?.valueField;
  const raw = field ? row[field] : row.id;
  return raw == null ? String(index) : String(raw);
}

/**
 * "combobox" List presentation — the List acts as a Combobox CONTAINER:
 *  - emits the combobox shell (trigger + summary + caret, and a panel with an
 *    optional search box + an options list + empty/hint slots),
 *  - stamps the chosen ITEM COMPONENT once per row as each option's BODY,
 *  - wraps each option in `<li data-cb-option data-cb-value="…">` carrying a
 *    combobox-owned check; the client `combobox-list` script (shipped as a normal
 *    component script via the registry) wires selection/search/min/max/single-
 *    multi over these PRE-STAMPED options. The author's item component is purely
 *    visual — it never knows about selection.
 *
 * Config rides on `listSource` (mode/min/max/search/sort already authored on the
 * List) so there is ONE authoring panel. Pure — no I/O.
 */
function planComboboxList(
  block: Block,
  rows: Array<Record<string, unknown>>,
  stampPlan: (row: Record<string, unknown>) => ElementPlan[],
): ElementPlan {
  const src = block.listSource ?? ({} as ListSource);
  const cfg = {
    multiple: src.select !== "single",
    min: src.min ?? 0,
    max: src.max ?? 0,
    searchable: src.searchable !== false,
    name: src.name ?? "selection",
    placeholder: src.placeholder ?? "Select…",
    searchPlaceholder: src.searchPlaceholder ?? "Search…",
  };

  const labelField = src.labelField;
  const options: ElementPlan[] = rows.map((row, i) => {
    const liProps: Record<string, unknown> = {
      "data-cb-option": "",
      "data-cb-value": rowValue(block, row, i),
      role: "option",
      "aria-selected": "false",
      className: "cb-opt",
    };
    // Chip label source, in precedence order the client applies: a resolved field
    // value (data-cb-label), and the whole row JSON for the optional client-side
    // label expression (data-cb-row). Absent both → the client falls back to the
    // option's flattened text content.
    if (labelField && row[labelField] != null) liProps["data-cb-label"] = String(row[labelField]);
    if (src.labelExpr) liProps["data-cb-row"] = JSON.stringify(row);
    return {
      kind: "element" as const,
      tag: "li",
      props: liProps,
      children: [
        { kind: "element" as const, tag: "div", props: { className: "cb-opt-body" }, children: stampPlan(row) },
        checkmarkPlan(),
      ],
    };
  });

  const panelChildren: ElementPlan[] = [];
  if (cfg.searchable) {
    panelChildren.push({
      kind: "element",
      tag: "div",
      props: { className: "cb-search-wrap", "data-cb-search-wrap": "" },
      children: [
        {
          kind: "element",
          tag: "input",
          props: { type: "text", "data-cb-search": "", className: "cb-search", placeholder: cfg.searchPlaceholder },
          children: [],
        },
      ],
    });
  }
  panelChildren.push({
    kind: "element",
    tag: "ul",
    props: { "data-cb-list": "", role: "listbox", className: "cb-list" },
    children: options,
  });
  panelChildren.push({
    kind: "element",
    tag: "div",
    props: { "data-cb-empty": "", className: "cb-empty cb-hidden" },
    children: [{ kind: "text", text: "No matches" }],
  });
  panelChildren.push({
    kind: "element",
    tag: "div",
    props: { "data-cb-hint": "", className: "cb-hint cb-hidden" },
    children: [],
  });

  const rootProps: Record<string, unknown> = {
    "data-list": block.id,
    "data-combobox-list": "",
    "data-cb-multiple": cfg.multiple ? "true" : "false",
    "data-cb-min": String(cfg.min),
    "data-cb-max": String(cfg.max),
    "data-cb-name": cfg.name,
    "data-cb-placeholder": cfg.placeholder,
    className: "cb-root",
  };
  // The optional client-side label expression (admin-authored, evaluated against
  // each option's row in the browser). Stamped as data only — never run here.
  // Normalize to a bare template-literal BODY (strip any stored backticks); the
  // client wraps it back in backticks before eval. Handles both new clean values
  // and legacy backtick-wrapped ones identically.
  const labelExpr = normalizeLabelExpr(src.labelExpr);
  if (labelExpr) rootProps["data-cb-label-expr"] = labelExpr;

  return {
    kind: "element",
    tag: "div",
    props: rootProps,
    children: [
      { kind: "element", tag: "input", props: { type: "hidden", "data-cb-value-input": "", name: cfg.name }, children: [] },
      {
        kind: "element",
        tag: "button",
        props: { type: "button", "data-cb-trigger": "", className: "cb-trigger" },
        children: [
          { kind: "element", tag: "span", props: { "data-cb-summary": "", className: "cb-summary" }, children: [{ kind: "text", text: cfg.placeholder }] },
          caretPlan(),
        ],
      },
      { kind: "element", tag: "div", props: { "data-cb-panel": "", className: "cb-panel cb-hidden" }, children: panelChildren },
    ],
  };
}

/** A combobox-owned selection checkmark (hidden until the option is selected). */
function checkmarkPlan(): ElementPlan {
  return {
    kind: "element",
    tag: "svg",
    props: { className: "cb-check", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
    children: [
      { kind: "element", tag: "path", props: { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M5 13l4 4L19 7" }, children: [] },
    ],
  };
}

/** The trigger's caret chevron. */
function caretPlan(): ElementPlan {
  return {
    kind: "element",
    tag: "svg",
    props: { "data-cb-caret": "", className: "cb-caret", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor" },
    children: [
      { kind: "element", tag: "path", props: { "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-width": "2", d: "M19 9l-7 7-7-7" }, children: [] },
    ],
  };
}

// ── Section → Columns layout (aicms model, ported to plain ElementPlan) ──────
//
// A Section's props (all optional, defaults in parens): columns(1),
// columnBehavior("equal"|"collapse"), verticalAlign(top|center|bottom),
// horizontalAlign(left|center|right), paddingTop/Right/Bottom/Left(0) with
// matching *Unit props (rem default — the operator picks rem/px per value),
// gap(16, px), maxWidth("1280px"|"full"), backgroundColor("transparent").
// The grid math mirrors aicms `BlockRenderer.tsx` SectionRenderer.

const ALIGN_ITEMS: Record<string, string> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};
const JUSTIFY: Record<string, string> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/**
 * Per-column MIN width below which `equal`-behavior columns auto-stack (wrap one
 * below the other) instead of crushing/overflowing on a narrow viewport. The
 * renderer emits INLINE styles which cannot hold `@media`, so responsiveness is
 * achieved with `repeat(auto-fit, minmax(min(100%, MIN), 1fr))`: each track is at
 * least MIN wide (but never wider than 100% on a phone), and `auto-fit` drops the
 * row to fewer columns — ultimately one — when MIN no longer fits. ~16rem (256px)
 * stacks 2-up around tablet and 1-up on phones. (Could later be a Section prop.)
 */
export const MIN_COLUMN_WIDTH = "16rem";

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}
/**
 * A padding value + unit (rem default). When `unit` is given (Section uses a SINGLE
 * shared `paddingUnit` for all four sides), it governs every side; otherwise each
 * side reads its own `padding<Side>Unit` (the per-column padding panel still does).
 */
function pad(
  p: Record<string, unknown>,
  side: "Top" | "Right" | "Bottom" | "Left",
  unit?: string,
): string {
  return `${num(p[`padding${side}`], 0)}${unit ?? str(p[`padding${side}Unit`], "rem")}`;
}
/** A margin value + its per-side unit (rem default). 0 → "0" (no unit churn). */
function mgn(p: Record<string, unknown>, side: "Top" | "Right" | "Bottom" | "Left"): string {
  return `${num(p[`margin${side}`], 0)}${str(p[`margin${side}Unit`], "rem")}`;
}

/**
 * Per-column cell style (epic: Column settings panel). A column carries its OWN
 * optional props that override the Section defaults for THIS column only:
 *   - verticalAlign(top|center|bottom) / horizontalAlign(left|center|right) —
 *     override the Section's column alignment; absent → inherit `sectionAlignItems`
 *     / `sectionJustify` passed by planSection.
 *   - padding{Top,Right,Bottom,Left} + per-side *Unit (rem default).
 *   - margin{Top,Right,Bottom,Left} + per-side *Unit (rem default).
 *   - gap (px) between the column's stacked components (the column is a flex
 *     column, so `gap` spaces its children vertically).
 *   - backgroundColor (theme token `var(--color-*)`; default transparent so dark
 *     mode works — resolved inline at render, like the Section background).
 * Absent props fall back to render defaults (no padding/margin/gap, transparent).
 * PURE — node-testable, no React.
 */
export function columnStyle(
  props: Record<string, unknown> | undefined,
  sectionAlignItems: string,
  sectionJustify: string,
): Record<string, string | number> {
  const p = props ?? {};
  const alignItems = p.verticalAlign != null ? (ALIGN_ITEMS[str(p.verticalAlign, "top")] ?? sectionAlignItems) : sectionAlignItems;
  const justifyContent = p.horizontalAlign != null ? (JUSTIFY[str(p.horizontalAlign, "left")] ?? sectionJustify) : sectionJustify;
  return {
    minWidth: 0,
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems,
    justifyContent,
    gap: `${num(p.gap, 0)}px`,
    paddingTop: pad(p, "Top"),
    paddingRight: pad(p, "Right"),
    paddingBottom: pad(p, "Bottom"),
    paddingLeft: pad(p, "Left"),
    marginTop: mgn(p, "Top"),
    marginRight: mgn(p, "Right"),
    marginBottom: mgn(p, "Bottom"),
    marginLeft: mgn(p, "Left"),
    backgroundColor: str(p.backgroundColor, "transparent"),
  };
}

function planSection(
  block: Block,
  planBlock: (b: Block) => ElementPlan,
): ElementPlan {
  const p = (block.props ?? {}) as Record<string, unknown>;
  const columns = num(p.columns, 1);
  const columnBehavior = str(p.columnBehavior, "equal");
  const gap = num(p.gap, 16);
  const maxWidth = str(p.maxWidth, "1280px");
  // ONE shared padding unit for all four sides (user decision 2026-06-19). MIGRATE
  // legacy per-side units: a saved page only had `padding<Side>Unit` — treat Top's
  // as the shared one (default rem) so old pages don't silently flip to rem.
  const paddingUnit = str(p.paddingUnit, str(p.paddingTopUnit, "rem"));
  const bgColor = str(p.backgroundColor, "transparent");
  const colJustify = JUSTIFY[str(p.horizontalAlign, "left")] ?? "flex-start";
  const colAlignItems = ALIGN_ITEMS[str(p.verticalAlign, "top")] ?? "flex-start";

  const cols = (block.children ?? []).filter(
    (c) => c.component === SECTION_COLUMN_COMPONENT,
  );
  // collapse → empty columns shrink to 0fr (explicit fixed N tracks, no wrap);
  // equal → responsive: auto-fit tracks that are ≥MIN wide but cap at 100% so a
  // narrow viewport drops columns one-below-the-other instead of overflowing.
  // A 1-column Section keeps a single full-width track either way.
  const gridCols =
    columnBehavior === "collapse"
      ? cols.map((c) => ((c.children?.length ?? 0) > 0 ? "1fr" : "0fr")).join(" ")
      : columns <= 1
        ? "1fr"
        : `repeat(auto-fit, minmax(min(100%, ${MIN_COLUMN_WIDTH}), 1fr))`;

  return {
    kind: "element",
    tag: "div",
    props: { "data-section": block.id, style: { backgroundColor: bgColor } },
    children: [
      {
        kind: "element",
        tag: "section",
        props: {
          style: {
            display: "grid",
            gridTemplateColumns: gridCols,
            gap: `${gap}px`,
            paddingTop: pad(p, "Top", paddingUnit),
            paddingRight: pad(p, "Right", paddingUnit),
            paddingBottom: pad(p, "Bottom", paddingUnit),
            paddingLeft: pad(p, "Left", paddingUnit),
            maxWidth: maxWidth === "full" ? "100%" : maxWidth,
            margin: "0 auto",
            overflow: "hidden",
          },
        },
        children: cols.map((c) => planColumn(c, planBlock, colAlignItems, colJustify)),
      },
    ],
  };
}

/**
 * Per-column visibility → responsive utility classes (epic: per-viewport column
 * visibility). A column carries optional boolean props `hideMobile`/`hideTablet`/
 * `hideDesktop` (default false = visible everywhere). Each truthy flag emits the
 * matching `pb-hide-*` class, whose `@media` rule (in `utility-css.ts`) sets
 * `display:none` only within that breakpoint band. Inline styles can't hold
 * `@media`, so visibility MUST be class-driven — that's why this returns classes,
 * not a `style`. Returns "" when fully visible (caller omits `className`). PURE.
 */
export function columnVisibilityClass(props: Record<string, unknown> | undefined): string {
  const p = props ?? {};
  const out: string[] = [];
  if (p.hideMobile) out.push("pb-hide-mobile");
  if (p.hideTablet) out.push("pb-hide-tablet");
  if (p.hideDesktop) out.push("pb-hide-desktop");
  return out.join(" ");
}

function planColumn(
  col: Block,
  planBlock: (b: Block) => ElementPlan,
  alignItems: string,
  justifyContent: string,
): ElementPlan {
  const hideClass = columnVisibilityClass(col.props);
  return {
    kind: "element",
    tag: "div",
    props: {
      "data-section-column": col.id,
      ...(hideClass ? { className: hideClass } : {}),
      style: columnStyle(col.props, alignItems, justifyContent),
    },
    children: (col.children ?? []).map(planBlock),
  };
}

function placeholder(message: string): ElementPlan {
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

/** Parse a JSON column defensively; returns `fallback` on bad/empty JSON. */
export function parseJsonColumn<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
