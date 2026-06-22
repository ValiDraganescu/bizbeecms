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
import { component as componentTable } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import {
  type Block,
  type ComponentArtifact,
  type LocaleContext,
  type RenderPlan,
  type TreeNode,
  SECTION_COMPONENT,
  SECTION_COLUMN_COMPONENT,
  collectComponentNames,
  collectTreeComponentTags,
  parseJsonColumn,
  planPage,
} from "@/lib/render/tree";
import { renderPlans } from "@/lib/render/react";
import { generateUtilityCss } from "@/lib/render/utility-css";
import { bindingQuerySpec, hydrateProps } from "@/lib/content/binding";
import { queryCollection } from "@/db/query-store";
import type { QuerySpec } from "@/lib/content/query-compiler";
import {
  getContentLocales,
  getThemeOverrides,
  getThemeOverridesDark,
} from "@/db/settings-store";
import { themeOverridesToCss } from "@/lib/render/theme";

// Precompiled once per worker instance — pure, deterministic, bounded vocabulary.
const UTILITY_CSS = generateUtilityCss();

/**
 * Build the render plan for an already-resolved page row. Shared by the public
 * route and the admin preview route — the caller decides which row (and whether
 * to enforce publish status); this does the identical block→plan walk.
 */
export async function buildPlanFromPage(
  pageRow: Page,
  blocksOverride?: string,
): Promise<{ plan: RenderPlan; locale: LocaleContext }> {
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
  pending.delete(SECTION_COLUMN_COMPONENT);
  for (let wave = 0; wave < MAX_FETCH_WAVES && pending.size > 0; wave++) {
    const want = [...pending].filter((n) => !components.has(n));
    if (want.length === 0) break;
    const rows = await db
      .select()
      .from(componentTable)
      .where(inArray(componentTable.name, want));
    const next = new Set<string>();
    for (const row of rows) {
      const tree = parseJsonColumn<TreeNode>(row.tree, "");
      components.set(row.name, {
        name: row.name,
        tree,
        script: row.script || undefined,
        propsSchema: row.propsSchema,
      });
      // Enqueue nested-component tags referenced inside this tree.
      for (const tag of collectTreeComponentTags(tree)) {
        if (!components.has(tag)) next.add(tag);
      }
    }
    pending = next;
  }

  const contentLocales = await getContentLocales();
  const requested = await getLocale();
  const locale: LocaleContext = {
    locale: contentLocales.locales.includes(requested)
      ? requested
      : contentLocales.default,
    fallback: contentLocales.default,
  };

  // Phase-2 binding (Slice A): hydrate single-item collection bindings INTO the
  // blocks' props BEFORE the pure walk. `planPage`/`planTree` stay pure+sync; all
  // the async D1 work (first-match query per binding) happens right here. Graceful:
  // any failed/empty query leaves the bound props blank (never throws / 500s).
  const hydratedBlocks = await hydrateBlockBindings(blocks);

  const plan = planPage(hydratedBlocks, components, locale);
  return { plan, locale };
}

/**
 * Walk the block tree, and for every block carrying a `bindings` map, run each
 * binding's FIRST-MATCH structured query (Slice-4 `queryCollection`, limit 1) and
 * hydrate the resolved field values into the block's `props` (mapped names). Pure
 * `hydrateProps` does the field→prop copy; this async shell only fetches the rows.
 * Returns a NEW block tree (the originals are untouched). GRACEFUL: a query error
 * or empty result → that binding resolves to no row → the prop stays blank.
 */
async function hydrateBlockBindings(blocks: Block[]): Promise<Block[]> {
  return Promise.all(
    blocks.map(async (block): Promise<Block> => {
      const children = block.children
        ? await hydrateBlockBindings(block.children)
        : block.children;

      if (!block.bindings || Object.keys(block.bindings).length === 0) {
        return children === block.children ? block : { ...block, children };
      }

      const rows: Record<string, Record<string, unknown> | null> = {};
      await Promise.all(
        Object.entries(block.bindings).map(async ([key, binding]) => {
          try {
            // The binding's filter `op` is loosely typed (string); the query
            // compiler whitelists ops at runtime (unknown op → 400 → graceful
            // blank here), so this cast is safe.
            const res = await queryCollection(
              binding.source.collection,
              bindingQuerySpec(binding) as QuerySpec,
            );
            rows[key] = res.ok ? (res.plan.items[0] ?? null) : null;
          } catch {
            rows[key] = null; // graceful: dead collection / runtime error → blank
          }
        }),
      );

      const props = hydrateProps(block.props, block.bindings, rows);
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
  } catch {
    /* unbound D1 in this env — no per-Site theme */
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: UTILITY_CSS }} />
      {themeCss && <style dangerouslySetInnerHTML={{ __html: themeCss }} />}
      {renderPlans(plan.root)}
      {plan.scripts.map((s, i) => (
        <script key={i} dangerouslySetInnerHTML={{ __html: s }} />
      ))}
    </>
  );
}
