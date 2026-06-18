/**
 * CMS media-asset REST endpoint (Milestone 2, epic D1).
 *
 * GET    → list asset metadata (newest first) for the gallery.
 * POST   → multipart upload (field `file`); validates type+size, writes to R2
 *          + a D1 metadata row, returns the new asset (incl. its public URL).
 * DELETE → remove an asset by `?key=` (R2 + D1).
 *
 * REST-only, no server actions (PM directive — server actions 500 on
 * OpenNext/Workers). Pure validate/key logic lives in `lib/render/asset.ts`;
 * R2/D1 access in `db/asset-store.ts`. Live bindings need a real deploy (HITL);
 * only the offline validate path + tsc/gate are exercisable here.
 */
import { deleteAsset, listAssets, putAsset } from "@/db/asset-store";
import { assetUrl, buildAssetKey, isValidAssetKey, validateAsset } from "@/lib/render/asset";
import { requireAdmin } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const assets = await listAssets();
    return Response.json(assets.map((a) => ({ ...a, url: assetUrl(a.key) })));
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to list assets" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing file field" }, { status: 400 });
  }

  const check = validateAsset(file.type, file.size);
  if (!check.valid) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  const key = buildAssetKey(file.name, file.type, crypto.randomUUID().slice(0, 8));
  try {
    const bytes = await file.arrayBuffer();
    const row = await putAsset({ key, filename: file.name, contentType: file.type, bytes });
    return Response.json({ ...row, url: assetUrl(row.key) }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "upload failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isValidAssetKey(key)) {
    return Response.json({ error: "invalid key" }, { status: 400 });
  }
  try {
    await deleteAsset(key);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "delete failed" },
      { status: 500 },
    );
  }
}
