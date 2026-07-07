/**
 * Pure helpers for R2-backed media assets (Milestone 2, epic D1).
 *
 * Kept React/D1/CF-free so it is node-testable (`scripts/asset.test.mjs`) and
 * importable from both the upload route and the gallery editor. The R2 binding
 * itself is touched only in the route handlers / `db/asset-store.ts`.
 *
 * An asset is stored in the per-Site R2 bucket (the `MEDIA` binding) under a
 * collision-resistant key, with a metadata row in D1 so the gallery can list
 * without an R2 LIST call. Public bytes are served back through the CMS worker
 * at `/media/<key>` (the worker streams from R2) — no presigning, no AWS
 * creds: on Workers the R2 binding is native (unlike aicms, which presigns via
 * aws4fetch because it runs off-Cloudflare).
 */

/** Image types the gallery accepts. Components need images first (per GOAL D1). */
export const ALLOWED_ASSET_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;

export type AssetContentType = (typeof ALLOWED_ASSET_TYPES)[number];

/** 20 MB — generous for web imagery, bounded so one upload can't blow R2 limits. */
export const MAX_ASSET_SIZE = 20 * 1024 * 1024;

/** URL prefix the CMS worker serves R2 bytes from (an explicit route, beats `[[...slug]]`). */
export const ASSET_URL_PREFIX = "/media/";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export type ValidationResult = { valid: true } | { valid: false; error: string };

/** Validate an upload's content-type + byte size before it ever touches R2. */
export function validateAsset(contentType: string, size: number): ValidationResult {
  if (!(ALLOWED_ASSET_TYPES as readonly string[]).includes(contentType)) {
    return { valid: false, error: `unsupported type: ${contentType || "(none)"}` };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, error: "empty file" };
  }
  if (size > MAX_ASSET_SIZE) {
    return { valid: false, error: `file exceeds ${MAX_ASSET_SIZE / 1024 / 1024}MB` };
  }
  return { valid: true };
}

/** Largest pixel dimension we'll store — client-reported dims are untrusted, so
 *  clamp out absurd values (a forged 10^9 would poison the aspect-ratio math). */
export const MAX_ASSET_DIMENSION = 100_000;

/**
 * Coerce a client-reported image dimension (form field, so a string) to a stored
 * pixel integer, or null when it isn't a sane positive dimension. Rejects
 * non-numeric, non-finite, non-positive, and out-of-range values, and floors
 * fractional input. Client-side capture is a convenience, NOT trusted — this is
 * the trust boundary, so a bad/absent value simply stores null (no dims).
 */
export function parseAssetDimension(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return null;
  const px = Math.floor(n);
  return px >= 1 && px <= MAX_ASSET_DIMENSION ? px : null;
}

/**
 * Collision-resistant R2 object key from the original filename + content type.
 * `assets/<slug-of-base>_<ts>_<rand>.<ext>` — lowercase, safe chars only, so it
 * is a valid URL segment and a valid R2 key. `rand` is required (defaulting it
 * would risk same-ms collisions); callers pass `crypto.randomUUID().slice(...)`.
 */
export function buildAssetKey(
  originalName: string,
  contentType: string,
  rand: string,
  now: number = Date.now(),
): string {
  const ext =
    EXT_BY_TYPE[contentType] ??
    (originalName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin");
  const base =
    originalName
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_+|_+$)/g, "")
      .slice(0, 48) || "file";
  const safeRand = (rand || "x").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "x";
  return `assets/${base}_${now}_${safeRand}.${ext}`;
}

/** Words that carry no meaning in a filename derived from a description. */
const FILLER_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "with", "and", "or", "to", "for",
  "is", "are", "this", "that", "its", "it", "by", "from", "over", "under",
]);

/**
 * A short human filename (2–5 meaningful words, kebab-case) from an image
 * description or prompt — "a rustic terrace overlooking the vineyards" →
 * "rustic-terrace-overlooking-vineyards.png". Falls back to raw words when
 * filler-filtering leaves fewer than two, and to "generated" on empty text.
 */
export function filenameFromText(text: string, ext: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((w) => !FILLER_WORDS.has(w));
  const base = (meaningful.length >= 2 ? meaningful : words).slice(0, 5).join("-");
  return `${base || "generated"}.${ext}`;
}

/** Whether a key is one this app produced (guards the serve route against traversal). */
export function isValidAssetKey(key: string): boolean {
  return /^assets\/[a-z0-9][a-z0-9_]*_\d+_[a-z0-9]+\.[a-z0-9]+$/.test(key);
}

/** Public URL a component references to load the asset (served by the worker). */
export function assetUrl(key: string): string {
  return ASSET_URL_PREFIX + key;
}

/**
 * Delivery format negotiation for `/media/<key>` (transform-on-delivery).
 *
 * PNG/JPEG masters (the AI generator emits ~1.5MB PNGs) are transcoded to WebP
 * at serve time when the client advertises support — ~10x smaller for
 * photographic content. Everything else passes through untouched: WebP is
 * already the target, GIF may be animated (a naive transcode drops frames),
 * and SVG must keep its locked-down serve path (see assetServeHeaders).
 * Returns the target format, or null for "serve the original". Pure — tested.
 * ponytail: WebP only; add AVIF here if the extra ~30% ever matters (it doubles
 * the cached/billed variants).
 */
export function deliveryFormat(
  key: string,
  accept: string | null | undefined,
): "image/webp" | null {
  // Decide from the KEY's extension (every stored key has one — buildAssetKey/
  // isValidAssetKey guarantee it) so the serve route can compute its cache key
  // and take an edge-cache hit WITHOUT touching R2 first.
  const ext = key.toLowerCase().split(".").pop() ?? "";
  if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") return null;
  if (!(accept ?? "").toLowerCase().includes("image/webp")) return null;
  return "image/webp";
}

/** WebP quality for delivery transcodes — the size/fidelity sweet spot for photos. */
export const DELIVERY_WEBP_QUALITY = 82;

/**
 * Security headers the serve route adds for a given content type.
 *
 * `nosniff` is always set so the browser can't MIME-sniff an upload into an
 * active type. SVG is an active document (it can carry `<script>`), so a
 * user-uploaded one served inline same-origin could run in the CMS origin and
 * reach admin cookies — for SVG we add a locked-down CSP sandbox and force it
 * to download (it still renders fine inside an `<img src>`, just can't execute
 * scripts as a top-level document). Pure so it is node-testable.
 */
export function assetServeHeaders(contentType: string): Record<string, string> {
  const headers: Record<string, string> = { "x-content-type-options": "nosniff" };
  if ((contentType ?? "").toLowerCase().includes("svg")) {
    headers["content-security-policy"] = "default-src 'none'; sandbox";
    headers["content-disposition"] = "attachment";
  }
  return headers;
}
