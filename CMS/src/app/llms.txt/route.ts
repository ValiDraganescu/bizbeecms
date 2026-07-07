/**
 * Public /llms.txt (seo-robots goal — AI-crawler surface, per llmstxt.org).
 *
 * A curated Markdown index for LLM crawlers: brand identity as the header, then
 * the published-page tree in the site DEFAULT content locale, each entry
 * linking to that page's `.md` variant (markdown-page-variants task) with its
 * meta description as the note. One entry per page (default locale) — llms.txt
 * is a curated index, not a full URL enumeration like the sitemap.
 *
 * MUST be dynamic — reads per-request D1 (same trap sitemap.ts/robots.txt hit).
 * `/llms.txt` is a dotted-root file → already excluded by the worker
 * edge-cache dot gate (no per-route exclusion needed).
 *
 * Requires a known public origin (resolveSiteOrigin) — `.md` links must be
 * absolute; an unknown origin (local dev) yields an empty body rather than
 * wrong hosts (mirrors sitemap.ts).
 */
import { getDb } from "@/db";
import { page as pageTable } from "@/db/schema";
import {
  getContentLocales,
  getSiteIdentity,
  getLlmsTemplate,
} from "@/db/settings-store";
import { publishedPagePaths } from "@/lib/render/sitemap-paths";
import { pathForLocale } from "@/lib/render/hreflang";
import { createPathTranslator } from "@/lib/render/localize-paths";
import { resolveLocalized } from "@/lib/render/localize";
import { parseJsonColumn } from "@/lib/render/tree";
import { resolveSiteOrigin } from "@/lib/render/site-origin";
import {
  buildLlmsTxt,
  buildLlmsPageList,
  type LlmsPageEntry,
} from "@/lib/render/llms-txt";
import {
  renderLlmsTemplate,
  type LlmsTemplateVars,
} from "@/lib/render/llms-template";

export const dynamic = "force-dynamic";

/** `/about` → `/about.md`; the root `/` stays `/` (no `.md` for home). */
function mdPath(path: string): string {
  return path === "/" ? "/" : `${path}.md`;
}

export async function GET(): Promise<Response> {
  const [origin, identity, template] = await Promise.all([
    resolveSiteOrigin(),
    getSiteIdentity(),
    getLlmsTemplate(),
  ]);
  const empty = () =>
    new Response(buildLlmsTxt({ name: identity.brandName }, []), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  if (!origin) return empty();

  const db = await getDb();
  const [rows, contentLocales] = await Promise.all([
    db
      .select({
        id: pageTable.id,
        slug: pageTable.slug,
        parentPageId: pageTable.parentPageId,
        localizedSlugs: pageTable.localizedSlugs,
        publishStatus: pageTable.publishStatus,
        noindex: pageTable.noindex,
        updatedAt: pageTable.updatedAt,
        metaTitle: pageTable.metaTitle,
        metaDescription: pageTable.metaDescription,
      })
      .from(pageTable),
    getContentLocales(db),
  ]);

  const def = contentLocales.default;
  const translate = createPathTranslator(rows, def);
  const meta = new Map(rows.map((r) => [r.id, r]));

  // resolveLocalized on an EMPTY {} map returns the object (not a string), so
  // coerce to a trimmed string only when it actually resolved to text.
  const localizedText = (raw: string): string => {
    const v = resolveLocalized(parseJsonColumn(raw, {}), def);
    return typeof v === "string" ? v.trim() : "";
  };

  const entries: LlmsPageEntry[] = [];
  for (const page of publishedPagePaths(rows)) {
    const row = meta.get(page.id);
    if (!row) continue;
    // Default-locale path; translate is a no-op for the default but keeps the
    // same seam sitemap.ts uses.
    const path = pathForLocale(page.segments, def, def, translate);
    const title =
      localizedText(row.metaTitle) ||
      // Fall back to the last slug segment so a title-less page still lists.
      (page.segments.at(-1) ?? "Home");
    entries.push({
      mdUrl: origin + mdPath(path),
      title,
      description: localizedText(row.metaDescription),
    });
  }

  // A stored template (with {{slot}} placeholders) wins; blank → auto output.
  // pageTree = the exact same "## Pages" list the auto builder emits.
  const body = template.trim()
    ? renderLlmsTemplate(template, {
        brandName: identity.brandName ?? "",
        tagline: identity.tagline ?? "",
        origin,
        defaultLocale: def,
        locales: contentLocales.locales.join(", "),
        pageTree: buildLlmsPageList(entries),
      } satisfies LlmsTemplateVars)
    : buildLlmsTxt(
        { name: identity.brandName, tagline: identity.tagline },
        entries,
      );
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
