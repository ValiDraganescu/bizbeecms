/**
 * Per-Site logo setting (theme page) — PURE module.
 *
 * The logo is a single media-library asset URL stored as one `site_settings`
 * row (key `site_logo`, see db/settings-store.ts). It is picked/uploaded via
 * the gallery on `/admin/settings/theme` and exposed to the AI through
 * `get_theme` / `update_theme`, so authored headers/footers can reference the
 * real brand mark instead of a placeholder.
 *
 * Only THIS Site's `/media/<key>` URLs are accepted (the same key grammar the
 * serve route enforces) — an arbitrary external URL would let a stored setting
 * point published pages at a third-party host. An optional `?w=&h=` intrinsic-
 * dims query (the authoring-time CLS carrier the pickers bake in) is kept when
 * valid and dropped otherwise. PURE (no React/D1/CF) → node-tested.
 */

// Relative (not @/) imports so this stays node-testable (see CAVEATS).
import {
  ASSET_URL_PREFIX,
  isValidAssetKey,
  readAssetDims,
  withAssetDims,
} from "../render/asset.ts";

/**
 * Normalize a raw logo URL: `""` (clear) and valid `/media/<key>[?w=&h=]`
 * strings pass (dims re-stamped only when both parse); anything else → null,
 * meaning "invalid — reject with a message", never a silent empty.
 */
export function normalizeSiteLogoUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const url = raw.trim();
  if (url === "") return "";
  const q = url.indexOf("?");
  const path = q === -1 ? url : url.slice(0, q);
  if (!path.startsWith(ASSET_URL_PREFIX)) return null;
  if (!isValidAssetKey(path.slice(ASSET_URL_PREFIX.length))) return null;
  const dims = readAssetDims(url);
  return dims ? withAssetDims(path, dims.width, dims.height) : path;
}

/** The message a rejected logo URL gets — names the expectation and the fix. */
export const SITE_LOGO_URL_ERROR =
  "logo must be this site's media URL like \"/media/assets/….png\" — upload the " +
  "file to the media library first (gallery or the upload_asset tool), or pass " +
  "\"\" to clear the logo";
