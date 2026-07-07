/**
 * Shared page-render core (page-builder Preview slice).
 *
 * The public route (`[[...slug]]/page.tsx`) and the admin draft-preview route
 * (`preview/[id]/page.tsx`) MUST render a page identically — true-to-site
 * preview means reusing the REAL renderer, not forking a second one. This
 * module owns the two shared steps so both routes call the same code:
 *
 *   1. `buildPlanFromPage(pageRow)` — page row → { plan, locale }. A pure-ish
 *      D1 read + the dep-free `planPage` walk. The ONLY difference between the
 *      public route and preview is WHICH page row is selected (published-leaf
 *      lookup vs. by-id, no publish gate) — that selection stays in each route;
 *      everything after it is shared here.
 *   2. `RenderedPage({ plan })` — the SSR'd `<style>` + tree + client scripts.
 *      Identical markup in both routes, so the preview iframe is pixel-true.
 */
import type { Page } from "@/db/schema";
import { getDb } from "@/db";
import { component as componentTable, page as pageTable } from "@/db/schema";
import { inArray } from "drizzle-orm";
import {
  createPathTranslator,
  pagePathsByLocale,
} from "@/lib/render/localize-paths";
import {
  ancestorChain,
  buildBreadcrumbData,
  type BreadcrumbItem,
} from "@/lib/render/breadcrumb";
import { resolveSiteOrigin } from "@/lib/render/site-origin";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { CONTENT_LOCALE_COOKIE } from "@/lib/render/plan-language-switcher";
import type { ContentLocales } from "@/lib/render/localize";
import {
  type Block,
  type ComponentArtifact,
  type LocaleContext,
  type RenderPlan,
  type TreeNode,
  SECTION_COMPONENT,
  SECTION_ROW_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  LIST_COMPONENT,
  FORM_COMPONENT,
  stampFormPageId,
  collectComponentNames,
  collectTreeComponentTags,
  collectPlanClasses,
  parseJsonColumn,
  planPage,
  type IconMap,
} from "@/lib/render/tree";
import { resolveLocalized } from "@/lib/render/localize";
import { scanIconSlots } from "@/lib/render/icons";
import { resolveIcons } from "@/db/icon-store";
import { getIconSet } from "@/db/settings-store";
import { renderPlans } from "@/lib/render/react";
import { ClientScripts } from "@/lib/render/client-scripts";
import { parseHtml } from "@/lib/render/parse-html";
import { linkNewTabProp, parsePropsSchema } from "@/lib/pages/page-blocks";
import { buildCss } from "@/lib/render/tw-compile";
import { viewportHideCss } from "@/lib/render/utility-css";
import { listGridCss } from "@/lib/render/plan-list";

// The custom non-Tailwind helpers, appended to the compiled sheet: per-viewport
// hide classes (pb-hide-*) + responsive grid-List column overrides (pb-list-grid).
const VIEWPORT_HIDE_CSS = viewportHideCss() + "\n" + listGridCss();
import { bindingQuerySpec, hydrateProps } from "@/lib/content/binding";
import { fetchApiBindingRow, fetchApiListRows } from "@/lib/data-sources/hydrate";
import { queryCollection } from "@/db/query-store";
import type { QuerySpec } from "@/lib/content/query-compiler";
import {
  resolveRouteFilters,
  resolveRouteValue,
  resolveRouteProps,
  hasResolvedRouteFilter,
  isUnresolvedSingleRouteFilter,
  EMPTY_ROUTE_CONTEXT,
  type RouteContext,
} from "@/lib/content/route-params";
import {
  getContentLocales,
  getThemeFonts,
  getThemeOverrides,
  getThemeOverridesDark,
} from "@/db/settings-store";
import { themeOverridesToCss } from "@/lib/render/theme";
import { themeFontsToCss } from "@/lib/render/fonts";

