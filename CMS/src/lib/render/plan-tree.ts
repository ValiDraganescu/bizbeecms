/**
 * Component element-tree → ElementPlan walk + block-prop `{{slot}}` binding.
 *
 * The core data-walk: turn a component's JSON `tree` (tag/props/children) into a
 * normalized `ElementPlan`, resolving PascalCase component tags against the
 * component map (composition-by-tag) and substituting `{{prop}}` slots from a
 * block's declared props. Split out of `tree.ts` (which re-exports it). PURE —
 * no React, no I/O (a DATA WALK, never eval/Function — blocked on Workers).
 */

import { resolveLocalized } from "./localize.ts";
import {
  type TreeNode,
  type ElementPlan,
  type LocaleContext,
  type ComponentArtifact,
  placeholder,
} from "./plan-types.ts";

/**
 * A `tag` that names ANOTHER component (composition-by-tag): a PascalCase
 * identifier. Same shape `enumerateComponentDeps`/`validateComponentArtifact`
 * treat as a component reference, so the renderer, the dep-warning, and the
 * artifact gate all agree on what's a component vs a plain HTML element.
 */
export const COMPONENT_TAG_RE = /^[A-Z][A-Za-z0-9_-]{0,63}$/;

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
export type ComposeContext = {
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
export function declaredProps(propsSchema: string | null | undefined): Set<string> {
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
export function bindTree(
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
