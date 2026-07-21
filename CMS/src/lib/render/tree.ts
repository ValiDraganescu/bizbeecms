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
  SECTION_ROW_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
  FORM_COMPONENT,
  LANGUAGE_SWITCHER_COMPONENT,
  GUEST_CHAT_COMPONENT,
  placeholder,
} from "./plan-types.ts";
import { planTree, declaredProps, schemaDefaults, bindTree, type IconMap } from "./plan-tree.ts";
import { buildJsonLdComponent, bindJsonLdObject, buildItemListJsonLd } from "./jsonld-component.ts";
import { planSection, planColumn, planRow } from "./plan-section.ts";
import { planList, LIST_AUTOSCROLL_ASSET_KEY, LIST_AUTOSCROLL_SCRIPT } from "./plan-list.ts";
import { planForm, FORM_ENHANCE_ASSET_KEY, FORM_ENHANCE_SCRIPT } from "./plan-form.ts";
import {
  planLanguageSwitcher,
  LANGUAGE_SWITCHER_SCRIPT,
  LANGUAGE_SWITCHER_ASSET_KEY,
} from "./plan-language-switcher.ts";
import {
  planGuestChat,
  GUEST_CHAT_SCRIPT,
  GUEST_CHAT_CSS,
  GUEST_CHAT_ASSET_KEY,
} from "./plan-guest-chat.ts";
import { resolveLocalized } from "./localize.ts";
import { localizePlanLinks } from "./localize-links.ts";
import { applyImageHygiene } from "./image-hygiene.ts";

