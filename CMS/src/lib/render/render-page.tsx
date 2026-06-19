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
import { getContentLocales, getThemeOverrides } from "@/db/settings-store";
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
): Promise<{ plan: RenderPlan; locale: LocaleContext }> {
  const db = await getDb();
  const blocks = parseJsonColumn<Block[]>(pageRow.blocks, []);

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

  const plan = planPage(blocks, components, locale);
  return { plan, locale };
}

/**
 * The shared rendered document body — precompiled utility sheet, per-Site theme
 * overrides, the SSR'd component tree, and the AI-authored client scripts.
 * Identical markup for public + preview so the iframe is true-to-site.
 */
export async function RenderedPage({ plan }: { plan: RenderPlan }) {
  let themeCss = "";
  try {
    themeCss = themeOverridesToCss(await getThemeOverrides());
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
