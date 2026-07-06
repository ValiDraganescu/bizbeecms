/**
 * CMS media serve route (Milestone 2, epic D1) — streams asset bytes from the
 * per-Site R2 bucket. `/media/<key>` → the `MEDIA` R2 object.
 *
 * An explicit route (beats the public `[[...slug]]` catch-all). Components
 * reference `assetUrl(key)` = `/media/<key>` to load images. The key is
 * validated against `isValidAssetKey` so it can't be used for traversal /
 * to read arbitrary R2 objects.
 *
 * TRANSFORM ON DELIVERY (media-webp): PNG/JPEG masters are transcoded to WebP
 * via the Cloudflare Images binding when the client `Accept`s it (~10x smaller
 * for the AI-generated photos), and each variant is cached at the edge under
 * its own key — the transform runs once per PoP, not per request. The R2
 * original is never touched, so export/import still ships masters. Any
 * transform failure (unbound IMAGES, unsupported input) falls back to the
 * original bytes: delivery never 5xxs because of the optimizer.
 *
 * REST route handler (no server action). Live R2 needs a real binding (HITL).
 */
import { getAssetObject } from "@/db/asset-store";
import { getImages } from "@/lib/ports/images";
import {
  assetServeHeaders,
  deliveryFormat,
  DELIVERY_WEBP_QUALITY,
  isValidAssetKey,
} from "@/lib/render/asset";

export const dynamic = "force-dynamic";

/**
 * Cloudflare's per-PoP edge cache (Workers Cache API). Worker responses are
 * NOT CDN-cached automatically — without this, every visitor's request runs
 * the Worker and reads R2 (single-region). Assets are content-addressed
 * (timestamp+rand in the key) and served `immutable`, so caching hard is safe.
 * Absent in `next dev` on Node → undefined → straight to R2 (same behavior).
 * ponytail: a deleted asset can persist at a PoP until eviction — browsers
 * already cache it for a year anyway; purge-on-delete if it ever matters.
 */
const edgeCache = (): Cache | undefined =>
  (globalThis as { caches?: { default?: Cache } }).caches?.default;

/**
 * Per-variant cache key: the request URL plus a synthetic `fmt` param for
 * transcoded responses. The Cache API doesn't honor `Vary`, so WebP and
 * original variants MUST live under distinct keys or a WebP response cached
 * first would be served to a client that can't decode it.
 */
function cacheKeyFor(url: string, fmt: string | null): string {
  if (!fmt) return url;
  const u = new URL(url);
  u.searchParams.set("fmt", fmt.replace("image/", ""));
  return u.toString();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!isValidAssetKey(key)) {
    return new Response("not found", { status: 404 });
  }

  // Negotiate the delivery format from the KEY + Accept header alone (pure,
  // no R2 read) so an edge-cache hit costs zero R2 operations.
  const fmt = deliveryFormat(key, request.headers.get("accept"));
  const cache = edgeCache();
  const cacheKey = cacheKeyFor(request.url, fmt);
  if (cache) {
    const hit = await cache.match(cacheKey).catch(() => undefined);
    if (hit) return hit;
  }

  let object: Awaited<ReturnType<typeof getAssetObject>>;
  try {
    object = await getAssetObject(key);
  } catch {
    return new Response("media binding unavailable", { status: 503 });
  }
  if (!object) {
    return new Response("not found", { status: 404 });
  }

  // Read content-type off httpMetadata directly instead of object.writeHttpMetadata():
  // that method isn't callable across OpenNext's REMOTE R2 binding in `next dev`
  // (throws DevalueError "Cannot stringify arbitrary non-POJOs"). content-type is
  // the only field we consume downstream (assetServeHeaders reads it back), so this
  // is both the local-dev fix and a simplification — identical behavior in prod.
  let contentType = object.httpMetadata?.contentType ?? "";
  let body: BodyInit = object.body;
  if (fmt) {
    const images = await getImages();
    if (images) {
      try {
        const out = await images
          .input(object.body)
          .output({ format: fmt, quality: DELIVERY_WEBP_QUALITY });
        body = out.image();
        contentType = out.contentType();
      } catch {
        // Input stream may be part-consumed by a failed transform — re-fetch
        // the original rather than serving truncated bytes.
        const retry = await getAssetObject(key).catch(() => null);
        if (!retry) return new Response("not found", { status: 404 });
        body = retry.body;
        contentType = retry.httpMetadata?.contentType ?? "";
      }
    }
  }

  const headers = new Headers();
  if (contentType) headers.set("content-type", contentType);
  // ETag identifies the VARIANT (browser revalidation is per-URL, and one
  // browser always sends the same Accept — but keep variants distinguishable).
  headers.set("etag", fmt ? object.httpEtag.replace(/"$/, `-${fmt.replace("image/", "")}"`) : object.httpEtag);
  // Assets are content-addressed (key has a timestamp+rand), so cache hard.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  // HTTP-correctness for any downstream shared cache; our own edge cache
  // ignores Vary, hence the per-variant keys above.
  if (fmt) headers.set("vary", "accept");
  // Security headers (nosniff always; SVG → CSP sandbox + force-download so a
  // user-uploaded SVG with embedded <script> can't run in the CMS origin and
  // reach admin cookies). Pure decision lives in `assetServeHeaders` (tested).
  for (const [k, v] of Object.entries(assetServeHeaders(headers.get("content-type") ?? ""))) {
    headers.set(k, v);
  }
  const response = new Response(body, { headers });
  if (cache) {
    // Best-effort: a cache.put failure must never fail the serve.
    await cache.put(cacheKey, response.clone()).catch(() => {});
  }
  return response;
}
