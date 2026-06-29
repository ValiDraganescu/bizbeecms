/**
 * Image-description model setting (searchable media library).
 *
 *   GET   → { model, default, options } — the selected id (resolved), the
 *           default id, and the image-capable catalog models for the picker.
 *   PATCH → store `{ model }` (validated against the image-capable catalog;
 *           unknown/non-image ids fall back to the default — never 400 on the
 *           untrusted id, matching the chat-model discipline).
 *
 * Admin/Manager only. REST-only (PM directive). The model used to DESCRIBE an
 * uploaded image (see `lib/chat/describe-image.ts`) is read from here.
 */
import { requireUserManager } from "@/lib/auth/guard";
import {
  CHAT_MODELS,
  DEFAULT_IMAGE_MODEL,
  filterByModalities,
  resolveImageModel,
  type CatalogModel,
} from "@/lib/chat/models";
import { getImageModel, setImageModel, getModelCatalogCache } from "@/db/settings-store";

export const dynamic = "force-dynamic";

/** Image-capable catalog (cache when present, static fallback otherwise). */
async function imageCapableModels(): Promise<CatalogModel[]> {
  let catalog: ReadonlyArray<CatalogModel> = CHAT_MODELS;
  try {
    const cache = await getModelCatalogCache();
    if (cache && cache.models.length > 0) catalog = cache.models;
  } catch {
    /* no D1 / cache → static fallback */
  }
  const image = filterByModalities(catalog, ["image"]);
  // The static fallback declares all models text-only, so if filtering empties
  // the list, surface the default at least (so the picker is never empty).
  if (image.length === 0) {
    return CHAT_MODELS.filter((m) => m.id === DEFAULT_IMAGE_MODEL);
  }
  return image;
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  try {
    const options = await imageCapableModels();
    const allowed = new Set(options.map((m) => m.id));
    const stored = await getImageModel();
    return Response.json({
      model: resolveImageModel(stored, allowed),
      default: DEFAULT_IMAGE_MODEL,
      options,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read image model" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  let body: { model?: unknown };
  try {
    body = (await request.json()) as { model?: unknown };
  } catch {
    return Response.json({ error: "expected JSON { model }" }, { status: 400 });
  }
  try {
    const options = await imageCapableModels();
    const allowed = new Set(options.map((m) => m.id));
    const resolved = resolveImageModel(body.model, allowed);
    await setImageModel(resolved);
    return Response.json({ model: resolved });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save image model" },
      { status: 500 },
    );
  }
}
