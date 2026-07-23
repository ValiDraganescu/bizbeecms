/**
 * Translation model setting (AI content translation).
 *
 *   GET   → { model, default, options } — the selected value (resolved), the
 *           default id, and the catalog models for the picker (any text model
 *           qualifies).
 *   PATCH → store `{ model }` — a curated `translate` alias key OR a catalog id;
 *           unknown values fall back to the default (never 400 on the untrusted
 *           id, per chat-model discipline).
 *
 * Admin/Manager only. REST-only (PM directive). The model used by /api/translate
 * to translate page/component text into the Site's other locales is read from here.
 * Mirrors the image-model route; no modality filter (translation is text→text).
 */
import { requireUserManager } from "@/lib/auth/guard";
import {
  CHAT_MODELS,
  DEFAULT_TRANSLATE_MODEL,
  resolveTranslateModel,
  type CatalogModel,
} from "@/lib/chat/models";
import {
  getTranslateModel,
  setTranslateModel,
  getModelCatalogCache,
} from "@/db/settings-store";
import { getAiConfig, allowedModelValues } from "@/lib/ai-config";

export const dynamic = "force-dynamic";

/** Catalog ids widened with the curated `translate` alias keys. */
async function allowedValues(options: CatalogModel[]): Promise<Set<string>> {
  return allowedModelValues(
    await getAiConfig(),
    "translate",
    options.map((m) => m.id),
  );
}

/** The model catalog for the picker (cache when present, static fallback otherwise). */
async function catalogModels(): Promise<CatalogModel[]> {
  try {
    const cache = await getModelCatalogCache();
    if (cache && cache.models.length > 0) return [...cache.models];
  } catch {
    /* no D1 / cache → static fallback */
  }
  return [...CHAT_MODELS];
}

export async function GET(request: Request): Promise<Response> {
  const denied = await requireUserManager(request);
  if (denied) return denied;
  try {
    const options = await catalogModels();
    const allowed = await allowedValues(options);
    const stored = await getTranslateModel();
    return Response.json({
      model: resolveTranslateModel(stored, allowed),
      default: DEFAULT_TRANSLATE_MODEL,
      options,
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to read translate model" },
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
    const options = await catalogModels();
    const allowed = await allowedValues(options);
    const resolved = resolveTranslateModel(body.model, allowed);
    await setTranslateModel(resolved);
    return Response.json({ model: resolved });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "failed to save translate model" },
      { status: 500 },
    );
  }
}
