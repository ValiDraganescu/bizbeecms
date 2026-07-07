/**
 * Markdown page-variant serving (seo-robots — AI-crawler `.md` surface).
 *
 * INTERNAL route: worker.ts (release-gated) rewrites a public `/<path>.md`
 * request to `/api/md/<path>` and lets this handler serve the Markdown body.
 * It lives under `/api/*` on purpose:
 *   - the `(site)` OPTIONAL catch-all `[[...slug]]` shadows every SIBLING route,
 *     but NOT fixed system prefixes (`api`/`media`/`_next` — see SKIP_SEGMENTS),
 *     so a route under `/api` is the only in-app place a `.md` body can be built
 *     (the plan build pulls next-intl/React, which must NOT enter worker.ts); and
 *   - `/api/*` is edge-cache-EXCLUDED (isEdgeCacheCandidate), so a deep
 *     `/products/item.md` can never get a wildcard page's Cache-Tag stamped on it
 *     (the sitemap-staleness precedent — see CAVEATS).
 *
 * It resolves the SAME slug walk + published/locale gate the HTML route uses
 * (`loadPlan`), then serializes the render plan with the pure
 * `planToMarkdown`. Unpublished / route-miss / noindex → 404 (crawler-hidden,
 * mirroring the sitemap/IndexNow gates). A defensive `.md` peel lets the route
 * be exercised directly (`/api/md/about.md`) without the worker rewrite.
 */
import { loadPlan } from "@/lib/render/load-plan";
import {
  planToMarkdown,
  peelMarkdownSuffix,
} from "@/lib/render/element-to-markdown";
import { parseJsonColumn } from "@/lib/render/tree";
import { resolveLocalized } from "@/lib/render/localize";
import type { LocaleContext } from "@/lib/render/plan-types";

/** Resolve a per-locale JSON map (metaTitle/metaDescription) to the active locale. */
function localized(raw: string, locale: LocaleContext): string | undefined {
  const map = parseJsonColumn<unknown>(raw, {});
  const v = resolveLocalized(map, locale.locale, locale.fallback);
  return typeof v === "string" && v !== "" ? v : undefined;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  // Accept either the worker-stripped slug or a raw `.md`-suffixed one.
  const { rest } = peelMarkdownSuffix(slug);
  const loaded = await loadPlan({ slug: rest }, {});
  // Unpublished / no page / route-miss → 404 (never serve a body a crawler
  // should not index). noindex pages are ALSO hidden here — same gate as the
  // sitemap skip + IndexNow skip (a noindexed URL must not be discoverable).
  if (!loaded || loaded.page.noindex) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const title = localized(loaded.page.metaTitle, loaded.locale);
  const description = localized(loaded.page.metaDescription, loaded.locale);
  const body = planToMarkdown(loaded.plan.root, { title, description });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