/**
 * Resolve the active content locale + the switchable set for a page render.
 *
 * PUBLIC renders pass `explicitLocale` — the locale peeled from the URL path
 * (path-locales-edge-cache Stage 1). The URL alone determines the response;
 * cookies must NOT influence it, or default-locale URLs become uncacheable at
 * the edge. When no explicit locale is given (admin PREVIEW / Develop routes),
 * the legacy `bb_content_locale` cookie path applies — NOT next-intl's
 * `getLocale`, which only knows the fixed admin set (EN/FI/ET) and would reject
 * arbitrary content codes like `ro-ro`. Falls back to the admin locale (if it
 * happens to be a content locale), then the Site default. `available` carries
 * each code + its endonym label (via `Intl.DisplayNames` in the locale's own
 * language) for the switcher's options.
 */
async function resolveContentLocaleContext(
  explicitLocale?: string,
): Promise<LocaleContext> {
  const contentLocales = await getContentLocales();

  if (explicitLocale && contentLocales.locales.includes(explicitLocale)) {
    return {
      locale: explicitLocale,
      fallback: contentLocales.default,
      available: buildAvailableLocales(contentLocales),
    };
  }

  const cookieValue = (await cookies()).get(CONTENT_LOCALE_COOKIE)?.value;
  const adminLocale = await getLocale();

  const active = contentLocales.locales.includes(cookieValue ?? "")
    ? (cookieValue as string)
    : contentLocales.locales.includes(adminLocale)
      ? adminLocale
      : contentLocales.default;

  return {
    locale: active,
    fallback: contentLocales.default,
    available: buildAvailableLocales(contentLocales),
  };
}

/** Each content locale → `{ code, label }`, label = endonym via Intl.DisplayNames. */
function buildAvailableLocales(
  contentLocales: ContentLocales,
): Array<{ code: string; label: string }> {
  return contentLocales.locales.map((code) => ({ code, label: localeLabel(code) }));
}

/** A locale code's human label in its OWN language (endonym), e.g. ro-ro → "Română".
 *  Names the LANGUAGE subtag only (drops the region, so "ro-ro" reads "Română",
 *  not "Română (România)"). Falls back to the uppercased code if Intl.DisplayNames
 *  can't name it (missing runtime / unknown code). */
function localeLabel(code: string): string {
  const lang = code.split("-")[0];
  try {
    const name = new Intl.DisplayNames([lang], { type: "language" }).of(lang);
    if (name && name.toLowerCase() !== lang.toLowerCase()) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  } catch {
    // Intl.DisplayNames missing/unknown code → fall through to the raw code.
  }
  return code.toUpperCase();
}

/**
 * A component D1 row's artifact fields — LIVE columns plus the pending-draft
 * copy. `pickArtifactCols` chooses which set to render.
 */
type ComponentArtifactRow = {
  html: string;
  script: string;
  css: string;
  propsSchema: string | null;
  hasDraft: boolean;
  draftHtml: string | null;
  draftScript: string | null;
  draftCss: string | null;
  draftPropsSchema: string | null;
};

/**
 * Pick which artifact (LIVE vs pending DRAFT) a render should use for one
 * component row. Public renders pass `preferDraft=false` (always live); preview
 * renders pass `true` so a component with `has_draft` shows its unpublished edit.
 * A row with no pending draft always yields the live artifact.
 */
function pickArtifactCols(
  row: ComponentArtifactRow,
  preferDraft: boolean,
): { html: string; script: string; css: string; propsSchema: string | null } {
  if (preferDraft && row.hasDraft) {
    return {
      html: row.draftHtml ?? "",
      script: row.draftScript ?? "",
      css: row.draftCss ?? "",
      propsSchema: row.draftPropsSchema,
    };
  }
  return { html: row.html, script: row.script, css: row.css, propsSchema: row.propsSchema };
}

/**
 * Build the render plan for an already-resolved page row. Shared by the public
 * route (live artifacts) and the admin preview route (draft artifacts, via
 * `preferDraft`) — the caller decides which row + whether to prefer component
 * drafts; this does the identical block→plan walk.
 */
