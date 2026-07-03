/**
 * CMS media serve route (Milestone 2, epic D1) — streams asset bytes from the
 * per-Site R2 bucket. `/media/<key>` → the `MEDIA` R2 object.
 *
 * An explicit route (beats the public `[[...slug]]` catch-all). Components
 * reference `assetUrl(key)` = `/media/<key>` to load images. The key is
 * validated against `isValidAssetKey` so it can't be used for traversal /
 * to read arbitrary R2 objects.
 *
 * REST route handler (no server action). Live R2 needs a real binding (HITL).
 */
import { getAssetObject } from "@/db/asset-store";
import { assetServeHeaders, isValidAssetKey } from "@/lib/render/asset";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!isValidAssetKey(key)) {
    return new Response("not found", { status: 404 });
  }

  const cache = edgeCache();
  if (cache) {
    const hit = await cache.match(request.url).catch(() => undefined);
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

  const headers = new Headers();
  // Read content-type off httpMetadata directly instead of object.writeHttpMetadata():
  // that method isn't callable across OpenNext's REMOTE R2 binding in `next dev`
  // (throws DevalueError "Cannot stringify arbitrary non-POJOs"). content-type is
  // the only field we consume downstream (assetServeHeaders reads it back), so this
  // is both the local-dev fix and a simplification — identical behavior in prod.
  const contentType = object.httpMetadata?.contentType;
  if (contentType) headers.set("content-type", contentType);
  headers.set("etag", object.httpEtag);
  // Assets are content-addressed (key has a timestamp+rand), so cache hard.
  headers.set("cache-control", "public, max-age=31536000, immutable");
  // Security headers (nosniff always; SVG → CSP sandbox + force-download so a
  // user-uploaded SVG with embedded <script> can't run in the CMS origin and
  // reach admin cookies). Pure decision lives in `assetServeHeaders` (tested).
  for (const [k, v] of Object.entries(assetServeHeaders(headers.get("content-type") ?? ""))) {
    headers.set(k, v);
  }
  const response = new Response(object.body, { headers });
  if (cache) {
    // Best-effort: a cache.put failure must never fail the serve.
    await cache.put(request.url, response.clone()).catch(() => {});
  }
  return response;
}
