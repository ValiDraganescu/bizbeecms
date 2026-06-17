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
export function planPage(
  blocks: Block[],
  components: Map<string, ComponentArtifact>,
  locale?: LocaleContext,
): RenderPlan {
  const scripts: string[] = [];
  const seenScripts = new Set<string>();

  function planBlock(block: Block): ElementPlan {
    const artifact = components.get(block.component);
    if (!artifact) {
      return placeholder(`unknown component "${block.component}"`);
    }
    // Ship this component's script once.
    if (artifact.script && !seenScripts.has(artifact.name)) {
      seenScripts.add(artifact.name);
      scripts.push(artifact.script);
    }

    const el = planTree(artifact.tree, locale);
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
