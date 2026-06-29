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
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { deleteAsset, listAssets, putAsset, setAssetTags } from "@/db/asset-store";
import { assetUrl, buildAssetKey, isValidAssetKey, validateAsset } from "@/lib/render/asset";
import { normalizeTags } from "@/lib/components/tags";
import { requireAdmin } from "@/lib/auth/guard";
import { describeImage } from "@/lib/chat/describe-image";
import { getImageModel } from "@/db/settings-store";
import { DEFAULT_IMAGE_MODEL } from "@/lib/chat/models";
import { effectiveOpenrouterKey } from "@/lib/settings/openrouter-key";
import { getDecryptedOpenrouterUserKey } from "@/db/openrouter-key-store";

export const dynamic = "force-dynamic";

/**
 * Describe an uploaded image via the operator-selected vision model, for search.
 * Resolves the OpenRouter key the SAME way the chat does (CMS-local user key wins
 * over the deployer env key). Returns "" on any failure — the caller never fails
 * the upload over a missing description. Non-images are skipped by the caller.
 */
async function describeUpload(
  contentType: string,
  bytes: ArrayBuffer,
  thumbDataUrl?: string,
): Promise<string> {
  if (!contentType.toLowerCase().startsWith("image/")) return "";
  try {
    const { env } = await getCloudflareContext({ async: true });
    const e = env as unknown as { OPENROUTER_API_KEY?: string; CMS_AUTH_SECRET?: string };
    let userKey: string | null = null;
    if (typeof e.CMS_AUTH_SECRET === "string" && e.CMS_AUTH_SECRET) {
      try {
        userKey = await getDecryptedOpenrouterUserKey(e.CMS_AUTH_SECRET);
      } catch {
        userKey = null;
      }
    }
    const key = effectiveOpenrouterKey(userKey, e.OPENROUTER_API_KEY);
    if (!key) return ""; // no OpenRouter key → describe disabled (still uploads)
    const stored = await getImageModel();
    const model = stored || DEFAULT_IMAGE_MODEL;
    // Prefer the small client-made thumbnail (≤512px JPEG) so the describe call
    // ships a tiny payload, not the full-res original. Fall back to inlining the
    // original bytes if the client didn't send one (older client / non-canvas).
    const imageUrl =
      thumbDataUrl && thumbDataUrl.startsWith("data:image/")
        ? thumbDataUrl
        : `data:${contentType};base64,${bufferToBase64(bytes)}`;
    return describeImage(imageUrl, model, key);
  } catch {
    return "";
  }
}

/** Parse a JSON-string column to `unknown`; null on bad/empty JSON (never throws). */
function safeJson(s: string | null | undefined): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Base64-encode an ArrayBuffer (Worker-safe; chunked to avoid arg limits). */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    // `?q=` keyword-searches the AI description + filename (searchable media).
    const q = new URL(request.url).searchParams.get("q") ?? undefined;
    const assets = await listAssets(q);
    return Response.json(
      assets.map((a) => ({ ...a, url: assetUrl(a.key), tags: normalizeTags(safeJson(a.tags)) })),
    );
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
  // Optional client-made ≤512px JPEG data-URL, used ONLY for the describe call.
  const thumb = form.get("describeThumb");
  const thumbDataUrl = typeof thumb === "string" ? thumb : undefined;

  const check = validateAsset(file.type, file.size);
  if (!check.valid) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  const key = buildAssetKey(file.name, file.type, crypto.randomUUID().slice(0, 8));
  try {
    const bytes = await file.arrayBuffer();
    // Describe the image synchronously so it's searchable the moment it's listed.
    // A describe failure returns "" and never blocks the upload.
    const description = await describeUpload(file.type, bytes, thumbDataUrl);
    const row = await putAsset({
      key,
      filename: file.name,
      contentType: file.type,
      bytes,
      description,
    });
    return Response.json(
      { ...row, url: assetUrl(row.key), tags: normalizeTags(safeJson(row.tags)) },
      { status: 201 },
    );
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "upload failed" },
      { status: 500 },
    );
  }
}

/** PATCH → update an asset's operator tags. Body: `{ key, tags: string[] }`. */
export async function PATCH(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: { key?: unknown; tags?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "expected JSON body" }, { status: 400 });
  }
  const key = typeof body.key === "string" ? body.key : "";
  if (!isValidAssetKey(key)) {
    return Response.json({ error: "invalid key" }, { status: 400 });
  }
  const tags = normalizeTags(body.tags);
  try {
    await setAssetTags(key, tags);
    return Response.json({ ok: true, key, tags });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "update failed" },
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
