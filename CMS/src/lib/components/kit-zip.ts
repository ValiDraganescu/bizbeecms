/**
 * Component-kit ZIP packaging (components-gallery: zip export/import).
 *
 * A `.kit.zip` wraps the EXISTING kit format — no new bundle format, no
 * KIT_VERSION bump (`parseKitBundle` tolerates extra zip entries and fields):
 *
 *   kit.json      — the KitBundle JSON, verbatim (a single component exports
 *                   as a kit of 1)
 *   assets.json   — sidecar: metadata rows for the bundled asset bytes
 *                   (key, filename, contentType, description, tags)
 *   assets/<key>  — raw asset bytes, zip entry path IS `asset.key` verbatim
 *                   (same convention as site export/import, FORMAT.md §4a)
 *
 * Zipping/unzipping is CLIENT-SIDE with fflate, mirroring the site
 * export/import — this module owns only the PURE bookkeeping around it
 * (manifest build/parse, `?names=` selection, filenames, zip detection) so it
 * runs under the dep-free `node --test`. Relative `.ts` imports for that reason.
 *
 * `parseAssetsManifest` is a TRUST BOUNDARY helper: the sidecar comes from an
 * untrusted zip, so entries are shape-checked and keys must pass
 * `isValidAssetKey` (same traversal guard as the serve route) — a bad entry is
 * dropped, never thrown on.
 */

import { isValidAssetKey } from "../render/asset.ts";
import { normalizeTags } from "./tags.ts";

/** Zip entry names (fixed layout). */
export const KIT_ENTRY = "kit.json";
export const ASSETS_ENTRY = "assets.json";

/** One row of the `assets.json` sidecar. */
export interface KitAssetMeta {
  key: string;
  filename: string;
  contentType: string;
  description: string;
  tags: string[];
}

/** Bounds for untrusted sidecar strings (shown/stored, never executed). */
const MAX_FILENAME_LEN = 256;
const MAX_DESCRIPTION_LEN = 4000;
const MAX_CONTENT_TYPE_LEN = 128;

/**
 * Build the `assets.json` sidecar for a kit's asset deps: intersect the
 * bundle's dep keys with the Site's asset rows (metadata source of truth),
 * in dep order. Keys the Site doesn't actually have are skipped — the caller
 * reports them as unbundled. PURE.
 */
export function buildAssetsManifest(
  depKeys: string[],
  siteAssets: {
    key: string;
    filename: string;
    contentType: string;
    description?: string | null;
    tags?: unknown;
  }[],
): KitAssetMeta[] {
  const byKey = new Map(siteAssets.map((a) => [a.key, a]));
  const out: KitAssetMeta[] = [];
  for (const key of depKeys) {
    const a = byKey.get(key);
    if (!a || !isValidAssetKey(key)) continue;
    out.push({
      key,
      filename: a.filename,
      contentType: a.contentType,
      description: a.description ?? "",
      tags: normalizeTags(a.tags),
    });
  }
  return out;
}

/**
 * Parse an UNTRUSTED `assets.json` sidecar. Tolerant: a malformed document
 * yields `[]`, a malformed ENTRY (bad key shape, missing filename/contentType)
 * is dropped. Never throws. Strings are bounded, tags re-normalized.
 */
export function parseAssetsManifest(raw: unknown): KitAssetMeta[] {
  let val: unknown = raw;
  if (typeof raw === "string") {
    try {
      val = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(val)) return [];
  const out: KitAssetMeta[] = [];
  const seen = new Set<string>();
  for (const entry of val) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const key = typeof e.key === "string" ? e.key : "";
    if (!isValidAssetKey(key) || seen.has(key)) continue;
    const filename = typeof e.filename === "string" ? e.filename.slice(0, MAX_FILENAME_LEN) : "";
    const contentType =
      typeof e.contentType === "string" ? e.contentType.slice(0, MAX_CONTENT_TYPE_LEN) : "";
    if (!filename || !contentType) continue;
    seen.add(key);
    out.push({
      key,
      filename,
      contentType,
      description:
        typeof e.description === "string" ? e.description.slice(0, MAX_DESCRIPTION_LEN) : "",
      tags: normalizeTags(e.tags),
    });
  }
  return out;
}

/**
 * Parse the export route's `?names=` param (comma-separated component names):
 * trim, drop empties, dedupe, preserve order. PURE.
 */
export function parseNamesParam(csv: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of csv.split(",")) {
    const name = part.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * Select component rows by name. Returns the matched rows (in request order)
 * and the requested names that don't exist — the route 404s on any missing
 * name so an export can never be silently incomplete. PURE.
 */
export function selectByNames<T extends { name: string }>(
  rows: T[],
  names: string[],
): { selected: T[]; missing: string[] } {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const selected: T[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const row = byName.get(name);
    if (row) selected.push(row);
    else missing.push(name);
  }
  return { selected, missing };
}

/** Default kit name for a `?names=` export: the component itself for a
 * selection of one, else a neutral "components". PURE. */
export function defaultKitName(names: string[]): string {
  return names.length === 1 ? names[0] : "components";
}

/** Filesystem-friendly download name, e.g. "hero-set.kit.zip". */
export function kitZipFilename(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug || "kit"}.kit.zip`;
}

/** Zip sniff: "PK\x03\x04" magic in the first four bytes. */
export function isZipMagic(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}
