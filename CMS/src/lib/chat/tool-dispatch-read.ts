/**
 * Read/audit tool handlers (split from `tool-dispatch.ts`): list/get pages,
 * components, assets, locales, brand, theme, icons, SEO audits, and the
 * authoring guide. Registered in the shared HANDLERS map in `tool-dispatch.ts`.
 */
import { DEFAULT_ASSET_LIMIT, MAX_ASSET_LIMIT, formatAssetList } from "./list-assets-tool";
import { coercePageArgs, pagedResult } from "./paging";
import {
  coerceIdArg,
  coerceGuideArg,
  formatComponentList,
  formatPageList,
} from "./read-tools";
import { builtinBlockTypes } from "./write-tools";
import { assembleSystemPrompt } from "./assemble-prompt";
import { listComponents, getComponentByName } from "@/db/component-store";
import { listPages, listPagesForAudit, getPageById } from "@/db/page-store";
import { auditSeo, buildComponentSeoIndex } from "@/lib/render/seo-audit";
import {
  getContentLocales,
  getSiteIdentity,
  getThemeFonts,
  getThemeOverrides,
  getThemeOverridesDark,
  getIconSet,
} from "@/db/settings-store";
import { searchIcons } from "@/db/icon-store";
import { listAssets } from "@/db/asset-store";
import type { TreeNode } from "@/lib/render/tree";
import { treeToHtml } from "@/lib/render/parse-html";
import { effectiveTheme } from "@/lib/render/theme";
import { FONT_SLOTS } from "@/lib/render/fonts";
import { getDraftBlocks } from "./tool-dispatch-shared";

