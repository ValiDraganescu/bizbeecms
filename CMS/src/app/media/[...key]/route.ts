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
  deliveryWidth,
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
 * transcoded responses and a normalized `w` for resized ones. The Cache API
 * doesn't honor `Vary`, so WebP/original AND each width MUST live under distinct
 * keys or a variant cached first would be served to a client that asked for a
 * different one. `w` is the CLAMPED allowlist width (not the raw request px), so
 * `?w=500` and `?w=600` both key to the same `640` entry — the whole point of
 * the closed allowlist (bounded cache/Images-ops per asset).
 */
function cacheKeyFor(url: string, fmt: string | null, width: number | null): string {
  if (!fmt && width === null) return url;
  const u = new URL(url);
  if (fmt) u.searchParams.set("fmt", fmt.replace("image/", ""));
  // Overwrite the raw request `w` with the clamped one so the key is canonical.
  if (width === null) u.searchParams.delete("w");
  else u.searchParams.set("w", String(width));
  return u.toString();
}

/**
 * Output format for a RESIZE-ONLY transform (no WebP transcode): preserve the
 * master's format so a resized PNG stays PNG etc. `ImageOutputOptions.format` is
 * a closed literal union, so map the key extension to it; unknown/animated types
 * never reach here (deliveryWidth is applied to any key, but resize-only fires
 * only when the client didn't get a WebP transcode — the transform still runs
 * and jpeg is a safe default the binding can always emit).
 * ponytail: gif is left as jpeg on the resize-only path — a resized animated gif
 * would drop frames anyway; switch to "image/gif" here if animated resize matters.
 */
function resizeOutputFormat(key: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = key.toLowerCase().split(".").pop() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
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

  // Negotiate the delivery format (from KEY + Accept) and the delivery WIDTH
  // (from the `?w=` query, clamped to the allowlist) — both pure, no R2 read,
  // so an edge-cache hit costs zero R2 operations.
  const fmt = deliveryFormat(key, request.headers.get("accept"));
  const width = deliveryWidth(new URL(request.url).searchParams.get("w"));
  const cache = edgeCache();
  const cacheKey = cacheKeyFor(request.url, fmt, width);
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
  // Resize and/or transcode when either is requested. `.transform({ width })`
  // runs on the same Workers Images binding as the WebP `.output` — one pipeline
  // (resize then encode). `fit: "scale-down"` never UPSCALES past the master, so
  // asking for a width larger than the intrinsic size is a no-op, not a blur.
  if (fmt || width !== null) {
    const images = await getImages();
    if (images) {
      try {
        let pipeline = images.input(object.body);
        if (width !== null) pipeline = pipeline.transform({ width, fit: "scale-down" });
        const out = await pipeline.output(
          fmt
            ? { format: fmt, quality: DELIVERY_WEBP_QUALITY }
            : { format: resizeOutputFormat(key) },
        );
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
  // ETag identifies the VARIANT (browser revalidation is per-URL; the URL
  // already carries `?w=`, so width is covered — only the Accept-driven fmt
  // needs an explicit suffix since it isn't in the URL).
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
