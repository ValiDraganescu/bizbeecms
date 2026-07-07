/**
 * OG-image regenerate + status endpoint (seo-robots — OG track item 4/4).
 *
 *   GET  ?locale=<loc> → { manual: boolean, autoExists: boolean, url?: string }
 *        The currently-effective og:image for the SEO tab's manual/auto badge:
 *        a manual per-locale metaImage ALWAYS wins; else the auto screenshot IF
 *        it exists in R2; else none. One R2 probe (only when no manual image).
 *
 *   POST { locale } → { ok: true, url } | { code, error }
 *        FORCE a fresh Browser-Rendering screenshot for this page×locale,
 *        SKIPPING the publish hook's idempotency probe — the explicit
 *        "refresh after a redesign" path. Refuses when a manual image exists
 *        (`manualWins`) since an upload always wins. Stable `code`s the SEO tab
 *        localizes: manualWins | noUrl | noBinding | noOrigin | error | badLocale.
 *        On success purges the page's edge-cache so the new fallback ships.
 *
 * REST-only (server actions 500 on Workers). Admin-guarded.
 */
import { getPageById } from "@/db/page-store";
import { requireAdmin } from "@/lib/auth/guard";
import { pageCacheTag } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";
import { getStorage } from "@/lib/ports/storage";
import { resolveSiteOrigin } from "@/lib/render/site-origin";
import { ogImageKey, ogImageUrl, resolveOgImageUrl } from "@/lib/render/og-image";
import { regenerateOgImageForPage } from "@/lib/render/og-image-notify";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  const locale = new URL(request.url).searchParams.get("locale") ?? "";
  if (!locale) return Response.json({ error: "locale required", code: "badLocale" }, { status: 400 });

  const page = await getPageById(id);
  if (!page) return Response.json({ error: "page not found" }, { status: 404 });

  const manual = (page.metaImage[locale] ?? "").trim();
  let autoExists = false;
  if (!manual) {
    try {
      autoExists = (await getStorage().then((s) => s.get(ogImageKey(id, locale)))) != null;
    } catch {
      autoExists = false;
    }
  }
  const origin = await resolveSiteOrigin().catch(() => null);
  const url = resolveOgImageUrl({ manualImage: manual, autoExists, pageId: id, locale, origin });
  return Response.json({ manual: Boolean(manual), autoExists, url });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;

  let body: { locale?: unknown };
  try {
    body = (await request.json()) as { locale?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body", code: "badLocale" }, { status: 400 });
  }
  const locale = typeof body.locale === "string" ? body.locale.trim() : "";
  if (!locale) return Response.json({ error: "locale required", code: "badLocale" }, { status: 400 });

  const res = await regenerateOgImageForPage(id, locale);
  if (!res.ok) {
    const status = res.code === "noBinding" || res.code === "noOrigin" ? 503 : 400;
    return Response.json({ error: res.detail ?? res.code, code: res.code }, { status });
  }
  // New fallback og:image → bust this page's edge-cache so the metadata reshoots.
  await purgeEdgeTags(pageCacheTag(id)).catch(() => undefined);
  return Response.json({ ok: true, url: ogImageUrl(res.key) });
}
