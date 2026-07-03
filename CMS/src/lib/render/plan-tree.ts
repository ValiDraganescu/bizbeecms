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
import { resolveDynamicIconSlots, splitIconText } from "./icons.ts";
import {
  type TreeNode,
  type ElementPlan,
  type LocaleContext,
  type ComponentArtifact,
  placeholder,
} from "./plan-types.ts";

/**
 * Resolved icons for an `{{icon "name"}}` slot → the parsed SVG TreeNode to inline
 * (a real `<svg>` element subtree, NOT a string — a raw-SVG string in a text node
 * would be escaped and show as literal markup). The async render host
 * (buildPlanFromPage) fetches + caches + parses each referenced icon into this map
 * BEFORE the pure walk; the walk just looks names up. A name absent from the map
 * (unresolved / wrong set) renders as nothing. Pure data — no I/O in the walk.
 */
export type IconMap = Map<string, TreeNode>;

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
  /**
   * Resolved icons (name → parsed `<svg>` TreeNode) for `{{icon "name"}}` slots.
   * Supplied by the async render host. Absent = no icon support (slots render as
   * empty); present = a text node's icon slots expand into inline SVG elements.
   */
  icons?: IconMap;
  /**
   * Resolve a PascalCase tag that names a RENDERER BUILT-IN (e.g. LanguageSwitcher)
   * rather than a D1 component — returns its ElementPlan, or null if the tag isn't
   * a built-in. Supplied by `planPage` so a component tree can embed a built-in by
   * tag (`<LanguageSwitcher/>`); tried before the "unknown component" fallback.
   * Kept as a callback so this pure module doesn't import the built-in planners.
   */
  resolveBuiltinTag?: (tag: string) => ElementPlan | null;
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
/**
 * Expand a text node into ordered plans, turning each `{{icon "name"}}` slot into
 * an inline `<svg>` element (from `icons`) and keeping the surrounding text as
 * text nodes. No icons / no map → a single text node (the original fast path).
 * Returned as an array because one text string can yield text + svg + text.
 */
function planTextNode(text: string, icons?: IconMap): ElementPlan[] {
  if (!icons || icons.size === 0 || text.indexOf("{{") === -1) {
    return [{ kind: "text", text }];
  }
  const parts = splitIconText(text);
  if (parts.length === 1 && parts[0].kind === "text") {
    return [{ kind: "text", text: parts[0].text }];
  }
  const out: ElementPlan[] = [];
  for (const part of parts) {
    if (part.kind === "text") {
      if (part.text !== "") out.push({ kind: "text", text: part.text });
    } else {
      const svg = icons.get(part.name);
      // Unresolved icon → render nothing (the slot disappears). Resolved → walk
      // the parsed <svg> TreeNode into an element plan like any other node.
      if (svg != null) out.push(planTree(svg, undefined, undefined));
    }
  }
  return out.length > 0 ? out : [{ kind: "text", text: "" }];
}

/** Plan a node's children, flat-mapping text nodes that expand into icon SVGs.
 *  Empty text nodes are dropped — a slot that bound to "" (unset prop, dropped
 *  icon) leaves no DOM text rather than an empty node. */
function planChildren(
  children: TreeNode[] | undefined,
  locale: LocaleContext | undefined,
  compose: ComposeContext | undefined,
): ElementPlan[] {
  const out: ElementPlan[] = [];
  for (const c of children ?? []) {
    if (typeof c === "string") {
      for (const p of planTextNode(c, compose?.icons)) {
        if (p.kind === "text" && p.text === "") continue;
        out.push(p);
      }
    } else {
      out.push(planTree(c, locale, compose));
    }
  }
  return out;
}

