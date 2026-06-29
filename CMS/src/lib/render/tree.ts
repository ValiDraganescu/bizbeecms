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
 *
 * `planPage` (below) is the only function that wires the four concerns together;
 * the concerns themselves live in sibling modules and are RE-EXPORTED here so the
 * `render/tree` import path stays the single public surface:
 *  - `plan-types.ts`   — block/plan TYPES + reserved built-in names + coercers.
 *  - `plan-tree.ts`    — component element-tree walk + `{{slot}}` prop binding.
 *  - `plan-section.ts` — Section→Columns layout + per-block width wrapper.
 *  - `plan-list.ts`    — built-in List stamping + combobox presentation.
 */

import {
  COMBOBOX_LIST_ASSET_KEY,
  COMBOBOX_LIST_SCRIPT,
  COMBOBOX_LIST_CSS,
} from "./combobox-list-asset.ts";
import {
  type Block,
  type ComponentArtifact,
  type ElementPlan,
  type LocaleContext,
  type RenderPlan,
  SECTION_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
  placeholder,
} from "./plan-types.ts";
import { planTree, declaredProps, bindTree } from "./plan-tree.ts";
import { planSection, planColumn } from "./plan-section.ts";
import { planList } from "./plan-list.ts";
import { resolveLocalized } from "./localize.ts";

// Re-export the full public surface so `@/lib/render/tree` stays the one import
// path the renderer, editor, chat tools, and tests already use.
export {
  // types + reserved names + helpers
  type TreeNode,
  type BindingRef,
  type ListSource,
  type Block,
  type ComponentArtifact,
  type ElementPlan,
  type RenderPlan,
  type LocaleContext,
  SECTION_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
  BUILTIN_COMPONENTS,
  isBuiltinComponent,
  placeholder,
} from "./plan-types.ts";
export { planTree } from "./plan-tree.ts";
export {
  columnStyle,
  columnVisibilityClass,
  wrapBlockWidth,
  planSection,
  planColumn,
  MIN_COLUMN_WIDTH,
} from "./plan-section.ts";
export { normalizeLabelExpr } from "./plan-list.ts";

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
export function collectTreeComponentTags(
  node: import("./plan-types.ts").TreeNode,
  into: Set<string> = new Set(),
): Set<string> {
  if (typeof node !== "object" || node === null || typeof node.tag !== "string") {
    return into;
  }
  if (/^[A-Z][A-Za-z0-9_-]{0,63}$/.test(node.tag)) into.add(node.tag);
  for (const child of node.children ?? []) collectTreeComponentTags(child, into);
  return into;
}

/**
 * Resolve a page's block tree against a component map into a render plan.
 *
 * - Each block's `component` name is looked up in `components`. An unknown
 *   component is rendered as a (hidden) placeholder rather than throwing, so one
 *   bad block can't blank the whole page.
 * - Block `children` nest INSIDE the resolved component's rendered tree
 *   (appended as extra children of the component root), enabling layout
 *   blocks that wrap others. A component whose root is a text node can't host
 *   children, so children of such a block are dropped (with a placeholder).
 * - Each distinct used component contributes its `script` once, in first-use
 *   order (a component reused across blocks ships its script a single time).
 */
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

/** Parse a JSON column defensively; returns `fallback` on bad/empty JSON. */
export function parseJsonColumn<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