export async function handleAuditMeta(): Promise<Record<string, unknown>> {
  try {
    const [pages, locales] = await Promise.all([listPagesForAudit(), getContentLocales()]);
    const report = auditSeo(pages, locales);
    // Only the meta gaps matter for this tool; each finding names page + locale.
    const findings = report.missingMeta.map((m) => ({
      slug: m.slug,
      locale: m.locale,
      missing: m.missing,
    }));
    return {
      ok: true,
      total: findings.length,
      findings,
      ...(findings.length === 0
        ? { note: "No published page is missing a meta title or description." }
        : {}),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to audit meta: ${(err as Error).message}`] };
  }
}

export async function handleAuditAlt(): Promise<Record<string, unknown>> {
  try {
    // Deep-scan: fold in component-internal <img> markup (index built like the
    // admin SEO-audit page) so images inside reusable components are caught too.
    const [pages, locales, components] = await Promise.all([
      listPagesForAudit(),
      getContentLocales(),
      listComponents().catch(() => [] as Awaited<ReturnType<typeof listComponents>>),
    ]);
    const report = auditSeo(pages, locales, buildComponentSeoIndex(components));
    // De-dup by page slug + src (a component reused on N blocks can repeat).
    const seen = new Set<string>();
    const findings: Array<{ slug: string; src: string }> = [];
    for (const m of report.missingAlt) {
      const key = `${m.slug} ${m.src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ slug: m.slug, src: m.src });
    }
    return {
      ok: true,
      total: findings.length,
      findings,
      ...(findings.length === 0
        ? { note: "No published-page image is missing alt text." }
        : {
            hint:
              "For each finding: open the page (get_page) — if the image is a " +
              "block prop, patch its alt with set_block_props; if it's inside a " +
              "component (get_component shows an <img> with no alt=), fix it with " +
              "update_component. Write concise, descriptive alt per image.",
          }),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to audit alt: ${(err as Error).message}`] };
  }
}

export async function handleListAssets(args: unknown): Promise<Record<string, unknown>> {
  try {
    const rows = await listAssets();
    return pagedResult(
      "assets",
      formatAssetList(rows),
      coercePageArgs(args, DEFAULT_ASSET_LIMIT, MAX_ASSET_LIMIT),
    );
  } catch (err) {
    return { ok: false, errors: [`failed to list assets: ${(err as Error).message}`] };
  }
}

export async function handleListComponents(args: unknown): Promise<Record<string, unknown>> {
  try {
    return pagedResult("components", formatComponentList(await listComponents()), coercePageArgs(args));
  } catch (err) {
    return { ok: false, errors: [`failed to list components: ${(err as Error).message}`] };
  }
}

export async function handleGetComponent(args: unknown): Promise<Record<string, unknown>> {
  const compName = coerceIdArg(args, "name");
  if (!compName) return { ok: false, errors: ["name is required"] };
  try {
    // preferDraft: the model reads (and then re-edits) the pending DRAFT so
    // iterating doesn't clobber an unpublished edit with a live-based rewrite.
    const row = await getComponentByName(compName, true);
    if (!row) return { ok: false, errors: [`no component named "${compName}"`] };
    // The model authors in Handlebars-HTML; show it the markup as `html`, not the
    // internal JSON tree (the row carries `tree` as a JSON string for storage).
    let html = "";
    try {
      html = treeToHtml(JSON.parse(row.tree as string) as TreeNode);
    } catch {
      /* corrupt stored markup → empty; update_component will re-author it */
    }
    return {
      ok: true,
      component: {
        name: row.name,
        html,
        script: row.script,
        css: row.css,
        propsSchema: row.propsSchema,
        tags: row.tags,
      },
    };
  } catch (err) {
    return { ok: false, errors: [`failed to get component: ${(err as Error).message}`] };
  }
}

export async function handleListPages(args: unknown): Promise<Record<string, unknown>> {
  try {
    return pagedResult("pages", formatPageList(await listPages()), coercePageArgs(args));
  } catch (err) {
    return { ok: false, errors: [`failed to list pages: ${(err as Error).message}`] };
  }
}

export async function handleGetPage(args: unknown): Promise<Record<string, unknown>> {
  const id = coerceIdArg(args, "id");
  if (!id) return { ok: false, errors: ["id is required"] };
  try {
    const page = await getPageById(id);
    if (!page) return { ok: false, errors: [`no page with id "${id}"`] };
    // Include the DRAFT block tree (what the editor/canvas show + the AI edits):
    // each block's component + props, so the model sees what's rendered and with
    // which values. NOT the components' html/js/css — those are implementation.
    const draft = await getDraftBlocks(id);
    return { ok: true, page, blocks: draft?.blocks ?? [] };
  } catch (err) {
    return { ok: false, errors: [`failed to get page: ${(err as Error).message}`] };
  }
}

export async function handleListLocales(): Promise<Record<string, unknown>> {
  try {
    return { ok: true, locales: await getContentLocales() };
  } catch (err) {
    return { ok: false, errors: [`failed to list locales: ${(err as Error).message}`] };
  }
}

export async function handleGetBrandIdentity(): Promise<Record<string, unknown>> {
  try {
    return { ok: true, identity: await getSiteIdentity() };
  } catch (err) {
    return { ok: false, errors: [`failed to get brand identity: ${(err as Error).message}`] };
  }
}

export async function handleSearchIcons(args: unknown): Promise<Record<string, unknown>> {
  const query = coerceIdArg(args, "query");
  if (!query) return { ok: false, errors: ["search_icons needs a non-empty `query`"] };
  const rawLimit =
    typeof args === "object" && args !== null
      ? (args as Record<string, unknown>).limit
      : undefined;
  const limit = typeof rawLimit === "number" && rawLimit > 0 ? Math.min(100, rawLimit) : 48;
  try {
    const set = await getIconSet();
    const names = await searchIcons(set, query, limit);
    // Return the set so the model knows which library these names resolve against.
    return { ok: true, set, icons: names };
  } catch (err) {
    return { ok: false, errors: [`failed to search icons: ${(err as Error).message}`] };
  }
}

export async function handleGetTheme(): Promise<Record<string, unknown>> {
  try {
    const [light, dark, fonts] = await Promise.all([
      getThemeOverrides(),
      getThemeOverridesDark(),
      getThemeFonts(),
    ]);
    // Return the EFFECTIVE theme (defaults + overrides) so the model sees the
    // real color of every token — an empty override map is the DEFAULT theme,
    // not "no theme". `overrides` keeps the diff for when it wants to know what
    // the operator explicitly changed.
    return {
      ok: true,
      theme: {
        light: effectiveTheme(light, false),
        dark: effectiveTheme(dark, true),
      },
      overrides: { light, dark },
      // Font SLOTS (theme-fonts): which family backs font-body / font-heading /
      // font-accent. Unset slot = system default. Read-only here — families
      // are picked in Theme settings (the save self-hosts the files).
      fonts: Object.fromEntries(
        FONT_SLOTS.map((s) => [s, fonts.slots[s]?.family ?? null]),
      ),
    };
  } catch (err) {
    return { ok: false, errors: [`failed to get theme: ${(err as Error).message}`] };
  }
}

export async function handleListBuiltinTypes(): Promise<Record<string, unknown>> {
  return { ok: true, builtins: builtinBlockTypes() };
}

/** Return the built-in authoring guide (full system prompt) for the chosen context. */
export async function handleGetAuthoringGuide(args: unknown): Promise<Record<string, unknown>> {
  const guide = coerceGuideArg(args);
  try {
    return { ok: true, guide, prompt: await assembleSystemPrompt(guide) };
  } catch (err) {
    return { ok: false, errors: [`failed to assemble authoring guide: ${(err as Error).message}`] };
  }
}
