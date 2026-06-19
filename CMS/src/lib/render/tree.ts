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

// ── Component element tree (what `component.tree` holds, parsed) ─────────────
export type TreeNode =
  | string
  | {
      tag: string;
      props?: Record<string, unknown>;
      children?: TreeNode[];
    };

// ── Page block instances (what `page.blocks` holds, parsed) ──────────────────
export type Block = {
  id: string;
  // References a `component.name`.
  component: string;
  props?: Record<string, unknown>;
  children?: Block[];
};

// A component artifact as stored (the fields the renderer needs).
export type ComponentArtifact = {
  name: string;
  tree: TreeNode;
  script?: string;
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
};

/**
 * Optional content-locale context (epic C1). When present, every prop value
 * that is a "locale object" ({ en: "...", fi: "..." }, at any depth) is
 * resolved to the active locale (fallback → default → first present) as the
 * tree is walked. Absent = no resolution (props pass through verbatim).
 */
export type LocaleContext = { locale: string; fallback: string };

/** Walk one component element tree into element plans. */
export function planTree(node: TreeNode, locale?: LocaleContext): ElementPlan {
  if (typeof node === "string") return { kind: "text", text: node };
  if (node == null || typeof node !== "object" || typeof node.tag !== "string") {
    throw new Error(`Invalid tree node: ${JSON.stringify(node)}`);
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
    children: (node.children ?? []).map((c) => planTree(c, locale)),
  };
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

/** Slot syntax: `{{ propName }}` — identifier only, optional inner whitespace. */
const SLOT_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

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
  // Objects/arrays/functions are not valid slot content — drop to "".
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

export function planPage(
  blocks: Block[],
  components: Map<string, ComponentArtifact>,
  locale?: LocaleContext,
): RenderPlan {
  const scripts: string[] = [];
  const seenScripts = new Set<string>();

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
    const artifact = components.get(block.component);
    if (!artifact) {
      return placeholder(`unknown component "${block.component}"`);
    }
    // Ship this component's script once.
    if (artifact.script && !seenScripts.has(artifact.name)) {
      seenScripts.add(artifact.name);
      scripts.push(artifact.script);
    }

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

    const el = planTree(tree, locale);
    const childPlans = (block.children ?? []).map(planBlock);
    if (childPlans.length === 0) return el;
    if (el.kind !== "element") {
      // Text-root component can't host children — surface it, don't silently drop.
      return placeholder(`component "${block.component}" cannot host children`);
    }
    return { ...el, children: [...el.children, ...childPlans] };
  }

  return { root: blocks.map(planBlock), scripts };
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

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}
/** A padding value + its per-side unit (rem default). */
function pad(p: Record<string, unknown>, side: "Top" | "Right" | "Bottom" | "Left"): string {
  return `${num(p[`padding${side}`], 0)}${str(p[`padding${side}Unit`], "rem")}`;
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
  const bgColor = str(p.backgroundColor, "transparent");
  const colJustify = JUSTIFY[str(p.horizontalAlign, "left")] ?? "flex-start";
  const colAlignItems = ALIGN_ITEMS[str(p.verticalAlign, "top")] ?? "flex-start";

  const cols = (block.children ?? []).filter(
    (c) => c.component === SECTION_COLUMN_COMPONENT,
  );
  // collapse → empty columns shrink to 0fr; equal → N equal tracks.
  const gridCols =
    columnBehavior === "collapse"
      ? cols.map((c) => ((c.children?.length ?? 0) > 0 ? "1fr" : "0fr")).join(" ")
      : `repeat(${columns}, 1fr)`;

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
            paddingTop: pad(p, "Top"),
            paddingRight: pad(p, "Right"),
            paddingBottom: pad(p, "Bottom"),
            paddingLeft: pad(p, "Left"),
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

function planColumn(
  col: Block,
  planBlock: (b: Block) => ElementPlan,
  alignItems: string,
  justifyContent: string,
): ElementPlan {
  return {
    kind: "element",
    tag: "div",
    props: {
      "data-section-column": col.id,
      style: {
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems,
        justifyContent,
      },
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