export async function buildPlanFromPage(
  pageRow: Page,
  blocksOverride?: string,
  preferDraft = false,
  routeContext: RouteContext = EMPTY_ROUTE_CONTEXT,
  /** URL-derived content locale (public route). Absent → legacy cookie path (preview). */
  activeLocale?: string,
): Promise<{
  plan: RenderPlan;
  locale: LocaleContext;
  /**
   * True when a binding keyed off THIS request's route param/query (e.g. a
   * `:city-slug` page's hero doing `slug eq {param:"city-slug"}`) matched zero
   * rows — the route segment names something that doesn't exist. The public
   * route treats this as a 404; the preview route (no live route to validate
   * against) ignores it.
   */
  routeNotFound: boolean;
}> {
  const db = await getDb();
  // Versioning slice 2: the route resolves WHICH version's blocks to render
  // (published for public, draft-else-published for preview) and passes the
  // JSON string here; absent → the legacy `page.blocks` column (unchanged
  // behavior for callers that don't version yet).
  const blocks = parseJsonColumn<Block[]>(blocksOverride ?? pageRow.blocks, []);

  const components = new Map<string, ComponentArtifact>();

  // Fetch component rows in waves: block-referenced names first, then any
  // PascalCase component-tags those trees reference (composition-by-tag), and so
  // on transitively. Bounded by MAX_FETCH_WAVES so a cyclic/huge graph can't loop
  // forever (the renderer's own depth guard handles cycles at render time too).
  const MAX_FETCH_WAVES = 16;
  let pending = collectComponentNames(blocks);
  pending.delete(SECTION_COMPONENT);
  pending.delete(SECTION_ROW_COMPONENT);
  pending.delete(SECTION_COLUMN_COMPONENT);
  pending.delete(LIST_COMPONENT);
  pending.delete(FORM_COMPONENT);
  for (let wave = 0; wave < MAX_FETCH_WAVES && pending.size > 0; wave++) {
    const want = [...pending].filter((n) => !components.has(n));
    if (want.length === 0) break;
    const rows = await db
      .select()
      .from(componentTable)
      .where(inArray(componentTable.name, want));
    const next = new Set<string>();
    for (const row of rows) {
      const art = pickArtifactCols(row, preferDraft);
      const tree = parseHtml(art.html);
      components.set(row.name, {
        name: row.name,
        tree,
        script: art.script || undefined,
        css: art.css || undefined,
        propsSchema: art.propsSchema,
      });
      // Enqueue nested-component tags referenced inside this tree.
      for (const tag of collectTreeComponentTags(tree)) {
        if (!components.has(tag)) next.add(tag);
      }
    }
    pending = next;
  }

  const locale = await resolveContentLocaleContext(activeLocale);

  // Stage-2 localized slugs: build the default-path → locale-path translator
  // (internal hrefs are authored in default-locale slugs; a per-locale slug
  // override 404s the prefix-only rewrite) plus the rendered page's own path
  // in every locale for the LanguageSwitcher. One small full-table read per
  // render; best-effort — any failure keeps the prefix-only behavior.
  let breadcrumbRows:
    | Array<{
        id: string;
        slug: string;
        parentPageId: string | null;
        localizedSlugs: string | null;
        metaTitle: string;
      }>
    | null = null;
  try {
    const pageRows = await db
      .select({
        id: pageTable.id,
        slug: pageTable.slug,
        parentPageId: pageTable.parentPageId,
        localizedSlugs: pageTable.localizedSlugs,
        metaTitle: pageTable.metaTitle,
      })
      .from(pageTable);
    breadcrumbRows = pageRows;
    locale.translatePath = createPathTranslator(pageRows, locale.fallback);
    locale.pagePaths = pagePathsByLocale(
      pageRows,
      pageRow.id,
      routeContext.params,
      locale.fallback,
      (locale.available ?? []).map((l) => l.code),
      locale.translatePath,
    );
  } catch {
    /* unbound D1 / read failure — links fall back to prefix-only rewriting */
  }

  // Phase-2 binding (Slice A): hydrate single-item collection bindings INTO the
  // blocks' props BEFORE the pure walk. `planPage`/`planTree` stay pure+sync; all
  // the async D1 work (first-match query per binding) happens right here. Graceful:
  // any failed/empty query leaves the bound props blank (never throws / 500s).
  // external-data-sources Slice 3: api-kind bindings hydrate at the SAME seam
  // (locale is passed so `{placeholder}` params can read localized block props).
  // Form slice: stamp the hosting page's id onto Form blocks so planForm can
  // emit the hidden identity input the submit endpoint resolves the target from.
  // No-op (same array back) on pages without a Form.
  const routeMiss = { hit: false };
  const hydratedBlocks = await hydrateBlockBindings(
    stampFormPageId(blocks, pageRow.id),
    locale,
    routeContext,
    routeMiss,
  );

  // Icon-sets epic: resolve every `{{icon "name"}}` / `{{icon prop}}` referenced
  // on this page into inline SVG BEFORE the pure walk (same hydrate-before-walk
  // seam as collection bindings). The walk then inlines the cached SVG; a network
  // hit happens only on an icon's first-ever render. Failures are non-fatal — an
  // unresolved icon simply renders nothing.
  const icons = await resolvePageIcons(hydratedBlocks, components, locale);

  const plan = planPage(hydratedBlocks, components, locale, icons);

  // Auto BreadcrumbList JSON-LD (seo-robots): built from the ancestor chain of
  // the rendered page — per-locale meta titles + the reverse-resolved localized
  // path of each ancestor (both visitor-independent stored data, so it's safe on
  // the edge-cached (site) render path). Emitted only for pages at depth ≥ 1;
  // best-effort — any gap (missing title/path, unbound D1) drops the whole trail.
  if (breadcrumbRows) {
    const jsonLd = await buildPageBreadcrumb(
      breadcrumbRows,
      pageRow.id,
      routeContext.params,
      locale,
    );
    if (jsonLd) plan.jsonLd = [jsonLd];
  }

  return { plan, locale, routeNotFound: routeMiss.hit };
}

