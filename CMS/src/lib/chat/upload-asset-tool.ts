/**
 * The `upload_asset` AI tool: upload a file (base64 bytes) into the Site's
 * media library — the write sibling of `list_assets`. Exists chiefly for MCP
 * clients (a local Claude Code holding real files), which previously had no
 * way to get a file into the gallery short of the cookie-authed REST route.
 * The stored asset goes through the SAME pipeline the gallery upload uses
 * (R2 bytes + D1 metadata row, AI describe for search, optional tags) and the
 * public `/media/<key>` URL comes back for use in components/pages.
 *
 * PURE schema + arg validation (no React/D1/CF) so it's node-testable; the
 * live R2/D1 write lives in `handleUploadAsset` (tool-dispatch-media.ts).
 */

import { normalizeTags } from "../components/tags.ts";
import {
  ALLOWED_ASSET_TYPES,
  MAX_ASSET_SIZE,
  inferAssetContentType,
  validateAsset,
} from "../render/asset.ts";

/**
 * Base64 length bound checked BEFORE decoding, so a hostile arg can't make us
 * materialize hundreds of MB just to reject it. 4/3 of the byte cap + padding.
 */
export const MAX_UPLOAD_BASE64_CHARS = Math.ceil(MAX_ASSET_SIZE / 3) * 4 + 4;

export const UPLOAD_ASSET_TOOL = {
  type: "function" as const,
  function: {
    name: "upload_asset",
    description:
      "Upload a file into the site's media library. Pass the file's bytes " +
      "base64-encoded in `data` (a data: URL is also accepted) plus its " +
      "`filename`. The asset is stored, automatically described for search " +
      "(images), and tagged; the result carries its public /media/<key> URL — " +
      "use that directly in a component <img> src or an image prop. Allowed " +
      `types: ${ALLOWED_ASSET_TYPES.join(", ")}; max ${MAX_ASSET_SIZE / 1024 / 1024}MB.`,
    parameters: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description:
            "Original filename incl. extension, e.g. \"logo.svg\" — used for the " +
            "gallery name and to infer the content type when none is given.",
        },
        data: {
          type: "string",
          description:
            "The file's bytes, base64-encoded. A full data: URL " +
            "(data:image/png;base64,…) works too and also supplies the content type.",
        },
        contentType: {
          type: "string",
          description:
            "Optional MIME type, e.g. \"image/png\". Omitted → taken from the " +
            "data: URL prefix or inferred from the filename extension.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Optional gallery tags to categorize the asset, e.g. [\"logo\", \"brand\"].",
        },
      },
      required: ["filename", "data"],
    },
  },
} as const;

export type UploadAssetInput =
  | { ok: true; filename: string; contentType: string; bytes: ArrayBuffer; tags: string[] }
  | { ok: false; error: string };

/** Strict-ish base64 charset (whitespace already stripped; base64url mapped). */
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Validate the model's args into clean upload input: required filename +
 * base64 `data` (plain, whitespace-tolerant, base64url, or a full data: URL —
 * accept all sane inputs), content type from the explicit arg → data-URL
 * prefix → filename extension, then the SAME type/size gate the gallery upload
 * runs (`validateAsset`). Errors name the exact bad token and the fix; never
 * throws. PURE.
 */
export function validateUploadAsset(args: unknown): UploadAssetInput {
  const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;

  const filename = typeof a.filename === "string" ? a.filename.trim() : "";
  if (!filename) {
    return { ok: false, error: "filename is required — the original name incl. extension, e.g. \"logo.png\"" };
  }

  const rawData = typeof a.data === "string" ? a.data.trim() : "";
  if (!rawData) {
    return { ok: false, error: "data is required — the file's bytes, base64-encoded" };
  }

  // Accept a full data: URL and lift its MIME type.
  let b64 = rawData;
  let dataUrlType = "";
  if (b64.startsWith("data:")) {
    const comma = b64.indexOf(",");
    const header = comma === -1 ? "" : b64.slice(5, comma);
    if (comma === -1 || !/;base64$/i.test(header)) {
      return {
        ok: false,
        error: "data looks like a data: URL but is not base64 — use data:<mime>;base64,<bytes>",
      };
    }
    dataUrlType = header.replace(/;base64$/i, "").trim();
    b64 = b64.slice(comma + 1);
  }

  // Whitespace-tolerant + base64url-tolerant, then strict.
  b64 = b64.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (b64.length > MAX_UPLOAD_BASE64_CHARS) {
    return { ok: false, error: `file exceeds ${MAX_ASSET_SIZE / 1024 / 1024}MB` };
  }
  if (!BASE64_RE.test(b64)) {
    return { ok: false, error: "data is not valid base64 — send the file's bytes base64-encoded" };
  }

  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    return { ok: false, error: "data is not valid base64 — send the file's bytes base64-encoded" };
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const contentType =
    (typeof a.contentType === "string" ? a.contentType.trim() : "") ||
    dataUrlType ||
    inferAssetContentType(filename);
  const check = validateAsset(contentType, bytes.length);
  if (!check.valid) {
    return {
      ok: false,
      error: `${check.error} — allowed types: ${ALLOWED_ASSET_TYPES.join(", ")}`,
    };
  }

  return { ok: true, filename, contentType, bytes: bytes.buffer as ArrayBuffer, tags: normalizeTags(a.tags) };
}
