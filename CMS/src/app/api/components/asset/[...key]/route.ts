/**
 * components-gallery zip import — upload one bundled asset (bytes + metadata).
 *
 *   POST /api/components/asset/<key> → multipart: `file` (bytes; its `type` is
 *   the contentType from the zip's assets.json), optional `description`, `tags`
 *   (JSON array). Admin-only.
 *
 * CREATE-IF-MISSING, the inverse of the site-import asset route's "must
 * already exist" check: component import is additive (no execute step restores
 * metadata rows first), so this route inserts the D1 row AND writes the R2
 * bytes via the same `putAsset` the media upload uses. A key that already
 * exists is SKIPPED untouched (keys are content-addressed
 * `assets/<slug>_<ts>_<rand>.<ext>`, so an existing key IS the same asset —
 * never overwrite a Site's media from an import).
 *
 * Trust boundary: `isValidAssetKey` guards traversal (same as the serve
 * route); bytes must pass the SAME `validateAsset` type/size gate as a manual
 * upload — a kit zip is no more trusted than a file picker. Content-type comes
 * from the sidecar metadata (the client sets it as the Blob type), never
 * sniffed from the raw request header (same reasoning as site import).
 *
 * REST-only, no server actions.
 */
import { getAssetByKey, putAsset, setAssetTags } from "@/db/asset-store";
import { isValidAssetKey, validateAsset } from "@/lib/render/asset";
import { normalizeTags } from "@/lib/components/tags";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { key: segments } = await params;
  const key = (segments ?? []).join("/");
  if (!isValidAssetKey(key)) {
    return Response.json({ ok: false, error: "invalid asset key" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "missing file field" }, { status: 400 });
  }

  try {
    const existing = await getAssetByKey(key);
    if (existing) {
      // Same content-addressed key → same asset. Never clobber the Site's media.
      return Response.json({ ok: true, key, skipped: true });
    }

    const check = validateAsset(file.type, file.size);
    if (!check.valid) {
      return Response.json({ ok: false, error: check.error }, { status: 400 });
    }

    const description = form.get("description");
    const rawTags = form.get("tags");
    const tags = normalizeTags(
      typeof rawTags === "string"
        ? (() => {
            try {
              return JSON.parse(rawTags) as unknown;
            } catch {
              return [];
            }
          })()
        : [],
    );

    const row = await putAsset({
      key,
      filename: file.name,
      contentType: file.type,
      bytes: await file.arrayBuffer(),
      description: typeof description === "string" ? description.slice(0, 4000) : "",
    });
    if (tags.length > 0) await setAssetTags(key, tags);

    return Response.json({ ok: true, key, size: row.size, skipped: false }, { status: 201 });
  } catch (err) {
    return Response.json(
      { ok: false, error: (err as Error).message ?? "asset upload failed" },
      { status: 500 },
    );
  }
}