/** A page row carrying the columns the breadcrumb build needs. */
type BreadcrumbRow = {
  id: string;
  slug: string;
  parentPageId: string | null;
  localizedSlugs: string | null;
  metaTitle: string;
};

/**
 * Build the auto BreadcrumbList JSON-LD `<script>` for the rendered page, or
 * null when there's nothing to emit (root/top-level page, or an incomplete
 * chain). Resolves each ancestor's per-locale meta title + its localized path
 * (via pagePathsByLocale, active-locale entry) and absolutizes the paths against
 * the site origin (Google prefers absolute `item` URLs; falls back to the
 * root-relative path when the origin is unknown, e.g. local dev). Pure assembly
 * lives in breadcrumb.ts; this shell only reads stored data + the origin.
 */
async function buildPageBreadcrumb(
  rows: BreadcrumbRow[],
  pageId: string,
  params: Record<string, string>,
  locale: LocaleContext,
): Promise<string | null> {
  const chain = ancestorChain(rows, pageId);
  if (!chain || chain.length < 2) return null; // depth 0 → no breadcrumb

  const translate =
    locale.translatePath ?? createPathTranslator(rows, locale.fallback);
  const codes = [locale.locale];
  let origin = "";
  try {
    origin = (await resolveSiteOrigin()) ?? "";
  } catch {
    /* unknown origin → root-relative item URLs (local dev) */
  }
  const abs = (path: string) =>
    origin ? origin.replace(/\/$/, "") + path : path;

  const items: BreadcrumbItem[] = [];
  for (const node of chain) {
    const title = resolveLocalized(
      parseJsonColumn<unknown>(
        rows.find((r) => r.id === node.id)?.metaTitle ?? "",
        {},
      ),
      locale.locale,
      locale.fallback,
    );
    const paths = pagePathsByLocale(
      rows,
      node.id,
      params,
      locale.fallback,
      codes,
      translate,
    );
    const path = paths?.[locale.locale];
    items.push({
      name: typeof title === "string" ? title : "",
      url: path ? abs(path) : "",
    });
  }
  return buildBreadcrumbData(items);
}

/**
 * Build the page's icon map (name → parsed `<svg>` TreeNode). Scans every used
 * component tree for literal `{{icon "x"}}` slots and dynamic `{{icon prop}}`
 * slots; for the dynamic ones, gathers the icon-name values from the blocks'
 * props (locale-resolved). Resolves the union against the Site's selected set via
 * the cached `resolveIcons`, then parses each SVG string into a TreeNode the pure
 * walk can inline. Never throws — returns an empty map on any failure.
 */
