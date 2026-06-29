/**
 * The fifth AI tool: list the Site's uploaded media assets (Milestone 2, epic D1
 * loop-closer).
 *
 * The media library (D1) lets users upload images to R2 and serves them at
 * `/media/<key>`, but the authoring tools (create_component / create_page) had
 * no way to DISCOVER those uploads — the model would invent placeholder image
 * URLs. This read-only tool closes that loop: the AI calls `list_assets` to get
 * the available assets (each with its public `/media/<key>` URL), then puts the
 * real URL into a component `tree` or block prop.
 *
 * Unlike the write tools (B2/B3/B4) there is no UNTRUSTED artifact to validate —
 * this lists what already exists. The only model-supplied arg is an optional
 * `limit` we clamp. The two PURE concerns mirror the other tools:
 *
 *  1. `LIST_ASSETS_TOOL` — the OpenAI-style function/tool schema.
 *  2. `coerceLimit` / `formatAssetList` — pure shaping of the args and the D1
 *     rows into the tool result the model sees. PURE — no React/D1/CF imports —
 *     so it's unit-tested with the project's dep-free `node --test`.
 *
 * The D1 read lives in `db/asset-store.ts` (`listAssets`); the route wires it
 * (`handleListAssets`) and turns the rows into URLs via `assetUrl`.
 */

// Relative (not @/) imports so this stays node-testable (see CAVEATS).
import { assetUrl } from "../render/asset.ts";

/** Default + max number of assets returned to the model in one call. */
export const DEFAULT_ASSET_LIMIT = 50;
export const MAX_ASSET_LIMIT = 200;

/** The shape the route hands `formatAssetList` (a subset of the D1 `Asset` row). */
export interface AssetRowLike {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

/** One asset as the model sees it: a ready-to-use `/media/<key>` URL + metadata. */
export interface AssetListItem {
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * The tool schema handed to the model. Read-only: the model calls it with no
 * args (or an optional `limit`) to see what images it can reference.
 */
export const LIST_ASSETS_TOOL = {
  type: "function" as const,
  function: {
    name: "list_assets",
    description:
      "List the media assets (images) already uploaded to this site. Returns " +
      "each asset's public URL (use it directly in a component's <img> " +
      "src or any image prop), filename and content type. Call this before " +
      "referencing an image so you use a real uploaded asset instead of a " +
      "placeholder URL.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: `Max number of assets to return (default ${DEFAULT_ASSET_LIMIT}, max ${MAX_ASSET_LIMIT}).`,
        },
      },
      required: [],
    },
  },
} as const;

/**
 * Clamp the model's `limit` arg to a sane range. Tolerates a number, a numeric
 * string (open models emit numbers as strings), missing/garbage → default.
 * PURE, never throws.
 */
export function coerceLimit(args: unknown): number {
  const raw = (args as { limit?: unknown } | null | undefined)?.limit;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return DEFAULT_ASSET_LIMIT;
  }
  return Math.min(Math.floor(n), MAX_ASSET_LIMIT);
}

/**
 * Turn D1 asset rows into the tool result the model sees: each row becomes a
 * `{ url, filename, contentType, size }` with the public `/media/<key>` URL.
 * PURE.
 */
export function formatAssetList(rows: AssetRowLike[], limit: number): AssetListItem[] {
  return rows.slice(0, limit).map((r) => ({
    url: assetUrl(r.key),
    filename: r.filename,
    contentType: r.contentType,
    size: r.size,
  }));
}
