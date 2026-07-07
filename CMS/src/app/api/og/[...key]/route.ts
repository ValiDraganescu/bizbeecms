/**
 * OG-image serve route (seo-robots) — streams an AUTO-generated OG screenshot
 * (`og/<id>.<locale>.png`) from the per-Site R2 bucket.
 *
 * Lives under `/api/og/…` on purpose: the `(site)` optional catch-all shadows
 * every arbitrary top-level path, and `/api` is a SKIP_SEGMENT so the worker
 * never stamps a wildcard page's cache-tag on it (see the routing + edge-cache
 * CAVEATs). The public URL is minted by `ogImageUrl(ogImageKey(id, loc))` and
 * fed into the OG card by `generateMetadata`.
 *
 * Traversal-guarded: only keys matching `isOgImageKey` (`og/<id>.<loc>.png`,
 * sanitized segments) are served — never an arbitrary R2 object. A manual media
 * upload lives under `assets/…` and is served by `/media/<key>`; this route
 * only ever exposes the `og/` autogen namespace.
 *
 * REST route handler (no server action). Live R2 needs a real binding (HITL).
 */
import { getStorage } from "@/lib/ports/storage";
import { isOgImageKey, OG_IMAGE_CONTENT_TYPE } from "@/lib/render/og-image";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!isOgImageKey(key)) {
    return new Response("not found", { status: 404 });
  }

  let object: Awaited<ReturnType<Awaited<ReturnType<typeof getStorage>>["get"]>>;
  try {
    const storage = await getStorage();
    object = await storage.get(key);
  } catch {
    return new Response("media binding unavailable", { status: 503 });
  }
  if (!object) {
    return new Response("not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType ?? OG_IMAGE_CONTENT_TYPE);
  headers.set("etag", object.httpEtag);
  // Autogen images are overwritten in place on regenerate (fixed key per
  // page×locale), so they are NOT immutable — a short cache with revalidation.
  headers.set("cache-control", "public, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