async function resolvePageIcons(
  blocks: Block[],
  components: Map<string, ComponentArtifact>,
  locale: LocaleContext,
): Promise<IconMap> {
  const empty: IconMap = new Map();
  try {
    const names = new Set<string>();
    // Per component: literal names + which props are icon-dynamic.
    const dynamicPropsByComponent = new Map<string, Set<string>>();
    for (const [name, artifact] of components) {
      const dyn = new Set<string>();
      walkTreeText(artifact.tree, (t) => scanIconSlots(t, names, dyn));
      if (dyn.size > 0) dynamicPropsByComponent.set(name, dyn);
    }
    // Per block: the value of each icon-dynamic prop is a candidate icon name.
    const walkBlocks = (bs: Block[]): void => {
      for (const b of bs) {
        const dyn = dynamicPropsByComponent.get(b.component);
        if (dyn && b.props && typeof b.props === "object") {
          for (const prop of dyn) {
            const resolved = resolveLocalized(
              (b.props as Record<string, unknown>)[prop],
              locale.locale,
              locale.fallback,
            );
            if (typeof resolved === "string" && resolved !== "") names.add(resolved);
          }
        }
        if (b.children) walkBlocks(b.children);
      }
    };
    walkBlocks(blocks);

    if (names.size === 0) return empty;

    const set = await getIconSet();
    const svgByName = await resolveIcons(set, names);
    const map: IconMap = new Map();
    for (const [iconName, svg] of svgByName) {
      if (svg) map.set(iconName, parseHtml(svg));
    }
    return map;
  } catch {
    return empty;
  }
}

/** Walk every text-node string in a component tree, invoking `fn` on each. */
function walkTreeText(node: TreeNode, fn: (text: string) => void): void {
  if (typeof node === "string") {
    fn(node);
    return;
  }
  if (node == null || typeof node !== "object") return;
  // Slots can also live inside string PROP values (e.g. aria-label="{{icon x}}").
  if (node.props && typeof node.props === "object") {
    for (const v of Object.values(node.props)) if (typeof v === "string") fn(v);
  }
  for (const c of node.children ?? []) walkTreeText(c, fn);
}

/**
 * Build a render plan for ONE component in isolation — the Develop-page preview.
 *
 * There's no page block to feed the component's `{{slots}}`, so we synthesize a
 * single block whose props are the component's PLACEHOLDER data: each declared
 * prop's `default` from its `propsSchema` (the AI fills these with realistic
 * sample values when authoring). Then we reuse the EXACT page renderer
 * (`planPage`) so the preview is pixel-true to how the component renders on a
 * real page — nested-component tags, script collection, locale resolution and all.
 *
 * Returns null if no such component exists (the route 404s).
 */
export async function buildPlanFromComponent(
  name: string,
): Promise<{ plan: RenderPlan; locale: LocaleContext } | null> {
  const db = await getDb();

  const components = new Map<string, ComponentArtifact>();
  const MAX_FETCH_WAVES = 16;
  let pending = new Set<string>([name]);
  let rootRow: { propsSchema: string | null } | null = null;
  for (let wave = 0; wave < MAX_FETCH_WAVES && pending.size > 0; wave++) {
    const want = [...pending].filter((n) => !components.has(n));
    if (want.length === 0) break;
    const rows = await db
      .select()
      .from(componentTable)
      .where(inArray(componentTable.name, want));
    const next = new Set<string>();
    for (const row of rows) {
      // Develop preview shows the DRAFT artifact (that's what you're editing) —
      // prefer draft columns when the row has a pending draft. The placeholder
      // props also come from the DRAFT propsSchema so the preview matches.
      const art = pickArtifactCols(row, true);
      if (row.name === name) rootRow = { propsSchema: art.propsSchema };
      const tree = parseHtml(art.html);
      components.set(row.name, {
        name: row.name,
        tree,
        script: art.script || undefined,
        css: art.css || undefined,
        propsSchema: art.propsSchema,
      });
      for (const tag of collectTreeComponentTags(tree)) {
        if (!components.has(tag)) next.add(tag);
      }
    }
    pending = next;
  }
  if (!rootRow) return null;

  const locale = await resolveContentLocaleContext();

  // Placeholder data: each declared prop's `default` becomes the block prop value
  // bound into the matching `{{slot}}`. parsePropsSchema carries the typed default
  // (defaultValue) for number/boolean and the string default for text/select.
  const props: Record<string, unknown> = {};
  for (const field of parsePropsSchema(rootRow.propsSchema)) {
    props[field.name] = field.defaultValue ?? field.default;
    // Link props: expand the stored new-tab default into the companion
    // `<name>NewTab` prop the renderer's {{target}} helper reads.
    if (field.newTab) props[linkNewTabProp(field.name)] = true;
  }

  const block: Block = { id: "preview", component: name, props };
  // Resolve any {{icon}} slots this component (or its nested deps) references, so
  // the Develop preview shows real glyphs just like the live page.
  const icons = await resolvePageIcons([block], components, locale);
  const plan = planPage([block], components, locale, icons);
  return { plan, locale };
}

