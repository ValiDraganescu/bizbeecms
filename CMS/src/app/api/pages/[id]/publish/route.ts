/**
 * CMS page PUBLISH REST endpoint (page-builder Versioning slice 3) — snapshots
 * the page's current DRAFT into a new PUBLISHED version (bumping version_no) and
 * auto-creates a fresh draft to keep editing (publishDraft, slice 1 algebra).
 * After this the PUBLIC route renders the new published version.
 *
 *   POST → { ok: true, versionNo } | { error }
 *
 * REST-only, no server actions (they 500 on OpenNext/Workers). Version algebra
 * in `lib/pages/page-version.ts`; D1 in `db/page-version-store.ts`.
 */
import { publishDraft } from "@/db/page-version-store";
import { requireAdmin } from "@/lib/auth/guard";
import { pageCacheTag, LLMS_CACHE_TAG, SITEMAP_CACHE_TAG } from "@/lib/render/edge-cache";
import { purgeEdgeTags } from "@/lib/render/purge-edge";
import { notifyIndexNowForPage } from "@/lib/render/indexnow-notify";
import { generateOgImagesForPage } from "@/lib/render/og-image-notify";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const res = await publishDraft(id);
    if (!res) return Response.json({ error: "page not found" }, { status: 404 });
    // Publish must be visible immediately: bust this page's edge-cache entries
    // AND /llms.txt + /sitemap.xml (both list every published page). Best-effort.
    await purgeEdgeTags(pageCacheTag(id), LLMS_CACHE_TAG, SITEMAP_CACHE_TAG);
    // Tell IndexNow engines this page's URLs changed (best-effort, non-blocking).
    await notifyIndexNowForPage(id);
    // Best-effort OG-image fallback screenshots for locales lacking a manual
    // metaImage + an existing auto shot (ctx.waitUntil — never blocks/fails the
    // publish; no-op without the BROWSER binding / paid plan).
    await generateOgImagesForPage(id);
    return Response.json({ ok: true, versionNo: res.published.versionNo });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to publish" },
      { status: 500 },
    );
  }
}