// Re-export the full public surface so `@/lib/render/tree` stays the one import
// path the renderer, editor, chat tools, and tests already use.
export {
  // types + reserved names + helpers
  type TreeNode,
  type BindingRef,
  type ApiBindingParams,
  type ListSource,
  type FormTarget,
  type Block,
  type ComponentArtifact,
  type ElementPlan,
  type RenderPlan,
  type LocaleContext,
  SECTION_COMPONENT,
  SECTION_ROW_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
  FORM_COMPONENT,
  LANGUAGE_SWITCHER_COMPONENT,
  GUEST_CHAT_COMPONENT,
  BUILTIN_COMPONENTS,
  isBuiltinComponent,
  placeholder,
} from "./plan-types.ts";
export { planTree, type IconMap } from "./plan-tree.ts";
export { stampFormPageId, stampBuiltinPageIds, FORM_SUBMIT_PATH } from "./plan-form.ts";
export {
  planGuestChat,
  PUBLIC_CHAT_PATH,
  GUEST_CHAT_ASSET_KEY,
} from "./plan-guest-chat.ts";
export {
  columnStyle,
  columnVisibilityClass,
  wrapBlockWidth,
  planSection,
  planColumn,
  planRow,
  MIN_COLUMN_WIDTH,
} from "./plan-section.ts";
export { normalizeLabelExpr } from "./plan-list.ts";
export {
  planLanguageSwitcher,
  CONTENT_LOCALE_COOKIE,
} from "./plan-language-switcher.ts";

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
  icons?: IconMap,
): RenderPlan {
  const scripts: string[] = [];
  const styles: string[] = [];
  const jsonLd: string[] = [];
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

  // Ship the List auto-scroll client script once, only if an auto-scrolling List
  // renders (needs no CSS — the wrapper carries inline layout styles).
  function useListAutoscrollAssets(): void {
    if (seenAssets.has(LIST_AUTOSCROLL_ASSET_KEY)) return;
    seenAssets.add(LIST_AUTOSCROLL_ASSET_KEY);
    scripts.push(LIST_AUTOSCROLL_SCRIPT);
  }

  // Ship the Form progressive-enhancement script once, only if a targeted Form
  // renders (the native form-data POST works without it — this adds fetch/JSON
  // inline status handling on top).
  function useFormAssets(): void {
    if (seenAssets.has(FORM_ENHANCE_ASSET_KEY)) return;
    seenAssets.add(FORM_ENHANCE_ASSET_KEY);
    scripts.push(FORM_ENHANCE_SCRIPT);
  }

  // Ship the LanguageSwitcher client script once, only if a switcher renders.
  function useLanguageSwitcherAssets(): void {
    if (seenAssets.has(LANGUAGE_SWITCHER_ASSET_KEY)) return;
    seenAssets.add(LANGUAGE_SWITCHER_ASSET_KEY);
    scripts.push(LANGUAGE_SWITCHER_SCRIPT);
  }

  // Ship the GuestChat client script + CSS once, only if a hydrated (published)
  // GuestChat shell renders. The inert preview placeholder doesn't call this.
  function useGuestChatAssets(): void {
    if (seenAssets.has(GUEST_CHAT_ASSET_KEY)) return;
    seenAssets.add(GUEST_CHAT_ASSET_KEY);
    scripts.push(GUEST_CHAT_SCRIPT);
    styles.push(GUEST_CHAT_CSS);
  }

  // Resolve a PascalCase tag naming a renderer built-in (used inside component
  // trees via composition-by-tag). Only LanguageSwitcher is embeddable this way;
  // Section/Row/Column/List are page-block layout primitives, not tags.
  function resolveBuiltinTag(tag: string): ElementPlan | null {
    if (tag === LANGUAGE_SWITCHER_COMPONENT) {
      return planLanguageSwitcher(locale, useLanguageSwitcherAssets);
    }
    return null;
  }

  // Merge a jsonld component's schema defaults under the given props and resolve any
  // locale objects to the active locale — the value map fed to the JSON template.
  // Shared by the single-instance jsonld branch and the List ItemList aggregator so
  // both bind identically.
  function jsonLdValues(
    artifact: ComponentArtifact,
    props: unknown,
  ): Record<string, unknown> {
    const merged = {
      ...schemaDefaults(artifact.propsSchema),
      ...(props && typeof props === "object" ? props : {}),
    };
    return locale
      ? (resolveLocalized(merged, locale.locale, locale.fallback) as Record<string, unknown>)
      : merged;
  }

  // ItemList aggregator handed to planList: for each jsonld-kind template child,
  // build ONE schema.org ItemList over the rows (each row's mapped fields stamped
  // onto the child's props, then bound to its JSON template) and push it onto
  // plan.jsonLd. Returns the jsonld component names handled so planList drops them
  // from per-row visible stamping (they'd otherwise re-emit per-row scripts).
  function emitItemList(
    template: Block[],
    rows: Array<Record<string, unknown>>,
    map: Record<string, string>,
  ): string[] {
    const handled: string[] = [];
    for (const child of template) {
      const artifact = components.get(child.component);
      if (!artifact || artifact.kind !== "jsonld") continue;
      const items = rows.map((row) => {
        // Stamp the row's mapped fields onto the child's props (same rule as
        // stampRow: a present field overwrites; missing leaves the author default).
        const props: Record<string, unknown> = {
          ...(child.props && typeof child.props === "object" ? child.props : {}),
        };
        for (const [propName, fieldName] of Object.entries(map)) {
          if (Object.prototype.hasOwnProperty.call(row, fieldName)) {
            props[propName] = row[fieldName];
          }
        }
        return bindJsonLdObject(
          artifact.jsonTemplate ?? "",
          jsonLdValues(artifact, props),
          artifact.propsSchema,
        );
      });
      const payload = buildItemListJsonLd(items);
      if (payload) jsonLd.push(payload);
      handled.push(child.component);
    }
    return handled;
  }

  function planBlock(block: Block): ElementPlan {
    // A Section is a built-in layout container rendered as a CSS grid of
    // COLUMN children (the aicms Section→Columns model). No D1 lookup — it's a
    // renderer primitive. Component blocks live inside a column's children.
    if (block.component === SECTION_COMPONENT) {
      return planSection(block, planBlock);
    }
    // A row is the Section's horizontal band — its own grid of columns. Rendered
    // via planSection's row path; a standalone row (outside a Section) degrades to
    // a single-row grid of whatever columns it holds.
    if (block.component === SECTION_ROW_COMPONENT) {
      return planRow(block, planBlock);
    }
    // A column is a row's grid cell — render as a flex column of its children.
    // Standalone (outside a row) it degrades to the same div.
    if (block.component === SECTION_COLUMN_COMPONENT) {
      return planColumn(block, planBlock, "flex-start", "flex-start");
    }
    // A List repeats its TEMPLATE children once per fetched row (Slice B). The
    // rows were hydrated into `block.listRows` by buildPlanFromPage; planList
    // stamps + binds per row and delegates each stamped block back to planBlock.
    if (block.component === LIST_COMPONENT) {
      return planList(
        block,
        planBlock,
        useBuiltinComboboxAssets,
        useListAutoscrollAssets,
        emitItemList,
      );
    }
    // A Form wraps its children in a real <form> posting to the Worker's submit
    // endpoint (external-data-sources Form slice). The page id was stamped onto
    // the block by buildPlanFromPage (stampFormPageId); un-targeted Forms render
    // as a plain container.
    if (block.component === FORM_COMPONENT) {
      return planForm(block, planBlock, useFormAssets);
    }
    // The built-in LanguageSwitcher renders a <select> of the Site's content
    // locales (from `locale.available`); its one client script sets the locale
    // cookie + reloads. Also reachable inside a component tree via composition-
    // by-tag (`<LanguageSwitcher/>`) — handled in planTree, which shares this host.
    if (block.component === LANGUAGE_SWITCHER_COMPONENT) {
      return planLanguageSwitcher(locale, useLanguageSwitcherAssets);
    }
    // A GuestChat renders a chat shell whose one client script POSTs the
    // transcript to the public-chat endpoint (external chatbots epic). The page
    // id was stamped onto the block by buildPlanFromPage (stampBuiltinPageIds);
    // un-stamped (preview) GuestChats render an inert placeholder (no script).
    if (block.component === GUEST_CHAT_COMPONENT) {
      return planGuestChat(block, useGuestChatAssets);
    }
    const artifact = components.get(block.component);
    if (!artifact) {
      return placeholder(`unknown component "${block.component}"`);
    }

    // JSON-LD component (seo-robots): renders structured data, NOT visible HTML.
    // Bind the block's declared props (locale-resolved) into its JSON template,
    // build the escaped ld+json payload, and stash it onto plan.jsonLd. The block
    // itself renders a hidden placeholder so it still occupies its slot (and the
    // builder canvas can show a chip). A broken template/interpolation → null → no
    // script emitted (and a hidden marker naming the skip).
    if (artifact.kind === "jsonld") {
      const values = jsonLdValues(artifact, block.props);
      const payload = buildJsonLdComponent(
        artifact.jsonTemplate ?? "",
        values,
        artifact.propsSchema,
      );
      if (payload) jsonLd.push(payload);
      return placeholder(
        payload
          ? `jsonld component "${block.component}"`
          : `jsonld component "${block.component}" produced no valid JSON`,
      );
    }

    // Ship this component's script once.
    collectScript(artifact);

    // Bind the block's DECLARED props into the component tree's `{{prop}}` slots
    // before planning. Only props in the component's propsSchema bind; locale
    // objects in the supplied values resolve to the active locale first.
    // Always bind so an unset prop falls back to its schema `default` (the
    // authored placeholder) rather than rendering the raw `{{slot}}`. Block
    // values overlay the defaults; locale objects resolve to the active locale.
    let tree = artifact.tree;
    const declared = declaredProps(artifact.propsSchema);
    if (declared.size > 0) {
      const blockProps =
        block.props && typeof block.props === "object" ? block.props : {};
      const merged = { ...schemaDefaults(artifact.propsSchema), ...blockProps };
      const values = locale
        ? (resolveLocalized(merged, locale.locale, locale.fallback) as Record<
            string,
            unknown
          >)
        : merged;
      tree = bindTree(tree, values, declared);
    }

    // Pass the component map so a PascalCase tag inside this component's tree
    // resolves to another component (composition-by-tag), depth-guarded; nested
    // components ship their script via the shared collector.
    const el = planTree(tree, locale, {
      components,
      depth: 0,
      collectScript,
      icons,
      resolveBuiltinTag,
    });
    const childPlans = (block.children ?? []).map(planBlock);
    if (childPlans.length === 0) return el;
    if (el.kind !== "element") {
      // Text-root component can't host children — surface it, don't silently drop.
      return placeholder(`component "${block.component}" cannot host children`);
    }
    return { ...el, children: [...el.children, ...childPlans] };
  }

  // Tag each TOP-LEVEL block so the Page Builder's preview overlay can outline +
  // click-select it. Sections already self-tag (`data-section` inside planSection);
  // every other top-level block (SectionHeading, a standalone component, a List)
  // gets a thin id-only wrapper. Column children are tagged separately by
  // `wrapBlockWidth`. A plain block-flow div (not `display:contents`) so the
  // overlay's hover/selected OUTLINE has a real box to paint — these blocks lay
  // out the same wrapped (they're already block-level in the page's vertical flow).
  function planTopBlock(block: Block): ElementPlan {
    const el = planBlock(block);
    if (block.component === SECTION_COMPONENT) return el; // already data-section
    return {
      kind: "element",
      tag: "div",
      props: { "data-block-wrap": block.id },
      children: [el],
    };
  }

  // Stage-1 locale-prefix routing: on a non-default-locale render, rewrite every
  // internal href in the finished plan to carry the locale prefix (pure post-pass;
  // identity no-op on default-locale renders). See localize-links.ts.
  // Core-Web-Vitals image hygiene: lazy/decoding + CLS aspect-ratio as a pure
  // post-pass over the finished plan (skips the first/LCP image). See
  // image-hygiene.ts. Runs after locale link-rewriting; order is irrelevant
  // (they touch disjoint props) but keeps both post-passes side-by-side.
  const root = applyImageHygiene(blocks.map(planTopBlock));
  return {
    root: locale ? localizePlanLinks(root, locale) : root,
    scripts,
    styles,
    // JSON-LD from jsonld-kind component blocks (first-seen order). The render host
    // (buildPlanFromPage) may APPEND auto data (e.g. BreadcrumbList) to this array.
    ...(jsonLd.length > 0 ? { jsonLd } : {}),
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