/**
 * Walk the block tree, and for every block carrying a `bindings` map, run each
 * binding's FIRST-MATCH structured query (Slice-4 `queryCollection`, limit 1) and
 * hydrate the resolved field values into the block's `props` (mapped names). Pure
 * `hydrateProps` does the field→prop copy; this async shell only fetches the rows.
 * Returns a NEW block tree (the originals are untouched). GRACEFUL: a query error
 * or empty result → that binding resolves to no row → the prop stays blank.
 *
 * external-data-sources Slice 3: bindings are SOURCE-AGNOSTIC — an api-kind
 * source (`kind === "api"`) hydrates via the central fetch engine instead of a
 * collection query. Api rows arrive pre-flattened by their dot-paths, so the
 * SAME `hydrateProps`/`planList` stamping consumes either kind unchanged.
 */
async function hydrateBlockBindings(
  blocks: Block[],
  locale: LocaleContext,
  routeContext: RouteContext = EMPTY_ROUTE_CONTEXT,
  routeMiss?: { hit: boolean },
): Promise<Block[]> {
  return Promise.all(
    blocks.map(async (block): Promise<Block> => {
      const children = block.children
        ? await hydrateBlockBindings(block.children, locale, routeContext, routeMiss)
        : block.children;

      // api-kind List: fetch + map via the central engine (cached, retried,
      // graceful). Rows are flattened by dot-path so planList stamps them with
      // the ordinary `listMap` lookup.
      if (block.component === LIST_COMPONENT && block.listSource?.kind === "api") {
        const listRows = await fetchApiListRows(
          block.listSource,
          block.listMap,
          block.props,
          locale.locale,
          locale.fallback,
        );
        return { ...block, children, listRows };
      }

      // List block (Slice B): fetch the per-row query and stash the rows onto
      // `listRows` for the pure `planList` to stamp. Same hydrate-before-walk
      // seam as single-item bindings. GRACEFUL: a dead collection / query error /
      // missing source → no rows → the List's empty-state slot (or nothing).
      if (block.component === LIST_COMPONENT && block.listSource?.collection) {
        const src = block.listSource;
        const collection = block.listSource.collection;
        let listRows: Array<Record<string, unknown>> = [];
        try {
          const search = resolveRouteValue(src.search, routeContext);
          const res = await queryCollection(collection, {
            filters: resolveRouteFilters(src.filter, routeContext),
            sort: src.sort,
            limit: src.limit,
            search: typeof search === "string" ? search : undefined,
          } as QuerySpec);
          if (res.ok) listRows = res.plan.items;
        } catch {
          listRows = []; // graceful: dead collection / runtime error → empty
        }
        return { ...block, children, listRows };
      }

      if (!block.bindings || Object.keys(block.bindings).length === 0) {
        const routedProps = resolveRouteProps(block.props, routeContext);
        if (children === block.children && routedProps === block.props) return block;
        return { ...block, children, ...(routedProps ? { props: routedProps } : {}) };
      }

      const rows: Record<string, Record<string, unknown> | null> = {};
      await Promise.all(
        Object.entries(block.bindings).map(async ([key, binding]) => {
          // api-kind binding: central fetch → first item → flat dot-path row.
          if (binding.source?.kind === "api") {
            rows[key] = await fetchApiBindingRow(
              binding.source,
              binding.map,
              block.props,
              locale.locale,
              locale.fallback,
            );
            return;
          }
          if (!binding.source?.collection) {
            rows[key] = null; // graceful: malformed binding → blank
            return;
          }
          try {
            // The binding's filter `op` is loosely typed (string); the query
            // compiler whitelists ops at runtime (unknown op → 400 → graceful
            // blank here), so this cast is safe.
            const spec = bindingQuerySpec(binding);
            // A single-item binding whose ONLY filter is a route ref that
            // didn't resolve this request (e.g. `/book` with no
            // `?restaurant=`) must NOT run unfiltered — that would return
            // whatever row sorts first and render it as if it were selected.
            // Skip the query entirely so the component keeps its static
            // schema default (see `hydrateProps`: `row == null` → prop stays
            // untouched). Distinct from `hasResolvedRouteFilter`, which
            // detects the OPPOSITE case (a ref that DID resolve but matched
            // zero rows → 404).
            if (isUnresolvedSingleRouteFilter(spec.filters, routeContext)) {
              rows[key] = null;
              return;
            }
            const res = await queryCollection(binding.source.collection, {
              ...spec,
              filters: resolveRouteFilters(spec.filters, routeContext),
            } as QuerySpec);
            const row = res.ok ? (res.plan.items[0] ?? null) : null;
            rows[key] = row;
            // A binding keyed off the CURRENT route (e.g. `:city-slug`'s hero
            // looking up `slug eq {param:"city-slug"}`) that matches ZERO rows
            // means the route segment itself doesn't exist (a bad city/offer/
            // restaurant slug) — the page must 404, not silently render the
            // component's static defaults (which looks like real, wrong
            // content; see BACKLOG "unmatched wildcard slugs render WRONG
            // content"). An ordinary author-set filter with no route ref still
            // gets the old graceful blank-prop behavior.
            if (row == null && routeMiss && hasResolvedRouteFilter(spec.filters, routeContext)) {
              routeMiss.hit = true;
            }
          } catch {
            rows[key] = null; // graceful: dead collection / runtime error → blank
          }
        }),
      );

      const props = resolveRouteProps(hydrateProps(block.props, block.bindings, rows), routeContext);
      return { ...block, props, children };
    }),
  );
}

