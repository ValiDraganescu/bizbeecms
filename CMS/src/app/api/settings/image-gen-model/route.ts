/**
 * Image-GENERATION model setting (AI text→image into the gallery).
 *
 *   GET   → { model, default, options } — the selected value (resolved), the
 *           default id, and the image-OUTPUT catalog models for the picker.
 *   PATCH → store `{ model }` — a curated `imageGenerate` alias key OR an
 *           image-output catalog id; unknown values fall back to the default
 *           (never 400, matching the chat-model discipline).
 *
 * Admin/Manager only. REST-only (PM directive). The model the `generate_image`
 * tool uses (see `lib/chat/generate-image.ts`) is read from here. Mirrors the
 * image-DESCRIBE setting route, but filters by `image` OUTPUT, not input.
 */
import { requireUserManager } from "@/lib/auth/guard";
import {
  CHAT_MODELS,
  DEFAULT_IMAGE_GEN_MODEL,
  filterByOutputModalities,
  resolveImageGenModel,
  type CatalogModel,
} from "@/lib/chat/models";
import { getImageGenModel, setImageGenModel, getModelCatalogCache } from "@/db/settings-store";
import { getAiConfig, allowedModelValues } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

/** Image-output catalog ids widened with the curated `imageGenerate` aliases. */
async function allowedValues(options: CatalogModel[]): Promise<Set<string>> {
  return allowedModelValues(
    await getAiConfig(),
    "imageGenerate",
    options.map((m) => m.id),
  );
}

/** Image-output (generation-capable) catalog (cache when present, else static). */
async function imageGenModels(): Promise<CatalogModel[]> {
  let catalog: ReadonlyArray<CatalogModel> = CHAT_MODELS;
  try {
    const cache = await getModelCatalogCache();
    if (cache && cache.models.length > 0) catalog = cache.models;
  } catch {
    /* no D1 / cache → static fallback (which has no image-gen models) */
  }
  const gen = filterByOutputModalities(catalog, ["image"]);
  // The static fallback declares all models text-output; if filtering empties the
  // list, surface the default id so the picker is never empty (it won't actually
  // generate until a live catalog with a real image-gen model loads).
  if (gen.length === 0) {
    return [
      {
        id: DEFAULT_IMAGE_GEN_MODEL,
        label: DEFAULT_IMAGE_GEN_MODEL.split("/").pop() ?? DEFAULT_IMAGE_GEN_MODEL,
        provider: DEFAULT_IMAGE_GEN_MODEL.split("/")[0] ?? "other",
        price: null,
        inputPrice: null,
        outputPrice: null,
        inputModalities: ["text"],
        outputModalities: ["image"],
      },
    ];
  }
  return gen;
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  try {
    const options = await imageGenModels();
    const allowed = await allowedValues(options);
    const stored = await getImageGenModel();
    return Response.json({
      model: resolveImageGenModel(stored, allowed),
      default: DEFAULT_IMAGE_GEN_MODEL,
      options,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read image-gen model" },
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
    const options = await imageGenModels();
    const allowed = await allowedValues(options);
    const resolved = resolveImageGenModel(body.model, allowed);
    await setImageGenModel(resolved);
    return Response.json({ model: resolved });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save image-gen model" },
      { status: 500 },
    );
  }
}