export function planTree(
  node: TreeNode,
  locale?: LocaleContext,
  compose?: ComposeContext,
): ElementPlan {
  if (typeof node === "string") {
    // A bare string node at the top level: expand icons but return a single plan.
    // Multi-part expansion only matters as a CHILD (handled by planChildren); a
    // lone string root collapses to its first part (rare — roots are elements).
    const parts = planTextNode(node, compose?.icons);
    return parts[0] ?? { kind: "text", text: "" };
  }
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
    children: planChildren(node.children, locale, compose),
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
  // A built-in tag (e.g. LanguageSwitcher) resolves to its own planner, not a D1
  // component — try that first so a nav component can embed `<LanguageSwitcher/>`.
  const builtin = compose.resolveBuiltinTag?.(node.tag);
  if (builtin) return builtin;
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
    icons: compose.icons,
    resolveBuiltinTag: compose.resolveBuiltinTag,
  };
  const el = planTree(tree, locale, childCompose);
  const childPlans = planChildren(node.children, locale, compose);
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
export const SLOT_RE = /\{\{\s*(?:t\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

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

/**
 * Each declared prop's `default` from the propsSchema, keyed by prop name. Used as
 * the fallback when a page block hasn't set a value for a slot — so an unbound
 * slot renders its authored placeholder instead of an empty string (or, worse,
 * the literal `{{slot}}`). Props without a `default` are omitted.
 */
export function schemaDefaults(
  propsSchema: string | null | undefined,
): Record<string, unknown> {
  if (!propsSchema) return {};
  try {
    const parsed = JSON.parse(propsSchema);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, unknown> = {};
    for (const [name, spec] of Object.entries(parsed as Record<string, unknown>)) {
      if (spec && typeof spec === "object" && "default" in spec) {
        out[name] = (spec as { default: unknown }).default;
      }
      // A link prop's stored new-tab default (Develop toggle) cascades as the
      // companion `<name>NewTab` flag applyNewTab reads; block props overlay it.
      if (spec && typeof spec === "object" && (spec as { newTab?: unknown }).newTab === true) {
        out[`${name}NewTab`] = true;
      }
    }
    return out;
  } catch {
    return {};
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
  // First fold any DYNAMIC `{{icon propName}}` into the LITERAL `{{icon "name"}}`
  // form (using the prop's bound value), so the downstream icon walk only sees
  // literals. Then bind the ordinary `{{prop}}` / `{{t prop}}` slots. The icon
  // literal is left untouched by SLOT_RE (it requires quotes / a space), so it
  // survives to planTextNode where it becomes an inline <svg>.
  const withIcons = resolveDynamicIconSlots(text, values, declared);
  return withIcons.replace(SLOT_RE, (_m, name: string) =>
    declared.has(name) ? slotString(values[name]) : "",
  );
}

/** Which prop name does a raw href value reference as its sole slot, if any?
 *  `"{{ctaHref}}"` / `"{{t ctaHref}}"` → "ctaHref"; anything else (static, mixed
 *  text, multiple slots) → null. Only a lone slot is a clean binding to augment. */
function loneSlotProp(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^\{\{\s*(?:t\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/);
  return m ? m[1] : null;
}

/**
 * Auto-apply "open in new tab" to an anchor. If `node` is an `<a>` whose `href`
 * binds to a lone link prop `X` and the block set the companion `XNewTab` truthy,
 * return the anchor's props with `target="_blank" rel="noopener noreferrer"`
 * added. Otherwise return the props unchanged. This is what makes the editor's
 * new-tab toggle work on EXISTING components with no re-authoring: the component
 * just writes `<a href="{{X}}">` and the renderer adds target/rel from the flag.
 */
function applyNewTab(
  tag: string,
  props: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (tag !== "a" || props.target != null) return props; // author-set target wins
  const hrefProp = loneSlotProp(props.href);
  if (!hrefProp) return props;
  const flag = values[`${hrefProp}NewTab`];
  if (flag !== true && flag !== "true") return props;
  return { ...props, target: "_blank", rel: "noopener noreferrer" };
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
  // Add target/rel from a new-tab link flag BEFORE binding, while href still holds
  // the raw `{{prop}}` slot we match on (binding replaces it with the URL).
  const props = node.props ? applyNewTab(node.tag, node.props, values) : node.props;
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