/**
 * The shared rendered document body — precompiled utility sheet, per-Site theme
 * overrides, the SSR'd component tree, and the AI-authored client scripts.
 * Identical markup for public + preview so the iframe is true-to-site.
 */
export async function RenderedPage({ plan }: { plan: RenderPlan }) {
  let themeCss = "";
  try {
    themeCss = themeOverridesToCss(
      await getThemeOverrides(),
      await getThemeOverridesDark(),
    );
    // Theme fonts (@font-face + --font-<slot> vars + body/heading defaults)
    // ride the same <style>, after the compiled utilities so the vars win over
    // tw-compile's registered system-stack placeholders.
    themeCss += themeFontsToCss(await getThemeFonts());
  } catch {
    /* unbound D1 in this env — no per-Site theme */
  }

  // Compile exactly the Tailwind this page uses (cached per class-set). Replaces
  // the old bounded hand-written sheet — full Tailwind, variants + arbitrary
  // values, generated in-Worker. Purpose colors resolve to var(--color-*).
  const classes = collectPlanClasses(plan.root);
  const utilityCss = (await buildCss(classes)) + "\n" + VIEWPORT_HIDE_CSS;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: utilityCss }} />
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      {/* Component-scoped CSS (one per used component) after utilities/theme so it
          can layer on top. Needed for nodes a client script builds at runtime,
          whose classes never reach the Tailwind compiler. */}
      {plan.styles.map((css, i) => (
        <style key={`c${i}`} dangerouslySetInnerHTML={{ __html: css }} />
      ))}
      {renderPlans(plan.root)}
      {/* Structured-data scripts (seo-robots auto BreadcrumbList). Unlike author
          client scripts, these are inert JSON-LD (`type="application/ld+json"`,
          never executed) so a React-rendered inline <script> is exactly right —
          crawlers read the DOM text. Built from visitor-independent stored data. */}
      {(plan.jsonLd ?? []).map((json, i) => (
        <script
          key={`ld${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: json }}
        />
      ))}
      {/* Author scripts must run via a client effect — a React-rendered inline
          <script> is inert (never executes). See client-scripts.tsx. */}
      <ClientScripts scripts={plan.scripts} />
    </>
  );
}
