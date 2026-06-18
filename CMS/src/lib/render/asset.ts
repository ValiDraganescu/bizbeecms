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

/** Whether a key is one this app produced (guards the serve route against traversal). */
export function isValidAssetKey(key: string): boolean {
  return /^assets\/[a-z0-9][a-z0-9_]*_\d+_[a-z0-9]+\.[a-z0-9]+$/.test(key);
}

/** Public URL a component references to load the asset (served by the worker). */
export function assetUrl(key: string): string {
  return ASSET_URL_PREFIX + key;
}

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
