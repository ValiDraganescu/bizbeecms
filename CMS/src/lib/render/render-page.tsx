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
  collectComponentNames,
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

  const names = collectComponentNames(blocks);

  const components = new Map<string, ComponentArtifact>();
  if (names.size > 0) {
    const rows = await db
      .select()
      .from(componentTable)
      .where(inArray(componentTable.name, [...names]));
    for (const row of rows) {
      components.set(row.name, {
        name: row.name,
        tree: parseJsonColumn<TreeNode>(row.tree, ""),
        script: row.script || undefined,
        propsSchema: row.propsSchema,
      });
    }
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
